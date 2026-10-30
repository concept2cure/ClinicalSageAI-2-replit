// @vitest-environment jsdom
/**
 * "On legal hold" on a Vault document (MR-08 Stage 5 step 5).
 *
 * The Vault read carries the project's active holds (reference and date).
 * Every reader sees, on the document, that it is held: a project hold covers
 * every document, a document hold the version it names. When the holds could
 * not be read the panel says so, and never shows an unread hold as none.
 * Server half: tests/db/vault-hold-notice.dbtest.ts.
 */
import React from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';

const apiRequest = vi.hoisted(() => vi.fn());
vi.mock('@/lib/queryClient', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/queryClient')>()),
  apiRequest,
}));

import { Vault } from '../surfaces/Vault';
import { holdsCovering, holdNoticeText } from '../surfaces/VaultHoldNotice';
import { PID, ok, uploadDoc, cabinetTree, vaultPayload, props } from './_vault-surface-fixtures';

const DOC_A = '44444444-4444-4444-8444-444444444444';
const DOC_B = '55555555-5555-4555-8555-555555555555';
const VAULT_URL = `/api/c2c/project-vault/${PID}`;
const PROJECT_HOLD = { scope: 'program' as const, documentId: null, reference: 'MATTER-2026-04', placedAt: '2026-10-01T09:00:00.000Z' };
const DOC_HOLD = { scope: 'document' as const, documentId: DOC_B, reference: 'MATTER-2026-07', placedAt: '2026-10-12T09:00:00.000Z' };

let payload: Record<string, unknown> = {};
const docs = () => [
  uploadDoc({ id: `up-${DOC_A}`, docId: DOC_A, title: 'stability-summary-24m', type: 'Test reports' }),
  uploadDoc({ id: `up-${DOC_B}`, docId: DOC_B, title: 'csr-draft-v2', type: 'Clinical study report' }),
];
const rowsOf = () => Array.from(document.querySelectorAll('.vd-rows .vd-row')) as HTMLElement[];

beforeEach(() => {
  (window as any).C2C_PROJECT = { id: PID, title: 'BX-301' };
  payload = {};
  apiRequest.mockReset();
  apiRequest.mockImplementation(async (method: string, url: string) => {
    if (url === VAULT_URL && method === 'GET') return ok(vaultPayload({ tree: cabinetTree(docs()), ...payload }));
    return ok({ success: true, data: { entries: [], chain: { ok: true } } });
  });
});
afterEach(() => { cleanup(); delete (window as any).C2C_PROJECT; });

async function open(row: number) {
  render(<Vault {...props()} />);
  await waitFor(() => expect(rowsOf()).toHaveLength(2));
  fireEvent.click(rowsOf()[row]);
}

describe('a document on legal hold says so', () => {
  it('a project hold covers every document; a document hold only the version it names', () => {
    expect(holdsCovering([PROJECT_HOLD, DOC_HOLD], DOC_A)).toEqual([PROJECT_HOLD]);
    expect(holdsCovering([PROJECT_HOLD, DOC_HOLD], DOC_B)).toEqual([PROJECT_HOLD, DOC_HOLD]);
    expect(holdsCovering([DOC_HOLD], DOC_A)).toEqual([]);
    expect(holdNoticeText([DOC_HOLD])).toBe('On legal hold: MATTER-2026-07 (this version, since 2026-10-12). '
      + 'While a hold is in place this document cannot be withdrawn or disposed of. Holds are placed and lifted in Admin, Settings.');
  });

  it('shows the hold on the document it covers, and nothing on one it does not', async () => {
    payload = { legalHolds: [DOC_HOLD] };
    await open(1);
    expect((await screen.findByTestId('vault-hold-notice')).textContent).toContain('MATTER-2026-07');
    cleanup();
    await open(0);
    await waitFor(() => expect(document.querySelector('.vd-detail')).not.toBeNull());
    expect(screen.queryByTestId('vault-hold-notice')).toBeNull();
  });

  it('shows a project hold on every document', async () => {
    payload = { legalHolds: [PROJECT_HOLD] };
    await open(0);
    expect((await screen.findByTestId('vault-hold-notice')).textContent).toContain('MATTER-2026-04 (the whole project, since 2026-10-01)');
  });

  it('says the holds could not be read, rather than nothing', async () => {
    payload = { unavailable: [{ branch: 'legalHolds', reason: 'The legal holds could not be read, so whether a document is held is not known.' }] };
    await open(0);
    expect((await screen.findByTestId('vault-hold-unreadable')).textContent).toContain('Whether this document is on legal hold could not be read');
    expect(screen.queryByTestId('vault-hold-notice')).toBeNull();
  });
});
