/**
 * Multi-Agent Council — gateway integration tests
 *
 * Guards the migration of the council's LLM path off the legacy
 * MultiProviderLLMService onto the governed AI gateway. These lock in the
 * contract of executeLLMWithFailover():
 *   - delegates to gateway.route() and maps GatewayResponse → CouncilLLMResult
 *   - routes JSON agents as 'structured_output' and prose agents as
 *     'document_drafting' (with jsonMode set accordingly)
 *   - honors graceful-degradation gating (SERVICE_DEGRADED)
 *   - converts a gateway failure into a recoverable CouncilError and audits it
 *   - prepends the client/project intelligence prefix to the system turn
 *
 * @module server/services/__tests__/multi-agent-council.test.ts
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';

// Shared mock handles (hoisted so the vi.mock factories can close over them).
const h = vi.hoisted(() => ({
  route: vi.fn(),
  isFeatureAvailable: vi.fn(() => true),
  auditLog: vi.fn(),
  intelligencePrefix: vi.fn(),
  analyze: vi.fn(),
}));

vi.mock('../ai-gateway/gateway.js', () => ({
  getGateway: () => ({ route: h.route }),
}));
vi.mock('../../lib/graceful-degradation', () => ({
  getGracefulDegradationService: () => ({ isFeatureAvailable: h.isFeatureAvailable }),
}));
vi.mock('../../lib/tamper-proof-audit', () => ({
  getTamperProofAuditLog: () => ({ log: h.auditLog }),
}));
vi.mock('../../lib/prompt-injection-protection', () => ({
  getPromptInjectionProtection: () => ({ analyze: h.analyze }),
  PromptInjectionError: class PromptInjectionError extends Error {},
}));
vi.mock('../lumen-context-builder.js', () => ({
  getIntelligencePrefix: h.intelligencePrefix,
}));

import { MultiAgentCouncilService } from '../multi-agent-council';

const VALID_RESPONSE = {
  content: 'hello world',
  provider: 'anthropic' as const,
  model: 'claude-opus-4-7',
  usage: { inputTokens: 10, outputTokens: 20, totalTokens: 30, estimatedCostUsd: 0 },
  latencyMs: 123,
  requestId: 'req-1',
  cached: false,
  deterministic: false,
};

const MESSAGES = [
  { role: 'system' as const, content: 'You are a regulatory drafter.' },
  { role: 'user' as const, content: 'Draft section X.' },
];

describe('MultiAgentCouncilService — gateway integration', () => {
  let svc: MultiAgentCouncilService;

  beforeEach(() => {
    vi.clearAllMocks();
    h.isFeatureAvailable.mockReturnValue(true);
    h.intelligencePrefix.mockResolvedValue('');
    h.analyze.mockImplementation((s: string) => ({
      detected: [],
      blocked: false,
      sanitized: s,
      riskScore: 0,
    }));
    h.auditLog.mockResolvedValue(undefined);
    h.route.mockResolvedValue(VALID_RESPONSE);
    svc = new MultiAgentCouncilService({} as any);
  });

  const call = (operation: string, options?: Record<string, unknown>) =>
    (svc as any).executeLLMWithFailover(operation, [...MESSAGES], 'corr-1', options);

  it('delegates to the gateway and maps the response to CouncilLLMResult', async () => {
    const result = await call('DRAFTER');

    expect(h.route).toHaveBeenCalledTimes(1);
    expect(result).toEqual({
      content: 'hello world',
      provider: 'anthropic',
      model: 'claude-opus-4-7',
      fallbackUsed: false,
      latencyMs: 123,
      tokensUsed: { prompt: 10, completion: 20, total: 30 },
    });
  });

  it('routes prose agents as document_drafting (jsonMode off)', async () => {
    await call('DRAFTER');
    expect(h.route).toHaveBeenCalledWith(
      expect.objectContaining({
        taskType: 'document_drafting',
        jsonMode: false,
        callerModule: 'multi-agent-council',
      })
    );
  });

  it('routes JSON agents as structured_output (jsonMode on)', async () => {
    await call('CRITIC', { responseFormat: 'json' });
    expect(h.route).toHaveBeenCalledWith(
      expect.objectContaining({ taskType: 'structured_output', jsonMode: true })
    );
  });

  it('threads correlationId + operation into the gateway audit metadata', async () => {
    await call('STATISTICIAN', { responseFormat: 'json' });
    expect(h.route).toHaveBeenCalledWith(
      expect.objectContaining({
        metadata: { operation: 'STATISTICIAN', correlationId: 'corr-1' },
      })
    );
  });

  it('throws SERVICE_DEGRADED (without calling the gateway) when the feature is gated off', async () => {
    h.isFeatureAvailable.mockReturnValue(false);
    await expect(call('DRAFTER')).rejects.toMatchObject({ code: 'SERVICE_DEGRADED' });
    expect(h.route).not.toHaveBeenCalled();
  });

  it('converts a gateway failure into a recoverable CouncilError and audits it', async () => {
    h.route.mockRejectedValueOnce(new Error('all providers down'));
    await expect(call('SYNTHESIZER')).rejects.toMatchObject({
      code: 'ALL_PROVIDERS_UNAVAILABLE',
      recoverable: true,
    });
    expect(h.auditLog).toHaveBeenCalledWith(
      'CIRCUIT_BREAKER_OPENED',
      expect.stringContaining('SYNTHESIZER'),
      expect.objectContaining({ operation: 'SYNTHESIZER' }),
      expect.objectContaining({ correlationId: 'corr-1' })
    );
  });

  it('prepends the intelligence prefix to the system turn when org/project context is present', async () => {
    h.intelligencePrefix.mockResolvedValue('CLIENT-CONTEXT::');
    await call('DRAFTER', { organizationId: 42 });

    const calls = h.route.mock.calls;
    const sentMessages = calls[calls.length - 1][0].messages;
    expect(sentMessages[0]).toEqual({
      role: 'system',
      content: 'CLIENT-CONTEXT::You are a regulatory drafter.',
    });
    // Non-system turns are untouched.
    expect(sentMessages[1]).toEqual({ role: 'user', content: 'Draft section X.' });
  });

  it('does not fetch an intelligence prefix when no org/project context is given', async () => {
    await call('DRAFTER');
    expect(h.intelligencePrefix).not.toHaveBeenCalled();
  });
});
