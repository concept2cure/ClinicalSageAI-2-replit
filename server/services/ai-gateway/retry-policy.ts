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
