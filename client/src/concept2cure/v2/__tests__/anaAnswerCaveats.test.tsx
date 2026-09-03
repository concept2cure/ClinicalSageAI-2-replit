// @vitest-environment jsdom
/**
 * A truncated answer must not read as a finished one.
 *
 * WHAT WENT WRONG
 * `useAnaChat` handles two things that qualify an answer rather than describe
 * the work behind it: a `warning` event from the server (degraded mode), and a
 * client-side timeout. The timeout path is the sharp one — when tokens have
 * already streamed it KEEPS them:
 *
 *     text: m.text.length > 0 ? m.text : 'AnA stopped responding before …',
 *     warnings: [...(m.warnings || []), 'Response timed out'],
 *
 * so the only record that the turn was cut off is `warnings`. The v2 rail
 * carried `executedActions`, `pendingSignoffs` and the whole activity record
 * across — and not `warnings`. A turn that died mid-sentence rendered its
 * partial text with nothing marking it partial: an incomplete result presented
 * as a complete one, on a surface people draft submission content with.
 *
 * WHY IT IS NOT PART OF THE WORK RECORD
 * The activity record answers "how did she get here" and collapses behind a
 * disclosure. A caveat answers "how much should I trust this", which is not
 * something a reader should have to expand a twisty to discover.
 */
import React from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';

// Same stubs the other AnaRail suites use: the rail pulls live data and auth
// headers on mount, neither of which this file is about.
vi.mock('../dataConnect', () => ({
  connected: () => false,
}));
vi.mock('../../../utils/authToken', () => ({
  getAuthHeaders: () => ({ Authorization: 'Bearer test' }),
}));

import { AnaRail, type AnaMessage } from '../Shell';

afterEach(cleanup);

const surface = { id: 'cmc', label: 'CMC' };

function renderRail(messages: AnaMessage[]) {
  return render(
    <AnaRail
      open
      setOpen={() => {}}
      surface={surface}
      segment="biotech"
      mode="standard"
      setMode={() => {}}
      messages={messages}
      onSend={vi.fn()}
      onAct={vi.fn()}
      projectId={42}
    />,
  );
}

describe('an answer carries its own caveats', () => {
  it('says a turn timed out, instead of showing the partial text as final', () => {
    renderRail([
      { role: 'ana', body: 'The non-inferiority margin should be', warnings: ['Response timed out'] },
    ]);

    // The partial answer is still shown — it is real, and discarding it would
    // lose work. What must NOT happen is showing it unmarked.
    expect(screen.getByText(/The non-inferiority margin should be/)).toBeTruthy();
    expect(screen.getByText('Response timed out')).toBeTruthy();
  });

  it('surfaces a degraded-mode warning from the server', () => {
    renderRail([{ role: 'ana', body: 'Here is the summary.', warnings: ['Running in degraded mode'] }]);

    expect(screen.getByText('Running in degraded mode')).toBeTruthy();
  });

  it('shows every caveat, not just the first', () => {
    renderRail([
      { role: 'ana', body: 'Partial.', warnings: ['Running in degraded mode', 'Response timed out'] },
    ]);

    expect(screen.getByText('Running in degraded mode')).toBeTruthy();
    expect(screen.getByText('Response timed out')).toBeTruthy();
  });

  it('does not need the disclosure opened — a caveat you must hunt for is hidden', () => {
    const { container } = renderRail([
      { role: 'ana', body: 'Partial.', warnings: ['Response timed out'] },
    ]);

    // Nothing was expanded; the caveat is in the DOM and outside the record.
    expect(container.querySelector('.ana-activity-body')).toBeNull();
    expect(container.querySelector('.ana-msg-warning')).toBeTruthy();
  });

  it('never states a caveat in colour alone', () => {
    // --warning carries meaning here, so the glyph and the sentence must both
    // say it too (WCAG 1.4.1).
    const { container } = renderRail([
      { role: 'ana', body: 'Partial.', warnings: ['Response timed out'] },
    ]);

    const row = container.querySelector('.ana-msg-warning');
    expect(row?.querySelector('.ana-msg-warning-ic svg')).toBeTruthy();
    expect(row?.textContent).toContain('Response timed out');
  });

  it('a clean turn gets no caveat furniture at all', () => {
    const { container } = renderRail([{ role: 'ana', body: 'Here is the answer.' }]);

    expect(container.querySelector('.ana-msg-warnings')).toBeNull();
  });

  it('an empty warnings array is not a caveat', () => {
    const { container } = renderRail([{ role: 'ana', body: 'Here is the answer.', warnings: [] }]);

    expect(container.querySelector('.ana-msg-warnings')).toBeNull();
  });
});
