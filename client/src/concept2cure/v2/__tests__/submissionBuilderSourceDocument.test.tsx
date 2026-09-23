// @vitest-environment jsdom
/**
 * The Builder's "Source document" column resolves a vault-backed leaf.
 *
 * MDX demo pack, 2026-09-21, finding F5: a leaf filed from the vault carries
 * `documentUuid` (documentId is null, the vault is uuid-keyed) and the column
 * tested `documentId != null` — so six leaves the platform had just linked
 * read "Source document: unlinked". The read model now carries the server's
 * resolution (`sourceDocument`, from the same resolver the dispatch gate
 * uses), and the column renders it: store, key and the pin verdict.
 */
import React from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';

const apiRequest = vi.hoisted(() => vi.fn());
vi.mock('@/lib/queryClient', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/queryClient')>()),
  apiRequest,
}));
vi.mock('../../hooks/useEsignature', () => ({
  useEsignature: () => ({
    verifyPassword: vi.fn(async () => ({ valid: true })), verifyMfa: vi.fn(async () => ({ valid: true })),
    sign: vi.fn(), verifyingPassword: false, verifyingMfa: false, signing: false, signError: null,
  }),
}));

import { SubmissionCenter } from '../surfaces/SubmissionCenter';

const props = () => ({ onAsk: vi.fn(), onNav: vi.fn() });
const SUBS = [{ id: 68, title: '[Demo · MDX] NeuroPanel-Dx 510(k)', productName: 'NeuroPanel-Dx', applicationType: '510k', clientType: 'ivd', primaryRegion: 'fda', status: 'planning', lifecycleStage: 'original' }];
const SEQS = [{ id: 29, sequenceNumber: '0000', type: 'original', status: 'assembling', region: 'fda', validationStatus: null }];
const UUID = '1b80ee68-61d1-46cd-b4b5-c26e25f5035b';
const PIN = 'e5a41c0938f492311d1f3c46078abf70f1a7b02fbb927280edcf83fcda05d73b';

const LEAVES = [
  {
    id: 38, sectionCode: '1.14', title: '[Demo · MDX] Labeling and Instructions for Use (Draft)', granularity: null, lifecycleOp: 'new',
    documentTable: 'vault_documents', documentId: null, documentUuid: UUID, documentType: 'labeling', documentContentSha256: PIN,
    sourceDocument: { status: 'resolved', keyKind: 'uuid', documentTable: 'vault_documents', documentId: null, documentUuid: UUID, pinnedSha256: PIN, storedSha256: PIN, pin: 'match', reason: null },
  },
  {
    id: 39, sectionCode: '3.2.P.1', title: '[Demo · MDX] Device Description', granularity: null, lifecycleOp: 'new',
    documentTable: 'vault_documents', documentId: null, documentUuid: '0bdf94f7-6f27-4803-8314-57a077744bb6', documentType: 'device_description', documentContentSha256: 'a'.repeat(64),
    sourceDocument: { status: 'content_changed', keyKind: 'uuid', documentTable: 'vault_documents', documentId: null, documentUuid: '0bdf94f7-6f27-4803-8314-57a077744bb6', pinnedSha256: 'a'.repeat(64), storedSha256: 'b'.repeat(64), pin: 'mismatch', reason: 'the content hash pinned at filing no longer matches the stored document' },
  },
  {
    id: 40, sectionCode: 'm2.5', title: 'Clinical Overview', granularity: 'document', lifecycleOp: 'new',
    documentTable: 'coauthor_documents', documentId: 88, documentUuid: null, documentType: 'summary', documentContentSha256: null,
    sourceDocument: { status: 'resolved', keyKind: 'integer', documentTable: 'coauthor_documents', documentId: 88, documentUuid: null, pinnedSha256: null, storedSha256: 'c'.repeat(64), pin: 'unpinned', reason: 'no content pin was taken when the leaf was filed' },
  },
  {
    id: 41, sectionCode: 'm2.4', title: 'Nonclinical Overview', granularity: null, lifecycleOp: 'new',
    documentTable: 'coauthor_documents', documentId: 999, documentUuid: null, documentType: null, documentContentSha256: null,
    sourceDocument: { status: 'missing', keyKind: 'integer', documentTable: 'coauthor_documents', documentId: 999, documentUuid: null, pinnedSha256: null, storedSha256: null, pin: 'unpinned', reason: 'coauthor_documents row not found in this organization' },
  },
  {
    id: 42, sectionCode: 'm1.2', title: 'Cover letter', granularity: null, lifecycleOp: 'new',
    documentTable: null, documentId: null, documentUuid: null, documentType: null, documentContentSha256: null,
    sourceDocument: { status: 'no_pointer', keyKind: null, documentTable: null, documentId: null, documentUuid: null, pinnedSha256: null, storedSha256: null, pin: 'unpinned', reason: 'the leaf names no document table' },
  },
];

