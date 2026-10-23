// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, renderHook } from '@testing-library/react';
import { exportStatusLine, useEstarExport, type OfficialEstarOptions } from '../useEstarExport';
import { downloadBase64 } from '../../../v2/download';

const identity = vi.hoisted(() => ({ token: 'attachment-user', org: '7', revision: 0 }));
vi.mock('@/utils/authToken', () => ({
  getAuthToken: () => identity.token,
  getOrgId: () => identity.org,
}));
vi.mock('../../../v2/download', () => ({ downloadBase64: vi.fn(() => true) }));
vi.mock('@/services/portal/authService', () => ({ authService: {
  getUser: () => null,
  captureSessionReadGuard: () => {
    const revision = identity.revision;
    return { sameRevision: () => identity.revision === revision };
  },
} }));

const PROGRAM = { id: '11111111-1111-4111-8111-111111111111' };
const ID = '22222222-2222-4222-8222-222222222222';
const SLOT = 'root.CoverLetter.CLAddAttachment110';
const SHA = 'a'.repeat(64);
const attachment = { slot: SLOT, source: { kind: 'vault_document' as const, documentId: ID }, expectedSha256: SHA };
const options: OfficialEstarOptions = { useProgramData: true, attachments: [attachment] };
const record = { slot: SLOT, source: attachment.source, fileName: 'Cover letter.pdf', sha256: SHA, byteLength: 525, chapter: '/CHAPTER 1/CH1.01/' };
const report = () => ({ requested: 1, attached: [{ ...record }], refused: [], manifest: '***Start***<<Cover letter.pdf|/CHAPTER 1/CH1.01/>>' });
const success = (attachmentReport: unknown = report()) => ({
  governed: true, officialEstarPdf: true, erasedFields: [], attachmentReport,
  downloadable_output_ref: { encoding: 'base64', mime_type: 'application/pdf', filename: 'eSTAR.pdf', data: 'JVBERi0=' },
});
const response = (body: unknown, status = 200) => ({ ok: status === 200, status, json: async () => body });
let fetchMock: ReturnType<typeof vi.fn>;
beforeEach(() => {
  identity.token = 'attachment-user'; identity.org = '7'; identity.revision = 0;
  fetchMock = vi.fn(); vi.stubGlobal('fetch', fetchMock); vi.mocked(downloadBase64).mockClear();
});
afterEach(() => vi.unstubAllGlobals());

