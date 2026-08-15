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
 * Turn a thrown request failure into a DataResult that keeps its HTTP status.
 *
 * `apiRequest` THROWS `ApiRequestError` for every non-OK status except 401, so
 * the `if (!res.ok)` branches below are reached only by a 401 and EVERY other
 * failing status arrives here instead. Reporting `status: 0` for all of them
 * collapsed "you are not allowed to do this" (403), "that is gone" (404) and
 * "your input was rejected" (400) into "the network is down" — erasing exactly
 * the distinction ApiRequestError's own header says it exists to preserve
 * ("consumers that must distinguish forbidden, unavailable, validation, and
 * empty states without parsing error strings").
 *
 * The status is read STRUCTURALLY rather than through `instanceof
 * ApiRequestError`, for two reasons that both end in this helper throwing:
 *
 *   1. Several suites mock '@/lib/queryClient' with a factory that exports only
 *      `apiRequest`. Importing the class here would bind it to `undefined` in
 *      those runs, and `e instanceof undefined` throws — inside the very catch
 *      whose entire contract is that it never throws. The surface then hangs on
 *      "loading" instead of rendering its honest error. (Observed: it took the
 *      Apps catalog's offline test down.)
 *   2. `instanceof` is false across two instances of the same module, which a
 *      bundler split or a duplicated dependency can produce silently.
 *
 * `error` carries the server's own wording where there is any, so a surface can
 * show the API's message rather than inventing one. `apiRequest` has already
 * reduced the envelope via `extractApiError` (client/src/lib/queryClient.ts),
 * which is what makes this field SAFE to render: an enum-shaped `error` token
 * and any infrastructure text are replaced with human copy there, so nothing
 * reaching this string is a code, a relation name or a driver message.
 *
 * That order used to be reversed — `{ error }` was preferred over `{ message }`
 * — so every surface reading this field displayed the literal token
 * `PENDING_STORE` whenever a store was unprovisioned.
 *
 * 0 stays reserved for a genuine pre-response failure: DNS, offline, abort, or
 * a body that would not parse.
 */
function failureFrom(e: unknown, path: string): DataResult<never> {
  const status = (e as { status?: unknown } | null)?.status;
  if (e instanceof Error && typeof status === 'number' && status > 0) {
    return { data: null, error: e.message || `HTTP ${status} ${path}`, status };
  }
  return { data: null, error: e instanceof Error ? e.message : String(e), status: 0 };
}

/* ── Shape guards ──────────────────────────────────────────────────────────────
 *
 * `liveGetOrNull<T>` casts the parsed body to `T`. That cast is a promise the
 * network cannot keep: a 200 is only evidence that *something* came back.
 *
 * The failure this exists for is specific and was observed. A route that returns
 * `{ data: [] }` where the surface expects `{ program, tree }` unwraps to a bare
 * `[]`, and `[]` is TRUTHY — so it walks straight past every `if (!data) return`
 * guard the surface already wrote, satisfies no field it then reads, and the
 * first `data.tree.map(...)` throws inside `useMemo` during render. React unwinds
 * the subtree, `SurfaceBoundary` catches it, and the user is told "this surface
 * didn't finish loading" — when the honest, already-written answer was "we
 * couldn't load this".
 *
 * One envelope change, one proxy returning a login page with status 200, one
 * feature flag flipping a route's return type, and a surface goes from "empty
 * state" to "crashed" with no code change of its own.
 *
 * Passing a guard converts that crash into the error branch the surface already
 * has. The cost is one argument at the call site and zero new UI, because every
 * one of these surfaces already renders `<EmptyState tone="error">` when the
 * fetch fails — this just makes "the fetch returned nonsense" reach the same
 * branch as "the fetch failed", which is what the user needed to know either way.
 *
 * Guards are OPT-IN. A blanket rule cannot work here: `useLiveRows` legitimately
 * calls `useLiveData<T[]>`, so "an array is the wrong shape" is true for some
 * callers and false for others. Only the call site knows.
 */

/** A runtime check that a 200 body is the shape the caller asked for. */
export type ShapeGuard<T> = (value: unknown) => value is T;

/**
 * The payload is a non-array object carrying every one of these keys.
 *
 * Keys are checked with `in`, not truthiness — a present-but-null field is a
 * legitimate payload ("no program selected yet"), and rejecting it would turn a
 * real empty state into a fabricated error.
 */
export function hasKeys<T>(...keys: string[]): ShapeGuard<T> {
  return (value: unknown): value is T => {
    if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
    return keys.every((k) => k in (value as Record<string, unknown>));
  };
}

/**
 * The payload is an array, and — if non-empty — its first row carries every one
 * of these keys.
 *
 * An EMPTY array passes: zero rows is the honest empty state, not a shape
 * failure. Checking only the first row mirrors `matchesShape` above; it is a
 * contract check, not validation of every record.
 */
export function isRowsWith<T>(...keys: string[]): ShapeGuard<T[]> {
  return (value: unknown): value is T[] => {
    if (!Array.isArray(value)) return false;
    if (value.length === 0) return true;
    const row = value[0];
    if (!row || typeof row !== 'object') return false;
    return keys.every((k) => k in (row as Record<string, unknown>));
  };
}

/** The message a shape rejection produces. Exported so tests assert on one string. */
export const shapeMismatch = (path: string) => `unexpected response shape for ${path}`;

/**
 * Fixture-free single GET. Unwraps the `{ data }` success envelope, returns
 * `null` (no fixture) on any non-OK / 204 / network failure. Never throws.
 *
 * With `guard`, a 200 whose body is not the expected shape is reported as an
 * error rather than handed to the caller as a lie about `T` — see the block
 * comment above. A null/absent payload is NOT guarded: that is the honest empty
 * state, and a guard must never convert "nothing here yet" into "broken".
 */
export async function liveGetOrNull<T>(
  path: string,
  guard?: ShapeGuard<T>,
): Promise<DataResult<T>> {
  try {
    const res = await apiRequest('GET', path);
    if (!res.ok) {
      return { data: null, error: `HTTP ${res.status} ${path}`, status: res.status };
    }
    if (res.status === 204) {
      return { data: null, status: 204 };
    }
    const body = (await res.json()) as unknown;
    const payload = unwrapEnvelope(body);
    if (guard && payload != null && !guard(payload)) {
      return { data: null, error: shapeMismatch(path), status: res.status };
    }
    return { data: payload as T, status: res.status };
  } catch (e) {
    return failureFrom(e, path);
  }
}

/**
 * Fixture-free mutation. Same contract as liveGetOrNull, for POST/PATCH/PUT/DELETE.
 *
 * ── Why this exists ───────────────────────────────────────────────────────────
 * Six ui-v2 surfaces reached for `window.C2C_API.post(...)` — the design kit's
 * global bridge. That global is assigned NOWHERE in this repository: 12 reads,
 * zero writes, not in index.html, not via a vite define. So every action guarded
 * by `const api = (window as any).C2C_API; if (!api) return;` silently did
 * nothing, and the surfaces fell back to local computation or fixtures without
 * telling anyone. Roughly ten user-facing actions across AnaMemory, AnaVerbs,
 * EctdCoauthor, LicensingSurface, PdevInd and ReportEngine.
 *
 * Providing the global would have been the smaller diff and the wrong fix. This
 * module's own header states the rule: the kit's window.C2C_API "collapses onto"
 * apiRequest + getAuthToken on port — "do not introduce a second fetch
 * convention" (INSTALL_TARGET_AUDIT §4). The surfaces still reading it are
 * un-ported leftovers, not consumers of a missing feature. EctdCoauthor shows
 * both forms in one file: its compliance read was ported to liveGetOrNull while
 * its validate action still called the ghost.
 *
 * So: one helper on the sanctioned convention, and the call sites move to it.
 * Returning null rather than a fixture is deliberate — a mutation that failed
 * must not look like one that succeeded.
 */
export async function liveMutateOrNull<T>(
  method: 'POST' | 'PATCH' | 'PUT' | 'DELETE',
  path: string,
  body?: unknown,
): Promise<DataResult<T>> {
  try {
    const res = await apiRequest(method, path, body);
    if (!res.ok) {
      return { data: null, error: `HTTP ${res.status} ${path}`, status: res.status };
    }
    if (res.status === 204) {
      return { data: null, status: 204 };
    }
    const parsed = (await res.json()) as unknown;
    return { data: unwrapEnvelope(parsed) as T, status: res.status };
  } catch (e) {
    return failureFrom(e, path);
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
  guard?: ShapeGuard<T>,
): DataState<T> {
  const [state, setState] = React.useState<DataState<T>>({
    data: null,
    loading: Boolean(path),
    empty: false,
  });
  // `guard` is deliberately not a dependency. It is read through a ref so an
  // inline arrow at the call site cannot re-trigger the fetch on every render,
  // while a guard that genuinely changes still applies to the next load.
  const guardRef = React.useRef(guard);
  guardRef.current = guard;
  React.useEffect(() => {
    let cancelled = false;
    if (!path) {
      setState({ data: null, loading: false, empty: false });
      return undefined;
    }
    setState((s) => ({ ...s, loading: true }));
    liveGetOrNull<T>(path, guardRef.current).then((r) => {
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
/**
 * The one empty array every non-array payload resolves to.
 *
 * `rows` is the natural dependency for the effect a list surface writes to seed
 * its working set from the live file — `[live.loading, live.error, live.rows]`,
 * the shape used by the CMC registers, the Module 3 program-records chain,
 * specifications and batch records. That effect is correct only if `rows`
 * changes identity exactly when the fetch re-resolves.
 *
 * Returning a fresh `[]` literal broke that on the honest-empty path
 * specifically: when the payload IS an array the reference comes from state and
 * is stable, but a 204 or a `{ success: true, data: null }` success — both of
 * which this module's contract explicitly allows — produced a BRAND NEW array
 * every render. The consumer's effect then fired on every render, set state,
 * caused a render, and fired again. Measured at 220 effect runs where one was
 * correct (see liveRowsStability.test.tsx). Nothing throws, so it presents as a
 * mysteriously slow tab rather than as the unbounded loop it is.
 *
 * Frozen so a caller that mutates its rows in place fails loudly here instead of
 * silently poisoning the empty state of every other surface.
 */
const NO_ROWS: readonly never[] = Object.freeze([]);

export function useLiveRows<T>(
  path: string | null,
  deps: React.DependencyList = [path],
  guard?: ShapeGuard<T[]>,
): ListState<T> {
  const st = useLiveData<T[]>(path, deps, guard);
  // Without a guard a non-array 200 is silently flattened to zero rows, which
  // renders as "nothing here yet" — an empty state that is not true. Pass
  // `isRowsWith(...)` to have that reported as the error it is.
  const rows = Array.isArray(st.data) ? st.data : (NO_ROWS as unknown as T[]);
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
  busy = false,
  retry,
  retryLabel = 'Retry',
  testId,
}: {
  title: string;
  hint?: React.ReactNode;
  icon?: React.ReactNode;
  tone?: 'idle' | 'error';
  /** The panel is standing in for content that is still loading. */
  busy?: boolean;
  /** A recovery path for a failed load. UI standards §8: errors always have one. */
  retry?: () => void;
  retryLabel?: string;
  testId?: string;
}) {
  /* UI standards §10 (non-negotiable): a failed load is announced assertively as
     an alert; a loading or empty panel is a polite status. Without these the
     three states this component exists to distinguish are indistinguishable to
     a screen reader — it silently swaps text in a plain div. */
  const isError = tone === 'error';
  return (
    <div
      className={`c2c-empty-state tone-${tone}`}
      role={isError ? 'alert' : 'status'}
      aria-live={isError ? 'assertive' : 'polite'}
      aria-busy={busy || undefined}
      data-testid={testId}
    >
      {icon && <span className="c2c-empty-ic" aria-hidden="true">{icon}</span>}
      <div className="c2c-empty-t">{title}</div>
      {hint && <div className="c2c-empty-h">{hint}</div>}
      {retry && (
        <button type="button" className="c2c-empty-retry" onClick={retry}>
          {retryLabel}
        </button>
      )}
    </div>
  );
}
