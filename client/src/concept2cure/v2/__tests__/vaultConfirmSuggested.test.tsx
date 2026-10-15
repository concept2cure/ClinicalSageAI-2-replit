// @vitest-environment jsdom
/**
 * Confirm N suggested, with one reason (VR-11b, row D2).
 *
 * The header says how many filings await a person's confirmation, counted by
 * the server over the program. In a folder of suggestions, the person confirms
 * them together, with one written reason the page holds back until it is long
 * enough. The answer names each document: confirmed, or not with the reason. A
 * partial batch says so. A refused request says nothing was confirmed. Server
 * half: tests/db/vault-placement-batch.dbtest.ts.
 */
import React from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';

const apiRequest = vi.hoisted(() => vi.fn());
vi.mock('@/lib/queryClient', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/queryClient')>()),
  apiRequest,
}));

import { ApiRequestError } from '@/lib/queryClient';
import { Vault } from '../surfaces/Vault';
import { suggestedGroups } from '../surfaces/VaultConfirmSuggested';
import { PID, ok, uploadDoc, cabinetTree, vaultPayload, props } from './_vault-surface-fixtures';

const A = '44444444-4444-4444-8444-444444444444';
const B = '55555555-5555-4555-8555-555555555555';
const BATCH_URL = `/api/c2c/project-vault/${PID}/file-batch`;
const REASON = 'Checked each against its study report';

const docA = uploadDoc({ id: `up-${A}`, docId: A, title: 'Stability 24m' });
const docB = uploadDoc({ id: `up-${B}`, docId: B, title: 'Stability 36m' });

let reads = 0;
let onBatch: (body: unknown) => Response;

beforeEach(() => {
  (window as any).C2C_PROJECT = { id: PID, title: 'BX-301' };
  reads = 0;
  apiRequest.mockReset();
  apiRequest.mockImplementation(async (method: string, url: string, body?: unknown) => {
    if (url === `/api/c2c/project-vault/${PID}` && method === 'GET') {
      reads += 1;
      return ok(vaultPayload({ tree: cabinetTree([docA, docB]), awaitingConfirmationCount: 2 }));
    }
    if (url === BATCH_URL && method === 'POST') return onBatch(body);
    return ok({ success: true, data: { entries: [], chain: { ok: true } } });
  });
});
afterEach(() => { cleanup(); delete (window as any).C2C_PROJECT; });

async function openConfirm() {
  render(<Vault {...props()} />);
  const bar = await screen.findByTestId('vault-confirm-suggested');
  fireEvent.click(within(bar).getByRole('button', { name: 'Confirm 2 suggested in Module 3 · Quality' }));
  return bar;
}

describe('Confirm N suggested (VR-11b)', () => {
  it('the header counts what awaits confirmation, as the server counted it', async () => {
    render(<Vault {...props()} />);
    await waitFor(() => expect(document.body.textContent).toContain('2 awaiting confirmation'));
  });

  it('holds the action back until a reason is given, sends one reason for the set, and answers per document', async () => {
    onBatch = () => ok({
      success: true,
      complete: false,
      items: [
        { documentId: A, outcome: 'confirmed', folderLabel: 'Module 3 · Quality' },
        { documentId: B, outcome: 'refused', code: 'CONFLICT', message: 'Its filing changed since this list was loaded, so it was not confirmed. Reload and check it.' },
      ],
    });
    const bar = await openConfirm();
    const go = within(bar).getByRole('button', { name: 'Confirm 2' }) as HTMLButtonElement;
    expect(go.disabled).toBe(true);
    fireEvent.change(within(bar).getByLabelText(/Reason for confirming these 2 filings/), { target: { value: 'short' } });
    expect(go.disabled).toBe(true);
    fireEvent.change(within(bar).getByLabelText(/Reason for confirming these 2 filings/), { target: { value: REASON } });
    fireEvent.click(go);

    const result = await within(bar).findByRole('status');
    expect(apiRequest).toHaveBeenCalledWith('POST', BATCH_URL, { folderId: 'module-3', documentIds: [A, B], note: REASON });
    expect(result.textContent).toContain('1 confirmed, 1 not confirmed. Not every filing was confirmed; the reasons are below.');
    expect(result.textContent).toContain('Stability 24m: Confirmed in Module 3 · Quality.');
    expect(result.textContent).toContain('Stability 36m: Not confirmed. Its filing changed since this list was loaded');
    await waitFor(() => expect(reads).toBe(2));
  });

  it('a refused request says nothing was confirmed, with the reason', async () => {
    onBatch = () => {
      throw new ApiRequestError('A reason for change of at least 8 characters is required.', 422,
        { error: 'REASON_REQUIRED', message: 'A reason for change of at least 8 characters is required.' }, 'REASON_REQUIRED');
    };
    const bar = await openConfirm();
    fireEvent.change(within(bar).getByLabelText(/Reason for confirming these 2 filings/), { target: { value: REASON } });
    fireEvent.click(within(bar).getByRole('button', { name: 'Confirm 2' }));
    const alert = await within(bar).findByRole('alert');
    expect(alert.textContent).toContain('Nothing was confirmed.');
    expect(alert.textContent).toContain('at least 8 characters');
    expect(within(bar).queryByRole('status')).toBeNull();
    expect(reads).toBe(1);
  });
});

describe('which documents are offered', () => {
  it('only uploads suggested into a folder; unfiled, confirmed and folderless suggestions are not', () => {
    const groups = suggestedGroups([
      docA as any,
      uploadDoc({ id: 'up-x', docId: 'x', filing: { ...docA.filing, placementStatus: 'confirmed' } }) as any,
      uploadDoc({ id: 'up-y', docId: 'y', filing: { ...docA.filing, folderId: null } }) as any,
      uploadDoc({ id: 'up-z', docId: 'z', filing: { ...docA.filing, placementStatus: 'unfiled' } }) as any,
    ]);
    expect(groups.map((g) => [g.folderId, g.docs.map((d) => d.docId)])).toEqual([['module-3', [A]]]);
  });
});
