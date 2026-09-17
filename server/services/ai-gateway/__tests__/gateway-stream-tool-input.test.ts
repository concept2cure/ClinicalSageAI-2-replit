/**
 * Tests — the gateway's Anthropic streaming path carries tool INPUTS.
 *
 * ── The defect this exists for ───────────────────────────────────────────────
 * `executeAnthropicStream` handled `content_block_start` for a tool_use by
 * pushing `{ id, name, input: {} }`, and the `input_json_delta` branch was an
 * empty comment:
 *
 *     } else if (event.delta?.type === 'input_json_delta') {
 *       // Tool input streaming — accumulate
 *     }
 *
 * Nothing accumulated. `partial_json` appeared nowhere else in the repository.
 * `executeAnthropic` delegates to this method for every `stream && onStream`
 * request, and `server/routes/ana-ri/stream.ts` sets exactly that on the first
 * model call of every AnA chat turn — so on AnA's main surface every tool in
 * every round was invoked with `{}`: `search_document` with no query,
 * `execute_platform_command` with no command. The non-streaming path parsed
 * inputs correctly; only streaming was affected, and streaming is what the
 * product uses.
 *
 * ── Why a tool input that will not parse is not `{}` ─────────────────────────
 * Falling back to an empty object on a parse failure is an error rendered as an
 * empty result: the call would dispatch and the handler would report "missing
 * parameters" as though the model had asked for nothing. The tool use instead
 * carries `inputParseError`, and the caller turns it into an explicit error
 * result rather than a blind dispatch.
 *
 * No live API — the mock client returns an async generator of wire events.
 */

import { describe, it, expect, vi } from 'vitest';

import { AIGateway } from '../gateway';
import type { GatewayRequest, ModelConfig } from '../types';

const modelConfig: ModelConfig = {
  id: 'claude-opus-4',
  provider: 'anthropic',
  model: 'claude-opus-4-8',
  contextWindow: 200_000,
  qualityScore: 99,
  costPer1kInput: 0.015,
  costPer1kOutput: 0.075,
  capabilities: ['chat'],
  enabled: true,
};

/** A gateway whose Anthropic client yields exactly these wire events. */
function gatewayYielding(events: any[]) {
  const gateway = new AIGateway({ deterministicMode: true, auditEnabled: false });
  async function* gen() {
    for (const e of events) yield e;
  }
  (gateway as any).anthropicClient = { messages: { create: vi.fn(async () => gen()) } };
  return gateway;
}

function streamRequest(): GatewayRequest {
  return {
    taskType: 'chat',
    messages: [{ role: 'user', content: 'find the indemnification clause' }],
    maxTokens: 1000,
    stream: true,
    onStream: () => {},
  } as unknown as GatewayRequest;
}

/** message_start / message_delta / message_stop scaffolding around a body. */
function wrap(body: any[]) {
  return [
    { type: 'message_start', message: { model: 'claude-opus-4-8', usage: { input_tokens: 12 } } },
    ...body,
    { type: 'message_delta', delta: { stop_reason: 'tool_use' }, usage: { output_tokens: 20 } },
    { type: 'message_stop' },
  ];
}

