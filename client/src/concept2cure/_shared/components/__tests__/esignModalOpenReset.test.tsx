// @vitest-environment jsdom
/**
 * EsignModal — what the signer enters as the dialog appears is kept.
 *
 * The modal stays mounted while closed and clears its fields when it opens.
 * That clear ran in a passive effect, and React may commit the dialog and
 * yield before running passive effects. It yields when the render took longer
 * than its 5 ms slice, as it does on a loaded CI runner. An input event in
 * that gap (a fast typist, a password manager filling the field as it appears,
 * a test) was applied first, and the late clear then wiped it. The signer saw
 * an empty reason beside a filled password and a Sign button that stayed
 * disabled for no stated reason. taskBoardRefusalHonesty's §11.50 case failed
 * in CI on 2026-09-24 in exactly that state.
 *
 * The case is made deterministic here. The dialog opens outside act, inside a
 * render slow enough that the scheduler yields, and the inputs arrive from a
 * MutationObserver the moment the dialog is in the DOM, before any passive
 * effect can have run.
 */
import React from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';

vi.mock('../../../hooks/useEsignature', () => ({
  useEsignature: () => ({
    verifyPassword: vi.fn(async () => ({ valid: true })),
    verifyMfa: vi.fn(async () => ({ valid: true })),
  }),
}));

import { EsignModal } from '../EsignModal';

/** Burns longer than the scheduler's 5 ms slice, so the commit yields. */
function SlowSibling({ open }: { open: boolean }) {
  if (open) {
    const until = performance.now() + 20;
    while (performance.now() < until) {
      /* busy */
    }
  }
  return null;
}

let setOpenOutside: (v: boolean) => void = () => {};
function Harness() {
  const [open, setOpen] = React.useState(false);
  setOpenOutside = setOpen;
  return (
    <>
      <SlowSibling open={open} />
      <EsignModal
        open={open}
        action="Sign"
        target="Freeze CSR shell"
        onClose={() => setOpen(false)}
        onSign={async () => {
          throw new Error('not reached');
        }}
      />
    </>
  );
}

const g = globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean };
afterEach(() => {
  g.IS_REACT_ACT_ENVIRONMENT = true;
  cleanup();
});

describe('EsignModal — fields entered as the dialog appears', () => {
  it('keeps a reason and password entered before React ran its passive effects', async () => {
    render(<Harness />);

    const entered = new Promise<void>((resolve) => {
      const mo = new MutationObserver(() => {
        const reason = document.querySelector('textarea');
        const pw = document.querySelector('input[type="password"]');
        if (!reason || !pw) return;
        mo.disconnect();
        fireEvent.change(reason, { target: { value: 'Reviewed against the criteria.' } });
        fireEvent.change(pw, { target: { value: 'correct horse' } });
        resolve();
      });
      mo.observe(document.body, { childList: true, subtree: true });
    });

    // Opened the way a network answer opens it: a state update outside act,
    // rendered by the scheduler, not flushed synchronously by the test.
    g.IS_REACT_ACT_ENVIRONMENT = false;
    setOpenOutside(true);
    await entered;
    // Let every scheduled task (the passive effects included) run.
    await new Promise((r) => setTimeout(r, 50));
    g.IS_REACT_ACT_ENVIRONMENT = true;
    await act(async () => {});

    expect((screen.getByLabelText(/Reason for this action/) as HTMLTextAreaElement).value).toBe(
      'Reviewed against the criteria.',
    );
    expect((screen.getByLabelText(/Password/) as HTMLInputElement).value).toBe('correct horse');
    expect((screen.getByRole('button', { name: /Sign and commit/ }) as HTMLButtonElement).disabled).toBe(false);
  });

  it('still clears what the last signing left behind when it reopens', async () => {
    render(<Harness />);
    act(() => setOpenOutside(true));
    fireEvent.change(screen.getByLabelText(/Reason for this action/), { target: { value: 'An earlier reason.' } });
    fireEvent.change(screen.getByLabelText(/Password/), { target: { value: 'an earlier password' } });
    act(() => setOpenOutside(false));
    act(() => setOpenOutside(true));

    expect((screen.getByLabelText(/Reason for this action/) as HTMLTextAreaElement).value).toBe('');
    expect((screen.getByLabelText(/Password/) as HTMLInputElement).value).toBe('');
  });
});
