/**
 * @vitest-environment jsdom
 */
/**
 * `credentials: 'include'` is not authentication in this app.
 *
 * The global /api gate reads `req.headers.authorization` and has NO cookie
 * fallback — server/middleware/auth.ts `extractBearerToken` is the only source,
 * and a request without it gets 401 AUTH_001 before any handler runs. Every
 * hook in this lane therefore sends `buildAuthHeaders()`. Two did not:
 *
 *   - useAcceptAnaDraft POSTed with a bare `{'Content-Type': …}`, so accepting
 *     an AnA-drafted 510(k)/PMA/CER section could never succeed, for any user,
 *     on any section. It then rendered the raw response body, so the refusal
 *     reached the user as `HTTP 401: {"error":{"code":"AUTH_001",…}}`.
 *
 *   - useProgramExtras sent no headers at all, so all eight of its reads 401'd
 *     and the hook turned each into `null` — indistinguishable, to the PMA
 *     surface, from a programme that genuinely has no activity, no milestones
 *     and no trial metrics.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderHook, waitFor, act } from '@testing-library/react';

vi.mock('@/utils/authToken', () => ({
  getAuthToken: () => 'test-token',
  getOrgId: () => '7',
}));

import { useAcceptAnaDraft } from '../useAcceptAnaDraft';
import { useProgramExtras } from '../useProgramExtras';

let fetchMock: ReturnType<typeof vi.fn>;
beforeEach(() => {
  fetchMock = vi.fn();
  vi.stubGlobal('fetch', fetchMock);
});
afterEach(() => vi.unstubAllGlobals());

const ok = (body: unknown) =>
  ({ ok: true, status: 200, json: async () => body, text: async () => JSON.stringify(body) }) as Response;
const unauthorized = () =>
  ({
    ok: false,
    status: 401,
    json: async () => ({ error: { code: 'AUTH_001', message: 'No authentication token provided' } }),
    text: async () => '{"error":{"code":"AUTH_001","message":"No authentication token provided"}}',
  }) as Response;

/** Every Authorization header this render sent. */
const sentAuth = () =>
  fetchMock.mock.calls.map((c) => (c[1]?.headers as Record<string, string> | undefined)?.Authorization);

describe('useAcceptAnaDraft', () => {
  it('sends the Bearer token the accept route requires', async () => {
    fetchMock.mockResolvedValue(ok({ ok: true }));
    const { result } = renderHook(() => useAcceptAnaDraft(11));
    await act(async () => { await result.current.accept({ refinedContent: 'x' }); });
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(sentAuth()).toEqual(['Bearer test-token']);
    /* The section id is POSITIONAL. This passed `{ sectionRowId: 11 }`, an
       object, which typechecked red and still ran: the hook only compares it to
       null, so the request went to /api/cerv2-sections/[object Object]/… and
       every assertion below still held. Pinning the URL is what makes the
       argument shape observable from the test. */
    expect(String(fetchMock.mock.calls[0][0])).toBe(
      '/api/cerv2-sections/11/accept-ana-draft',
    );
    const headers = fetchMock.mock.calls[0][1].headers as Record<string, string>;
    expect(headers['x-organization-id']).toBe('7');
    expect(headers['Content-Type']).toBe('application/json');
  });

  it('does not put the raw error envelope on screen', async () => {
    fetchMock.mockResolvedValue(unauthorized());
    const { result } = renderHook(() => useAcceptAnaDraft(11));
    await act(async () => { await result.current.accept(); });
    await waitFor(() => expect(result.current.error).toBeTruthy());
    const shown = String(result.current.error);
    expect(shown).not.toContain('AUTH_001');
    expect(shown).not.toContain('{"error"');
    // The server's own sentence is kept.
    expect(shown).toContain('No authentication token provided');
  });
});

describe('useProgramExtras', () => {
  const PROGRAM = 'aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee';

  it('sends the Bearer token on every one of its reads', async () => {
    fetchMock.mockResolvedValue(ok({ data: [] }));
    renderHook(() => useProgramExtras(PROGRAM));
    await waitFor(() => expect(fetchMock.mock.calls.length).toBeGreaterThan(1));
    expect(sentAuth().every((a) => a === 'Bearer test-token'), JSON.stringify(sentAuth())).toBe(true);
  });

  /* A failed read is not an empty one — the distinction the PMA surface needs
     to avoid rendering "nothing here yet" over a programme it could not read. */
  it('reports a failed read instead of reporting emptiness', async () => {
    fetchMock.mockResolvedValue(unauthorized());
    const { result } = renderHook(() => useProgramExtras(PROGRAM));
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.error).toBeTruthy();
    expect(result.current.pmaTrialMetrics).toBeNull();
  });

  it('stays quiet when the reads genuinely return nothing', async () => {
    fetchMock.mockResolvedValue(ok({ data: [] }));
    const { result } = renderHook(() => useProgramExtras(PROGRAM));
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.error).toBeNull();
  });
});
