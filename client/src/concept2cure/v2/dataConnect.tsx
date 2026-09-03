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
import { apiRequest, redactInternals } from '@/lib/queryClient';
import { I } from './icons';
import { getAuthToken } from '@/utils/authToken';

export function connected(): boolean {
  return Boolean(getAuthToken());
}

/**
 * Unwrap the project's canonical success envelope. The `ok(res, rows, meta)`
 * helper (`server/lib/api-response.ts`) returns `{ data: rows, meta }`, so most
 * list reads arrive as `{ data: [...] }` rather than a bare array; some legacy
 * routes still return the bare array. Return the inner list in both cases so
 * callers inspect the rows, not the envelope.
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

/* ═══════════════════════════════════════
   Fixture-free contract — the real-data standard.

   A surface renders REAL persisted data, an honest EMPTY state, or an honest
   ERROR state — never a fabricated stand-in presented as content. The
   `live ?? fixture` helpers this module used to export (liveGet / useLive /
   useLiveList / matchesShape / SampleTag) fell back to a codebase fixture
   behind a "Sample data" pill whenever the backend was unreachable or empty;
   their last consumers were migrated and they were deleted (ledger L72), so
   the ability to render a fixture as live no longer exists in this module.

     liveGetOrNull(path)  → { data: T | null, error?, status } — no fixture.
     useLiveData(path)    → object payload hook  { data, loading, error, empty }.
     useLiveRows(path)    → list payload hook     { rows, loading, error, empty }.
     <EmptyState .../>    → the honest "nothing here yet" / "couldn't load" panel.
   ═══════════════════════════════════════ */

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
 * The one surface a failure is reported on.
 *
 * ── What this replaces ───────────────────────────────────────────────────────
 * Four parallel implementations, each written where it was needed and none
 * aware of the others:
 *
 *   · `EmptyState tone="error"` (139 call sites) — a dashed panel whose `hint`
 *     was routinely handed the raw server string;
 *   · `RbmWriteError` (10 sites) — an inline "The change was not saved" banner,
 *     with a dismiss but no retry, styled from the RBM feature's own stylesheet;
 *   · `DataGate`'s error branch (33 sites) — a third rendering of the same idea;
 *   · the New Project wizard's outcome banner.
 *
 * They disagreed about everything that matters: whether a failure is announced
 * to a screen reader, whether it offers a way out, and whether the string it
 * renders is safe to show. UI standards §8 has named `<ErrorState retry={…}>`
 * as the required shape for a query failure since before any of them were
 * written; it simply did not exist.
 *
 * ── Why the redaction lives HERE ─────────────────────────────────────────────
 * `message` is passed through `redactInternals` on every render. The transport
 * layer already refuses to lift SQL, relation names, routes or env vars out of
 * an error envelope, so in the normal path this changes nothing — and that is
 * the point. Putting the filter in the component is what makes "no
 * client-rendered string contains an internal" a property of the UI rather than
 * a convention every future caller has to remember. A string that reached a
 * surface from a caught exception, a websocket frame or a field the envelope
 * reader never saw is caught here too.
 *
 * ── Two variants, one component ──────────────────────────────────────────────
 * `panel` — a READ failed and there is nothing to show in its place.
 * `inline` — a WRITE failed; the form is still on screen and the banner sits
 *            next to the control that produced it.
 * The distinction is spatial, not semantic: both are `role="alert"`, both are
 * announced assertively, and both must offer a recovery path.
 */
export function ErrorState({
  title,
  message,
  correlationId,
  retry,
  retryLabel = 'Try again',
  onDismiss,
  variant = 'panel',
  icon,
  busy = false,
  testId,
}: {
  /** What failed, in the user's terms. Always shown. */
  title: string;
  /** The server's own sentence, when it sent one. Redacted before render. */
  message?: React.ReactNode;
  /** The `X-Request-Id` the server echoed, for the user to quote to support. */
  correlationId?: string;
  /** UI standards §8: a failure always offers a way out. */
  retry?: () => void;
  retryLabel?: string;
  /** Present → the banner can be dismissed. Used for write failures. */
  onDismiss?: () => void;
  variant?: 'panel' | 'inline';
  icon?: React.ReactNode;
  busy?: boolean;
  testId?: string;
}) {
  /* A string is only rendered if it survives the internals filter; otherwise the
     title carries the message alone, which is always safe because the caller
     wrote it. */
  const safe =
    typeof message === 'string' ? redactInternals(message, '') : message ?? '';

  return (
    <div
      className={`c2c-error-state variant-${variant}`}
      role="alert"
      aria-live="assertive"
      aria-busy={busy || undefined}
      data-testid={testId}
    >
      <span className="c2c-error-ic" aria-hidden="true">{icon ?? I.alertTriangle}</span>
      <div className="c2c-error-body">
        <div className="c2c-error-t">{title}</div>
        {safe ? <div className="c2c-error-h">{safe}</div> : null}
        {correlationId ? (
          /* The support handle. It replaced the store name the API used to
             disclose, so it is the one identifier that makes an outage
             diagnosable without describing the schema to whoever is looking. */
          <div className="c2c-error-ref">
            Reference <code>{correlationId}</code>
          </div>
        ) : null}
      </div>
      {(retry || onDismiss) && (
        <div className="c2c-error-actions">
          {retry && (
            <button type="button" className="c2c-error-retry" onClick={retry} disabled={busy}>
              {busy ? 'Retrying…' : retryLabel}
            </button>
          )}
          {onDismiss && (
            <button
              type="button"
              className="c2c-error-dismiss"
              onClick={onDismiss}
              aria-label="Dismiss this message"
            >
              {I.close}
            </button>
          )}
        </div>
      )}
    </div>
  );
}

