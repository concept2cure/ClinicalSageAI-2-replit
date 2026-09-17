/**
 * AI Gateway — Unit Tests
 *
 * Tests the core gateway functionality including:
 * - Initialization and configuration
 * - Routing strategies
 * - Deterministic mode
 * - Policy enforcement
 * - Provider health tracking
 * - Audit logging
 * - Error handling and fallback
 *
 * @module server/services/ai-gateway/__tests__/gateway.test.ts
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import {
  AIGateway,
  resetGateway,
  getGateway,
  GatewayPolicyError,
  GatewayNoProviderError,
  DEFAULT_MODELS,
} from '../gateway';
import { GatewayPolicyEngine } from '../policy';
import { GatewayAuditLogger } from '../audit';
import type { GatewayRequest, GatewayConfig, ModelConfig } from '../types';

// ─────────────────────────────────────────────────────────────────────────────
// Test Helpers
// ─────────────────────────────────────────────────────────────────────────────

function buildTestConfig(overrides?: Partial<GatewayConfig>): Partial<GatewayConfig> {
  return {
    deterministicMode: true, // Use deterministic mode for tests (no real API calls)
    defaultStrategy: 'task_based',
    auditEnabled: true,
    providers: [
      {
        name: 'openai',
        enabled: true,
        apiKey: 'test-openai-key',
        defaultModel: 'gpt-4o',
        models: [],
      },
      {
        name: 'anthropic',
        enabled: false,
        defaultModel: 'claude-3-5-sonnet-20241022',
        models: [],
      },
      {
        name: 'moonshot',
        enabled: false,
        defaultModel: 'moonshot-v1-32k',
        models: [],
      },
    ],
    policy: {
      maxTokensPerRequest: 16000,
      maxRequestsPerMinutePerOrg: 100,
      maxRequestsPerMinutePerUser: 30,
      blockedPatterns: [],
      contentFilters: true,
      piiDetection: false,
    },
    ...overrides,
  };
}

function buildTestRequest(overrides?: Partial<GatewayRequest>): GatewayRequest {
  return {
    taskType: 'chat',
    messages: [
      { role: 'system', content: 'You are a helpful assistant.' },
      { role: 'user', content: 'What is a 510k submission?' },
    ],
    ...overrides,
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// Test Suites
// ─────────────────────────────────────────────────────────────────────────────

describe('AIGateway', () => {
  let gateway: AIGateway;

  beforeEach(() => {
    resetGateway();
    gateway = new AIGateway(buildTestConfig());
  });

  afterEach(() => {
    resetGateway();
  });

  // ─── Initialization ─────────────────────────────────────────────────────

  describe('initialization', () => {
    it('should create a gateway instance', () => {
      expect(gateway).toBeDefined();
      expect(gateway).toBeInstanceOf(AIGateway);
    });

    it('should default to deterministic mode in test config', () => {
      expect(gateway.isDeterministic()).toBe(true);
    });

    it('should list enabled providers', () => {
      const providers = gateway.getEnabledProviders();
      expect(providers).toContain('openai');
      expect(providers).not.toContain('anthropic');
      expect(providers).not.toContain('moonshot');
    });
  });

  // ─── Singleton ──────────────────────────────────────────────────────────

  describe('singleton', () => {
    it('getGateway returns same instance', () => {
      resetGateway();
      const g1 = getGateway(buildTestConfig());
      const g2 = getGateway();
      expect(g1).toBe(g2);
    });

    it('resetGateway clears singleton', () => {
      const g1 = getGateway(buildTestConfig());
      resetGateway();
      const g2 = getGateway(buildTestConfig());
      expect(g1).not.toBe(g2);
    });
  });

  // ─── Deterministic Mode ─────────────────────────────────────────────────

  describe('deterministic mode', () => {
    it('should return deterministic response for chat', async () => {
      const response = await gateway.route(buildTestRequest());

      expect(response).toBeDefined();
      expect(response.deterministic).toBe(true);
      // The deterministic responder reports `provider: 'anthropic'`,
      // `model: 'demo-mode'` (see gateway.ts:1175-1176) — the test was
      // written against the older 'openai' / 'deterministic' shape.
      expect(response.provider).toBe('anthropic');
      expect(response.model).toBe('demo-mode');
      // Content includes the word 'demo' (DETERMINISTIC_RESPONSES) rather
      // than the literal 'deterministic'.
      expect(response.content).toMatch(/demo|deterministic/i);
      expect(response.usage.estimatedCostUsd).toBe(0);
      expect(response.requestId).toBeDefined();
    });

    /**
     * A streaming caller passes `stream: true` with an `onStream` callback and
     * renders ONLY what that callback delivers. Deterministic mode used to
     * return the content and never invoke it, so POST /api/ana-ri/stream
     * emitted run_started, three status events, orchestration, done and
     * post_done — and not one `text` event.
     *
     * Observed on a live server before the fix, not theorised: `done` carried
     * `outputTokens: 71` and `turn_status: "completed"` while the client
     * received no words at all. The transport declared success having
     * delivered nothing, useAnaChat rendered an empty assistant bubble with no
     * error, and AnA answered with silence. It is also the posture CI's
     * production boot smoke runs in, where /readyz reports
     * `anaState: "deterministic"` and passes readiness.
     */
    it('delivers the content through onStream when the caller is streaming', async () => {
      const chunks: string[] = [];

      const response = await gateway.route(
        buildTestRequest({
          taskType: 'chat',
          stream: true,
          onStream: (chunk: string) => { chunks.push(chunk); },
        }),
      );

      // The regression: this was 0, while `response.content` was populated and
      // usage reported a non-zero output-token count.
      expect(chunks.length).toBeGreaterThan(0);
      expect(chunks.join('')).toBe(response.content);
      expect(response.usage.outputTokens).toBeGreaterThan(0);
    });

    it('does not invoke onStream for a non-streaming caller', async () => {
      const onStream = vi.fn();

      await gateway.route(buildTestRequest({ taskType: 'chat', onStream }));

      // No `stream: true`, so the caller is collecting the whole response and
      // must not also receive it as deltas.
      expect(onStream).not.toHaveBeenCalled();
    });

    it('still returns a response when the caller\'s stream sink throws', async () => {
      // A client that disconnected mid-turn leaves a sink that throws. That
      // must not convert a fixture response into a failed request.
      const response = await gateway.route(
        buildTestRequest({
          taskType: 'chat',
          stream: true,
          onStream: () => { throw new Error('sink closed'); },
        }),
      );

      expect(response.content).toMatch(/demo|deterministic/i);
      expect(response.deterministic).toBe(true);
    });

    it('should return different responses for different task types', async () => {
      const chatResponse = await gateway.route(buildTestRequest({ taskType: 'chat' }));
      const docResponse = await gateway.route(buildTestRequest({ taskType: 'document_analysis' }));
      const regResponse = await gateway.route(buildTestRequest({ taskType: 'regulatory_review' }));

      expect(chatResponse.content).not.toBe(docResponse.content);
      expect(docResponse.content).not.toBe(regResponse.content);
      expect(docResponse.content).toContain('Document Analysis');
      expect(regResponse.content).toContain('Regulatory Review');
    });

    it('should toggle deterministic mode at runtime', () => {
      expect(gateway.isDeterministic()).toBe(true);
      gateway.setDeterministicMode(false);
      expect(gateway.isDeterministic()).toBe(false);
      gateway.setDeterministicMode(true);
      expect(gateway.isDeterministic()).toBe(true);
    });

    it('structured output in deterministic mode returns JSON', async () => {
      const response = await gateway.route(buildTestRequest({ taskType: 'structured_output' }));
      expect(response.content).toContain('"result"');
      const parsed = JSON.parse(response.content);
      // The deterministic JSON body uses 'demo_mode' as the result value
      // (see DETERMINISTIC_RESPONSES.structured_output in gateway.ts) —
      // the test was written when the value was 'deterministic'.
      expect(parsed.result).toBe('demo_mode');
    });
  });

  // ─── Helper Methods ─────────────────────────────────────────────────────

  describe('helper methods', () => {
    it('complete() wraps a single prompt', async () => {
      const result = await gateway.complete('What is regulatory?');
      expect(typeof result).toBe('string');
      expect(result.length).toBeGreaterThan(0);
    });

    it('chat() wraps system + user messages', async () => {
      const response = await gateway.chat('You are an expert.', 'What is a CER?');
      expect(response).toBeDefined();
      expect(response.content).toBeDefined();
      expect(response.deterministic).toBe(true);
    });

    it('structuredOutput() returns parsed JSON', async () => {
      const result = await gateway.structuredOutput<{ result: string }>('Return JSON');
      expect(result).toBeDefined();
      // Deterministic structured_output body value is 'demo_mode'.
      expect(result.result).toBe('demo_mode');
    });
  });

  // ─── Anthropic param construction (capability-driven) ────────────────────
  //
  // Reasoning-only models removed the sampling parameters
  // (temperature/top_p/top_k) and the manual
  // `thinking: {type:"enabled", budget_tokens}` shape — sending either returns
  // a 400. Which surface a model accepts is DECLARED on its registry entry
  // (`thinkingMode`, `supportsSamplingParams`), not inferred from its name: it
  // used to be read off a regex over the version string, so a model outside
  // that pattern silently got a surface it rejects, and bumping the registry
  // to a newer flagship — the move the registry's own comment calls sanctioned
  // — produced a 400.

  describe('anthropic sampling params', () => {
    const buildParams = (
      caps: Pick<ModelConfig, 'thinkingMode' | 'supportsSamplingParams'>,
      request: Partial<GatewayRequest>
    ): any => {
      const req = buildTestRequest(request);
      // Mirror executeAnthropic: max_tokens is set on params before the sampling
      // params are applied, so the legacy thinking-budget clamp can see it.
      const params: any = { max_tokens: req.maxTokens ?? 4096 };
      (gateway as any).applyAnthropicSamplingParams(
        params,
        { model: 'test-wire', provider: 'anthropic', ...caps },
        req
      );
      return params;
    };

    const ADAPTIVE = { thinkingMode: 'adaptive', supportsSamplingParams: false } as const;
    const LEGACY = { thinkingMode: 'budget', supportsSamplingParams: true } as const;

    // ── Anti-drift: the registry must say what every model accepts ─────────
    //
    // Replaces two tests that asserted a regex classified `claude-opus-4-7`
    // and friends correctly. Testing the regex tested the bug: the question
    // that matters is not "does the pattern match this name" but "does every
    // shipped entry declare its surface", which is what makes a model bump
    // safe.

    it('every registry entry declares the wire surface it accepts', () => {
      for (const m of DEFAULT_MODELS) {
        expect(['adaptive', 'budget', 'none'], `${m.id} thinkingMode`).toContain(m.thinkingMode);
        expect(typeof m.supportsSamplingParams, `${m.id} supportsSamplingParams`).toBe('boolean');
      }
    });

    it('no adaptive-thinking model also claims to accept sampling params', () => {
      // The two are mutually exclusive on the wire: a model that self-budgets
      // its thinking rejects temperature/top_p/top_k with a 400. An entry
      // claiming both would send a request that cannot succeed.
      for (const m of DEFAULT_MODELS) {
        if (m.thinkingMode === 'adaptive') {
          expect(m.supportsSamplingParams, `${m.id}`).toBe(false);
        }
      }
    });

    it('omits temperature for a model that rejects sampling (would 400)', () => {
      const params = buildParams(ADAPTIVE, { temperature: 0.5 });
      expect(params.temperature).toBeUndefined();
      expect(params.top_p).toBeUndefined();
      expect(params.top_k).toBeUndefined();
      expect(params.thinking).toBeUndefined();
    });

    // ── The provenance record must match what was SENT ──────────────────
    // The two cases above prove temperature is never transmitted to a
    // reasoning-only model. The audit ledger recorded it anyway —
    // `temperature: request.temperature ?? 0.7` — under a comment claiming to
    // describe "which params + prompt produced this output". So the Part 11
    // reproducibility record asserted a sampling parameter that never left the
    // process, and anyone replaying the call from that record would set 0.7
    // against a model that does no sampling. A provenance record that is
    // confidently wrong is worse than one that says "not applicable", because
    // only the first gets trusted.
    const auditedTemperature = async (
      provider: string,
      model: string,
      request: Partial<GatewayRequest>
    ): Promise<number | null | undefined> => {
      const logged: any[] = [];
      (gateway as any).config.auditEnabled = true;
      (gateway as any).auditLogger = { log: async (e: any) => { logged.push(e); } };
      await (gateway as any).logAudit(
        buildTestRequest(request),
        { requestId: 'r-1', provider, model, cached: false, deterministic: false,
          usage: { promptTokens: 1, completionTokens: 1, totalTokens: 2 } },
        'quality',
        true
      );
      return logged[0]?.temperature;
    };

    it('records NO temperature for a reasoning-only model — it was never sent', async () => {
      // undefined on the entry; GatewayAuditLogger coalesces to NULL in the
      // column (`entry.temperature ?? null`), so the stored provenance is
      // "not applicable" rather than a number nobody sent.
      const adaptive = DEFAULT_MODELS.find(m => m.thinkingMode === 'adaptive')!;
      expect(await auditedTemperature(adaptive.provider, adaptive.model, { temperature: 0.5 }))
        .toBeUndefined();
    });

    it('records the real temperature for a model that does accept sampling', async () => {
      const sampling = DEFAULT_MODELS.find(
        m => m.provider === 'anthropic' && m.supportsSamplingParams,
      )!;
      expect(await auditedTemperature(sampling.provider, sampling.model, { temperature: 0.5 }))
        .toBe(0.5);
    });

    it('records NO temperature for a model the registry does not know', async () => {
      // The ledger claims to describe what produced the output. For an
      // unrecognised model we cannot show a temperature was transmitted, and
      // by this section's own rule an unverifiable assertion is worse than
      // "not applicable" — only the confident one gets trusted.
      expect(await auditedTemperature('anthropic', 'some-unregistered-model', { temperature: 0.5 }))
        .toBeUndefined();
    });

    it('uses adaptive thinking (no budget_tokens) on an adaptive model', () => {
      const params = buildParams(ADAPTIVE, {
        thinking: { enabled: true, budgetTokens: 8000 },
      });
      expect(params.thinking).toEqual({ type: 'adaptive', display: 'summarized' });
      expect(params.temperature).toBeUndefined();
    });

    it('keeps the legacy temperature + budget_tokens surface on a budget model', () => {
      const plain = buildParams(LEGACY, { temperature: 0.3 });
      expect(plain.temperature).toBe(0.3);

      // Budget passes through unchanged when it fits under max_tokens.
      const thinking = buildParams(LEGACY, {
        maxTokens: 16000,
        thinking: { enabled: true, budgetTokens: 12000 },
      });
      expect(thinking.thinking).toEqual({ type: 'enabled', budget_tokens: 12000 });
      expect(thinking.temperature).toBe(1);
    });

    it('clamps the legacy budget_tokens below max_tokens (would 400 otherwise)', () => {
      // Anthropic requires budget_tokens < max_tokens (thinking shares the
      // output budget). A 12k budget on a 4k-max_tokens turn is clamped so
      // >=1024 tokens remain for the answer.
      const clamped = buildParams(LEGACY, {
        maxTokens: 4096,
        thinking: { enabled: true, budgetTokens: 12000 },
      });
      expect(clamped.thinking.type).toBe('enabled');
      expect(clamped.thinking.budget_tokens).toBe(3072);
      expect(clamped.thinking.budget_tokens).toBeLessThan(4096);
    });
  });

  // ─── Provider Health ────────────────────────────────────────────────────

  describe('provider health', () => {
    it('should return health status for enabled providers', () => {
      const health = gateway.getProviderHealth();
      expect(health.length).toBeGreaterThan(0);

      const openaiHealth = health.find(h => h.provider === 'openai');
      expect(openaiHealth).toBeDefined();
      expect(openaiHealth!.healthy).toBe(true);
      expect(openaiHealth!.consecutiveFailures).toBe(0);
    });
  });

  // ─── Request Context ────────────────────────────────────────────────────

  describe('request context', () => {
    it('should accept organization and user context', async () => {
      const response = await gateway.route(
        buildTestRequest({
          organizationId: 'org-123',
          userId: 'user-456',
          projectId: 'proj-789',
          callerModule: 'test-module',
          metadata: { testKey: 'testValue' },
        })
      );

      expect(response).toBeDefined();
      expect(response.requestId).toBeDefined();
    });
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Policy Engine Tests
// ─────────────────────────────────────────────────────────────────────────────

describe('GatewayPolicyEngine', () => {
  let policy: GatewayPolicyEngine;

  beforeEach(() => {
    policy = new GatewayPolicyEngine({
      maxTokensPerRequest: 4000,
      maxRequestsPerMinutePerOrg: 5,
      maxRequestsPerMinutePerUser: 3,
      blockedPatterns: ['password123', 'SECRET_KEY'],
      contentFilters: true,
      piiDetection: false,
    });
  });

  describe('token budget', () => {
    it('should allow requests within token budget', () => {
      const result = policy.evaluate(buildTestRequest({ maxTokens: 2000 }));
      expect(result.allowed).toBe(true);
    });

    it('should block requests exceeding token budget', () => {
      const result = policy.evaluate(buildTestRequest({ maxTokens: 10000 }));
      expect(result.allowed).toBe(false);
      expect(result.reason).toContain('maxTokens');
    });
  });

  describe('blocked patterns', () => {
    it('should block content matching blocked patterns', () => {
      const result = policy.evaluate(
        buildTestRequest({
          messages: [{ role: 'user', content: 'My password123 is here' }],
        })
      );
      expect(result.allowed).toBe(false);
      expect(result.reason).toContain('blocked pattern');
    });

    it('should allow clean content', () => {
      const result = policy.evaluate(
        buildTestRequest({
          messages: [{ role: 'user', content: 'What is a 510k submission?' }],
        })
      );
      expect(result.allowed).toBe(true);
    });
  });

  describe('rate limiting', () => {
    it('should allow requests within rate limit', () => {
      for (let i = 0; i < 5; i++) {
        const result = policy.evaluate(buildTestRequest({ organizationId: 'rate-test-org' }));
        expect(result.allowed).toBe(true);
      }
    });

    it('should block requests exceeding rate limit', () => {
      let lastResult;
      for (let i = 0; i < 10; i++) {
        lastResult = policy.evaluate(buildTestRequest({ organizationId: 'rate-test-org-2' }));
      }
      expect(lastResult!.allowed).toBe(false);
      // Reason text was changed from "Rate limit exceeded" to
      // "Organization rate limit exceeded" with the per-org rate limiter.
      expect(lastResult!.reason).toMatch(/rate limit/i);
    });
  });

  describe('configuration', () => {
    it('should return current config', () => {
      const config = policy.getConfig();
      expect(config.maxTokensPerRequest).toBe(4000);
      expect(config.blockedPatterns).toHaveLength(2);
    });

    it('should update config dynamically', () => {
      policy.updateConfig({ maxTokensPerRequest: 8000 });
      const config = policy.getConfig();
      expect(config.maxTokensPerRequest).toBe(8000);
    });
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Audit Logger Tests
// ─────────────────────────────────────────────────────────────────────────────

describe('GatewayAuditLogger', () => {
  let auditLogger: GatewayAuditLogger;

  beforeEach(() => {
    auditLogger = new GatewayAuditLogger(); // No DB pool — in-memory only
  });

  it('should log entries to buffer', async () => {
    await auditLogger.log({
      requestId: 'test-req-1',
      timestamp: new Date(),
      provider: 'openai',
      model: 'gpt-4o',
      taskType: 'chat',
      strategy: 'task_based',
      organizationId: 'org-1',
      userId: 'user-1',
      inputTokens: 100,
      outputTokens: 200,
      totalTokens: 300,
      estimatedCostUsd: 0.002,
      latencyMs: 500,
      success: true,
      cached: false,
      deterministic: false,
    });

    const entries = auditLogger.getRecentEntries();
    expect(entries).toHaveLength(1);
    expect(entries[0].requestId).toBe('test-req-1');
    expect(entries[0].provider).toBe('openai');
  });

  it('should compute aggregate stats', async () => {
    for (let i = 0; i < 5; i++) {
      await auditLogger.log({
        requestId: `test-req-${i}`,
        timestamp: new Date(),
        provider: i < 3 ? 'openai' : 'anthropic',
        model: i < 3 ? 'gpt-4o' : 'claude-3-5-sonnet',
        taskType: 'chat',
        strategy: 'task_based',
        inputTokens: 100,
        outputTokens: 200,
        totalTokens: 300,
        estimatedCostUsd: 0.001,
        latencyMs: 300 + i * 100,
        success: i !== 4,
        cached: false,
        deterministic: false,
      });
    }

    const stats = auditLogger.getStats();
    expect(stats.totalRequests).toBe(5);
    expect(stats.successCount).toBe(4);
    expect(stats.failureCount).toBe(1);
    expect(stats.totalTokens).toBe(1500);
    expect(stats.byProvider['openai']?.count).toBe(3);
    expect(stats.byProvider['anthropic']?.count).toBe(2);
    expect(stats.avgLatencyMs).toBeGreaterThan(0);
  });

  it('should limit buffer size', async () => {
    for (let i = 0; i < 150; i++) {
      await auditLogger.log({
        requestId: `test-req-${i}`,
        timestamp: new Date(),
        provider: 'openai',
        model: 'gpt-4o',
        taskType: 'chat',
        strategy: 'task_based',
        inputTokens: 10,
        outputTokens: 20,
        totalTokens: 30,
        estimatedCostUsd: 0.0001,
        latencyMs: 100,
        success: true,
        cached: false,
        deterministic: false,
      });
    }

    const entries = auditLogger.getRecentEntries(200);
    expect(entries.length).toBeLessThanOrEqual(100);
  });
});
