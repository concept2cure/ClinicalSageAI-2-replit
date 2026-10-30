// @vitest-environment jsdom
import React from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, render, renderHook, screen } from '@testing-library/react';
import { useVaultUpload, type VaultUploadFileStatus } from '../useVaultUpload';
import { stageFiles, VaultUploadStaging } from '../surfaces/VaultUploadStaging';
import { stubIngestXhr } from './_ingest-xhr-fake';

const PROGRAM = '11111111-1111-4111-8111-111111111111';
const DOCUMENT = '22222222-2222-4222-8222-222222222222';
const PREVIOUS = '33333333-3333-4333-8333-333333333333';
const file = () => new File(['synthetic bytes'], 'receipt.pdf', { type: 'application/pdf' });
const receipt = () => ({
  success: true,
  document: { id: DOCUMENT, programId: PROGRAM, documentCode: 'receipt.pdf', documentTitle: 'Receipt', version: '1.0', extraction: 'extracted' },
  filing: { folderId: 'module-3', folderLabel: 'Module 3 · Quality', placementStatus: 'confirmed', needsReview: false },
});
const doc = (patch: Record<string, unknown>) => ({ ...receipt(), document: { ...receipt().document, ...patch } });
const filing = (patch: Record<string, unknown>) => ({ ...receipt(), filing: { ...receipt().filing, ...patch } });
const reupload = (patch: Record<string, unknown> = {}) => ({
  ...receipt(), reupload: { unchanged: true, changes: [], differs: [], ...patch },
});

afterEach(() => { cleanup(); vi.unstubAllGlobals(); });

const malformed: Array<[string, unknown, number]> = [
  ['null body', null, 201], ['empty body', {}, 201], ['array body', [receipt()], 201], ['scalar body', 'ok', 201],
  ['missing success', { document: receipt().document, filing: receipt().filing }, 201],
  ['false success', { ...receipt(), success: false }, 201], ['string success', { ...receipt(), success: 'true' }, 201],
  ['contradictory error', { ...receipt(), error: { code: 'FAILED' } }, 201],
  ['missing document', { success: true, filing: receipt().filing }, 201],
  ['null document', { ...receipt(), document: null }, 201], ['array document', { ...receipt(), document: [] }, 201],
  ['missing document id', doc({ id: undefined }), 201], ['blank document id', doc({ id: '' }), 201],
  ['placeholder document id', doc({ id: 'doc-new' }), 201], ['numeric document id', doc({ id: 42 }), 201],
  ['another project', doc({ programId: PREVIOUS }), 201], ['missing project', doc({ programId: undefined }), 201],
  ['another file in this project', doc({ documentCode: 'another-file.pdf' }), 201],
  ['invalid title', doc({ documentTitle: {} }), 201], ['invalid assigned version', doc({ version: {} }), 201],
  ['invalid extraction state', doc({ extraction: 'complete' }), 201],
  ['missing filing', { success: true, document: receipt().document }, 201],
  ['invalid folder label', filing({ folderLabel: {} }), 201], ['invalid folder id', filing({ folderId: 12 }), 201],
  ['unknown placement', filing({ placementStatus: 'archived' }), 201],
  ['string review flag', filing({ needsReview: 'false' }), 201], ['contradictory review flag', filing({ needsReview: true }), 201],
  ['confirmed placement without folder', filing({ folderId: null }), 201],
  ['missing reupload on HTTP200', receipt(), 200], ['reupload on HTTP201', reupload(), 201],
  ['accepted without the route status', receipt(), 202], ['no-content status', receipt(), 204],
  ['invalid reupload differences', reupload({ differs: {} }), 200],
  ['invalid difference row', reupload({ differs: [null] }), 200],
  ['unknown difference field', reupload({ differs: [{ field: 'not_a_field', recorded: null, requested: 'x' }] }), 200],
  ['invalid recorded difference', reupload({ differs: [{ field: 'document_title', recorded: 1, requested: 'x' }] }), 200],
  ['string unchanged flag', reupload({ unchanged: 'true' }), 200],
  ['false unchanged with no changes', reupload({ unchanged: false }), 200],
  ['true unchanged despite changes', reupload({ changes: [{ field: 'storage_version_id', from: null, to: 'stored' }] }), 200],
  ['invalid change row', reupload({ unchanged: false, changes: [null] }), 200],
  ['equal change values', reupload({ unchanged: false, changes: [{ field: 'storage_version_id', from: null, to: null }] }), 200],
  ['equal requested and recorded values', reupload({ differs: [{ field: 'document_title', recorded: 'Receipt', requested: 'Receipt' }] }), 200],
  ['duplicate change fields', reupload({ unchanged: false, changes: [
    { field: 'storage_version_id', from: null, to: 'a' }, { field: 'storage_version_id', from: 'a', to: 'b' },
  ] }), 200],
  ['duplicate difference fields', reupload({ differs: [
    { field: 'document_title', recorded: 'Old', requested: 'New' }, { field: 'document_title', recorded: 'Old', requested: 'Other' },
  ] }), 200],
];

