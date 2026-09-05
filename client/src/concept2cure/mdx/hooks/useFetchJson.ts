/**
 * useFetchJson — single source of truth for cancellable + refreshable
 * JSON fetches across all MDX surfaces.
 *
 * The kit's hooks previously each re-implemented:
 *   - cancellation on unmount or url change
 *   - refresh-on-demand via tick counter
 *   - error → state mapping with `unknown` narrowing
 *   - non-OK status → thrown Error with HTTP status code
 *
 * Centralizing here means fixes (timeout, retry, telemetry, react-query
 * adoption later) land in one file. The kit's hooks become typed
 * adapters of `data` into surface shapes — fetch infrastructure is no
 * longer their concern.
 *
 * Usage patterns:
 *   const { data, loading, error, refresh } = useFetchJson<Payload>(url);
 *   const { data: x } = useFetchJson<X>(programId ? `/api/x/${programId}` : null);
 *
 * Passing `null` for `url` disables the fetch (idle state). Useful when
 * a parent value is unresolved — the hook returns `data: null` without
 * issuing a request, so consumers can render fixture fallbacks during
 * loading without a network round-trip.
 */

import { useCallback, useEffect, useState } from 'react';
import { getAuthToken, getOrgId } from '@/utils/authToken';

export interface UseFetchJsonResult<T> {
  /** Resolved JSON payload, or null while loading / on error / when url is null. */
  data: T | null;
  /** True from the moment a fetch starts until it resolves or errors. */
  loading: boolean;
  /** Error message when the fetch failed (HTTP non-2xx, network, parse). */
  error: string | null;
  /** Re-run the fetch from scratch — bumps an internal tick that the
   *  effect depends on. Stable across re-renders. */
  refresh: () => void;
}

export interface UseFetchJsonOptions {
  /** Forwarded to fetch(). Defaults to { credentials: 'include' } so
   *  cookie-based auth flows through unmodified. Override only when a
   *  specific endpoint needs different headers (e.g. JSON body with
   *  Content-Type, etc.). */
  init?: RequestInit;
}

const DEFAULT_INIT: RequestInit = { credentials: 'include' };

/**
 * Auth headers every /api call needs: the global gate accepts a Bearer JWT
 * only (server/auth.ts authMiddleware) and reads tenant scope from
 * x-organization-id — cookies alone 401. Exported so mutation hooks (raw
 * fetch) attach the exact same headers as the read path instead of each
 * re-deriving (or, historically, forgetting) them.
 */
export function buildAuthHeaders(): Record<string, string> {
  const authToken = getAuthToken();
  const orgId = getOrgId();
  const headers: Record<string, string> = {};
  if (authToken) headers.Authorization = `Bearer ${authToken}`;
  if (orgId) headers['x-organization-id'] = orgId;
  return headers;
}

/**
 * Why a mutation did not save. The role rule that decides `forbidden` lives on
 * the SERVER and only there (requireEditorAccess, in 510k-estar-routes.ts and
 * its siblings): re-stating "admin, owner, editor, super_admin" in the client
 * would be a second copy of a governed rule, free to drift from the one that
 * actually gates the write. So the surface does not predict the refusal — it
 * reports the one the server gave.
 *
 * `unavailable` is deliberately distinct from `rejected`. A request that never
 * reached a verdict is not a rejected one: telling an operator the server
 * "rejected the update" when the network dropped sends them looking for a
 * problem in their own data that is not there.
 */
export type SaveFailure = 'forbidden' | 'rejected' | 'unavailable';

/** Classify a non-OK mutation response. 403 is the role refusal; every other
 *  4xx is the server declining THIS content; 5xx reached no verdict. */
export function saveFailureFor(status: number): SaveFailure {
  if (status === 403) return 'forbidden';
  if (status >= 400 && status < 500) return 'rejected';
  return 'unavailable';
}

/**
 * The one sentence a surface shows after a failed save. Kept beside the
 * classifier so both save paths say the same thing about the same status, and
 * so neither invents a reason the server did not give.
 */
export function describeSaveFailure(failure: SaveFailure): string {
  if (failure === 'forbidden') return 'Not saved — your role cannot change these values.';
  if (failure === 'rejected') return 'Not saved — the server rejected the update.';
  return 'Not saved — the server did not answer. Nothing was changed.';
}

/**
 * Fetch a JSON payload of type `T` from `url`. Pass `null` to disable
 * the fetch (returns idle state). Re-runs whenever `url` changes or
 * `refresh()` is called. Cancels via AbortController on unmount or
 * URL change so concurrent renders don't race.
 *
 * @param url   The URL to fetch, or null to skip.
 * @param opts  Optional fetch options (init forwarded to fetch).
 */
export function useFetchJson<T>(
  url: string | null,
  opts: UseFetchJsonOptions = {},
): UseFetchJsonResult<T> {
  const [state, setState] = useState<{
    data: T | null;
    loading: boolean;
    error: string | null;
  }>({ data: null, loading: false, error: null });
  const [tick, setTick] = useState<number>(0);
  const refresh = useCallback(() => setTick((t) => t + 1), []);

  useEffect(() => {
    if (url === null) {
      setState({ data: null, loading: false, error: null });
      return;
    }

    const controller = new AbortController();
    let cancelled = false;
    setState((s) => ({ ...s, loading: true, error: null }));

    // Without these headers the c2c surfaces silently fall back to fixtures
    // and never show live data — see buildAuthHeaders.
    const authHeaders = buildAuthHeaders();

    fetch(url, {
      ...DEFAULT_INIT,
      ...opts.init,
      headers: { ...authHeaders, ...(opts.init?.headers as Record<string, string> | undefined) },
      signal: controller.signal,
    })
      .then(async (res) => {
        if (!res.ok) {
          const detail = await res.text().catch(() => '');
          throw new Error(
            `HTTP ${res.status}${detail ? `: ${detail.slice(0, 200)}` : ''}`,
          );
        }
        return (await res.json()) as T;
      })
      .then((data) => {
        if (cancelled) return;
        setState({ data, loading: false, error: null });
      })
      .catch((err: unknown) => {
        if (cancelled) return;
        /* AbortError is expected on cancellation — don't surface it. */
        if (err instanceof Error && err.name === 'AbortError') return;
        setState({
          data: null,
          loading: false,
          error: err instanceof Error ? err.message : 'Fetch failed',
        });
      });

    return () => {
      cancelled = true;
      controller.abort();
    };
    /* opts.init is deliberately omitted from deps — passing a literal
       object would trigger refetch every render. Callers that need
       option changes to force a refetch should call refresh(). */
    /* eslint-disable-next-line react-hooks/exhaustive-deps */
  }, [url, tick]);

  return { ...state, refresh };
}
