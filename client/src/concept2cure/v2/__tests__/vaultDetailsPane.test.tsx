// @vitest-environment jsdom
/**
 * The Vault detail pane as a person uses it (QA-2026-10-08, vault-detail walk).
 *
 * (a) Opening several documents left one "Details" block per document opened,
 *     each still showing the first document's title and type. Edit details and
 *     History were keyed `${docId}-${vaultEpoch}` as siblings in one fragment, so
 *     React could not match the one it had mounted and kept it in the DOM.
 * (b) A saved change shows the server's confirmation, and the confirmation is
 *     still there when the Vault re-reads after the save. The history renders the
 *     reason a change was recorded with.
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
import { PID, ok, uploadDoc, cabinetTree, vaultPayload, props } from './_vault-surface-fixtures';

const DOC_A = '44444444-4444-4444-8444-444444444444';
const DOC_B = '55555555-5555-4555-8555-555555555555';
const DOC_C = '66666666-6666-4666-8666-666666666666';
const REASON = 'The sponsor renamed the protocol at the pre-IND meeting.';
const VAULT_URL = `/api/c2c/project-vault/${PID}`;
const VERIFIED = { store: 'audit_logs', ok: true, rowsChecked: 40, legacyRows: 0, sequencedRows: 40 };

const docs = () => [
  uploadDoc({
    id: `up-${DOC_A}`, docId: DOC_A, title: 'stability-summary-24m', type: 'Test reports',
    details: { documentTitle: 'stability-summary-24m', documentType: 'OTHER', classification: 'INTERNAL' },
  }),
  uploadDoc({
    id: `up-${DOC_B}`, docId: DOC_B, title: 'csr-draft-v2', type: 'Clinical study report',
    details: { documentTitle: 'csr-draft-v2', documentType: 'CSR', classification: 'CONFIDENTIAL' },
  }),
  uploadDoc({
    id: `up-${DOC_C}`, docId: DOC_C, title: 'ib-edition-3', type: 'Clinical docs',
    details: { documentTitle: 'ib-edition-3', documentType: 'IB', classification: 'INTERNAL' },
  }),
];

let historyEntries: unknown[] = [];
let detailsReply: () => Response = () => ok({ success: true, unchanged: false, changes: [] });

function mockApi() {
  apiRequest.mockImplementation(async (method: string, url: string) => {
    if (url === VAULT_URL && method === 'GET') return ok(vaultPayload({ tree: cabinetTree(docs()) }));
    if (url.endsWith('/history') && method === 'GET') return ok({ success: true, data: { entries: historyEntries, chain: VERIFIED } });
    if (url.endsWith('/details') && method === 'POST') return detailsReply();
    return ok({});
  });
}

const rowsOf = () => Array.from(document.querySelectorAll('.vd-rows .vd-row')) as HTMLElement[];
const detailsBlocks = () => Array.from(document.querySelectorAll('.vd-detail [data-testid="vault-edit-details"]')) as HTMLElement[];
const vaultReads = () => apiRequest.mock.calls.filter((c) => c[0] === 'GET' && c[1] === VAULT_URL).length;

beforeEach(() => {
  (window as any).C2C_PROJECT = { id: PID, title: 'BX-301' };
  historyEntries = [];
  detailsReply = () => ok({ success: true, unchanged: false, changes: [] });
  apiRequest.mockReset();
  mockApi();
});
afterEach(() => {
  cleanup();
  delete (window as any).C2C_PROJECT;
  vi.restoreAllMocks();
});

describe('Vault detail pane: one document at a time', () => {
  it('shows one Details block, for the document selected, however many documents were opened', async () => {
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    render(<Vault {...props()} />);
    await waitFor(() => expect(rowsOf()).toHaveLength(3));

    const visits: Array<[number, string]> = [[1, 'csr-draft-v2'], [2, 'ib-edition-3'], [0, 'stability-summary-24m'], [1, 'csr-draft-v2']];
    for (const [row, title] of visits) {
      fireEvent.click(rowsOf()[row]);
      await waitFor(() => expect(detailsBlocks()).toHaveLength(1));
      expect(detailsBlocks()[0].textContent).toContain(title);
    }

    // React names the collision itself; a duplicate key is a defect, not a warning to ignore.
    const keyWarnings = consoleError.mock.calls.filter((args) => String(args[0]).includes('same key'));
    expect(keyWarnings).toHaveLength(0);
  });
});

describe('Vault detail pane: a saved change', () => {
  it('shows the server confirmation, and still shows it after the Vault re-reads the save', async () => {
    detailsReply = () => ok({ success: true, unchanged: false, changes: [{ field: 'document_type', from: 'OTHER', to: 'REPORT' }] });
    render(<Vault {...props()} />);
    const block = await waitFor(() => {
      expect(detailsBlocks()).toHaveLength(1);
      return detailsBlocks()[0];
    });
    fireEvent.click(within(block).getByTestId('vault-edit-details-open'));
    fireEvent.change(within(block).getByTestId('vault-edit-details-type'), { target: { value: 'REPORT' } });
    fireEvent.change(within(block).getByTestId('vault-edit-details-reason'), { target: { value: REASON } });
    fireEvent.click(within(block).getByTestId('vault-edit-details-save'));

    // The save makes the surface re-read the Vault: the second read is the proof it happened.
    await waitFor(() => expect(vaultReads()).toBeGreaterThan(1));
    await waitFor(() =>
      expect(screen.getByTestId('vault-edit-details-note').textContent).toMatch(/recorded in this document's history/),
    );
  });
});

describe('Vault document history', () => {
  it('shows the reason recorded with a change, not only its event name', async () => {
    historyEntries = [{
      id: 'AUD-9', event: 'Vault Document Metadata Edit', actor: 'Emily Watson', at: '2026-10-08T01:20:58.000Z',
      when: '2026-10-08 01:20', hash: 'd'.repeat(64), prevHash: 'c'.repeat(64), seq: 9, version: '1.0', reason: REASON,
    }];
    render(<Vault {...props()} />);
    const panel = await screen.findByTestId('vault-document-history');
    await waitFor(() => expect(panel.textContent).toContain('Vault Document Metadata Edit'));
    expect(panel.textContent).toContain(REASON);
  });
});
