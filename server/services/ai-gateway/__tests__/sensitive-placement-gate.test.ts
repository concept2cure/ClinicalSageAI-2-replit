/**
 * Last-mile sensitive-dispatch gate — configuration failure + audit-mode signal.
 *
 * Two guards proven here:
 *  1. A malformed AI_PROVIDER_PLACEMENT_APPROVALS value under enforcement is a
 *     TERMINAL GatewayPolicyError — never retried, never walked down the
 *     fallback chain as if every provider were down. A config error must not
 *     be misreported as an all-provider outage.
 *  2. Non-production audit mode records a content-free structured warning when
 *     PHI/PII heads to a provider (the signal audit mode exists for), while
 *     still never blocking.
 *  3. ONE env contract governs runtime enforcement: the gate enforces in
 *     production always, and in ANY environment that sets
 *     AI_SENSITIVE_DATA_POLICY_MODE=enforce or AI_PII_ENFORCEMENT=block. A
 *     staging deployment that declares the policy mode the production boot
 *     assert requires gets real dispatch-time enforcement, not silent audit.
 *
 * Production enforcement behavior is pinned by
 * sensitive-placement-integration.test.ts; the pure decision table by
 * sensitive-placement-policy.test.ts.
 */

import { afterEach, describe, expect, it, vi } from 'vitest';

const logSpies = vi.hoisted(() => ({
  info: vi.fn(),
  warn: vi.fn(),
  error: vi.fn(),
  debug: vi.fn(),
}));

vi.mock('../../../utils/logger', () => ({
  createScopedLogger: () => logSpies,
  createContextLogger: () => logSpies,
  logger: logSpies,
  default: logSpies,
}));

import { AIGateway, GatewayPolicyError } from '../gateway';

const PII_TEXT = 'Patient email is patient@example.com';

function buildGateway() {
  return new AIGateway({
    deterministicMode: false,
    auditEnabled: false,
    providers: [
      { name: 'openai', enabled: true, apiKey: 'not-used', defaultModel: 'gpt-4o', models: [] },
    ],
    policy: {
      maxTokensPerRequest: 16000,
      maxRequestsPerMinutePerOrg: 100,
      maxRequestsPerMinutePerUser: 30,
      blockedPatterns: [],
      contentFilters: true,
      piiDetection: true,
    },
  });
}

const FAKE_RESPONSE = {
  content: 'ok',
  provider: 'openai',
  model: 'gpt-4o',
  requestId: 'fake',
  latencyMs: 1,
  cached: false,
  usage: { promptTokens: 1, completionTokens: 1, totalTokens: 2, estimatedCostUsd: 0 },
};

function screenWarnCalls() {
  return logSpies.warn.mock.calls.filter(
    ([message]) => message === '[ai-gateway] sensitive-data screen'
  );
}

