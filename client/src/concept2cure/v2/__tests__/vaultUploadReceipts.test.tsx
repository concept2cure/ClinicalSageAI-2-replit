// @vitest-environment jsdom
import React from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, render, renderHook, screen } from '@testing-library/react';
import { clearAuthToken, setAuthToken } from '@/utils/authToken';
import { useVaultUpload, type VaultUploadFileStatus, type VaultUploadOutcome } from '../useVaultUpload';
import { stageFiles, VaultUploadStaging } from '../surfaces/VaultUploadStaging';
import { stubIngestXhr, type IngestInit } from './_ingest-xhr-fake';

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

afterEach(() => { cleanup(); vi.unstubAllGlobals(); clearAuthToken(); });

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
  ['missing assigned version', doc({ version: undefined }), 201], ['blank assigned version', doc({ version: ' \t' }), 201],
  ['missing stored title', doc({ documentTitle: undefined }), 201],
  ['invalid extraction state', doc({ extraction: 'complete' }), 201],
  ['missing filing', { success: true, document: receipt().document }, 201],
  ['invalid folder label', filing({ folderLabel: {} }), 201], ['invalid folder id', filing({ folderId: 12 }), 201],
  ['blank folder id', filing({ folderId: '  ' }), 201], ['missing placement', filing({ placementStatus: undefined }), 201],
  ['unfiled without needed review', filing({ folderId: null, placementStatus: 'unfiled', needsReview: false }), 201],
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
  ['nontext change before value', reupload({ unchanged: false, changes: [{ field: 'storage_version_id', from: 0, to: 'stored' }] }), 200],
  ['missing requested difference value', reupload({ differs: [{ field: 'folder_id', recorded: null }] }), 200],
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
    const { result, rerender } = renderHook(() => useVaultUpload(PROGRAM));
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
    expect(statuses.some((status) => status.state === 'stored')).toBe(false);
    expect(result.current.uploading).toBe(false);
    expect(result.current.note?.tone).toBe('error');
    expect(result.current.note?.text).toMatch(/Reload the Vault and check before trying again/);
    expect(result.current.note?.text).toMatch(/not known whether.*recorded/i);
    expect(result.current.note?.text).not.toMatch(/Not filed|Nothing partial was recorded/);
    rerender();
    await act(async () => { await Promise.resolve(); });
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
    const answer = stubIngestXhr(vi.fn(async (_url: string, _init: IngestInit) => ({ status: 201, json: async () => doc({ documentCode: 'original.pdf', version: 'revision-7B', extraction: 'pending' }) })));
    const { result } = renderHook(() => useVaultUpload(PROGRAM));
    let last!: VaultUploadFileStatus;
    await act(async () => {
      const outcome = await result.current.upload([file()], { newVersionOf: { documentId: PREVIOUS, title: 'Earlier request title' }, onFileStatus: (_i, value) => { last = value; } });
      expect(outcome.recorded).toEqual([DOCUMENT]);
      expect(outcome.newVersions).toEqual([{ name: 'receipt.pdf', version: 'revision-7B', title: 'Receipt', folderLabel: 'Module 3 · Quality' }]);
      expect(outcome.failed).toEqual([]);
      expect(outcome.filings).toEqual([]);
      expect(outcome.alreadyRecorded).toEqual([]);
    });
    expect(last).toMatchObject({ state: 'stored', readingText: true });
    const form = answer.mock.calls[0][1].body as FormData;
    expect(form.get('supersedesDocumentId')).toBe(PREVIOUS);
    expect(form.get('documentCode')).toBeNull();
    expect(form.get('version')).toBeNull();
    expect(form.get('documentTitle')).toBe('Earlier request title');
    expect(result.current.note?.text).toContain('to "Receipt" as vrevision-7B');
    expect(result.current.note?.text).not.toContain('Earlier request title');
    expect(result.current.uploading).toBe(false);
    expect(answer).toHaveBeenCalledTimes(1);
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


