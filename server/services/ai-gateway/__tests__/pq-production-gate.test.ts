/**
 * ADR-0015 §3: in production, PQ is a serving rule, not a label.
 *
 * CLAUDE.md RULE 2: "only PQ-passed models serve high-risk regulatory
 * drafting." Until this change nothing enforced it: every approved entry
 * records `pq.status: 'pending'`, and the gateway served high-risk drafting on
 * them in every environment, recording the PQ status in the ledger.
 *
 * "High-risk drafting" is `isHighRiskRequest(taskType, riskTier)` for a task in
 * the drafting set — `document_drafting`, which is high-risk at every declared
 * tier. Review is not drafting: ADR §3 lets read and review run on PQ-pending
 * approved models. Outside production nothing changes. The refusal says, in
 * plain words, that no performance-qualified model is available; it is never a
 * silent downgrade, and no environment variable turns it off in production.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { isTerminalGatewayError } from '../gateway-outcome';
import { classifyGatewayError } from '../gateway-error-map';
import { resetOrgPlacementResolver, setOrgPlacementResolver } from '../providers/org-placement';
import * as governance from '../../ai-governance/approved-models';
import type { TaskType } from '../types';
import { governedGateway, judgeAgainst, ledgerRows, request, stubDispatch } from './support/governed-gateway';

const ORG = 42;
const PLAIN =
  'No performance-qualified model is available for high-risk regulatory drafting in this environment.';
const saved = { ...process.env };

beforeEach(() => {
  process.env.NODE_ENV = 'test';
  delete process.env.AI_SENSITIVE_DATA_POLICY_MODE;
  delete process.env.AI_PII_ENFORCEMENT;
  delete process.env.AI_GOVERNANCE_ACCEPT_PERMISSIVE;
  setOrgPlacementResolver({ resolve: async () => null });
});
afterEach(() => {
  process.env = { ...saved };
  resetOrgPlacementResolver();
  vi.restoreAllMocks();
});

function production() {
  process.env.NODE_ENV = 'production';
}

/** The real lockfile with these entries' PQ recorded as passed — a synthetic list, not governed data. */
function pqPassed(...ids: string[]) {
  return governance.APPROVED_MODELS.map((e) =>
    ids.includes(e.id) ? { ...e, pq: { status: 'passed' as const, reference: `docs/evidence/PQ/synthetic/${e.id}.json` } } : e,
  );
}

const drafting = (extra = {}) => request({ taskType: 'document_drafting', organizationId: ORG, ...extra });

