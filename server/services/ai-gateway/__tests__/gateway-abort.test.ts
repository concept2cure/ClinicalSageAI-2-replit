/**
 * Tests — a cancelled request stops, and stops being anyone's fault.
 *
 * ── Why this needs its own guard ──────────────────────────────────────────────
 * AnA's run control could ask the client to stop rendering, but nothing could
 * tell the PROVIDER to stop generating: `GatewayRequest` carried no abort
 * signal, and the SSE route said so in its own comment — "the underlying model
 * call finishes server-side (the gateway exposes no abort signal)". Pressing
 * stop dropped the socket and left the turn running to completion.
 *
 * Adding the signal is the easy half. The half that bites is what `route()`
 * does with the resulting error. It treats `GatewayPolicyError` as the only
 * terminal failure; everything else sets `lastError`, calls
 * `recordFailure(provider)` — the circuit breaker — and walks the fallback
 * ladder. So an abort, untreated, would:
 *
 *   • re-run the ENTIRE request the user just cancelled on the next model,
 *     and the one after that, which is worse than not cancelling at all;
 *   • mark Anthropic unhealthy, so the next user's turn routes around a
 *     provider that never failed.
 *
 * A user cancelling is not a provider outage. It is terminal, like a policy
 * denial, and invisible to provider health.
 *
 * The text already streamed is kept. `agentic-loop.ts` holds the same line for
 * a cancelled round — what the model already said stands.
 */

import { describe, it, expect, vi, afterEach } from 'vitest';

import { AIGateway, resetGateway, GatewayAbortedError } from '../gateway';
import type { GatewayConfig, GatewayRequest, ModelConfig } from '../types';

/** A live-mode gateway with the Anthropic ladder available. */
function liveGateway(): AIGateway {
  return new AIGateway({
    deterministicMode: false,
    defaultStrategy: 'task_based',
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
  } as Partial<GatewayConfig>);
}

const modelConfig: ModelConfig = {
  id: 'claude-opus-4',
  provider: 'anthropic',
  model: 'claude-opus-5',
  contextWindow: 1_000_000,
  qualityScore: 99,
  costPer1kInput: 0.005,
  costPer1kOutput: 0.025,
  capabilities: ['chat'],
  enabled: true,
  thinkingMode: 'adaptive',
  supportsSamplingParams: false,
};

/**
 * An Anthropic client whose stream yields `events`, pausing at `abortAfter`
 * events so the caller can abort mid-stream.
 */
function gatewayStreaming(events: any[], onEvent?: (i: number) => void) {
  const gateway = new AIGateway({ deterministicMode: true, auditEnabled: false });
  async function* gen() {
    for (let i = 0; i < events.length; i++) {
      onEvent?.(i);
      yield events[i];
    }
  }
  (gateway as any).anthropicClient = { messages: { create: vi.fn(async () => gen()) } };
  return gateway;
}

function textEvents(n: number) {
  return [
    { type: 'message_start', message: { model: 'claude-opus-5', usage: { input_tokens: 5 } } },
    ...Array.from({ length: n }, (_, i) => ({
      type: 'content_block_delta',
      index: 0,
      delta: { type: 'text_delta', text: `chunk${i} ` },
    })),
    { type: 'message_delta', delta: { stop_reason: 'end_turn' }, usage: { output_tokens: n } },
    { type: 'message_stop' },
  ];
}

afterEach(() => resetGateway());

