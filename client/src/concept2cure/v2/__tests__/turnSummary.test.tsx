// @vitest-environment jsdom
/**
 * A turn's Summary (ANA-SUMMARY S4, docs/design/ANA_AGENT_WORK_VIEW_2026-10-08.md
 * §2.6, §2.7, §3, §5 S4 tests 1, 6, 7, 8).
 *
 *   1. (client half) The rows built from the live frames and the rows built
 *      from the record's /summary payload are the same rows.
 *   6. The footer: "Recorded" only for a verdict that passed on this read;
 *      "Record could not be verified" for one that did not; "Not recorded"
 *      with no record; "Recording…" while the confirm waits run.
 *   7. (client half) Declined, unanswered and authorised-then-failed steps
 *      render the server's sentence word for word; a step a sealed timeline
 *      announced and never finished says so.
 *   8. (client half) A stopped turn closes on its stop line; a lost
 *      connection reads "Stopped: this page lost its connection." with Continue.
 * And: notes read "AnA's words · not checked" until the answer is checked and
 * are never counted; a turn's Summary button opens it; on a phone it is a
 * dialog titled "Summary".
 */
import React from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';

import { TurnSummary, TurnSummarySheet } from '../TurnSummary';
import { AnaActivity } from '../AnaActivity';
import { summaryRows } from '../turnSummaryRows';
import type { AnaChatMessage } from '../../components/ana/useAnaChat';
import type { TimelineEvent } from '@shared/ana/turn-timeline';

const SHA = 'c'.repeat(64);
const T0 = Date.parse('2026-10-08T10:00:00.000Z');
const at = (s: number) => new Date(T0 + s * 1000).toISOString();

const fetchMock = vi.fn();
beforeEach(() => {
  fetchMock.mockReset();
  (globalThis.fetch as unknown) = fetchMock;
});
afterEach(cleanup);

const EVENTS: TimelineEvent[] = [
  { seq: 1, at: at(0), round: 1, kind: 'note', text: 'I will look in the Vault first.' },
  { seq: 2, at: at(0), round: 1, kind: 'step', phase: 'announced', step: 's1', task: null, source: 'vault', label: 'Searching the Vault', preview: 'shelf life' },
  { seq: 3, at: at(1), round: 1, kind: 'task', task: 't1', change: 'added', title: 'Find the reports' },
  { seq: 4, at: at(1), round: 1, kind: 'task', task: 't1', change: 'started', title: 'Find the reports' },
  {
    seq: 5, at: at(2), round: 1, kind: 'step', phase: 'finished', step: 's1', task: null, source: 'vault', label: 'Searched the Vault', preview: 'shelf life',
    status: 'success', heldBack: false, usedModel: false, ms: 2400, facts: [{ name: 'Searched for', value: 'shelf life' }, { name: 'Found', value: '3 matches' }, { name: 'Took', value: '2.4s' }],
  },
  { seq: 6, at: at(3), round: 2, kind: 'task', task: 't1', change: 'completed', title: 'Find the reports' },
  { seq: 7, at: at(372), round: 2, kind: 'end', outcome: 'answered', stoppedReason: null },
];

const turnWith = (over: Partial<AnaChatMessage>): AnaChatMessage => ({ id: 'a1', role: 'assistant', text: 'Twenty-four months.', ...over });

function serveSummary(payload: Record<string, unknown>, status = 200) {
  fetchMock.mockImplementation(async (url: string) =>
    url.includes('/summary')
      ? { ok: status === 200, status, json: async () => (status === 200 ? { success: true, data: payload } : { error: { message: payload.message } }) }
      : { ok: false, status: 404, json: async () => ({}) },
  );
}

const payloadOf = (events: TimelineEvent[] | null, ok = true) => ({
  id: 'rec-1', threadId: 'th-1', outcome: 'answered', startedAt: at(0), endedAt: at(372), schemaVersion: 'ana-turn-record/4',
  verdict: ok ? { ok: true } : { ok: false, reason: "The audit chain does not carry this record's hash." },
  recordSha256: SHA, events, controls: [], models: [{ provider: 'anthropic', model: 'claude-opus-5-5' }],
});