/**
 * The honest panel a surface shows when a real backend returns nothing, or
 * when the fetch failed — the replacement for a fixture-backed "Sample data"
 * card. `tone="error"` is for a failed load; the default idle tone is for a
 * genuine empty result.
 *
 * W0-5 — the four-part contract. A finished empty state answers, in order:
 *   what this is        → `title`
 *   why it is empty     → `hint`
 *   the ONE action that fixes it → `action` (a real CTA — navigate, create;
 *                          never an instruction the panel does not implement)
 *   the regulation it serves     → `regulation` (so a screen with nothing on
 *                          it still says what record it exists to keep)
 * `title` alone is a legal minimum for panels whose emptiness needs no fixing
 * (an audit trail with no events yet is complete, not deficient). What the
 * contract retires is the PASSIVE INSTRUCTION — "Select a program" as prose
 * with nothing to click. If the fix is an action, render the action.
 *
 * `tone="error"` DELEGATES to `<ErrorState>` rather than rendering its own
 * error panel. That is deliberate and is what converges the 139 existing error
 * call sites without touching any of them: they inherit the internals filter,
 * the assertive announcement and the correlation-id slot by construction. New
 * code should call `<ErrorState>` directly. A failure is not an empty state,
 * so `action` and `regulation` are deliberately NOT forwarded: the one action
 * on a failure is recovery (`retry`), and a "create" CTA over a failed read
 * would invite writing into a store that just refused to answer.
 */
export function EmptyState({
  title,
  hint,
  icon,
  tone = 'idle',
  busy = false,
  retry,
  /* No default here on purpose. An unspecified label falls through to whichever
     renderer takes it: the idle panel keeps 'Retry', and a failure gets
     ErrorState's 'Try again', so the recovery control reads the same on every
     failure in the product rather than differing by which component happened to
     render it. A caller that passes a label still wins. */
  retryLabel,
  action,
  regulation,
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
  /** The one action that resolves the emptiness — a real control, not prose.
   *  Distinct from `retry`, which recovers a failure. */
  action?: { label: string; onAct: () => void };
  /** The regulation or record this surface serves, stated factually
   *  (e.g. "Serves the CTD Module 3 record (ICH M4Q)"). */
  regulation?: string;
  testId?: string;
}) {
  /* A failure is not an empty state. It has one renderer, and this is not it —
     every `tone="error"` call site is served by ErrorState above, so all 139 of
     them get the internals filter and the correlation-id slot without being
     rewritten. `hint` maps to `message`, which is exactly the field that used to
     be handed a raw server string. */
  if (tone === 'error') {
    return (
      <ErrorState
        title={title}
        message={hint}
        icon={icon}
        retry={retry}
        {...(retryLabel ? { retryLabel } : {})}
        busy={busy}
        testId={testId}
      />
    );
  }

  /* UI standards §10 (non-negotiable): a loading or empty panel is a POLITE
     status — it must not interrupt. The assertive case now lives in ErrorState. */
  return (
    <div
      className="c2c-empty-state tone-idle"
      role="status"
      aria-live="polite"
      aria-busy={busy || undefined}
      data-testid={testId}
    >
      {/* `busy` used to set `aria-busy` and nothing else, so a panel standing in
          for content that is still loading looked identical to one standing in
          for content that does not exist — announced as busy to a screen reader
          and silent about it to everyone else. The pulse is on the icon rather
          than a separate spinner so the panel does not swap components under
          the user as it moves loading → empty → loading. */}
      {icon && (
        <span
          className={`c2c-empty-ic${busy ? ' c2c-empty-ic-busy' : ''}`}
          aria-hidden="true"
        >
          {icon}
        </span>
      )}
      <div className="c2c-empty-t">{title}</div>
      {hint && <div className="c2c-empty-h">{hint}</div>}
      {action && (
        <button type="button" className="c2c-empty-action" onClick={action.onAct}>
          {action.label}
        </button>
      )}
      {retry && (
        <button type="button" className="c2c-empty-retry" onClick={retry}>
          {retryLabel ?? 'Retry'}
        </button>
      )}
      {regulation && <div className="c2c-empty-reg">{regulation}</div>}
    </div>
  );
}
