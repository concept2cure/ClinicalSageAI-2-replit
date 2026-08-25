// @vitest-environment jsdom
/**
 * <AuthoringSignatures> — the §11.50(b) electronic display.
 *
 * The record was always stored and always exposed; nothing read it. These pin
 * the three §11.50(a) items the display must carry, and — the part that is
 * easy to get wrong — that a MISSING printed name renders as missing.
 * `signer_name` is NULL exactly when the user record yielded no name, and
 * substituting the email in the printed-name row would rebuild, in the display
 * layer, the defect just removed from the storage layer.
 */
import React from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen, waitFor } from '@testing-library/react';

const apiRequest = vi.hoisted(() => vi.fn());
vi.mock('@/lib/queryClient', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/queryClient')>()),
  apiRequest,
}));

import { AuthoringSignatures } from '../surfaces/AuthoringSignatures';

const SIG = {
  id: 's1',
  signer_email: 'r.okafor@example.com',
  signer_name: 'Rita Okafor',
  meaning: 'APPROVER',
  reason: 'Module 2.5 approved for filing.',
  method: 'PIN',
  content_hash: 'a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4e5f6a1b2',
  signature_digest: 'deadbeef',
  covered_freeze_version: 'v3',
  covered_content_hash: 'cafebabe',
  pin_verified: true,
  signed_at: '2026-08-14T09:31:00.000Z',
};

const ok = (signatures: unknown[]) =>
  apiRequest.mockResolvedValue({ ok: true, status: 200, json: async () => ({ success: true, signatures }) });

afterEach(cleanup);
beforeEach(() => apiRequest.mockReset());

describe('§11.50(a) — the three required items are displayed', () => {
  it('shows the printed name, the meaning and the exact time', async () => {
    ok([SIG]);
    render(<AuthoringSignatures docId="d1" />);
    // (a)(1) printed name — the name, not the address.
    expect(await screen.findByText('Rita Okafor')).toBeTruthy();
    // (a)(3) meaning — the regulation's word, not the stored enum token.
    expect(screen.getByText('Approval')).toBeTruthy();
    expect(screen.queryByText('APPROVER')).toBeNull();
    // (a)(2) date and time, rendered through the governed-timestamp component
    // so it correlates to the UTC audit row rather than browser-locale time.
    expect(document.querySelector('time')?.getAttribute('datetime')).toBe(SIG.signed_at);
  });

  it('shows the reason the signer typed, which the toast never did', async () => {
    ok([SIG]);
    render(<AuthoringSignatures docId="d1" />);
    expect(await screen.findByText('Module 2.5 approved for filing.')).toBeTruthy();
  });

  it('shows WHICH frozen version the signature covers (§11.70)', async () => {
    ok([SIG]);
    render(<AuthoringSignatures docId="d1" />);
    expect(await screen.findByText(/frozen version v3/)).toBeTruthy();
  });
});

describe('a missing printed name is shown as missing, never as the email', () => {
  it('says so explicitly rather than putting the address in its place', async () => {
    ok([{ ...SIG, signer_name: null }]);
    render(<AuthoringSignatures docId="d1" />);
    expect(await screen.findByText(/no printed name on record/)).toBeTruthy();
  });

  it('does not present the email as if it satisfied (a)(1)', async () => {
    ok([{ ...SIG, signer_name: null }]);
    render(<AuthoringSignatures docId="d1" />);
    await screen.findByText(/no printed name on record/);
    // The address may still appear as the identifier it is — what must not
    // happen is it appearing UNQUALIFIED, indistinguishable from a real name.
    const bold = Array.from(document.querySelectorAll('b')).map((b) => b.textContent);
    expect(bold).not.toContain('r.okafor@example.com');
  });
});

describe('an unread record is not an unsigned document', () => {
  it('reports a failed read as a failed read', async () => {
    apiRequest.mockResolvedValue({ ok: false, status: 500, json: async () => ({}) });
    render(<AuthoringSignatures docId="d1" />);
    expect(await screen.findByText(/Couldn’t read the signature record/)).toBeTruthy();
    expect(document.body.textContent).toContain('not a document with no signatures');
  });

  it('distinguishes that from a document genuinely never signed', async () => {
    ok([]);
    render(<AuthoringSignatures docId="d1" />);
    await waitFor(() =>
      expect(screen.getByText('No electronic signatures on this document')).toBeTruthy());
    expect(document.body.textContent).not.toContain('failed read');
  });
});
