// @vitest-environment jsdom
/**
 * EsignModal — focus and what the signer attested, after signing
 * (accessibility and Part 11 reviews of the periodic review, 2026-10-22).
 *
 * Hosts close the dialog by unmounting it (`{x && <EsignModal open />}`). The
 * dialog restored focus only when `open` turned false, which then never
 * happened, so focus fell to the page on Cancel, Escape and Done. Once signed,
 * the form unmounted with focus in it, and the "Signature applied" screen named
 * the action but not what it attested (a periodic review's outcome and date).
 */
import React from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';

const esig = vi.hoisted(() => ({
  verifyPassword: vi.fn(async () => ({ valid: true })),
  verifyMfa: vi.fn(async () => ({ valid: true })),
}));
vi.mock('../../../hooks/useEsignature', () => ({ useEsignature: () => esig }));
vi.mock('@/utils/authToken', () => ({ getAuthHeaders: () => ({}) }));

import { EsignModal } from '../EsignModal';

function Host() {
  const [open, setOpen] = React.useState(false);
  return (
    <>
      <button onClick={() => setOpen(true)}>Record review</button>
      {open && (
        <EsignModal
          open
          action="Record periodic review"
          target="SOP-015 Supplier controls (v1.0)"
          defaultMeaning="review"
          meanings={['review']}
          signedRows={[{ label: 'Outcome', value: 'Remains current' }, { label: 'Next periodic review', value: '2027-10-22' }]}
          onClose={() => setOpen(false)}
          onSign={async (input) => ({ meaning: input.meaning, reason: input.reason, signedAt: '2026-10-22T09:12:00.000Z' })}
        />
      )}
    </>
  );
}

function openFromTrigger() {
  render(<Host />);
  const trigger = screen.getByRole('button', { name: 'Record review' });
  trigger.focus();
  fireEvent.click(trigger);
  return trigger;
}

beforeEach(() => {
  vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify({ authenticated: true,
    user: { id: '7', signing: { authenticatorRequired: false, authenticatorEnrolled: false } } }), { status: 200, headers: { 'Content-Type': 'application/json' } })));
});
afterEach(() => { cleanup(); vi.unstubAllGlobals(); });

describe('EsignModal returns focus when its host unmounts it', () => {
  it('on Escape, focus goes back to the control that opened it', async () => {
    const trigger = openFromTrigger();
    const dialog = await screen.findByRole('dialog');
    // Focus has moved into the dialog, as it does for a signer, before Escape.
    await waitFor(() => expect(document.activeElement).toBe(document.querySelector('textarea')));
    fireEvent.keyDown(document, { key: 'Escape' });
    await waitFor(() => expect(dialog.isConnected).toBe(false));
    expect(document.activeElement).toBe(trigger);
  });

  it('once signed, Done has focus and carries the summary, the attested rows are shown, and Done returns focus', async () => {
    const trigger = openFromTrigger();
    await screen.findByRole('dialog');
    fireEvent.change(document.querySelector('textarea')!, { target: { value: 'Annual review against current practice' } });
    fireEvent.change(document.querySelector('input[type="password"]')!, { target: { value: 'correct-horse' } });
    fireEvent.click(screen.getByRole('button', { name: /Sign and commit/ }));
    const done = await screen.findByRole('button', { name: 'Done' });
    await waitFor(() => expect(document.activeElement).toBe(done));
    const summary = document.getElementById(done.getAttribute('aria-describedby')!);
    expect(summary?.textContent).toContain('signature recorded against SOP-015 Supplier controls (v1.0)');
    const dialog = screen.getByRole('dialog');
    expect(dialog.textContent).toContain('OutcomeRemains current');
    expect(dialog.textContent).toContain('Next periodic review2027-10-22');
    fireEvent.click(done);
    await waitFor(() => expect(dialog.isConnected).toBe(false));
    expect(document.activeElement).toBe(trigger);
  });
});
