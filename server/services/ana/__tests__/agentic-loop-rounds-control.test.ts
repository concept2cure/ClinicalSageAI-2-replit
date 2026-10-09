/**
 * The loop's round-control primitives (row 74, slice S3): `stopWhen`, the
 * checkpoint's `pending` argument and its `'replan'` directive, the absolute
 * `roundCap`, and the pure `resolveRoundBudget`.
 *
 * Nothing in S3 opts into any of them. Each case below is the behaviour a
 * later slice relies on; the last block pins that a loop given none of them —
 * or given them in their inert form — runs exactly as it did before.
 */

import { describe, it, expect, vi } from 'vitest';
import {
  REDIRECTED_TOOL_RESULT,
  resolveRoundBudget,
  runAgenticToolLoop,
  type AgenticLoopOptions,
  type ModelTurn,
  type ToolCall,
  type ToolResultEntry,
} from '../agentic-loop.js';

const novelCall = (i: number): ToolCall => ({ id: `c${i}`, name: 'search', input: { q: `q${i}` } });
const sameCall = (): ToolCall => ({ id: 'cx', name: 'search', input: { q: 'same' } });

/** A model that keeps asking for `nextCalls(round)` while tools are offered, and a recording executor. */
function scripted(nextCalls: (round: number) => ToolCall[]) {
  const executeTools = vi.fn(async (calls: ToolCall[]): Promise<ToolResultEntry[]> =>
    calls.map(c => ({ tool_use_id: c.id, name: c.name, content: 'ok' })),
  );
  const callModel = vi.fn(
    async (_results: ToolResultEntry[], _prior: string, round: number, includeTools: boolean): Promise<ModelTurn> => ({
      text: `round ${round}`,
      toolCalls: includeTools ? nextCalls(round + 1) : [],
    }),
  );
  return { executeTools, callModel };
}

describe('stopWhen: a caller-owned budget ends the turn with a closing answer', () => {
  it.each(['budget_exhausted', 'approval_timeout'] as const)(
    "'%s' after round 2 withdraws tools from the round-2 model call and names itself",
    async reason => {
      const deps = scripted(i => [novelCall(i)]);
      const result = await runAgenticToolLoop({ text: '', toolCalls: [novelCall(1)] }, deps, {
        maxRounds: 10,
        stopWhen: round => (round >= 2 ? reason : null),
      });
      expect(result).toMatchObject({ rounds: 2, stoppedReason: reason, toolCallCount: 2 });
      expect(deps.callModel).toHaveBeenCalledTimes(2);
      expect(deps.callModel.mock.calls[1][3], 'the round-2 call still offered tools').toBe(false);
    },
  );

  it("'halt' ends the loop as cancelled with no further model call", async () => {
    const deps = scripted(i => [novelCall(i)]);
    const result = await runAgenticToolLoop({ text: '', toolCalls: [novelCall(1)] }, deps, {
      maxRounds: 10,
      stopWhen: () => 'halt',
    });
    expect(result).toMatchObject({ rounds: 1, stoppedReason: 'cancelled', toolCallCount: 1 });
    expect(deps.executeTools).toHaveBeenCalledTimes(1);
    expect(deps.callModel, 'a halted turn still called the model').not.toHaveBeenCalled();
  });

  it('a thrashing round still reports duplicate_thrash, not the budget', async () => {
    const deps = scripted(() => [sameCall()]);
    const result = await runAgenticToolLoop({ text: '', toolCalls: [sameCall()] }, deps, {
      maxRounds: 10,
      duplicateLimit: 1,
      stopWhen: round => (round >= 2 ? 'budget_exhausted' : null),
    });
    expect(result.stoppedReason).toBe('duplicate_thrash');
  });

  it('is asked once per executed round, with that round', async () => {
    const stopWhen = vi.fn((_round: number) => null);
    const deps = scripted(i => (i <= 3 ? [novelCall(i)] : []));
    await runAgenticToolLoop({ text: '', toolCalls: [novelCall(1)] }, deps, { maxRounds: 10, stopWhen });
    expect(stopWhen.mock.calls.map(c => c[0])).toEqual([1, 2, 3]);
  });
});

