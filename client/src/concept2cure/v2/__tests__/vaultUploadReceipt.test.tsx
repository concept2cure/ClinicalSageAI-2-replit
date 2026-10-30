// @vitest-environment jsdom
/** A successful transport is not confirmation of a recorded Vault document. */
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { act, cleanup, renderHook } from '@testing-library/react';
import { clearAuthToken, setAuthToken } from '@/utils/authToken';
import { useVaultUpload, type VaultUploadFileStatus, type VaultUploadOutcome } from '../useVaultUpload';
import { stubIngestXhr, type IngestInit } from './_ingest-xhr-fake';

const PID = '11111111-1111-4111-8111-111111111111';
const DOC = '22222222-2222-4222-8222-222222222222';
const OTHER_PROGRAM = '33333333-3333-4333-8333-333333333333';
const FOLDER = 'quality/custom-folder';
const FILE = 'protocol.pdf';
const file = (name = FILE) => new File(['actual selected bytes'], name, { type: 'application/pdf' });
const fresh = () => ({
  success: true,
  document: { id: DOC, programId: PID, version: 'release-A', documentTitle: 'Stored protocol' },
  filing: { folderId: FOLDER as string | null, folderLabel: 'Quality' as string | null,
    placementStatus: 'confirmed', needsReview: false },
});
const withDocument = (fields: Record<string, unknown>) => ({ ...fresh(), document: { ...fresh().document, ...fields } });
const withFiling = (fields: Record<string, unknown>) => ({ ...fresh(), filing: { ...fresh().filing, ...fields } });
const reupload = (fields: Record<string, unknown> = {}) => ({ ...fresh(),
  reupload: { unchanged: true, changes: [], differs: [], ...fields } });
const response = (body: unknown, status = 201) => ({ status, json: async () => body });

// Every case drives the existing multipart transport and the whole batch hook;
// assertions below concern client success/authority and recovery, not a parser.
const malformed: Array<{ label: string; status: number; body: unknown }> = [
  { label: 'an array instead of a record', status: 201, body: [] },
  { label: 'success false', status: 201, body: { ...fresh(), success: false } },
  { label: 'success omitted', status: 201, body: { ...fresh(), success: undefined } },
  { label: 'document ID omitted', status: 201, body: withDocument({ id: undefined }) },
  { label: 'document ID is not a UUID', status: 201, body: withDocument({ id: 'not-a-recorded-id' }) },
  { label: 'program omitted', status: 201, body: withDocument({ programId: undefined }) },
  { label: 'a different program recorded the file', status: 201, body: withDocument({ programId: OTHER_PROGRAM }) },
  { label: 'assigned version omitted', status: 201, body: withDocument({ version: undefined }) },
  { label: 'assigned version is blank', status: 201, body: withDocument({ version: ' \t' }) },
  { label: 'stored title omitted', status: 201, body: withDocument({ documentTitle: undefined }) },
  { label: 'stored title is blank', status: 201, body: withDocument({ documentTitle: '  ' }) },
  { label: 'filing omitted', status: 201, body: { ...fresh(), filing: undefined } },
  { label: 'folder ID is blank', status: 201, body: withFiling({ folderId: '  ' }) },
  { label: 'folder label is not text or null', status: 201, body: withFiling({ folderLabel: {} }) },
  { label: 'placement omitted', status: 201, body: withFiling({ placementStatus: undefined }) },
  { label: 'placement is unknown', status: 201, body: withFiling({ placementStatus: 'approved' }) },
  { label: 'unfiled claims a folder', status: 201, body: withFiling({ placementStatus: 'unfiled', needsReview: true }) },
  { label: 'placed claims no folder', status: 201, body: withFiling({ folderId: null }) },
  { label: 'review flag is not boolean', status: 201, body: withFiling({ needsReview: 'false' }) },
  { label: 'unfiled claims no review needed', status: 201, body: withFiling({ folderId: null, placementStatus: 'unfiled' }) },
  { label: 'extraction is unknown', status: 201, body: withDocument({ extraction: 'complete' }) },
  { label: 'unexpected accepted status', status: 202, body: fresh() },
  { label: '200 without reupload acknowledgement', status: 200, body: fresh() },
  { label: '201 contradicts a reupload marker', status: 201, body: reupload() },
  { label: 'a change has a nontext before value', status: 200, body: reupload({ unchanged: false, changes: [{ field: 'storage_version_id', from: 0, to: 'stored' }] }) },
  { label: 'differs is not an array', status: 200, body: reupload({ differs: {} }) },
  { label: 'a difference is null', status: 200, body: reupload({ differs: [null] }) },
  { label: 'a difference has an unknown field', status: 200, body: reupload({ differs: [{ field: 'content_hash', recorded: 'old', requested: 'new' }] }) },
  { label: 'a difference has no requested value', status: 200, body: reupload({ differs: [{ field: 'folder_id', recorded: null }] }) },
  { label: 'unchanged contradicts an actual repair', status: 200, body: reupload({ changes: [{ field: 'storage_version_id', from: null, to: 'stored' }] }) },
];

