/**
 * Retry policy helpers for the AI gateway (dependency-free so they can be
 * unit-tested without importing the full gateway/provider stack).
 */

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
 * HTTP 529 — Anthropic's "Overloaded" response. The model is temporarily at
 * capacity; the request itself is fine. It is transient and safe to retry.
 */
export const OVERLOADED_STATUS = 529;

/**
 * Pull an HTTP status off a thrown provider/SDK error. Providers surface it as
 * `.status` (Anthropic/OpenAI SDKs) or `.statusCode`; returns undefined when the
 * error carries no recognizable status.
 */
export function extractErrorStatus(err: unknown): number | undefined {
  if (!err || typeof err !== 'object') return undefined;
  const e = err as { status?: unknown; statusCode?: unknown };
  const raw = typeof e.status === 'number' ? e.status : e.statusCode;
  return typeof raw === 'number' ? raw : undefined;
}

/**
 * Transient = a capacity/availability blip the gateway should ride out with
 * retry + fallback, NOT a provider-health failure that should bench the model.
 * Covers rate-limit (429), gateway/upstream errors (500/502/503/504), and the
 * Anthropic "Overloaded" 529. Notably this is what keeps a brief 529 storm from
 * tripping the circuit breaker and routing every request away from the primary.
 */
export function isTransientStatus(status: number | undefined): boolean {
  if (status === undefined) return false;
  return (
    status === 429 ||
    status === 500 ||
    status === 502 ||
    status === 503 ||
    status === 504 ||
    status === OVERLOADED_STATUS
  );
}

