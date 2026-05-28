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

    fetch(url, {
      ...DEFAULT_INIT,
      ...opts.init,
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
