// @vitest-environment jsdom
/**
 * A turn the run policy stopped says so, on every surface (row 74, slice S4).
 *
 * S1 made the loop's own stops visible (the round limit, a repeated step) and
 * left the run policy's four reasons unread, because nothing produced them.
 * S4 is what produces them, so each gets its words here in the same change:
 * a stopped turn must never fall through to "Finished".
 *
 *   budget_exhausted  Auto reached its time limit
 *   approval_timeout  nobody answered an approval; that change was not made
 *   hold_expired      Manual waited for the person, who did not come back
 *   hold_unavailable  Manual could not hold this turn, so she stopped
 *
 * The work panel's state line, the transcript's always-visible note (with the
 * steps a hold left unrun, and Continue), and the carriage from a turn to its
 * record are each pinned. While Manual is holding, the panel says she is
 * waiting for the person, not "Paused" (nobody pressed Pause).
 */
import React from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';

import { AnaActivity, activityPropsFor, hasReportableWork, stoppedNoteText } from '../AnaActivity';
import { AnaWorkPanel } from '../AnaWorkPanel';
import { progressChip, stateLineFor } from '../anaWorkModel';
import type { AnaChatMessage } from '../../components/ana/useAnaChat';
import { AUTO_ACTIVE_MS, AUTO_WALL_MS, MAX_PAUSE_MS } from '@shared/ana/run-control-limits';

afterEach(cleanup);

const T0 = 1_700_000_000_000;
const settled = (over: Partial<AnaChatMessage>): AnaChatMessage =>
  ({ id: 'a1', role: 'assistant', text: 'Partial.', sentAt: T0, completedAt: T0 + 90_000, ...over }) as AnaChatMessage;

describe('the work panel never reads Finished for a policy stop', () => {
  it.each([
    ['budget_exhausted', 'Stopped at the time limit · 1m 30s'],
    ['approval_timeout', 'Stopped: an approval was not answered · 1m 30s'],
    ['hold_expired', 'Stopped waiting for you · 1m 30s'],
    ['hold_unavailable', 'Stopped: Manual was unavailable · 1m 30s'],
  ] as const)('%s → %s', (stoppedReason, line) => {
    expect(stateLineFor(settled({ stoppedReason }), false, null, '1m 30s')).toBe(line);
    render(<AnaWorkPanel messages={[settled({ stoppedReason })]} streaming={false} />);
    expect(screen.getByText(line)).toBeTruthy();
    expect(screen.queryByText(/Finished/)).toBeNull();
  });

  it('a reopened stopped turn says so without a clock', () => {
    expect(stateLineFor(settled({ stoppedReason: 'hold_expired' }), false, null, '')).toBe('Stopped waiting for you');
  });

  it('while Manual holds, she is waiting for the person — not paused', () => {
    const live = settled({ streaming: true, completedAt: undefined });
    expect(stateLineFor(live, true, 'paused', '0m 40s', { reason: 'manual', next: ['Searching PubMed'] })).toBe(
      'Waiting for you · 0m 40s',
    );
    // A person's own pause is still a pause.
    expect(stateLineFor(live, true, 'paused', '0m 40s', { reason: 'person', next: [] })).toBe('Paused · 0m 40s');
    expect(stateLineFor(live, true, 'paused', '0m 40s', null)).toBe('Paused · 0m 40s');
  });

  it('the panel reads the hold it is given', () => {
    render(
      <AnaWorkPanel
        messages={[settled({ streaming: true, completedAt: undefined })]}
        streaming
        runStatus="paused"
        runHold={{ reason: 'manual', next: ['Searching PubMed'] }}
      />,
    );
    expect(screen.getByText(/^Waiting for you · /)).toBeTruthy();
  });
});

