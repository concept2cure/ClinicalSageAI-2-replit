/**
 * program-journey-service — END-TO-END against in-process PGlite.
 *
 * Proves the GA write+read path: a journey recorded through the service persists as a
 * real parent row + one REAL row per lifecycle stage; the read assembles the overlay
 * from those stage rows; updateJourneyStage advances a stage in place; validation
 * rejects unknown segments/stages/statuses and malformed display payloads; tenant
 * scope + soft-delete hold (stage rows die with their parent).
 */
import { describe, it, expect, beforeAll, afterAll, beforeEach, vi } from 'vitest';
import { PGlite } from '@electric-sql/pglite';

let pglite: PGlite;
const pool = {
  query: async (sql: string, params?: unknown[]) => {
    const r = await pglite.query(sql, params as unknown[]);
    return { rows: r.rows as unknown[], rowCount: (r as { affectedRows?: number }).affectedRows ?? (r.rows as unknown[]).length };
  },
};
vi.mock('../../../db', () => ({ pool: { query: (s: string, p?: unknown[]) => pool.query(s, p) }, db: {} }));

import {
  createProgramJourney, listProgramJourneys, updateJourneyStage, deleteProgramJourney,
  ProgramJourneyValidationError, JOURNEY_STAGES,
} from '../program-journey-service';

const ORG = 7;
const OTHER = 9;

const DDL = `
CREATE TABLE program_journeys (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id int NOT NULL, seg text NOT NULL, seq int NOT NULL DEFAULT 0,
  code text NOT NULL, name text, app text, modality text, indication text, pathway text,
  sponsor text, agency text, readiness int NOT NULL DEFAULT 0, current_stage text NOT NULL,
  target_label text, target_value text, target_agency text,
  modules jsonb NOT NULL DEFAULT '[]'::jsonb, clock jsonb NOT NULL DEFAULT '[]'::jsonb,
  haqs jsonb NOT NULL DEFAULT '[]'::jsonb, contra jsonb NOT NULL DEFAULT '{}'::jsonb,
  blockers jsonb NOT NULL DEFAULT '[]'::jsonb, created_by int,
  created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now(), deleted_at timestamptz
);
CREATE TABLE program_journey_stages (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id int NOT NULL, journey_id uuid NOT NULL, stage_id text NOT NULL,
  status text NOT NULL DEFAULT 'upcoming', pct int NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT uq_program_journey_stage UNIQUE (journey_id, stage_id)
);
`;

beforeAll(async () => { pglite = new PGlite(); await pglite.exec(DDL); }, 60_000);
afterAll(async () => { await pglite.close(); });
beforeEach(async () => { await pglite.exec(`DELETE FROM program_journey_stages; DELETE FROM program_journeys;`); });

describe('program-journey-service', () => {
  it('records a journey with all 9 REAL stage rows and reads the overlay back from them', async () => {
    const created = await createProgramJourney(ORG, {
      seg: 'pharma', code: 'BX-204', app: 'NDA 212345', readiness: 88, currentStage: 'review',
      target: { label: 'PDUFA target action', v: '04 Apr 2027', agency: 'FDA · 41 days out' },
      overlay: { discovery: ['done', 100], review: ['active', 60] },
      modules: [{ m: '5', label: 'Clinical reports', pct: 74, risk: true }],
      blockers: [{ sev: 'high', t: 'DS stability', m: 'M3', who: 'AR', due: 'Day 9 of 14' }],
    });
    expect(created.current).toBe('review');
    expect(created.target).toMatchObject({ label: 'PDUFA target action', v: '04 Apr 2027' });

    const [j] = await listProgramJourneys(ORG);
    expect(j.code).toBe('BX-204');
    expect(j.readiness).toBe(88);
    // All 9 stages present as real rows; named ones carry their state, others default.
    expect(Object.keys(j.overlay).sort()).toEqual([...JOURNEY_STAGES].sort());
    expect(j.overlay.discovery).toEqual(['done', 100]);
    expect(j.overlay.review).toEqual(['active', 60]);
    expect(j.overlay.approval).toEqual(['upcoming', 0]);
    expect(j.modules[0]).toMatchObject({ m: '5', risk: true });
    const stageCount = await pglite.query(`SELECT count(*)::int AS n FROM program_journey_stages`);
    expect((stageCount.rows[0] as { n: number }).n).toBe(9);
  });

  it('advances a stage in place (upsert on the real stage row)', async () => {
    const j = await createProgramJourney(ORG, { seg: 'biotech', code: 'BX-301', currentStage: 'assemble' });
    await updateJourneyStage(ORG, j.id, 'assemble', 'done', 100);
    await updateJourneyStage(ORG, j.id, 'review', 'active', 25);
    const [view] = await listProgramJourneys(ORG);
    expect(view.overlay.assemble).toEqual(['done', 100]);
    expect(view.overlay.review).toEqual(['active', 25]);
    const stageCount = await pglite.query(`SELECT count(*)::int AS n FROM program_journey_stages`);
    expect((stageCount.rows[0] as { n: number }).n).toBe(9);   // updated in place, not duplicated
  });

  it('rejects unknown segment/stage/status and malformed payloads', async () => {
    await expect(createProgramJourney(ORG, { seg: 'devices', code: 'X', currentStage: 'review' }))
      .rejects.toBeInstanceOf(ProgramJourneyValidationError);
    await expect(createProgramJourney(ORG, { seg: 'pharma', code: '', currentStage: 'review' }))
      .rejects.toBeInstanceOf(ProgramJourneyValidationError);
    await expect(createProgramJourney(ORG, { seg: 'pharma', code: 'X', currentStage: 'filing' }))
      .rejects.toBeInstanceOf(ProgramJourneyValidationError);
    await expect(createProgramJourney(ORG, { seg: 'pharma', code: 'X', currentStage: 'review', overlay: { warp: ['done', 100] } }))
      .rejects.toBeInstanceOf(ProgramJourneyValidationError);
    await expect(createProgramJourney(ORG, { seg: 'pharma', code: 'X', currentStage: 'review', overlay: { review: ['sideways', 10] } }))
      .rejects.toBeInstanceOf(ProgramJourneyValidationError);
    await expect(createProgramJourney(ORG, { seg: 'pharma', code: 'X', currentStage: 'review', modules: 'not-an-array' }))
      .rejects.toBeInstanceOf(ProgramJourneyValidationError);
    const j = await createProgramJourney(ORG, { seg: 'pharma', code: 'OK', currentStage: 'review' });
    await expect(updateJourneyStage(ORG, j.id, 'review', 'later', 10)).rejects.toBeInstanceOf(ProgramJourneyValidationError);
    await expect(updateJourneyStage(ORG, j.id, 'warp', 'done', 10)).rejects.toBeInstanceOf(ProgramJourneyValidationError);
  });

  it('is strictly tenant-scoped and soft-delete aware (stages die with the parent)', async () => {
    const mine = await createProgramJourney(ORG, { seg: 'pharma', code: 'Mine', currentStage: 'review' });
    await createProgramJourney(OTHER, { seg: 'pharma', code: 'Theirs', currentStage: 'ind' });

    expect((await listProgramJourneys(ORG)).map((j) => j.code)).toEqual(['Mine']);
    await expect(updateJourneyStage(OTHER, mine.id, 'review', 'done', 100))
      .rejects.toBeInstanceOf(ProgramJourneyValidationError);   // no cross-tenant stage writes

    expect(await deleteProgramJourney(ORG, mine.id)).toBe(true);
    expect(await listProgramJourneys(ORG)).toEqual([]);          // parent soft-deleted → journey gone
  });
});