/** Exact unknown outcome, shared by raw-JSON and check-in recovery controls. */
function expectUnconfirmed(outcome: VaultUploadOutcome) {
  expect(outcome).toEqual({
    succeeded: [], recorded: [], filings: [], alreadyRecorded: [], conflicts: [], newVersions: [],
    failed: [{ name: 'receipt.pdf', reason: expect.any(String), unknown: true }],
  });
  expect(outcome.failed[0].reason).not.toMatch(/nothing.*recorded|no reply arrived/i);
}

describe('Vault upload receipts: raw replies and batch recovery', () => {
  // The shared fake serializes a rejected json() as null. Exercise actual
  // responseText parsing failure over the existing sendIngest XHR seam too.
  it.each(['', '<html>upstream response</html>', '{"success":'])('settles an undecodable successful raw response %j without retry', async (text) => {
    const sent = vi.fn();
    class RawReplyXhr {
      status = 201;
      responseText = text;
      withCredentials = false;
      upload = {};
      onload: (() => void) | null = null;
      open() { /* Real sendIngest owns the request. */ }
      setRequestHeader() { /* Authentication is checked by the positive controls. */ }
      send(body: unknown) { sent(body); globalThis.queueMicrotask(() => this.onload?.()); }
    }
    vi.stubGlobal('XMLHttpRequest', RawReplyXhr);
    const { result } = renderHook(() => useVaultUpload(PROGRAM));
    const statuses: VaultUploadFileStatus[] = [];
    let outcome!: VaultUploadOutcome;
    await act(async () => { outcome = await result.current.upload([file()], { onFileStatus: (_i, value) => statuses.push(value) }); });
    expectUnconfirmed(outcome);
    expect(statuses.at(-1)).toMatchObject({ state: 'refused', unknown: true });
    expect(statuses.some((status) => status.state === 'stored')).toBe(false);
    expect(result.current.uploading).toBe(false);
    expect(result.current.note?.text).toMatch(/Reload the Vault and check/);
    expect(sent).toHaveBeenCalledTimes(1);
  });

  it('continues after both missing and malformed reupload receipts without another POST for either', async () => {
    const bodies = [null, { ...reupload({ differs: [null] }), document: { ...receipt().document, documentCode: 'malformed.pdf' } }, doc({ documentCode: 'confirmed.pdf' })];
    const sent: string[] = [];
    const answer = stubIngestXhr(vi.fn(async (_url: string, init: IngestInit) => {
      sent.push(String((init.body as FormData).get('documentCode')));
      const index = sent.length - 1;
      return { status: index === 1 ? 200 : 201, json: async () => bodies[index] };
    }));
    const statuses: Array<{ index: number; status: VaultUploadFileStatus }> = [];
    const { result } = renderHook(() => useVaultUpload(PROGRAM));
    let outcome!: VaultUploadOutcome;
    await act(async () => { outcome = await result.current.upload(['unknown.pdf', 'malformed.pdf', 'confirmed.pdf'].map((name) => new File(['synthetic bytes'], name)), {
      onFileStatus: (index, status) => statuses.push({ index, status }),
    }); });
    expect(sent).toEqual(['unknown.pdf', 'malformed.pdf', 'confirmed.pdf']);
    expect(outcome.succeeded).toEqual(['confirmed.pdf']);
    expect(outcome.recorded).toEqual([DOCUMENT]);
    expect(outcome.failed).toEqual([
      { name: 'unknown.pdf', reason: expect.any(String), unknown: true },
      { name: 'malformed.pdf', reason: expect.any(String), unknown: true },
    ]);
    expect(outcome.filings.map((entry) => entry.name)).toEqual(['confirmed.pdf']);
    expect(outcome.alreadyRecorded).toEqual([]);
    expect(outcome.newVersions).toEqual([]);
    expect(outcome.conflicts).toEqual([]);
    expect(statuses.filter((entry) => entry.status.state === 'stored').map((entry) => entry.index)).toEqual([2]);
    expect(result.current.uploading).toBe(false);
    expect(result.current.note?.text).toMatch(/Filed 1/);
    expect(result.current.note?.text).toMatch(/unknown.pdf; malformed.pdf/);
    expect(answer).toHaveBeenCalledTimes(3);
  });

});

