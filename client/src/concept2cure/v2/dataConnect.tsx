/**
 * ui-v2 data-connection layer — the `live ?? fixture` contract on the
 * project's ONE fetch convention.
 *
 * The kit's app/data-connect.jsx (window.C2C_API / useLive / SampleTag) is a
 * faithful mirror of client/src/lib/queryClient.ts + utils/authToken.ts; on
 * port it collapses onto them (INSTALL_TARGET_AUDIT §4 — do not introduce a
 * second fetch convention). What this module adds is only the honesty
 * envelope:
 *
 *   liveGet(path, fixture)  → { data, sample, error }  — never throws; the
 *                             fixture comes back with sample:true on any
 *                             failure (network, 401, non-OK).
 *   useLive(path, fixture)  → the same as a hook, with `loading`.
 *   <SampleTag sample/>     → the visible "Sample data" / "Live" pill every
 *                             fixture-backed surface must carry (GAP RULE:
 *                             never present fabricated data as live).
 *   connected()             → a session token exists (mirrors the kit's
 *                             C2C_API.connected()).
 */
import React from 'react';
import { apiRequest } from '@/lib/queryClient';
import { getAuthToken } from '@/utils/authToken';

export interface LiveResult<T> {
  data: T;
  sample: boolean;
  error?: string;
}

export function connected(): boolean {
  return Boolean(getAuthToken());
}

export async function liveGet<T>(path: string, fixture: T): Promise<LiveResult<T>> {
  try {
    const res = await apiRequest('GET', path);
    if (!res.ok) {
      return { data: fixture, sample: true, error: `HTTP ${res.status} ${path}` };
    }
    if (res.status === 204) {
      return { data: fixture, sample: true, error: 'empty response' };
    }
    const data = (await res.json()) as T;
    return { data, sample: false };
  } catch (e) {
    return { data: fixture, sample: true, error: e instanceof Error ? e.message : String(e) };
  }
}

export interface UseLiveState<T> extends LiveResult<T> {
  loading: boolean;
}