describe('the transcript says why, under the turn, with Continue', () => {
  const minutes = (ms: number) => ms / 60_000;

  it('the time limit names both ceilings, from the shared constants', () => {
    expect(stoppedNoteText('budget_exhausted', 7)).toBe(
      `AnA reached this turn's time limit (${minutes(AUTO_ACTIVE_MS)} minutes of work, ${minutes(AUTO_WALL_MS)} minutes in all) before she said she was done.`,
    );
  });

  it('an unanswered approval: the change was not made', () => {
    expect(stoppedNoteText('approval_timeout', 2)).toBe(
      `Nobody answered AnA's request within ${minutes(MAX_PAUSE_MS)} minutes, so that change was not made and she stopped.`,
    );
  });

  it('a Manual hold nobody answered names the step it did not run', () => {
    expect(stoppedNoteText('hold_expired', 1, ['Searching PubMed', 'Reading the protocol'])).toBe(
      `AnA waited ${minutes(MAX_PAUSE_MS)} minutes for you, then stopped before her next step: Searching PubMed; Reading the protocol.`,
    );
    expect(stoppedNoteText('hold_expired', 1)).toBe(
      `AnA waited ${minutes(MAX_PAUSE_MS)} minutes for you, then stopped before her next step.`,
    );
  });

  it('Manual that could not hold says why and what to do — switch to Auto, then Continue; never "try again"', () => {
    // Review follow-through (objection 32): Continue under Manual fails the
    // same way when the cause is structural, so the note never promises it.
    expect(stoppedNoteText('hold_unavailable', 1, ['Searching PubMed'])).toBe(
      'Manual needs run control, which was not available for this turn, so AnA stopped where she would have asked you. ' +
        'Next step: Searching PubMed. To let her go on, switch to Auto, then Continue.',
    );
  });

  it.each(['budget_exhausted', 'approval_timeout', 'hold_expired', 'hold_unavailable'] as const)(
    '%s: an always-visible note, Continue on the latest turn, and never dropped',
    (stoppedReason) => {
      const onContinue = vi.fn();
      const props = { ...activityPropsFor(settled({ stoppedReason, rounds: 3, pendingSteps: ['Searching PubMed'] })), onContinue };
      expect(hasReportableWork(props)).toBe(true);
      const { container } = render(<AnaActivity {...props} />);
      const note = container.querySelector('.ana-activity-stopped[role="note"]');
      expect(note?.textContent).toContain(stoppedNoteText(stoppedReason, 3, ['Searching PubMed']) ?? 'MISSING');
      expect(container.querySelector('.ana-activity-body')?.contains(note ?? null) ?? false).toBe(false);
      fireEvent.click(screen.getByRole('button', { name: 'Continue' }));
      expect(onContinue).toHaveBeenCalledTimes(1);
    },
  );
});

describe('a turn carries its policy and the steps it did not run to its record', () => {
  it('activityPropsFor', () => {
    const p = activityPropsFor(settled({ stoppedReason: 'hold_expired', rounds: 1, runPolicy: 'manual', pendingSteps: ['Searching PubMed'] }));
    expect(p).toMatchObject({ stoppedReason: 'hold_expired', rounds: 1, runPolicy: 'manual', pendingSteps: ['Searching PubMed'] });
  });
});

describe('review follow-through: every surface says what the hold is doing', () => {
  const live = settled({ streaming: true, completedAt: undefined });

  it('between hold_expired and done the state line says she stopped waiting, not "Still working"', () => {
    expect(stateLineFor(live, true, null, '10m 5s', { reason: 'expired', next: ['Searching PubMed'] })).toBe(
      'Stopped waiting for you · 10m 5s',
    );
  });

  it('the progress chip — what shows with the panel closed — says she is waiting, or paused', () => {
    expect(progressChip(live, true, 'paused', { reason: 'manual', next: ['Searching PubMed'] }).text).toBe('Waiting for you');
    expect(progressChip(live, true, 'paused', { reason: 'person', next: [] }).text).toBe('Paused');
    expect(progressChip(live, true, 'running', null).text).toBe('Working');
  });

  it('a Stop at a hold names the step it left unrun (a reload must not read as a plain Stop)', () => {
    expect(stoppedNoteText('cancelled', 1, ['Searching PubMed'])).toBe(
      'The run was stopped while AnA waited for you before her next step, so it did not run: Searching PubMed.',
    );
    // A Stop with nothing held still says the turn was stopped: without it the
    // transcript showed AnA's mark and nothing else (QA 2026-10-08, j5).
    expect(stoppedNoteText('cancelled', 1)).toBe('The run was stopped before AnA finished.');
  });

  it('a step replaced by a steer is shown as not run, beside the turn', () => {
    const props = activityPropsFor(settled({ replacedSteps: ['Searching PubMed'] }));
    expect(props.replacedSteps).toEqual(['Searching PubMed']);
    expect(hasReportableWork(props)).toBe(true);
    const { container } = render(<AnaActivity {...props} />);
    const note = [...container.querySelectorAll('[role="note"]')].find(n => /replaced/.test(n.textContent ?? ''));
    expect(note?.textContent).toBe('Not run — your steer replaced it: Searching PubMed.');
    expect(container.querySelector('.ana-activity-body')?.contains(note ?? null) ?? false).toBe(false);
  });
});