describe('Vault upload receipts: compatible metadata and reupload guidance', () => {
  const compatible = [
    { label: 'absent extraction and extra future fields', extraction: undefined, folder: 'quality/custom-folder', folderLabel: 'Quality', placement: 'confirmed', reading: false },
    { label: 'extracted with null label and opaque folder code', extraction: 'extracted', folder: 'quality/custom-folder', folderLabel: null, placement: 'suggested', reading: false },
    { label: 'pending with empty label', extraction: 'pending', folder: 'quality/custom-folder', folderLabel: '', placement: 'confirmed', reading: true },
    { label: 'failed extraction stored unfiled', extraction: 'failed', folder: null, folderLabel: '', placement: 'unfiled', reading: false },
  ];
  it.each(compatible)('accepts a real-shaped authenticated receipt: $label', async (item) => {
    setAuthToken('vault-receipt-session');
    const body = { ...receipt(), futureField: { accepted: true },
      document: { ...receipt().document, extraction: item.extraction, futureMetadata: 7 },
      filing: { ...receipt().filing, folderId: item.folder, folderLabel: item.folderLabel,
        placementStatus: item.placement, needsReview: item.folder === null, futureFiling: 'retained' } };
    const answer = stubIngestXhr(vi.fn(async (_url: string, _init: IngestInit) => ({ status: 201, json: async () => body })));
    const statuses: VaultUploadFileStatus[] = [];
    const { result } = renderHook(() => useVaultUpload(PROGRAM));
    let outcome!: VaultUploadOutcome;
    await act(async () => { outcome = await result.current.upload([file()], { onFileStatus: (_i, value) => statuses.push(value) }); });
    expect(outcome.succeeded).toEqual(['receipt.pdf']);
    expect(outcome.recorded).toEqual([DOCUMENT]);
    expect(outcome.failed).toEqual([]);
    expect(outcome.filings).toEqual([{ name: 'receipt.pdf', folderLabel: item.folder ? item.folderLabel || item.folder : null,
      needsReview: item.folder === null, placement: item.placement }]);
    expect(statuses.at(-1)).toEqual({ state: 'stored', version: '1.0', folderLabel: item.folder ? item.folderLabel || item.folder : null,
      placement: item.placement, already: false, ...(item.reading ? { readingText: true } : {}) });
    expect(result.current.uploading).toBe(false);
    expect(result.current.note?.tone).toBe('ok');
    const [url, init] = answer.mock.calls[0];
    expect(url).toBe('/api/vault/ingest');
    expect(init.method).toBe('POST');
    expect(init.credentials).toBe('include');
    expect(init.headers.Authorization).toBe('Bearer vault-receipt-session');
    expect(Object.keys(init.headers).map((key) => key.toLowerCase())).not.toContain('content-type');
    expect((init.body as FormData).get('programId')).toBe(PROGRAM);
    expect(answer).toHaveBeenCalledTimes(1);
  });

  it.each([true, false])('keeps detail/filing guidance and repair flags truthful with unchanged=%s', async (unchanged) => {
    const body = reupload({ unchanged,
      changes: unchanged ? [] : [{ field: 'storage_version_id', from: null, to: 'stored-object-version' }],
      differs: [{ field: 'document_title', recorded: 'Receipt', requested: 'Renamed' },
        { field: 'folder_id', recorded: 'module-3', requested: 'module-5' }],
      futureReceiptField: 'accepted',
    });
    const answer = stubIngestXhr(vi.fn(async () => ({ status: 200, json: async () => body })));
    const { result } = renderHook(() => useVaultUpload(PROGRAM));
    let outcome!: VaultUploadOutcome;
    let last!: VaultUploadFileStatus;
    await act(async () => { outcome = await result.current.upload([file()], { onFileStatus: (_i, value) => { last = value; } }); });
    expect(outcome.recorded).toEqual([DOCUMENT]);
    expect(outcome.succeeded).toEqual(['receipt.pdf']);
    expect(outcome.failed).toEqual([]);
    expect(outcome.filings).toEqual([]);
    expect(outcome.newVersions).toEqual([]);
    expect(outcome.alreadyRecorded).toEqual([{ name: 'receipt.pdf', title: 'Receipt', differs: true, filingDiffers: true,
      ...(!unchanged ? { updated: true } : {}) }]);
    expect(last).toMatchObject({ state: 'stored', already: true });
    if (unchanged) {
      expect(last).not.toHaveProperty('recordUpdated');
      expect(result.current.note?.text).toMatch(/nothing changed/i);
      expect(result.current.note?.text).not.toMatch(/record was updated/i);
    } else {
      expect(last).toMatchObject({ recordUpdated: true });
      expect(result.current.note?.text).toMatch(/record was updated/i);
      expect(result.current.note?.text).not.toMatch(/nothing changed/i);
    }
    expect(result.current.note?.text).toMatch(/Already in the Vault/);
    expect(result.current.note?.text).toMatch(/Edit details/);
    expect(result.current.note?.text).toMatch(/Move in its filing/);
    expect(result.current.uploading).toBe(false);
    expect(answer).toHaveBeenCalledTimes(1);
  });

});

