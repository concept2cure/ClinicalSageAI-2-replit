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
