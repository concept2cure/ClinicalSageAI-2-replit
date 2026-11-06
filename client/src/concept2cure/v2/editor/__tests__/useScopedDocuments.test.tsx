// @vitest-environment jsdom
/** The existing project's list reader, with real session retirement and only transport stubbed. */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, renderHook, waitFor } from '@testing-library/react';

const apiRequest = vi.hoisted(() => vi.fn());
vi.mock('@/lib/queryClient', async original => ({
  ...await original<typeof import('@/lib/queryClient')>(), apiRequest,
}));
vi.mock('@/services/portal/authService', async original => {
  const actual = await original<typeof import('@/services/portal/authService')>();
  return { ...actual, useAuth: () => ({ user: actual.authService.getUser() }) };
});
import { authService, type AuthUser } from '@/services/portal/authService';
import { clearAuthToken } from '@/utils/authToken';
import { useScopedDocuments } from '../useScopedDocuments';

const PROJECT = 'bbbbbbbb-0000-4000-8000-000000000001';
const OTHER_PROJECT = 'bbbbbbbb-0000-4000-8000-000000000002';
const DOCUMENT = 'dddddddd-0000-4000-8000-000000000001';
const NEXT_DOCUMENT = 'dddddddd-0000-4000-8000-000000000002';
const actor = (id = '7'): AuthUser => ({ id, organizationId: '12', organizationName: 'Synthetic sponsor',
  firstName: 'Test', lastName: 'Author', displayName: 'Author', email: 'author@example.test',
  roles: ['admin'], permissions: [], mfaEnabled: false, mfaMethods: [], mustChangePassword: false });
const bearer = (id = '7') => `fixture.${btoa(JSON.stringify({ userId: Number(id), organizationId: 12 }))}.synthetic`;
const row = (id = DOCUMENT, programId: string | null = PROJECT) => ({ id, title: `Working document ${id}`,
  module: 'M3', product_code: null, status: 'DRAFT', updated_at: null, section_count: 1, program_id: programId });
const response = (body: unknown, status = 200) => new Response(JSON.stringify(body), {
  status, headers: { 'Content-Type': 'application/json' },
});
function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>(done => { resolve = done; });
  return { promise, resolve };
}
function mount(programId: string | null = PROJECT, status = 'all') {
  return renderHook((props: { programId: string | null; status: string }) => useScopedDocuments(props.programId, props.status),
    { initialProps: { programId, status } });
}
const noProgramRow = () => ({ ...row(), program_id: undefined });
const invalidReplies = [
  { name: 'an unsuccessful result', body: { success: false, documents: [row()] } },
  { name: 'an unconfirmed result', body: { documents: [row()] } },
  { name: 'a missing project identity', body: { success: true, documents: [noProgramRow()] } },
  { name: 'another project', body: { success: true, documents: [row(DOCUMENT, OTHER_PROJECT)] } },
  { name: 'mixed project identities', body: { success: true, documents: [row(), row(NEXT_DOCUMENT, OTHER_PROJECT)] } },
];

beforeEach(() => {
  localStorage.clear(); sessionStorage.clear(); clearAuthToken();
  authService.setToken(bearer(), actor(), 'fixture-refresh', 3600);
  vi.stubGlobal('fetch', vi.fn(async () => response({ authenticated: true, user: authService.getUser() })));
  apiRequest.mockReset().mockImplementation(async () => response({ success: true, documents: [row()] }));
});
afterEach(() => {
  cleanup(); authService.endSession(null); clearAuthToken();
  localStorage.clear(); sessionStorage.clear(); vi.unstubAllGlobals();
});

describe('ordinary project reads verify the returned project and result', () => {
  it.each(invalidReplies)('refuses $name on first load', async ({ body }) => {
    apiRequest.mockResolvedValueOnce(response(body));
    const view = mount();
    await waitFor(() => expect(view.result.current.docsState).toBe('error'));
    expect(view.result.current.docs).toEqual([]);
    expect(apiRequest).toHaveBeenCalledWith('GET', `/api/authoring/docs?status=all&programId=${PROJECT}`);
  });

  it.each(invalidReplies)('retires the previous list when a normal reload returns $name', async ({ body }) => {
    const view = mount();
    await waitFor(() => expect(view.result.current.docs.map(document => document.id)).toEqual([DOCUMENT]));
    apiRequest.mockResolvedValueOnce(response(body));
    await act(async () => { await view.result.current.loadDocs(); });
    expect(view.result.current.docsState).toBe('error');
    expect(view.result.current.docs).toEqual([]);
    expect(apiRequest.mock.calls.every(([method]) => method === 'GET')).toBe(true);
  });
});

