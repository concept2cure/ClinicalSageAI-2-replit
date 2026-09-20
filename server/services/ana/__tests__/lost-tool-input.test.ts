/**
 * Tests — a tool call whose arguments the stream lost is never dispatched.
 *
 * The gateway's Anthropic streaming path reconstructs a tool's arguments from
 * a run of `input_json_delta` fragments. When that reconstruction fails — the
 * fragments do not parse, or the stream ends before the block closes — `input`
 * is `{}`, which is byte-identical to a tool that legitimately takes no
 * arguments. `inputParseError` is what separates the two, and
 * `lostToolInputResult` is the check every executor runs before handing a call
 * to a handler.
 *
 * Dispatching the lost case would run the tool as though the model had asked
 * for nothing and return a "missing parameters" error — an error rendered as
 * the model's mistake, when it was ours.
 */

import { describe, it, expect } from 'vitest';
import { lostToolInputResult, type ToolCall } from '../agentic-loop.js';

function call(over: Partial<ToolCall> = {}): ToolCall {
  return { id: 'toolu_1', name: 'search_document', input: {}, ...over };
}

describe('lostToolInputResult', () => {
  it('returns null for an ordinary call, so it dispatches', () => {
    expect(lostToolInputResult(call({ input: { query: 'scope' } }))).toBeNull();
  });

  it('returns null for a tool that legitimately takes no arguments', () => {
    // `{}` with no parse error is a zero-argument call. Blocking it would
    // break every tool that takes no input.
    expect(lostToolInputResult(call({ name: 'list_open_tasks', input: {} }))).toBeNull();
  });

  it('blocks a call whose arguments were lost, and names the tool', () => {
    const result = lostToolInputResult(
      call({ inputParseError: 'tool input was not parseable JSON: Unexpected end of JSON input' }),
    );
    expect(result).not.toBeNull();
    expect(result!.tool).toBe('search_document');
  });

  it('tells the model the failure was ours and asks for the same call again', () => {
    // A bare failure reads to the model as "this tool cannot answer", and it
    // stops trying. The message has to say whose fault it was.
    const result = lostToolInputResult(call({ inputParseError: 'the stream ended before the tool input was complete' }));
    expect(result!.error).toContain('did not reach the tool');
    expect(result!.error).toContain('not a problem with the request');
    expect(result!.error).toContain('Call the tool again');
  });

  it('carries the underlying reason, so the failure is diagnosable', () => {
    const result = lostToolInputResult(call({ inputParseError: 'the stream ended before the tool input was complete' }));
    expect(result!.error).toContain('the stream ended before the tool input was complete');
  });
});
