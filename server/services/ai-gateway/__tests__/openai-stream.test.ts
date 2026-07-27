/**
 * Tests — OpenAI-compatible stream decoding (pure).
 *
 * Covers the delta decoder the gateway's OpenAI + Moonshot streaming paths
 * share: text deltas, reasoning under both provider key spellings
 * (reasoning_content / reasoning), the final usage chunk, finish reason, and
 * defensiveness against malformed chunks. Plus the non-streaming reasoning
 * extractor used for blocking-path parity.
 */

import { describe, it, expect } from 'vitest';

import { parseOpenAIStreamDelta, extractOpenAIReasoning } from '../openai-stream.js';

describe('parseOpenAIStreamDelta', () => {
  it('decodes a plain text delta', () => {
    const d = parseOpenAIStreamDelta({ choices: [{ delta: { content: 'Hello' } }] });
    expect(d.text).toBe('Hello');
    expect(d.reasoning).toBe('');
    expect(d.finishReason).toBeNull();
    expect(d.usage).toBeNull();
  });

  it('decodes a Kimi/DeepSeek reasoning_content delta', () => {
    const d = parseOpenAIStreamDelta({ choices: [{ delta: { reasoning_content: 'thinking…' } }] });
    expect(d.reasoning).toBe('thinking…');
    expect(d.text).toBe('');
  });

  it('accepts the alternate `reasoning` key (e.g. OpenRouter)', () => {
    const d = parseOpenAIStreamDelta({ choices: [{ delta: { reasoning: 'pondering' } }] });
    expect(d.reasoning).toBe('pondering');
  });

  it('prefers reasoning_content when both keys are present', () => {
    const d = parseOpenAIStreamDelta({
      choices: [{ delta: { reasoning_content: 'primary', reasoning: 'secondary' } }],
    });
    expect(d.reasoning).toBe('primary');
  });

  it('reads the finish reason on the closing chunk', () => {
    const d = parseOpenAIStreamDelta({ choices: [{ delta: {}, finish_reason: 'stop' }] });
    expect(d.finishReason).toBe('stop');
  });

  it('reads usage off the final include_usage chunk', () => {
    const d = parseOpenAIStreamDelta({
      choices: [],
      usage: { prompt_tokens: 120, completion_tokens: 30, total_tokens: 150 },
    });
    expect(d.usage).toEqual({ inputTokens: 120, outputTokens: 30, totalTokens: 150 });
  });

  it('derives total_tokens when the server omits it', () => {
    const d = parseOpenAIStreamDelta({
      choices: [],
      usage: { prompt_tokens: 100, completion_tokens: 25 },
    });
    expect(d.usage?.totalTokens).toBe(125);
  });

  it('never throws on malformed or empty chunks', () => {
    expect(parseOpenAIStreamDelta(undefined)).toEqual({
      text: '',
      reasoning: '',
      finishReason: null,
      usage: null,
    });
    expect(parseOpenAIStreamDelta({})).toEqual({
      text: '',
      reasoning: '',
      finishReason: null,
      usage: null,
    });
    expect(parseOpenAIStreamDelta({ choices: [{}] }).text).toBe('');
    // Non-string content must not leak through as a value.
    expect(parseOpenAIStreamDelta({ choices: [{ delta: { content: 42 } }] }).text).toBe('');
  });
});

describe('extractOpenAIReasoning (blocking-path parity)', () => {
  it('pulls reasoning_content, then reasoning, from a message', () => {
    expect(extractOpenAIReasoning({ reasoning_content: 'r1' })).toBe('r1');
    expect(extractOpenAIReasoning({ reasoning: 'r2' })).toBe('r2');
    expect(extractOpenAIReasoning({ reasoning_content: 'r1', reasoning: 'r2' })).toBe('r1');
  });

  it('returns empty string when there is no reasoning', () => {
    expect(extractOpenAIReasoning({ content: 'answer' })).toBe('');
    expect(extractOpenAIReasoning(null)).toBe('');
    expect(extractOpenAIReasoning(undefined)).toBe('');
  });
});
