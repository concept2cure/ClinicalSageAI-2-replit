/**
 * A web search AnA ran is part of the record.
 *
 * ── The defect ────────────────────────────────────────────────────────────────
 * Both of the gateway's content-block loops handled exactly three types —
 * `text`, `thinking`, `tool_use` — and let everything else fall through. Server
 * tools are executed by Anthropic and reported only as blocks: a
 * `server_tool_use` saying what was asked, and a `*_tool_result` carrying what
 * came back. Neither was read.
 *
 * So a turn that searched the web looked exactly like a turn that did not. The
 * citations survived, because those ride on the text blocks — which made it
 * worse, not better: the answer carried sources while the step that found them
 * was absent, so the trace was complete on its face and wrong underneath.
 *
 * For a product whose claim about AnA is that she shows her work, a step that
 * happened and is invisible is the failure mode that matters. A step that fails
 * loudly can be seen.
 *
 * ── The one that does not raise ───────────────────────────────────────────────
 * A failed web search is an HTTP 200. Its result body is an error OBJECT where
 * a success is a LIST, and nothing throws. The shape is the only signal there
 * is, which is why `isError` is derived here rather than left to each caller to
 * rediscover.
 */
import { describe, it, expect, vi } from 'vitest';

import { AIGateway } from '../gateway';
import type { GatewayRequest, ModelConfig } from '../types';

