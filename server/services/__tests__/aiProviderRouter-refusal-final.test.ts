/**
 * A gateway refusal is final in the legacy router too (D6).
 *
 * AIProviderRouter caught every error from the gateway as a provider failure.
 * A tenant placement refusal (DENY_TENANT_POLICY) therefore counted against the
 * refused provider's health, and was re-sent to another vendor. Three such
 * refusals marked the provider unhealthy for every tenant for 60 s, so one
 * tenant's policy steered other tenants' traffic (review finding, 2026-09-26).
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

const S = vi.hoisted(() => ({ providers: [] as Array<string | undefined>, refuse: true }));

vi.mock('../ai-gateway/gateway.js', () => ({
  getGateway: () => ({
    // A plain function, not a vi.fn: a rejecting spy reached through a mock is
    // reported as a failure by this harness even when the code catches it.
    route: async (request: { provider?: string }) => {
      S.providers.push(request.provider);
      if (S.refuse) {
        const err = new Error('DENY_TENANT_POLICY: not sent to any AI service') as Error & {
          reasonCode: string;
          stage: string;
        };
        err.name = 'GatewayPolicyError';
        err.reasonCode = 'DENY_TENANT_POLICY';
        err.stage = 'selection';
        throw err;
      }
      return {
        content: 'ok',
        provider: request.provider ?? 'anthropic',
        model: 'm',
        usage: { inputTokens: 1, outputTokens: 1, totalTokens: 2 },
      };
    },
  }),
}));
vi.mock('../observability/langfuseService', () => ({
  LangfuseService: class {
    async emitEvent() {}
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

const pool = { query: async () => ({ rows: [] }) };
const ask = () => ({ taskType: 'document_analysis' as const, messages: [{ role: 'user' as const, content: 'x' }] });

beforeEach(() => {
  process.env.ANTHROPIC_API_KEY = 'test-key';
  process.env.OPENAI_API_KEY = 'test-key';
  S.providers.length = 0;
  S.refuse = true;
});

describe('AIProviderRouter — a gateway refusal is final', () => {
  it('is not re-sent to another vendor', async () => {
    const router = new AIProviderRouter(pool as never);
    await expect(router.route(ask())).rejects.toMatchObject({ reasonCode: 'DENY_TENANT_POLICY' });
    expect(S.providers).toHaveLength(1);
  });

  it('does not count against the refused provider’s health, so other tenants are not steered', async () => {
    const router = new AIProviderRouter(pool as never);
    const first = [];
    for (let i = 0; i < 3; i++) {
      await router.route(ask()).catch(() => undefined);
      first.push(S.providers[S.providers.length - 1]);
    }
    const health = (router as unknown as { providerHealth: Map<string, { isHealthy: boolean; consecutiveFailures: number }> })
      .providerHealth;
    for (const h of health.values()) {
      expect(h.isHealthy).toBe(true);
      expect(h.consecutiveFailures).toBe(0);
    }
    // The next, unrefused request goes where it would have gone without the refusals.
    S.refuse = false;
    S.providers.length = 0;
    await router.route(ask());
    expect(S.providers[0]).toBe(first[0]);
  });
});