describe('ordinary project reads retain valid results and existing recovery', () => {
  it('keeps valid project rows and the requested status on first load and reload', async () => {
    const view = mount(PROJECT, 'APPROVED');
    await waitFor(() => expect(view.result.current.docsState).toBe('ready'));
    expect(view.result.current.docs.map(document => document.id)).toEqual([DOCUMENT]);
    apiRequest.mockResolvedValueOnce(response({ success: true, documents: [row(NEXT_DOCUMENT)] }));
    await act(async () => { await view.result.current.loadDocs(); });
    expect(view.result.current.docs.map(document => document.id)).toEqual([NEXT_DOCUMENT]);
    expect(apiRequest.mock.calls.every(([, path]) => path === `/api/authoring/docs?status=APPROVED&programId=${PROJECT}`)).toBe(true);
  });

  it('reports a verified empty project as ready on first load and reload', async () => {
    apiRequest.mockImplementation(async () => response({ success: true, documents: [] }));
    const view = mount();
    await waitFor(() => expect(view.result.current.docsState).toBe('ready'));
    expect(view.result.current.docs).toEqual([]);
    await act(async () => { await view.result.current.loadDocs(); });
    expect(view.result.current.docsState).toBe('ready');
    expect(view.result.current.docs).toEqual([]);
  });

  it('still confirms a fresh project read for creation recovery', async () => {
    const view = mount();
    await waitFor(() => expect(view.result.current.docsState).toBe('ready'));
    let recovered: boolean | undefined;
    await act(async () => { recovered = await view.result.current.refreshCreationContext(); });
    expect(recovered).toBe(true);
    expect(view.result.current.docs.map(document => document.id)).toEqual([DOCUMENT]);
  });

  it('keeps the intentional organization list separate from project creation authority', async () => {
    const legacyRows = [row(), row(NEXT_DOCUMENT, null)];
    apiRequest.mockImplementation(async () => response({ success: true, documents: legacyRows }));
    const view = mount(null);
    await waitFor(() => expect(view.result.current.docsState).toBe('ready'));
    expect(view.result.current.docs.map(document => document.id)).toEqual([DOCUMENT, NEXT_DOCUMENT]);
    expect(apiRequest).toHaveBeenCalledWith('GET', '/api/authoring/docs?status=all');
    let recovered: boolean | undefined;
    await act(async () => { recovered = await view.result.current.refreshCreationContext(); });
    expect(recovered).toBe(false);
    expect(view.result.current.docsState).toBe('error');
  });
});

describe('ordinary project reads retain their current owner', () => {
  it('ignores the old project response after another project is current', async () => {
    const pending = deferred<Response>();
    apiRequest.mockImplementationOnce(() => pending.promise).mockResolvedValue(response({
      success: true, documents: [row(NEXT_DOCUMENT, OTHER_PROJECT)],
    }));
    const view = mount();
    await waitFor(() => expect(apiRequest).toHaveBeenCalledTimes(1));
    view.rerender({ programId: OTHER_PROJECT, status: 'all' });
    await waitFor(() => expect(view.result.current.docsState).toBe('ready'));
    await act(async () => { pending.resolve(response({ success: true, documents: [row()] })); });
    expect(view.result.current.docs.map(document => document.id)).toEqual([NEXT_DOCUMENT]);
  });

  it('ignores the old account response after the signed-in account changes', async () => {
    const pending = deferred<Response>();
    apiRequest.mockImplementationOnce(() => pending.promise).mockResolvedValue(response({
      success: true, documents: [row(NEXT_DOCUMENT)],
    }));
    const view = mount();
    await waitFor(() => expect(apiRequest).toHaveBeenCalledTimes(1));
    act(() => { authService.setToken(bearer('8'), actor('8'), 'fixture-refresh-8', 3600); });
    await waitFor(() => expect(view.result.current.docsState).toBe('ready'));
    await act(async () => { pending.resolve(response({ success: true, documents: [row()] })); });
    expect(view.result.current.docs.map(document => document.id)).toEqual([NEXT_DOCUMENT]);
  });
});
