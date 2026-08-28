// @vitest-environment jsdom
/**
 * Signing-PIN enrollment — the missing screen of a live break.
 *
 * The e-sign dialog has always demanded a "Signing PIN" (required, verified
 * server-side by bcrypt) and POST /users/pin has always been able to set one —
 * with no screen between them: a first-time signer faced a required field
 * nothing in the product could satisfy. These tests pin the panel that closes
 * that, and its honesty seams: client-side refusals send NOTHING to the
 * server, and the server's refusals (which are the only authority on whether
 * a PIN already exists) are shown verbatim.
 */
import React from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';

const apiRequest = vi.hoisted(() => vi.fn());
vi.mock('@/lib/queryClient', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/queryClient')>()),
  apiRequest,
}));

import { AuthoringSignatures } from '../surfaces/AuthoringSignatures';

const ok = (b: unknown) => ({ ok: true, status: 200, json: async () => b } as Response);
const fail = (status: number, error: string) =>
  ({ ok: false, status, json: async () => ({ error }) } as Response);

async function openPanel() {
  render(<AuthoringSignatures docId={null} />);
  fireEvent.click(screen.getByRole('button', { name: /set or rotate/i }));
}

const type = (label: RegExp, value: string) =>
  fireEvent.change(screen.getByLabelText(label), { target: { value } });

beforeEach(() => apiRequest.mockReset());
afterEach(() => cleanup());

describe('signing-PIN enrollment', () => {
  it('a mismatch or short PIN is refused CLIENT-side — nothing reaches the server', async () => {
    await openPanel();

    type(/^new signing pin$/i, 'abc123');
    type(/confirm new signing pin/i, 'abc999');
    fireEvent.click(screen.getByRole('button', { name: /set signing pin/i }));
    expect(await screen.findByText(/do not match. Nothing was changed/)).toBeTruthy();

    type(/confirm new signing pin/i, 'abc12'); // now both short
    type(/^new signing pin$/i, 'abc12');
    fireEvent.click(screen.getByRole('button', { name: /set signing pin/i }));
    expect(await screen.findByText(/at least 6 characters/)).toBeTruthy();

    expect(apiRequest).not.toHaveBeenCalled();
  });

  it('enrolls through POST /users/pin and reports the confirmed change', async () => {
    apiRequest.mockResolvedValue(ok({ success: true }));
    await openPanel();

    type(/^new signing pin$/i, 'secret-9');
    type(/confirm new signing pin/i, 'secret-9');
    fireEvent.click(screen.getByRole('button', { name: /set signing pin/i }));

    await waitFor(() =>
      expect(apiRequest).toHaveBeenCalledWith('POST', '/api/authoring/users/pin', {
        pin: 'secret-9',
      }),
    );
    // First-time enrollment sends no old_pin — the server decides whether one
    // is required and says so; the client never guesses.
    expect((apiRequest.mock.calls[0][2] as Record<string, unknown>).old_pin).toBeUndefined();
    expect(await screen.findByText(/recorded in the audit trail/)).toBeTruthy();
  });

  it('a rotation sends the current PIN, and the server’s refusal is shown verbatim', async () => {
    apiRequest.mockResolvedValue(fail(401, 'Invalid old PIN'));
    await openPanel();

    type(/^new signing pin$/i, 'secret-9');
    type(/confirm new signing pin/i, 'secret-9');
    type(/current signing pin/i, 'oldpin-1');
    fireEvent.click(screen.getByRole('button', { name: /set signing pin/i }));

    await waitFor(() =>
      expect(apiRequest).toHaveBeenCalledWith('POST', '/api/authoring/users/pin', {
        pin: 'secret-9',
        old_pin: 'oldpin-1',
      }),
    );
    expect(await screen.findByText(/Invalid old PIN/)).toBeTruthy();
    expect(screen.getByText(/Nothing was changed/)).toBeTruthy();
  });
});