describe('gateway abort — the request stops', () => {
  it('passes the abort signal through to the provider call', async () => {
    const gateway = gatewayStreaming(textEvents(2));
    const controller = new AbortController();
    const create = (gateway as any).anthropicClient.messages.create;

    await (gateway as any).executeAnthropicStream(
      modelConfig,
      {
        taskType: 'chat',
        messages: [{ role: 'user', content: 'hi' }],
        stream: true,
        onStream: () => {},
        signal: controller.signal,
      } as unknown as GatewayRequest,
      'req-1',
      Date.now(),
    );

    // Second argument is the SDK's RequestOptions. The Files-API beta header
    // also rides there, so the signal must be MERGED into that object rather
    // than replacing it.
    expect(create).toHaveBeenCalledTimes(1);
    expect(create.mock.calls[0][1]?.signal).toBe(controller.signal);
  });

  it('keeps the text already streamed when the user stops mid-answer', async () => {
    // Half an answer the person is reading is not nothing. Throwing it away on
    // cancel would make stop destructive rather than merely final.
    const controller = new AbortController();
    const seen: string[] = [];
    const gateway = gatewayStreaming(textEvents(6), i => {
      if (i === 3) controller.abort();
    });

    const res = await (gateway as any).executeAnthropicStream(
      modelConfig,
      {
        taskType: 'chat',
        messages: [{ role: 'user', content: 'hi' }],
        stream: true,
        onStream: (c: string) => seen.push(c),
        signal: controller.signal,
      } as unknown as GatewayRequest,
      'req-2',
      Date.now(),
    );

    expect(res.content.length).toBeGreaterThan(0);
    expect(res.content).toBe(seen.join(''));
    expect(res.finishReason).toBe('aborted');
  });

  it('never opens a provider call for a run that is already cancelled', async () => {
    const gw = liveGateway();
    const dispatch = vi
      .spyOn(gw as unknown as { dispatchProvider: (m: ModelConfig) => Promise<unknown> }, 'dispatchProvider')
      .mockResolvedValue({} as never);
    const controller = new AbortController();
    controller.abort();

    const outcome = await gw
      .route({
        taskType: 'chat',
        messages: [{ role: 'user', content: 'hi' }],
        signal: controller.signal,
      } as unknown as GatewayRequest)
      .then(() => null, (e: unknown) => e);

    expect(outcome).toBeInstanceOf(GatewayAbortedError);
    expect(dispatch, 'a cancelled run still reached a provider').not.toHaveBeenCalled();
  });
});

describe('gateway abort — the cancel is nobody\'s fault', () => {
  it('never falls back to another model', async () => {
    // The whole point of cancelling is that the work stops. Re-running it on
    // the next rung is worse than not cancelling.
    const gw = liveGateway();
    const dispatch = vi
      .spyOn(gw as unknown as { dispatchProvider: (m: ModelConfig) => Promise<unknown> }, 'dispatchProvider')
      .mockImplementation(async () => {
        throw new GatewayAbortedError('pre_stream');
      });

    const outcome = await gw
      .route({ taskType: 'chat', messages: [{ role: 'user', content: 'hi' }] })
      .then(() => null, (e: unknown) => e);

    expect(outcome).toBeInstanceOf(GatewayAbortedError);
    expect(dispatch, 'the cancelled request was retried on another model').toHaveBeenCalledTimes(1);
  });

  it('never counts against the provider circuit breaker', async () => {
    // A user pressing stop must not make the next user route around a healthy
    // provider.
    const gw = liveGateway();
    vi.spyOn(gw as unknown as { dispatchProvider: (m: ModelConfig) => Promise<unknown> }, 'dispatchProvider')
      .mockImplementation(async () => {
        throw new GatewayAbortedError('pre_stream');
      });
    const recordFailure = vi.spyOn(
      gw as unknown as { recordFailure: (p: string, e: unknown) => void },
      'recordFailure',
    );

    await gw
      .route({ taskType: 'chat', messages: [{ role: 'user', content: 'hi' }] })
      .catch(() => {});

    expect(recordFailure, 'a cancel was recorded as a provider failure').not.toHaveBeenCalled();
    const health = (gw as unknown as {
      providerHealth: Map<string, { consecutiveFailures: number }>;
    }).providerHealth.get('anthropic');
    expect(health?.consecutiveFailures ?? 0).toBe(0);
  });

  it('is not retried by the backoff loop', async () => {
    const gw = liveGateway();
    let calls = 0;
    const outcome = await (gw as any)
      .retryWithBackoff(async () => {
        calls++;
        throw new GatewayAbortedError('pre_call');
      }, 3, 1)
      .then(() => null, (e: unknown) => e);

    expect(outcome).toBeInstanceOf(GatewayAbortedError);
    expect(calls, 'the cancelled call was retried').toBe(1);
  });
});
