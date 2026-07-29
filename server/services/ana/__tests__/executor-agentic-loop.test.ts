/**
 * Tests for executeAgenticLoop (server/services/ana/AnaToolExecutor.ts).
 *
 * executeAgenticLoop is the non-SSE chat path's adapter over the shared
 * runAgenticToolLoop core (server/services/ana/agentic-loop.ts). The loop's
 * orchestration contract (round chaining, the round cap, thrash detection) is
 * unit-tested directly against the core in tests/services/agentic-loop.test.ts;
 * these tests pin the behaviour that lives only in the adapter glue, driving the
 * real executeAgenticLoop through a scripted fake gateway:
 *   - local tool handlers dispatch in parallel within a round;
 *   - oversized tool results are capped before they re-enter the model context;
 *   - the per-tool onToolExecution hook fires once per tool in call order;
 *   - duplicate (thrash) tool calls stop the loop before the round cap;
 *   - an aborted signal short-circuits without running tools or a next round.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.hoisted(() => {
  process.env.NODE_ENV = process.env.NODE_ENV || 'test';
  process.env.DATABASE_URL =
    process.env.DATABASE_URL || 'postgresql://test:test@localhost:5432/test';
  process.env.SKIP_DB_STARTUP_TEST = 'true';
});

// Scripted gateway: tests push the per-round responses; route() shifts them in
// order (falling back to a no-tool final answer), recording each request so we
// can assert on what the model was actually sent.
const gatewayState = vi.hoisted(() => ({
  responses: [] as any[],
  calls: [] as any[],
  fallback: null as null | (() => any),
}));

vi.mock('../../ai-gateway/gateway', () => ({
  getGateway: () => ({
    route: async (req: any) => {
      gatewayState.calls.push(req);
      if (gatewayState.responses.length > 0) return gatewayState.responses.shift();
      if (gatewayState.fallback) return gatewayState.fallback();
      return { content: 'fallback-final', toolUses: [], usage: {}, provider: 'p', model: 'm', requestId: 'rf' };
    },
  }),
}));

import { executeAgenticLoop, registerToolHandler } from '../AnaToolExecutor';

const delay = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

const baseRequest = () => ({
  taskType: 'chat' as const,
  messages: [{ role: 'user' as const, content: 'investigate' }],
  maxTokens: 1024,
  tools: [{ name: 'noop' }] as any,
  toolChoice: 'auto' as const,
});

beforeEach(() => {
  gatewayState.responses = [];
  gatewayState.calls = [];
  gatewayState.fallback = null;
});

describe('executeAgenticLoop adapter', () => {
  it('runs a round\'s tools in parallel, caps oversized results, and returns the final answer', async () => {
    let active = 0;
    let maxActive = 0;
    const bigResult = 'x'.repeat(20_000);
    registerToolHandler('__test_par_a', async () => {
      active++;
      maxActive = Math.max(maxActive, active);
      await delay(25);
      active--;
      return bigResult; // also exercises result capping
    });
    registerToolHandler('__test_par_b', async () => {
      active++;
      maxActive = Math.max(maxActive, active);
      await delay(25);
      active--;
      return 'res-b';
    });

    gatewayState.responses = [
      {
        content: '',
        toolUses: [
          { id: 't1', name: '__test_par_a', input: {} },
          { id: 't2', name: '__test_par_b', input: {} },
        ],
        usage: {}, provider: 'p', model: 'm', requestId: 'r1',
      },
      { content: 'final answer', toolUses: [], usage: {}, provider: 'p', model: 'm', requestId: 'r2' },
    ];

    const hookCalls: string[] = [];
    const res = await executeAgenticLoop(baseRequest() as any, {
      onToolExecution: name => hookCalls.push(name),
    });

    // Final response is the model's no-tool answer.
    expect(res.content).toBe('final answer');

    // Both handlers were in flight at once → real parallel dispatch.
    expect(maxActive).toBe(2);

    // Hook fired once per tool, in the original call order.
    expect(hookCalls).toEqual(['__test_par_a', '__test_par_b']);

    // The follow-up request fed the (capped) tool results back, labelled by name.
    const followup = gatewayState.calls[1];
    const toolMsg = [...followup.messages].reverse().find((m: any) => m.role === 'user');
    expect(toolMsg.content).toContain('[Tool Result for __test_par_a (t1)]');
    expect(toolMsg.content).toContain('[Tool Result for __test_par_b (t2)]');
    expect(toolMsg.content).toContain('truncated to fit the model context');
    // Capped: the full 20k result must not be sent verbatim.
    expect(toolMsg.content).not.toContain(bigResult);
  });

  it('stops on duplicate (thrash) tool calls before the round cap', async () => {
    registerToolHandler('__test_thrash', async () => 'same-result');

    // The model keeps asking for the identical call every round.
    const dup = () => ({
      content: 'still working',
      toolUses: [{ id: `d${Math.random()}`, name: '__test_thrash', input: { q: 1 } }],
      usage: {}, provider: 'p', model: 'm', requestId: 'rd',
    });
    gatewayState.fallback = dup;

    const res = await executeAgenticLoop(baseRequest() as any, { maxRounds: 5 });

    // Thrash detection withdraws tools once the same call recurs past the limit,
    // so the loop terminates in 4 gateway calls rather than running all 5 rounds.
    expect(gatewayState.calls.length).toBe(4);
    expect(res.content).toBe('still working');
  });

  it('short-circuits when the abort signal is already set', async () => {
    const ran = vi.fn();
    registerToolHandler('__test_abort', async () => {
      ran();
      return 'should-not-run';
    });

    gatewayState.responses = [
      {
        content: 'first',
        toolUses: [{ id: 'a1', name: '__test_abort', input: {} }],
        usage: {}, provider: 'p', model: 'm', requestId: 'r1',
      },
      { content: 'should-not-reach', toolUses: [], usage: {}, provider: 'p', model: 'm', requestId: 'r2' },
    ];

    const controller = new AbortController();
    controller.abort();

    const res = await executeAgenticLoop(baseRequest() as any, { signal: controller.signal });

    // Only the initial generation ran; no tool round, no follow-up generation.
    expect(gatewayState.calls.length).toBe(1);
    expect(ran).not.toHaveBeenCalled();
    expect(res.content).toBe('first');
  });

  it('returns immediately when the first turn requests no tools', async () => {
    gatewayState.responses = [
      { content: 'direct answer', toolUses: [], usage: {}, provider: 'p', model: 'm', requestId: 'r1' },
    ];
    const res = await executeAgenticLoop(baseRequest() as any);
    expect(res.content).toBe('direct answer');
    expect(gatewayState.calls.length).toBe(1);
  });
});
