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
import { errorCodeOf } from '@/lib/apiErrorCode';

export interface UseFetchJsonResult<T> {
  /** Resolved JSON payload, or null while loading / on error / when url is null. */
  data: T | null;
  /** True from the moment a fetch starts until it resolves or errors. */
  loading: boolean;
  /** Error message when the fetch failed (HTTP non-2xx, network, parse). */
  error: string | null;
  /** What the failure was (readFailureFor), with the status and the server's
   *  code; null whenever `error` is. `error` keeps its `HTTP <status>: <body>`
   *  line for the callers that already read it. */
  failure: ReadFailure | null;
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

/** A UI read must finish or become retryable, including while reading its body.
 * This bounds reads, not saves, signatures, uploads, or model-generation jobs. */
export const JSON_READ_TIMEOUT_MS = 20_000;

export class ReadInterruptedError extends Error {
  constructor(readonly code: 'READ_TIMEOUT' | 'READ_CANCELLED') {
    super(code === 'READ_TIMEOUT'
      ? 'This is taking longer than expected. Try again to reload the latest data.'
      : 'Loading was interrupted. Try again.');
    this.name = 'ReadInterruptedError';
  }
}

/** Shared by the existing MDX/Quality hook and v2 liveGetOrNull. The deadline
 * covers transport AND body parsing. Settlement does not depend on the fetch
 * implementation honoring abort; late responses cannot become current data. */
export function withReadDeadline<T>(
  read: (signal: AbortSignal) => Promise<T>,
  signal?: AbortSignal,
): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const controller = new AbortController();
    let settled = false;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const cleanup = () => {
      if (timer !== undefined) clearTimeout(timer);
      signal?.removeEventListener('abort', cancel);
    };
    const interrupt = (code: 'READ_TIMEOUT' | 'READ_CANCELLED') => {
      if (settled) return;
      settled = true;
      cleanup();
      reject(new ReadInterruptedError(code));
      controller.abort();
    };
    const cancel = () => interrupt('READ_CANCELLED');
    if (signal?.aborted) { cancel(); return; }
    signal?.addEventListener('abort', cancel, { once: true });
    timer = setTimeout(() => interrupt('READ_TIMEOUT'), JSON_READ_TIMEOUT_MS);
    // An async wrapper also catches a synchronous transport/headers failure.
    void (async () => read(controller.signal))().then(value => {
      if (settled) return;
      settled = true;
      cleanup();
      resolve(value);
    }, error => {
      if (settled) return;
      settled = true;
      cleanup();
      reject(error);
    });
  });
}


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
 * Why a READ returned no data: the one classifier every screen asks (D2,
 * 2026-10-29; docs/evidence/D2-ONE-ANA/2026-10-29/refusal-not-failed-read/).
 *
 * A refusal is an answer, not an outage. The routes a project screen reads
 * refuse in distinct ways, and each is told apart by status and the server's
 * code, never by its wording:
 *   not-found        404: not in this organization (server/lib/admit-project.ts
 *                    answers "Project not found"; a record route, "<X> not found").
 *   unchecked        503 VERIFICATION_UNAVAILABLE: the ownership check could not
 *                    run (server/lib/verification-outcome.ts). Not an answer
 *                    about the project; trying again may get one.
 *   not-enabled      403 MODULE_NOT_LICENSED, the module gate
 *                    (server/middleware/moduleEntitlementGate.ts). It is sent for
 *                    a subscription without the feature and for one an
 *                    administrator switched off alike, so the words name neither.
 *   out-of-release   403 LAUNCH_SCOPE, the same gate's launch scope.
 *   no-organization  403 with a code that says the organization could not be
 *                    confirmed (ORGANIZATION_UNCONFIRMED below).
 *   role             any other 403: the role refusal (requireEditorAccess sends
 *                    `{ error: 'Insufficient permissions' }`, no code).
 *   signature        428: the act needs an electronic signature.
 *   failed           everything else, including 0 (no response), any other 5xx
 *                    and any other 4xx. Only this is a failed read.
 *
 * The IVD readiness board told the 403s apart first (a86ed04ed); its local copy
 * moved here. v2/projectScopedRead.tsx's project refusal is read through this.
 */