describe('official eSTAR attachments are confirmed before delivery', () => {
  it('sends exact slot/UUID without the local hash and returns the server receipt', async () => {
    fetchMock.mockResolvedValue(response(success()));
    const { result } = renderHook(() => useEstarExport());
    const sourceWithMetadata = { ...attachment.source, localVersion: '2.0', contentHash: SHA };
    await act(async () => { await result.current.exportOfficialEstar(PROGRAM, 'ivd', { ...options, attachments: [{ ...attachment, source: sourceWithMetadata }] }); });
    expect(JSON.parse(fetchMock.mock.calls[0][1].body).attachments).toEqual([{ slot: SLOT, source: attachment.source }]);
    expect(result.current.outcome).toMatchObject({ ok: true, delivered: true, attachments: [record] });
    expect(downloadBase64).toHaveBeenCalledOnce();
  });

  it.each([
    ['missing recorded hash', [{ ...attachment, expectedSha256: '' }]],
    ['invalid version UUID', [{ ...attachment, source: { ...attachment.source, documentId: 'unknown' } }]],
    ['no destination', [{ ...attachment, slot: '' }]],
    ['duplicate slot and version', [attachment, attachment]],
  ])('does not post %s selections', async (_label, attachments) => {
    const { result } = renderHook(() => useEstarExport());
    await act(async () => { await result.current.exportOfficialEstar(PROGRAM, 'device', { attachments }); });
    expect(fetchMock).not.toHaveBeenCalled();
    expect(result.current.outcome?.ok).toBe(false);
    expect(result.current.outcome?.error).toContain('SHA-256');
  });

  it.each([
    ['absent', undefined], ['empty', {}], ['wrong count', { ...report(), requested: 2 }],
    ['missing row', { ...report(), attached: [] }], ['duplicate row', { ...report(), attached: [record, record] }],
    ['wrong version', { ...report(), attached: [{ ...record, source: { kind: 'vault_document', documentId: PROGRAM.id } }] }],
    ['wrong slot', { ...report(), attached: [{ ...record, slot: 'root.Other' }] }],
    ['wrong bytes', { ...report(), attached: [{ ...record, sha256: 'b'.repeat(64) }] }],
    ['invalid byte length', { ...report(), attached: [{ ...record, byteLength: 0 }] }],
    ['blank file name', { ...report(), attached: [{ ...record, fileName: '' }] }],
    ['missing chapter', { ...report(), attached: [{ ...record, chapter: '' }] }],
    ['partial refusal', { ...report(), refused: [{ slot: SLOT, reasons: ['Not approved'] }] }],
    ['missing manifest', { ...report(), manifest: null }],
    ['wrong manifest filename', { ...report(), manifest: '***Start***<<Other.pdf|/CHAPTER 1/CH1.01/>>' }],
    ['wrong manifest chapter', { ...report(), manifest: '***Start***<<Cover letter.pdf|/CHAPTER 2/CH2.01/>>' }],
    ['extra manifest token', { ...report(), manifest: report().manifest + '<<Extra.pdf|/CHAPTER 1/CH1.01/>>' }],
    ['missing manifest token', { ...report(), manifest: '***Start***' }],
    ['invalid chapter syntax', { ...report(), attached: [{ ...record, chapter: '/CHAPTER malformed' }] }],
    ['manifest delimiter in filename', { ...report(), attached: [{ ...record, fileName: 'x|y.pdf' }] }],
  ])('holds delivery on a %s success receipt', async (_name, receipt) => {
    fetchMock.mockResolvedValue(response({ ...success(), attachmentReport: receipt }));
    const { result } = renderHook(() => useEstarExport());
    await act(async () => { await result.current.exportOfficialEstar(PROGRAM, 'device', options); });
    expect(downloadBase64).not.toHaveBeenCalled();
    expect(result.current.outcome).toMatchObject({ ok: false, delivered: false, unconfirmed: true });
    expect(result.current.outcome?.error).toMatch(/attachment.*not confirmed/i);
  });

  it('retains every refusal reason from the server without downloading partial results', async () => {
    fetchMock.mockResolvedValue(response({ error: 'ESTAR_NOT_PRODUCIBLE', blockers: ['Attachment plan refused'],
      attachmentReport: { requested: 1, attached: [], manifest: null, refused: [{ slot: SLOT, source: attachment.source, fileName: null, reasons: ['Not approved', 'No eligible bytes'] }] },
    }, 422));
    const { result } = renderHook(() => useEstarExport());
    await act(async () => { await result.current.exportOfficialEstar(PROGRAM, 'device', options); });
    expect(result.current.outcome).toMatchObject({ ok: false, attachmentRefusals: [{ slot: SLOT, reasons: ['Not approved', 'No eligible bytes'] }] });
    expect(downloadBase64).not.toHaveBeenCalled();
  });

  it.each([
    ['unconfirmed form', { officialEstarPdf: false }],
    ['wrong encoding', { downloadable_output_ref: { ...success().downloadable_output_ref, encoding: 'url' } }],
    ['wrong media type', { downloadable_output_ref: { ...success().downloadable_output_ref, mime_type: 'application/zip' } }],
    ['no filename', { downloadable_output_ref: { ...success().downloadable_output_ref, filename: '' } }],
    ['no bytes', { downloadable_output_ref: { ...success().downloadable_output_ref, data: '' } }],
    ['invalid base64', { downloadable_output_ref: { ...success().downloadable_output_ref, data: '%%%' } }],
    ['non-PDF bytes', { downloadable_output_ref: { ...success().downloadable_output_ref, data: 'cGxhaW4gdGV4dA==' } }],
    ['invalid base64 tail', { downloadable_output_ref: { ...success().downloadable_output_ref, data: 'JVBERi0=%%%=' } }],
  ])('holds a receipt with %s delivery metadata', async (_label, metadata) => {
    fetchMock.mockResolvedValue(response({ ...success(), ...metadata }));
    const { result } = renderHook(() => useEstarExport());
    await act(async () => { await result.current.exportOfficialEstar(PROGRAM, 'device', options); });
    expect(downloadBase64).not.toHaveBeenCalled();
    expect(result.current.outcome).toMatchObject({ ok: false, delivered: false, unconfirmed: true });
  });
});

function deferred() {
  let resolve!: (value: ReturnType<typeof response>) => void;
  const promise = new Promise<ReturnType<typeof response>>(done => { resolve = done; });
  return { promise, resolve };
}