/** live ?? fixture with loading + sample flag (kit window.useLive). */
export function useLive<T>(
  path: string | null,
  fixture: T,
  deps: React.DependencyList = [path]
): UseLiveState<T> {
  const [state, setState] = React.useState<UseLiveState<T>>({
    data: fixture,
    loading: Boolean(path),
    sample: true,
  });
  React.useEffect(() => {
    let cancelled = false;
    if (!path) {
      setState({ data: fixture, loading: false, sample: true });
      return undefined;
    }
    setState((s) => ({ ...s, loading: true }));
    liveGet<T>(path, fixture).then((res) => {
      if (!cancelled) setState({ ...res, loading: false });
    });
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps);
  return state;
}

/**
 * Structural fail-closed guard: is `live` shaped like `fixture` (a list whose
 * rows carry the fixture's keys)? Used to decide whether a 200 response is
 * actually the contract the surface renders. A 200 with a *different* shape
 * (e.g. a backend that returns DB columns the surface doesn't display) is
 * rejected, so the surface keeps its honest fixture instead of rendering
 * malformed "live" data. Empty live list with a non-empty fixture is also
 * rejected (nothing to show → keep the sample so the surface isn't blank).
 */
/**
 * Unwrap the project's canonical success envelope. The `ok(res, rows, meta)`
 * helper (`server/lib/api-response.ts`) returns `{ data: rows, meta }`, so most
 * list reads arrive as `{ data: [...] }` rather than a bare array; some legacy
 * routes still return the bare array. Return the inner list in both cases so
 * `matchesShape` inspects the rows, not the envelope.
 */
export function unwrapList(payload: unknown): unknown {
  if (Array.isArray(payload)) return payload;
  if (
    payload &&
    typeof payload === 'object' &&
    Array.isArray((payload as { data?: unknown }).data)
  ) {
    return (payload as { data: unknown }).data;
  }
  return payload;
}

export function matchesShape<T>(live: unknown, fixture: T[]): live is T[] {
  if (!Array.isArray(live)) return false;
  if (fixture.length === 0) return live.length > 0;
  if (live.length === 0) return false;
  const wantKeys = Object.keys(fixture[0] as Record<string, unknown>).filter(
    (k) => !k.startsWith('_'),
  );
  const row = live[0];
  if (typeof row !== 'object' || row === null) return false;
  return wantKeys.every((k) => k in (row as Record<string, unknown>));
}

/**
 * live ?? fixture for a list surface, fail-closed on shape. Attempts the live
 * GET; uses the response only when it structurally matches the fixture
 * (`matchesShape`), otherwise returns the fixture with `sample:true`. This is
 * the one call a fixture-backed surface adds to become genuinely
 * go-live-capable without any risk of rendering degraded data before its
 * backend returns the full display contract.
 */
export function useLiveList<T>(
  path: string | null,
  fixture: T[],
  deps: React.DependencyList = [path],
): UseLiveState<T[]> {
  const raw = useLive<unknown>(path, fixture, deps);
  if (raw.loading) return { data: fixture, loading: true, sample: true };
  const list = unwrapList(raw.data);
  if (!raw.sample && matchesShape<T>(list, fixture)) {
    return { data: list, loading: false, sample: false };
  }
  return { data: fixture, loading: false, sample: true, error: raw.error };
}

/** The provenance pill every live-backed surface shows (styles in app-v2.css). */
export function SampleTag({ sample }: { sample: boolean }) {
  return (
    <span
      className={`c2c-sample-tag${sample ? '' : ' is-live'}`}
      title={
        sample
          ? 'Backend not reachable — showing sample data from the codebase fixture shape'
          : 'Live data from the concept2cure-v2 backend'
      }
    >
      {sample ? 'Sample data' : 'Live'}
    </span>
  );
}

/* ═══════════════════════════════════════════════════════════════════════
   Fixture-free contract — the real-data standard.

   The `live ?? fixture` helpers above (liveGet / useLive / useLiveList /
   SampleTag) fall back to a codebase fixture with a "Sample data" pill
   whenever the backend is unreachable or empty. For a regulated product
   that convention is being retired: a surface must render REAL persisted
   data, an honest EMPTY state, or an honest ERROR state — never a
   fabricated stand-in presented as content. Surfaces are migrated onto
   these helpers one at a time; the legacy helpers stay until the last
   consumer is gone.

     liveGetOrNull(path)  → { data: T | null, error?, status } — no fixture.
     useLiveData(path)    → object payload hook  { data, loading, error, empty }.
     useLiveRows(path)    → list payload hook     { rows, loading, error, empty }.
     <EmptyState .../>    → the honest "nothing here yet" / "couldn't load" panel.
   ═══════════════════════════════════════════════════════════════════════ */

/**
 * Unwrap the canonical success envelope for a single payload (object or list).
 * `ok(res, data, meta)` returns `{ data, meta }`; some hand-rolled routes
 * return `{ success, data, total }`. Both hold the payload under `.data`. A
 * body that merely happens to carry a `data` field as part of its real shape
 * (multiple keys, no envelope markers) is left untouched, so a genuine
 * `{ program, tree, comments }` payload is never mis-unwrapped.
 */
function unwrapEnvelope(body: unknown): unknown {
  if (body && typeof body === 'object' && !Array.isArray(body)) {
    const obj = body as Record<string, unknown>;
    const looksLikeEnvelope =
      'data' in obj &&
      ('success' in obj ||
        'meta' in obj ||
        'total' in obj ||
        Object.keys(obj).length === 1);
    if (looksLikeEnvelope) return obj.data;
  }
  return body;
}

export interface DataResult<T> {
  data: T | null;
  error?: string;
  /** HTTP status; 0 on a network/parse failure before a response arrived. */
  status: number;
}

/**
 * Fixture-free single GET. Unwraps the `{ data }` success envelope, returns
 * `null` (no fixture) on any non-OK / 204 / network failure. Never throws.
 */
export async function liveGetOrNull<T>(path: string): Promise<DataResult<T>> {
  try {
    const res = await apiRequest('GET', path);
    if (!res.ok) {
      return { data: null, error: `HTTP ${res.status} ${path}`, status: res.status };
    }
    if (res.status === 204) {
      return { data: null, status: 204 };
    }
    const body = (await res.json()) as unknown;
    return { data: unwrapEnvelope(body) as T, status: res.status };
  } catch (e) {
    return { data: null, error: e instanceof Error ? e.message : String(e), status: 0 };
  }
}

export interface DataState<T> {
  data: T | null;
  loading: boolean;
  error?: string;
  /** Loaded successfully, but the backend genuinely has nothing to show. */
  empty: boolean;
}

/**
 * Fixture-free object-payload hook. `empty` is true only when the fetch
 * succeeded and the payload is absent/blank — distinct from `error`, so a
 * surface can render an honest "nothing here yet" separately from a
 * "couldn't reach the backend" state, never a fabricated stand-in.
 */
export function useLiveData<T>(
  path: string | null,
  deps: React.DependencyList = [path],
): DataState<T> {
  const [state, setState] = React.useState<DataState<T>>({
    data: null,
    loading: Boolean(path),
    empty: false,
  });
  React.useEffect(() => {
    let cancelled = false;
    if (!path) {
      setState({ data: null, loading: false, empty: false });
      return undefined;
    }
    setState((s) => ({ ...s, loading: true }));
    liveGetOrNull<T>(path).then((r) => {
      if (cancelled) return;
      const isEmpty =
        !r.error &&
        (r.data == null || (Array.isArray(r.data) && r.data.length === 0));
      setState({ data: r.data, loading: false, error: r.error, empty: isEmpty });
    });
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps);
  return state;
}

export interface ListState<T> {
  rows: T[];
  loading: boolean;
  error?: string;
  /** Loaded successfully with zero rows — the honest empty state. */
  empty: boolean;
}

/**
 * Fixture-free list hook. `rows` is always a real array (empty on error too,
 * so `.map` is safe without a fixture), `empty` is set only on a successful
 * zero-row load, and `error` is set only on a fetch failure — the three
 * states a list surface renders instead of a "Sample data" fixture.
 */
export function useLiveRows<T>(
  path: string | null,
  deps: React.DependencyList = [path],
): ListState<T> {
  const st = useLiveData<T[]>(path, deps);
  const rows = Array.isArray(st.data) ? st.data : [];
  return {
    rows,
    loading: st.loading,
    error: st.error,
    empty: !st.loading && !st.error && rows.length === 0,
  };
}

/**
 * The honest panel a surface shows when a real backend returns nothing, or
 * when the fetch failed — the replacement for a fixture-backed "Sample data"
 * card. `tone="error"` is for a failed load; the default idle tone is for a
 * genuine empty result.
 */
export function EmptyState({
  title,
  hint,
  icon,
  tone = 'idle',
}: {
  title: string;
  hint?: React.ReactNode;
  icon?: React.ReactNode;
  tone?: 'idle' | 'error';
}) {
  return (
    <div className={`c2c-empty-state tone-${tone}`}>
      {icon && <span className="c2c-empty-ic">{icon}</span>}
      <div className="c2c-empty-t">{title}</div>
      {hint && <div className="c2c-empty-h">{hint}</div>}
    </div>
  );
}