/** A row's words as a person reads them: each text node apart, nothing behind a closed chevron. */
function wordsOf(li: Element): string {
  const parts: string[] = [];
  const walk = document.createTreeWalker(li, 4 /* NodeFilter.SHOW_TEXT */);
  for (let n = walk.nextNode(); n; n = walk.nextNode()) {
    if (!n.parentElement?.closest('.ana-activity-detail')) parts.push(n.textContent ?? '');
  }
  return parts.join(' ').replace(/\s+/g, ' ').trim();
}

/** Each row as its words: what a person reads, top to bottom. */
const rowTexts = (container: HTMLElement) => Array.from(container.querySelectorAll('.ana-summary-list > li')).map(wordsOf);

describe('1. (client half) the same rows live and from the record', () => {
  it('rows built from the live frames equal the rows built from the /summary payload', async () => {
    const live = render(<TurnSummary turn={turnWith({ timeline: EVENTS })} live={false} />);
    const liveRows = rowTexts(live.container);
    cleanup();
    serveSummary(payloadOf(EVENTS));
    const sealed = render(<TurnSummary turn={turnWith({ turnRecord: { status: 'recorded', id: 'rec-1', sha256: SHA } })} live={false} />);
    await waitFor(() => expect(sealed.container.querySelector('.ana-summary-list')).not.toBeNull());
    expect(rowTexts(sealed.container)).toEqual(liveRows);
    expect(liveRows).toEqual([
      "I will look in the Vault first. AnA's words · not checked",
      'Searched the Vault 2.4s Vault · shelf life',
      'Added task Find the reports',
      'Started Find the reports',
      // The search was dispatched before the plan existed, so no step served the task (S5).
      'Completed Find the reports No steps recorded for this task',
      'Answered.',
    ]);
    // The header counts steps and sources from the server's events; the note is not counted.
    expect(sealed.container.querySelector('.ana-summary-head')?.textContent).toContain('1 step · 1 source · 6m 12s');
  });
});

describe('6. the footer says what the record is', () => {
  it('"Recorded", with the hash and Download, only for a verdict that passed on this read', async () => {
    serveSummary(payloadOf(EVENTS));
    render(<TurnSummary turn={turnWith({ turnRecord: { status: 'recorded', id: 'rec-1', sha256: SHA } })} live={false} />);
    await screen.findByText('Recorded');
    fireEvent.click(screen.getByText('Recorded').closest('button')!);
    expect(screen.getByText(`SHA-256 ${SHA}`)).toBeTruthy();
    expect(screen.getByText('Download the record for inspection')).toBeTruthy();
  });

  it('"Record could not be verified" for a verdict that failed, never "Recorded"', async () => {
    serveSummary(payloadOf(EVENTS, false));
    const { container } = render(<TurnSummary turn={turnWith({ turnRecord: { status: 'recorded', id: 'rec-1', sha256: SHA } })} live={false} />);
    await screen.findByText(/Record could not be verified/);
    expect(container.textContent).not.toMatch(/Recorded\b/);
  });

  it('"Not recorded" with no record', () => {
    render(<TurnSummary turn={turnWith({ timeline: EVENTS, turnRecord: { status: 'not_recorded', reason: 'x' } })} live={false} />);
    expect(screen.getByText('Not recorded')).toBeTruthy();
  });

  it('"Recording…" while the confirm waits run, so "Not recorded" never flashes', () => {
    const { container } = render(<TurnSummary turn={turnWith({ timeline: EVENTS, turnRecord: { status: 'unconfirmed' }, recordConfirming: true })} live={false} />);
    expect(screen.getByText('Recording…')).toBeTruthy();
    expect(container.textContent).not.toContain('Not recorded');
  });
});