describe('§3 — production refuses high-risk drafting on a model without a passed PQ', () => {
  it('strategy: refused in plain words, terminal, nothing dispatched', async () => {
    production();
    const gw = governedGateway();
    const invoked = stubDispatch(gw);
    const err = await gw.route(drafting()).catch((e) => e);
    expect(err.message).toBe(PLAIN);
    expect(err).toMatchObject({ name: 'GatewayPolicyError', code: 'MODEL_NOT_PQ_QUALIFIED', reason: 'no-pq-qualified-model' });
    expect(isTerminalGatewayError(err)).toBe(true);
    expect(invoked).toEqual([]);
  });

  it('explicit: naming the flagship does not reach it', async () => {
    production();
    const gw = governedGateway();
    const invoked = stubDispatch(gw);
    const err = await gw.route(drafting({ model: 'claude-opus-4' })).catch((e) => e);
    expect(err.message).toBe(PLAIN);
    expect(invoked).toEqual([]);
  });

  it('with no approved model configured at all, the refusal is the same plain statement', async () => {
    production();
    const gw = governedGateway({ providers: ['openai'] });
    const invoked = stubDispatch(gw);
    const err = await gw.route(drafting()).catch((e) => e);
    expect(err.message).toBe(PLAIN);
    expect(invoked).toEqual([]);
  });

  it('every declared risk tier: drafting is high-risk at all of them', async () => {
    production();
    for (const riskTier of ['low', 'medium', 'high', undefined] as const) {
      const gw = governedGateway();
      const invoked = stubDispatch(gw);
      const err = await gw.route(drafting({ riskTier })).catch((e) => e);
      expect(err.message, String(riskTier)).toBe(PLAIN);
      expect(invoked).toEqual([]);
    }
  });

  it('no environment variable turns it off in production', async () => {
    production();
    process.env.AI_GOVERNANCE_ACCEPT_PERMISSIVE = 'true';
    process.env.AI_PII_ENFORCEMENT = 'off';
    process.env.AI_SENSITIVE_DATA_POLICY_MODE = 'audit';
    const gw = governedGateway();
    const invoked = stubDispatch(gw);
    const err = await gw.route(drafting()).catch((e) => e);
    expect(err.message).toBe(PLAIN);
    expect(invoked).toEqual([]);
  });

  it('the refusal is ledgered as a governance refusal, and the author reads the plain statement', async () => {
    production();
    const gw = governedGateway();
    stubDispatch(gw);
    const err = await gw.route(drafting()).catch((e) => e);
    const row = ledgerRows(gw).find((r) => r.metadata?.modelGovernance);
    expect(row).toMatchObject({
      provider: 'none',
      success: false,
      organizationId: ORG,
      error: 'MODEL_NOT_PQ_QUALIFIED',
      metadata: {
        modelGovernance: { reason: 'no-pq-qualified-model', withheldModelIds: expect.arrayContaining(['claude-opus-4']) },
      },
    });
    // Its own code (review [21]): the council and the Module 3 builder read it
    // as a PQ refusal, not as "no model approved".
    expect(err.code).toBe('MODEL_NOT_PQ_QUALIFIED');
    expect(classifyGatewayError(err).message).toBe(PLAIN);
  });
});

describe('§3 — what is still served', () => {
  it('outside production, drafting is served by the flagship as before', async () => {
    const gw = governedGateway();
    const invoked = stubDispatch(gw);
    await gw.route(drafting());
    expect(invoked).toEqual(['claude-opus-4']);
  });

  it('in production, high-risk review runs on a PQ-pending approved model', async () => {
    production();
    for (const riskTier of ['high', undefined] as const) {
      const gw = governedGateway();
      const invoked = stubDispatch(gw);
      await gw.route(request({ taskType: 'regulatory_review', riskTier, organizationId: ORG }));
      expect(invoked, String(riskTier)).toEqual(['claude-opus-4']);
    }
  });

  it('in production, drafting is served by a model whose entry records a passed PQ', async () => {
    production();
    const gw = governedGateway();
    judgeAgainst(gw, pqPassed('claude-opus-4'));
    const invoked = stubDispatch(gw);
    await gw.route(drafting());
    expect(invoked).toEqual(['claude-opus-4']);
  });

  it('in production, the fallback ladder does not walk from a qualified model to a PQ-pending one', async () => {
    production();
    const gw = governedGateway();
    judgeAgainst(gw, pqPassed('claude-opus-4'));
    const invoked = stubDispatch(gw, ['claude-opus-4']);
    await expect(gw.route(drafting())).rejects.toThrow();
    expect(invoked).toEqual(['claude-opus-4']);
  });
  // The PQ runner's own request shape, in and out of production, is pinned in
  // governance-review.test.ts [7]: it runs in a validation environment, and
  // NODE_ENV=production refuses its unbound request before the wire.
});

describe('§3 — the drafting set, from the existing taxonomy', () => {
  const tasks: TaskType[] = [
    'chat',
    'document_analysis',
    'document_drafting',
    'structured_output',
    'regulatory_review',
    'code_generation',
    'summarization',
    'embedding',
    'general',
  ];

  it('is exactly document_drafting, at every declared tier; review and analysis are not drafting', () => {
    for (const task of tasks) {
      for (const tier of ['low', 'medium', 'high', null, undefined] as const) {
        expect(governance.isHighRiskDraftingRequest(task, tier), `${task}/${tier}`).toBe(task === 'document_drafting');
      }
    }
  });
});
