/**
 * PATCH /api/safety-narratives/cases/:id — the write that did not exist.
 *
 * "Save version" on the SAE narrative surface fired a toast reading
 * "Narrative versioning isn't wired to the safety store yet — nothing was
 * saved", and it was telling the truth: a safety writer completed the
 * structured case (severity, causality, outcome, seriousness criteria),
 * composed the ICH E3 §16 narrative, and lost every edit on reload.
 *
 * The properties that matter once it DOES write:
 *
 *   TENANT + LOCK. The row is selected FOR UPDATE within the org, so two
 *   writers cannot both save against the same pre-image. On a case whose
 *   causality drives a reporting deadline, a lost update is a missed
 *   obligation.
 *
 *   REASON. A change to causality or seriousness can move a case between a
 *   7-day and a 15-day expedited obligation. An audit trail that records the
 *   new value without the grounds is not one.
 *
 *   BOTH SIDES. The audit entry carries the previous value of every changed
 *   field. `adverse_events` holds one narrative per case, so this is what makes
 *   the save a version rather than an unrecoverable overwrite.
 *
 *   ALLOW-LIST. A PATCH cannot reach a column by naming it.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import express, { type Request, type Response, type NextFunction } from 'express';
import request from 'supertest';

const { connect, query, logAction, assembleOrgSaeCases } = vi.hoisted(() => ({
  connect: vi.fn(), query: vi.fn(), logAction: vi.fn(), assembleOrgSaeCases: vi.fn(),
}));
vi.mock('../../db', () => ({ pool: { connect, query } }));
vi.mock('../../services/auditService', () => ({ default: { logAction } }));
vi.mock('../../services/pv/sae-cases-view-assembler', () => ({ assembleOrgSaeCases }));
vi.mock('../../services/safety-narrative-service', () => ({ safetyNarrativeService: {} }));

import safetyRouter from '../safety-narrative';

/** SQL the fake client was asked to run, in order. */
let sql: Array<{ text: string; values?: unknown[] }>;
/** What the SELECT ... FOR UPDATE answers with. */
let existing: Record<string, unknown> | null;

function app(org: number | null = 7) {
  const a = express();
  a.use(express.json());
  a.use((req: Request, _res: Response, next: NextFunction) => {
    if (org !== null) (req as unknown as { user: unknown }).user = { organizationId: org, id: 5 };
    next();
  });
  a.use('/api/safety-narratives', safetyRouter);
  return a;
}

beforeEach(() => {
  sql = [];
  existing = {
    causality: 'possibly related', outcome: 'recovering', expectedness: 'unexpected',
    reaction_pt: 'Hepatic failure', event_description: null, onset_date: '2026-05-02',
    report_date: '2026-05-04', suspect_product: 'BX-204', suspect_product_dose: '50 mg',
    seriousness_criteria: ['hospitalization'], narrative: 'The previous narrative text.',
  };
  logAction.mockReset();
  assembleOrgSaeCases.mockReset();
  assembleOrgSaeCases.mockResolvedValue([{ id: '42', clock: '7-day expedited report', due: '2026-05-11' }]);
  connect.mockImplementation(async () => ({
    query: vi.fn(async (text: string, values?: unknown[]) => {
      sql.push({ text, values });
      if (/FOR UPDATE/.test(text)) return { rows: existing ? [existing] : [] };
      if (/^UPDATE adverse_events/.test(text.trim())) return { rows: [{ id: 42 }] };
      return { rows: [] };
    }),
    release: vi.fn(),
  }));
});

const body = (over: Record<string, unknown> = {}) => ({
  reasonForChange: 'Investigator upgraded causality after the site query',
  fields: { causality: 'probably related', narrative: 'The revised narrative text.' },
  ...over,
});

describe('PATCH /cases/:id', () => {
  it('403 without org context', async () => {
    const res = await request(app(null)).patch('/api/safety-narratives/cases/42').send(body());
    expect(res.status).toBe(403);
    expect(connect).not.toHaveBeenCalled();
  });

  it('refuses a save with no reason for change — nothing is written', async () => {
    const res = await request(app()).patch('/api/safety-narratives/cases/42').send({ fields: { causality: 'x' } });
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('REASON_REQUIRED');
    expect(connect).not.toHaveBeenCalled();
    expect(logAction).not.toHaveBeenCalled();
  });

  it('refuses a field that is not writable from this surface', async () => {
    const res = await request(app()).patch('/api/safety-narratives/cases/42')
      .send(body({ fields: { organization_id: 9 } }));
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('FIELD_NOT_WRITABLE');
    expect(connect).not.toHaveBeenCalled();
  });

  it('refuses an empty change set rather than writing an audit entry for nothing', async () => {
    const res = await request(app()).patch('/api/safety-narratives/cases/42').send(body({ fields: {} }));
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('NOTHING_TO_SAVE');
  });

  it('404s on a case in another organization, and rolls back', async () => {
    existing = null;
    const res = await request(app()).patch('/api/safety-narratives/cases/42').send(body());
    expect(res.status).toBe(404);
    expect(sql.some((q) => /ROLLBACK/.test(q.text))).toBe(true);
    expect(logAction).not.toHaveBeenCalled();
  });

  it('locks the row inside the transaction before writing', async () => {
    await request(app()).patch('/api/safety-narratives/cases/42').send(body());
    const texts = sql.map((q) => q.text.trim());
    expect(texts[0]).toBe('BEGIN');
    expect(texts[1]).toMatch(/FOR UPDATE/);
    expect(texts[1]).toMatch(/organization_id = \$2/);
    expect(texts.some((t) => /^UPDATE adverse_events/.test(t))).toBe(true);
  });

  it('writes both sides of every changed field, plus the reason, to the audit trail', async () => {
    const res = await request(app()).patch('/api/safety-narratives/cases/42').send(body());
    expect(res.status).toBe(200);
    const entry = logAction.mock.calls[0][0];
    expect(entry.action).toBe('SAE_CASE_NARRATIVE_SAVED');
    expect(entry.details.reasonForChange).toBe('Investigator upgraded causality after the site query');
    expect(entry.details.changed).toEqual({
      causality: { from: 'possibly related', to: 'probably related' },
      narrative: { from: 'The previous narrative text.', to: 'The revised narrative text.' },
    });
  });

  it('returns the case as the store now holds it, with the clock recomputed', async () => {
    const res = await request(app()).patch('/api/safety-narratives/cases/42').send(body());
    expect(assembleOrgSaeCases).toHaveBeenCalledWith(7);
    expect(res.body.data).toMatchObject({ id: '42', clock: '7-day expedited report' });
    expect(res.body.meta.changedFields).toEqual(['causality', 'narrative']);
  });

  it('rejects a seriousness-criteria value that is not an array of strings', async () => {
    const res = await request(app()).patch('/api/safety-narratives/cases/42')
      .send(body({ fields: { seriousnessCriteria: 'hospitalization' } }));
    expect(res.status).toBe(400);
    expect(res.body.error.message).toMatch(/array of strings/);
    expect(logAction).not.toHaveBeenCalled();
  });
});