describe('7. held and failed rows say the server\'s sentence, word for word', () => {
  const held = (step: string, heldBack: boolean, message: string): TimelineEvent[] => [
    { seq: 1, at: at(0), round: 1, kind: 'step', phase: 'announced', step, task: null, source: 'vault', label: 'Saving a document to the Vault', preview: 'Plan' },
    { seq: 2, at: at(1), round: 1, kind: 'step', phase: 'awaiting_approval', step, task: null, source: 'vault', label: 'Saving a document to the Vault', preview: 'Plan' },
    { seq: 3, at: at(9), round: 1, kind: 'step', phase: 'finished', step, task: null, source: 'vault', label: 'Saving a document to the Vault', preview: 'Plan', status: 'error', heldBack, message, usedModel: null, ms: 3, facts: [] },
  ];
  it.each([
    ['declined', true, 'You declined saving a document to the Vault, so it did not run.'],
    ['no answer', true, "Saving a document to the Vault did not run: it needs a person's authorisation (nobody decided in time)."],
    ['authorised, then failed', false, "AnA couldn't finish saving a document to the Vault and continued without it."],
  ])('%s', (_c, heldBack, sentence) => {
    const { container } = render(<TurnSummary turn={turnWith({ timeline: held('s1', heldBack, sentence) })} live={false} />);
    const note = container.querySelector('.ana-activity-note');
    expect(note?.textContent).toBe(sentence);
    // Never folded: the sentence is on the row, not behind the chevron.
    expect(note?.closest('.ana-activity-detail')).toBeNull();
  });

  it('a step a sealed timeline announced and never finished says so', () => {
    const { container } = render(<TurnSummary turn={turnWith({ timeline: [EVENTS[1]] })} live={false} />);
    expect(container.querySelector('.ana-activity-note')?.textContent).toBe('Did not finish. No result was recorded.');
  });
});

