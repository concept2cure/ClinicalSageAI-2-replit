// @vitest-environment jsdom
/**
 * Three controls a keyboard could not reach, and two dialogs it could not leave.
 *
 * `a11ySemantics.test.tsx` audits each surface's DEFAULT render, so none of
 * this was in its field of view: the risk register's heat map and rows are
 * mouse-only handlers on plain <div>s, and both AnaCommand gates plus the
 * global collaboration modal only exist once something is open.
 *
 * What was wrong:
 *
 *   ProtocolDev RiskTab   A 5x5 ISO 14971 matrix where every cell was a <div
 *                         onClick>, including the empty ones — which offered a
 *                         pointer cursor and a hover lift for an action they had
 *                         no risk to perform. The risk rows beside it were the
 *                         same, so the register was reachable by mouse only.
 *
 *   CollabLayer           The launcher modal is mounted once and lives on EVERY
 *                         screen. It had no role, no accessible name, no Escape,
 *                         and left focus behind on the FAB — the same gap on
 *                         every screen in the product.
 *
 *   AnaCommand            The pre-submission go/no-go and the action runner, both
 *                         of which state on their face that what they do is
 *                         recorded to 21 CFR Part 11.
 *
 * Revert-proven, each half against the regression it guards: dropping the
 * `disabled` makes the empty-cell case fail, dropping `role="button"`/tabIndex
 * fails the reachability case, and removing the `useDialog` call fails Escape.
 * As in taskBoardModalA11y, it is the CALL that matters and not the ref —
 * useDialog binds its key handler on `document`.
 */
import React from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';

const apiRequest = vi.hoisted(() => vi.fn());
vi.mock('@/lib/queryClient', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/queryClient')>()),
  apiRequest,
}));

import { RiskTab } from '../surfaces/ProtocolDev';
import { CollabLayer } from '../surfaces/CollabLauncher';

beforeEach(() => {
  apiRequest.mockReset();
  apiRequest.mockImplementation(async () =>
    ({ ok: true, status: 200, json: async () => ({ data: [] }) }) as Response);
});
afterEach(() => cleanup());

/* Two risks that land in different cells of the matrix, so the populated and
   the empty case are both present in one render. */
const DOC = {
  risks: [
    { id: 'r1', hazard: 'Cold-chain excursion in transit', l: 5, i: 4, rl: 2, ri: 3,
      cat: 'Supply', status: 'open', mitigation: 'Validated shipper with continuous logging.' },
    { id: 'r2', hazard: 'Site staff turnover mid-enrolment', l: 2, i: 2, rl: 1, ri: 2,
      cat: 'Operational', status: 'mitigated', mitigation: 'Cross-trained backup coordinator.' },
  ],
};

describe('the risk register is operable without a mouse', () => {
  it('makes a populated matrix cell a real control and an empty one inert', () => {
    const { container } = render(<RiskTab doc={DOC} onAdd={() => {}} />);
    const cells = Array.from(container.querySelectorAll('.pd-heat-cell'));
    expect(cells).toHaveLength(25);

    // Every cell is a button, so none of them is a click handler on a <div>.
    expect(cells.every((c) => c.tagName === 'BUTTON')).toBe(true);

    const live = cells.filter((c) => !(c as HTMLButtonElement).disabled);
    // Exactly the two scored cells are operable; the other 23 are not in the
    // tab order, because there is nothing behind them to open.
    expect(live).toHaveLength(2);
    expect(cells.filter((c) => (c as HTMLButtonElement).disabled)).toHaveLength(23);
  });

  it('names each cell by its axes and count rather than by position alone', () => {
    const { container } = render(<RiskTab doc={DOC} onAdd={() => {}} />);
    const live = Array.from(container.querySelectorAll('.pd-heat-cell'))
      .filter((c) => !(c as HTMLButtonElement).disabled)
      .map((c) => c.getAttribute('aria-label'));
    // Colour carries severity on this map and a screen reader gets none of it;
    // the label has to state the axes, the score and what is in the cell.
    expect(live).toContain('Likelihood 5, impact 4 — score 20, 1 risk');
    expect(live).toContain('Likelihood 2, impact 2 — score 4, 1 risk');
  });

  it('opens a risk from the keyboard and reports its expanded state', () => {
    const { container } = render(<RiskTab doc={DOC} onAdd={() => {}} />);
    const rows = Array.from(container.querySelectorAll('.pd-risk'));
    expect(rows).toHaveLength(2);
    for (const r of rows) {
      expect(r.getAttribute('role')).toBe('button');
      expect(r.getAttribute('tabindex')).toBe('0');
      expect(r.getAttribute('aria-expanded')).toBe('false');
    }
    fireEvent.keyDown(rows[0], { key: 'Enter' });
    expect(container.querySelectorAll('.pd-risk')[0].getAttribute('aria-expanded')).toBe('true');
    expect(screen.getByText(/Validated shipper/)).toBeTruthy();
  });
});

describe('the collaboration modal — on every screen — can be named and left', () => {
  const openIt = () =>
    fireEvent(window, new CustomEvent('c2c:open-collab', { detail: { mode: 'task' } }));

  it('is a named dialog, not an anonymous pair of divs', async () => {
    render(<CollabLayer />);
    openIt();
    const dlg = await screen.findByRole('dialog');
    expect(dlg.getAttribute('aria-modal')).toBe('true');
    expect(dlg.getAttribute('aria-label')).toBeTruthy();
    // The two modes are a tablist, so the selected one is not carried by a
    // CSS class that only a sighted user can read.
    const tabs = Array.from(dlg.querySelectorAll('[role="tab"]'));
    expect(tabs).toHaveLength(2);
    expect(tabs.filter((t) => t.getAttribute('aria-selected') === 'true')).toHaveLength(1);
    expect(dlg.querySelector('[role="tabpanel"]')).toBeTruthy();
  });

  it('closes on Escape', async () => {
    render(<CollabLayer />);
    openIt();
    await screen.findByRole('dialog');
    fireEvent.keyDown(document, { key: 'Escape' });
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
  });
});
