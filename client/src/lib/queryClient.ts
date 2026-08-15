import { QueryClient, type QueryFunction } from '@tanstack/react-query';
import { getAuthToken, getOrgId } from '@/utils/authToken';

export type ApiRequestMethod = 'GET' | 'POST' | 'PUT' | 'DELETE' | 'PATCH';

/** Preserves HTTP semantics for consumers that must distinguish forbidden,
 * unavailable, validation, and empty states without parsing error strings. */
export class ApiRequestError extends Error {
  constructor(
    message: string,
    public readonly status: number,
    public readonly payload?: unknown,
    /** The server's machine-readable error code, when it sent one. Consumers
     *  that need to branch on the failure read THIS, never `message`. */
    public readonly code?: string,
    /** The request id the server echoed in `X-Request-Id`, so a user can quote
     *  something support can find the log line by. */
    public readonly correlationId?: string,
  ) {
    super(message);
    this.name = 'ApiRequestError';
  }
}

/**
 * An enum-shaped error token — `PENDING_STORE`, `FORBIDDEN`, `QUOTA_EXCEEDED`.
 *
 * This distinction is the whole point of the extraction below. The API answers
 * failures in two different shapes that both put a string in `error`:
 *
 *   { error: 'PENDING_STORE', message: 'The store is not provisioned…' }
 *   { error: 'name is required' }        // send400(res, msg) — a real sentence
 *
 * The first `error` is a CODE and must never be shown to a user; the second is
 * the validation message and must be. Matching SCREAMING_SNAKE_CASE separates
 * them without needing the server to change shape: a code has no spaces and no
 * lowercase, a sentence has both.
 */
const ERROR_CODE_RE = /^[A-Z][A-Z0-9]*(?:_[A-Z0-9]+)*$/;

function isErrorCode(value: unknown): value is string {
  return typeof value === 'string' && value.length <= 64 && ERROR_CODE_RE.test(value);
}

/**
 * Markers of a message that came from the infrastructure rather than from a
 * person, and must never be rendered.
 *
 * Guardrail: no SQL, table name, file path, env var or API route may appear in
 * client-facing UI of a regulated product. That is an information-disclosure
 * finding, not a cosmetic one.
 *
 * The server should not be sending these at all — and where it does, that is
 * its own defect to fix. This is the last line before a screen, and every
 * pattern below was observed reaching one during UAT: the device-workstream
 * surface rendered a full Drizzle `Failed query: select "id", …` as its page
 * body, and the software-lifecycle panel rendered `relation
 * "software_lifecycle_items" does not exist`.
 *
 * The distinction that makes this safe to apply broadly: a driver message and a
 * validation message are not hard to tell apart. "name is required" contains
 * none of these; `select "id"` contains one by construction.
 */
