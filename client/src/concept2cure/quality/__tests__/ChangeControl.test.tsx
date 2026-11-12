// @vitest-environment jsdom
/**
 * Change Control surface — the Quality & Assurance change-control log.
 *
 * Proves the four things the brief asks for actually render and are wired to
 * AnA (the governed-action path):
 *   - the change-control log renders the register with classification + status;
 *   - the lifecycle flowchart shows the live per-stage load, and a node filters
 *     the log to that stage;
 *   - a change expands to its linked deviations / CAPAs / validation records;
 *   - "raise a change request" opens the governed drawer (its write, and the
 *     change-form gallery's, are asserted in qmsGovernedActions.test.tsx);
 *     "explain the procedure" stays a question for AnA.
 *
 * The hooks are mocked to RESOLVE with the canonical rows, so the surface has
 * real data to render.
 *
 * They used to be mocked to the load state (`changes: null`) and the surface
 * fell through to `?? FIXTURE_CHANGES`. That made this file a test OF the
 * ungated fallback — on a GxP change-control register, where the rows assert
 * `classification: 'major'` and `status: 'approved'`, and where the fallback
 * fired on an empty tenant, an expired token or a 500 with nothing on screen
 * saying so. The fallback is gone (first gated behind sample mode, then removed
 * with it on 2026-10-14), so a null hook correctly renders an empty register
 * and these assertions correctly stopped passing.
 * Nothing they actually test — the flowchart, the stage filter, the expansion,
 * the AnA wiring — is about where the rows came from, so the mock supplies
 * them as live data and every case stands unchanged.
 *
 * Plain DOM assertions (no jest-dom) to match the sibling surface tests.
 *
 * The pane is CONTROLLED now — stage / openId / the register rows live in
 * QualityApp so AnA's quality.* surface actions and the pane's own controls
 * drive one state. The harness below owns that lifted state exactly the way
 * the shell does, so every behavioral case here stands unchanged.
 */

import * as React from 'react';
import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen, cleanup, fireEvent, within } from '@testing-library/react';

vi.mock('../changeHooks', async () => {
  const { CHANGE_SUMMARY: FIXTURE_SUMMARY } = await import('./changeRows');
  return {
    useChangeSummary: () => ({ summary: FIXTURE_SUMMARY, loading: false, error: null }),
  };
});

import { ChangeControl } from '../ChangeControl';
import { type ChangeState } from '../changeData';
import { CHANGE_ROWS as FIXTURE_CHANGES } from './changeRows';

function Harness({ onAsk }: { onAsk: (q: string) => void }) {
  const [stage, setStage] = React.useState<ChangeState | 'all'>('all');
  const [openId, setOpenId] = React.useState<number | null>(null);
  return (
    <ChangeControl
      onAsk={onAsk}
      stage={stage}
      onStageChange={setStage}
      openId={openId}
      onOpenIdChange={setOpenId}
      changes={FIXTURE_CHANGES}
      loading={false}
    />
  );
}

afterEach(cleanup);

