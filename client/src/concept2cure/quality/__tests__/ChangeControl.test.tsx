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
 *   - "raise a change request", "train me", and the change-form gallery all
 *     hand a grounded prompt to AnA (no direct mutation).
 *
 * The hooks are mocked to RESOLVE with the canonical rows, so the surface has
 * real data to render.
 *
 * They used to be mocked to the load state (`changes: null`) and the surface
 * fell through to `?? FIXTURE_CHANGES`. That made this file a test OF the
 * ungated fallback — on a GxP change-control register, where the rows assert
 * `classification: 'major'` and `status: 'approved'`, and where the fallback
 * fired on an empty tenant, an expired token or a 500 with nothing on screen
 * saying so. The fallback is gone (it goes through `useSampleRows` now, which
 * substitutes only under explicit sample mode), so a null hook correctly
 * renders an empty register and these assertions correctly stopped passing.
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
import { render, screen, cleanup, fireEvent } from '@testing-library/react';

vi.mock('../changeHooks', async () => {
  const { FIXTURE_SUMMARY } = await import('../changeData');
  return {
    useChangeSummary: () => ({ summary: FIXTURE_SUMMARY, loading: false, error: null }),
  };
});

import { ChangeControl } from '../ChangeControl';
import { FIXTURE_CHANGES, type ChangeState } from '../changeData';

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
      showingSample={false}
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

  it('renders the lifecycle flowchart with a node per stage', () => {
    render(<Harness onAsk={() => {}} />);
    // Each flow node is a button whose accessible name carries the stage + count.
    expect(screen.getByRole('button', { name: /Proposed: 1 change/ })).toBeTruthy();
    expect(screen.getByRole('button', { name: /Verification: 1 change/ })).toBeTruthy();
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
  });

  it('expands a change to its linked deviation / validation records', () => {
    render(<Harness onAsk={() => {}} />);
    fireEvent.click(screen.getByText('CC-2026-014'));
    expect(screen.getByText('Linked records')).toBeTruthy();
    expect(screen.getByText('DEV-2026-041')).toBeTruthy();   // linked deviation
    expect(screen.getByText('VP-7')).toBeTruthy();           // linked validation protocol
    expect(screen.getByText('Triggered by')).toBeTruthy();   // the relationship
  });

  it('hands raising a change request to AnA (no direct mutation)', () => {
    const onAsk = vi.fn();
    render(<Harness onAsk={onAsk} />);
    fireEvent.click(screen.getByRole('button', { name: /Raise change request/ }));
    expect(onAsk).toHaveBeenCalledTimes(1);
    expect(onAsk.mock.calls[0][0]).toMatch(/raise a change request/i);
  });

  it('trains the user on raising changes via AnA', () => {
    const onAsk = vi.fn();
    render(<Harness onAsk={onAsk} />);
    fireEvent.click(screen.getByRole('button', { name: /Train me/ }));
    expect(onAsk).toHaveBeenCalledTimes(1);
    expect(onAsk.mock.calls[0][0]).toMatch(/how to raise a change request/i);
  });

  it('opens a change-control form in the editor via AnA', () => {
    const onAsk = vi.fn();
    render(<Harness onAsk={onAsk} />);
    // The change-request form build card.
    fireEvent.click(screen.getByText('Change-request form'));
    expect(onAsk).toHaveBeenCalledTimes(1);
    expect(onAsk.mock.calls[0][0]).toMatch(/Change-request form/);
    expect(onAsk.mock.calls[0][0]).toMatch(/CC-/);
  });
});
