// @vitest-environment jsdom
/** Exercise retained archive actions against the real canonical account owner. */
import React from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import type { CompanyDocumentsResponse, CompanyLegalDocument } from '@shared/company-documents';
import { DEFAULT_TEMPLATE_SPEC } from '@shared/templates/template-spec';
import { authService } from '@/services/portal/authService';
import { getAuthToken } from '@/utils/authToken';
import { COMPANY_SESSION_ACTOR, endCompanySession, rotateCompanyBearer, seedCompanySession } from './_company-session-fixture';

const apiRequest = vi.hoisted(() => vi.fn());
const downloadBlob = vi.hoisted(() => vi.fn((_filename: string, _blob: Blob) => true));
vi.mock('@/lib/queryClient', async original => ({ ...(await original<typeof import('@/lib/queryClient')>()), apiRequest }));
vi.mock('../download', async original => ({ ...(await original<typeof import('../download')>()), downloadBlob }));
import { InsightsLegalPackage } from '../surfaces/InsightsLegalPackage';

const PATH = '/api/client-branding/company-documents';
const BUNDLE = '33333333-3333-4333-8333-333333333333';
const OTHER_BUNDLE = '44444444-4444-4444-8444-444444444444';
const VARIANT = '77777777-7777-4777-8777-777777777777';
const original: CompanyLegalDocument = {
  id: 'legal-one', title: 'Signed company authorization', kind: 'authorization',
  programId: '11111111-1111-4111-8111-111111111111',
  vaultDocumentId: '22222222-2222-4222-8222-222222222222', contentHash: 'a'.repeat(64),
  version: '3', agencies: ['FDA'], countries: ['US'], submissionTypes: ['IND'], language: 'en',
  effectiveOn: null, expiresOn: null, active: true, registeredAt: '2026-10-01T00:00:00Z',
  registeredBy: '42', transmitRefusal: null,
};
const profile: CompanyDocumentsResponse = {
  canManage: true, capabilities: { manageBrand: true, manageLegal: true, managePermissions: true },
  data: { version: 1, revision: 3, companyName: 'Current sponsor', address: '', contact: '', registrationDetails: '',
    letterhead: DEFAULT_TEMPLATE_SPEC, importedFrom: null, applyToReports: false,
    applyToSubmissionCorrespondence: false, legalDocuments: [original] },
};
const json = (body: unknown) => new Response(JSON.stringify(body), { headers: { 'Content-Type': 'application/json' } });
const posts = () => apiRequest.mock.calls.filter(([method]) => method === 'POST');
const isLibraryRead = (method: string, path: string) => method === 'GET' && (path === PATH || path.startsWith(`${PATH}/legal-documents?`));
const libraryReads = () => apiRequest.mock.calls.filter(([method, path]) => isLibraryRead(method, path));
const page = () => ({ data: [original], page: { total: 1, availableTotal: 1, offset: 0, limit: 25, hasMore: false, nextOffset: null } });
const zip = () => new Response('exact retained server ZIP', { headers: { 'Content-Type': 'application/zip' } });
function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (reason: unknown) => void;
  const promise = new Promise<T>((done, fail) => { resolve = done; reject = fail; });
  return { promise, resolve, reject };
}
function intercept(match: (method: string, path: string) => boolean, reply: () => Promise<Response> | Response) {
  const normal = apiRequest.getMockImplementation()!;
  apiRequest.mockImplementation((method: string, path: string, ...rest: unknown[]) => match(method, path) ? reply() : normal(method, path, ...rest));
}
async function openAndSelect() {
  fireEvent.click(screen.getByRole('button', { name: /Choose legal companions/ }));
  fireEvent.click(await screen.findByRole('checkbox', { name: /Signed company authorization/ }));
  return screen.getByRole('button', { name: /Download reports and 1/ });
}
function replaceOwner(kind: string) {
  if (kind === 'browser bearer') sessionStorage.setItem('trialsage_access_token', 'unadopted-browser-bearer');
  else if (kind === 'sign out') endCompanySession();
  else seedCompanySession(kind === 'session' ? {} : { id: '43', email: 'replacement-owner@example.test' }, 'replacement');
}

