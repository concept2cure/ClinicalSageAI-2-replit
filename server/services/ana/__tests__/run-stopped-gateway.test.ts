/**
 * DT3 test 9 (AnA detach §2.4, G-11): the reason a run's owner is aborted
 * with is an Error named AbortError (RunStopped), never a string — and through
 * the real gateway, with a stand-in provider, a stop mid-call and a stop while
 * queued for an outbound permit each come out as GatewayAbortedError, with no
 * failover, no retry on another model and no mark against the provider's
 * health. A string reason would have reached Semaphore.acquire's
 * `reject(signal.reason)` as a non-Error.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { AIGateway, GatewayAbortedError, resetGateway } from '../../ai-gateway/gateway';
import type { Semaphore } from '../../ai-gateway/concurrency';
import type { GatewayRequest, GatewayResponse, ModelConfig } from '../../ai-gateway/types';
import { runWithTenantScope } from '../../../db/tenantStore';
import { RunStopped, runStopReasonOf } from '../run-stopped.js';

interface GatewayProbe {
  outboundLimiter: Semaphore;
  dispatchProvider: (model: ModelConfig, request: GatewayRequest, id: string, start: number) => Promise<GatewayResponse>;
  recordFailure: (provider: string, error: unknown) => void;
  getFallbackModels: (...args: unknown[]) => ModelConfig[];
}

function liveGateway() {
  return new AIGateway({
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
      blockedPatterns: [],
      contentFilters: false,
      piiDetection: false,
    },
  });
}

const request = (callerModule: string, signal?: AbortSignal): GatewayRequest => ({
  taskType: 'chat',
  messages: [{ role: 'user', content: 'Summarise the stability data.' }],
  callerModule,
  organizationId: 7,
  ...(signal ? { signal } : {}),
});

const response = (model: ModelConfig, id: string): GatewayResponse => ({
  content: 'answer', provider: model.provider, model: model.model, requestId: id, latencyMs: 1,
  cached: false, deterministic: false, usage: { inputTokens: 1, outputTokens: 1, totalTokens: 2, estimatedCostUsd: 0 },
});

const scoped = <T>(fn: () => Promise<T>) => runWithTenantScope({ tenantId: '7', role: null, source: 'request' }, fn);

beforeEach(() => {
  vi.stubEnv('NODE_ENV', 'test');
  vi.stubEnv('AI_GATEWAY_MAX_CONCURRENCY', '1');
});
afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllEnvs();
  resetGateway();
});

describe('RunStopped', () => {
  it('is an Error named AbortError, and carries the row reason', () => {
    const r = new RunStopped('server_shutdown');
    expect(r).toBeInstanceOf(Error);
    expect(r.name).toBe('AbortError');
    const ctl = new AbortController();
    ctl.abort(r);
    expect(runStopReasonOf(ctl.signal)).toBe('server_shutdown');
    const plain = new AbortController();
    plain.abort();
    expect(runStopReasonOf(plain.signal)).toBeNull();
  });
});

describe('a run stopped through the real gateway, with a stand-in provider', () => {
  it('mid-call: GatewayAbortedError(in_flight), no fallback, no retry, no failure recorded', async () => {
    const gateway = liveGateway();
    const probe = gateway as unknown as GatewayProbe;
    let started!: () => void;
    const inFlight = new Promise<void>(resolve => { started = resolve; });
    const dispatch = vi.spyOn(probe, 'dispatchProvider').mockImplementation(async (_model, input) => {
      started();
      // A provider aborted mid-generation throws what the signal carries.
      await new Promise<never>((_resolve, reject) => {
        input.signal?.addEventListener('abort', () => reject(input.signal?.reason), { once: true });
      });
      throw new Error('unreachable');
    });
    const failures = vi.spyOn(probe, 'recordFailure');
    const fallbacks = vi.spyOn(probe, 'getFallbackModels');
    const ctl = new AbortController();
    const call = scoped(() => gateway.route(request('ana-ri:stream', ctl.signal))).catch((e: unknown) => e);
    await inFlight;
    ctl.abort(new RunStopped('server_shutdown'));
    const error = await call;
    expect(error).toBeInstanceOf(GatewayAbortedError);
    expect(error).toMatchObject({ phase: 'in_flight' });
    expect(dispatch).toHaveBeenCalledTimes(1);
    expect(failures).not.toHaveBeenCalled();
    expect(fallbacks).not.toHaveBeenCalled();
  });

  it('queued for a permit: GatewayAbortedError(pre_call), never dispatched, no fallback', async () => {
    const gateway = liveGateway();
    const probe = gateway as unknown as GatewayProbe;
    let releaseHeld!: () => void;
    const held = new Promise<void>(resolve => { releaseHeld = resolve; });
    let started!: () => void;
    const holding = new Promise<void>(resolve => { started = resolve; });
    const dispatched: string[] = [];
    vi.spyOn(probe, 'dispatchProvider').mockImplementation(async (model, input, id) => {
      dispatched.push(input.callerModule ?? '');
      if (input.callerModule === 'test:holding') { started(); await held; }
      return response(model, id);
    });
    const limiter = vi.spyOn(probe.outboundLimiter, 'run');
    const failures = vi.spyOn(probe, 'recordFailure');
    const fallbacks = vi.spyOn(probe, 'getFallbackModels');
    const first = scoped(() => gateway.route(request('test:holding')));
    await holding;
    const ctl = new AbortController();
    const queued = scoped(() => gateway.route(request('ana-ri:stream', ctl.signal))).catch((e: unknown) => e);
    await vi.waitFor(() => expect(limiter).toHaveBeenCalledTimes(2));
    ctl.abort(new RunStopped('session_ended'));
    const error = await queued;
    releaseHeld();
    await first;
    expect(error).toBeInstanceOf(GatewayAbortedError);
    expect(error).toMatchObject({ phase: 'pre_call' });
    expect(dispatched).toEqual(['test:holding']);
    expect(failures).not.toHaveBeenCalled();
    expect(fallbacks).not.toHaveBeenCalled();
  });
});
