/**
 * The readiness run states ONE readiness verdict — the evaluator's — and no
 * confidence it did not measure (QA 2026-10-08, j8).
 *
 * The board and the canvas opener said C2C-001's readiness was "not computed";
 * the Executive Readiness Digest for the same program printed "Overall
 * confidence 75%" and "submission_readiness ready". The 75 was `95 − 20 ×
 * blockers`; the "ready" was a second verdict, given as soon as one artifact
 * was approved. Pinned here against the orchestrator with only the database
 * replaced.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';

const q = vi.hoisted(() => ({ results: [] as unknown[][] }));
vi.mock('../../../db', () => {
  const chain = (): Record<string, unknown> => {
    const c: Record<string, unknown> = {};
    for (const m of ['from', 'where', 'groupBy', 'limit', 'orderBy', 'innerJoin']) c[m] = () => c;
    c.then = (ok: (v: unknown) => unknown, ko: (e: unknown) => unknown) =>
      Promise.resolve().then(() => q.results.shift() ?? []).then(ok, ko);
    return c;
  };
  return { db: { select: () => chain() }, pool: {}, getPool: () => ({}), getDb: () => ({}) };
});

import { computeInitialRun } from '../orchestrator';

beforeEach(() => {
  q.results.length = 0;
});

describe('computeInitialRun — one readiness verdict', () => {
  it('uses a validated explicit regional registry instead of the stored default', async () => {
    q.results.push([{ status: 'approved', count: 3 }], [{ metadata: { registryId: 'US_IND' } }], [], []);
    const run = await computeInitialRun(1, 'project', '1', { explicitRegistryId: 'EU_MAA' });
    expect(run.summary.regulatory).toMatchObject({ registryId: 'EU_MAA', regionCode: 'EU', agency: 'EMA' });
  });

  it('rejects an unresolved explicit registry rather than falling back to project metadata', async () => {
    await expect(computeInitialRun(1, 'project', '1', { explicitRegistryId: 'NOT_A_REGISTRY' })).rejects.toMatchObject({ code: 'INVALID_REPORT_REGISTRY' });
    expect(q.results).toHaveLength(0);
  });
  it('resolves an explicit submission type and records the selected request as provenance', async () => {
    q.results.push([], [{ metadata: { registryId: 'EU_MAA' } }], [], []);
    const run = await computeInitialRun(1, 'project', '1', { explicitSubmissionType: 'IND' });
    expect(run.summary.regulatory).toMatchObject({ registryId: 'US_IND', regionCode: 'US' });
    expect(run.providers.find(p => p.provider === 'submission_readiness')?.atoms).toContainEqual({ sourceTable: 'report_request', sourceField: 'submissionType', transformation: 'manual_entry' });
    expect((run.summary.regulatory as { gaps: unknown[] }).gaps.length).toBeGreaterThan(0);
  });
  it('rejects conflicting explicit registry and submission type before reading source records', async () => {
    await expect(computeInitialRun(1, 'project', '1', { explicitRegistryId: 'EU_MAA', explicitSubmissionType: 'IND' })).rejects.toMatchObject({ code: 'INVALID_REPORT_REGISTRY' });
    expect(q.results).toHaveLength(0);
  });

  it('never calls one approved artifact a compliance assurance check', async () => {
    q.results.push([{ status: 'approved', count: 1 }], [{ metadata: {} }]);
    const run = await computeInitialRun(1, 'project', '1');
    expect(run.providers.map((p) => p.provider)).not.toContain('compliance_audit');
    expect(run.providers.find((p) => p.provider === 'artifact_approval')).toMatchObject({ status: 'ready' });
    expect(run.summary.complianceAssessment).toBe('not_evaluated');
  });
  it('says readiness was not computed for a project with no registry context, even with approved artifacts', async () => {
    q.results.push([{ status: 'approved', count: 3 }], [{ metadata: {} }]);
    const run = await computeInitialRun(1, 'project', '1');
    const readiness = run.providers.filter((p) => p.provider === 'submission_readiness');
    expect(readiness).toHaveLength(1);
    expect(readiness[0].status).toBe('missing');
    expect(readiness[0].blocker).toMatch(/^Submission readiness not computed: the project records no registry context/);
    // No second readiness row under another name.
    expect(run.providers.map((p) => p.provider)).not.toContain('regional_registry_readiness');
    expect(run.summary.regulatory).toBeUndefined();
  });

  it('reports no confidence: nothing in the run measures one', async () => {
    q.results.push([{ status: 'approved', count: 3 }], [{ metadata: {} }]);
    const run = await computeInitialRun(1, 'project', '1');
    expect(run.confidence).toBeNull();
  });

  it('says readiness is not computed for a scope it is not evaluated over', async () => {
    const run = await computeInitialRun(1, 'program', '4', { programProjectIds: [] });
    const readiness = run.providers.find((p) => p.provider === 'submission_readiness');
    expect(readiness?.status).toBe('missing');
    expect(readiness?.blocker).toMatch(/evaluated per project, not for a program scope/);
    expect(run.confidence).toBeNull();
  });
});
