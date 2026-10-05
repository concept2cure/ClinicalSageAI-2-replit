/**
 * The contradiction sweep keeps what people decided
 * (discovery map 2026-10-04, cmc-contradiction-sweep-erases-resolutions).
 *
 * The sweep deleted every finding of the program and re-inserted what it
 * detected, all open: a critical finding QA had resolved came back open on
 * the next sweep and blocked approval again. Here, on PGlite with the table's
 * own shape, the reconciliation:
 *   - keeps a resolved finding resolved when the same conflict is detected again;
 *   - keeps an open one open, with no duplicate;
 *   - opens a new finding for changed data, never carrying a resolution over;
 *   - removes an open finding the data no longer shows, and keeps a resolved
 *     one as the record of the decision.
 */
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { PGlite } from '@electric-sql/pglite';

const h = vi.hoisted(() => ({ pg: null as any, audit: [] as Array<Record<string, any>> }));
// The one transaction helper the refusal-returning services run in, over PGlite.
vi.mock('../../../db', () => ({
  transaction: async (fn: (c: unknown) => Promise<unknown>) => {
    await h.pg.query('BEGIN');
    try {
      const out = await fn({ query: (sql: string, p?: unknown[]) => h.pg.query(sql, p) });
      await h.pg.query('COMMIT');
      return out;
    } catch (e) {
      await h.pg.query('ROLLBACK');
      throw e;
    }
  },
}));
// The chained audit writer is proven in its own suites; here, that the row is written with what it must carry.
vi.mock('../../auditService.js', () => ({ writeChainedAuditRow: async (_c: unknown, entry: Record<string, any>) => { h.audit.push(entry); } }));

import { reconcileContradictions, resolveContradiction, type DetectedContradiction } from '../contradiction-lifecycle';

let pg: PGlite;
const ORG = 7;
const P = 'aaaaaaaa-0000-4000-8000-00000000000a';

const finding = (details: string, severity = 'critical'): DetectedContradiction => ({
  severity,
  contradictionType: 'spec_method_mismatch',
  details,
  impactedSections: ['3.2.P.5.1'],
  requiredReviewers: ['QA'],
});
const SPEC = finding('Assay limit 95.0-105.0% on DP-SPEC-1 but method AM-1 validated for 90-110%');

const rows = async () =>
  (await pg.query<{ details: string; status: string }>(
    `SELECT details, status FROM cmc_contradictions WHERE organization_id = $1 AND project_id = $2 ORDER BY details`,
    [ORG, P],
  )).rows;

beforeAll(async () => {
  pg = new PGlite();
  h.pg = pg;
  await pg.exec(`
    CREATE TABLE cmc_provenance_events (
      id serial PRIMARY KEY, organization_id integer, project_id text, artifact_type text, artifact_id text,
      event_type text, event_payload jsonb, created_by text);
    CREATE TABLE cmc_contradictions (
      id uuid PRIMARY KEY DEFAULT gen_random_uuid(), organization_id integer NOT NULL, project_id text NOT NULL,
      severity text NOT NULL, contradiction_type text NOT NULL, details text NOT NULL,
      impacted_sections jsonb NOT NULL, required_reviewers jsonb NOT NULL, status text NOT NULL DEFAULT 'open',
      created_at timestamp NOT NULL DEFAULT now(), updated_at timestamp NOT NULL DEFAULT now());
  `);
});
afterAll(async () => {
  await pg.close();
});
beforeEach(async () => {
  await pg.exec('DELETE FROM cmc_contradictions; DELETE FROM cmc_provenance_events;');
  h.audit = [];
});