export type ReadRefusal =
  | 'not-found'
  | 'unchecked'
  | 'not-enabled'
  | 'out-of-release'
  | 'no-organization'
  | 'role'
  | 'signature';
export type ReadFailureKind = ReadRefusal | 'failed';

export interface ReadFailure {
  kind: ReadFailureKind;
  /** The HTTP status; 0 when no response arrived. */
  status: number;
  /** The server's machine-readable code, when it sent one. */
  code?: string;
}

/* The 403 codes a route sends when it could not confirm the caller's
   organization: human-factors (ORG_REQUIRED), the IVD read-model (IVD_NO_TENANT)
   and the tenant guards (NO_ORGANIZATION, TENANT_REQUIRED, TENANT_CONTEXT_REQUIRED). */
const ORGANIZATION_UNCONFIRMED: ReadonlySet<string> = new Set([
  'ORG_REQUIRED', 'IVD_NO_TENANT', 'NO_ORGANIZATION', 'TENANT_REQUIRED', 'TENANT_CONTEXT_REQUIRED',
]);

export function readFailureFor(status: number | undefined, code?: string | null): ReadFailureKind {
  if (status === 404) return 'not-found';
  if (status === 503 && code === 'VERIFICATION_UNAVAILABLE') return 'unchecked';
  if (status === 403) {
    if (code === 'MODULE_NOT_LICENSED') return 'not-enabled';
    if (code === 'LAUNCH_SCOPE') return 'out-of-release';
    if (code && ORGANIZATION_UNCONFIRMED.has(code)) return 'no-organization';
    return 'role';
  }
  if (status === 428) return 'signature';
  return 'failed';
}

/** The refusal a failed read came back with, or null for a genuine failure and
 *  for no failure. Takes a ReadFailure or a v2 read's `{ status, code }`; ask it
 *  of a read that failed, since it reads the status and code only. */
export function readRefusalOf(read: { status?: number; code?: string | null } | null | undefined): ReadRefusal | null {
  if (!read) return null;
  const kind = readFailureFor(read.status, read.code);
  return kind === 'failed' ? null : kind;
}

export interface ReadFailureWords {
  title: string;
  message: string;
  /** Offered only where trying again can change the answer. */
  retryable: boolean;
}

const sentence = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);

/**
 * The words a screen shows for a read that returned no data, kept beside the
 * classifier so every screen says the same thing about the same answer.
 *
 * @param what     What was not read, as a sentence names it: "the HFE/UE file".
 * @param subject  What was not found or not checked, when it is not the project:
 *                 "this Q-Sub", "this labeling document".
 */
export function describeReadFailure(
  kind: ReadFailureKind,
  what: string,
  { subject = 'this project' }: { subject?: string } = {},
): ReadFailureWords {
  const notRead = `so ${what} was not read.`;
  switch (kind) {
    case 'not-found':
      return { title: 'Not found in your organization', message: `${sentence(subject)} was not found in your organization, ${notRead}`, retryable: false };
    case 'unchecked':
      return {
        title: 'The ownership check was unavailable',
        message: `The check that ${subject} belongs to your organization was unavailable, ${notRead} This says nothing about ${subject}. Try again.`,
        retryable: true,
      };
    case 'not-enabled':
      return { title: 'Not enabled for your organization', message: `This feature is not enabled for your organization, ${notRead}`, retryable: false };
    case 'out-of-release':
      return { title: 'Not in this release', message: `This part of the product is not in this release, ${notRead}`, retryable: false };
    case 'no-organization':
      return { title: 'Your organization could not be confirmed', message: `Your organization could not be confirmed, ${notRead}`, retryable: false };
    case 'role':
      return { title: 'Your role cannot do this', message: `Your role cannot do this, ${notRead}`, retryable: false };
    case 'signature':
      return { title: 'Signature required', message: `This step needs your electronic signature, ${notRead}`, retryable: false };
    default:
      return { title: `${sentence(what)} could not be read`, message: `${sentence(what)} could not be read. Try again.`, retryable: true };
  }
}

