// @vitest-environment jsdom
/**
 * EsignModal — a signer who needs an authenticator and has none learns it
 * before typing a password (P-25 follow-up, 2026-10-08).
 *
 * The server refuses such a signature (ADR-0014 P1-2b, reverifySigner) once the
 * password has verified. Until this change the dialog asked for the reason and
 * the password first and showed the refusal last. GET /api/v1/auth/session now
 * states `user.signing: { authenticatorRequired, authenticatorEnrolled }`; the
 * dialog reads it when it opens. When the server cannot be asked, the dialog is
 * what it was, and the server's refusal still stands.
 */
import React from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';

const esig = vi.hoisted(() => ({
  verifyPassword: vi.fn(async () => ({ valid: true })),
  verifyMfa: vi.fn(async () => ({ valid: true })),
}));
vi.mock('../../../hooks/useEsignature', () => ({ useEsignature: () => esig }));
vi.mock('@/utils/authToken', () => ({ getAuthHeaders: () => ({ Authorization: 'Bearer session-token' }) }));

import { EsignModal } from '../EsignModal';

type Posture = { authenticatorRequired: boolean; authenticatorEnrolled: boolean };
const sessionCalls: { url: string; auth: string | null }[] = [];
function serverSays(answer: { status: number; signing?: Posture }) {
  vi.stubGlobal(
    'fetch',
    vi.fn(async (input: Parameters<typeof fetch>[0], init?: Parameters<typeof fetch>[1]) => {
      const url = String(input);
      sessionCalls.push({ url, auth: ((init?.headers ?? {}) as Record<string, string>).Authorization ?? null });
      const body = answer.signing ? { authenticated: true, user: { id: '7', signing: answer.signing } } : { error: 'nope' };
      return new Response(JSON.stringify(body), { status: answer.status, headers: { 'Content-Type': 'application/json' } });
    }),
  );
}

const onClose = vi.fn();
function openDialog() {
  render(
    <EsignModal
      open
      action="Approve"
      target="SOP-014 v3"
      onClose={onClose}
      onSign={async () => {
        throw new Error('not reached');
      }}
    />,
  );
}

beforeEach(() => {
  sessionCalls.length = 0;
  onClose.mockReset();
  esig.verifyPassword.mockClear();
});
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe('EsignModal reads the signing posture the server states', () => {
  it('required and not enrolled: says to enrol, asks for no password, and signs nothing', async () => {
    serverSays({ status: 200, signing: { authenticatorRequired: true, authenticatorEnrolled: false } });
    openDialog();
    expect(await screen.findByText('Enrol an authenticator in Account to sign.')).toBeTruthy();
    expect(document.querySelector('input[type="password"]'), 'a password field').toBeNull();
    expect(document.querySelector('textarea'), 'a reason field').toBeNull();
    expect(screen.queryByRole('button', { name: /Sign and commit/ })).toBeNull();
    expect(document.activeElement, 'focus stays inside the dialog').toBe(screen.getByRole('button', { name: 'Close' }));
    fireEvent.click(screen.getByRole('button', { name: 'Close' }));
    expect(onClose).toHaveBeenCalledTimes(1);
    expect(esig.verifyPassword).not.toHaveBeenCalled();
    expect(sessionCalls).toEqual([{ url: '/api/v1/auth/session', auth: 'Bearer session-token' }]);
  });

  it('required and enrolled: the signing form, as before', async () => {
    serverSays({ status: 200, signing: { authenticatorRequired: true, authenticatorEnrolled: true } });
    openDialog();
    await waitFor(() => expect(sessionCalls.length).toBe(1));
    expect(document.querySelector('input[type="password"]')).not.toBeNull();
    expect(screen.queryByText('Enrol an authenticator in Account to sign.')).toBeNull();
  });

  it('not required: the signing form, as before', async () => {
    serverSays({ status: 200, signing: { authenticatorRequired: false, authenticatorEnrolled: false } });
    openDialog();
    await waitFor(() => expect(sessionCalls.length).toBe(1));
    expect(document.querySelector('input[type="password"]')).not.toBeNull();
  });

  it('the posture could not be read: the signing form, and the server decides at signing', async () => {
    serverSays({ status: 500 });
    openDialog();
    await waitFor(() => expect(sessionCalls.length).toBe(1));
    expect(document.querySelector('input[type="password"]')).not.toBeNull();
    expect(screen.queryByText('Enrol an authenticator in Account to sign.')).toBeNull();
  });
});
