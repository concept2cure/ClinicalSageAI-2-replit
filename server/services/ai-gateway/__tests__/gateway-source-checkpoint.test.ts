/** Real routing/placement/retry/capacity paths; only outbound provider I/O is replaced. */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { AIGateway, GatewayAbortedError, GatewayPolicyError, resetGateway } from '../gateway';
import type { GatewayRequest, GatewayResponse, ModelConfig } from '../types';
import type { Semaphore } from '../concurrency';

type GuardedRequest = GatewayRequest & { beforeDispatch?: () => Promise<void> };
interface GatewayProbe {
  outboundLimiter: Semaphore;
  dispatchProvider(model: ModelConfig, request: GatewayRequest, id: string, start: number): Promise<GatewayResponse>;
  recordFailure(provider: string, error: unknown): void;
  getFallbackModels(...args: unknown[]): ModelConfig[];
  applyOrgPlacementDefaults(request: GatewayRequest): Promise<GatewayRequest>;
}

function deferred() {
  let resolve!: () => void;
  let reject!: (error: unknown) => void;
  const promise = new Promise<void>((done, fail) => { resolve = done; reject = fail; });
  return { promise, resolve, reject };
}

function liveGateway() {
  const gateway = new AIGateway({
    deterministicMode: false,
    auditEnabled: false,
    providers: [
      { name: 'anthropic', enabled: true, apiKey: 'not-used', defaultModel: 'claude-opus-5', models: [] },
      { name: 'openai', enabled: true, apiKey: 'not-used', defaultModel: 'gpt-4o', models: [] },
    ],
    policy: {
      maxTokensPerRequest: 128_000,
      maxRequestsPerMinutePerOrg: 10_000,
      maxRequestsPerMinutePerUser: 10_000,
      blockedPatterns: [], contentFilters: false, piiDetection: false,
    },
  });
  const probe = gateway as unknown as GatewayProbe;
  const dispatch = vi.spyOn(probe, 'dispatchProvider').mockImplementation(async (model, _request, id) => ({
    content: 'Draft produced by the test network seam.', provider: model.provider, model: model.model,
    requestId: id, latencyMs: 1, cached: false, deterministic: false,
    usage: { inputTokens: 1, outputTokens: 1, totalTokens: 2, estimatedCostUsd: 0 },
  }));
  return { gateway, probe, dispatch };
}

function request(callerModule: string, extra: Partial<GuardedRequest> = {}): GuardedRequest {
  return { taskType: 'chat', messages: [{ role: 'user', content: 'Describe the document review workflow.' }], callerModule, ...extra };
}

beforeEach(() => {
  vi.stubEnv('NODE_ENV', 'test');
  vi.stubEnv('AI_GATEWAY_MAX_CONCURRENCY', '1');
});

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllEnvs();
  vi.useRealTimers();
  resetGateway();
});

