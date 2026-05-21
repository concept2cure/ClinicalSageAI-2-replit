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
} from '../gateway';
import { GatewayPolicyEngine } from '../policy';
import { GatewayAuditLogger } from '../audit';
import type { GatewayRequest, GatewayResponse, GatewayConfig } from '../types';

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