describe('ChangeControl — the change-control log', () => {
  it('renders the register from fixtures with numbers and status', () => {
    render(<Harness onAsk={() => {}} />);
    expect(screen.getByText('CC-2026-014')).toBeTruthy();
    expect(screen.getByText('Sterile filter supplier change (0.22 µm)')).toBeTruthy();
    // classification + status labels present
    expect(screen.getAllByText('Under assessment').length).toBeGreaterThan(0);
    expect(screen.getByText('Critical')).toBeTruthy();
  });

  // D7-B (2026-11-10): the lifecycle is the log's stage filter, one .seg, not a box of six count tiles.
  it('filters by lifecycle stage with one segmented control whose items carry the stage and its count', () => {
    const { container } = render(<Harness onAsk={() => {}} />);
    const stages = screen.getByRole('group', { name: 'Lifecycle stage' });
    expect(stages.classList.contains('seg')).toBe(true);
    expect(within(stages).getByRole('button', { name: 'All' }).getAttribute('aria-pressed')).toBe('true');
    // Each stage is a button whose accessible name carries the stage + count.
    expect(within(stages).getByRole('button', { name: /Proposed: 1 change/ })).toBeTruthy();
    expect(within(stages).getByRole('button', { name: /Verification: 1 change/ })).toBeTruthy();
    expect(within(stages).getByRole('button', { name: /Rejected: 0 changes/ })).toBeTruthy();
    expect(container.querySelector('.qcc-node, .qcc-flow, .qcc-offramp')).toBeNull();
    expect(screen.queryByRole('button', { name: /Explain the pipeline|Clear filter/ })).toBeNull();
  });

  it('filters the log when a flowchart stage is selected', () => {
    render(<Harness onAsk={() => {}} />);
    // Both a proposed (CC-2026-001) and an under-assessment (CC-2026-014) row show.
    expect(screen.getByText('CC-2026-001')).toBeTruthy();
    expect(screen.getByText('CC-2026-014')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: /Proposed: 1 change/ }));
    // Now only the proposed change remains in the log.
    expect(screen.getByText('CC-2026-001')).toBeTruthy();
    expect(screen.queryByText('CC-2026-014')).toBeNull();
    // "All" is the clear.
    fireEvent.click(within(screen.getByRole('group', { name: 'Lifecycle stage' })).getByRole('button', { name: 'All' }));
    expect(screen.getByText('CC-2026-014')).toBeTruthy();
  });

  // C8 (2026-11-10): the log is D0's table, as the SOP register (C6), with real column headers.
  it('is a table with column headers, one body per change, and the shared chips', () => {
    const { container } = render(<Harness onAsk={() => {}} />);
    const table = screen.getByRole('table');
    expect(table.classList.contains('reg-tbl')).toBe(true);
    expect(within(table).getAllByRole('columnheader').map((h) => h.textContent))
      .toEqual(['Number', 'Title', 'Type', 'Class', 'Status', 'Target', 'Links']);
    expect(container.querySelectorAll('tbody.qcc-change')).toHaveLength(FIXTURE_CHANGES.length);
    expect(screen.getByText('Critical').className).toBe('rd-chip tone-err');
    expect(container.querySelector('.qms-row, .qms-thead, .qcc-class, .qms-pill, .qms-tag, .qms-chip')).toBeNull();
  });

  // P-122: a change shows the moves that fit its state inline, and Ask AnA as an icon; More keeps the rest.
  it('shows each change the moves that fit its state inline; the rest are behind More', () => {
    const onAsk = vi.fn();
    render(<Harness onAsk={onAsk} />);
    // The record's facts, then the line of actions under them (w37).
    const names = (row: HTMLElement) => [...row.querySelectorAll<HTMLElement>(':scope > tr:not(.qms-row-more-tr):not(.qcc-detail-tr) button')]
      .map((b) => b.getAttribute('aria-label') ?? b.textContent?.trim());
    // Under assessment: Approve (the signed route) and Advance are inline.
    const assessed = screen.getByText('CC-2026-014').closest('tbody') as HTMLElement;
    expect(names(assessed)).toEqual(['CC-2026-014', '3 linked records', 'Approve', 'Advance', 'Ask AnA about this change', 'More actions for CC-2026-014']);
    fireEvent.click(within(assessed).getByRole('button', { name: 'More actions for CC-2026-014' }));
    const more = within(assessed).getByRole('group', { name: 'Actions for CC-2026-014' });
    expect(within(more).getAllByRole('button').map((b) => b.getAttribute('aria-label') ?? b.textContent?.trim()))
      .toEqual(['Edit assessment', 'Link a record']);
    fireEvent.click(within(assessed).getByRole('button', { name: 'Ask AnA about this change' }));
    expect(onAsk).toHaveBeenCalledWith(expect.stringContaining('Summarize change CC-2026-014'));
    // Proposed: Advance is inline.
    const proposed = screen.getByText('CC-2026-001').closest('tbody') as HTMLElement;
    expect(within(proposed).getByRole('button', { name: 'Advance' })).toBeTruthy();
    // Closed: the server takes no link on a closed, cancelled or rejected change, so none is offered (2026-11-12).
    const closed = screen.getByText('CC-2026-002').closest('tbody') as HTMLElement;
    expect(within(closed).queryByRole('button', { name: /Advance|Approve/ })).toBeNull();
    // C9: past assessment the record is what the approval signed, so it offers no edit.
    expect(within(closed).queryByRole('button', { name: 'Edit assessment' })).toBeNull();
    expect(names(closed)).toEqual(['CC-2026-002', expect.stringMatching(/linked record/), 'Ask AnA about this change']);
  });

  it('expands a change to its linked deviation / validation records', () => {
    render(<Harness onAsk={() => {}} />);
    fireEvent.click(screen.getByText('CC-2026-014'));
    // C9: the record an approver signs is read here, before its links.
    const record = screen.getByText('Impact assessment').closest('dl') as HTMLElement;
    expect(Array.from(record.querySelectorAll('dt')).map((d) => d.textContent))
      .toEqual(['Current state → proposed state', 'Reason for the change', 'Risk', 'Impact assessment', 'Implementation plan']);
    expect(record.textContent).toContain('Filter qualification and an extractables study; no filing change.');
    expect(record.textContent).toContain('Qualify the second source, then update the aseptic fill batch record.');
    expect(within(record).getByText('High')).toBeTruthy();
    expect(screen.getByText('Linked records')).toBeTruthy();
    expect(screen.getByText('DEV-2026-041')).toBeTruthy();   // linked deviation
    expect(screen.getByText('VP-7')).toBeTruthy();           // linked validation protocol
    expect(screen.getByText('Triggered by')).toBeTruthy();   // the relationship
  });

  it('raising a change request opens the governed drawer, not a chat turn', () => {
    const onAsk = vi.fn();
    render(<Harness onAsk={onAsk} />);
    fireEvent.click(screen.getByRole('button', { name: /Raise change request/ }));
    expect(screen.getByRole('dialog', { name: /Raise change request/ })).toBeTruthy();
    expect(onAsk).not.toHaveBeenCalled();
  });

  // D7-B: the procedure sits at the foot of the log, not in a box with its own AnA buttons; "Explain the procedure"
  // is the Change control tab's third starter (QualityWorkArea.test.tsx). P-122 rule 2 (2026-11-12): its five steps
  // were on the screen before the restyle, so the disclosure is open; a person can close it.
  /* Handoff from the trunk-CI lane (COORDINATION.md, 2026-11-10): a change's target date is a <time>, as the product's
     other dates are, so it can be kept on one line and read by a machine. */
  it("marks a change's target date as a date", () => {
    render(<Harness onAsk={vi.fn()} />);
    const row = screen.getByText('CC-2026-014').closest('tbody') as HTMLElement;
    const when = row.querySelector('time');
    expect(when?.getAttribute('datetime')).toBe('2026-09-15');
    expect(when?.textContent).toMatch(/2026/);
  });

  it('shows how a change is raised under the log, open, with no AnA button of its own', () => {
    const onAsk = vi.fn();
    const { container } = render(<Harness onAsk={onAsk} />);
    const how = screen.getByText('How a change is raised').closest('details') as HTMLDetailsElement;
    expect(how.open).toBe(true);
    expect(how.textContent).toMatch(/Route for independent approval, implement, then verify/);
    expect(screen.queryByRole('button', { name: /Explain the procedure|Find the controlled procedure/ })).toBeNull();
    expect(container.querySelector('.qcc-train')).toBeNull();
    expect(onAsk).not.toHaveBeenCalled();
  });

  /* "opens a change-control form in the editor via AnA" pinned the defect the
     audit of 2026-10-17 found: the card handed AnA a create prompt and wrote
     nothing. The gallery now renders the server library's change-control
     entries and creates through POST /api/mdx/qms/documents; that is asserted
     in qmsGovernedActions.test.tsx, which mocks the library read. */
});

