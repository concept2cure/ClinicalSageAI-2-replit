/** A2.9: existing stored journeys retain their tenant-scoped read and stage overlay. */
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
  listProgramJourneys, deleteProgramJourney, JOURNEY_STAGES,
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

async function historicalJourney(org: number, code: string, seq = 0) {
  const { rows } = await pglite.query<{ id: string }>(`INSERT INTO program_journeys
    (organization_id, seg, code, seq, app, readiness, current_stage, target_label, target_value, target_agency, modules, blockers)
    VALUES ($1,'pharma',$2,$3,'NDA 212345',88,'review','PDUFA target action','04 Apr 2027','FDA',
      '[{"m":"5","risk":true}]','[{"t":"Recorded blocker"}]') RETURNING id`, [org, code, seq]);
  const id = rows[0].id;
  await pglite.query(`INSERT INTO program_journey_stages (organization_id, journey_id, stage_id, status, pct)
    SELECT $1,$2,stage_id,CASE WHEN stage_id='review' THEN 'active' ELSE 'upcoming' END,
      CASE WHEN stage_id='review' THEN 60 ELSE 0 END
    FROM unnest($3::text[]) AS stage_id`, [org, id, [...JOURNEY_STAGES]]);
  return id;
}

describe('program-journey-service reads retained records', () => {
  it('assembles a recorded parent and its nine stored stage rows without creating anything', async () => {
    await historicalJourney(ORG, 'BX-204');
    const [journey] = await listProgramJourneys(ORG);
    expect(journey).toMatchObject({ code: 'BX-204', app: 'NDA 212345', readiness: 88, current: 'review' });
    expect(journey.target).toMatchObject({ label: 'PDUFA target action', v: '04 Apr 2027', agency: 'FDA' });
    expect(Object.keys(journey.overlay).sort()).toEqual([...JOURNEY_STAGES].sort());
    expect(journey.overlay.review).toEqual(['active', 60]);
    expect(journey.overlay.approval).toEqual(['upcoming', 0]);
    expect(journey.modules[0]).toMatchObject({ m: '5', risk: true });
    expect(journey.blockers).toEqual([{ t: 'Recorded blocker' }]);
    const counted = await pglite.query<{ n: number }>('SELECT count(*)::int AS n FROM program_journeys');
    expect(counted.rows[0].n).toBe(1);
  });

  it('returns an honest empty list for an organization without recorded journeys', async () => {
    expect(await listProgramJourneys(ORG)).toEqual([]);
  });

  it('does not expose foreign parents or foreign stage rows and preserves soft deletion', async () => {
    const mine = await historicalJourney(ORG, 'Mine');
    const theirs = await historicalJourney(OTHER, 'Theirs');
    await pglite.query(`INSERT INTO program_journey_stages (organization_id, journey_id, stage_id, status, pct)
      VALUES ($1,$2,'foreign-stage','done',100)`, [OTHER, mine]);
    expect((await listProgramJourneys(ORG)).map(j => j.code)).toEqual(['Mine']);
    expect((await listProgramJourneys(ORG))[0].overlay['foreign-stage']).toBeUndefined();
    expect(await deleteProgramJourney(OTHER, mine)).toBe(false);
    expect(await deleteProgramJourney(ORG, mine)).toBe(true);
    expect(await listProgramJourneys(ORG)).toEqual([]);
    expect((await listProgramJourneys(OTHER)).map(j => j.id)).toEqual([theirs]);
  });

  it('retains recorded ordering before returning the stored journeys', async () => {
    await historicalJourney(ORG, 'Later', 2);
    await historicalJourney(ORG, 'Earlier', 1);
    expect((await listProgramJourneys(ORG)).map(j => j.code)).toEqual(['Earlier', 'Later']);
  });
});