describe("the checkpoint sees what would run, and 'replan' replaces it", () => {
  it('hands the checkpoint the pending calls as its second argument', async () => {
    const seen: Array<[number, ToolCall[]]> = [];
    const deps = scripted(i => (i <= 2 ? [novelCall(i), novelCall(i + 100)] : []));
    await runAgenticToolLoop({ text: '', toolCalls: [novelCall(1), novelCall(101)] }, {
      ...deps,
      checkpoint: async (round, pending) => {
        seen.push([round, [...pending]]);
        return 'continue';
      },
    }, { maxRounds: 10 });
    expect(seen).toEqual([
      [1, [novelCall(1), novelCall(101)]],
      [2, [novelCall(2), novelCall(102)]],
    ]);
  });

  it('replan: the pending calls never run, the model reads one redirected result per call, the count is unchanged', async () => {
    const deps = scripted(i => (i === 2 ? [novelCall(2), novelCall(202)] : []));
    const result = await runAgenticToolLoop({ text: '', toolCalls: [novelCall(1)] }, {
      ...deps,
      checkpoint: async round => (round === 2 ? 'replan' : 'continue'),
    }, { maxRounds: 10 });

    expect(deps.executeTools, 'a replaced step was dispatched').toHaveBeenCalledTimes(1);
    expect(deps.executeTools.mock.calls[0][0]).toEqual([novelCall(1)]);
    const redirected = deps.callModel.mock.calls[1][0];
    expect(redirected).toEqual([
      { tool_use_id: 'c2', name: 'search', content: JSON.stringify(REDIRECTED_TOOL_RESULT('search')) },
      { tool_use_id: 'c202', name: 'search', content: JSON.stringify(REDIRECTED_TOOL_RESULT('search')) },
    ]);
    expect(result).toMatchObject({ rounds: 2, toolCallCount: 1, stoppedReason: 'no_more_tools' });
  });

  it('the redirected result says the step did not run and asks the model to follow the person', () => {
    const body = REDIRECTED_TOOL_RESULT('search_literature');
    expect(body).toMatchObject({ redirected: true, tool: 'search_literature' });
    expect(body.note).toMatch(/not run/i);
    expect(body.note).toMatch(/person/i);
  });

  it('the checkpoint is shown the pending step, not handed it: changing what it was shown changes nothing that runs', async () => {
    const deps = scripted(() => []);
    const tries: string[] = [];
    const attempt = (what: string, change: () => void) => {
      try {
        change();
        tries.push(`${what}: changed`);
      } catch {
        tries.push(`${what}: refused`);
      }
    };
    await runAgenticToolLoop({ text: '', toolCalls: [novelCall(1), novelCall(2)] }, {
      ...deps,
      checkpoint: async (_round, pending) => {
        const shown = pending as ToolCall[];
        attempt('input', () => {
          (shown[0].input as Record<string, unknown>).q = 'rewritten';
        });
        attempt('call', () => {
          shown[1].input = { q: 'swapped' };
        });
        attempt('list', () => {
          shown.splice(0, 1);
        });
        return 'continue';
      },
    }, { maxRounds: 10 });
    expect(deps.executeTools, 'the checkpoint changed what ran').toHaveBeenCalledWith([novelCall(1), novelCall(2)], 1);
    // The list and the calls are frozen, so a hook that tries fails loudly;
    // the input is its own copy, so writing into it reaches nothing.
    expect(tries).toEqual(['input: changed', 'call: refused', 'list: refused']);
  });

  it('abort still stops before the round, exactly as before', async () => {
    const deps = scripted(i => [novelCall(i)]);
    const result = await runAgenticToolLoop({ text: '', toolCalls: [novelCall(1)] }, {
      ...deps,
      checkpoint: async round => (round === 2 ? 'abort' : 'continue'),
    }, { maxRounds: 10 });
    expect(result).toEqual({ rounds: 1, toolCallCount: 1, stoppedReason: 'cancelled', extendedRounds: 0 });
  });
});

describe('roundCap: an absolute ceiling nothing raises', () => {
  it('bounds progress-earned extension', async () => {
    const deps = scripted(i => [novelCall(i)]);
    const result = await runAgenticToolLoop({ text: '', toolCalls: [novelCall(1)] }, deps, {
      maxRounds: 6,
      progressExtension: 30,
      roundCap: 20,
    });
    expect(result).toMatchObject({ rounds: 20, stoppedReason: 'max_rounds', extendedRounds: 14 });
  });

  it('bounds a ceiling that rises mid-turn (the demo promotion)', async () => {
    const deps = scripted(i => [novelCall(i)]);
    const result = await runAgenticToolLoop({ text: '', toolCalls: [novelCall(1)] }, deps, {
      ...resolveRoundBudget('balanced', 'auto'),
      maxRoundsFloor: () => 20,
    });
    expect(result.rounds, 'the demo floor lifted an Auto turn past its cap').toBe(20);
    expect(result.stoppedReason).toBe('max_rounds');
  });

  it('without it, the same demo-promoted Auto budget would have reached 34', async () => {
    const { maxRounds, progressExtension } = resolveRoundBudget('balanced', 'auto');
    const deps = scripted(i => [novelCall(i)]);
    const result = await runAgenticToolLoop({ text: '', toolCalls: [novelCall(1)] }, deps, {
      maxRounds,
      progressExtension,
      maxRoundsFloor: () => 20,
    });
    expect(result.rounds).toBe(34);
  });

  it('an always-novel Auto loop stops at 20', async () => {
    const deps = scripted(i => [novelCall(i)]);
    const result = await runAgenticToolLoop(
      { text: '', toolCalls: [novelCall(1)] },
      deps,
      resolveRoundBudget('balanced', 'auto'),
    );
    expect(result).toMatchObject({ rounds: 20, stoppedReason: 'max_rounds' });
  });

  it('a repeating Auto loop is cut for thrashing well before 20', async () => {
    const deps = scripted(() => [sameCall()]);
    const result = await runAgenticToolLoop(
      { text: '', toolCalls: [sameCall()] },
      deps,
      resolveRoundBudget('balanced', 'auto'),
    );
    expect(result.stoppedReason).toBe('duplicate_thrash');
    expect(result.rounds).toBeLessThan(20);
  });

  it('also bounds a base ceiling above it', async () => {
    const deps = scripted(i => [novelCall(i)]);
    const result = await runAgenticToolLoop({ text: '', toolCalls: [novelCall(1)] }, deps, {
      maxRounds: 30,
      roundCap: 20,
    });
    expect(result.rounds).toBe(20);
  });
});