beforeEach(() => setAuthToken('vault-receipt-session'));
afterEach(() => { cleanup(); vi.unstubAllGlobals(); clearAuthToken(); });

function expectUnconfirmed(outcome: VaultUploadOutcome, name = FILE) {
  expect(outcome).toEqual({ succeeded: [], recorded: [], filings: [], alreadyRecorded: [], conflicts: [], newVersions: [],
    failed: [{ name, reason: expect.any(String), unknown: true }] });
  expect(outcome.failed[0].reason).not.toMatch(/nothing.*recorded|no reply arrived/i);
}

it.each(malformed)('does not report storage for $label (HTTP $status)', async ({ body, status }) => {
  const answer = vi.fn(async () => response(body, status));
  stubIngestXhr(answer);
  const seen: VaultUploadFileStatus[] = [];
  const view = renderHook(() => useVaultUpload(PID));
  let outcome!: VaultUploadOutcome;
  await act(async () => { outcome = await view.result.current.upload([file()], { onFileStatus: (_index, state) => seen.push(state) }); });
  expectUnconfirmed(outcome);
  expect(seen.some(state => state.state === 'stored')).toBe(false);
  expect(seen.at(-1)).toMatchObject({ state: 'refused', unknown: true });
  expect(view.result.current.uploading).toBe(false);
  expect(view.result.current.note?.tone).toBe('error');
  expect(view.result.current.note?.text).toMatch(/Reload the Vault and check before trying again/);
  expect(view.result.current.note?.text).not.toMatch(/Nothing partial was recorded/);
  view.rerender();
  await act(async () => { await Promise.resolve(); });
  expect(answer).toHaveBeenCalledTimes(1);
});

// The shared fake serializes a rejected json() as null. These raw responses
// additionally exercise the real transport's JSON.parse rejection itself.
it.each(['', '<html>upstream response</html>', '{"success":'])('settles an undecodable successful raw response %j without retry', async text => {
  const sent = vi.fn();
  class RawReplyXhr {
    status = 201;
    responseText = text;
    withCredentials = false;
    upload = {};
    onload: (() => void) | null = null;
    open() { /* Real sendIngest still owns the request. */ }
    setRequestHeader() { /* Authentication setup is exercised by positive controls. */ }
    send(body: unknown) { sent(body); globalThis.queueMicrotask(() => this.onload?.()); }
  }
  vi.stubGlobal('XMLHttpRequest', RawReplyXhr);
  const view = renderHook(() => useVaultUpload(PID));
  let outcome!: VaultUploadOutcome;
  await act(async () => { outcome = await view.result.current.upload([file()]); });
  expectUnconfirmed(outcome);
  expect(view.result.current.uploading).toBe(false);
  expect(view.result.current.note?.text).toMatch(/Reload the Vault and check/);
  expect(sent).toHaveBeenCalledTimes(1);
});