beforeEach(() => {
  localStorage.clear(); sessionStorage.clear(); seedCompanySession();
  downloadBlob.mockReset().mockReturnValue(true);
  apiRequest.mockReset().mockImplementation(async (method: string, path: string) => {
    if (method === 'GET' && path === PATH) return json(profile);
    if (method === 'GET' && path.startsWith(`${PATH}/legal-documents?`)) return json(page());
    if (method === 'GET' && path.startsWith(`${PATH}/designs?`)) return json({ data: [], nextBefore: null });
    if (method === 'POST' && [BUNDLE, OTHER_BUNDLE].some(id => path === `/api/report-os/bundles/${id}/export.zip`)) return zip();
    throw new Error(`Unexpected synthetic request: ${method} ${path}`);
  });
});

describe('canonical owner admission before retained archive actions', () => {
  it.each(['account', 'session', 'browser bearer', 'sign out'])('rejects retained library and ZIP actions after %s drift', async kind => {
    render(<InsightsLegalPackage bundleId={BUNDLE} disabled={false} />);
    const oldExport = await openAndSelect();
    const oldRead = screen.getByRole('button', { name: /Refresh legal companions/ });
    const reads = libraryReads().length;
    act(() => { replaceOwner(kind); fireEvent.click(oldRead); fireEvent.click(oldExport); });
    expect(libraryReads()).toHaveLength(reads);
    expect(posts()).toHaveLength(0);
    expect(downloadBlob).not.toHaveBeenCalled();
  });

  it('rejects a same-revision role snapshot replacement without requiring bearer rotation', async () => {
    render(<InsightsLegalPackage bundleId={BUNDLE} disabled={false} />);
    const oldExport = await openAndSelect();
    const oldRead = screen.getByRole('button', { name: /Refresh legal companions/ });
    const guard = authService.captureSessionReadGuard();
    const token = getAuthToken(); const reads = libraryReads().length;
    vi.stubGlobal('fetch', vi.fn(async () => json({ authenticated: true, user: { ...COMPANY_SESSION_ACTOR, roles: ['viewer'] } })));
    await act(async () => {
      expect((await authService.refreshUser()).success).toBe(true);
      fireEvent.click(oldRead); fireEvent.click(oldExport);
    });
    expect(guard.sameRevision()).toBe(true); expect(getAuthToken()).toBe(token);
    expect(libraryReads()).toHaveLength(reads); expect(posts()).toHaveLength(0);
    expect(downloadBlob).not.toHaveBeenCalled();
  });

  it('preserves explicit selection and one pending ZIP through actual canonical bearer refresh', async () => {
    render(<InsightsLegalPackage bundleId={BUNDLE} disabled={false} />);
    const button = await openAndSelect(); const reads = libraryReads().length;
    const pending = deferred<Response>(); intercept(method => method === 'POST', () => pending.promise);
    act(() => { fireEvent.click(button); fireEvent.click(button); });
    await act(async () => { await rotateCompanyBearer(); });
    expect((screen.getByRole('checkbox', { name: /Signed company authorization/ }) as HTMLInputElement).checked).toBe(true);
    expect(libraryReads()).toHaveLength(reads); expect(posts()).toHaveLength(1);
    await act(async () => { pending.resolve(zip()); });
    await waitFor(() => expect(downloadBlob).toHaveBeenCalledTimes(1));
    expect(downloadBlob.mock.calls[0][0]).toBe('report-package-33333333.zip');
    expect(await (downloadBlob.mock.calls[0][1] as Blob).text()).toBe('exact retained server ZIP');
    expect(posts()[0][2]).toEqual({ legalDocumentIds: ['legal-one'] });
    expect(screen.getByRole('button', { name: /Download reports and 1/ })).toBeTruthy();
  });
});

