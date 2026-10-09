// @vitest-environment jsdom
/**
 * The stopped-turn note, heard as well as seen.
 *
 * `anaActivity.test.tsx` pins what the note under a turn the loop cut short
 * SAYS (the round limit, a repeated step) and where Continue is offered. This
 * pins how a screen-reader or keyboard user meets the same note:
 *
 * - the stop is spoken from the one polite region, including when a turn that
 *   streamed a phase with no rows settles into the short branch (the region
 *   must be the node that was already mounted, or AT misses it);
 * - Continue is described by the sentence it answers, not a bare "Continue";
 * - pressing Continue does not drop focus to <body> when the host's send
 *   withdraws the button in the same render (WCAG 2.4.3).
 *
 * Separate from `anaActivity.test.tsx` only because that file is at the lint
 * size limit; the component and the note are the same.
 */

import React from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, within } from '@testing-library/react';

import { AnaActivity } from '../AnaActivity';
import type { AnaToolCall } from '../../components/ana/useAnaChat';

afterEach(cleanup);

const call = (over: Partial<AnaToolCall> = {}): AnaToolCall => ({
  name: 'compute_sample_size',
  label: 'Sample size — biostatistics engine',
  status: 'success',
  ...over,
});

describe('AnaActivity — the stop note is spoken, and Continue keeps its place', () => {
  const settled = { toolCalls: [call()], startedAt: 1_000, completedAt: 73_000 };
  const stoppedNote = (container: HTMLElement) => container.querySelector('.ana-activity-stopped') as HTMLElement | null;

  it('speaks the stop in the one polite region', () => {
    const { container } = render(<AnaActivity {...settled} stoppedReason="max_rounds" rounds={12} />);
    const live = container.querySelectorAll('[aria-live]');
    expect(live.length).toBe(1);
    expect(live[0].textContent).toContain("AnA reached this turn's round limit (12 rounds)");
  });

  it('speaks the stop when a turn with nothing to report settles — the polite region stays mounted', () => {
    // Streamed with a phase and no rows, then settled: the settled turn has no
    // body, so it renders the short branch. The live region must be the SAME
    // node across that change — a region that appears in the same paint as
    // its first content is the documented case AT misses, and a role=note
    // paragraph is not announced at all.
    const { container, rerender } = render(<AnaActivity streaming phase="Reading the results…" />);
    const before = container.querySelector('[aria-live]');
    expect(before?.textContent).toBe('Reading the results…');

    rerender(<AnaActivity stoppedReason="max_rounds" rounds={12} />);
    const live = container.querySelectorAll('[aria-live]');
    expect(live).toHaveLength(1);
    expect(live[0]).toBe(before);
    expect(live[0].getAttribute('aria-live')).toBe('polite');
    expect(live[0].textContent).toBe("AnA reached this turn's round limit (12 rounds) before she said she was done.");
    // And the note is there for a sighted reader, as before.
    expect(stoppedNote(container)).toBeTruthy();
  });

  it('names what Continue answers: the button is described by the stop sentence', () => {
    // A screen-reader user moving through buttons hears more than
    // "Continue, button". The visible label does not change.
    const { container } = render(<AnaActivity {...settled} stoppedReason="max_rounds" rounds={12} onContinue={vi.fn()} />);
    const button = within(stoppedNote(container)!).getByRole('button', { name: 'Continue' });
    const describedBy = button.getAttribute('aria-describedby');
    expect(describedBy).toBeTruthy();
    const description = document.getElementById(describedBy!);
    expect(description).toBeTruthy();
    expect(description!.textContent).toBe("AnA reached this turn's round limit (12 rounds) before she said she was done.");
    expect(stoppedNote(container)!.contains(description)).toBe(true);
  });

  it('keeps keyboard focus in place when Continue unmounts itself', () => {
    // The host withdraws Continue in the same render as the click: its send
    // makes a new turn the latest, so this one stops being offered it. Focus
    // on a removed button falls to <body>, and a keyboard or screen-reader
    // user loses their place. It lands on the note the button was in.
    function Host() {
      const [sent, setSent] = React.useState(false);
      return <AnaActivity {...settled} stoppedReason="max_rounds" rounds={12} onContinue={sent ? undefined : () => setSent(true)} />;
    }
    const { container } = render(<Host />);
    const button = within(stoppedNote(container)!).getByRole('button', { name: 'Continue' });
    button.focus();
    expect(document.activeElement).toBe(button);
    fireEvent.click(button);

    expect(container.querySelector('.ana-activity-continue')).toBeNull();
    expect(document.activeElement).not.toBe(document.body);
    expect(document.activeElement).toBe(stoppedNote(container));
    // Focusable by script only: the note does not join the tab order.
    expect(stoppedNote(container)!.getAttribute('tabindex')).toBe('-1');
  });
});
