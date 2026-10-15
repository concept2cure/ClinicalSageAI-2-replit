/**
 * A tool call whose arguments were lost in transport is not run on `{}` by the
 * non-SSE loop (row 74, S5; brief D15).
 *
 * The gateway marks such a call with `inputParseError` and leaves `input` as
 * `{}`, which looks exactly like a call that asked for nothing. The stream has
 * refused to dispatch it since S1 (stream.ts, lostToolInputResult). The
 * adapter every other door uses — send-message, ana-intelligence,
 * ana-realtime, deep investigation, and the sub-agent child loop — dropped the
 * marker in toToolCall and ran the handler on `{}`. A child, with nobody
 * watching, would have run a search for nothing and reported it.
 *
 * Declared behaviour change for those four doors: a truncated tool input is
 * now an error result instead of a `{}` dispatch.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.hoisted(() => {
  process.env.NODE_ENV = process.env.NODE_ENV || 'test';
  process.env.DATABASE_URL = process.env.DATABASE_URL || 'postgresql://test:test@localhost:5432/test';
  process.env.SKIP_DB_STARTUP_TEST = 'true';
});

const gw = vi.hoisted(() => ({ responses: [] as any[], calls: [] as any[] }));

vi.mock('../../ai-gateway/gateway', () => ({
  getGateway: () => ({
    route: async (req: any) => {
      gw.calls.push(req);
      return gw.responses.shift() ?? { content: 'final', toolUses: [], usage: {}, provider: 'p', model: 'm', requestId: 'rf' };
    },
  }),
}));

vi.mock('../tool-authorization.js', async importOriginal => {
  const real = await importOriginal<typeof import('../tool-authorization.js')>();
  return {
    ...real,
    toolAuthorizationOf: (name: string, input: unknown) =>
      name.startsWith('__test') ? { class: 'read' as const } : real.toolAuthorizationOf(name, input),
  };
});

import { executeAgenticLoop, registerToolHandler } from '../AnaToolExecutor';
import { lostToolInputResult } from '../agentic-loop';
import type { AgenticToolEvent } from '../agentic-tool-dispatch';

const lostCall = (name: string) => ({
  content: 'calling',
  toolUses: [{ id: 'c1', name, input: {}, inputParseError: 'stream ended before the tool input closed' }],
  usage: {},
  provider: 'p',
  model: 'm',
  requestId: 'r1',
});
const request = () => ({
  taskType: 'chat' as const,
  messages: [{ role: 'user' as const, content: 'go' }],
  maxTokens: 1024,
  tools: [{ name: 'noop' }] as any,
  toolChoice: 'auto' as const,
});
/** The tool-result turn the model read after round 1. */
const resultTurn = () => String(gw.calls[1].messages.at(-1).content);

beforeEach(() => {
  gw.responses = [];
  gw.calls = [];
});

describe('a call whose arguments were lost is not run', () => {
  it('the handler is never called, and the model reads the lost-input result', async () => {
    const probe = vi.fn(async () => 'ran');
    registerToolHandler('__test_lost_probe', probe);
    gw.responses = [lostCall('__test_lost_probe')];
    const events: AgenticToolEvent[] = [];
    await executeAgenticLoop(request() as any, { onToolEvent: e => events.push(e) });

    expect(probe).not.toHaveBeenCalled();
    const expected = JSON.stringify(
      lostToolInputResult({ id: 'c1', name: '__test_lost_probe', input: {}, inputParseError: 'stream ended before the tool input closed' }),
    );
    expect(resultTurn()).toContain(expected);
    const end = events.find(e => e.phase === 'end');
    expect(end?.result).toBe(expected);
    expect(end?.errorMessage).toBe('stream ended before the tool input closed');
  });

  it('a tool outside the allowlist is still answered TOOL_NOT_OFFERED, not lost input', async () => {
    registerToolHandler('__test_lost_unoffered', vi.fn(async () => 'ran'));
    gw.responses = [lostCall('__test_lost_unoffered')];
    await executeAgenticLoop(request() as any, { allowedToolNames: new Set(['__test_other']) });
    expect(resultTurn()).toContain('TOOL_NOT_OFFERED');
    expect(resultTurn()).not.toContain('did not reach the tool');
  });

  it('control: a call with no parse error and empty input still runs', async () => {
    const probe = vi.fn(async () => 'ran-empty');
    registerToolHandler('__test_lost_control', probe);
    gw.responses = [{ ...lostCall('__test_lost_control'), toolUses: [{ id: 'c1', name: '__test_lost_control', input: {} }] }];
    await executeAgenticLoop(request() as any);
    expect(probe).toHaveBeenCalledTimes(1);
    expect(resultTurn()).toContain('ran-empty');
  });
});
