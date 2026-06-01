/**
 * Tests for the AnA agentic tool loop (server/services/ana/agentic-loop.ts).
 *
 * The loop is dependency-injected, so these drive it with scripted fake model
 * turns + a recording tool executor and assert the orchestration contract:
 * multi-round chaining, the round cap forcing a final answer, thrash detection,
 * fault tolerance, and the no-tool fast path.
 */

import { describe, it, expect, vi } from 'vitest';
import {
  runAgenticToolLoop,
  capToolResultForModel,
  mapWithConcurrency,
  describeToolPlan,
  type ModelTurn,
  type ToolCall,
  type ToolResultEntry,
} from '../../server/services/ana/agentic-loop';

const call = (name: string, input: Record<string, unknown> = {}, id = `${name}-${Math.random()}`): ToolCall => ({ id, name, input });

/** Build deps: `turns` are the model replies returned in order from callModel. */
function makeDeps(turns: ModelTurn[]) {
  const executed: ToolCall[][] = [];
  const includeToolsLog: boolean[] = [];
  let i = 0;
  const executeTools = vi.fn(async (calls: ToolCall[]): Promise<ToolResultEntry[]> => {
    executed.push(calls);
    return calls.map(c => ({ tool_use_id: c.id, name: c.name, content: `result:${c.name}` }));
  });
  const callModel = vi.fn(async (_r, _t, _round, includeTools: boolean): Promise<ModelTurn> => {
    includeToolsLog.push(includeTools);
    return turns[i++] ?? { text: 'fallback final', toolCalls: [] };
  });
  return { deps: { executeTools, callModel }, executed, includeToolsLog };
}

describe('runAgenticToolLoop', () => {
  it('returns immediately when the first turn has no tool calls', async () => {
    const { deps } = makeDeps([]);
    const r = await runAgenticToolLoop({ text: 'done', toolCalls: [] }, deps);
    expect(r.stoppedReason).toBe('no_more_tools');
    expect(r.rounds).toBe(0);
    expect(r.toolCallCount).toBe(0);
    expect(deps.executeTools).not.toHaveBeenCalled();
  });

  it('chains multiple rounds until the model stops calling tools', async () => {
    // Round 1 → model asks for another tool; round 2 → model answers.
    const { deps, executed, includeToolsLog } = makeDeps([
      { text: 'now searching', toolCalls: [call('search_document', { query: 'x' })] },
      { text: 'final answer', toolCalls: [] },
    ]);
    const r = await runAgenticToolLoop(
      { text: 'let me look', toolCalls: [call('extract_document_structure', { text: 'doc' })] },
      deps,
    );
    expect(r.rounds).toBe(2);
    expect(r.toolCallCount).toBe(2);
    expect(r.stoppedReason).toBe('no_more_tools');
    expect(executed[0][0].name).toBe('extract_document_structure');
    expect(executed[1][0].name).toBe('search_document');
    // Tools were offered on both non-terminal callModel turns.
    expect(includeToolsLog).toEqual([true, true]);
  });

  it('caps at maxRounds and forces a final answer (tools withdrawn on the last round)', async () => {
    // Model keeps asking for distinct tools forever.
    let n = 0;
    const callModel = vi.fn(async (_r, _t, _round, includeTools: boolean): Promise<ModelTurn> => {
      n++;
      return { text: `round ${n}`, toolCalls: includeTools ? [call('search_document', { query: `q${n}` })] : [] };
    });
    const executeTools = vi.fn(async (calls: ToolCall[]) =>
      calls.map(c => ({ tool_use_id: c.id, name: c.name, content: 'r' })));
    const r = await runAgenticToolLoop(
      { text: 'start', toolCalls: [call('search_document', { query: 'q0' })] },
      { executeTools, callModel },
      { maxRounds: 3 },
    );
    expect(r.rounds).toBe(3);
    expect(r.stoppedReason).toBe('max_rounds');
    // Last callModel invocation must have had tools withdrawn.
    const lastIncludeTools = callModel.mock.calls[callModel.mock.calls.length - 1][3];
    expect(lastIncludeTools).toBe(false);
  });

  it('detects thrashing (same call repeated) and withdraws tools to break the loop', async () => {
    const dup = () => call('search_document', { query: 'same' }, 'fixed');
    // Model repeats the identical call every round.
    const callModel = vi.fn(async (_r, _t, _round, includeTools: boolean): Promise<ModelTurn> => ({
      text: 'again', toolCalls: includeTools ? [dup()] : [],
    }));
    const executeTools = vi.fn(async (calls: ToolCall[]) =>
      calls.map(c => ({ tool_use_id: c.id, name: c.name, content: 'r' })));
    const r = await runAgenticToolLoop(
      { text: 'start', toolCalls: [dup()] },
      { executeTools, callModel },
      { maxRounds: 10, duplicateLimit: 2 },
    );
    // 1st + 2nd occurrence allowed; the 3rd (n>2) trips thrash detection.
    expect(r.stoppedReason).toBe('duplicate_thrash');
    expect(r.rounds).toBeLessThan(10);
  });

  it('continues when a tool result encodes an error (executor does not throw)', async () => {
    const executeTools = vi.fn(async (calls: ToolCall[]) =>
      calls.map(c => ({ tool_use_id: c.id, name: c.name, content: JSON.stringify({ error: 'boom' }) })));
    const callModel = vi.fn(async (_r, _t, _round, _inc): Promise<ModelTurn> =>
      ({ text: 'recovered and answered', toolCalls: [] }));
    const r = await runAgenticToolLoop(
      { text: 'start', toolCalls: [call('search_document', { query: 'x' })] },
      { executeTools, callModel },
    );
    expect(r.stoppedReason).toBe('no_more_tools');
    expect(r.rounds).toBe(1);
    expect(callModel).toHaveBeenCalledTimes(1);
  });

  it('rejects a maxRounds below 1', async () => {
    const { deps } = makeDeps([]);
    await expect(
      runAgenticToolLoop({ text: '', toolCalls: [call('x')] }, deps, { maxRounds: 0 }),
    ).rejects.toThrow(/at least 1/);
  });
});

