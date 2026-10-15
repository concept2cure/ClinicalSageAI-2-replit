import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { setImmediate } from 'node:timers';
import { AIGateway, GatewayAbortedError, resetGateway } from '../gateway';
import type { Semaphore } from '../concurrency';
import type { GatewayRequest, GatewayResponse, ModelConfig } from '../types';
import { runWithTenantScope } from '../../../db/tenantStore';

function deferred() {
  let resolve!: () => void;
  const promise = new Promise<void>(done => { resolve = done; });
  return { promise, resolve };
}

function observe<T>(promise: Promise<T>) {
  const state: { settled: boolean; error?: unknown } = { settled: false };
  const done = promise.then(
    () => { state.settled = true; },
    error => { state.settled = true; state.error = error; },
  );
  return { state, done };
}

interface GatewayProbe {
  outboundLimiter: Semaphore;
  dispatchProvider: (model: ModelConfig, request: GatewayRequest, id: string, start: number) => Promise<GatewayResponse>;
  recordFailure: (provider: string, error: unknown) => void;
  getFallbackModels: (...args: unknown[]) => ModelConfig[];
  auditLogger: { getRecentEntries: () => Array<{ success: boolean; callerModule?: string; organizationId?: number }> };
}

function liveGateway() {
  return new AIGateway({
    deterministicMode: false,
    auditEnabled: true,
    providers: [
      { name: 'anthropic', enabled: true, apiKey: 'not-used', defaultModel: 'claude-opus-5', models: [] },
      { name: 'openai', enabled: true, apiKey: 'not-used', defaultModel: 'gpt-4o', models: [] },
    ],
    policy: {
      maxTokensPerRequest: 128_000,
      maxRequestsPerMinutePerOrg: 10_000,
      maxRequestsPerMinutePerUser: 10_000,
      blockedPatterns: [],
      contentFilters: false,
      piiDetection: false,
    },
  });
}

function request(callerModule: string, extra: Partial<GatewayRequest> = {}): GatewayRequest {
  return { taskType: 'chat', messages: [{ role: 'user', content: 'What is a 510k submission?' }], callerModule, ...extra };
}

function response(model: ModelConfig, id: string): GatewayResponse {
  return {
    content: 'live answer', provider: model.provider, model: model.model,
    requestId: id, latencyMs: 1, cached: false, deterministic: false,
    usage: { inputTokens: 1, outputTokens: 1, totalTokens: 2, estimatedCostUsd: 0 },
  };
}

beforeEach(() => {
  vi.stubEnv('NODE_ENV', 'test');
  vi.stubEnv('AI_GATEWAY_MAX_CONCURRENCY', '1');
});

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllEnvs();
  resetGateway();
});

describe('real gateway route canceled while awaiting outbound capacity', () => {
  it.each(['default abort reason', 'custom abort reason'])('%s is terminal before dispatch', async reasonKind => {
    const gateway = liveGateway();
    const probe = gateway as unknown as GatewayProbe;
    const held = deferred();
    const started = deferred();
    const dispatched: string[] = [];
    // Only the outbound network call is replaced. Admission, placement,
    // policy, server-tool governance, limiter, retry and ledger stay real.
    const dispatch = vi.spyOn(probe, 'dispatchProvider').mockImplementation(async (model, input, id) => {
      dispatched.push(input.callerModule ?? 'missing');
      if (input.callerModule === 'test:active') { started.resolve(); await held.promise; }
      return response(model, id);
    });
    const limiterCalls = vi.spyOn(probe.outboundLimiter, 'run');
    const failures = vi.spyOn(probe, 'recordFailure');
    const fallbacks = vi.spyOn(probe, 'getFallbackModels');
    const first = gateway.route(request('test:active', { organizationId: 7 }));
    await started.promise;
    const healthBefore = gateway.getProviderHealth().map(health => ({ ...health }));
    const controller = new AbortController();
    const canceled = observe(runWithTenantScope(
      { tenantId: '7', role: null, source: 'request' },
      () => gateway.route(request('test:canceled', { signal: controller.signal })),
    ));
    let survivor: Promise<GatewayResponse> | undefined;
    try {
      await vi.waitFor(() => expect(limiterCalls).toHaveBeenCalledTimes(2));
      controller.abort(reasonKind === 'custom abort reason' ? new Error('run stopped') : undefined);
      await new Promise<void>(resolve => setImmediate(resolve));
      expect(canceled.state.settled, 'cancel waited for an unrelated active call').toBe(true);
      expect(canceled.state.error).toBeInstanceOf(GatewayAbortedError);
      expect(canceled.state.error).toMatchObject({ phase: 'pre_call' });
      expect(dispatched).toEqual(['test:active']);
      expect(dispatch).toHaveBeenCalledTimes(1);
      expect(failures).not.toHaveBeenCalled();
      expect(fallbacks).not.toHaveBeenCalled();
      expect(gateway.getProviderHealth()).toEqual(healthBefore);
      expect(probe.auditLogger.getRecentEntries()).toEqual([]);
      survivor = gateway.route(request('test:survivor', { organizationId: 8 }));
      await vi.waitFor(() => expect(limiterCalls).toHaveBeenCalledTimes(3));
    } finally {
      held.resolve();
      await Promise.all([first, canceled.done, survivor]);
    }
    expect(dispatched).toEqual(['test:active', 'test:survivor']);
    expect(failures).not.toHaveBeenCalled();
    expect(fallbacks).not.toHaveBeenCalled();
    const rows = probe.auditLogger.getRecentEntries();
    expect(rows).toHaveLength(2);
    expect(rows.every(row => row.success)).toBe(true);
    expect(rows.map(row => row.callerModule).sort()).toEqual(['test:active', 'test:survivor']);
    expect(rows.map(row => row.organizationId).sort()).toEqual([7, 8]);
  });
});
