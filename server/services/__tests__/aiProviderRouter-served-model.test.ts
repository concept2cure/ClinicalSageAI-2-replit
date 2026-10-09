/**
 * The router records the model that served, not the one in its own table.
 *
 * AIProviderRouter picks a provider from MODEL_CONFIGS and the governed gateway
 * picks the live model for it. Until 2026-09-23 the router then wrote its own
 * config name — claude-3-5-sonnet-20241022, gpt-4-turbo-preview — into
 * ai_provider_audit_log, Langfuse and the response, though the gateway had
 * served something else (Opus 5 for Anthropic, gpt-4o for OpenAI).
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

const S = vi.hoisted(() => ({
  route: vi.fn(),
  events: [] as Array<{ name: string; metadata?: Record<string, unknown> }>,
}));

vi.mock('../ai-gateway/gateway.js', () => ({
  getGateway: () => ({ route: S.route }),
}));
vi.mock('../observability/langfuseService', () => ({
  LangfuseService: class {
    async emitEvent(e: { name: string; metadata?: Record<string, unknown> }) {
      S.events.push(e);
    }
  },
}));
vi.mock('../ai/LiteLLMAdapter', () => ({
  LiteLLMAdapter: class {
    isEnabled() {
      return false;
    }
  },
}));

import { AIProviderRouter } from '../aiProviderRouter';

function routerWithAudit() {
  const audit: unknown[][] = [];
  const pool = {
    query: vi.fn(async (sql: string, params: unknown[]) => {
      if (/INSERT INTO ai_provider_audit_log/.test(sql)) audit.push(params);
      return { rows: [] };
    }),
  };
  return { router: new AIProviderRouter(pool as never), audit };
}

beforeEach(() => {
  process.env.ANTHROPIC_API_KEY = 'test-key';
  S.route.mockReset();
  S.events.length = 0;
});

describe('AIProviderRouter provenance', () => {
  it('the audit row, the Langfuse event and the response name the model the gateway served', async () => {
    S.route.mockImplementation(async () => ({
      content: '{"1": 90}',
      provider: 'anthropic',
      model: 'claude-opus-5',
      usage: { inputTokens: 10, outputTokens: 5, totalTokens: 15 },
    }));
    const { router, audit } = routerWithAudit();

    const res = await router.route({
      taskType: 'regulatory_review',
      messages: [{ role: 'user', content: 'score these' }],
    });

    expect(res).toMatchObject({ provider: 'anthropic', model: 'claude-opus-5' });
    expect(audit).toHaveLength(1);
    expect(audit[0][2]).toBe('anthropic'); // provider
    expect(audit[0][3]).toBe('claude-opus-5'); // model
    const success = S.events.find(e => e.name === 'ai_request_success');
    expect(success?.metadata).toMatchObject({ provider: 'anthropic', model: 'claude-opus-5' });
    // None of the router's logical config names is recorded as what served.
    expect(JSON.stringify([res.model, audit, success])).not.toMatch(/claude-3|gpt-4-turbo/);
  });
});

/* ── A pinned model reaches the gateway, and does not become an approval bypass ──
 *
 * `AIRequest.model` was added so a RAG run can be attributed to a model:
 * `ga-readiness-report` records, against the PQ row, that "ragQuery takes no
 * model parameter — the answer is generated inside the RAG pipeline by whatever
 * it selects", and a run nobody can attribute cannot qualify anything.
 *
 * Two properties have to hold together, and the second is the one that matters:
 *
 *   1. The pinned model REACHES the gateway — otherwise the attribution is a
 *      claim the request never made.
 *   2. Pinning does NOT decide approval. The gateway's selectModel filters an
 *      explicitly named model through `approvedForTask` and throws
 *      ModelNotApprovedError on a high-risk task rather than honouring it. This
 *      router must therefore pass the name through and let that refusal
 *      surface — never catch it, never fall back to an approved model, never
 *      re-route. A PQ run against an unapproved model has to fail loudly.
 *
 * The provider assertion is not cosmetic: the gateway filters on provider AND
 * model when both are present, so sending this router's independently-chosen
 * provider alongside a caller's model yields an empty match set whenever the
 * two disagree — which on a high-risk task is indistinguishable from "no such
 * model".
 */