describe('8. (client half) how a stopped turn closes', () => {
  it('the record\'s end: cancelled steps keep their sentence, and the turn closes on "Stopped."', () => {
    const stopped: TimelineEvent[] = [
      { seq: 1, at: at(0), round: 1, kind: 'step', phase: 'announced', step: 's1', task: null, source: 'literature', label: 'Searching the literature', preview: 'shelf life' },
      { seq: 2, at: at(1), round: 1, kind: 'step', phase: 'finished', step: 's1', task: null, source: 'literature', label: 'Searching the literature', preview: 'shelf life', status: 'cancelled', heldBack: false, message: 'You stopped searching the literature before it finished.', usedModel: false, ms: 900, facts: [] },
      { seq: 3, at: at(1), round: 1, kind: 'end', outcome: 'stopped', stoppedReason: 'cancelled' },
    ];
    const { container } = render(<TurnSummary turn={turnWith({ timeline: stopped })} live={false} />);
    const rows = rowTexts(container);
    expect(rows[0]).toContain('You stopped searching the literature before it finished.');
    expect(rows[rows.length - 1]).toBe('Stopped.');
  });

  it('a lost connection reads "Stopped: this page lost its connection." with Continue', () => {
    const onContinue = vi.fn();
    render(<TurnSummary turn={turnWith({ timeline: [EVENTS[0], EVENTS[1]], interrupted: true })} live={false} onContinue={onContinue} />);
    expect(screen.getByText('Stopped: this page lost its connection.')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Continue' }));
    expect(onContinue).toHaveBeenCalled();
  });

  it('a turn the round limit stopped closes on its stop line, with Continue', () => {
    const rows = summaryRows([{ seq: 1, at: at(0), round: 8, kind: 'end', outcome: 'answered', stoppedReason: 'max_rounds' }], [], { live: false });
    expect(rows).toEqual([expect.objectContaining({ kind: 'end', text: 'Stopped at the round limit.', continuable: true })]);
  });

  it('the record\'s own end, when it says the page left, reads the same', () => {
    const rows = summaryRows([{ seq: 1, at: at(0), round: 0, kind: 'end', outcome: 'stopped', stoppedReason: 'client_disconnected' }], [], { live: false });
    expect(rows).toEqual([expect.objectContaining({ kind: 'end', text: 'Stopped: this page lost its connection.', continuable: true })]);
  });
});

describe('notes and the live view', () => {
  it('a note reads "AnA\'s words" once the answer is checked, and is never counted', () => {
    const { container } = render(
      <TurnSummary turn={turnWith({ timeline: EVENTS, evidence: { attempted: true, validated: true, sourceCount: 0, groundedClaims: 0, weakClaims: 0, missingSupport: 0, check: {} as never } })} live={false} />,
    );
    expect(rowTexts(container)[0]).toBe("I will look in the Vault first. AnA's words");
    expect(container.querySelector('.ana-summary-head')?.textContent).not.toMatch(/note/i);
  });

  it('while she works, a running step reads running and "Working…" closes the list', () => {
    const { container } = render(<TurnSummary turn={turnWith({ timeline: [EVENTS[0], EVENTS[1]], streaming: true, sentAt: Date.now() })} live />);
    const rows = rowTexts(container);
    expect(rows[1]).toContain('running');
    expect(rows[rows.length - 1]).toMatch(/^Working…/);
    expect(screen.getByText('Recording…')).toBeTruthy();
  });
});

describe('her plan', () => {
  const planStep = (status: 'success' | 'error'): TimelineEvent[] => [
    { seq: 1, at: at(0), round: 1, kind: 'step', phase: 'announced', step: 's1', task: null, source: 'plan', label: 'Updating the plan', preview: null },
    { seq: 2, at: at(0), round: 1, kind: 'step', phase: 'finished', step: 's1', task: null, source: 'plan', label: status === 'success' ? 'Updated the plan' : 'Updating the plan', preview: null, status, heldBack: false, usedModel: false, ms: 1, facts: [], ...(status === 'error' ? { message: "AnA couldn't finish updating the plan and continued without it." } : {}) },
  ];
  it('a plan update that went through is its task rows, not a step row', () => {
    const rows = summaryRows([...planStep('success'), EVENTS[2]], [], { live: false });
    expect(rows.map((r) => r.kind)).toEqual(['task']);
  });
  it('a plan update that failed stays a row, with its sentence', () => {
    const rows = summaryRows(planStep('error'), [], { live: false });
    expect(rows).toEqual([expect.objectContaining({ kind: 'step', message: "AnA couldn't finish updating the plan and continued without it." })]);
  });
  it('a live turn before its first event is working, not a turn that ran nothing', () => {
    const { container } = render(<TurnSummary turn={turnWith({ streaming: true, sentAt: Date.now() })} live />);
    expect(rowTexts(container)[0]).toMatch(/^Working…/);
    expect(container.textContent).not.toContain('ran no steps');
  });
});

describe('where the Summary opens', () => {
  it('a turn\'s Summary button opens it, beside the folded line and beside the live phase', () => {
    const onSummary = vi.fn();
    const { rerender } = render(<AnaActivity toolCalls={[{ name: 'x', label: 'Searched the Vault', status: 'success' }]} onSummary={onSummary} />);
    fireEvent.click(screen.getByRole('button', { name: 'Summary' }));
    rerender(<AnaActivity streaming phase="Running 1 step…" onSummary={onSummary} />);
    fireEvent.click(screen.getByRole('button', { name: 'Summary' }));
    expect(onSummary).toHaveBeenCalledTimes(2);
  });

  it('a host that shows no Summary has no button', () => {
    render(<AnaActivity toolCalls={[{ name: 'x', label: 'Searched the Vault', status: 'success' }]} />);
    expect(screen.queryByRole('button', { name: 'Summary' })).toBeNull();
  });

  it('on a phone it is a modal dialog titled "Summary" that Escape closes', () => {
    const onClose = vi.fn();
    render(<TurnSummarySheet turn={turnWith({ timeline: EVENTS })} live={false} onClose={onClose} />);
    const dialog = screen.getByRole('dialog', { name: 'Summary' });
    expect(dialog.getAttribute('aria-modal')).toBe('true');
    fireEvent.keyDown(document, { key: 'Escape' });
    expect(onClose).toHaveBeenCalled();
  });
});
