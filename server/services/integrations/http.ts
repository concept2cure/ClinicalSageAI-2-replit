/**
 * Resilient HTTP for integration clients.
 *
 * `fetchWithRetry` wraps global fetch with a request timeout and automatic
 * retry-with-backoff on transient failures (network errors and retryable status
 * codes: 408/429/500/502/503/504), honoring Retry-After. It returns the final
 * `Response` — it does NOT throw on a non-ok status — so each client keeps its
 * own status handling (e.g. openFDA's 404-as-empty). Backoff is skipped under
 * the test runner so suites stay fast.
 *
 * @module server/services/integrations/http
 */

const RETRYABLE_STATUS = new Set([408, 429, 500, 502, 503, 504]);
const DEFAULT_RETRIES = 2;
const DEFAULT_BASE_DELAY_MS = 300;
const DEFAULT_TIMEOUT_MS = 10_000;

export interface FetchRetryOptions {
  timeoutMs?: number;
  retries?: number;
  baseDelayMs?: number;
}

function isTestEnv(): boolean {
  return !!process.env.VITEST || process.env.NODE_ENV === 'test';
}

function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

/** Retry-After header (seconds) → ms, or null if absent/invalid. */
function retryAfterMs(res: Response): number | null {
  const raw = res.headers?.get?.('retry-after');
  if (!raw) return null;
  const secs = Number(raw);
  return Number.isFinite(secs) && secs >= 0 ? secs * 1000 : null;
}

/**
 * Fetch with timeout + transient-failure retry. Returns the final Response
 * (success, non-retryable, or last retryable attempt). Throws only when a
 * network error persists across all attempts.
 */
export async function fetchWithRetry(
  url: string,
  init: Parameters<typeof fetch>[1] = {},
  opts: FetchRetryOptions = {}
): Promise<Response> {
  const retries = Math.max(0, opts.retries ?? DEFAULT_RETRIES);
  const baseDelay = isTestEnv() ? 0 : Math.max(0, opts.baseDelayMs ?? DEFAULT_BASE_DELAY_MS);
  const timeoutMs = opts.timeoutMs ?? DEFAULT_TIMEOUT_MS;

  let lastError: unknown;
  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      const res = await fetch(url, { ...init, signal: AbortSignal.timeout(timeoutMs) });
      if (res.ok || !RETRYABLE_STATUS.has(res.status) || attempt === retries) {
        return res;
      }
      await sleep(retryAfterMs(res) ?? baseDelay * 2 ** attempt);
    } catch (err) {
      lastError = err;
      if (attempt === retries) throw err;
      await sleep(baseDelay * 2 ** attempt);
    }
  }
  // Unreachable (loop returns/throws), but satisfies the type checker.
  throw lastError ?? new Error('fetchWithRetry: exhausted retries');
}