function mockApi() {
  apiRequest.mockImplementation(async (method: string, url: string) => {
    const ok = (data: unknown) => ({ ok: true, status: 200, json: async () => data }) as Response;
    if (method === 'GET' && url === '/api/submissions') return ok(SUBS);
    if (method === 'GET' && url === '/api/submissions/68/sequences') return ok(SEQS);
    if (method === 'GET' && url === '/api/submissions/sequences/29/leaves') return ok(LEAVES);
    if (method === 'GET' && url === '/api/510k/estar/submissions') return ok({ submissions: [] });
    return ok([]);
  });
}

afterEach(cleanup);
beforeEach(() => {
  apiRequest.mockReset();
  mockApi();
});

const rowFor = async (title: string) => {
  const cell = await screen.findByText(title);
  return within(cell.closest('tr') as HTMLElement);
};

describe('Builder — source document column', () => {
  it('a vault leaf keyed by uuid is linked, named by its store and key, and shows its verified pin', async () => {
    render(<SubmissionCenter {...props()} />);
    await waitFor(() => expect(document.body.textContent).toContain('NeuroPanel-Dx'));
    fireEvent.click(screen.getByRole('tab', { name: 'Builder' }));
    const row = await rowFor('[Demo · MDX] Labeling and Instructions for Use (Draft)');
    expect(row.queryByText('unlinked')).toBeNull();
    expect(row.getByText(/Vault document/)).toBeTruthy();
    expect(row.getByTitle(UUID)).toBeTruthy();
    expect(row.getByText('source verified')).toBeTruthy();
  });

  it('a changed pin, a missing document and an unpinned leaf each say so in the server’s words', async () => {
    render(<SubmissionCenter {...props()} />);
    await waitFor(() => expect(document.body.textContent).toContain('NeuroPanel-Dx'));
    fireEvent.click(screen.getByRole('tab', { name: 'Builder' }));
    const changed = await rowFor('[Demo · MDX] Device Description');
    expect(changed.getByText('content changed since filing')).toBeTruthy();
    const missing = await rowFor('Nonclinical Overview');
    expect(missing.getByText('not found in this organization')).toBeTruthy();
    const unpinned = await rowFor('Clinical Overview');
    expect(unpinned.getByText(/Authored document #88/)).toBeTruthy();
    expect(unpinned.getByText('no content pin')).toBeTruthy();
  });

  it('only a leaf with no pointer at all is "unlinked"', async () => {
    render(<SubmissionCenter {...props()} />);
    await waitFor(() => expect(document.body.textContent).toContain('NeuroPanel-Dx'));
    fireEvent.click(screen.getByRole('tab', { name: 'Builder' }));
    const bare = await rowFor('Cover letter');
    expect(bare.getByText('unlinked')).toBeTruthy();
    expect(screen.getAllByText('unlinked')).toHaveLength(1);
  });
});
