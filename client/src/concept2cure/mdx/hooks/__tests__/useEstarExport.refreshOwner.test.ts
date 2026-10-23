// @vitest-environment jsdom
/** Canonical auth/session refresh and exporter; only HTTP and byte delivery are synthetic. */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, renderHook } from '@testing-library/react';
import { authService } from '@/services/portal/authService';
import { clearAuthToken, setAuthToken } from '@/utils/authToken';
import { exportStatusLine, useEstarExport, type EstarExportOutcome } from '../useEstarExport';
import { downloadBase64 } from '../../../v2/download';

vi.mock('../../../v2/download', () => ({ downloadBase64: vi.fn(() => true) }));

const PROGRAM = { id: '11111111-1111-4111-8111-111111111591' };
const DOCUMENT = '22222222-2222-4222-8222-222222222591';
const SLOT = 'root.CoverLetter.CLAddAttachment110';
const SHA = 'a'.repeat(64);
const ACTOR = { id: '7', organizationId: '12', email: 'export-owner@example.test', roles: ['admin'], permissions: ['governed:write'] };
const bearer = (visit: string, userId = 7, organizationId = 12) =>
  `fixture.${btoa(JSON.stringify({ userId, organizationId, visit }))}.synthetic`;
const INITIAL = bearer('initial');
const REFRESHED = bearer('refreshed');
const selection = { slot: SLOT, source: { kind: 'vault_document' as const, documentId: DOCUMENT }, expectedSha256: SHA };
const receipt = { slot: SLOT, source: selection.source, fileName: 'Cover letter.pdf', sha256: SHA, byteLength: 525, chapter: '/CHAPTER 1/CH1.01/' };
const success = () => ({ governed: true, officialEstarPdf: true, erasedFields: [],
  attachmentReport: { requested: 1, attached: [receipt], refused: [], manifest: '***Start***<<Cover letter.pdf|/CHAPTER 1/CH1.01/>>' },
  downloadable_output_ref: { encoding: 'base64', mime_type: 'application/pdf', filename: 'eSTAR.pdf', data: 'JVBERi0=' },
});
const ok = (body: unknown) => new Response(JSON.stringify(body), { headers: { 'Content-Type': 'application/json' } });
function deferred<T>() { let resolve!: (value: T) => void; return { promise: new Promise<T>(done => { resolve = done; }), resolve }; }
let fetchMock: ReturnType<typeof vi.fn>;
function wire(refreshBearer = REFRESHED) {
  const pending = deferred<Response>();
  fetchMock.mockImplementation((url: string) => {
    if (url.endsWith('/refresh')) return Promise.resolve(ok({ accessToken: refreshBearer, refreshToken: 'fixture-refreshed', expiresIn: 3600 }));
    if (url.endsWith('/official')) return pending.promise;
    throw new Error('Unexpected synthetic request');
  });
  return pending;
}
const exports = () => fetchMock.mock.calls.filter(([url]) => String(url).endsWith('/official'));
beforeEach(() => {
  authService.endSession(null); clearAuthToken(); localStorage.clear(); sessionStorage.clear();
  authService.setToken(INITIAL, ACTOR, 'fixture-refresh', 3600);
  fetchMock = vi.fn(); vi.stubGlobal('fetch', fetchMock); vi.mocked(downloadBase64).mockClear();
});
afterEach(() => {
  cleanup(); authService.endSession(null); clearAuthToken(); localStorage.clear(); sessionStorage.clear(); vi.unstubAllGlobals();
});

