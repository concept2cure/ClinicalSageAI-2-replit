/**
 * A model working in silence is not a stalled stream.
 *
 * Reproduced in the browser against a stand-in that streams the way the API
 * does. The model thought for 35 s with the default display ("omitted"), and
 * the API sent only `ping` events meanwhile, which the SDK drops. The gateway's
 * single 30-second watchdog cut it off. The SDK ends an aborted stream without
 * an error, so the gateway returned an empty answer as a success: AnA's bubble
 * was blank, the move was never made, and Progress read "Finished in 36s".
 *
 * No live API: the client hands back a stream shaped like the SDK's, whose
 * abort ends the iteration quietly as the SDK's does.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { AIGateway } from '../gateway';
import {
  GatewayStreamStalledError,
  WORKING_STALL_MS,
  WRITING_STALL_MS,
  watchStreamForStall,
} from '../stream-stall';
import type { GatewayRequest, ModelConfig } from '../types';

type Step = Record<string, unknown> | { silentMs: number };

/** Wire events and silences, iterated the way @anthropic-ai/sdk and openai iterate them. */
function sdkStream(steps: Step[]) {
  const controller = new AbortController();
  return {
    controller,
    async *[Symbol.asyncIterator]() {
      for (const step of steps) {
        if ('silentMs' in step) {
          await new Promise<void>((resolve) => {
            const t = setTimeout(resolve, step.silentMs as number);
            controller.signal.addEventListener('abort', () => (clearTimeout(t), resolve()), { once: true });
          });
          // core/streaming.js: an aborted stream returns, it does not throw.
          if (controller.signal.aborted) return;
          continue;
        }
        yield step;
      }
    },
  };
}

