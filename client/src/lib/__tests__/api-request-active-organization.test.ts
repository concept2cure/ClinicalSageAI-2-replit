// @vitest-environment jsdom
/** Catalog and task board share these transports. Exercise the real header
 * readers at fetch, including a per-tab session beside stale shared storage. */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { apiRequest, apiUpload, getQueryFn, queryClient } from '../queryClient';
import { capturedActorHeaders, clearAuthToken } from '@/utils/authToken';

const TOKEN_KEY = 'trialsage_access_token';
const token = (organizationId: number, revision = 'fixture') =>
  `fixture.${btoa(JSON.stringify({ userId: 7, organizationId }))}.${revision}`;
const outgoing = vi.fn(async (_url: RequestInfo | URL, _init?: RequestInit) =>
  new Response(JSON.stringify({ modules: [], tasks: [] }), { headers: { 'Content-Type': 'application/json' } }));
const readQuery = () => getQueryFn()({
  queryKey: ['/api/module-subscriptions/catalog'],
  client: queryClient,
  signal: new AbortController().signal,
  meta: undefined,
});

beforeEach(() => {
  clearAuthToken();
  sessionStorage.clear();
  localStorage.clear();
  outgoing.mockClear();
  vi.stubGlobal('fetch', outgoing);
});
afterEach(() => {
  clearAuthToken();
  vi.unstubAllGlobals();
});

describe('the active bearer scopes shared API transports', () => {
  it.each([
    ['catalog request', () => apiRequest('GET', '/api/module-subscriptions/catalog')],
    ['task-board request', () => apiRequest('GET', '/api/task-management/board')],
    ['multipart upload', () => apiUpload('POST', '/api/vault/upload', new FormData())],
    ['default query function', readQuery],
  ])('%s uses the per-tab bearer organization ahead of another tab’s shared organization', async (_label, run) => {
    const active = token(12);
    sessionStorage.setItem(TOKEN_KEY, active);
    localStorage.setItem(TOKEN_KEY, token(99));
    localStorage.setItem('currentOrganizationId', '99');

    await run();

    const headers = new Headers(outgoing.mock.calls[0][1]?.headers);
    expect(headers.get('Authorization')).toBe(`Bearer ${active}`);
    expect(headers.get('x-organization-id')).toBe('12');
    expect(outgoing.mock.calls[0][1]?.credentials).toBe('include');
    expect(localStorage.getItem('currentOrganizationId')).toBe('99');
  });

  it('keeps remember-me, refresh and logout headers current without migrating token storage', async () => {
    localStorage.setItem('currentOrganizationId', '99');
    const remembered = token(12);
    localStorage.setItem(TOKEN_KEY, remembered);
    await apiRequest('GET', '/api/module-subscriptions/catalog');
    expect(new Headers(outgoing.mock.calls[0][1]?.headers).get('x-organization-id')).toBe('12');
    expect(localStorage.getItem(TOKEN_KEY)).toBe(remembered);
    expect(sessionStorage.getItem(TOKEN_KEY)).toBeNull();

    const refreshed = token(42, 'refreshed');
    localStorage.setItem(TOKEN_KEY, refreshed);
    await apiUpload('POST', '/api/vault/upload', new FormData());
    const refreshedHeaders = new Headers(outgoing.mock.calls[1][1]?.headers);
    expect(refreshedHeaders.get('Authorization')).toBe(`Bearer ${refreshed}`);
    expect(refreshedHeaders.get('x-organization-id')).toBe('42');

    clearAuthToken();
    await readQuery();
    const signedOutHeaders = new Headers(outgoing.mock.calls[2][1]?.headers);
    expect(signedOutHeaders.has('Authorization')).toBe(false);
    expect(signedOutHeaders.get('x-organization-id')).toBe('99');
  });

  it('preserves explicit captured-actor headers and refuses a subsequently replaced actor', async () => {
    const active = token(12);
    sessionStorage.setItem(TOKEN_KEY, active);
    localStorage.setItem('currentOrganizationId', '99');
    const headers = capturedActorHeaders({ userId: 7, organizationId: 12 });
    await apiRequest('POST', '/api/reviews/71/confirm', {}, headers);
    expect(new Headers(outgoing.mock.calls[0][1]?.headers).get('x-organization-id')).toBe('12');
    sessionStorage.setItem(TOKEN_KEY, token(42));
    expect(() => capturedActorHeaders({ userId: 7, organizationId: 12 })).toThrow('account or organization changed');
  });
});