const INTERNAL_MARKERS: RegExp[] = [
  /\brelation\s+"/i, // relation "x" does not exist
  /\b(?:column|table|schema|constraint)\s+"[^"]+"\s+(?:of|does not|already)/i,
  /failed query/i,
  /\b(?:select|insert\s+into|update|delete\s+from)\s+["'`]/i, // SQL with a quoted identifier
  /\bsyntax error at or near\b/i,
  /\bduplicate key value violates\b/i,
  /\b(?:pg_[a-z_]{3,}|information_schema)\b/,
  /\/api\//, // an API route
  /\b[A-Z][A-Z0-9]*_(?:URL|KEY|SECRET|TOKEN|DIR|PATH|PASSWORD|DSN)\b/, // env var
  /(?:^|\s)\/(?:home|usr|var|opt|app|etc)\//, // absolute file path
  /\.(?:ts|tsx|js|mjs|cjs):\d+/, // source location
  /\bnode_modules\b/,
  /^\s*at\s+\S+\s+\(/m, // a stack frame
  /\b(?:ECONNREFUSED|ETIMEDOUT|ENOTFOUND|EAI_AGAIN|ECONNRESET)\b/,
];

function looksInternal(value: string): boolean {
  return INTERNAL_MARKERS.some((re) => re.test(value));
}

/**
 * What to show a user when the server sent no usable copy of its own.
 *
 * Deliberately says nothing about routes, stores or exceptions — guardrail: no
 * API route, table name, file path or env var may reach client-facing UI. The
 * status is included because "try again" is the wrong advice for a 403 and the
 * right advice for a 503, and the number is the only thing that separates them
 * once the internals are stripped.
 */
function fallbackMessage(status: number): string {
  // Each names the cause AND the next step. A 403 is the one case where "your
  // administrator" is the right actor — org admins really can grant access
  // (services/c2c/program-access.ts) — so it is said here and nowhere else.
  if (status === 403) {
    return 'You do not have permission for this action. Contact your administrator if you need access.';
  }
  if (status === 404) return "Couldn't find that item. It may have been moved or removed.";
  if (status === 409) return 'That change conflicts with the current state. Reload and try again.';
  if (status === 413) return 'That file is too large to upload. Reduce the file size and try again.';
  if (status === 429) return 'Too many requests. Wait a moment and try again.';
  if (status === 503) return 'That service is temporarily unavailable. Try again shortly.';
  if (status >= 500) return 'The server could not complete this request. Try again.';
  return "Couldn't complete that request. Try again.";
}

/**
 * Lift the most useful HUMAN sentence out of an error envelope, plus the
 * machine code beside it.
 *
 * ── The defect this replaces ─────────────────────────────────────────────────
 * This was one expression:
 *
 *   errorPayload?.error?.message || errorPayload?.error || errorPayload?.message
 *
 * Against `{ error: 'PENDING_STORE', message: 'The … store is not provisioned…' }`
 * the second term wins — `error` is a non-empty string — so the third is never
 * reached and the caller is handed the literal token `PENDING_STORE`. Because
 * `apiRequest` THROWS, every surface downstream of it inherited that string:
 * the New Project wizard rendered it in its error banner, and dataConnect's
 * `failureFrom` put it in the `error` field every `useLiveData` consumer shows.
 * A regulated product was displaying an internal enum as its user-facing copy.
 *
 * Order is now: nested message, top-level message, a non-code `error` string,
 * then a generic sentence keyed to the status. The code is returned separately
 * so consumers that legitimately branch on `PENDING_STORE` still can.
 */
export function extractApiError(
  payload: unknown,
  status: number,
): { message: string; code?: string } {
  return { message: serverMessage(payload) ?? fallbackMessage(status), code: errorCodeOf(payload) };
}

/**
 * The server's machine-readable error code, when it sent one.
 *
 * Separate from the message so a consumer can branch on `PENDING_STORE` or
 * `ESIGN_REQUIRED` without parsing display copy — copy is expected to change,
 * codes are not.
 */
export function errorCodeOf(payload: unknown): string | undefined {
  const p = (payload ?? {}) as Record<string, any>;
  const err = p.error;
  return (
    (typeof err?.code === 'string' ? err.code : undefined) ??
    (isErrorCode(err) ? err : undefined) ??
    (isErrorCode(p.code) ? p.code : undefined)
  );
}

/**
 * The human sentence the SERVER actually sent, or null if it sent none worth
 * showing.
 *
 * Split out from `extractApiError` because the two callers need opposite
 * things at the end of the chain. A surface with no domain context wants a
 * generic sentence keyed to the status (`extractApiError`); a surface that has
 * one — "Could not create the task." — wants ITS OWN fallback rather than
 * "Couldn't complete that request." Returning null lets each choose, and keeps
 * one implementation of the part that is easy to get wrong: deciding whether a
 * given string is copy at all.
 */
export function serverMessage(payload: unknown): string | null {
  const p = (payload ?? {}) as Record<string, any>;
  const err = p.error;

  /** A candidate is usable only if it is a real string that is neither an enum
   *  token nor infrastructure text. */
  const usable = (v: unknown): string | null =>
    typeof v === 'string' && v.trim() && !isErrorCode(v) && !looksInternal(v) ? v : null;

  return (
    usable(err?.message) ??
    usable(p.message) ??
    // `{ error: CODE, detail: '<sentence>' }` is the c2c actions envelope — the
    // governed-action refusals (separation of duties, a stale precondition, a
    // blocked dispatch gate) put their reason in `detail`. Without this the
    // refusal degrades to a generic "you do not have permission", which is the
    // one thing a reviewer must NOT be told when the real answer is "you may
    // not sign your own work".
    usable(p.detail) ??
    // A bare `error` string is copy only when it passes the same two filters.
    usable(err)
  );
}

interface GetQueryFnOptions {
  on401?: 'throw' | 'returnNull';
}

function getCachedAuthToken(): string | null {
  return getAuthToken();
}

function getCachedOrgId(): string {
  return getOrgId();
}

/** Force-refresh the cached org/auth values (call after login or org switch). */
export function invalidateApiCache() {
  // No-op — auth state is now managed by authToken module.
  // Kept for backward compatibility with callers.
}

export const apiRequest = async (
  method: ApiRequestMethod,
  url: string,
  body?: any,
  customHeaders?: Record<string, string>
): Promise<Response> => {
  const organizationId = getCachedOrgId();
  const authToken = getCachedAuthToken();

  const headers: HeadersInit = {
    'Content-Type': 'application/json',
    'x-organization-id': organizationId,
    ...(authToken ? { Authorization: `Bearer ${authToken}` } : {}),
    ...customHeaders,
  };

  const options: RequestInit = {
    method,
    headers,
    credentials: 'include',
  };

  if (body && method !== 'GET') {
    options.body = JSON.stringify(body);
  }

  const response = await fetch(url, options);

  if (!response.ok && response.status !== 401) {
    // Echoed by the server's requestId middleware and exposed to the browser via
    // Access-Control-Expose-Headers, so it is readable cross-origin.
    const correlationId = response.headers.get('X-Request-Id') ?? undefined;
    const contentType = response.headers.get('Content-Type') || '';
    if (contentType.includes('application/json')) {
      const errorPayload = await response.json().catch(() => ({}));
      const { message, code } = extractApiError(errorPayload, response.status);
      throw new ApiRequestError(message, response.status, errorPayload, code, correlationId);
    }
    // A non-JSON body is an upstream page (a proxy error, an HTML login
    // redirect, a stack trace) — never something to show a user. It is kept on
    // `payload` for diagnostics and replaced with a generic sentence.
    const errorText = await response.text();
    throw new ApiRequestError(
      fallbackMessage(response.status),
      response.status,
      errorText,
      undefined,
      correlationId,
    );
  }

  return response;
};

/**
 * Parse a fetch Response body as JSON. Returns null for empty/204 responses.
 * Used by service-layer wrappers (api-connector) that work with raw Responses.
 */
export const extractData = async (response: Response): Promise<any> => {
  if (response.status === 204 || response.headers.get('Content-Length') === '0') {
    return null;
  }
  return await response.json();
};

export const getQueryFn = (options: GetQueryFnOptions = {}): QueryFunction => {
  return async ({ queryKey }) => {
    const url = String(queryKey[0]);
    const response = await apiRequest('GET', url, undefined, {
      'x-organization-id': getCachedOrgId(),
    });

    if (response.status === 401) {
      if (options.on401 === 'returnNull') {
        return null;
      }
      throw new Error('Unauthorized');
    }

    // For empty responses or 204 No Content
    if (response.status === 204 || response.headers.get('Content-Length') === '0') {
      return null;
    }

    return response.json();
  };
};

export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      retry: 1,
      staleTime: 1000 * 60 * 5, // 5 minutes
      gcTime: 1000 * 60 * 10, // Keep unused data for 10 minutes before GC
      refetchOnWindowFocus: false, // Avoid unnecessary refetches on tab switch
      refetchOnReconnect: true, // Refetch after network recovery
      queryFn: getQueryFn() as any,
    },
    mutations: {
      retry: 0, // Don't auto-retry mutations
    },
  },
});

export default queryClient;