describe('official eSTAR delivery belongs to the active request context', () => {
  it.each(['reset', 'unmount', 'session', 'session revision'] as const)('retires late downloads after %s', async change => {
    const pending = deferred(); fetchMock.mockReturnValue(pending.promise);
    const hook = renderHook(() => useEstarExport());
    let request!: Promise<unknown>;
    act(() => { request = hook.result.current.exportOfficialEstar(PROGRAM, 'device', options); });
    if (change === 'reset') act(() => hook.result.current.reset());
    if (change === 'unmount') hook.unmount();
    if (change === 'session') identity.token = 'other-user';
    if (change === 'session revision') identity.revision += 2;
    await act(async () => { pending.resolve(response(success())); await request; });
    expect(downloadBase64).not.toHaveBeenCalled();
    if (change !== 'unmount') expect(hook.result.current.outcome).toBeNull();
  });

  it('reports a lost response as unconfirmed because the server may have retained the export', async () => {
    fetchMock.mockRejectedValue(new Error('offline'));
    const { result } = renderHook(() => useEstarExport());
    await act(async () => { await result.current.exportOfficialEstar(PROGRAM, 'device', options); });
    expect(result.current.outcome).toMatchObject({ ok: false, delivered: false, unconfirmed: true });
    expect(result.current.outcome?.error).toContain('retained exports');
    expect(downloadBase64).not.toHaveBeenCalled();
  });

  it('checks the synchronous parent visit before passive unmount cleanup runs', async () => {
    const pending = deferred(); fetchMock.mockReturnValue(pending.promise);
    let currentVisit = true;
    const { result } = renderHook(() => useEstarExport(() => currentVisit));
    let request!: Promise<unknown>;
    act(() => { request = result.current.exportOfficialEstar(PROGRAM, 'device', options); });
    currentVisit = false;
    await act(async () => { pending.resolve(response(success())); await request; });
    expect(downloadBase64).not.toHaveBeenCalled();
    expect(result.current.outcome).toBeNull();
  });

  it('admits only one current export even when two clicks happen before a repaint', async () => {
    const pending = deferred(); fetchMock.mockReturnValue(pending.promise);
    const { result } = renderHook(() => useEstarExport());
    let first!: Promise<unknown>; let second!: Promise<unknown>;
    act(() => { first = result.current.exportOfficialEstar(PROGRAM, 'device', options); second = result.current.exportOfficialEstar(PROGRAM, 'device', options); });
    expect(fetchMock).toHaveBeenCalledOnce();
    await act(async () => { pending.resolve(response(success())); await Promise.all([first, second]); });
    expect(downloadBase64).toHaveBeenCalledOnce();
    expect(result.current.outcome?.ok).toBe(true);
  });

  it('does not replace a new-context result when an older export resolves afterwards', async () => {
    const old = deferred(); fetchMock.mockReturnValueOnce(old.promise).mockResolvedValueOnce(response(success()));
    const { result } = renderHook(() => useEstarExport());
    let first!: Promise<unknown>;
    act(() => { first = result.current.exportOfficialEstar(PROGRAM, 'device', options); });
    act(() => result.current.reset());
    await act(async () => { await result.current.exportOfficialEstar({ id: '33333333-3333-4333-8333-333333333333' }, 'ivd', options); });
    const current = result.current.outcome;
    await act(async () => { old.resolve(response(success())); await first; });
    expect(result.current.outcome).toBe(current);
    expect(downloadBase64).toHaveBeenCalledOnce();
  });
});

describe('attachment exports retain uncertain persistence outcomes', () => {
  const recovery = 'Attachment eligibility changed after export persistence started. The PDF was not delivered. Review current Vault and export records before trying again.';
  it('preserves the typed503 OUTCOME_UNKNOWN recovery sentence without delivering a PDF', async () => {
    fetchMock.mockResolvedValue(response({ error: 'OUTCOME_UNKNOWN', code: 'OUTCOME_UNKNOWN', officialEstarPdf: false, message: recovery }, 503));
    const { result } = renderHook(() => useEstarExport());
    await act(async () => { await result.current.exportOfficialEstar(PROGRAM, 'device', options); });
    expect(result.current.outcome).toMatchObject({ ok: false, delivered: false, unconfirmed: true, error: recovery });
    expect(exportStatusLine(false, result.current.outcome)).toBe(`Export unconfirmed — ${recovery}`);
    expect(downloadBase64).not.toHaveBeenCalled();
  });

  it.each([
    [500, { message: 'The export service is temporarily unavailable.' }],
    [503, null],
    [502, { invalid: 'gateway body' }],
    [409, { error: { code: 'OUTCOME_UNKNOWN', message: recovery } }],
  ])('holds uncertain attachment HTTP%s outcomes for recovery', async (status, body) => {
    fetchMock.mockResolvedValue(response(body, status));
    const { result } = renderHook(() => useEstarExport());
    await act(async () => { await result.current.exportOfficialEstar(PROGRAM, 'device', options); });
    expect(result.current.outcome).toMatchObject({ ok: false, delivered: false, unconfirmed: true });
    expect(exportStatusLine(false, result.current.outcome)).toContain('Export unconfirmed');
    expect(downloadBase64).not.toHaveBeenCalled();
  });

  it.each([409, 422])('keeps a definite HTTP%s refusal distinct from an uncertain result', async status => {
    fetchMock.mockResolvedValue(response({ error: 'ATTACHMENT_REFUSED', message: 'This version is not approved.' }, status));
    const { result } = renderHook(() => useEstarExport());
    await act(async () => { await result.current.exportOfficialEstar(PROGRAM, 'device', options); });
    expect(result.current.outcome?.unconfirmed).toBeFalsy();
    expect(exportStatusLine(false, result.current.outcome)).toBe('Export failed — This version is not approved.');
    expect(downloadBase64).not.toHaveBeenCalled();
  });

  it('does not widen HTTP failure classification for an export without attachment selections', async () => {
    fetchMock.mockResolvedValue(response({ message: 'The export service is temporarily unavailable.' }, 503));
    const { result } = renderHook(() => useEstarExport());
    await act(async () => { await result.current.exportOfficialEstar(PROGRAM); });
    expect(result.current.outcome?.unconfirmed).toBeFalsy();
    expect(exportStatusLine(false, result.current.outcome)).toBe('Export failed — The export service is temporarily unavailable.');
  });
});
