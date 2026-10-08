// @vitest-environment jsdom
/**
 * AnA's tasks in a turn's Summary (ANA-SUMMARY S5,
 * docs/design/ANA_AGENT_WORK_VIEW_2026-10-08.md §2.7 "Marked complete", §3.3
 * "Task", §5 S5 test 2; evidence docs/evidence/ANA-SUMMARY/2026-10-08/S5-task-attribution/).
 *
 *   2. A task AnA marked completed while both of its attributed steps failed
 *      carries "Marked complete by AnA · none of its 2 steps succeeded". A
 *      completed task with no attributed steps carries "No steps recorded for
 *      this task", and not the failure fact. A task with one step that
 *      failed and one that succeeded carries neither.
 * And: opening a task shows the list as it stood at that moment and the
 * steps attributed to it.
 */
import React from 'react';
import { afterEach, describe, expect, it } from 'vitest';
import { cleanup, fireEvent, render, within } from '@testing-library/react';

import { TurnSummary } from '../TurnSummary';
import { summaryRows, type SummaryRow } from '../turnSummaryRows';
import type { AnaChatMessage } from '../../components/ana/useAnaChat';
import type { StepEvent, TimelineEvent } from '@shared/ana/turn-timeline';

afterEach(cleanup);

const T0 = Date.parse('2026-10-08T10:00:00.000Z');
const at = (s: number) => new Date(T0 + s * 1000).toISOString();

const FAILED = "AnA couldn't finish searching the Vault and continued without it.";

/** One step, announced and finished, serving `task`. */
function step(seq: number, handle: string, task: string | null, label: string, ok: boolean): StepEvent[] {
  const base = { at: at(seq), round: 1, kind: 'step' as const, step: handle, task, source: 'vault' as const, preview: 'shelf life' };
  return [
    { ...base, seq, phase: 'announced', label: 'Searching the Vault' },
    {
      ...base, seq: seq + 1, phase: 'finished', label, status: ok ? 'success' : 'error', heldBack: false,
      usedModel: false, ms: 900, facts: [], ...(ok ? {} : { message: FAILED }),
    },
  ];
}
const task = (seq: number, id: string, change: 'added' | 'started' | 'completed', title: string): TimelineEvent => ({
  seq, at: at(seq), round: 1, kind: 'task', task: id, change, title,
});

const EVENTS: TimelineEvent[] = [
  task(1, 't1', 'added', 'Find the reports'),
  task(2, 't2', 'added', 'Read them'),
  task(3, 't3', 'added', 'List the claims'),
  task(4, 't1', 'started', 'Find the reports'),
  ...step(5, 's1', 't1', 'Searching the Vault', false),
  ...step(7, 's2', 't1', 'Searching the Vault', false),
  task(9, 't1', 'completed', 'Find the reports'),
  task(10, 't2', 'started', 'Read them'),
  task(11, 't2', 'completed', 'Read them'),
  task(12, 't3', 'started', 'List the claims'),
  ...step(13, 's3', 't3', 'Searching the Vault', false),
  ...step(15, 's4', 't3', 'Searched the Vault', true),
  task(17, 't3', 'completed', 'List the claims'),
  { seq: 18, at: at(18), round: 2, kind: 'end', outcome: 'answered', stoppedReason: null },
];

type TaskRow = Extract<SummaryRow, { kind: 'task' }>;
const completedRow = (rows: SummaryRow[], title: string) =>
  rows.find((r): r is TaskRow => r.kind === 'task' && r.verb === 'Completed' && r.title === title)!;

const NONE_SUCCEEDED = 'Marked complete by AnA · none of its 2 steps succeeded';
const NO_STEPS = 'No steps recorded for this task';

describe('2. what a completed task says about its steps', () => {
  const rows = summaryRows(EVENTS, [], { live: false });

  it('a task completed while both of its steps failed carries "none of its 2 steps succeeded"', () => {
    expect(completedRow(rows, 'Find the reports').fact).toBe(NONE_SUCCEEDED);
  });

  it('a completed task with no steps carries "No steps recorded for this task", not the failure fact', () => {
    const row = completedRow(rows, 'Read them');
    expect(row.fact).toBe(NO_STEPS);
    expect(JSON.stringify(row)).not.toContain('steps succeeded');
  });

  it('a completed task with one step that failed and one that succeeded carries neither', () => {
    expect(completedRow(rows, 'List the claims').fact).toBeUndefined();
  });

  it('Added and Started rows carry no fact', () => {
    expect(rows.filter((r): r is TaskRow => r.kind === 'task' && r.verb !== 'Completed').map((r) => r.fact)).toEqual(
      Array(6).fill(undefined),
    );
  });

  it('the fact is visible on the row, without opening it', () => {
    const turn: AnaChatMessage = { id: 'a1', role: 'assistant', text: 'Done.', timeline: EVENTS };
    const { container } = render(<TurnSummary turn={turn} live={false} />);
    const items = Array.from(container.querySelectorAll('.ana-summary-list > li'));
    const find = items.find((li) => /Completed\s*Find the reports/.test(li.textContent ?? ''))!;
    const read = items.find((li) => /Completed\s*Read them/.test(li.textContent ?? ''))!;
    expect(find.textContent).toContain(NONE_SUCCEEDED);
    expect(read.textContent).toContain(NO_STEPS);
    expect(read.textContent).not.toContain('steps succeeded');
  });
});

describe('opening a task', () => {
  it('lists the plan as it stood at that moment, and the steps attributed to the task', () => {
    const turn: AnaChatMessage = { id: 'a1', role: 'assistant', text: 'Done.', timeline: EVENTS };
    const { container } = render(<TurnSummary turn={turn} live={false} />);
    const items = Array.from(container.querySelectorAll('.ana-summary-list > li'));
    const find = items.find((li) => /Completed\s*Find the reports/.test(li.textContent ?? ''))!;
    fireEvent.click(within(find as HTMLElement).getAllByRole('button')[0]);
    const detail = find.querySelector('.ana-activity-detail')!;
    expect(detail).not.toBeNull();
    // The list at that moment: the first task completed, the others pending.
    expect(detail.textContent).toContain('Find the reports · completed');
    expect(detail.textContent).toMatch(/Read them(?! ·)/);
    // Its steps, each with its own sentence; never another task's step.
    const steps = detail.querySelectorAll('.ana-summary-task-steps > li');
    expect(steps).toHaveLength(2);
    expect(detail.textContent).toContain(FAILED);
    expect(detail.textContent).not.toContain('Searched the Vault');
  });

  it('each task row lists only the steps attributed to that task', () => {
    const rows = summaryRows(EVENTS, [], { live: false });
    expect(completedRow(rows, 'List the claims').steps.map((s) => s.label)).toEqual(['Searching the Vault', 'Searched the Vault']);
    expect(completedRow(rows, 'Read them').steps).toEqual([]);
  });
});