describe('Vault upload receipts: a successful HTTP status does not confirm a write', () => {
  it.each(malformed)('keeps %s unconfirmed', async (_name, body, status) => {
    const answer = stubIngestXhr(vi.fn(async () => ({ status, json: async () => body })));
    const { result } = renderHook(() => useVaultUpload(PROGRAM));
    const statuses: VaultUploadFileStatus[] = [];
    let outcome!: Awaited<ReturnType<typeof result.current.upload>>;
    await act(async () => { outcome = await result.current.upload([file()], { onFileStatus: (_i, value) => statuses.push(value) }); });
    expect(outcome.succeeded).toEqual([]);
    expect(outcome.recorded).toEqual([]);
    expect(outcome.filings).toEqual([]);
    expect(outcome.newVersions).toEqual([]);
    expect(outcome.alreadyRecorded).toEqual([]);
    expect(outcome.conflicts).toEqual([]);
    expect(outcome.failed).toEqual([expect.objectContaining({ name: 'receipt.pdf', unknown: true })]);
    expect(statuses.at(-1)).toMatchObject({ state: 'refused', unknown: true });
    expect(result.current.note?.text).toMatch(/not known whether.*recorded/i);
    expect(result.current.note?.text).not.toMatch(/Not filed|Nothing partial was recorded/);
    expect(answer).toHaveBeenCalledTimes(1);
  });

  it('keeps an unreadable successful reply unconfirmed and sends no retry', async () => {
    const answer = stubIngestXhr(vi.fn(async () => ({ status: 201, json: async () => { throw new SyntaxError('synthetic invalid JSON'); } })));
    const { result } = renderHook(() => useVaultUpload(PROGRAM));
    await act(async () => {
      const outcome = await result.current.upload([file()]);
      expect(outcome.succeeded).toEqual([]);
      expect(outcome.failed[0]).toMatchObject({ unknown: true });
    });
    expect(answer).toHaveBeenCalledTimes(1);
  });

  it('does not confirm the previous version as its own replacement', async () => {
    stubIngestXhr(vi.fn(async () => ({ status: 201, json: async () => doc({ id: PREVIOUS, documentCode: 'original.pdf', version: '2.0' }) })));
    const { result } = renderHook(() => useVaultUpload(PROGRAM));
    await act(async () => {
      const outcome = await result.current.upload([file()], { newVersionOf: { documentId: PREVIOUS, title: 'Original' } });
      expect(outcome.succeeded).toEqual([]);
      expect(outcome.recorded).toEqual([]);
      expect(outcome.newVersions).toEqual([]);
      expect(outcome.failed[0]).toMatchObject({ unknown: true });
    });
  });

  it('preserves the server’s explicit uncertain-commit result without claiming nothing was recorded', async () => {
    const answer = stubIngestXhr(vi.fn(async () => ({ status: 503, json: async () => ({
      error: { code: 'OUTCOME_UNKNOWN', message: 'The Vault admission outcome could not be confirmed. Review the current Vault records before trying again.' },
    }) })));
    const { result } = renderHook(() => useVaultUpload(PROGRAM));
    let last!: VaultUploadFileStatus;
    await act(async () => {
      const outcome = await result.current.upload([file()], { onFileStatus: (_i, value) => { last = value; } });
      expect(outcome.recorded).toEqual([]);
      expect(outcome.failed[0]).toMatchObject({ unknown: true });
    });
    expect(last).toMatchObject({ state: 'refused', unknown: true });
    expect(result.current.note?.text).not.toMatch(/Not filed|Nothing partial was recorded/);
    expect(answer).toHaveBeenCalledTimes(1);
  });
});

