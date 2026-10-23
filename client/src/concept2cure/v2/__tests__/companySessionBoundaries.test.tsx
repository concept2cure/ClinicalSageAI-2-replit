// @vitest-environment jsdom
import React from 'react';
import { act, cleanup, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { normalizeTemplateSpec } from '@shared/templates/template-spec';
import type { CompanyDocumentProfile } from '@shared/company-documents';
const apiRequest = vi.hoisted(() => vi.fn());
const apiUpload = vi.hoisted(() => vi.fn());
const downloadBlob = vi.hoisted(() => vi.fn(() => true));
vi.mock('@/lib/queryClient', async original => ({ ...(await original<typeof import('@/lib/queryClient')>()), apiRequest, apiUpload }));
vi.mock('../download', async original => ({ ...(await original<typeof import('../download')>()), downloadBlob }));
import { authService } from '@/services/portal/authService';
import { useCompanyDocumentSettings, type CompanyDocumentSettingsModel } from '../surfaces/useCompanyDocumentSettings';
import { useCompanyResource } from '../surfaces/company-documents/useCompanyResource';
import { endCompanySession, rotateCompanyBearer, seedCompanySession } from './_company-session-fixture';

const PATH = '/api/client-branding/company-documents';
const READ = `${PATH}?includeLegal=false`;
function profile(name = 'Current company', revision = 3): CompanyDocumentProfile {
  return { version: 1, revision, brandingAdopted: true, companyName: name, address: '', contact: '', registrationDetails: '',
    letterhead: normalizeTemplateSpec({}), importedFrom: null, applyToReports: false, applyToSubmissionCorrespondence: false, legalDocuments: [] };
}
const receipt = (name?: string, revision?: number) => ({ data: profile(name, revision), canManage: true, legalDocumentsIncluded: false });
const json = (body: unknown) => new Response(JSON.stringify(body), { status: 200, headers: { 'Content-Type': 'application/json' } });
function deferred<T>() { let resolve!: (value: T) => void; const promise = new Promise<T>(done => { resolve = done; }); return { promise, resolve }; }
let model: CompanyDocumentSettingsModel;
function SettingsHost() { model = useCompanyDocumentSettings(); return <output>{model.currentView ? model.draft?.companyName : 'withdrawn'}</output>; }
let resource: ReturnType<typeof useCompanyResource<{ title: string }>>;
const parse = (value: unknown) => value && typeof value === 'object' && 'title' in value ? value as { title: string } : null;
function ResourceHost({ path = '/current', version = 3 }: { path?: string; version?: number }) {
  resource = useCompanyResource(path, parse, version); return <output>{resource.data?.title ?? 'withdrawn'}</output>;
}
beforeEach(() => {
  localStorage.clear(); sessionStorage.clear(); seedCompanySession(); apiRequest.mockReset(); apiUpload.mockReset(); downloadBlob.mockClear();
  apiRequest.mockImplementation(async (_method, path) => path === READ ? json(receipt()) : json({ title: 'Current resource' }));
});
afterEach(() => { cleanup(); endCompanySession(); vi.unstubAllGlobals(); });
async function settings() { const view = render(<SettingsHost />); await screen.findByText('Current company'); return view; }

describe('company owner retirement before dispatch', () => {
  it('rejects raw browser credential drift without treating it as canonical refresh', async () => {
    await settings(); const old = model; const before = apiRequest.mock.calls.length;
    localStorage.setItem('trialsage_access_token', 'unadmitted-browser-bearer');
    await act(async () => { old.patch({ companyName: 'Wrong account draft' }); old.setReason('Wrong account reason');
      await old.load(old.session.current); await old.save(); await old.downloadProof(); await old.importFile(new File(['pdf'], 'draft.pdf')); });
    expect(apiRequest).toHaveBeenCalledTimes(before); expect(apiUpload).not.toHaveBeenCalled();
  });
  it('retires same-id account-object replacement even when the auth revision stays current', async () => {
    await settings(); const old = model; const guard = authService.captureSessionReadGuard();
    vi.stubGlobal('fetch', vi.fn(async () => json({ authenticated: true, user: { ...authService.getUser(), roles: ['viewer'] } })));
    await act(async () => { expect((await authService.refreshUser()).success).toBe(true); });
    expect(guard.sameRevision()).toBe(true);
    const count = apiRequest.mock.calls.length;
    await act(async () => { old.patch({ companyName: 'Retired draft' }); old.setReason('Retired reason'); await old.save(); await old.load(old.session.current); });
    expect(apiRequest).toHaveBeenCalledTimes(count); expect(screen.queryByText('Retired draft')).toBeNull();
  });
  it('cannot revive retained profile handlers after A to B to A or unmount', async () => {
    const view = await settings(); const old = model;
    await act(async () => { seedCompanySession({ id: '43' }, 'B'); });
    await act(async () => { seedCompanySession({}, 'A-return'); });
    await waitFor(() => expect(model.saved?.companyName).toBe('Current company'));
    view.unmount(); const count = apiRequest.mock.calls.length;
    await act(async () => { old.patch({ companyName: 'Retired' }); old.spec(value => ({ ...value, name: 'Retired' })); old.setReason('Retired');
      await old.load(old.session.current); await old.save(); await old.download(); await old.downloadProof();
      await old.importFile(new File(['pdf'], 'draft.pdf')); await old.uploadLogo(new File(['png'], 'logo.png', { type: 'image/png' })); });
    expect(apiRequest).toHaveBeenCalledTimes(count); expect(apiUpload).not.toHaveBeenCalled(); expect(downloadBlob).not.toHaveBeenCalled();
  });
});

describe('company response and body ownership', () => {
  it('does not consume an old read body when the account changed before its response', async () => {
    const pending = deferred<Response>(); const body = vi.fn(async () => receipt('Old private company'));
    apiRequest.mockImplementationOnce(() => pending.promise);
    render(<SettingsHost />);
    await act(async () => { seedCompanySession({ id: '43' }, 'new'); });
    await screen.findByText('Current company');
    await act(async () => { pending.resolve({ ok: true, status: 200, json: body } as unknown as Response); });
    expect(body).not.toHaveBeenCalled(); expect(screen.queryByText('Old private company')).toBeNull();
  });
  it('rejects an old parsed read body after a new account receives its own saved profile', async () => {
    const body = deferred<unknown>(); const parseBody = vi.fn(() => body.promise);
    apiRequest.mockImplementationOnce(async () => ({ ok: true, status: 200, json: parseBody }));
    render(<SettingsHost />); await waitFor(() => expect(parseBody).toHaveBeenCalled());
    await act(async () => { seedCompanySession({ id: '43' }, 'new'); }); await screen.findByText('Current company');
    await act(async () => { body.resolve(receipt('Old private company')); });
    expect(screen.queryByText('Old private company')).toBeNull();
  });
  it('settles an already-sent save normally across ordinary bearer rotation', async () => {
    const response = deferred<Response>(); let stored = receipt();
    apiRequest.mockImplementation(async (method, path) => method === 'PUT' ? response.promise : path === READ ? json(stored) : json({ data: [] }));
    await settings(); act(() => { model.patch({ companyName: 'Saved after refresh' }); model.setReason('Retain the deliberate saved change.'); });
    let done!: Promise<void>; act(() => { done = model.save()!; });
    await act(async () => { await rotateCompanyBearer(); }); stored = receipt('Saved after refresh', 4);
    await act(async () => { response.resolve(json(stored)); await done; });
    expect(model.saved?.revision).toBe(4); expect(model.notice?.text).toMatch(/saved · revision 4/);
    expect(apiRequest.mock.calls.filter(([method]) => method === 'PUT')).toHaveLength(1);
  });
  it('preserves a pending Word proof across refresh, but drops it after replacement during blob read', async () => {
    const blob = deferred<Blob>(); const readBlob = vi.fn(() => blob.promise);
    apiRequest.mockImplementation(async method => method === 'GET' ? json(receipt()) : { ok: true, status: 200, blob: readBlob });
    await settings(); let done!: Promise<void>; act(() => { done = model.downloadProof(); });
    await waitFor(() => expect(readBlob).toHaveBeenCalled()); await act(async () => { await rotateCompanyBearer(); });
    expect(model.busy).toBe(true);
    await act(async () => { seedCompanySession({ id: '43' }, 'new'); }); await screen.findByText('Current company');
    await act(async () => { blob.resolve(new Blob(['old proof'])); await done; });
    expect(downloadBlob).not.toHaveBeenCalled(); expect(model.notice).toBeNull();
  });
  it('delivers a pending Word proof once after an ordinary refresh', async () => {
    const blob = deferred<Blob>(); const readBlob = vi.fn(() => blob.promise);
    apiRequest.mockImplementation(async method => method === 'GET' ? json(receipt()) : { ok: true, status: 200, blob: readBlob });
    await settings(); let done!: Promise<void>; act(() => { done = model.downloadProof(); });
    await waitFor(() => expect(readBlob).toHaveBeenCalled()); await act(async () => { await rotateCompanyBearer(); });
    await act(async () => { blob.resolve(new Blob(['current proof'])); await done; });
    expect(downloadBlob).toHaveBeenCalledTimes(1); expect(model.notice?.text).toMatch(/Unsaved Word proof downloaded/);
  });
  it('retains an imported draft and its warnings through a genuine refresh', async () => {
    const response = deferred<Response>(); apiUpload.mockReturnValue(response.promise);
    await settings(); let done!: Promise<void>; act(() => { done = model.importFile(new File(['pdf'], 'letterhead.pdf')); });
    await act(async () => { await rotateCompanyBearer(); });
    await act(async () => { response.resolve(json({ spec: normalizeTemplateSpec({ header: { text: 'Imported running header' } }), warnings: ['Review imported layout'] })); await done; });
    expect(model.draft?.letterhead.header?.text).toBe('Imported running header'); expect(model.draft?.importedFrom).toBe('letterhead.pdf');
    expect(model.warnings).toEqual(['Review imported layout']); expect(apiUpload).toHaveBeenCalledTimes(1);
  });
  it('does not consume a retired extraction response or overwrite the replacement draft', async () => {
    const response = deferred<Response>(); const parseBody = vi.fn(async () => ({ spec: normalizeTemplateSpec({ header: { text: 'Retired header' } }) }));
    apiUpload.mockReturnValue(response.promise); await settings(); let done!: Promise<void>;
    act(() => { done = model.importFile(new File(['pdf'], 'retired.pdf')); });
    await act(async () => { seedCompanySession({ id: '43' }, 'new'); }); await screen.findByText('Current company');
    await act(async () => { response.resolve({ ok: true, status: 200, json: parseBody } as unknown as Response); await done; });
    expect(parseBody).not.toHaveBeenCalled(); expect(model.draft?.importedFrom).toBeNull(); expect(model.notice).toBeNull();
  });
  it('keeps a new logo read busy when an older owner completes or fails', async () => {
    const readers: Array<{ result: string; onload: () => void; onerror: () => void }> = [];
    class Reader {
      result = ''; onload = () => {}; onerror = () => {};
      readAsDataURL() { readers.push(this); }
    }
    vi.stubGlobal('FileReader', Reader); await settings(); let old!: Promise<void>; let next!: Promise<void>;
    act(() => { old = model.uploadLogo(new File(['old'], 'old.png', { type: 'image/png' })); });
    await act(async () => { seedCompanySession({ id: '43' }, 'new'); }); await screen.findByText('Current company');
    act(() => { next = model.uploadLogo(new File(['new'], 'new.png', { type: 'image/png' })); });
    await act(async () => { readers[0].onerror(); await old; });
    expect(model.busy).toBe(true); expect(model.notice).toBeNull(); expect(model.draft?.letterhead.brand.logo).toBeUndefined();
    await act(async () => { readers[1].result = 'data:image/png;base64,bmV3'; readers[1].onload(); await next; });
    expect(model.busy).toBe(false); expect(model.draft?.letterhead.brand.logo?.dataBase64).toBe('bmV3');
  });
});

describe('company resource path/version leases', () => {
  it('retains a pending current resource across ordinary refresh without another read', async () => {
    const result = deferred<Response>(); apiRequest.mockImplementationOnce(() => result.promise);
    render(<ResourceHost />); await act(async () => { await rotateCompanyBearer(); });
    await act(async () => { result.resolve(json({ title: 'Same owner response' })); });
    await screen.findByText('Same owner response'); expect(apiRequest).toHaveBeenCalledTimes(1);
  });
  it('retires old calls and files on path/version changes, A to B to A and unmount', async () => {
    const view = render(<ResourceHost />); await screen.findByText('Current resource'); const old = resource;
    view.rerender(<ResourceHost path="/other" version={4} />); await screen.findByText('Current resource');
    view.rerender(<ResourceHost />); await screen.findByText('Current resource'); const current = resource;
    expect(current.owner).not.toBe(old.owner);
    const count = apiRequest.mock.calls.length;
    expect(await old.call('POST', '/retired', {})).toBeNull(); expect(await old.file('/retired', {})).toBeNull();
    view.unmount(); expect(await current.call('POST', '/retired', {})).toBeNull(); expect(await current.file('/retired', {})).toBeNull();
    expect(apiRequest).toHaveBeenCalledTimes(count);
  });
  it('blocks old resource actions in the same frame as credential replacement', async () => {
    render(<ResourceHost />); await screen.findByText('Current resource'); const old = resource; const count = apiRequest.mock.calls.length;
    let call!: Promise<unknown>; act(() => { seedCompanySession({ id: '43' }, 'new'); call = old.call('PUT', '/retired', {}); });
    await call; expect(apiRequest.mock.calls.filter(([method]) => method === 'PUT')).toHaveLength(0);
    expect(apiRequest.mock.calls.length).toBeGreaterThanOrEqual(count);
  });
});