describe('Vault upload receipts: legacy title and check-in recovery', () => {
  it.each([null, '', '  '])('uses generic check-in copy for a legacy stored title %j without inventing a title', async (title) => {
    const answer = stubIngestXhr(vi.fn(async () => ({ status: 201, json: async () => doc({ documentCode: 'original.pdf', version: '2.0', documentTitle: title }) })));
    const { result } = renderHook(() => useVaultUpload(PROGRAM));
    await act(async () => {
      const outcome = await result.current.upload([file()], { newVersionOf: { documentId: PREVIOUS, title: 'Earlier request title' } });
      expect(outcome.newVersions).toEqual([{ name: 'receipt.pdf', version: '2.0', title, folderLabel: 'Module 3 · Quality' }]);
      expect(outcome.recorded).toEqual([DOCUMENT]);
      expect(outcome.failed).toEqual([]);
    });
    expect(result.current.note?.text).toContain('Added receipt.pdf to the recorded document as v2.0');
    expect(result.current.note?.text).not.toMatch(/Earlier request title|"null"|"undefined"|"\s*"/);
    expect(result.current.uploading).toBe(false);
    expect(answer).toHaveBeenCalledTimes(1);
  });

  it('keeps a missing-identity check-in unknown without completing its new-version outcome', async () => {
    const answer = stubIngestXhr(vi.fn(async () => ({ status: 201, json: async () => doc({ id: undefined, version: '2.0' }) })));
    const { result } = renderHook(() => useVaultUpload(PROGRAM));
    const statuses: VaultUploadFileStatus[] = [];
    let outcome!: VaultUploadOutcome;
    await act(async () => { outcome = await result.current.upload([file()], {
      newVersionOf: { documentId: PREVIOUS, title: 'Receipt' }, onFileStatus: (_i, value) => statuses.push(value),
    }); });
    expectUnconfirmed(outcome);
    expect(statuses.at(-1)).toMatchObject({ state: 'refused', unknown: true });
    expect(statuses.some((status) => status.state === 'stored')).toBe(false);
    expect(result.current.uploading).toBe(false);
    expect(answer).toHaveBeenCalledTimes(1);
  });
});
