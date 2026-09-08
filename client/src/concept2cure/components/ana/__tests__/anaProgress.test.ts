/**
 * The progress record's honesty contract, pinned.
 *
 * The record is what the work panel numbers like a plan, so its only rule is
 * that a phase exists once its event has arrived and never before. Two things
 * matter: a repeat of the same phase is not a new step, and a round that
 * really did come back for more IS one.
 */
import { describe, expect, it } from 'vitest';

import {
  advanceProgress,
  byRound,
  closeProgress,
  currentStep,
  settleRunningCalls,
  formatElapsed,
  formatStepDuration,
  summarizeToolWork,
  tallyTools,
} from '../anaProgress';
import type { AnaToolCall } from '../useAnaChat.types';

describe('advanceProgress — phases in the order they happened', () => {
  it('appends a new phase and closes the previous one at the same instant', () => {
    const a = advanceProgress(undefined, 'orchestrating', 'Planning…', 1000);
    const b = advanceProgress(a, 'loading_context', 'Loading project memory…', 1400);
    expect(b).toHaveLength(2);
    expect(b[0]).toMatchObject({ phase: 'orchestrating', status: 'done', startedAt: 1000, endedAt: 1400 });
    expect(b[1]).toMatchObject({ phase: 'loading_context', status: 'active', startedAt: 1400 });
    expect(b[1].endedAt).toBeUndefined();
  });

  it('does not duplicate the active phase when the same event repeats', () => {
    // Every `text` chunk advances to 'composing'; a thousand chunks are one phase.
    let p = advanceProgress(undefined, 'composing', 'Composing the answer', 1);
    for (let i = 2; i < 50; i += 1) p = advanceProgress(p, 'composing', 'Composing the answer', i);
    expect(p).toHaveLength(1);
    expect(p[0].startedAt).toBe(1);
  });

  it('treats a second tool round as a new phase — she went back for more', () => {
    const a = advanceProgress(undefined, 'running_tools', 'Running 3 steps…', 1);
    const b = advanceProgress(a, 'reading_results', 'Reading the results…', 2);
    const c = advanceProgress(b, 'running_tools', 'Round 2 — running 1 more step…', 3);
    expect(c.map((x) => x.label)).toEqual([
      'Running 3 steps…',
      'Reading the results…',
      'Round 2 — running 1 more step…',
    ]);
  });

  it('never mutates the record it was given', () => {
    const a = advanceProgress(undefined, 'orchestrating', 'Planning…', 1);
    const snapshot = JSON.stringify(a);
    advanceProgress(a, 'generating', 'Generating…', 2);
    expect(JSON.stringify(a)).toBe(snapshot);
  });
});

describe('closeProgress — the outcome is recorded, not assumed', () => {
  it('marks the active phase done at the end', () => {
    const p = closeProgress(advanceProgress(undefined, 'finalizing', 'Checking…', 10), 'done', 25);
    expect(p[0]).toMatchObject({ status: 'done', endedAt: 25 });
  });

  it('marks a cut-short phase stopped, not done', () => {
    const p = closeProgress(advanceProgress(undefined, 'running_tools', 'Running…', 10), 'stopped', 12);
    expect(p[0].status).toBe('stopped');
  });

  it('is a no-op on an empty or already-closed record', () => {
    expect(closeProgress(undefined, 'done', 1)).toEqual([]);
    const closed = closeProgress(advanceProgress(undefined, 'x', 'X', 1), 'done', 2);
    expect(closeProgress(closed, 'stopped', 3)).toEqual(closed);
  });
});

describe('durations', () => {
  it('formats elapsed time in whole units', () => {
    expect(formatElapsed(0)).toBe('0s');
    expect(formatElapsed(57_400)).toBe('57s');
    expect(formatElapsed(72_000)).toBe('1m 12s');
    expect(formatElapsed(2 * 3600_000 + 5 * 60_000)).toBe('2h 05m');
    expect(formatElapsed(-5)).toBe('0s');
  });

  it('formats a step in ms under a second and seconds above', () => {
    expect(formatStepDuration(340)).toBe('340 ms');
    expect(formatStepDuration(2_400)).toBe('2.4s');
    expect(formatStepDuration(14_000)).toBe('14s');
    expect(formatStepDuration(-1)).toBe('');
  });
});

const call = (over: Partial<AnaToolCall> = {}): AnaToolCall => ({
  name: 'search_literature',
  label: 'Searching the literature',
  status: 'success',
  ...over,
});

describe('tool tallies and the summary line', () => {
  it('counts what ran, what failed and how many rounds', () => {
    const t = tallyTools([
      call(),
      call({ name: 'compute_sample_size', label: 'Sample size', status: 'error', round: 1 }),
      call({ name: 'compare_versions', label: 'Comparing versions', status: 'running', round: 2 }),
    ]);
    expect(t).toEqual({ total: 3, running: 1, succeeded: 1, failed: 1, rounds: 2 });
  });

  it('summarises from the real labels and says nothing for no tools', () => {
    expect(summarizeToolWork([])).toBe('');
    expect(summarizeToolWork(undefined)).toBe('');
    expect(summarizeToolWork([call()])).toBe('searching the literature · 1 tool');
    expect(
      summarizeToolWork([
        call(),
        call(),
        call({ name: 'a', label: 'Analyzing the document' }),
        call({ name: 'b', label: 'Checking citations' }),
        call({ name: 'c', label: 'Computing the sample size' }),
      ]),
    ).toBe('searching the literature, analyzing the document, checking citations and 1 more · 5 tools');
  });

  it('finds the step in flight, latest first', () => {
    expect(currentStep([call(), call({ name: 'x', label: 'X', status: 'running' })])?.name).toBe('x');
    expect(currentStep([call()])).toBeNull();
  });
});

describe('settleRunningCalls — a step the turn never heard back from did not complete', () => {
  it('closes running steps with the given reason and leaves settled ones alone', () => {
    const calls: AnaToolCall[] = [
      call(),
      call({ name: 'x', label: 'X', status: 'running', startedAt: 5 }),
      call({ name: 'y', label: 'Y', status: 'error', message: 'already failed' }),
    ];
    const out = settleRunningCalls(calls, 'Not finished — the run was stopped.', 99)!;
    expect(out[0]).toBe(calls[0]);
    expect(out[1]).toMatchObject({ status: 'error', endedAt: 99, message: 'Not finished — the run was stopped.' });
    expect(out[2].message).toBe('already failed');
  });

  it('returns the same array when nothing is running (no needless re-render)', () => {
    const calls = [call()];
    expect(settleRunningCalls(calls, 'n/a', 1)).toBe(calls);
    expect(settleRunningCalls(undefined, 'n/a', 1)).toBeUndefined();
  });
});

describe('byRound — one grouping for the record and the dock', () => {
  it('groups by round in order and defaults an unrounded call to the first pass', () => {
    const g = byRound([call({ round: 2, name: 'b' }), call({ name: 'a' }), call({ round: 2, name: 'c' })]);
    expect(g.map((r) => [r.round, r.calls.map((c) => c.name)])).toEqual([
      [1, ['a']],
      [2, ['b', 'c']],
    ]);
  });
});
