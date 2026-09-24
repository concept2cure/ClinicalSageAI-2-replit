/**
 * @vitest-environment jsdom
 */
/**
 * The shared e-signature modal could not verify a signer, for anyone, anywhere.
 *
 * <EsignModal> gates every governed confirm on `useEsignature().verifyPassword`
 * (EsignModal.tsx) — Submission Center, the task board, authoring signatures and
 * filing, the document workbench, GovernedConfirmDialog and the protocol
 * surfaces all go through it. The hook posted to /api/esignature with
 * `credentials: 'include'` and a Content-Type header, and NO Authorization.
 *
 * `credentials: 'include'` is not authentication in this app: the /api gate
 * reads `req.headers.authorization` and nothing else. /api/esignature is
 * mounted with no inline auth, so:
 *   - production (authBoundary 'enforce'): 401 at the gate, before the handler;
 *   - everywhere else ('warn'): the gate lets it through without a user, and the
 *     handler's own resolveUserId() answers 401 AUTH_REQUIRED.
 * Not a production-only failure — a total one.
 *
 * The validation OQ never saw it: it signs through /api/c2c/actions/sign with a
 * bearer token of its own, not through this hook.
 */
import React from 'react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

vi.mock('@/utils/authToken', () => ({
  getAuthHeaders: () => ({ Authorization: 'Bearer test-token', 'x-organization-id': '7' }),
  getAuthToken: () => 'test-token',
  getOrgId: () => '7',
}));

import { useEsignature } from '../useEsignature';

let fetchMock: ReturnType<typeof vi.fn>;
beforeEach(() => {
  fetchMock = vi.fn(async (_url: RequestInfo | URL, _init?: RequestInit) =>
    ({ ok: true, status: 200, json: async () => ({ valid: true }) }) as Response);
  vi.stubGlobal('fetch', fetchMock);
});
afterEach(() => vi.unstubAllGlobals());

function wrapper({ children }: { children: React.ReactNode }) {
  const qc = new QueryClient({ defaultOptions: { mutations: { retry: false } } });
  return <QueryClientProvider client={qc}>{children}</QueryClientProvider>;
}

const headersOf = (i = 0) =>
  ((fetchMock.mock.calls[i]?.[1] as RequestInit | undefined)?.headers ?? {}) as Record<string, string>;

describe('useEsignature authenticates every call it makes', () => {
  it('verifyPassword sends the bearer token', async () => {
    const { result } = renderHook(() => useEsignature(), { wrapper });
    await act(async () => { await result.current.verifyPassword('pw'); });
    expect(String(fetchMock.mock.calls[0][0])).toBe('/api/esignature/verify-password');
    expect(headersOf().Authorization).toBe('Bearer test-token');
  });

  it('verifyMfa sends the bearer token', async () => {
    const { result } = renderHook(() => useEsignature(), { wrapper });
    await act(async () => { await result.current.verifyMfa('123456'); });
    expect(headersOf().Authorization).toBe('Bearer test-token');
  });

  it('keeps the JSON content type and the org header', async () => {
    const { result } = renderHook(() => useEsignature(), { wrapper });
    await act(async () => { await result.current.verifyPassword('pw'); });
    expect(headersOf()['Content-Type']).toBe('application/json');
    expect(headersOf()['x-organization-id']).toBe('7');
  });
});
