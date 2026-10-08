// @vitest-environment jsdom
/**
 * The Vault detail pane as a person uses it (QA-2026-10-08, vault-detail walk).
 *
 * (a) Opening several documents left one "Details" block per document opened,
 *     each still showing the first document's title and type. Edit details and
 *     History were keyed `${docId}-${vaultEpoch}` as siblings in one fragment, so
 *     React could not match the one it had mounted and kept it in the DOM.
 * (b) A saved change shows the server's confirmation, and the confirmation is
 *     still there after the Vault has re-read the save and settled. The history
 *     renders the reason a change was recorded with.
 * (c) A recorded removal decision keeps its confirmation after the same re-read.
 *
 * The re-read is delayed, as a network round trip is. The confirmation is checked
 * once the re-read has been delivered and the pane is back, not at the instant it
 * first appears: a note that is on screen for one frame does not count.
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
const PREVIEW_URL = `/api/c2c/projects/${PID}/document-dispositions`;
const REREAD_MS = 120;
const VERIFIED = { store: 'audit_logs', ok: true, rowsChecked: 40, legacyRows: 0, sequencedRows: 40 };

let recordedChoice: string | undefined;
let settledReads = 0;

const docs = () => [
  uploadDoc({
    id: `up-${DOC_A}`, docId: DOC_A, title: 'stability-summary-24m', type: 'Test reports', disposition: recordedChoice,
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

/** A preview of the first document, as the server reads it: every count and hash present, nothing blocked. */
function dispositionPreview() {
  return {
    target: { type: 'vault_document', id: DOC_A, title: 'stability-summary-24m', sha256: 'a'.repeat(64) },
    linkedIds: { capturedSourceIds: [], vaultDocumentIds: [DOC_A], artifactIds: [], uploadIds: [`up-${DOC_A}`] },
    counts: { extractedTexts: 1, chunks: 18, atoms: 4, catalogValues: 6, citations: 3, downstreamReferences: 2 },
    retention: { legalHolds: 0, retentionUntil: null, physicalErasure: false }, approvals: { active: 0 }, blockers: [],
    replacement: null, allowedChoices: ['keep_data', 'remove_data', 'supersede'], previewToken: 'signed-preview',
    expiresAt: new Date(Date.now() + 600_000).toISOString(), currentDisposition: null,
  };
}

function mockApi() {
  apiRequest.mockImplementation(async (method: string, url: string) => {
    if (url === VAULT_URL && method === 'GET') {
      // The first read is the page load. Every later read is a re-read after a change, and takes a round trip.
      if (vaultReads() > 1) await new Promise((r) => setTimeout(r, REREAD_MS));
      settledReads += 1;
      return ok(vaultPayload({ tree: cabinetTree(docs()) }));
    }
    if (url.endsWith('/history') && method === 'GET') return ok({ success: true, data: { entries: historyEntries, chain: VERIFIED } });
    if (url.endsWith('/details') && method === 'POST') return detailsReply();
    if (url.startsWith(`${PREVIEW_URL}/preview?`) && method === 'GET') return ok({ preview: dispositionPreview() });
    if (url === PREVIEW_URL && method === 'POST') {
      recordedChoice = 'keep_data';
      return ok({
        success: true,
        disposition: { id: 'decision-1', choice: 'keep_data', target: { type: 'vault_document', id: DOC_A }, auditReceipt: { id: 'receipt-1', sha256Chain: 'b'.repeat(64) } },
      });
    }
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
  recordedChoice = undefined;
  settledReads = 0;
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
  it('shows the server confirmation, and still shows it after the Vault has re-read the save and settled', async () => {
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

    // The save makes the surface re-read the Vault. Wait until that re-read has been delivered and the
    // block is back on screen, then check the confirmation: it must still be there, not only for a frame.
    await waitFor(() => expect(settledReads).toBe(2));
    await waitFor(() => expect(detailsBlocks()).toHaveLength(1));
    await new Promise((r) => setTimeout(r, 30));
    expect(screen.getByTestId('vault-edit-details-note').textContent).toMatch(/recorded in this document's history/);
  });
});

describe('Vault detail pane: a removal decision', () => {
  it('shows the recorded decision after the Vault has re-read the document and settled', async () => {
    render(<Vault {...props()} />);
    fireEvent.click(await screen.findByRole('button', { name: 'Review removal of stability-summary-24m' }));
    await screen.findByText('a'.repeat(64));
    fireEvent.click(screen.getByRole('radio', { name: /Remove file; retain extracted data/ }));
    fireEvent.change(screen.getByRole('textbox', { name: 'Reason for this decision' }), { target: { value: REASON } });
    await waitFor(() => expect((screen.getByRole('button', { name: 'Confirm this decision' }) as HTMLButtonElement).disabled).toBe(false));
    fireEvent.click(screen.getByRole('button', { name: 'Confirm this decision' }));

    await waitFor(() => expect(settledReads).toBe(2));
    await waitFor(() => expect(screen.getByRole('button', { name: 'Review removal of stability-summary-24m' })).toBeTruthy());
    await new Promise((r) => setTimeout(r, 30));
    expect(screen.getByText(/recorded with your reason and its audit receipt/)).toBeTruthy();
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
