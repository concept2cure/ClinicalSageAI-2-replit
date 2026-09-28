/**
 * Tests — a model that declines is neither an answer nor an outage.
 *
 * ── The gap ──────────────────────────────────────────────────────────────────
 * Current Claude models run safety classifiers that can decline a request. The
 * decline arrives as HTTP 200 with `stop_reason: "refusal"`, a `stop_details`
 * object naming the category, and no text. The gateway read `stop_reason` into
 * `finishReason` and returned the empty content as a normal response — so a
 * declined turn reached AnA as an answer with nothing in it, which is an error
 * rendered as an empty result.
 *
 * It matters more with Claude Opus 5.5 as the flagship: it adds a biology
 * classifier to Opus 5's cyber one, and nonclinical toxicology is routine IND
 * work. A false positive there must not become a blank reply.
 *
 * ── What a decline is, and is not ───────────────────────────────────────────
 *   • Not an answer: it is raised as GatewayModelDeclinedError.
 *   • Not a provider failure: the provider is healthy and said so. It never
 *     reaches recordFailure, and it is not retried on the same model — the
 *     same classifier would decline the same request again.
 *   • Usually recoverable: the next rung (Opus 5, which has no biology
 *     classifier) runs the request. Anthropic's own server-side fallback does
 *     the same; ours stays inside the approved-model ladder.
 *   • Terminal in two cases: `reasoning_extraction` (Anthropic: "not retried
 *     on a fallback model"), and a decline after text was already streamed to
 *     the person, where re-running would print a second answer under the first.
 */

import { describe, it, expect, vi, afterEach } from 'vitest';

import { AIGateway, resetGateway, GatewayModelDeclinedError } from '../gateway';
import type { GatewayConfig, GatewayRequest, ModelConfig } from '../types';