describe('retired asynchronous library and archive stages', () => {
  it('does not decode a library response received after account replacement', async () => {
    const pending = deferred<Response>(); intercept(isLibraryRead, () => pending.promise);
    render(<InsightsLegalPackage bundleId={BUNDLE} disabled={false} />);
    fireEvent.click(screen.getByRole('button', { name: /Choose legal companions/ }));
    const response = json(page()); const decode = vi.spyOn(response, 'json');
    act(() => replaceOwner('account'));
    await act(async () => { pending.resolve(response); });
    expect(decode).not.toHaveBeenCalled();
    expect(screen.queryByText(/Signed company authorization/)).toBeNull();
  });

  it('drops a library JSON body that settles after account replacement', async () => {
    const parsed = deferred<unknown>(); let body: unknown;
    const response = json({}); const decode = vi.spyOn(response, 'json').mockReturnValue(parsed.promise);
    intercept(isLibraryRead, () => { body = page(); return response; });
    render(<InsightsLegalPackage bundleId={BUNDLE} disabled={false} />);
    fireEvent.click(screen.getByRole('button', { name: /Choose legal companions/ }));
    await waitFor(() => expect(decode).toHaveBeenCalledOnce());
    act(() => replaceOwner('account'));
    await act(async () => { parsed.resolve(body); });
    expect(screen.queryByText(/Signed company authorization/)).toBeNull();
    expect(screen.queryByRole('checkbox')).toBeNull();
  });

  it.each(['account', 'bundle ABA', 'unmount'])('does not decode a ZIP response after %s retirement', async retirement => {
    const view = render(<InsightsLegalPackage bundleId={BUNDLE} disabled={false} />);
    const button = await openAndSelect(); const pending = deferred<Response>();
    intercept(method => method === 'POST', () => pending.promise); fireEvent.click(button);
    if (retirement === 'unmount') view.unmount();
    else if (retirement === 'account') act(() => replaceOwner('account'));
    else {
      view.rerender(<InsightsLegalPackage bundleId={OTHER_BUNDLE} disabled={false} />);
      view.rerender(<InsightsLegalPackage bundleId={BUNDLE} disabled={false} />);
    }
    const response = zip(); const readBlob = vi.spyOn(response, 'blob');
    await act(async () => { pending.resolve(response); });
    expect(readBlob).not.toHaveBeenCalled(); expect(downloadBlob).not.toHaveBeenCalled();
    if (retirement !== 'unmount') expect(screen.queryByText(/Keep this ZIP/)).toBeNull();
  });

  it.each(['account', 'bundle ABA', 'unmount'])('drops already-started ZIP bytes after %s retirement', async retirement => {
    const view = render(<InsightsLegalPackage bundleId={BUNDLE} disabled={false} />);
    const button = await openAndSelect(); const bytes = deferred<Blob>();
    const response = zip(); const readBlob = vi.spyOn(response, 'blob').mockReturnValue(bytes.promise);
    intercept(method => method === 'POST', () => response); fireEvent.click(button);
    await waitFor(() => expect(readBlob).toHaveBeenCalledOnce());
    if (retirement === 'unmount') view.unmount();
    else if (retirement === 'account') act(() => replaceOwner('account'));
    else {
      view.rerender(<InsightsLegalPackage bundleId={OTHER_BUNDLE} disabled={false} />);
      view.rerender(<InsightsLegalPackage bundleId={BUNDLE} disabled={false} />);
    }
    await act(async () => { bytes.resolve(new Blob(['old private ZIP bytes'])); });
    expect(downloadBlob).not.toHaveBeenCalled();
    if (retirement !== 'unmount') expect(screen.queryByText(/Keep this ZIP/)).toBeNull();
  });

  it('drops a delayed refusal body and its private reason after owner replacement', async () => {
    render(<InsightsLegalPackage bundleId={BUNDLE} disabled={false} />);
    const button = await openAndSelect(); const body = deferred<unknown>();
    const response = new Response('{}', { status: 403 });
    const decode = vi.spyOn(response, 'json').mockReturnValue(body.promise);
    intercept(method => method === 'POST', () => response); fireEvent.click(button);
    await waitFor(() => expect(decode).toHaveBeenCalledOnce());
    act(() => replaceOwner('account'));
    await act(async () => { body.resolve({ error: { message: 'Old private approval reason' } }); });
    expect(screen.queryByText(/Old private approval reason/)).toBeNull();
    expect(downloadBlob).not.toHaveBeenCalled();
  });

  it('drops a late transport error after owner replacement', async () => {
    render(<InsightsLegalPackage bundleId={BUNDLE} disabled={false} />);
    const button = await openAndSelect(); const pending = deferred<Response>();
    intercept(method => method === 'POST', () => pending.promise); fireEvent.click(button);
    act(() => replaceOwner('account'));
    await act(async () => { pending.reject(new Error('Old private transport reason')); });
    expect(screen.queryByText(/Old private transport reason/)).toBeNull();
    expect(downloadBlob).not.toHaveBeenCalled();
  });

  it('keeps the new owner pending lock when an old export completes', async () => {
    render(<InsightsLegalPackage bundleId={BUNDLE} disabled={false} />);
    const oldButton = await openAndSelect(); const old = deferred<Response>(); const fresh = deferred<Response>();
    let dispatches = 0;
    intercept(method => method === 'POST', () => ++dispatches === 1 ? old.promise : fresh.promise);
    fireEvent.click(oldButton); act(() => replaceOwner('account'));
    const newButton = await openAndSelect();
    act(() => { fireEvent.click(newButton); fireEvent.click(newButton); });
    expect(posts()).toHaveLength(2);
    await act(async () => { old.resolve(zip()); });
    const pending = screen.getByRole('button', { name: /Preparing report package/ });
    fireEvent.click(pending);
    expect(posts()).toHaveLength(2); expect(downloadBlob).not.toHaveBeenCalled();
    await act(async () => { fresh.resolve(zip()); });
    await waitFor(() => expect(downloadBlob).toHaveBeenCalledOnce());
  });
});