describe('a re-run of the sweep keeps what people decided', () => {
  it('a resolved finding detected again stays resolved', async () => {
    await reconcileContradictions(pg, ORG, P, [SPEC]);
    await pg.query(`UPDATE cmc_contradictions SET status = 'resolved'`);
    const out = await reconcileContradictions(pg, ORG, P, [SPEC]);
    expect(out).toEqual({ inserted: 0, kept: 0, keptResolved: 1, cleared: 0 });
    expect(await rows()).toEqual([{ details: SPEC.details, status: 'resolved' }]);
  });

  it('an open finding detected again stays open, once', async () => {
    await reconcileContradictions(pg, ORG, P, [SPEC]);
    const out = await reconcileContradictions(pg, ORG, P, [SPEC, SPEC]);
    expect(out).toEqual({ inserted: 0, kept: 1, keptResolved: 0, cleared: 0 });
    expect(await rows()).toEqual([{ details: SPEC.details, status: 'open' }]);
  });

  it('changed data is a new finding; the resolution does not carry over to it', async () => {
    await reconcileContradictions(pg, ORG, P, [SPEC]);
    await pg.query(`UPDATE cmc_contradictions SET status = 'resolved'`);
    const changed = finding('Assay limit 95.0-105.0% on DP-SPEC-1 but method AM-1 validated for 97-103%');
    const out = await reconcileContradictions(pg, ORG, P, [changed]);
    expect(out).toEqual({ inserted: 1, kept: 0, keptResolved: 0, cleared: 0 });
    expect(await rows()).toEqual([
      { details: SPEC.details, status: 'resolved' },
      { details: changed.details, status: 'open' },
    ]);
  });

  it('an open finding the data no longer shows is cleared; another program is untouched', async () => {
    await reconcileContradictions(pg, ORG, P, [SPEC]);
    await reconcileContradictions(pg, ORG, 'bbbbbbbb-0000-4000-8000-00000000000b', [SPEC]);
    const out = await reconcileContradictions(pg, ORG, P, []);
    expect(out.cleared).toBe(1);
    expect(await rows()).toEqual([]);
    const other = await pg.query(`SELECT count(*)::int AS n FROM cmc_contradictions WHERE project_id <> $1`, [P]);
    expect(other.rows[0]).toEqual({ n: 1 });
  });
});

describe('resolving a finding is a governed act', () => {
  const NOTE = 'Method AM-1 revalidated for 95.0-105.0% (VR-021); spec and method now agree.';
  const open = async (org = ORG) => {
    await reconcileContradictions(pg, org, P, [SPEC]);
    return String((await pg.query<{ id: string }>(`SELECT id FROM cmc_contradictions WHERE organization_id = $1`, [org])).rows[0].id);
  };

  it('records the status, the provenance and a chained audit row, under the person who resolved it', async () => {
    const id = await open();
    const out = await resolveContradiction({ organizationId: ORG, userId: 42, contradictionId: id, reason: NOTE });
    expect(out).toEqual({ ok: true, projectId: P });
    expect(await rows()).toEqual([{ details: SPEC.details, status: 'resolved' }]);
    const prov = (await pg.query<any>(`SELECT event_type, event_payload, created_by FROM cmc_provenance_events`)).rows;
    expect(prov).toEqual([{ event_type: 'resolved', event_payload: { resolutionNote: NOTE, severity: 'critical' }, created_by: '42' }]);
    expect(h.audit).toEqual([expect.objectContaining({
      action: 'cmc.contradiction.resolve', userId: 42, tenantId: ORG, resourceId: id,
      details: expect.objectContaining({ reason: NOTE, severity: 'critical', details: SPEC.details }),
    })]);
  });

  it('refuses a resolution with no stated reason, and changes nothing', async () => {
    const id = await open();
    for (const reason of [undefined, '', 'ok']) {
      const out = await resolveContradiction({ organizationId: ORG, userId: 42, contradictionId: id, reason });
      expect(out).toMatchObject({ ok: false, status: 422, code: 'REASON_REQUIRED' });
    }
    expect(await rows()).toEqual([{ details: SPEC.details, status: 'open' }]);
    expect(h.audit).toEqual([]);
  });

  it('refuses one already resolved, and another organisation’s', async () => {
    const id = await open();
    await resolveContradiction({ organizationId: ORG, userId: 42, contradictionId: id, reason: NOTE });
    expect(await resolveContradiction({ organizationId: ORG, userId: 42, contradictionId: id, reason: NOTE }))
      .toMatchObject({ ok: false, status: 409, code: 'ALREADY_RESOLVED' });
    expect(await resolveContradiction({ organizationId: ORG + 1, userId: 42, contradictionId: id, reason: NOTE }))
      .toMatchObject({ ok: false, status: 404 });
  });
});