it('continues a mixed batch after missing and malformed reupload receipts, with no second POST for either', async () => {
  const bodies = [null, reupload({ differs: [null] }), fresh()];
  const sent: string[] = [];
  const answer = vi.fn(async (_url: string, init: IngestInit) => {
    sent.push((init.body as FormData).get('documentCode') as string);
    const index = sent.length - 1;
    return response(bodies[index], index === 1 ? 200 : 201);
  });
  stubIngestXhr(answer);
  const seen: Array<{ index: number; status: VaultUploadFileStatus }> = [];
  const view = renderHook(() => useVaultUpload(PID));
  let outcome!: VaultUploadOutcome;
  await act(async () => { outcome = await view.result.current.upload([file('unknown.pdf'), file('malformed.pdf'), file('confirmed.pdf')], {
    onFileStatus: (index, status) => seen.push({ index, status }),
  }); });
  expect(sent).toEqual(['unknown.pdf', 'malformed.pdf', 'confirmed.pdf']);
  expect(outcome.succeeded).toEqual(['confirmed.pdf']);
  expect(outcome.recorded).toEqual([DOC]);
  expect(outcome.failed).toEqual([
    { name: 'unknown.pdf', reason: expect.any(String), unknown: true },
    { name: 'malformed.pdf', reason: expect.any(String), unknown: true },
  ]);
  expect(outcome.filings.map(entry => entry.name)).toEqual(['confirmed.pdf']);
  expect(outcome.alreadyRecorded).toEqual([]);
  expect(outcome.newVersions).toEqual([]);
  expect(outcome.conflicts).toEqual([]);
  expect(seen.filter(entry => entry.status.state === 'stored').map(entry => entry.index)).toEqual([2]);
  expect(view.result.current.uploading).toBe(false);
  expect(view.result.current.note?.text).toMatch(/Filed 1/);
  expect(view.result.current.note?.text).toMatch(/unknown.pdf; malformed.pdf/);
  expect(answer).toHaveBeenCalledTimes(3);
});

const compatible = [
  { label: 'absent extraction and extra future fields', extraction: undefined, folder: FOLDER, folderLabel: 'Quality', placement: 'confirmed', reading: false },
  { label: 'extracted with null label and opaque folder code', extraction: 'extracted', folder: FOLDER, folderLabel: null, placement: 'suggested', reading: false },
  { label: 'pending with empty label', extraction: 'pending', folder: FOLDER, folderLabel: '', placement: 'confirmed', reading: true },
  { label: 'failed extraction stored unfiled', extraction: 'failed', folder: null, folderLabel: '', placement: 'unfiled', reading: false },
];
it.each(compatible)('accepts a real 201 receipt: $label', async item => {
  const body = { ...fresh(), futureField: { accepted: true },
    document: { ...fresh().document, extraction: item.extraction, futureMetadata: 7 },
    filing: { ...fresh().filing, folderId: item.folder, folderLabel: item.folderLabel,
      placementStatus: item.placement, needsReview: item.folder === null, futureFiling: 'retained' } };
  const answer = vi.fn(async (_url: string, _init: IngestInit) => response(body));
  stubIngestXhr(answer);
  const seen: VaultUploadFileStatus[] = [];
  const view = renderHook(() => useVaultUpload(PID));
  let outcome!: VaultUploadOutcome;
  await act(async () => { outcome = await view.result.current.upload([file()], { onFileStatus: (_index, state) => seen.push(state) }); });
  expect(outcome.succeeded).toEqual([FILE]);
  expect(outcome.recorded).toEqual([DOC]);
  expect(outcome.failed).toEqual([]);
  expect(outcome.filings).toEqual([{ name: FILE, folderLabel: item.folder ? item.folderLabel || item.folder : null,
    needsReview: item.folder === null, placement: item.placement }]);
  expect(seen.at(-1)).toEqual({ state: 'stored', version: 'release-A', folderLabel: item.folder ? item.folderLabel || item.folder : null,
    placement: item.placement, already: false, ...(item.reading ? { readingText: true } : {}) });
  expect(view.result.current.uploading).toBe(false);
  expect(view.result.current.note?.tone).toBe('ok');
  const [url, init] = answer.mock.calls[0];
  expect(url).toBe('/api/vault/ingest');
  expect(init.method).toBe('POST');
  expect(init.credentials).toBe('include');
  expect(init.headers.Authorization).toBe('Bearer vault-receipt-session');
  expect(Object.keys(init.headers).map(key => key.toLowerCase())).not.toContain('content-type');
  expect((init.body as FormData).get('programId')).toBe(PID);
  expect(answer).toHaveBeenCalledTimes(1);
});

