/**
 * High-risk regulatory work is served only by a model approved for it.
 *
 * ── The defect ───────────────────────────────────────────────────────────────
 * `docs/LAUNCH_DEFINITION_OF_DONE.md`: "Only models with a passed PQ … are
 * approved for high-risk regulatory drafting." The approved-models registry said
 * in prose which models are NOT approved — Sonnet "on its own", Haiku, GPT,
 * Kimi, `local` — and nothing read it. Five routes reached one anyway:
 *
 *   - the fallback ladder: Opus fails, drafting walks down to Sonnet and review
 *     on to GPT-4o;
 *   - `cost_optimized`: the cheapest capable model is Sonnet 5, so it became the
 *     PRIMARY. `server/services/cmc/module3-narrative-builder.ts` drafts CMC
 *     Module 3 narrative with exactly this strategy, on the default config;
 *   - `round_robin`, which spreads the task across every capable model;
 *   - the relaxed path when every provider is marked unhealthy, which returned
 *     the first capable model in list order — GPT-4o, for review;
 *   - an explicit model request, honoured as named.
 *
 * Each case below drives the real `selectModel` / fallback code with the real
 * registry. Only `executeProvider` — the network call — is replaced, so the
 * tests observe which model actually served the request.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { AIGateway, GatewayPolicyError, ModelNotApprovedError } from '../gateway';
import {
  APPROVED_MODELS,
  HIGH_RISK_TASK_TYPES,
  isApprovedForHighRisk,
} from '../../ai-governance/approved-models';
import { classifyGatewayError } from '../gateway-error-map';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { verifyPqClaim } from '../../../eval/pq/pq-verdict';

const APPROVED = ['claude-opus-4', 'claude-opus-4-legacy', 'claude-opus-4-bedrock', 'claude-opus-4-vertex'];

function makeGateway(providers: Array<'anthropic' | 'openai' | 'bedrock' | 'vertex'> = ['anthropic', 'openai']) {
  return new AIGateway({
    deterministicMode: false,
    auditEnabled: true,
    providers: providers.map((name) => ({ name, enabled: true, apiKey: 'test-key', defaultModel: '', models: [] })),
    policy: {
      maxTokensPerRequest: 16000,
      maxRequestsPerMinutePerOrg: 1000,
      maxRequestsPerMinutePerUser: 1000,
      blockedPatterns: [],
      contentFilters: false,
      piiDetection: false,
    },
  } as any);
}

/**
 * Replace the network call. `fail` lists model ids that throw a provider error;
 * everything else answers. Returns the ids actually invoked, in order.
 */
function stubProviders(gateway: AIGateway, fail: string[] = []) {
  const invoked: string[] = [];
  vi.spyOn(gateway as any, 'executeProvider').mockImplementation(async (...args: unknown[]) => {
    const model = args[0] as { id: string; provider: string; model: string };
    invoked.push(model.id);
    if (fail.includes(model.id)) throw new Error(`simulated outage on ${model.id}`);
    return {
      content: 'ok',
      provider: model.provider,
      model: model.model,
      modelId: model.id,
      latencyMs: 1,
      usage: { inputTokens: 1, outputTokens: 1, totalTokens: 1 },
      inputTokens: 1,
      outputTokens: 1,
      totalTokens: 1,
      estimatedCostUsd: 0,
      cached: false,
      finishReason: 'end_turn',
    };
  });
  return invoked;
}

const msg = [{ role: 'user' as const, content: 'Draft section 3.2.S.2.2.' }];

describe('registry: which models may serve high-risk regulatory work', () => {
  it('approves exactly the four Opus entries — changing this set is a governance act, not a refactor', () => {
    expect(APPROVED_MODELS.filter((m) => m.approvedForHighRisk).map((m) => m.id).sort()).toEqual([...APPROVED].sort());
  });

  it('every entry says, in words, why it is or is not approved', () => {
    for (const m of APPROVED_MODELS) {
      expect(m.highRiskBasis.trim().length, m.id).toBeGreaterThan(20);
    }
  });

  it('a PQ recorded as passed must point at the run that passed it', () => {
    for (const m of APPROVED_MODELS) {
      if (m.pq.status === 'passed') expect(m.pq.reference, m.id).toBeTruthy();
    }
  });

  it('an id the registry does not know is not approved — it fails closed', () => {
    expect(isApprovedForHighRisk('a-model-added-without-a-governance-entry')).toBe(false);
  });

  it('every PQ claim in the registry is backed by the record it cites (server/eval/pq/pq-verdict.ts)', () => {
    // Vacuous while every entry is pending; the moment one is marked passed,
    // this reads its record and refuses anything but a PASS for that exact id
    // and pinned version against an approved protocol. The rules themselves are
    // exercised on constructed records in server/eval/pq/__tests__/pq-verdict.test.ts.
    const root = path.resolve(__dirname, '../../../..');
    const read = (ref: string) => JSON.parse(readFileSync(path.join(root, ref), 'utf8'));
    const problems = APPROVED_MODELS.flatMap((m) => verifyPqClaim(m, read));
    expect(problems).toEqual([]);
  });

  it('drafting and review are the high-risk task types', () => {
    expect([...HIGH_RISK_TASK_TYPES].sort()).toEqual(['document_drafting', 'regulatory_review']);
  });
});

