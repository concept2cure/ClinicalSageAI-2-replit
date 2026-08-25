/**
 * Contract: the dev CORS/CSRF origin allowlist accepts the loopback IP.
 *
 * The dev server + E2E runner (scripts/run-e2e-smoke.mjs, playwright.config)
 * serve and drive the app at http://127.0.0.1:5000. A browser then sends
 * `Origin: http://127.0.0.1:5000` on every module/asset fetch. The dev allowlist
 * historically included only `http://localhost:5000`, so the CSRF origin check
 * 403'd the Vite client assets and the SPA rendered a BLANK page — silently, on
 * any local dev or E2E run that used the loopback IP instead of `localhost`.
 *
 * This pins the loopback origins into the DEV-only allowlist so `127.0.0.1` and
 * `localhost` are treated identically, while an unlisted origin stays rejected.
 * Runs with NODE_ENV=test (i.e. NODE_ENV !== 'production'), so the dev branch of
 * the allowlist is the one under test — the same branch a dev server uses.
 */

import { describe, it, expect, vi } from 'vitest';
import { corsMiddleware } from '../enterprise-security';

/** Invoke corsMiddleware with an optional Origin; capture the CORS header + status. */
function corsFor(origin?: string): { allowOrigin: string | undefined; status: number; nextCalled: boolean } {
  const req = { headers: origin ? { origin } : {}, method: 'GET' } as unknown as Parameters<typeof corsMiddleware>[0];
  const headers: Record<string, string> = {};
  let status = 0;
  const res = {
    setHeader: (k: string, v: string) => {
      headers[k] = v;
    },
    getHeader: (k: string) => headers[k],
    status: (code: number) => {
      status = code;
      return res;
    },
    json: () => res,
  } as unknown as Parameters<typeof corsMiddleware>[1];
  const next = vi.fn();
  corsMiddleware(req, res, next as unknown as Parameters<typeof corsMiddleware>[2]);
  return { allowOrigin: headers['Access-Control-Allow-Origin'], status, nextCalled: next.mock.calls.length > 0 };
}

describe('dev CORS/CSRF origin allowlist — loopback IP parity (blank-page fix)', () => {
  it('allows http://127.0.0.1:5000 (the dev/E2E runner origin that used to 403)', () => {
    const { allowOrigin, nextCalled } = corsFor('http://127.0.0.1:5000');
    expect(allowOrigin).toBe('http://127.0.0.1:5000');
    expect(nextCalled).toBe(true);
  });

  it('allows http://127.0.0.1:3000 (Vite alt dev port)', () => {
    expect(corsFor('http://127.0.0.1:3000').allowOrigin).toBe('http://127.0.0.1:3000');
  });

  it('still allows http://localhost:5000 (unchanged)', () => {
    expect(corsFor('http://localhost:5000').allowOrigin).toBe('http://localhost:5000');
  });

  it('does NOT allow an unlisted origin (the guard still bites)', () => {
    const { allowOrigin, status } = corsFor('http://evil.example');
    expect(allowOrigin).toBeUndefined();
    expect(status).toBe(403); // CORS_ORIGIN_BLOCKED
  });
});