describe('resolveRoundBudget', () => {
  it.each([
    ['balanced', null, { maxRounds: 6, progressExtension: 2 }],
    ['balanced', 'manual', { maxRounds: 6, progressExtension: 2 }],
    ['balanced', 'auto', { maxRounds: 6, progressExtension: 14, roundCap: 20 }],
    ['thorough', 'auto', { maxRounds: 10, progressExtension: 10, roundCap: 20 }],
    ['fast', 'auto', { maxRounds: 4, progressExtension: 16, roundCap: 20 }],
    ['thorough', null, { maxRounds: 10, progressExtension: 4 }],
  ] as const)('(%s, %s) → %j', (effort, policy, expected) => {
    expect(resolveRoundBudget(effort, policy)).toEqual(expected);
  });

  it('takes an explicit base ceiling (the demo base) and never lowers it', () => {
    expect(resolveRoundBudget('balanced', null, 34)).toEqual({ maxRounds: 34, progressExtension: 2 });
    expect(resolveRoundBudget('balanced', 'auto', 34)).toEqual({ maxRounds: 34, progressExtension: 2, roundCap: 20 });
  });

  it('adds no roundCap key outside Auto', () => {
    expect('roundCap' in resolveRoundBudget('balanced', null)).toBe(false);
    expect('roundCap' in resolveRoundBudget('balanced', 'manual')).toBe(false);
  });
});

describe('a loop that opts into nothing runs exactly as before', () => {
  type Script = { name: string; initial: ToolCall[]; next: (round: number) => ToolCall[]; options: AgenticLoopOptions };
  const scripts: Script[] = [
    { name: 'novel, capped', initial: [novelCall(1)], next: i => [novelCall(i)], options: { maxRounds: 3 } },
    { name: 'novel, extended', initial: [novelCall(1)], next: i => [novelCall(i)], options: { maxRounds: 2, progressExtension: 3 } },
    { name: 'thrash', initial: [sameCall()], next: () => [sameCall()], options: { maxRounds: 8, duplicateLimit: 2 } },
    { name: 'ends early', initial: [novelCall(1)], next: i => (i < 3 ? [novelCall(i)] : []), options: { maxRounds: 8 } },
    { name: 'demo floor', initial: [novelCall(1)], next: i => [novelCall(i)], options: { maxRounds: 2, maxRoundsFloor: () => 5 } },
  ];

  it.each(scripts)('$name: stopWhen returning null and no roundCap change nothing', async ({ initial, next, options }) => {
    const plain = scripted(next);
    const inert = scripted(next);
    const a = await runAgenticToolLoop({ text: '', toolCalls: initial }, plain, options);
    const b = await runAgenticToolLoop({ text: '', toolCalls: initial }, inert, { ...options, stopWhen: () => null });
    expect(b).toEqual(a);
    expect(inert.callModel.mock.calls.map(c => [c[2], c[3]])).toEqual(plain.callModel.mock.calls.map(c => [c[2], c[3]]));
    expect(inert.executeTools.mock.calls).toEqual(plain.executeTools.mock.calls);
  });

  it('a one-argument checkpoint that never replans behaves as before', async () => {
    const deps = scripted(i => (i <= 2 ? [novelCall(i)] : []));
    const rounds: number[] = [];
    const result = await runAgenticToolLoop({ text: '', toolCalls: [novelCall(1)] }, {
      ...deps,
      checkpoint: async (round: number) => {
        rounds.push(round);
        return 'continue' as const;
      },
    }, { maxRounds: 5 });
    expect(rounds).toEqual([1, 2]);
    expect(result).toEqual({ rounds: 2, toolCallCount: 2, stoppedReason: 'no_more_tools', extendedRounds: 0 });
  });
});