describe('last-mile sensitive-dispatch gate', () => {
  const saved = { ...process.env };
  afterEach(() => {
    process.env = { ...saved };
    vi.restoreAllMocks();
    logSpies.info.mockClear();
    logSpies.warn.mockClear();
    logSpies.error.mockClear();
    logSpies.debug.mockClear();
  });

  it('malformed placement approvals under enforcement is a terminal policy error, not a retried outage', async () => {
    process.env.NODE_ENV = 'development';
    process.env.AI_PII_ENFORCEMENT = 'block';
    process.env.AI_PROVIDER_PLACEMENT_APPROVALS = '{not valid json';
    const gateway = buildGateway();
    const executeProvider = vi.spyOn(gateway as any, 'executeProvider');
    const dispatchProvider = vi.spyOn(gateway as any, 'dispatchProvider');

    await expect(
      gateway.route({
        taskType: 'chat',
        messages: [{ role: 'user', content: PII_TEXT }],
      })
    ).rejects.toMatchObject({
      name: GatewayPolicyError.name,
      message: expect.stringContaining('AI_PROVIDER_PLACEMENT_APPROVALS'),
    });

    // Terminal means terminal: one attempt, no retry, no fallback chain walk,
    // and no provider SDK ever invoked.
    expect(executeProvider).toHaveBeenCalledTimes(1);
    expect(dispatchProvider).not.toHaveBeenCalled();
  });

  it('audit mode records a content-free structured warning for PII-bound dispatch without blocking', async () => {
    process.env.NODE_ENV = 'development';
    delete process.env.AI_PII_ENFORCEMENT; // default: audit
    delete process.env.AI_SENSITIVE_DATA_POLICY_MODE;
    delete process.env.AI_PROVIDER_PLACEMENT_APPROVALS;
    const gateway = buildGateway();
    const dispatchProvider = vi
      .spyOn(gateway as any, 'dispatchProvider')
      .mockResolvedValue(FAKE_RESPONSE);

    const response = await gateway.route({
      taskType: 'chat',
      messages: [{ role: 'user', content: PII_TEXT }],
    });

    expect(response.content).toBe('ok');
    expect(dispatchProvider).toHaveBeenCalledTimes(1);

    const calls = screenWarnCalls();
    expect(calls.length).toBeGreaterThanOrEqual(1);
    const [, payload] = calls[0];
    expect(payload).toMatchObject({
      classes: ['pii'],
      provider: 'openai',
      zeroRetentionApproved: false,
      reasonCode: 'DENY_UNKNOWN_PROVIDER',
      enforcement: 'audit',
    });
    // Content-free: the structured signal never carries message content.
    expect(JSON.stringify(calls)).not.toContain('patient@example.com');
  });

  it('audit mode survives malformed approvals: records the config failure, still never blocks', async () => {
    process.env.NODE_ENV = 'development';
    process.env.AI_PII_ENFORCEMENT = 'audit';
    delete process.env.AI_SENSITIVE_DATA_POLICY_MODE;
    process.env.AI_PROVIDER_PLACEMENT_APPROVALS = '{not valid json';
    const gateway = buildGateway();
    const dispatchProvider = vi
      .spyOn(gateway as any, 'dispatchProvider')
      .mockResolvedValue(FAKE_RESPONSE);

    await expect(
      gateway.route({
        taskType: 'chat',
        messages: [{ role: 'user', content: PII_TEXT }],
      })
    ).resolves.toMatchObject({ content: 'ok' });
    expect(dispatchProvider).toHaveBeenCalledTimes(1);

    const configWarns = logSpies.warn.mock.calls.filter(
      ([message]) =>
        typeof message === 'string' && message.includes('AI_PROVIDER_PLACEMENT_APPROVALS')
    );
    expect(configWarns.length).toBeGreaterThanOrEqual(1);
    // The screen signal is still recorded against an empty approval set.
    const calls = screenWarnCalls();
    expect(calls.length).toBeGreaterThanOrEqual(1);
    expect(calls[0][1]).toMatchObject({ reasonCode: 'DENY_UNKNOWN_PROVIDER' });
  });

  it('audit mode stays silent for non-sensitive content', async () => {
    process.env.NODE_ENV = 'development';
    delete process.env.AI_PII_ENFORCEMENT; // default: audit
    delete process.env.AI_SENSITIVE_DATA_POLICY_MODE;
    delete process.env.AI_PROVIDER_PLACEMENT_APPROVALS;
    const gateway = buildGateway();
    const dispatchProvider = vi
      .spyOn(gateway as any, 'dispatchProvider')
      .mockResolvedValue(FAKE_RESPONSE);

    await expect(
      gateway.route({
        taskType: 'chat',
        messages: [{ role: 'user', content: 'Summarize the module workflow in three sentences.' }],
      })
    ).resolves.toMatchObject({ content: 'ok' });
    expect(dispatchProvider).toHaveBeenCalledTimes(1);
    expect(screenWarnCalls()).toHaveLength(0);
  });

  it('staging with AI_SENSITIVE_DATA_POLICY_MODE=enforce blocks an unapproved sensitive dispatch', async () => {
    process.env.NODE_ENV = 'staging';
    process.env.AI_SENSITIVE_DATA_POLICY_MODE = 'enforce';
    delete process.env.AI_PII_ENFORCEMENT; // enforcement must come from the policy mode alone
    delete process.env.AI_PROVIDER_PLACEMENT_APPROVALS; // no approvals -> unapproved provider
    const gateway = buildGateway();
    const dispatchProvider = vi.spyOn(gateway as any, 'dispatchProvider');

    await expect(
      gateway.route({
        taskType: 'chat',
        messages: [{ role: 'user', content: PII_TEXT }],
      })
    ).rejects.toMatchObject({
      name: GatewayPolicyError.name,
      message: expect.stringContaining('DENY_UNKNOWN_PROVIDER'),
    });
    // Enforced means enforced: no provider SDK path is ever reached.
    expect(dispatchProvider).not.toHaveBeenCalled();
  });

  it('staging without AI_SENSITIVE_DATA_POLICY_MODE=enforce or AI_PII_ENFORCEMENT=block stays audit-mode: records, never blocks', async () => {
    process.env.NODE_ENV = 'staging';
    delete process.env.AI_SENSITIVE_DATA_POLICY_MODE;
    delete process.env.AI_PII_ENFORCEMENT; // default: audit
    delete process.env.AI_PROVIDER_PLACEMENT_APPROVALS;
    const gateway = buildGateway();
    const dispatchProvider = vi
      .spyOn(gateway as any, 'dispatchProvider')
      .mockResolvedValue(FAKE_RESPONSE);

    await expect(
      gateway.route({
        taskType: 'chat',
        messages: [{ role: 'user', content: PII_TEXT }],
      })
    ).resolves.toMatchObject({ content: 'ok' });
    expect(dispatchProvider).toHaveBeenCalledTimes(1);

    const calls = screenWarnCalls();
    expect(calls.length).toBeGreaterThanOrEqual(1);
    expect(calls[0][1]).toMatchObject({
      reasonCode: 'DENY_UNKNOWN_PROVIDER',
      enforcement: 'audit',
    });
  });

  it('production enforcement is unchanged: blocks without either opt-in variable set', async () => {
    process.env.NODE_ENV = 'production';
    delete process.env.AI_SENSITIVE_DATA_POLICY_MODE;
    delete process.env.AI_PII_ENFORCEMENT;
    delete process.env.AI_PROVIDER_PLACEMENT_APPROVALS;
    const gateway = buildGateway();
    const dispatchProvider = vi.spyOn(gateway as any, 'dispatchProvider');

    await expect(
      gateway.route({
        taskType: 'chat',
        messages: [{ role: 'user', content: PII_TEXT }],
      })
    ).rejects.toMatchObject({
      name: GatewayPolicyError.name,
      message: expect.stringContaining('DENY_UNKNOWN_PROVIDER'),
    });
    expect(dispatchProvider).not.toHaveBeenCalled();
  });
});
