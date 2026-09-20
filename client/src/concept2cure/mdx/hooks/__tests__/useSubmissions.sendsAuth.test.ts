/**
 * @vitest-environment jsdom
 */
/**
 * `credentials: 'include'` is not authentication in this app.
 *
 * `useSubmissionDetail` read a package's readiness gate and its milestones with
 * a bare `{ credentials: 'include' }` and no headers. The global /api gate
 * reads `req.headers.authorization` and has NO cookie fallback
 * (server/middleware/auth.ts, `extractBearerToken`), and `/api/submission-ops`
 * is not on PUBLIC_API_ALLOWLIST — so both reads 401'd.
 *
 * It failed in production only: `authBoundary` runs in mode 'warn' outside
 * production and 'enforce' in it, so this worked on a laptop and for nobody
 * else.
 *
 * And it failed SILENTLY, which is the part that matters. A 401 is not
 * `res.ok`, so both branches left `gate` and `log` null and the Submissions
 * surface rendered a package with no readiness gate and no milestones —
 * indistinguishable from a package that genuinely has neither.
 *
 * Same diagnosis as ./mdx-hooks-send-auth.test.ts, which covers two other
 * hooks in this lane.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderHook, waitFor } from '@testing-library/react';

vi.mock('@/utils/authToken', () => ({
  getAuthToken: () => 'test-token',
  getOrgId: () => '7',
}));

import { useSubmissionDetail } from '../useSubmissions';

let fetchMock: ReturnType<typeof vi.fn>;

const ok = (body: unknown) =>
  ({ ok: true, status: 200, json: async () => body, text: async () => JSON.stringify(body) }) as Response;

beforeEach(() => {
  fetchMock = vi.fn(async () => ok({ data: [] }));
  vi.stubGlobal('fetch', fetchMock);
});
afterEach(() => vi.unstubAllGlobals());

/** Every URL this render requested, paired with the Authorization it sent. */
function sentAuth(): Array<{ url: string; auth: string | undefined }> {
  return fetchMock.mock.calls.map((c) => {
    const headers = ((c[1] as RequestInit | undefined)?.headers ?? {}) as Record<string, string>;
    return { url: String(c[0]), auth: headers.Authorization };
  });
}

describe('useSubmissionDetail sends the bearer token the /api gate requires', () => {
  it('authenticates BOTH the readiness and the milestones read', async () => {
    renderHook(() => useSubmissionDetail('pkg_123'));

    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(2));

    const calls = sentAuth();
    const readiness = calls.find((c) => c.url.includes('/readiness'));
    const milestones = calls.find((c) => c.url.includes('/milestones'));

    expect(readiness, 'the readiness read was never issued').toBeTruthy();
    expect(milestones, 'the milestones read was never issued').toBeTruthy();
    expect(readiness!.auth).toBe('Bearer test-token');
    expect(milestones!.auth).toBe('Bearer test-token');
  });

  it('sends the org header alongside it, as every other read in this lane does', async () => {
    renderHook(() => useSubmissionDetail('pkg_123'));
    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(2));

    for (const call of fetchMock.mock.calls) {
      const headers = ((call[1] as RequestInit | undefined)?.headers ?? {}) as Record<string, string>;
      expect(headers['x-organization-id']).toBe('7');
    }
  });

  it('keeps credentials: include — the token is additional to it, not instead of it', async () => {
    renderHook(() => useSubmissionDetail('pkg_123'));
    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(2));

    for (const call of fetchMock.mock.calls) {
      expect((call[1] as RequestInit).credentials).toBe('include');
    }
  });
});