describe('the gateway enforces it at every selection point', () => {
  const saved = { ...process.env };
  beforeEach(() => {
    process.env.NODE_ENV = 'test';
  });
  afterEach(() => {
    process.env = { ...saved };
    vi.restoreAllMocks();
  });

  it('cost_optimized drafting is served by an approved model, not by the cheapest capable one', async () => {
    const gw = makeGateway();
    const invoked = stubProviders(gw);
    await gw.route({ taskType: 'document_drafting', messages: msg, strategy: 'cost_optimized' });
    expect(invoked).toHaveLength(1);
    expect(APPROVED, `served by ${invoked[0]}`).toContain(invoked[0]);
  });

  it('when both approved Opus models fail, drafting refuses — it does not fall to Sonnet', async () => {
    const gw = makeGateway();
    const invoked = stubProviders(gw, ['claude-opus-4', 'claude-opus-4-legacy']);
    await expect(gw.route({ taskType: 'document_drafting', messages: msg })).rejects.toThrow();
    for (const id of invoked) expect(APPROVED, `${id} served a drafting request`).toContain(id);
    expect(invoked).toEqual(expect.arrayContaining(['claude-opus-4', 'claude-opus-4-legacy']));
  }, 20_000);

  it('when the approved models fail, regulatory review does not cross to GPT-4o', async () => {
    const gw = makeGateway();
    const invoked = stubProviders(gw, ['claude-opus-4', 'claude-opus-4-legacy']);
    await expect(gw.route({ taskType: 'regulatory_review', messages: msg })).rejects.toThrow();
    expect(invoked).not.toContain('gpt-4o');
    expect(invoked).not.toContain('claude-sonnet-4');
  }, 20_000);

  it('round_robin never lands on an unapproved model, across many requests', async () => {
    const gw = makeGateway();
    const invoked = stubProviders(gw);
    for (let i = 0; i < 12; i += 1) {
      await gw.route({ taskType: 'document_drafting', messages: msg, strategy: 'round_robin' });
    }
    for (const id of invoked) expect(APPROVED, `round_robin served ${id}`).toContain(id);
  });

  it('with only unapproved providers configured, review refuses with a typed error — never null, never demo content', async () => {
    // OpenAI only: gpt-4o is capable of regulatory_review and not approved for it.
    const gw = makeGateway(['openai']);
    const invoked = stubProviders(gw);
    const err = await gw.route({ taskType: 'regulatory_review', messages: msg }).catch((e) => e);
    expect(err).toBeInstanceOf(ModelNotApprovedError);
    expect(err).toBeInstanceOf(GatewayPolicyError); // terminal on every existing policy path
    expect(err.reason).toBe('no-approved-model');
    expect(err.withheldModelIds).toContain('gpt-4o');
    expect(invoked).toEqual([]);
  });

  it('an explicit request for Sonnet on a drafting task is refused, not rerouted and not honoured', async () => {
    const gw = makeGateway();
    const invoked = stubProviders(gw);
    const err = await gw
      .route({ taskType: 'document_drafting', messages: msg, model: 'claude-sonnet-4' })
      .catch((e) => e);
    expect(err).toBeInstanceOf(ModelNotApprovedError);
    expect(err.reason).toBe('explicit');
    expect(err.withheldModelIds).toEqual(['claude-sonnet-4']);
    expect(invoked).toEqual([]);
  });

  it('the refusal is audited, naming the models withheld', async () => {
    const gw = makeGateway(['openai']);
    stubProviders(gw);
    await gw.route({ taskType: 'regulatory_review', messages: msg }).catch(() => undefined);
    const entries = (gw as any).auditLogger.getRecentEntries();
    const refusal = entries.find((e: any) => e.error === 'MODEL_NOT_APPROVED_FOR_HIGH_RISK');
    expect(refusal, JSON.stringify(entries).slice(0, 400)).toBeDefined();
    expect(refusal.success).toBe(false);
    expect(refusal.metadata.modelGovernance.withheldModelIds).toContain('gpt-4o');
  });

  it('reaches the author as a specific message, not "blocked by AI gateway policy"', () => {
    const c = classifyGatewayError(new ModelNotApprovedError('document_drafting', ['claude-sonnet-4'], 'explicit'));
    expect(c.message).toMatch(/approved for regulatory drafting/);
    expect(c.message).not.toMatch(/blocked by AI gateway policy/);
  });

  describe('controls — what must NOT change', () => {
    it('a task that is not high-risk may still be served by Sonnet on request', async () => {
      const gw = makeGateway();
      const invoked = stubProviders(gw);
      await gw.route({ taskType: 'document_analysis', messages: msg, model: 'claude-sonnet-4' });
      expect(invoked).toEqual(['claude-sonnet-4']);
    });

    it('cost_optimized chat still picks the cheapest model — the rule is scoped to high-risk work', async () => {
      const gw = makeGateway();
      const invoked = stubProviders(gw);
      await gw.route({ taskType: 'chat', messages: msg, strategy: 'cost_optimized' });
      expect(APPROVED).not.toContain(invoked[0]);
    });

    it('the default path for drafting is unchanged: Opus 5 serves it', async () => {
      const gw = makeGateway();
      const invoked = stubProviders(gw);
      await gw.route({ taskType: 'document_drafting', messages: msg });
      expect(invoked).toEqual(['claude-opus-4']);
    });
  });
});