describe('AIProviderRouter — a pinned model is forwarded, not honoured in place of approval', () => {
  it('forwards the pinned model to the gateway', async () => {
    S.route.mockImplementation(async () => ({
      content: 'ok',
      provider: 'anthropic',
      model: 'claude-opus-4',
      usage: { inputTokens: 1, outputTokens: 1, totalTokens: 2 },
    }));
    const { router } = routerWithAudit();

    await router.route({
      taskType: 'regulatory_review',
      messages: [{ role: 'user', content: 'q' }],
      model: 'claude-opus-4',
    });

    expect(S.route).toHaveBeenCalledTimes(1);
    expect(S.route.mock.calls[0][0]).toMatchObject({ model: 'claude-opus-4' });
  });

  it('drops its own provider guess when a model is pinned, so the two cannot disagree', async () => {
    S.route.mockImplementation(async () => ({
      content: 'ok',
      provider: 'anthropic',
      model: 'claude-opus-4',
      usage: { inputTokens: 1, outputTokens: 1, totalTokens: 2 },
    }));
    const { router } = routerWithAudit();

    await router.route({
      taskType: 'regulatory_review',
      messages: [{ role: 'user', content: 'q' }],
      model: 'claude-opus-4',
    });

    const sent = S.route.mock.calls[0][0] as Record<string, unknown>;
    expect(sent.model).toBe('claude-opus-4');
    expect(sent.provider).toBeUndefined();
  });

  it('still sends its provider when NO model is pinned — the unchanged path', async () => {
    S.route.mockImplementation(async () => ({
      content: 'ok',
      provider: 'anthropic',
      model: 'claude-opus-5',
      usage: { inputTokens: 1, outputTokens: 1, totalTokens: 2 },
    }));
    const { router } = routerWithAudit();

    await router.route({
      taskType: 'regulatory_review',
      messages: [{ role: 'user', content: 'q' }],
    });

    const sent = S.route.mock.calls[0][0] as Record<string, unknown>;
    expect(sent.provider).toBe('anthropic');
    expect(sent.model).toBeUndefined();
  });

  it('LETS THE GATEWAY REFUSAL SURFACE — it does not fall back to an approved model', async () => {
    /* The gateway's own behaviour for an unapproved model on a high-risk task.
       If this router caught it and re-routed, an unapproved model would appear
       to have served a regulatory task, and a PQ against it would read as a
       pass on the strength of a substitution nobody asked for.

       THE ERROR'S `name` IS THE WHOLE TEST. `isTerminalGatewayError` keys on
       `err.name` against {GatewayPolicyError, GatewayAbortedError,
       GatewayModelDeclinedError} — not on the class. The real
       ModelNotApprovedError extends GatewayPolicyError, whose constructor sets
       `this.name = 'GatewayPolicyError'` as a LITERAL, so the subclass inherits
       that name and is terminal.

       A first draft of this test threw `class ModelNotApprovedError extends
       Error {}`, which carries `name === 'Error'`, is not terminal, and duly
       walked the fallback ladder — two gateway calls. That looked like a
       bypass in the router and was a bad fake: the assertion has to reproduce
       the name, because the name is what the guard reads. */
    S.route.mockImplementation(async () => {
      const err = new Error(
        'MODEL_NOT_APPROVED_FOR_HIGH_RISK: regulatory_review is high-risk regulatory work ' +
          'and no model approved for it is available. Withheld: claude-haiku-4-5 (named by the caller).',
      );
      err.name = 'GatewayPolicyError';
      throw err;
    });
    const { router } = routerWithAudit();

    await expect(
      router.route({
        taskType: 'regulatory_review',
        messages: [{ role: 'user', content: 'q' }],
        model: 'claude-haiku-4-5',
      }),
    ).rejects.toThrow(/MODEL_NOT_APPROVED_FOR_HIGH_RISK/);

    // Exactly one attempt: the refusal is terminal, so no retry onto an
    // approved model and no second send of the refused payload to another
    // vendor.
    expect(S.route).toHaveBeenCalledTimes(1);
  });

  it('a NON-terminal failure still falls back — the guard is specific, not blanket', async () => {
    /* The over-correction guard. Treating every gateway throw as terminal
       would disable provider failover, which is the router's main job. A
       transport error carries no terminal name and must still walk the ladder. */
    let calls = 0;
    S.route.mockImplementation(async () => {
      calls += 1;
      if (calls === 1) throw new Error('ECONNRESET');
      return {
        content: 'ok',
        provider: 'openai',
        model: 'gpt-4o',
        usage: { inputTokens: 1, outputTokens: 1, totalTokens: 2 },
      };
    });
    const { router } = routerWithAudit();

    const res = await router.route({
      taskType: 'regulatory_review',
      messages: [{ role: 'user', content: 'q' }],
    });

    expect(res.content).toBe('ok');
    expect(S.route).toHaveBeenCalledTimes(2);
  });
});
