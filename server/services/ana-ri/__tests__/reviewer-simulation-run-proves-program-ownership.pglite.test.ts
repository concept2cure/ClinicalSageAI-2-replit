/**
 * AnA's reviewer_simulation.run proves the program a model names is the
 * caller's organization's before it runs (and persists) a simulation for it, as
 * its sibling handlers in mdx-command-handlers-phase2.ts do.
 *
 * What the handler used to do (until 2026-10-15): it checked only that
 * programId was a UUID. A caller in one organization could run — and persist,
 * dryRun: false — a reviewer simulation filed under another organization's
 * program id.
 *
 * The one program check (programInOrganization) is real, over PGlite with two
 * organizations' programs; the simulator is a double.
 */
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { PGlite } from '@electric-sql/pglite';

const H = vi.hoisted(() => {
  const h = {
    pg: null as any,
    run: vi.fn(),
    assess: vi.fn(),
    failQuery: false,
    pool: {
      query: async (text: string, params?: unknown[]) => {
        if (h.failQuery) throw new Error('connection terminated');
        const r = await h.pg.query(text, params ?? []);
        return { rows: r.rows };
      },
    },
  };
  return h;
});

vi.mock('../../../db.js', () => ({ getPool: () => H.pool, pool: H.pool, db: {} }));
vi.mock('../../../db', () => ({ getPool: () => H.pool, pool: H.pool, db: {} }));
vi.mock('../../intelligence-engine/reviewer-simulator.service', () => ({
  runReviewerSimulation: (...a: unknown[]) => H.run(...a),
}));
vi.mock('../../evidence-sufficiency/evidence-sufficiency.service', () => ({
  assessSufficiency: (...a: unknown[]) => H.assess(...a),
}));
vi.mock('../../audit/audit-write-outcome', () => ({
  recordAuditRow: async () => ({ persisted: true, chained: true }),
}));

import { evidenceSufficiencyAssess, reviewerSimulationRun } from '../mdx-command-handlers-phase2';

const ALPHA = 11;
const BETA = 12;
const ALPHA_PROGRAM = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa1';
const gate = { confirm: 'yes', reason: 'a sufficient explanatory reason' };
const program = { programType: 'IND', productType: 'drug', deviceClass: null, primaryAgency: 'FDA' };

beforeAll(async () => {
  H.pg = new PGlite();
  await H.pg.exec(`CREATE TABLE regulatory_programs (id uuid PRIMARY KEY, organization_id integer NOT NULL, deleted_at timestamp)`);
  await H.pg.query(`INSERT INTO regulatory_programs (id, organization_id) VALUES ($1, $2)`, [ALPHA_PROGRAM, ALPHA]);
}, 60_000);
afterAll(async () => { await H.pg?.close(); });

beforeEach(() => {
  H.failQuery = false;
  H.run.mockReset().mockResolvedValue({ runId: 'rs-1', inputsSource: { setAside: [] } });
  H.assess.mockReset().mockResolvedValue({ id: 'es-1', verdict: 'insufficient', overallScore: 0 });
});

// The same gap in its sibling (found while fixing the one above): the
// assessment it persists (dryRun: false) was filed for any UUID.
describe('evidence_sufficiency.assess proves program ownership', () => {
  const assess = (organizationId: number) =>
    evidenceSufficiencyAssess(
      { userId: 7, organizationId },
      { ...gate, programId: ALPHA_PROGRAM, pathway: '510K', profile: { hasSoftware: false } },
    );

  it("refuses another organization's program as not found, and assesses nothing", async () => {
    const r = await assess(BETA);

    expect(H.assess, "an assessment was persisted for another organization's program").not.toHaveBeenCalled();
    expect(r).toMatchObject({ success: false, error: 'NOT_FOUND' });
  });

  it("assesses the caller's own program", async () => {
    const r = await assess(ALPHA);

    expect(r.error, r.message).toBeUndefined();
    expect(H.assess).toHaveBeenCalledTimes(1);
  });
});

describe('reviewer_simulation.run proves program ownership', () => {
  it("refuses another organization's program as not found, and runs nothing", async () => {
    const r = await reviewerSimulationRun({ userId: 7, organizationId: BETA }, { ...gate, programId: ALPHA_PROGRAM, program });

    expect(H.run, "a simulation was run for another organization's program").not.toHaveBeenCalled();
    expect(r).toMatchObject({ success: false, error: 'NOT_FOUND' });
  });

  it('says ownership could not be verified when the check cannot run, and runs nothing', async () => {
    H.failQuery = true;
    const r = await reviewerSimulationRun({ userId: 7, organizationId: ALPHA }, { ...gate, programId: ALPHA_PROGRAM, program });

    expect(H.run).not.toHaveBeenCalled();
    expect(r).toMatchObject({ success: false, error: 'OWNERSHIP_UNVERIFIABLE' });
  });

  it("runs for the caller's own program", async () => {
    const r = await reviewerSimulationRun({ userId: 7, organizationId: ALPHA }, { ...gate, programId: ALPHA_PROGRAM, program });

    expect(r.error, r.message).toBeUndefined();
    expect(H.run).toHaveBeenCalledTimes(1);
    expect(H.run.mock.calls[0][0]).toMatchObject({ organizationId: ALPHA, programId: ALPHA_PROGRAM });
  });
});
