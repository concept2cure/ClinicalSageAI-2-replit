import { apiRequest, serverMessage } from '@/lib/queryClient';

/** Local copy: `client/src/types/api.d.ts` ambiently redeclares
 *  '@/lib/queryClient' with a narrower surface, so the real module's exported
 *  types are not visible to TS through the alias. */
type ApiRequestMethod = 'GET' | 'POST' | 'PUT' | 'DELETE' | 'PATCH';

/** Structural check for `ApiRequestError`, for the same reason: the class is
 *  not importable through the shadowed alias, and a structural test is robust
 *  across duplicate module instances anyway. */
function isApiRequestError(err: unknown): err is { status: number; payload?: unknown } {
  return (
    typeof err === 'object' &&
    err !== null &&
    (err as { name?: unknown }).name === 'ApiRequestError' &&
    typeof (err as { status?: unknown }).status === 'number'
  );
}

/**
 * Normalized API result — the shape surfaces actually need.
 *
 * WHY THIS EXISTS. `apiRequest` THROWS `ApiRequestError` for every non-OK
 * status except 401; it only returns a `Response` on success (or a 401). So
 * the familiar-looking pattern
 *
 *     const res = await apiRequest(...);
 *     if (res.ok) { … } else { …handle the error status… }
 *
 * has an unreachable else-branch: a 4xx never reaches it, it unwinds to the
 * caller's catch, and every failure reads as "network error". That silently
 * broke status-dependent flows — most seriously the 428 ESIGN_REQUIRED that
 * is supposed to open the e-signature ceremony, and the 409 lock conflict.
 *
 * `apiCall` converts both outcomes into one value: `{ ok, status, body }`.
 * `status` is 0 only for a genuine transport failure, so callers can tell
 * "the server said no, and here is which no" from "the request never landed".
 */
export interface ApiResult<T = any> {
  ok: boolean;
  /** HTTP status, or 0 when the request never reached the server. */
  status: number;
  /** Parsed JSON body when there was one; null otherwise. */
  body: T | null;
  /** True only for transport failures (offline, DNS, CORS) — never for 4xx/5xx. */
  networkError: boolean;
}

/** Best-effort JSON parse of a successful response (204/empty → null). */
async function parseBody(res: Response): Promise<any> {
  if (res.status === 204) return null;
  return res.json().catch(() => null);
}

export async function apiCall<T = any>(
  method: ApiRequestMethod,
  url: string,
  body?: unknown,
): Promise<ApiResult<T>> {
  try {
    const res = await apiRequest(method, url, body);
    return { ok: res.ok, status: res.status, body: await parseBody(res), networkError: false };
  } catch (err) {
    if (isApiRequestError(err)) {
      // The server answered — surface its status and payload verbatim.
      return {
        ok: false,
        status: err.status,
        body: (err.payload ?? null) as T | null,
        networkError: false,
      };
    }
    return { ok: false, status: 0, body: null, networkError: true };
  }
}

/**
 * Readable message from a normalized result.
 *
 * The string/`message` half is delegated to `serverMessage`
 * (client/src/lib/queryClient.ts), which is the one place that decides whether
 * a given string is user copy at all. This used to begin
 *
 *     if (typeof e === 'string' && e.trim()) return e;
 *
 * so `{ error: 'ESIGN_REQUIRED' }` rendered as the sentence "ESIGN_REQUIRED",
 * and a driver message left in `error` rendered verbatim. Delegating also
 * means the internals filter (SQL, relation names, routes, env vars) applies
 * here without a second copy of it.
 *
 * The ZodIssue branch stays local: a field-level validation list is more useful
 * than any generic sentence, and it is a shape only this layer sees.
 *
 * `fallback` is the caller's own domain copy ("Could not create the task."),
 * which is why this uses `serverMessage` rather than `extractApiError` — the
 * latter would substitute a generic status sentence and throw the better one
 * away.
 */
export function apiErrorText(result: ApiResult, fallback: string): string {
  if (result.networkError) return `${fallback} (the request didn't reach the server)`;
  const e = (result.body as { error?: unknown } | null)?.error;
  if (Array.isArray(e)) {
    const msgs = e
      .map(issue =>
        issue && typeof issue === 'object' && 'message' in issue
          ? String((issue as { message: unknown }).message)
          : null,
      )
      .filter(Boolean);
    if (msgs.length) return msgs.join(' · ');
  }
  return serverMessage(result.body) ?? fallback;
}