describe('archive visit presentation and immediate withdrawal', () => {
  it('does not dispatch a retained stationery read after account replacement', async () => {
    render(<InsightsLegalPackage bundleId={BUNDLE} disabled={false} />); await openAndSelect();
    const oldRead = screen.getByRole('button', { name: /Choose published stationery/ });
    act(() => { replaceOwner('account'); fireEvent.click(oldRead); });
    expect(apiRequest.mock.calls.filter(([, path]) => path.includes('/designs?'))).toHaveLength(0);
  });

  it('does not carry a same-frame old stationery selection into the replacement archive', async () => {
    intercept((method, path) => method === 'GET' && path.includes('/designs?'), () => json({ data: [{
      id: VARIANT, name: 'Old private company design', state: 'published', publishedRevision: 17,
      scope: { programId: null, market: null, language: null, subsidiary: null },
    }], nextBefore: null }));
    render(<InsightsLegalPackage bundleId={BUNDLE} disabled={false} />); await openAndSelect();
    fireEvent.click(screen.getByRole('button', { name: /Choose published stationery/ }));
    await screen.findByRole('option', { name: /Old private company design/ });
    const oldSelect = screen.getByRole('combobox', { name: 'Report stationery' });
    act(() => { replaceOwner('account'); fireEvent.change(oldSelect, { target: { value: VARIANT } }); });
    fireEvent.click(await openAndSelect());
    await waitFor(() => expect(downloadBlob).toHaveBeenCalledOnce());
    expect(posts()[0][2]).toEqual({ legalDocumentIds: ['legal-one'] });
  });

  it('withdraws old private fields on the first replacement-owner layout', async () => {
    const snapshots: string[] = [];
    function Probe({ turn }: { turn: number }) {
      const host = React.useRef<HTMLDivElement>(null);
      React.useLayoutEffect(() => { if (turn) snapshots.push(host.current?.innerHTML ?? ''); }, [turn]);
      return <div ref={host}><InsightsLegalPackage bundleId={BUNDLE} disabled={false} /></div>;
    }
    const view = render(<Probe turn={0} />); await openAndSelect();
    fireEvent.change(screen.getByPlaceholderText('Legal title or keyword'), { target: { value: 'Old private legal search' } });
    act(() => { replaceOwner('account'); view.rerender(<Probe turn={1} />); });
    expect(snapshots).toHaveLength(1);
    expect(snapshots[0]).not.toContain('Old private legal search');
    expect(snapshots[0]).not.toContain('Signed company authorization');
    expect(snapshots[0]).not.toContain('Download reports and 1');
  });
});
afterEach(() => { cleanup(); endCompanySession(); vi.unstubAllGlobals(); });

describe('Reporting legal chooser captured account ownership', () => {
  it('refuses a retained ZIP click in the same frame as account replacement', async () => {
    render(<InsightsLegalPackage bundleId={BUNDLE} disabled={false} />);
    fireEvent.click(screen.getByRole('button', { name: /Choose legal companions/ }));
    fireEvent.click(await screen.findByRole('checkbox', { name: /Signed company authorization/ }));
    const oldButton = screen.getByRole('button', { name: /Download reports and 1/ });
    expect((oldButton as HTMLButtonElement).disabled).toBe(false);

    act(() => {
      seedCompanySession({ id: '43', email: 'replacement-owner@example.test' }, 'replacement');
      fireEvent.click(oldButton);
    });

    expect(posts()).toHaveLength(0);
    expect(downloadBlob).not.toHaveBeenCalled();
  });
});
