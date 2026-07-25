/**
 * Tests for the agentic-loop depth + resilience helpers: the effort → round
 * ceiling, progress-earned extension, per-round tool-result budgeting, and the
 * failure adaptation note. All pure.
 */

import { describe, it, expect } from 'vitest';
import {
  resolveMaxRounds,
  resolveRoundExtension,
  runAgenticToolLoop,
  budgetToolResultsForModel,
  buildAdaptationNote,
  type ModelTurn,
  type ToolCall,
  type ToolResultEntry,
} from '../agentic-loop.js';

describe('resolveMaxRounds', () => {
  it('scales the round ceiling by effort', () => {
    expect(resolveMaxRounds('fast')).toBe(4);
    expect(resolveMaxRounds('balanced')).toBe(6);
    expect(resolveMaxRounds('thorough')).toBe(10);
  });

  it('lifts the old flat cap of 5 for the default (balanced) turn', () => {
    expect(resolveMaxRounds('balanced')).toBeGreaterThan(5);
  });

  it('falls back to the balanced ceiling for unknown/absent effort', () => {
    expect(resolveMaxRounds(undefined)).toBe(6);
    expect(resolveMaxRounds(null)).toBe(6);
    expect(resolveMaxRounds('nonsense')).toBe(6);
  });

  it('never returns fewer rounds than needed to chain a real investigation', () => {
    // extract → search → cross-check → reconcile → draft is 5 steps; the old
    // flat cap of 5 could cut the draft. Every tier now clears that chain.
    for (const effort of ['fast', 'balanced', 'thorough'] as const) {
      expect(resolveMaxRounds(effort)).toBeGreaterThanOrEqual(4);
    }
    expect(resolveMaxRounds('balanced')).toBeGreaterThanOrEqual(6);
  });
});

describe('resolveRoundExtension', () => {
  it('scales the progress-earned allowance by effort', () => {
    expect(resolveRoundExtension('fast')).toBe(0);
    expect(resolveRoundExtension('balanced')).toBe(2);
    expect(resolveRoundExtension('thorough')).toBe(4);
  });

  it('falls back to the balanced allowance for unknown/absent effort', () => {
    expect(resolveRoundExtension(undefined)).toBe(2);
    expect(resolveRoundExtension('nonsense')).toBe(2);
  });
});

describe('runAgenticToolLoop — progress-earned extension', () => {
  /** A tool call with a unique input per index so each round is novel. */
  const novelCall = (i: number): ToolCall => ({ id: `c${i}`, name: 'search', input: { q: `q${i}` } });
  const sameCall = (): ToolCall => ({ id: 'cx', name: 'search', input: { q: 'same' } });

  /** Deps whose model keeps asking for the given calls while tools are offered. */
  const scriptedDeps = (nextCalls: (round: number) => ToolCall[]) => ({
    executeTools: async (calls: ToolCall[]): Promise<ToolResultEntry[]> =>
      calls.map(c => ({ tool_use_id: c.id, name: c.name, content: 'ok' })),
    callModel: async (
      _results: ToolResultEntry[],
      _priorText: string,
      round: number,
      includeTools: boolean,
    ): Promise<ModelTurn> => ({
      text: `round ${round}`,
      toolCalls: includeTools ? nextCalls(round + 1) : [],
    }),
  });

  it('extends past maxRounds while every round tries novel work', async () => {
    const result = await runAgenticToolLoop(
      { text: '', toolCalls: [novelCall(1)] },
      scriptedDeps(i => [novelCall(i)]),
      { maxRounds: 2, progressExtension: 2 },
    );
    // 2 base rounds + 2 progress-earned extensions, then a forced final answer.
    expect(result.rounds).toBe(4);
    expect(result.extendedRounds).toBe(2);
    expect(result.stoppedReason).toBe('max_rounds');
  });

  it('does NOT extend when the model is repeating itself', async () => {
    const result = await runAgenticToolLoop(
      { text: '', toolCalls: [sameCall()] },
      scriptedDeps(() => [sameCall()]),
      { maxRounds: 2, progressExtension: 2, duplicateLimit: 5 },
    );
    // Round 2 repeats round 1's exact call → no novelty → no extension.
    expect(result.rounds).toBe(2);
    expect(result.extendedRounds).toBe(0);
    expect(result.stoppedReason).toBe('max_rounds');
  });

  it('default behavior is unchanged when progressExtension is not set', async () => {
    const result = await runAgenticToolLoop(
      { text: '', toolCalls: [novelCall(1)] },
      scriptedDeps(i => [novelCall(i)]),
      { maxRounds: 2 },
    );
    expect(result.rounds).toBe(2);
    expect(result.extendedRounds).toBe(0);
  });

  it('thrash still cuts the loop even with extension headroom', async () => {
    const result = await runAgenticToolLoop(
      { text: '', toolCalls: [sameCall()] },
      scriptedDeps(() => [sameCall()]),
      { maxRounds: 5, progressExtension: 3, duplicateLimit: 1 },
    );
    expect(result.stoppedReason).toBe('duplicate_thrash');
    expect(result.extendedRounds).toBe(0);
  });
});

