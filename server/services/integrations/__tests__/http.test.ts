/**
 * fetchWithRetry — unit tests. Backoff is a no-op under the test runner, so
 * these run instantly while still exercising the retry counting.
 */
import { describe, it, expect, afterEach, vi } from 'vitest';
import { fetchWithRetry } from '../http';

function res(status: number, headers: Record<string, string> = {}): any {
  return {
    ok: status >= 200 && status < 300,
    status,
    headers: { get: (k: string) => headers[k.toLowerCase()] ?? null },
  };
}

describe('fetchWithRetry', () => {
  const realFetch = global.fetch;
  afterEach(() => {
    global.fetch = realFetch;
    vi.restoreAllMocks();
  });

  it('returns immediately on success (one call)', async () => {
    const f = vi.fn().mockResolvedValue(res(200));
    global.fetch = f as any;
    const r = await fetchWithRetry('https://x');
    expect(r.status).toBe(200);
    expect(f).toHaveBeenCalledTimes(1);
  });

  it('retries a transient 503 then succeeds', async () => {
    const f = vi.fn().mockResolvedValueOnce(res(503)).mockResolvedValueOnce(res(200));
    global.fetch = f as any;
    const r = await fetchWithRetry('https://x', {}, { retries: 2 });
    expect(r.status).toBe(200);
    expect(f).toHaveBeenCalledTimes(2);
  });

  it('returns the last retryable response after exhausting retries (not throw)', async () => {
    const f = vi.fn().mockResolvedValue(res(503));
    global.fetch = f as any;
    const r = await fetchWithRetry('https://x', {}, { retries: 2 });
    expect(r.status).toBe(503);
    expect(f).toHaveBeenCalledTimes(3); // initial + 2 retries
  });

  it('does not retry a non-retryable status (404)', async () => {
    const f = vi.fn().mockResolvedValue(res(404));
    global.fetch = f as any;
    const r = await fetchWithRetry('https://x', {}, { retries: 2 });
    expect(r.status).toBe(404);
    expect(f).toHaveBeenCalledTimes(1);
  });

  it('retries network errors, then throws if persistent', async () => {
    const f = vi.fn().mockRejectedValue(new Error('ECONNRESET'));
    global.fetch = f as any;
    await expect(fetchWithRetry('https://x', {}, { retries: 1 })).rejects.toThrow(/ECONNRESET/);
    expect(f).toHaveBeenCalledTimes(2);
  });

  it('recovers when a network error is followed by success', async () => {
    const f = vi.fn().mockRejectedValueOnce(new Error('blip')).mockResolvedValueOnce(res(200));
    global.fetch = f as any;
    const r = await fetchWithRetry('https://x', {}, { retries: 2 });
    expect(r.status).toBe(200);
    expect(f).toHaveBeenCalledTimes(2);
  });
});