describe('canonical same-session refresh keeps the original export owner', () => {
  it.each([true, false])('delivers one confirmed export after actual refresh (attachments=%s)', async withAttachments => {
    const pending = wire(); const session = authService.captureSessionReadGuard();
    const { result } = renderHook(() => useEstarExport());
    let request!: Promise<EstarExportOutcome>;
    act(() => { request = result.current.exportOfficialEstar(PROGRAM, 'device', withAttachments ? { attachments: [selection] } : {}); });
    expect(exports()).toHaveLength(1);
    await act(async () => { expect(await authService.refreshToken()).toBe(true); });
    expect(session.sameRevision()).toBe(true); expect(session.credentialsCurrent()).toBe(false);
    await act(async () => { pending.resolve(ok(success())); await request; });
    expect(result.current.outcome).toMatchObject({ ok: true, delivered: true });
    if (withAttachments) expect(result.current.outcome?.attachments).toEqual([receipt]);
    expect(result.current.busy).toBe(false); expect(exports()).toHaveLength(1);
    expect(exports()[0][1].headers).toEqual({ 'Content-Type': 'application/json', Authorization: `Bearer ${INITIAL}`, 'x-organization-id': '12' });
    expect(downloadBase64).toHaveBeenCalledOnce();
  });

  it('keeps an uncertain export outcome visible after a legitimate refresh', async () => {
    const pending = wire(); const { result } = renderHook(() => useEstarExport()); let request!: Promise<EstarExportOutcome>;
    act(() => { request = result.current.exportOfficialEstar(PROGRAM, 'device', { attachments: [selection] }); });
    await act(async () => { expect(await authService.refreshToken()).toBe(true); });
    const message = 'Export persistence started; inspect the current Vault and export records.';
    await act(async () => {
      pending.resolve(new Response(JSON.stringify({ code: 'OUTCOME_UNKNOWN', error: 'OUTCOME_UNKNOWN', message }), { status: 503, headers: { 'Content-Type': 'application/json' } }));
      await request;
    });
    expect(result.current.outcome).toMatchObject({ ok: false, delivered: false, unconfirmed: true, error: message });
    expect(exportStatusLine(false, result.current.outcome)).toBe(`Export unconfirmed — ${message}`);
    expect(downloadBase64).not.toHaveBeenCalled(); expect(exports()).toHaveLength(1);
  });

  it.each([['actor', bearer('foreign-actor', 8, 12)], ['organization', bearer('foreign-org', 7, 13)]])('does not deliver a canonical refresh carrying foreign %s claims', async (_label, token) => {
    const pending = wire(token); const session = authService.captureSessionReadGuard();
    const { result } = renderHook(() => useEstarExport()); let request!: Promise<EstarExportOutcome>;
    act(() => { request = result.current.exportOfficialEstar(PROGRAM, 'device', { attachments: [selection] }); });
    await act(async () => { expect(await authService.refreshToken()).toBe(true); });
    expect(session.sameRevision()).toBe(true);
    await act(async () => { pending.resolve(ok(success())); await request; });
    expect(result.current.outcome).toBeNull(); expect(downloadBase64).not.toHaveBeenCalled(); expect(exports()).toHaveLength(1);
  });
});

describe('real actor/session and context replacements still retire export delivery', () => {
  it('refuses an unadopted storage bearer even when its actor claims match', async () => {
    const pending = wire(); const session = authService.captureSessionReadGuard();
    const { result } = renderHook(() => useEstarExport()); let request!: Promise<EstarExportOutcome>;
    act(() => { request = result.current.exportOfficialEstar(PROGRAM, 'device', { attachments: [selection] }); });
    setAuthToken(REFRESHED);
    expect(session.sameRevision()).toBe(true);
    expect(authService.captureSessionReadGuard(REFRESHED).current()).toBe(false);
    await act(async () => { pending.resolve(ok(success())); await request; });
    expect(result.current.outcome).toBeNull(); expect(downloadBase64).not.toHaveBeenCalled(); expect(exports()).toHaveLength(1);
  });

  it.each(['same-account session', 'actor', 'organization'])('retires a replaced %s before a delayed reply', async change => {
    const pending = wire(); const { result } = renderHook(() => useEstarExport()); let request!: Promise<EstarExportOutcome>;
    act(() => { request = result.current.exportOfficialEstar(PROGRAM, 'device', { attachments: [selection] }); });
    const userId = change === 'actor' ? 8 : 7; const organizationId = change === 'organization' ? 13 : 12;
    act(() => authService.setToken(bearer('new-session', userId, organizationId), { ...ACTOR, id: String(userId), organizationId: String(organizationId) }, 'fixture-new-session', 3600));
    await act(async () => { pending.resolve(ok(success())); await request; });
    expect(result.current.outcome).toBeNull(); expect(downloadBase64).not.toHaveBeenCalled(); expect(exports()).toHaveLength(1);
  });

  it.each(['parent round trip', 'unmount'])('retires the delayed reply after %s', async change => {
    const pending = wire(); let visit = {}; const original = visit;
    const hook = renderHook(() => useEstarExport(() => visit === original)); let request!: Promise<EstarExportOutcome>;
    act(() => { request = hook.result.current.exportOfficialEstar(PROGRAM, 'device', { attachments: [selection] }); });
    if (change === 'unmount') hook.unmount();
    else { visit = {}; visit = {}; }
    await act(async () => { pending.resolve(ok(success())); await request; });
    expect(downloadBase64).not.toHaveBeenCalled(); expect(exports()).toHaveLength(1);
    if (change !== 'unmount') expect(hook.result.current.outcome).toBeNull();
  });
});
