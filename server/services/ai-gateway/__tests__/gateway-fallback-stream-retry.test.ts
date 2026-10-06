import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { AIGateway, DEFAULT_MODELS, GatewayAllProvidersFailedError, resetGateway } from '../gateway';
import { GatewayStreamStalledError, WORKING_STALL_MS } from '../stream-stall';
import type { GatewayConfig, GatewayRequest, GatewayResponse, ModelConfig } from '../types';

/** Exercise the real routing and retry loops; only provider I/O is replaced. */
function gatewayWithOneFallback() {
  const gateway = new AIGateway({
    deterministicMode: false,
    auditEnabled: false,
    providers: [
      { name: 'openai', enabled: true, apiKey: 'not-used', defaultModel: 'gpt-4o', models: [] },
      { name: 'anthropic', enabled: true, apiKey: 'not-used', defaultModel: 'claude-sonnet-5', models: [] },
    ],
    policy: {
      maxTokensPerRequest: 128_000,
      maxRequestsPerMinutePerOrg: 10_000,
      maxRequestsPerMinutePerUser: 10_000,
      blockedPatterns: [],
      contentFilters: false,
      piiDetection: false,
    },
  } as Partial<GatewayConfig>);
  const fallback = DEFAULT_MODELS.find(m => m.id === 'claude-sonnet-4')!;
  vi.spyOn(gateway as any, 'getFallbackModels').mockReturnValue([fallback]);
  const dispatch = vi.spyOn(gateway as unknown as {
    dispatchProvider: (model: ModelConfig, request: GatewayRequest) => Promise<GatewayResponse>;
  }, 'dispatchProvider');
  return { gateway, fallback, dispatch };
}

function success(model: ModelConfig): GatewayResponse {
  return {
    content: 'Recovered.',
    provider: model.provider,
    model: model.model,
    usage: { inputTokens: 1, outputTokens: 1, totalTokens: 2, estimatedCostUsd: 0 },
    latencyMs: 1,
    requestId: 'test',
    cached: false,
    deterministic: false,
    finishReason: 'stop',
  };
}

beforeEach(() => vi.useFakeTimers());
afterEach(() => {
  resetGateway();
  vi.restoreAllMocks();
  vi.useRealTimers();
});

describe('gateway fallback retry policy', () => {
  it.each(['transient error', 'silent stream'] as const)(
    'does not replay a streaming fallback after a %s',
    async failure => {
      const { gateway, fallback, dispatch } = gatewayWithOneFallback();
      dispatch.mockImplementation(async model => {
        if (model.id !== fallback.id) throw Object.assign(new Error('primary unavailable'), { status: 400 });
        // A silent stream has already spent the full working deadline. Replaying
        // it adds another five minutes before the next model can be tried.
        if (failure === 'silent stream') {
          throw new GatewayStreamStalledError(model.provider, model.model, WORKING_STALL_MS);
        }
        throw Object.assign(new Error('upstream 500'), { status: 500 });
      });
      const outcome = gateway.route({
        taskType: 'chat',
        provider: 'openai',
        messages: [{ role: 'user', content: 'Show me the product demo.' }],
        stream: true,
        onStream: vi.fn(),
      }).catch(error => error);
      await vi.advanceTimersByTimeAsync(5_000);

      expect(await outcome).toBeInstanceOf(GatewayAllProvidersFailedError);
      expect(dispatch.mock.calls.filter(([model]) => model.id === fallback.id),
        'a streaming fallback was replayed instead of moving on after one attempt').toHaveLength(1);
      expect(dispatch).toHaveBeenCalledTimes(2);
    },
  );

  it('still retries a transient non-streaming fallback once and returns its recovery', async () => {
    const { gateway, fallback, dispatch } = gatewayWithOneFallback();
    let fallbackCalls = 0;
    dispatch.mockImplementation(async model => {
      if (model.id !== fallback.id) throw Object.assign(new Error('primary unavailable'), { status: 400 });
      if (++fallbackCalls === 1) throw Object.assign(new Error('upstream 500'), { status: 500 });
      return success(model);
    });
    const outcome = gateway.route({
      taskType: 'chat',
      provider: 'openai',
      messages: [{ role: 'user', content: 'Show me the product demo.' }],
    });
    await vi.advanceTimersByTimeAsync(5_000);

    expect((await outcome).content).toBe('Recovered.');
    expect(fallbackCalls).toBe(2);
    expect(dispatch).toHaveBeenCalledTimes(3);
  });
});
