/**
 * The estimand method recommendation is served by an approved model or by the
 * deterministic map — and says which.
 *
 * POST /api/biostat/estimand/:id/methods stores the recommended primary
 * analysis and sensitivity analyses on the estimand, and those columns clear
 * its ICH E9(R1) compliance warnings. Until 2026-09-23 the recommendation:
 *   - pinned gpt-4o as a 'general' request, so no approval check applied;
 *   - stored any JSON the model returned, including one with no method — drizzle
 *     drops undefined fields, so that was a "success" that changed nothing;
 *   - fell back to STRATEGY_METHOD_MAP silently, and that fallback asserted
 *     "FDA, EMA, and PMDA have accepted this approach in recent approvals for
 *     similar indications" for every estimand, with no precedent consulted.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

const S = vi.hoisted(() => ({
  chat: vi.fn(),
  updates: [] as Array<Record<string, unknown>>,
}));

const ESTIMAND = {
  id: 3,
  organizationId: 9,
  endpointName: 'Change from baseline in HbA1c at week 26',
  population: 'Full analysis set',
  variable: 'HbA1c',
  summaryMeasure: 'Difference in means',
  strategy: 'treatment_policy',
  intercurrentEvents: [{ name: 'Rescue medication', strategy: 'treatment_policy' }],
};

vi.mock('../../db', () => ({
  db: {
    select: () => ({ from: () => ({ where: () => ({ limit: async () => [ESTIMAND] }) }) }),
    update: () => ({
      set: (values: Record<string, unknown>) => {
        S.updates.push(values);
        return { where: async () => undefined };
      },
    }),
  },
}));
vi.mock('../../lib/unified-ai-client', () => ({ ai: { chat: S.chat } }));

import { estimandEngineService } from '../estimand-engine-service';

const GOOD = {
  primaryMethod: 'MMRM',
  primaryMethodRationale: 'Handles repeated measures under MAR.',
  sensitivityAnalyses: [{ method: 'Tipping point', rationale: 'MNAR robustness', targetEstimand: 'treatment_policy' }],
  supplementaryAnalyses: [{ method: 'Per-protocol', rationale: 'Supportive' }],
  regulatoryConsiderations: 'Narrative.',
};

beforeEach(() => {
  S.chat.mockReset();
  S.updates.length = 0;
});

describe('estimand method recommendation', () => {
  it('is routed as regulatory_review with no model pinned', async () => {
    S.chat.mockImplementation(async () => ({ content: JSON.stringify(GOOD), provider: 'anthropic', model: 'claude-opus-5' }));
    await estimandEngineService.recommendMethods(3, 9);
    const [req] = S.chat.mock.calls[0];
    expect(req).toMatchObject({ taskType: 'regulatory_review', organizationId: 9 });
    expect(req.model).toBeUndefined();
  });

  it('a model recommendation says it came from the model, and which one', async () => {
    S.chat.mockImplementation(async () => ({ content: JSON.stringify(GOOD), provider: 'anthropic', model: 'claude-opus-5' }));
    const r = await estimandEngineService.recommendMethods(3, 9);
    expect(r).toMatchObject({
      primaryMethod: 'MMRM',
      source: 'model',
      generatedBy: { provider: 'anthropic', model: 'claude-opus-5' },
    });
    expect(S.updates[0]).toMatchObject({ primaryMethod: 'MMRM' });
  });

  it.each([
    ['no primary method', { ...GOOD, primaryMethod: undefined }],
    ['sensitivity analyses as a string', { ...GOOD, sensitivityAnalyses: 'tipping point' }],
    ['an empty object', {}],
  ])('a reply with %s is not stored as the model\'s recommendation', async (_what, reply) => {
    S.chat.mockImplementation(async () => ({ content: JSON.stringify(reply), provider: 'anthropic', model: 'claude-opus-5' }));
    const r = await estimandEngineService.recommendMethods(3, 9);
    expect(r.source).toBe('deterministic');
    expect(r.generatedBy).toBeNull();
    expect(S.updates[0]).toMatchObject({ primaryMethod: 'Mixed Model for Repeated Measures (MMRM)' });
  });

  it('a refusal falls back to the deterministic map, labelled, with no invented precedent', async () => {
    S.chat.mockImplementation(async () => {
      throw Object.assign(new Error('MODEL_NOT_APPROVED_FOR_HIGH_RISK'), { code: 'MODEL_NOT_APPROVED_FOR_HIGH_RISK' });
    });
    const r = await estimandEngineService.recommendMethods(3, 9);
    expect(r).toMatchObject({ source: 'deterministic', generatedBy: null });
    expect(r.regulatoryConsiderations).not.toMatch(/accepted this approach|recent approvals/);
    expect(r.regulatoryConsiderations).toMatch(/No regulatory precedent was assessed/);
  });
});