describe('capToolResultForModel', () => {
  it('returns short content unchanged', () => {
    const s = 'a small tool result';
    expect(capToolResultForModel(s, 8000)).toBe(s);
  });

  it('truncates oversized content but keeps the head, tail, and a marker', () => {
    const big = 'H'.repeat(5000) + 'MIDDLE' + 'T'.repeat(5000);
    const capped = capToolResultForModel(big, 2000);
    expect(capped.length).toBeLessThan(big.length);
    expect(capped.length).toBeLessThan(2200); // ~limit + marker
    expect(capped.startsWith('H')).toBe(true);
    expect(capped.endsWith('T')).toBe(true);
    expect(capped).toMatch(/characters truncated/);
    expect(capped).not.toContain('MIDDLE'); // the omitted middle is dropped
  });

  it('clamps an unreasonably small limit so it never produces a negative tail', () => {
    const capped = capToolResultForModel('x'.repeat(1000), 10);
    expect(capped).toMatch(/truncated/);
    expect(capped.length).toBeGreaterThan(0);
  });
});

describe('mapWithConcurrency', () => {
  it('preserves input order even when workers resolve out of order', async () => {
    const delays = [30, 5, 20, 1];
    const out = await mapWithConcurrency(delays, async (d, i) => {
      await new Promise(r => setTimeout(r, d));
      return `${i}:${d}`;
    }, 4);
    expect(out).toEqual(['0:30', '1:5', '2:20', '3:1']);
  });

  it('never exceeds the concurrency limit', async () => {
    let active = 0;
    let peak = 0;
    await mapWithConcurrency(Array.from({ length: 10 }, (_, i) => i), async () => {
      active++;
      peak = Math.max(peak, active);
      await new Promise(r => setTimeout(r, 5));
      active--;
      return null;
    }, 3);
    expect(peak).toBeLessThanOrEqual(3);
    expect(peak).toBeGreaterThan(1); // actually ran in parallel
  });

  it('processes every item and handles the empty case', async () => {
    const out = await mapWithConcurrency([1, 2, 3, 4, 5], async n => n * 2, 2);
    expect(out).toEqual([2, 4, 6, 8, 10]);
    expect(await mapWithConcurrency([], async (n: number) => n, 4)).toEqual([]);
  });

  it('rejects a concurrency below 1', async () => {
    await expect(mapWithConcurrency([1], async n => n, 0)).rejects.toThrow(/at least 1/);
  });
});

describe('describeToolPlan', () => {
  it('produces friendly labels for known tools, incorporating key args', () => {
    const steps = describeToolPlan([
      call('extract_document_structure', { text: '...' }),
      call('search_document', { query: 'indemnification' }),
      call('compare_document_versions', { old_text: 'a', new_text: 'b' }),
    ]);
    expect(steps.map(s => s.label)).toEqual([
      'Analyzing the document structure',
      'Searching the document for "indemnification"',
      'Comparing the two document versions',
    ]);
    expect(steps[0].tool).toBe('extract_document_structure');
  });

  it('truncates long argument values in the label', () => {
    const long = 'x'.repeat(200);
    const [step] = describeToolPlan([call('search_document', { query: long })]);
    expect(step.label.length).toBeLessThan(120);
    expect(step.label).toContain('…');
  });

  it('falls back to a humanized name for unknown tools', () => {
    const [step] = describeToolPlan([call('some_new_tool', {})]);
    expect(step.label).toBe('Some new tool');
  });

  it('handles a missing query gracefully', () => {
    const [step] = describeToolPlan([call('search_literature', {})]);
    expect(step.label).toBe('Searching the literature for it');
  });
});
