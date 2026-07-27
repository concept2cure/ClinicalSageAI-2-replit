/**
 * Tests — the gateway's OpenAI-compatible streaming path.
 *
 * Drives executeOpenAICompatibleStream (shared by openai + moonshot) with a
 * mock async-iterable stream, asserting the reasoning+streaming parity added
 * for the cheaper providers:
 *   - reasoning deltas arrive as {type:'thinking'}, text deltas as {type:'text'}
 *   - content and thinking aggregate; usage comes from the include_usage chunk
 *   - the request asks for stream + include_usage
 *
 * No live API — the mock client returns an async generator of wire chunks.
 */

import { describe, it, expect, vi } from 'vitest';

import { AIGateway } from '../gateway';
import type { GatewayRequest, ModelConfig } from '../types';

const modelConfig: ModelConfig = {
  id: 'moonshot:kimi-k2-thinking',
  provider: 'moonshot',
  model: 'kimi-k2-thinking',
  contextWindow: 128_000,
  qualityScore: 80,
  costPer1kInput: 0.0006,
  costPer1kOutput: 0.0025,
  capabilities: ['chat'],
  enabled: true,
};

function mockClientYielding(chunks: any[]) {
  async function* gen() {
    for (const c of chunks) yield c;
  }
  return { chat: { completions: { create: vi.fn(async () => gen()) } } };
}

describe('executeOpenAICompatibleStream — reasoning + streaming parity', () => {
  it('streams reasoning then text and aggregates the response + usage', async () => {
    const gateway = new AIGateway({ deterministicMode: true, auditEnabled: false });

    const textChunks: string[] = [];
    const thinkingChunks: string[] = [];
    const request = {
      messages: [{ role: 'user', content: 'hi' }],
      stream: true,
      maxTokens: 1000,
      onStream: (chunk: string, meta?: { type: string; thinkingContent?: string }) => {
        if (meta?.type === 'thinking') thinkingChunks.push(meta.thinkingContent ?? chunk);
        else textChunks.push(chunk);
      },
    } as unknown as GatewayRequest;

    const client = mockClientYielding([
      { choices: [{ delta: { reasoning_content: 'Let me ' } }] },
      { choices: [{ delta: { reasoning_content: 'think.' } }] },
      { choices: [{ delta: { content: 'The ' } }] },
      { choices: [{ delta: { content: 'answer.' } }] },
      { choices: [{ delta: {}, finish_reason: 'stop' }] },
      { choices: [], usage: { prompt_tokens: 10, completion_tokens: 5, total_tokens: 15 } },
    ]);

    const res = await (gateway as any).executeOpenAICompatibleStream(
      client,
      modelConfig,
      request,
      'req-1',
      Date.now(),
    );

    // Reasoning surfaced separately from the answer, in order.
    expect(thinkingChunks.join('')).toBe('Let me think.');
    expect(textChunks.join('')).toBe('The answer.');

    // Aggregated response mirrors the Anthropic path shape.
    expect(res.content).toBe('The answer.');
    expect(res.thinking).toBe('Let me think.');
    expect(res.provider).toBe('moonshot');
    expect(res.finishReason).toBe('stop');

    // Usage from the include_usage chunk drives cost.
    expect(res.usage.inputTokens).toBe(10);
    expect(res.usage.outputTokens).toBe(5);
    expect(res.usage.totalTokens).toBe(15);
    expect(res.usage.estimatedCostUsd).toBeCloseTo((10 / 1000) * 0.0006 + (5 / 1000) * 0.0025, 10);

    // Requested streaming with a final usage chunk.
    const params = (client.chat.completions.create as any).mock.calls[0][0];
    expect(params.stream).toBe(true);
    expect(params.stream_options).toEqual({ include_usage: true });
  });

  it('returns partial content if the stream errors mid-flight (resilience)', async () => {
    const gateway = new AIGateway({ deterministicMode: true, auditEnabled: false });

    const request = {
      messages: [{ role: 'user', content: 'hi' }],
      stream: true,
      onStream: () => {},
    } as unknown as GatewayRequest;

    async function* gen() {
      yield { choices: [{ delta: { content: 'partial' } }] };
      throw new Error('connection reset');
    }
    const client = { chat: { completions: { create: vi.fn(async () => gen()) } } };

    const res = await (gateway as any).executeOpenAICompatibleStream(
      client,
      { ...modelConfig, provider: 'openai' },
      request,
      'req-2',
      Date.now(),
    );
    // Whatever was captured before the error is returned, not thrown away.
    expect(res.content).toBe('partial');
  });

  it('re-throws when the stream fails before any content (nothing to salvage)', async () => {
    const gateway = new AIGateway({ deterministicMode: true, auditEnabled: false });
    const request = {
      messages: [{ role: 'user', content: 'hi' }],
      stream: true,
      onStream: () => {},
    } as unknown as GatewayRequest;

    async function* gen(): AsyncGenerator<any> {
      throw new Error('immediate failure');
      // eslint-disable-next-line no-unreachable
      yield {};
    }
    const client = { chat: { completions: { create: vi.fn(async () => gen()) } } };

    await expect(
      (gateway as any).executeOpenAICompatibleStream(
        client,
        { ...modelConfig, provider: 'openai' },
        request,
        'req-3',
        Date.now(),
      ),
    ).rejects.toThrow('immediate failure');
  });
});