describe('gateway current-source dispatch checkpoint', () => {
  it('leaves ordinary no-source calls on the existing path', async () => {
    const { gateway, dispatch } = liveGateway();
    const result = await gateway.route(request('test:ordinary'));
    expect(result.content).toContain('test network seam');
    expect(dispatch).toHaveBeenCalledTimes(1);
  });

  it('runs the guard after capacity is granted, refuses queued revocation, and releases the permit', async () => {
    const { gateway, probe, dispatch } = liveGateway();
    const active = deferred();
    const entered = deferred();
    const originalDispatch = dispatch.getMockImplementation()!;
    dispatch.mockImplementation(async (...args) => {
      if (args[1].callerModule === 'test:active') { entered.resolve(); await active.promise; }
      return originalDispatch(...args);
    });
    const limiter = vi.spyOn(probe.outboundLimiter, 'run');
    const failures = vi.spyOn(probe, 'recordFailure');
    const fallbacks = vi.spyOn(probe, 'getFallbackModels');
    const first = gateway.route(request('test:active'));
    await entered.promise;
    let current = true;
    const guard = vi.fn(async () => { if (!current) throw new Error('private withdrawal SQL details'); });
    const denied = gateway.route(request('test:queued', { beforeDispatch: guard })).catch(error => error);
    const survivor = gateway.route(request('test:survivor'));
    try {
      await vi.waitFor(() => expect(limiter).toHaveBeenCalledTimes(3));
      expect(guard).not.toHaveBeenCalled();
      expect(dispatch).toHaveBeenCalledTimes(1);
      current = false;
    } finally {
      active.resolve();
    }
    const [, refusal, result] = await Promise.all([first, denied, survivor]);
    expect(refusal).toBeInstanceOf(GatewayPolicyError);
    expect(String(refusal)).not.toContain('private withdrawal SQL');
    expect(result.content).toContain('test network seam');
    expect(guard).toHaveBeenCalledTimes(1);
    expect(dispatch.mock.calls.map(([, input]) => input.callerModule)).toEqual(['test:active', 'test:survivor']);
    expect(failures).not.toHaveBeenCalled();
    expect(fallbacks).not.toHaveBeenCalled();
  });

  it('captures the original guard before the first route await', async () => {
    const { gateway, dispatch } = liveGateway();
    const original = vi.fn(async () => { throw new Error('original source was revoked'); });
    const replacement = vi.fn(async () => {});
    const input = request('test:capture', { beforeDispatch: original });
    const outcome = gateway.route(input).catch(error => error);
    input.beforeDispatch = replacement;
    expect(await outcome).toBeInstanceOf(GatewayPolicyError);
    expect(original).toHaveBeenCalledTimes(1);
    expect(replacement).not.toHaveBeenCalled();
    expect(dispatch).not.toHaveBeenCalled();
  });

  it.each(['synchronous', 'asynchronous'])('makes a %s guard refusal terminal and safe without provider-health accounting', async kind => {
    const { gateway, probe, dispatch } = liveGateway();
    const failures = vi.spyOn(probe, 'recordFailure');
    const fallbacks = vi.spyOn(probe, 'getFallbackModels');
    const before = gateway.getProviderHealth().map(row => ({ ...row }));
    const privateMessage = 'private-source-SQL-and-access-detail';
    const guard = kind === 'synchronous'
      ? () => { throw new Error(privateMessage); }
      : async () => { throw new Error(privateMessage); };
    const error = await gateway.route(request('test:refusal', { beforeDispatch: guard })).catch(reason => reason);
    expect(error).toBeInstanceOf(GatewayPolicyError);
    expect(error).toMatchObject({ code: 'SOURCE_CONTEXT_UNAVAILABLE' });
    expect(error.message).toMatch(/source/i);
    expect(JSON.stringify({ message: error.message, cause: error.cause })).not.toContain(privateMessage);
    expect(dispatch).not.toHaveBeenCalled();
    expect(failures).not.toHaveBeenCalled();
    expect(fallbacks).not.toHaveBeenCalled();
    expect(gateway.getProviderHealth()).toEqual(before);
  });

});

describe('gateway guard validation and repeated dispatch', () => {
  it.each([null, 'pretend guard', 7, {}])('rejects malformed callback %j before placement or dispatch', async value => {
    const { gateway, probe, dispatch } = liveGateway();
    const placement = vi.spyOn(probe, 'applyOrgPlacementDefaults');
    const input = { ...request('test:malformed'), beforeDispatch: value } as unknown as GatewayRequest;
    const error = await gateway.route(input).catch(reason => reason);
    expect(error).toBeInstanceOf(GatewayPolicyError);
    expect(error).toMatchObject({ code: 'SOURCE_CONTEXT_UNAVAILABLE' });
    expect(placement).not.toHaveBeenCalled();
    expect(dispatch).not.toHaveBeenCalled();
  });

  it('sanitizes a callback getter failure before any await', async () => {
    const { gateway, probe, dispatch } = liveGateway();
    const placement = vi.spyOn(probe, 'applyOrgPlacementDefaults');
    const input = request('test:throwing-getter');
    Object.defineProperty(input, 'beforeDispatch', { get: () => { throw new Error('private callback getter'); } });
    const error = await gateway.route(input).catch(reason => reason);
    expect(error).toBeInstanceOf(GatewayPolicyError);
    expect(error).toMatchObject({ code: 'SOURCE_CONTEXT_UNAVAILABLE' });
    expect(error.message).not.toContain('private callback getter');
    expect(placement).not.toHaveBeenCalled();
    expect(dispatch).not.toHaveBeenCalled();
  });

});

