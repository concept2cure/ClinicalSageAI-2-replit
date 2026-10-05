/**
 * AnA's Module 3 readiness answers with the final-export gate's verdict.
 *
 * `/m3 readiness` and `/cmc` used to compute "Export READY" from their own
 * counts (every section approved, none stale, no open critical contradiction).
 * The gate refuses on more than that — source drift, superseded Vault evidence,
 * missing lineage, incomplete sections, the governed-decision fabric — so AnA
 * could tell a user Module 3 was ready while export and placement refused.
 * Each case below is one the counts alone clear and the gate refuses.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

const h = vi.hoisted(() => ({
  verdict: null as any,
  gateCalls: [] as any[],
  rows: { sources: [] as any[], sections: [] as any[], contradictions: [] as any[] },
}));

vi.mock('../../../db', () => {
  const query = async (sql: string) => {
    if (/FROM cmc_source_objects/.test(sql)) return { rows: h.rows.sources };
    if (/FROM cmc_module3_sections/.test(sql)) return { rows: h.rows.sections };
    if (/FROM cmc_contradictions/.test(sql)) return { rows: h.rows.contradictions };
    return { rows: [] };
  };
  return { getPool: () => ({ query }), pool: { query }, db: {} };
});
vi.mock('../../cmc/final-export-gate', () => ({
  evaluateFinalExportGate: async (params: unknown) => {
    h.gateCalls.push(params);
    return h.verdict;
  },
}));

import { module3Readiness, cmcStatus } from '../module3-command-handlers';

const ctx = { userId: 42, organizationId: 7, activeProjectId: undefined };
const PROJECT = '0b6c3c1e-0000-4000-8000-000000000001';

const clearCounts = {
  totalSections: 3,
  approvedSections: 3,
  staleSections: 0,
  openCriticalContradictions: 0,
};

function gate(allowed: boolean, error?: string) {
  h.verdict = { allowed, ...(error ? { error } : {}), data: { ...clearCounts } };
}

beforeEach(() => {
  h.gateCalls = [];
  // What the old formula read: three approved, none stale, nothing critical.
  h.rows.sections = [
    { approval_state: 'approved', approvalState: 'approved', stale: false },
    { approval_state: 'approved', approvalState: 'approved', stale: false },
    { approval_state: 'approved', approvalState: 'approved', stale: false },
  ];
  h.rows.contradictions = [];
  h.rows.sources = [{ sourceType: 'batch', count: 2 }];
});

const DRIFT = '1 approved section(s) no longer match their source data and must be recompiled and re-approved before final export: 3.2.P.5.4 (batch:B-002 changed)';
const EVIDENCE = '1 approved section(s) read CMC records taken from a Vault document that has since been superseded or withdrawn.';

describe('AnA Module 3 readiness is the export gate', () => {
  it('module3_readiness: counts clear but the gate refuses on drift → BLOCKED, with the gate sentence', async () => {
    gate(false, DRIFT);
    const r = await module3Readiness(ctx, { projectId: PROJECT });
    expect(r.success).toBe(true);
    expect((r.data as any).exportReady).toBe(false);
    expect(r.message).toContain('**BLOCKED**');
    expect(r.message).not.toContain('**READY**');
    expect(r.message).toContain(DRIFT);
    expect((r.data as any).blockedBecause).toBe(DRIFT);
    expect(h.gateCalls).toEqual([{ orgId: 7, projectId: PROJECT, actorId: '42' }]);
  });

  it('cmc_status: counts clear but the gate refuses on superseded evidence → BLOCKED, with the gate sentence', async () => {
    gate(false, EVIDENCE);
    const r = await cmcStatus(ctx, { projectId: PROJECT });
    expect((r.data as any).exportReady).toBe(false);
    expect(r.message).toContain('Module 3 export: **BLOCKED**');
    expect(r.message).toContain(EVIDENCE);
    expect((r.data as any).totalSources).toBe(2);
  });

  it('both say READY only when the gate allows', async () => {
    gate(true);
    const a = await module3Readiness(ctx, { projectId: PROJECT });
    const b = await cmcStatus(ctx, { projectId: PROJECT });
    expect((a.data as any).exportReady).toBe(true);
    expect(a.message).toContain('Export **READY**');
    expect(a.message).not.toContain('Blockers');
    expect((b.data as any).exportReady).toBe(true);
    expect(b.message).toContain('Module 3 export: **READY**');
  });

  it('the counts shown are the gate’s, not a second read', async () => {
    h.verdict = {
      allowed: false,
      error: '1 section(s) went stale after approval and must be re-approved before final export',
      data: { totalSections: 4, approvedSections: 2, staleSections: 1, openCriticalContradictions: 1 },
    };
    const r = await module3Readiness(ctx, { projectId: PROJECT });
    expect(r.message).toContain('2/4 sections approved, 1 stale, 1 critical contradictions');
    expect(r.message).toContain('/m3 refresh');
    expect(r.message).toContain('2 sections not yet approved');
  });
});
