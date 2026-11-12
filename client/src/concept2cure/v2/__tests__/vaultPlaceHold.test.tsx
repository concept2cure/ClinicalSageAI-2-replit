// @vitest-environment jsdom
/**
 * "Place legal hold" is on the record in the Vault, for everyone the server allows (P-125 point 8, 2026-11-11;
 * docs/evidence/DESIGN/P-122/inventory/administration.md rows A28 / D17 / D18).
 *
 * The record showed an active hold and offered no way to place one. Placing was only in Admin › Settings, a door
 * for administrators and owners, while the route also admits a manager. The record now offers it when the Vault
 * read says this reader may place a hold, through the same governed route.
 */
import React from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';

const apiRequest = vi.hoisted(() => vi.fn());
vi.mock('@/lib/queryClient', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/queryClient')>()),
  apiRequest,
}));

import { Vault } from '../surfaces/Vault';
import { placeHoldProblem } from '../surfaces/VaultPlaceHold';
import { PID, DOC_ID, ok, vaultPayload, props, cabinetTree, uploadDoc } from './_vault-surface-fixtures';

const HOLDS = '/api/vault/legal-holds';
let posted: unknown[] = [];
let vaultReads = 0;
let answer: () => Response;
let holdsOnRead: unknown[] = [];

function install(over: Record<string, unknown>) {
  posted = []; vaultReads = 0; holdsOnRead = [];
  answer = () => ({ ok: true, status: 201, json: async () => ({ hold: { id: 'h1', reference: 'FDA-483-2026-07', scope: 'document', documentId: DOC_ID, active: true } }) } as Response);
  apiRequest.mockReset();
  apiRequest.mockImplementation(async (method: string, url: string, body?: unknown) => {
    if (url === `/api/c2c/project-vault/${PID}` && method === 'GET') {
      vaultReads += 1;
      return ok(vaultPayload({ tree: cabinetTree([uploadDoc()]), legalHolds: holdsOnRead, ...over }));
    }
    if (url === `/api/c2c/project-vault/${PID}/seals`) return ok({ success: true, data: { seals: [] } });
    if (url === HOLDS && method === 'POST') {
      posted.push(body);
      const res = answer();
      if (res.ok) holdsOnRead = [{ scope: 'document', documentId: DOC_ID, reference: 'FDA-483-2026-07', placedAt: '2026-11-12T09:00:00.000Z' }];
      return res;
    }
    return ok({});
  });
}

async function openRecord() {
  render(<Vault {...props()} />);
  const row = (await screen.findAllByText('stability-summary-24m')).map((el) => el.closest('.vd-row')).find(Boolean) as HTMLElement;
  fireEvent.click(row);
  await waitFor(() => expect(document.querySelector('.vd-d-actions')).not.toBeNull());
}

beforeEach(() => { (window as any).C2C_PROJECT = { id: PID, title: 'BX-301' }; });
afterEach(() => { cleanup(); delete (window as any).C2C_PROJECT; });

describe('placing a legal hold from the record', () => {
  it('is offered when the Vault read says this reader may place one, and records the hold through the governed route', async () => {
    install({ mayPlaceLegalHold: true });
    await openRecord();
    fireEvent.click(await screen.findByRole('button', { name: /Place legal hold/ }));
    const form = screen.getByRole('group', { name: /Place a legal hold on this version of stability-summary-24m/ });
    const submit = within(form).getByRole('button', { name: 'Place hold on this version' });
    // Nothing is sent without a reference and a reason.
    expect((submit as HTMLButtonElement).disabled).toBe(true);
    fireEvent.change(within(form).getByLabelText(/Matter reference/), { target: { value: '  FDA-483-2026-07 ' } });
    fireEvent.change(within(form).getByLabelText(/Reason for the hold/), { target: { value: 'Preserve for the pre-approval inspection.' } });
    fireEvent.click(submit);
    const said = await screen.findByTestId('vault-place-hold-said');
    expect(posted).toEqual([{ scope: 'document', documentId: DOC_ID, reference: 'FDA-483-2026-07', reason: 'Preserve for the pre-approval inspection.' }]);
    expect(said.textContent).toContain('Legal hold FDA-483-2026-07 is placed on this version of stability-summary-24m');
    // The Vault is read again, and the record now shows the hold.
    await waitFor(() => expect(screen.getByTestId('vault-hold-notice').textContent).toContain('FDA-483-2026-07'));
    expect(vaultReads).toBeGreaterThan(1);
  });

  it('is not offered to a reader the server does not allow, or when the server does not say', async () => {
    install({ mayPlaceLegalHold: false });
    await openRecord();
    expect(screen.queryByRole('button', { name: /Place legal hold/ })).toBeNull();
    cleanup();
    install({});
    await openRecord();
    expect(screen.queryByRole('button', { name: /Place legal hold/ })).toBeNull();
  });

  it('says what the server said when it refuses, and keeps what was typed', async () => {
    install({ mayPlaceLegalHold: true });
    answer = () => ({ ok: false, status: 403, json: async () => ({ error: 'HOLD_AUTHORITY_REQUIRED', message: 'Legal holds are placed and lifted by organisation administrators and managers.' }) } as Response);
    await openRecord();
    fireEvent.click(await screen.findByRole('button', { name: /Place legal hold/ }));
    fireEvent.change(screen.getByLabelText(/Matter reference/), { target: { value: 'LIT-12' } });
    fireEvent.change(screen.getByLabelText(/Reason for the hold/), { target: { value: 'Litigation hold.' } });
    fireEvent.click(screen.getByRole('button', { name: 'Place hold on this version' }));
    const alert = await within(screen.getByTestId('vault-place-hold')).findByRole('alert');
    expect(alert.textContent).toContain('placed and lifted by organisation administrators and managers');
    expect((screen.getByLabelText(/Matter reference/) as HTMLInputElement).value).toBe('LIT-12');
    expect(screen.queryByTestId('vault-place-hold-said')).toBeNull();
  });

  it('does not report a hold the server did not confirm', async () => {
    install({ mayPlaceLegalHold: true });
    answer = () => ({ ok: true, status: 201, json: async () => ({ hold: { id: 'h9', reference: 'LIT-12', scope: 'document', documentId: 'another-version', active: true } }) } as Response);
    await openRecord();
    fireEvent.click(await screen.findByRole('button', { name: /Place legal hold/ }));
    fireEvent.change(screen.getByLabelText(/Matter reference/), { target: { value: 'LIT-12' } });
    fireEvent.change(screen.getByLabelText(/Reason for the hold/), { target: { value: 'Litigation hold.' } });
    fireEvent.click(screen.getByRole('button', { name: 'Place hold on this version' }));
    expect((await within(screen.getByTestId('vault-place-hold')).findByRole('alert')).textContent).toContain('the hold is not confirmed');
    expect(screen.queryByTestId('vault-place-hold-said')).toBeNull();
  });
});

describe('the hold form’s bounds are the route’s', () => {
  it('asks for a reference of 1 to 200 characters and a reason of 3 to 2,000', () => {
    expect(placeHoldProblem('', 'A reason')).toMatch(/matter reference/);
    expect(placeHoldProblem('x'.repeat(201), 'A reason')).toMatch(/200/);
    expect(placeHoldProblem('LIT-12', 'no')).toMatch(/reason/);
    expect(placeHoldProblem('LIT-12', 'x'.repeat(2001))).toMatch(/2,000/);
    expect(placeHoldProblem(' LIT-12 ', ' because ')).toBeNull();
  });
});
