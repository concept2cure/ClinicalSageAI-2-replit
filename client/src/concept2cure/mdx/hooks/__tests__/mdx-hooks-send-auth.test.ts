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
  ({
    ok: true,
    status: 200,
    json: async () => body,
    text: async () => JSON.stringify(body),
  } as Response);
const unauthorized = () =>
  ({
    ok: false,
    status: 401,
    json: async () => ({
      error: { code: 'AUTH_001', message: 'No authentication token provided' },
    }),
    text: async () => '{"error":{"code":"AUTH_001","message":"No authentication token provided"}}',
  } as Response);

/** Every URL this render requested. */
const requestedUrls = () => fetchMock.mock.calls.map(c => String(c[0]));

/** Every Authorization header this render sent. */
const sentAuth = () =>
  fetchMock.mock.calls.map(
    c => (c[1]?.headers as Record<string, string> | undefined)?.Authorization
  );

/* useAcceptAnaDraft takes sectionRowId POSITIONALLY (number | null). Passing
   `{ sectionRowId: 11 }` typechecked as an error and, at runtime, put
   "[object Object]" in the request path — and both tests passed anyway, because
   neither looked at the URL. The header assertions below were real; the route
   they were sent to was not. Hence requestedUrls(), asserted in both. */
const SECTION_ROW_ID = 11;

describe('useAcceptAnaDraft', () => {
  it('sends the Bearer token the accept route requires', async () => {
    fetchMock.mockResolvedValue(ok({ ok: true }));
    const { result } = renderHook(() => useAcceptAnaDraft(SECTION_ROW_ID));
    await act(async () => {
      await result.current.accept({ refinedContent: 'x' });
    });
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(sentAuth()).toEqual(['Bearer test-token']);
    const headers = fetchMock.mock.calls[0][1].headers as Record<string, string>;
    expect(headers['x-organization-id']).toBe('7');
    expect(headers['Content-Type']).toBe('application/json');
    expect(requestedUrls()).toEqual([`/api/cerv2-sections/${SECTION_ROW_ID}/accept-ana-draft`]);
  });

  it('does not put the raw error envelope on screen', async () => {
    fetchMock.mockResolvedValue(unauthorized());
    const { result } = renderHook(() => useAcceptAnaDraft(SECTION_ROW_ID));
    await act(async () => {
      await result.current.accept();
    });
    await waitFor(() => expect(result.current.error).toBeTruthy());
    const shown = String(result.current.error);
    expect(shown).not.toContain('AUTH_001');
    expect(shown).not.toContain('{"error"');
    // The server's own sentence is kept.
    expect(shown).toContain('No authentication token provided');
    expect(requestedUrls()).toEqual([`/api/cerv2-sections/${SECTION_ROW_ID}/accept-ana-draft`]);
  });
});

describe('useProgramExtras', () => {
  const PROGRAM = 'aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee';

  it('sends the Bearer token on every one of its reads', async () => {
    fetchMock.mockResolvedValue(ok({ data: [] }));
    renderHook(() => useProgramExtras(PROGRAM));
    await waitFor(() => expect(fetchMock.mock.calls.length).toBeGreaterThan(1));
    expect(
      sentAuth().every(a => a === 'Bearer test-token'),
      JSON.stringify(sentAuth())
    ).toBe(true);
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
