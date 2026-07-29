/**
 * Retry policy helpers for the AI gateway (dependency-free so they can be
 * unit-tested without importing the full gateway/provider stack).
 */

/**
 * Transient HTTP statuses worth retrying. 529 is Anthropic's "Overloaded";
 * 429 is rate-limit; 5xx are server-side transient. A defined status NOT in
 * this set (e.g. 400/401/403/404/422) is a hard error — fail fast, never retry.
 */
const RETRYABLE_STATUSES: ReadonlySet<number> = new Set([408, 409, 425, 429, 500, 502, 503, 504, 529]);

/** Overload/back-pressure statuses that self-heal — retry with longer backoff. */
const OVERLOAD_STATUSES: ReadonlySet<number> = new Set([429, 503, 529]);

/** Base backoff for overload retries (longer than the generic transient base). */
export const OVERLOAD_BASE_DELAY_MS = 2000;

/** Is this a transient HTTP status worth retrying? Non-numeric ⇒ treat as transient (e.g. a network error with no status). */
export function isRetryableHttpStatus(status: unknown): boolean {
  if (typeof status !== 'number') return true;
  return RETRYABLE_STATUSES.has(status);
}

/** Is this a hard, non-retryable client error (fail fast)? */
export function isHardClientError(status: unknown): boolean {
  return typeof status === 'number' && status >= 400 && status < 500 && !RETRYABLE_STATUSES.has(status);
}

/** Is this an overload / back-pressure status (429 / 503 / 529)? */
export function isOverloadStatus(status: unknown): boolean {
  return typeof status === 'number' && OVERLOAD_STATUSES.has(status);
}

/**
 * Per-request retry budget for the primary model attempt. Streaming requests
 * are NOT retried: a mid-stream failure has already delivered tokens to the
 * caller's onStream callback, and replaying the call would duplicate them.
 *
 * @returns number of retries (0 = a single attempt, no retry).
 */
export function gatewayRetryAttempts(isStreaming: boolean): number {
  return isStreaming ? 0 : 1;
}

/**
 * Retry budget specifically for overload (429/503/529) responses on the
 * non-streaming path. Overload is transient and self-heals, so it earns more
 * attempts (with longer backoff) than a generic transient failure. Streaming
 * still gets 0 — replaying mid-stream would duplicate tokens.
 */
export function overloadRetryAttempts(isStreaming: boolean): number {
  return isStreaming ? 0 : 3;
}