const opus: ModelConfig = {
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

const request = () =>
  ({
    taskType: 'chat',
    messages: [{ role: 'user', content: 'take me to biostatistics' }],
    maxTokens: 4096,
    stream: true,
    onStream: () => {},
  }) as unknown as GatewayRequest;

function anthropicGateway(steps: Step[]) {
  const gateway = new AIGateway({ deterministicMode: true, auditEnabled: false });
  (gateway as any).anthropicClient = { messages: { create: vi.fn(async () => sdkStream(steps)) } };
  return gateway as any;
}

const start = { type: 'message_start', message: { model: 'claude-opus-5-5', usage: { input_tokens: 10 } } };
const thinkingOpens = {
  type: 'content_block_start',
  index: 0,
  content_block: { type: 'thinking', thinking: '', signature: '' },
};
const thinkingCloses = [
  { type: 'content_block_delta', index: 0, delta: { type: 'signature_delta', signature: 'sig' } },
  { type: 'content_block_stop', index: 0 },
];
const textOpens = (index: number) => ({ type: 'content_block_start', index, content_block: { type: 'text', text: '' } });
const textDelta = (index: number, text: string) => ({ type: 'content_block_delta', index, delta: { type: 'text_delta', text } });
const toolOpens = (index: number) => ({
  type: 'content_block_start',
  index,
  content_block: { type: 'tool_use', id: 'toolu_1', name: 'navigate_to', input: {} },
});
const toolArgs = (index: number) => ({
  type: 'content_block_delta',
  index,
  delta: { type: 'input_json_delta', partial_json: '{"target":"biostatistics"}' },
});
const end = [
  { type: 'message_delta', delta: { stop_reason: 'tool_use' }, usage: { output_tokens: 20 } },
  { type: 'message_stop' },
];

beforeEach(() => vi.useFakeTimers());
afterEach(() => vi.useRealTimers());

describe('the Anthropic stream — silence is a stall only while text is streaming', () => {
  it('a model thinking silently for longer than the text limit is not cut off', async () => {
    const gateway = anthropicGateway([
      start,
      thinkingOpens,
      { silentMs: WRITING_STALL_MS + 5_000 },
      ...thinkingCloses,
      textOpens(1),
      textDelta(1, 'Opening Biostatistics.'),
      { type: 'content_block_stop', index: 1 },
      toolOpens(2),
      toolArgs(2),
      { type: 'content_block_stop', index: 2 },
      ...end,
    ]);
    const pending = gateway.executeAnthropicStream(opus, request(), 'req-1', Date.now());
    await vi.advanceTimersByTimeAsync(WRITING_STALL_MS + 10_000);
    const res = await pending;

    expect(res.content, 'the answer was cut off while the model thought').toBe('Opening Biostatistics.');
    expect(res.toolUses?.[0]).toMatchObject({ name: 'navigate_to', input: { target: 'biostatistics' } });
    expect(res.finishReason).toBe('tool_use');
  });

  it("a tool's arguments buffered for longer than the text limit are not cut off", async () => {
    const gateway = anthropicGateway([
      start,
      textOpens(0),
      textDelta(0, 'Opening it.'),
      { type: 'content_block_stop', index: 0 },
      toolOpens(1),
      { silentMs: WRITING_STALL_MS + 5_000 },
      toolArgs(1),
      { type: 'content_block_stop', index: 1 },
      ...end,
    ]);
    const pending = gateway.executeAnthropicStream(opus, request(), 'req-2', Date.now());
    await vi.advanceTimersByTimeAsync(WRITING_STALL_MS + 10_000);
    const res = await pending;

    expect(res.toolUses?.[0].input).toEqual({ target: 'biostatistics' });
    expect(res.toolUses?.[0].inputParseError).toBeUndefined();
  });

  it('text that stops mid-block is still a stall after the text limit, returned as partial', async () => {
    const gateway = anthropicGateway([start, textOpens(0), textDelta(0, 'Opening Biost'), { silentMs: 60 * 60_000 }]);
    const pending = gateway.executeAnthropicStream(opus, request(), 'req-3', Date.now());
    await vi.advanceTimersByTimeAsync(WRITING_STALL_MS + 10_000);
    const res = await pending;

    expect(res.content).toBe('Opening Biost');
    expect(res.finishReason).toBe('chunk_timeout');
  });

  it('a stream silent past the working limit with nothing produced is an error, not an empty answer', async () => {
    const gateway = anthropicGateway([start, thinkingOpens, { silentMs: 60 * 60_000 }]);
    const outcome = gateway.executeAnthropicStream(opus, request(), 'req-4', Date.now()).catch((e: unknown) => e);
    await vi.advanceTimersByTimeAsync(WORKING_STALL_MS + 10_000);

    const result = await outcome;
    expect(result, 'an empty answer was returned as a success').toBeInstanceOf(GatewayStreamStalledError);
    expect((result as GatewayStreamStalledError).model).toBe('claude-opus-5-5');
  });
});

describe('the OpenAI-compatible stream — the same rule', () => {
  const kimi: ModelConfig = { ...opus, id: 'kimi', provider: 'moonshot', model: 'kimi-k2', thinkingMode: 'none' };
  const client = (steps: Step[]) => ({ chat: { completions: { create: vi.fn(async () => sdkStream(steps)) } } });
  const text = (content: string) => ({ choices: [{ delta: { content } }] });
  const stop = { choices: [{ delta: {}, finish_reason: 'stop' }] };

  it('a server that reads the prompt or reasons for longer than the text limit is not cut off', async () => {
    const gateway = new AIGateway({ deterministicMode: true, auditEnabled: false }) as any;
    const pending = gateway.executeOpenAICompatibleStream(
      client([{ silentMs: WRITING_STALL_MS + 5_000 }, text('The answer.'), stop]),
      kimi,
      request(),
      'req-5',
      Date.now(),
    );
    await vi.advanceTimersByTimeAsync(WRITING_STALL_MS + 10_000);
    const res = await pending;

    expect(res.content).toBe('The answer.');
    expect(res.finishReason).toBe('stop');
  });

  it('once it is writing, the text limit applies, and nothing produced is an error', async () => {
    const gateway = new AIGateway({ deterministicMode: true, auditEnabled: false }) as any;
    const partial = gateway.executeOpenAICompatibleStream(
      client([text('The ans'), { silentMs: 60 * 60_000 }]),
      kimi,
      request(),
      'req-6',
      Date.now(),
    );
    const nothing = gateway
      .executeOpenAICompatibleStream(client([{ silentMs: 60 * 60_000 }]), kimi, request(), 'req-7', Date.now())
      .catch((e: unknown) => e);
    await vi.advanceTimersByTimeAsync(WORKING_STALL_MS + 10_000);

    expect(await partial).toMatchObject({ content: 'The ans', finishReason: 'chunk_timeout' });
    expect(await nothing).toBeInstanceOf(GatewayStreamStalledError);
  });
});

describe('watchStreamForStall', () => {
  it('fires on silence past the limit for the phase, once, and a chunk resets the clock', () => {
    const onStall = vi.fn();
    const watch = watchStreamForStall(onStall);

    vi.advanceTimersByTime(WRITING_STALL_MS + 10_000);
    expect(onStall, 'working silence was treated as a stall').not.toHaveBeenCalled();

    watch.chunk();
    watch.writing(true);
    vi.advanceTimersByTime(WRITING_STALL_MS - 5_000);
    expect(onStall).not.toHaveBeenCalled();
    watch.chunk();
    vi.advanceTimersByTime(WRITING_STALL_MS + 5_000);
    expect(onStall).toHaveBeenCalledTimes(1);
    expect(onStall.mock.calls[0][1]).toBe(true);
    expect(watch.stalled).toBe(true);

    vi.advanceTimersByTime(WORKING_STALL_MS);
    expect(onStall).toHaveBeenCalledTimes(1);
    watch.stop();
  });

  it('returns to the working limit when text stops', () => {
    const onStall = vi.fn();
    const watch = watchStreamForStall(onStall);
    watch.writing(true);
    watch.writing(false);
    vi.advanceTimersByTime(WORKING_STALL_MS - 5_000);
    expect(onStall).not.toHaveBeenCalled();
    vi.advanceTimersByTime(10_000);
    expect(onStall).toHaveBeenCalledTimes(1);
    expect(onStall.mock.calls[0][1]).toBe(false);
    watch.stop();
  });
});