function liveGateway(): AIGateway {
  return new AIGateway({
    deterministicMode: false,
    defaultStrategy: 'task_based',
    auditEnabled: false,
    providers: [
      { name: 'anthropic', enabled: true, apiKey: 'not-used', defaultModel: 'claude-opus-5-5', models: [] },
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
  } as Partial<GatewayConfig>);
}

const flagship: ModelConfig = {
  id: 'claude-opus-4',
  provider: 'anthropic',
  model: 'claude-opus-5-5',
  contextWindow: 1_000_000,
  qualityScore: 99,
  costPer1kInput: 0.004,
  costPer1kOutput: 0.02,
  capabilities: ['chat'],
  enabled: true,
  thinkingMode: 'adaptive',
  supportsSamplingParams: false,
};

const request = (extra: Partial<GatewayRequest> = {}) =>
  ({ taskType: 'chat', messages: [{ role: 'user', content: 'hi' }], ...extra }) as GatewayRequest;

/** A gateway whose Anthropic client returns `result` from messages.create. */
function withClient(result: unknown): AIGateway {
  const gateway = new AIGateway({ deterministicMode: true, auditEnabled: false });
  (gateway as any).anthropicClient = { messages: { create: vi.fn(async () => result) } };
  return gateway;
}

function streamOf(events: any[]) {
  return (async function* () {
    for (const e of events) yield e;
  })();
}

afterEach(() => resetGateway());

describe('a decline is raised, not returned as an empty answer', () => {
  it('non-streaming: stop_reason "refusal" throws with the category', async () => {
    const gateway = withClient({
      content: [],
      stop_reason: 'refusal',
      stop_details: { type: 'refusal', category: 'bio', explanation: 'x' },
      usage: { input_tokens: 10, output_tokens: 0 },
    });
    const outcome = await (gateway as any)
      .executeAnthropic(flagship, request(), 'r1', Date.now())
      .then(() => null, (e: unknown) => e);

    expect(outcome).toBeInstanceOf(GatewayModelDeclinedError);
    expect(outcome).toMatchObject({ model: 'claude-opus-5-5', category: 'bio', retryable: true });
  });

  it('streaming: a decline before any text is retryable', async () => {
    const gateway = withClient(
      streamOf([
        { type: 'message_start', message: { model: 'claude-opus-5-5', usage: { input_tokens: 5 } } },
        {
          type: 'message_delta',
          delta: { stop_reason: 'refusal', stop_details: { type: 'refusal', category: 'bio' } },
          usage: { output_tokens: 0 },
        },
        { type: 'message_stop' },
      ]),
    );
    const outcome = await (gateway as any)
      .executeAnthropicStream(flagship, request({ stream: true, onStream: () => {} }), 'r2', Date.now())
      .then(() => null, (e: unknown) => e);

    expect(outcome).toBeInstanceOf(GatewayModelDeclinedError);
    expect(outcome).toMatchObject({ category: 'bio', retryable: true });
  });

  it('streaming: a decline after text reached the person is terminal', async () => {
    const gateway = withClient(
      streamOf([
        { type: 'message_start', message: { model: 'claude-opus-5-5', usage: { input_tokens: 5 } } },
        { type: 'content_block_delta', index: 0, delta: { type: 'text_delta', text: 'The NOAEL in' } },
        {
          type: 'message_delta',
          delta: { stop_reason: 'refusal', stop_details: { type: 'refusal', category: 'bio' } },
          usage: { output_tokens: 4 },
        },
        { type: 'message_stop' },
      ]),
    );
    const outcome = await (gateway as any)
      .executeAnthropicStream(flagship, request({ stream: true, onStream: () => {} }), 'r3', Date.now())
      .then(() => null, (e: unknown) => e);

    expect(outcome).toBeInstanceOf(GatewayModelDeclinedError);
    expect(outcome).toMatchObject({ retryable: false });
  });
});

describe('route() — a decline moves down the ladder without blaming the provider', () => {
  const dispatch = (gw: AIGateway) =>
    vi.spyOn(gw as unknown as { dispatchProvider: (m: ModelConfig) => Promise<unknown> }, 'dispatchProvider');

  it('a biology decline on the flagship is answered by the next rung', async () => {
    const gw = liveGateway();
    const seen: string[] = [];
    dispatch(gw).mockImplementation(async (m: ModelConfig) => {
      seen.push(m.model);
      if (seen.length === 1) throw new GatewayModelDeclinedError(m.model, 'bio', true);
      return {
        content: 'Answered by the next rung.',
        provider: m.provider,
        model: m.model,
        usage: { inputTokens: 1, outputTokens: 1, totalTokens: 2, estimatedCostUsd: 0 },
        latencyMs: 1,
        requestId: 'x',
        cached: false,
        deterministic: false,
        finishReason: 'end_turn',
      };
    });
    const recordFailure = vi.spyOn(
      gw as unknown as { recordFailure: (p: string, e: unknown) => void },
      'recordFailure',
    );

    const res = await gw.route(request());

    expect(res.content).toBe('Answered by the next rung.');
    expect(seen.length, 'the declining model was retried instead of falling back').toBe(2);
    expect(seen[1]).not.toBe(seen[0]);
    expect(recordFailure, 'a decline was counted against the provider').not.toHaveBeenCalled();
  });

  it('reasoning_extraction is terminal: no other model is asked', async () => {
    const gw = liveGateway();
    const spy = dispatch(gw).mockImplementation(async (m: ModelConfig) => {
      throw new GatewayModelDeclinedError(m.model, 'reasoning_extraction', false);
    });

    const outcome = await gw.route(request()).then(() => null, (e: unknown) => e);

    expect(outcome).toBeInstanceOf(GatewayModelDeclinedError);
    expect(spy).toHaveBeenCalledTimes(1);
  });

  it('is not retried on the same model by the backoff loop', async () => {
    const gw = liveGateway();
    let calls = 0;
    const outcome = await (gw as any)
      .retryWithBackoff(async () => {
        calls++;
        throw new GatewayModelDeclinedError('claude-opus-5-5', 'bio', true);
      }, 3, 1)
      .then(() => null, (e: unknown) => e);

    expect(outcome).toBeInstanceOf(GatewayModelDeclinedError);
    expect(calls).toBe(1);
  });

  it('says it was declined when every rung declines, rather than reporting an outage', async () => {
    const gw = liveGateway();
    dispatch(gw).mockImplementation(async (m: ModelConfig) => {
      throw new GatewayModelDeclinedError(m.model, 'cyber', true);
    });

    const outcome = (await gw.route(request()).then(() => null, (e: unknown) => e)) as Error;

    expect(outcome).toBeInstanceOf(Error);
    expect(outcome.message).toMatch(/declined/i);
  });
});
