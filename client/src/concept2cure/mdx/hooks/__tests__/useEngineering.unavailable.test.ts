/**
 * @vitest-environment jsdom
 */
/**
 * A panel that could not be READ is not a panel with nothing in it.
 *
 * server/routes/mdx-engineering.ts runs each panel independently so one bad
 * table cannot blank the surface — right, and the reason the route survives a
 * half-migrated tenant. But it returned `[]` for EVERY failure, not just for
 * 42P01, so a permission denial or an RLS fail-closed arrived at the surface
 * indistinguishable from "this tenant has recorded no hazards": an empty risk
 * file, `openRisks: 0`, `dhfCompletion: 0`, with a server-side log line as the
 * only trace.
 *
 * That is the exact collapse ../../lib/dataState.ts exists to make
 * unrepresentable — its five cases are irreducible precisely so a failed read
 * and an empty result cannot paint the same pixels. The route now names the
 * panels whose read failed in `meta.unavailable`, and this hook turns each of
 * them into `status: 'error'` so DataGate renders "Could not load <label>"
 * instead of an empty state.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderHook, waitFor } from '@testing-library/react';
import { useEngineering } from '../useEngineering';

vi.mock('@/utils/authToken', () => ({
  getAuthToken: () => 'test-token',
  getOrgId: () => '7',
}));

let fetchMock: ReturnType<typeof vi.fn>;
beforeEach(() => {
  fetchMock = vi.fn();
  vi.stubGlobal('fetch', fetchMock);
});
afterEach(() => vi.unstubAllGlobals());

const PROGRAM = 'aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee';

const EMPTY_DATA = {
  summary: { dhfCompletion: 0, openEcrs: 0, openRisks: 0, openIssues: 0, riskLastUpdated: null },
  dhf: [], trace: [], risks: [], ecrs: [], issues: [], documents: [],
};

function respond(meta: Record<string, unknown>) {
  fetchMock.mockResolvedValue({
    ok: true,
    status: 200,
    json: async () => ({ data: EMPTY_DATA, meta }),
    text: async () => '',
  });
}

describe('useEngineering — an unreadable panel', () => {
  it('reports a failed panel as error, not as empty', async () => {
    respond({ unavailable: ['risks'] });
    const { result } = renderHook(() => useEngineering(PROGRAM));
    await waitFor(() => expect(result.current.loading).toBe(false));

    expect(result.current.risks.status).toBe('error');
    expect(result.current.risks.status === 'error' && result.current.risks.message)
      .toMatch(/not a finding that there are none/i);
  });

  it('leaves the panels that DID read as honest empties', async () => {
    // Per-panel independence is the reason the route swallows at all; one
    // unreadable panel must not turn the other six into errors.
    respond({ unavailable: ['risks'] });
    const { result } = renderHook(() => useEngineering(PROGRAM));
    await waitFor(() => expect(result.current.loading).toBe(false));

    expect(result.current.trace.status).toBe('empty');
    expect(result.current.ecrs.status).toBe('empty');
    expect(result.current.issues.status).toBe('empty');
  });

  it('does not invent an error when every panel read cleanly', async () => {
    // Over-correction guard: zero rows is still a legitimate answer.
    respond({ unavailable: [] });
    const { result } = renderHook(() => useEngineering(PROGRAM));
    await waitFor(() => expect(result.current.loading).toBe(false));

    expect(result.current.risks.status).toBe('empty');
    expect(result.current.summary.status).toBe('ready');
  });

  it('tolerates a route that sends no unavailable list at all', async () => {
    // The field is additive; an older deployment omits it entirely.
    respond({ scopes: {} });
    const { result } = renderHook(() => useEngineering(PROGRAM));
    await waitFor(() => expect(result.current.loading).toBe(false));

    expect(result.current.risks.status).toBe('empty');
  });

  it('marks the derived summary as error when the route says so', async () => {
    // summary counts the very arrays that failed, so a 0 there is not a count.
    respond({ unavailable: ['risks', 'summary'] });
    const { result } = renderHook(() => useEngineering(PROGRAM));
    await waitFor(() => expect(result.current.loading).toBe(false));

    expect(result.current.summary.status).toBe('error');
  });
});
