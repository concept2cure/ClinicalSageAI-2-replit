/**
 * @vitest-environment jsdom
 */
/**
 * Every PDEV write, and the Evidence Picker's search, answered 401 in every
 * environment.
 *
 * All nine PDEV mutations go through one `postJson` (usePdevData.ts), which sent
 * `credentials: 'include'` and a Content-Type, and no Authorization. /api/pdev
 * is mounted with `authenticateToken` INLINE (register-regulatory-routes.ts), so
 * this was not the production-only form of the defect: the route itself refused
 * every call, on a laptop too. The Evidence Picker's search hit
 * /api/evidence-objects, mounted with `authMiddleware` inline, and showed the
 * user "HTTP 401".
 *
 * The URL reaches postJson as a PARAMETER, which is why a sweep that resolved
 * URL strings could not see it. scripts/ci/check-unauthenticated-fetch.mjs now
 * checks every raw fetch() whatever its URL.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';

vi.mock('@/utils/authToken', () => ({
  getAuthToken: () => 'test-token',
  getOrgId: () => '7',
  getAuthHeaders: () => ({ Authorization: 'Bearer test-token', 'x-organization-id': '7' }),
}));

import { usePdevEvidenceAttach } from '../hooks/usePdevData';

let fetchMock: ReturnType<typeof vi.fn>;
beforeEach(() => {
  fetchMock = vi.fn(async (_url: RequestInfo | URL, _init?: RequestInit) =>
    ({ ok: true, status: 200, json: async () => ({ data: {} }), text: async () => '' }) as Response);
  vi.stubGlobal('fetch', fetchMock);
});
afterEach(() => vi.unstubAllGlobals());

describe('PDEV writes send the bearer token /api/pdev requires', () => {
  it('evidence attach (one of the nine mutations sharing postJson) authenticates', async () => {
    const { result } = renderHook(() => usePdevEvidenceAttach());
    await act(async () => {
      await result.current.run({
        programId: 'p1', activityKey: 'a1', evidenceObjectId: 'e1',
        linkType: 'supports', strength: 'strong', rationale: 'r',
      } as never);
    });
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toContain('/api/pdev/programs/p1/activities/a1/evidence');
    const headers = (init.headers ?? {}) as Record<string, string>;
    expect(headers.Authorization).toBe('Bearer test-token');
    expect(headers['x-organization-id']).toBe('7');
    expect(headers['Content-Type']).toBe('application/json');
  });
});