/** A non-OK response, carrying what the classifier needs. */
class FetchJsonError extends Error {
  constructor(message: string, readonly status: number, readonly code: string | undefined) {
    super(message);
    this.name = 'FetchJsonError';
  }
}

/** The body's code, when the body is a JSON envelope that carries one. */
function bodyCode(detail: string): string | undefined {
  try {
    return errorCodeOf(JSON.parse(detail));
  } catch {
    return undefined;
  }
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
    failure: ReadFailure | null;
  }>({ data: null, loading: url !== null, error: null, failure: null });
  const [tick, setTick] = useState<number>(0);
  const refresh = useCallback(() => setTick((t) => t + 1), []);

  useEffect(() => {
    if (url === null) {
      setState({ data: null, loading: false, error: null, failure: null });
      return;
    }

    const controller = new AbortController();
    let cancelled = false;
    setState((s) => ({ ...s, loading: true, error: null, failure: null }));

    const callerSignal = opts.init?.signal;
    const cancelFromCaller = () => controller.abort();
    if (callerSignal?.aborted) controller.abort();
    else callerSignal?.addEventListener('abort', cancelFromCaller, { once: true });

    const read = async (signal: AbortSignal): Promise<T> => {
      const authHeaders = buildAuthHeaders();
      const res = await fetch(url, {
        ...DEFAULT_INIT,
        ...opts.init,
        headers: { ...authHeaders, ...(opts.init?.headers as Record<string, string> | undefined) },
        signal,
      });
      if (!res.ok) {
        const detail = await res.text().catch(() => '');
        /* The code is read from the whole body; the line keeps 200 characters. */
        throw new FetchJsonError(
          `HTTP ${res.status}${detail ? `: ${detail.slice(0, 200)}` : ''}`,
          res.status,
          bodyCode(detail),
        );
      }
      return (await res.json()) as T;
    };
    // Some legacy callers supply a non-GET init. Never impose a read deadline
    // on a write: its outcome may be unknown rather than "nothing changed".
    const pending = (opts.init?.method ?? 'GET').toUpperCase() === 'GET'
      ? withReadDeadline(read, controller.signal)
      : read(controller.signal);
    pending.then((data) => {
      if (cancelled) return;
      setState({ data, loading: false, error: null, failure: null });
    }).catch((err: unknown) => {
      if (cancelled) return;
      // Only cleanup cancellation is silent. An unexpected AbortError used to
      // return without clearing loading, leaving the screen stuck indefinitely.
      const interrupted = err instanceof ReadInterruptedError ? err
        : err instanceof Error && err.name === 'AbortError' ? new ReadInterruptedError('READ_CANCELLED') : null;
      const status = err instanceof FetchJsonError ? err.status : 0;
      const code = err instanceof FetchJsonError ? err.code : interrupted?.code;
      setState({
        data: null,
        loading: false,
        error: interrupted?.message ?? (err instanceof Error ? err.message : 'Fetch failed'),
        failure: { kind: readFailureFor(status, code), status, ...(code ? { code } : {}) },
      });
    });

    return () => {
      cancelled = true;
      callerSignal?.removeEventListener('abort', cancelFromCaller);
      controller.abort();
    };
    /* opts.init is deliberately omitted from deps — passing a literal
       object would trigger refetch every render. Callers that need
       option changes to force a refetch should call refresh(). */
    /* eslint-disable-next-line react-hooks/exhaustive-deps */
  }, [url, tick]);

  return { ...state, refresh };
}