describe('executeAnthropicStream — tool inputs', () => {
  it('accumulates input_json_delta into the tool_use input', async () => {
    // Fragments split mid-token, as the API actually emits them.
    const gateway = gatewayYielding(
      wrap([
        {
          type: 'content_block_start',
          index: 0,
          content_block: { type: 'tool_use', id: 'toolu_01', name: 'search_document', input: {} },
        },
        { type: 'content_block_delta', index: 0, delta: { type: 'input_json_delta', partial_json: '{"que' } },
        { type: 'content_block_delta', index: 0, delta: { type: 'input_json_delta', partial_json: 'ry":"indem' } },
        { type: 'content_block_delta', index: 0, delta: { type: 'input_json_delta', partial_json: 'nification"}' } },
        { type: 'content_block_stop', index: 0 },
      ]),
    );

    const res = await (gateway as any).executeAnthropicStream(
      modelConfig,
      streamRequest(),
      'req-1',
      Date.now(),
    );

    expect(res.toolUses).toHaveLength(1);
    expect(res.toolUses[0].name).toBe('search_document');
    // Before the fix this is `{}` — the tool ran with no query at all.
    expect(res.toolUses[0].input).toEqual({ query: 'indemnification' });
    expect(res.toolUses[0].inputParseError).toBeUndefined();
  });

  it('keeps each tool_use input with its own block when several stream at once', async () => {
    // Parallel tool use interleaves blocks by `index`. Keying the buffer on
    // anything else merges two tools' arguments into one.
    const gateway = gatewayYielding(
      wrap([
        {
          type: 'content_block_start',
          index: 0,
          content_block: { type: 'text', text: '' },
        },
        { type: 'content_block_delta', index: 0, delta: { type: 'text_delta', text: 'Looking.' } },
        { type: 'content_block_stop', index: 0 },
        {
          type: 'content_block_start',
          index: 1,
          content_block: { type: 'tool_use', id: 'toolu_a', name: 'search_document', input: {} },
        },
        {
          type: 'content_block_start',
          index: 2,
          content_block: { type: 'tool_use', id: 'toolu_b', name: 'lookup_fda_guidance', input: {} },
        },
        { type: 'content_block_delta', index: 2, delta: { type: 'input_json_delta', partial_json: '{"topic":"510k"}' } },
        { type: 'content_block_delta', index: 1, delta: { type: 'input_json_delta', partial_json: '{"query":"scope"}' } },
        { type: 'content_block_stop', index: 1 },
        { type: 'content_block_stop', index: 2 },
      ]),
    );

    const res = await (gateway as any).executeAnthropicStream(
      modelConfig,
      streamRequest(),
      'req-2',
      Date.now(),
    );

    expect(res.content).toBe('Looking.');
    expect(res.toolUses).toHaveLength(2);
    expect(res.toolUses.find((t: any) => t.id === 'toolu_a').input).toEqual({ query: 'scope' });
    expect(res.toolUses.find((t: any) => t.id === 'toolu_b').input).toEqual({ topic: '510k' });
  });

  it('a tool_use whose input JSON never parses is reported, not passed off as {}', async () => {
    const gateway = gatewayYielding(
      wrap([
        {
          type: 'content_block_start',
          index: 0,
          content_block: { type: 'tool_use', id: 'toolu_bad', name: 'search_document', input: {} },
        },
        { type: 'content_block_delta', index: 0, delta: { type: 'input_json_delta', partial_json: '{"query":"unterm' } },
        { type: 'content_block_stop', index: 0 },
      ]),
    );

    const res = await (gateway as any).executeAnthropicStream(
      modelConfig,
      streamRequest(),
      'req-3',
      Date.now(),
    );

    expect(res.toolUses).toHaveLength(1);
    expect(res.toolUses[0].input).toEqual({});
    // The caller must be able to tell "no arguments" from "arguments we lost".
    expect(res.toolUses[0].inputParseError).toBeTruthy();
  });

  it('a tool_use that legitimately takes no arguments is not an error', async () => {
    // The model emits no input_json_delta at all for a zero-argument tool.
    // That is an empty input, not a lost one, and must not be flagged.
    const gateway = gatewayYielding(
      wrap([
        {
          type: 'content_block_start',
          index: 0,
          content_block: { type: 'tool_use', id: 'toolu_none', name: 'list_open_tasks', input: {} },
        },
        { type: 'content_block_stop', index: 0 },
      ]),
    );

    const res = await (gateway as any).executeAnthropicStream(
      modelConfig,
      streamRequest(),
      'req-4',
      Date.now(),
    );

    expect(res.toolUses[0].input).toEqual({});
    expect(res.toolUses[0].inputParseError).toBeUndefined();
  });

  it('a stream that ends before content_block_stop still reports what it lost', async () => {
    // A stall or a dropped connection cuts the stream mid-input. The block
    // never closes, so the buffer is never parsed — it must not read as a
    // zero-argument call.
    const gateway = gatewayYielding([
      { type: 'message_start', message: { model: 'claude-opus-4-8', usage: { input_tokens: 12 } } },
      {
        type: 'content_block_start',
        index: 0,
        content_block: { type: 'tool_use', id: 'toolu_cut', name: 'search_document', input: {} },
      },
      { type: 'content_block_delta', index: 0, delta: { type: 'input_json_delta', partial_json: '{"query":"half' } },
    ]);

    const res = await (gateway as any).executeAnthropicStream(
      modelConfig,
      streamRequest(),
      'req-5',
      Date.now(),
    );

    expect(res.toolUses[0].input).toEqual({});
    expect(res.toolUses[0].inputParseError).toBeTruthy();
  });
});