describe('Vault upload receipts: valid committed responses keep their actual meaning', () => {
  it('records the returned identity and exact filing, permitting extra response fields', async () => {
    stubIngestXhr(vi.fn(async () => ({ status: 201, json: async () => ({ ...receipt(), futureMetadata: { available: true } }) })));
    const { result } = renderHook(() => useVaultUpload(PROGRAM));
    await act(async () => {
      const outcome = await result.current.upload([file()]);
      expect(outcome.succeeded).toEqual(['receipt.pdf']);
      expect(outcome.recorded).toEqual([DOCUMENT]);
      expect(outcome.filings[0]).toMatchObject({ placement: 'confirmed', folderLabel: 'Module 3 · Quality' });
      expect(outcome.failed).toEqual([]);
    });
  });

  it('honors explicit Unfiled despite a retained old folder and accepts a legacy null title', async () => {
    const body = { ...reupload({ differs: [{ field: 'document_title', recorded: null, requested: 'receipt' }] }), document: { ...receipt().document, documentTitle: null }, filing: { ...receipt().filing, placementStatus: 'unfiled', needsReview: true } };
    stubIngestXhr(vi.fn(async () => ({ status: 200, json: async () => body })));
    const { result } = renderHook(() => useVaultUpload(PROGRAM));
    const statuses: VaultUploadFileStatus[] = [];
    await act(async () => {
      const outcome = await result.current.upload([file()], { onFileStatus: (_i, value) => statuses.push(value) });
      expect(outcome.recorded).toEqual([DOCUMENT]);
      expect(outcome.alreadyRecorded[0]).toMatchObject({ name: 'receipt.pdf' });
      expect(statuses.at(-1)).toMatchObject({ state: 'stored', placement: 'unfiled', folderLabel: null });
    });
    expect(result.current.note?.text).not.toMatch(/Auto-filed|Module 3/);
    expect(result.current.note?.text).not.toContain('(as "receipt.pdf")');
  });

  it('reports a valid repaired reupload without claiming nothing changed in the row or batch', async () => {
    const body = reupload({ unchanged: false, changes: [{ field: 'storage_version_id', from: null, to: 'stored-copy' }] });
    stubIngestXhr(vi.fn(async () => ({ status: 200, json: async () => body })));
    const { result } = renderHook(() => useVaultUpload(PROGRAM));
    let last!: VaultUploadFileStatus;
    await act(async () => {
      const outcome = await result.current.upload([file()], { onFileStatus: (_i, value) => { last = value; } });
      expect(outcome.recorded).toEqual([DOCUMENT]);
      expect(outcome.alreadyRecorded[0]).toMatchObject({ updated: true });
    });
    expect(last).toMatchObject({ state: 'stored', recordUpdated: true });
    expect(result.current.note?.text).toMatch(/record was updated/i);
    expect(result.current.note?.text).not.toMatch(/nothing changed/i);
    const staging = stageFiles({ files: [{ file: file(), path: 'receipt.pdf' }], unread: 0 }, 'OTHER');
    staging.rows[0].status = last;
    render(<VaultUploadStaging staging={staging} folders={[]} uploading={false} onChange={vi.fn()} onRemove={vi.fn()} onUpload={vi.fn()} onDone={vi.fn()} />);
    expect(screen.getByTestId('vault-stage-row').textContent).toMatch(/record was updated/i);
    expect(screen.getByTestId('vault-stage-row').textContent).not.toMatch(/nothing was changed/i);
  });

  it('keeps a valid new version with its retained code and server-assigned version', async () => {
    stubIngestXhr(vi.fn(async () => ({ status: 201, json: async () => doc({ documentCode: 'original.pdf', version: '2.0', extraction: 'pending' }) })));
    const { result } = renderHook(() => useVaultUpload(PROGRAM));
    let last!: VaultUploadFileStatus;
    await act(async () => {
      const outcome = await result.current.upload([file()], { newVersionOf: { documentId: PREVIOUS, title: 'Original' }, onFileStatus: (_i, value) => { last = value; } });
      expect(outcome.recorded).toEqual([DOCUMENT]);
      expect(outcome.newVersions[0]).toMatchObject({ version: '2.0', title: 'Original' });
    });
    expect(last).toMatchObject({ state: 'stored', readingText: true });
  });

  it('continues a mixed batch after a malformed receipt without counting it or retrying it', async () => {
    const answer = stubIngestXhr(vi.fn(async (_url, init) => {
      const code = String((init.body as FormData).get('documentCode'));
      return { status: 201, json: async () => code === 'bad.pdf' ? null : doc({
        id: code === 'first.pdf' ? DOCUMENT : PREVIOUS, documentCode: code,
      }) };
    }));
    const { result } = renderHook(() => useVaultUpload(PROGRAM));
    await act(async () => {
      const outcome = await result.current.upload(['first.pdf', 'bad.pdf', 'last.pdf'].map((name) => new File(['synthetic bytes'], name)));
      expect(outcome.succeeded).toEqual(['first.pdf', 'last.pdf']);
      expect(outcome.recorded).toEqual([DOCUMENT, PREVIOUS]);
      expect(outcome.failed).toEqual([expect.objectContaining({ name: 'bad.pdf', unknown: true })]);
    });
    expect(answer).toHaveBeenCalledTimes(3);
    expect(result.current.note?.text).toMatch(/Filed 2.*not known whether/s);
  });
});