describe('gateway repeated source checks and cancellation', () => {
  it('rechecks before a primary retry and never dispatches revoked retry work', async () => {
    vi.useFakeTimers();
    const { gateway, probe, dispatch } = liveGateway();
    const failures = vi.spyOn(probe, 'recordFailure');
    const fallbacks = vi.spyOn(probe, 'getFallbackModels');
    const guard = vi.fn().mockResolvedValueOnce(undefined).mockRejectedValue(new Error('revoked during retry backoff'));
    dispatch.mockRejectedValue(Object.assign(new Error('provider transient'), { status: 500 }));
    const outcome = gateway.route(request('test:primary-retry', { beforeDispatch: guard })).catch(error => error);
    await vi.advanceTimersByTimeAsync(5_000);
    expect(await outcome).toBeInstanceOf(GatewayPolicyError);
    expect(guard).toHaveBeenCalledTimes(2);
    expect(dispatch).toHaveBeenCalledTimes(1);
    expect(failures).not.toHaveBeenCalled();
    expect(fallbacks).not.toHaveBeenCalled();
  });

  it('uses the captured guard on fallback even if the caller replaces the callback', async () => {
    const { gateway, probe, dispatch } = liveGateway();
    const failures = vi.spyOn(probe, 'recordFailure');
    const fallbacks = vi.spyOn(probe, 'getFallbackModels');
    const guard = vi.fn().mockResolvedValueOnce(undefined).mockRejectedValue(new Error('revoked before fallback'));
    const replacement = vi.fn(async () => {});
    const input = request('test:fallback', { provider: 'openai', beforeDispatch: guard });
    const primaryError = Object.assign(new Error('primary request shape unavailable'), { status: 400 });
    dispatch.mockImplementation(async () => { input.beforeDispatch = replacement; throw primaryError; });
    expect(await gateway.route(input).catch(error => error)).toBeInstanceOf(GatewayPolicyError);
    expect(guard).toHaveBeenCalledTimes(2);
    expect(replacement).not.toHaveBeenCalled();
    expect(dispatch).toHaveBeenCalledTimes(1);
    expect(fallbacks).toHaveBeenCalledTimes(1);
    expect(failures).toHaveBeenCalledTimes(1);
    expect(failures.mock.calls[0][1]).toBe(primaryError);
  });

  it('also rechecks before retrying a fallback provider', async () => {
    vi.useFakeTimers();
    const { gateway, probe, dispatch } = liveGateway();
    const failures = vi.spyOn(probe, 'recordFailure');
    const guard = vi.fn().mockResolvedValueOnce(undefined).mockResolvedValueOnce(undefined)
      .mockRejectedValue(new Error('revoked during fallback backoff'));
    const primaryError = Object.assign(new Error('primary request shape unavailable'), { status: 400 });
    dispatch.mockRejectedValueOnce(primaryError).mockRejectedValue(Object.assign(new Error('fallback transient'), { status: 500 }));
    const outcome = gateway.route(request('test:fallback-retry', { provider: 'openai', beforeDispatch: guard })).catch(error => error);
    await vi.advanceTimersByTimeAsync(5_000);
    expect(await outcome).toBeInstanceOf(GatewayPolicyError);
    expect(guard).toHaveBeenCalledTimes(3);
    expect(dispatch).toHaveBeenCalledTimes(2);
    expect(failures).toHaveBeenCalledTimes(1);
    expect(failures.mock.calls[0][1]).toBe(primaryError);
  });

  it('preserves a transient retry when the source remains current', async () => {
    vi.useFakeTimers();
    const { gateway, dispatch } = liveGateway();
    const success = dispatch.getMockImplementation()!;
    dispatch.mockRejectedValueOnce(Object.assign(new Error('transient'), { status: 500 })).mockImplementation(success);
    const guard = vi.fn(async () => {});
    const outcome = gateway.route(request('test:current-retry', { beforeDispatch: guard }));
    await vi.advanceTimersByTimeAsync(5_000);
    expect((await outcome).content).toContain('test network seam');
    expect(guard).toHaveBeenCalledTimes(2);
    expect(dispatch).toHaveBeenCalledTimes(2);
  });

  it.each(['resolve', 'reject'])('honors cancellation during a guard wait (%s), releases capacity and never dispatches canceled work', async settlement => {
    const { gateway, probe, dispatch } = liveGateway();
    const entered = deferred();
    const held = deferred();
    const failures = vi.spyOn(probe, 'recordFailure');
    const fallbacks = vi.spyOn(probe, 'getFallbackModels');
    const controller = new AbortController();
    const guard = vi.fn(async () => { entered.resolve(); await held.promise; });
    const outcome = gateway.route(request('test:canceled-guard', { beforeDispatch: guard, signal: controller.signal })).catch(error => error);
    await entered.promise;
    const survivor = gateway.route(request('test:after-cancel'));
    controller.abort(new Error('private cancellation reason'));
    if (settlement === 'reject') held.reject(new Error('private guard failure'));
    else held.resolve();
    const error = await outcome;
    expect(error).toBeInstanceOf(GatewayAbortedError);
    expect(error).toMatchObject({ phase: 'pre_call' });
    expect((await survivor).content).toContain('test network seam');
    expect(dispatch.mock.calls.map(([, input]) => input.callerModule)).toEqual(['test:after-cancel']);
    expect(failures).not.toHaveBeenCalled();
    expect(fallbacks).not.toHaveBeenCalled();
  });
});
