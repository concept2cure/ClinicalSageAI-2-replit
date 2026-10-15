/**
 * Track GW review [21]: the production PQ refusal reaches its readers as what
 * it is.
 *
 * The first build gave the PQ refusal the high-risk approval code
 * (MODEL_NOT_APPROVED_FOR_HIGH_RISK). Its two readers then stated a false
 * reason: the drafting council told the author "No model approved for
 * regulatory drafting and review is available right now" — five entries are
 * approved, none is PQ-passed, and "right now" says it will pass — and the
 * Module 3 builder recorded `model_not_approved`, which the audit reader counts
 * as an unapproved model.
 *
 * Each case takes the error the real gateway throws for production drafting,
 * and hands it to the consumer through a mocked `getGateway().route`.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const h = vi.hoisted(() => ({
  route: vi.fn(),
  auditLog: vi.fn(),
}));

vi.mock('../ai-gateway/gateway.js', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../ai-gateway/gateway')>()),
  getGateway: () => ({ route: h.route }),
}));
vi.mock('../../lib/graceful-degradation', () => ({
  getGracefulDegradationService: () => ({ isFeatureAvailable: () => true }),
}));
vi.mock('../../lib/tamper-proof-audit', () => ({
  getTamperProofAuditLog: () => ({ log: h.auditLog }),
}));
vi.mock('../../lib/prompt-injection-protection', () => ({
  getPromptInjectionProtection: () => ({
    analyze: (s: string) => ({ detected: [], blocked: false, sanitized: s, riskScore: 0 }),
  }),
  PromptInjectionError: class PromptInjectionError extends Error {},
}));
vi.mock('../lumen-context-builder.js', () => ({ getIntelligencePrefix: async () => '' }));

import { MultiAgentCouncilService } from '../multi-agent-council';
import { refineSectionWithAI } from '../cmc/module3-narrative-builder';
import { governedGateway, request, stubDispatch } from '../ai-gateway/__tests__/support/governed-gateway';
import { resetOrgPlacementResolver, setOrgPlacementResolver } from '../ai-gateway/providers/org-placement';

const PLAIN =
  'No performance-qualified model is available for high-risk regulatory drafting in this environment.';
const saved = process.env.NODE_ENV;

/** What the real gateway throws for high-risk drafting in production today. */
async function productionDraftingRefusal(): Promise<Error> {
  process.env.NODE_ENV = 'production';
  setOrgPlacementResolver({ resolve: async () => null });
  const gw = governedGateway();
  stubDispatch(gw);
  const err = await gw.route(request({ taskType: 'document_drafting', organizationId: 7 })).catch((e) => e);
  process.env.NODE_ENV = saved;
  expect(err.message).toBe(PLAIN);
  return err;
}

beforeEach(() => {
  h.route.mockReset();
  h.auditLog.mockReset();
  h.auditLog.mockResolvedValue(undefined);
});
afterEach(() => {
  process.env.NODE_ENV = saved;
  resetOrgPlacementResolver();
  vi.restoreAllMocks();
});

describe('the drafting council', () => {
  it('tells the author no performance-qualified model is available — not that none is approved "right now"', async () => {
    const refusal = await productionDraftingRefusal();
    h.route.mockRejectedValue(refusal);
    const svc = new MultiAgentCouncilService({} as never);
    const err = await (svc as any)
      .executeLLMWithFailover('DRAFTER', [{ role: 'user', content: 'Draft section X.' }], 'corr-1')
      .catch((e: unknown) => e);
    expect(err).toMatchObject({ code: 'MODEL_NOT_PQ_QUALIFIED', recoverable: false });
    expect(err.message).toContain(PLAIN);
    expect(err.message).not.toMatch(/No model approved|right now/);
  });
});

describe('the Module 3 builder', () => {
  it('records the fallback as model_not_pq_qualified, not model_not_approved', async () => {
    const refusal = await productionDraftingRefusal();
    h.route.mockRejectedValue(refusal);
    const out = await refineSectionWithAI({
      organizationId: 7,
      projectId: 3,
      sectionKey: '3.2.S.2',
      deterministicNarrative: 'The drug substance is manufactured by a four-step synthetic route.',
      sourceObjects: [{ id: 'src-1', type: 'drug_substance', organizationId: 7, projectId: 3, payload: { name: 'BX-701' } }],
    } as never);
    expect(out.fallback).toBe(true);
    expect(out.fallbackReason).toBe('model_not_pq_qualified');
    expect(out.refinedNarrative).toBe('The drug substance is manufactured by a four-step synthetic route.');
  });
});