it.each([true, false])('accepts a 200 already-recorded receipt with unchanged=%s and truthful repair copy', async unchanged => {
  const body = reupload({ unchanged, futureReceiptField: 'accepted',
    changes: unchanged ? [] : [{ field: 'storage_version_id', from: null, to: 'stored-object-version' }],
    differs: [{ field: 'document_title', recorded: 'Stored protocol', requested: 'Renamed' },
      { field: 'folder_id', recorded: FOLDER, requested: 'module-5' }],
  });
  stubIngestXhr(vi.fn(async () => response(body, 200)));
  const view = renderHook(() => useVaultUpload(PID));
  let outcome!: VaultUploadOutcome;
  await act(async () => { outcome = await view.result.current.upload([file()]); });
  expect(outcome.succeeded).toEqual([FILE]);
  expect(outcome.recorded).toEqual([DOC]);
  expect(outcome.failed).toEqual([]);
  expect(outcome.filings).toEqual([]);
  expect(outcome.newVersions).toEqual([]);
  expect(outcome.alreadyRecorded).toEqual([{ name: FILE, title: 'Stored protocol', differs: true, filingDiffers: true }]);
  expect(view.result.current.note?.text).toMatch(/Already in the Vault/);
  expect(view.result.current.note?.text).toMatch(/Edit details/);
  expect(view.result.current.note?.text).toMatch(/Move in its filing/);
  expect(view.result.current.note?.text).not.toMatch(/nothing changed/i);
  expect(view.result.current.uploading).toBe(false);
});

it('retains the actual server-assigned check-in version and never sends a client version or document code', async () => {
  const body = withDocument({ version: 'revision-7B' });
  const answer = vi.fn(async (_url: string, _init: IngestInit) => response(body));
  stubIngestXhr(answer);
  const view = renderHook(() => useVaultUpload(PID));
  let outcome!: VaultUploadOutcome;
  await act(async () => { outcome = await view.result.current.upload([file()], {
    newVersionOf: { documentId: OTHER_PROGRAM, title: 'Earlier request title' },
  }); });
  expect(outcome.failed).toEqual([]);
  expect(outcome.recorded).toEqual([DOC]);
  expect(outcome.newVersions).toEqual([{ name: FILE, version: 'revision-7B', title: 'Stored protocol', folderLabel: 'Quality' }]);
  expect(outcome.filings).toEqual([]);
  expect(outcome.alreadyRecorded).toEqual([]);
  const form = answer.mock.calls[0][1].body as FormData;
  expect(form.get('supersedesDocumentId')).toBe(OTHER_PROGRAM);
  expect(form.get('documentCode')).toBeNull();
  expect(form.get('version')).toBeNull();
  expect(view.result.current.note?.text).toContain('vrevision-7B');
  expect(view.result.current.uploading).toBe(false);
});

it('does not turn an unconfirmed check-in into a successful new-version receipt', async () => {
  const answer = vi.fn(async () => response(withDocument({ id: undefined, version: '2.0' })));
  stubIngestXhr(answer);
  const seen: VaultUploadFileStatus[] = [];
  const view = renderHook(() => useVaultUpload(PID));
  let outcome!: VaultUploadOutcome;
  await act(async () => { outcome = await view.result.current.upload([file()], {
    newVersionOf: { documentId: OTHER_PROGRAM, title: 'Stored protocol' },
    onFileStatus: (_index, state) => seen.push(state),
  }); });
  expectUnconfirmed(outcome);
  expect(seen.at(-1)).toMatchObject({ state: 'refused', unknown: true });
  expect(seen.some(state => state.state === 'stored')).toBe(false);
  expect(view.result.current.uploading).toBe(false);
  expect(answer).toHaveBeenCalledTimes(1);
});