const MODEL: ModelConfig = {
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

const REQUEST = {
  taskType: 'chat',
  messages: [{ role: 'user', content: 'what did the FDA publish on Q8 this year' }],
  maxTokens: 500,
} as GatewayRequest;

/** Drive the NON-STREAMING executor with a hand-written content array. */
async function nonStreaming(content: unknown[]) {
  const gateway = new AIGateway({ deterministicMode: true, auditEnabled: false });
  (gateway as any).anthropicClient = {
    messages: {
      create: vi.fn(async () => ({
        content,
        usage: { input_tokens: 5, output_tokens: 9 },
        stop_reason: 'end_turn',
        model: MODEL.model,
      })),
    },
  };
  return (gateway as any).executeAnthropic(MODEL, REQUEST, 'req-1', Date.now());
}

/** Drive the STREAMING executor with a hand-written event sequence. */
async function streaming(blocks: unknown[]) {
  const gateway = new AIGateway({ deterministicMode: true, auditEnabled: false });
  const events = [
    { type: 'message_start', message: { usage: { input_tokens: 5 } } },
    ...blocks.map((content_block, index) => ({ type: 'content_block_start', index, content_block })),
    { type: 'message_delta', delta: { stop_reason: 'end_turn' }, usage: { output_tokens: 9 } },
  ];
  (gateway as any).anthropicClient = {
    messages: {
      create: vi.fn(async () => ({
        async *[Symbol.asyncIterator]() { for (const e of events) yield e; },
      })),
    },
  };
  return (gateway as any).executeAnthropicStream(
    MODEL,
    { ...REQUEST, stream: true, onStream: () => {} } as GatewayRequest,
    'req-1',
    Date.now(),
  );
}

const SEARCH_USE = {
  type: 'server_tool_use',
  id: 'srvtoolu_1',
  name: 'web_search',
  input: { query: 'FDA Q8 guidance 2026' },
};
const SEARCH_RESULT = {
  type: 'web_search_tool_result',
  tool_use_id: 'srvtoolu_1',
  content: [{ type: 'web_search_result', url: 'https://fda.gov/q8', title: 'Q8(R2)' }],
};

describe('the search reaches the caller — non-streaming', () => {
  it('records that a search ran, and what was asked', async () => {
    const r = await nonStreaming([SEARCH_USE, { type: 'text', text: 'The FDA says…' }]);
    expect(r.serverToolUses).toHaveLength(1);
    expect(r.serverToolUses[0]).toMatchObject({
      id: 'srvtoolu_1',
      name: 'web_search',
      input: { query: 'FDA Q8 guidance 2026' },
    });
  });

  it('pairs the result with its use rather than listing it twice', async () => {
    // The use and its result are SEPARATE blocks. Two entries for one search
    // would make the trace overcount the work.
    const r = await nonStreaming([SEARCH_USE, SEARCH_RESULT, { type: 'text', text: 'x' }]);
    expect(r.serverToolUses).toHaveLength(1);
    expect(r.serverToolUses[0].result).toEqual(SEARCH_RESULT.content);
  });

  it('still records a result whose use was never seen', async () => {
    // Dropping it would recreate the defect in miniature: an unmatched result
    // is evidence of work that would otherwise go unrecorded entirely.
    const r = await nonStreaming([SEARCH_RESULT]);
    expect(r.serverToolUses).toHaveLength(1);
    expect(r.serverToolUses[0].name).toBe('web_search');
  });

  it('does not disturb the text, thinking or tool_use it always handled', async () => {
    const r = await nonStreaming([
      { type: 'thinking', thinking: 'considering' },
      SEARCH_USE,
      { type: 'text', text: 'The FDA says…' },
      { type: 'tool_use', id: 't1', name: 'search_document', input: { query: 'q' } },
    ]);
    expect(r.content).toBe('The FDA says…');
    expect(r.thinking).toBe('considering');
    expect(r.toolUses).toHaveLength(1);
    expect(r.serverToolUses).toHaveLength(1);
  });

  it('is absent, not empty, on a turn that ran no server tool', async () => {
    // An empty array would read as "we looked and there were none", which is a
    // different claim from "this turn had nothing to report".
    const r = await nonStreaming([{ type: 'text', text: 'no search needed' }]);
    expect(r.serverToolUses).toBeUndefined();
  });
});

describe('the search reaches the caller — streaming, which is what AnA uses', () => {
  it('records the search from the block stream', async () => {
    const r = await streaming([SEARCH_USE, SEARCH_RESULT]);
    expect(r.serverToolUses).toHaveLength(1);
    expect(r.serverToolUses[0]).toMatchObject({ name: 'web_search', id: 'srvtoolu_1' });
    expect(r.serverToolUses[0].result).toEqual(SEARCH_RESULT.content);
  });

  it('still opens tool_use buffers as before', async () => {
    const r = await streaming([{ type: 'tool_use', id: 't1', name: 'search_document' }]);
    expect(r.toolUses).toHaveLength(1);
    expect(r.serverToolUses).toBeUndefined();
  });
});

describe('a failed server tool does not raise, so the shape is the signal', () => {
  it('marks an error body as an error', async () => {
    // A success content is a LIST; an error content is an OBJECT carrying an
    // error_code. Both arrive as HTTP 200.
    const r = await nonStreaming([
      { type: 'web_search_tool_result', tool_use_id: 'srvtoolu_9', content: { error_code: 'max_uses_exceeded' } },
    ]);
    expect(r.serverToolUses[0].isError).toBe(true);
    expect(r.serverToolUses[0].result).toEqual({ error_code: 'max_uses_exceeded' });
  });

  it('honours an explicit is_error flag too', async () => {
    const r = await nonStreaming([
      { type: 'web_fetch_tool_result', tool_use_id: 'x', is_error: true, content: [] },
    ]);
    expect(r.serverToolUses[0].isError).toBe(true);
  });

  it('does NOT mark a successful list as an error', async () => {
    const r = await nonStreaming([SEARCH_RESULT]);
    expect(r.serverToolUses[0].isError).toBeUndefined();
  });

  it('marks an error that arrives after its use, on the paired entry', async () => {
    const r = await nonStreaming([
      SEARCH_USE,
      { type: 'web_search_tool_result', tool_use_id: 'srvtoolu_1', content: { error_code: 'unavailable' } },
    ]);
    expect(r.serverToolUses).toHaveLength(1);
    expect(r.serverToolUses[0].isError).toBe(true);
    expect(r.serverToolUses[0].input).toEqual({ query: 'FDA Q8 guidance 2026' });
  });
});
