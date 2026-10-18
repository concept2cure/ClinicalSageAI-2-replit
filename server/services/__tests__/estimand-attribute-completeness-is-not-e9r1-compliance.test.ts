/**
 * The estimand engine reports its attribute check as what it is — attribute
 * completeness — and never stores or returns it as ICH E9(R1) compliance.
 *
 * ── What the code used to do ────────────────────────────────────────────────
 *  - defineEstimand stored and returned `ichE9R1Compliant: true` when string
 *    length checks passed (population ≥ 5 characters, variable ≥ 3, summary
 *    measure ≥ 3, ≥ 1 intercurrent event, a known strategy), so a population of
 *    "abcde" certified compliance;
 *  - validateEstimand returned `isCompliant: true` beside its own warning "ICH
 *    E9(R1) requires sensitivity analyses", and wrote that flag to
 *    ich_e9r1_compliant;
 *  - a primary method stored by recommendMethods — a model's or the strategy
 *    table's suggestion — satisfied the "primary method" check with no remark,
 *    so a later reader could not tell a suggestion from a statistician's choice.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

const S = vi.hoisted(() => ({
  inserts: [] as Array<Record<string, unknown>>,
  updates: [] as Array<Record<string, unknown>>,
  row: {} as Record<string, unknown>,
}));

vi.mock('../../db', () => ({
  db: {
    insert: () => ({
      values: (v: Record<string, unknown>) => {
        S.inserts.push(v);
        return { returning: async () => [{ id: 31 }] };
      },
    }),
    select: () => ({ from: () => ({ where: () => ({ limit: async () => [S.row] }) }) }),
    update: () => ({
      set: (v: Record<string, unknown>) => {
        S.updates.push(v);
        return { where: async () => undefined };
      },
    }),
  },
}));
vi.mock('../../lib/unified-ai-client', () => ({ ai: { chat: vi.fn() } }));

import { estimandEngineService } from '../estimand-engine-service';

const STORED = {
  id: 3,
  organizationId: 9,
  endpointName: 'Change from baseline in HbA1c at week 26',
  population: 'All randomized participants (ITT)',
  variable: 'HbA1c',
  summaryMeasure: 'Difference in means',
  strategy: 'treatment_policy',
  intercurrentEvents: [{ name: 'Rescue medication', description: 'Use of rescue therapy', strategy: 'treatment_policy' }],
  primaryMethod: 'Mixed Model for Repeated Measures (MMRM)',
  sensitivityAnalyses: [],
  supplementaryAnalyses: [],
  ichE9R1Compliant: true,
};

beforeEach(() => {
  S.inserts.length = 0;
  S.updates.length = 0;
  S.row = { ...STORED };
});

describe('defineEstimand', () => {
  it('returns and stores E9(R1) compliance as not assessed, and the attribute check by its name', async () => {
    const r = await estimandEngineService.defineEstimand(
      {
        endpointName: 'HbA1c',
        population: 'abcde',
        variable: 'xyz',
        summaryMeasure: 'abc',
        intercurrentEvents: [{ name: 'Rescue', description: '', strategy: 'hypothetical' }],
        strategy: 'treatment_policy',
      },
      9,
    );
    expect(r.ichE9R1Compliant).toBeNull();
    expect(r.attributesComplete).toBe(true);
    expect(S.inserts[0].ichE9R1Compliant).toBeNull();
  });
});

describe('validateEstimand', () => {
  it('does not call an estimand compliant, and clears a flag the attribute check stored', async () => {
    const v = await estimandEngineService.validateEstimand(3, 9);
    expect(v.ichE9R1Compliant).toBeNull();
    expect(v.attributesComplete).toBe(true);
    expect('isCompliant' in v).toBe(false);
    // The same response still names the unmet expectation.
    expect(v.issues.some((i) => i.component === 'sensitivityAnalyses')).toBe(true);
    expect(S.updates).toEqual([expect.objectContaining({ ichE9R1Compliant: null })]);
  });

  it('says a stored primary method is an unconfirmed suggestion, not a settled choice', async () => {
    const v = await estimandEngineService.validateEstimand(3, 9);
    expect(v.issues).toContainEqual(
      expect.objectContaining({ component: 'primaryMethod', severity: 'warning', message: expect.stringMatching(/suggest/i) }),
    );
  });

  it('writes nothing when the stored flag is already unassessed', async () => {
    S.row = { ...STORED, ichE9R1Compliant: null };
    await estimandEngineService.validateEstimand(3, 9);
    expect(S.updates).toEqual([]);
  });
});