describe('budgetToolResultsForModel', () => {
  const entry = (id: string, size: number): ToolResultEntry => ({
    tool_use_id: id,
    name: `tool_${id}`,
    content: 'x'.repeat(size),
  });

  it('passes small rounds through byte-identical (classic per-result caps)', () => {
    const entries = [entry('a', 1000), entry('b', 2000)];
    const out = budgetToolResultsForModel(entries);
    expect(out[0].content).toBe(entries[0].content);
    expect(out[1].content).toBe(entries[1].content);
  });

  it('squeezes an oversized round into the total budget', () => {
    const entries = [entry('a', 10000), entry('b', 10000), entry('c', 10000), entry('d', 10000)];
    const out = budgetToolResultsForModel(entries, { totalBudget: 24000 });
    // Equal share of 6000 each; the truncation marker adds a small overhead.
    for (const e of out) {
      expect(e.content.length).toBeLessThan(6200);
      expect(e.content).toContain('truncated to fit the model context');
    }
  });

  it('never squeezes a result below the floor', () => {
    const entries = Array.from({ length: 20 }, (_, i) => entry(String(i), 9000));
    const out = budgetToolResultsForModel(entries, { totalBudget: 24000, minPerResult: 1500 });
    for (const e of out) {
      // Floor share is 1500; capped content stays in that vicinity, never tiny.
      expect(e.content.length).toBeGreaterThan(1200);
      expect(e.content.length).toBeLessThan(1700);
    }
  });

  it('handles an empty round', () => {
    expect(budgetToolResultsForModel([])).toEqual([]);
  });
});

describe('buildAdaptationNote', () => {
  it('returns empty when nothing failed', () => {
    expect(buildAdaptationNote([], 3)).toBe('');
  });

  it('names the failures and coaches adaptation, not retry', () => {
    const note = buildAdaptationNote(
      [
        { name: 'search_literature', label: 'Searching the literature', error: 'timeout after 30s' },
        { name: 'lookup_fda_guidance', error: 'HTTP 404' },
      ],
      3,
    );
    expect(note).toContain('2 of 3 tool calls failed');
    expect(note).toContain('Searching the literature — timeout after 30s');
    expect(note).toContain('Lookup fda guidance — HTTP 404');
    expect(note).toContain('Do not repeat a failed call verbatim');
  });

  it('truncates a pathological error message', () => {
    const note = buildAdaptationNote([{ name: 't', error: 'e'.repeat(500) }], 1);
    expect(note.length).toBeLessThan(400);
    expect(note).toContain('…');
    expect(note).toContain('1 of 1 tool call failed');
  });
});