/* HS-1 (docs/evidence/reviews/2026-09-24/lenses.md): a failed register read
   rendered "No changes at this stage." under a flowchart of zeroes. */
describe('ChangeControl — a failed read is not an empty log', () => {
  const renderLog = (p: { changes?: typeof FIXTURE_CHANGES; loading?: boolean; error?: string | null; onRetry?: () => void }) =>
    render(
      <ChangeControl
        onAsk={() => {}}
        stage="all"
        onStageChange={() => {}}
        openId={null}
        onOpenIdChange={() => {}}
        changes={p.changes ?? []}
        loading={p.loading ?? false}
          error={p.error}
        onRetry={p.onRetry}
      />,
    );

  it('renders a failed read as a failure with a retry, and no stage counts', () => {
    const onRetry = vi.fn();
    renderLog({ error: 'Request failed (500)', onRetry });
    expect(screen.getByTestId('change-log-failed').textContent).toMatch(/change log could not be read/);
    expect(screen.queryByText('No changes at this stage.')).toBeNull();
    expect(screen.queryByText('No changes in the log yet.')).toBeNull();
    expect(screen.queryByText(/0 changes/)).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'Try again' }));
    expect(onRetry).toHaveBeenCalledTimes(1);
  });

  it('claims nothing while the log is loading', () => {
    renderLog({ loading: true });
    expect(screen.getAllByText('Loading the change log…').length).toBeGreaterThan(0);
    expect(screen.queryByText('No changes at this stage.')).toBeNull();
    expect(screen.queryByText('No changes in the log yet.')).toBeNull();
  });

  it('shows a log that answered empty as empty', () => {
    renderLog({});
    // C3: an empty log says so once, as the shared empty state, with no column headers over nothing.
    expect(screen.getByText('No changes in the log yet.')).toBeTruthy();
    expect(document.querySelector('.qms-thead')).toBeNull();
    expect(screen.queryByTestId('change-log-failed')).toBeNull();
  });
});
