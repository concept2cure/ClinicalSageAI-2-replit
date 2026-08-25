/**
 * A route param must not be able to re-point the internal proxy.
 *
 * ── The defect this pins ──────────────────────────────────────────────────────
 * `GET /api/knowledge-base/context/:projectId` (mounted by
 * bootstrap/register-document-routes.ts) built its upstream path by
 * interpolation and then resolved it:
 *
 *     new URL(`/knowledge/project-context/${projectId}`, shadowUrl())
 *
 * `new URL` APPLIES `../` segments during resolution, and Express decodes `%2F`
 * inside a route param. So a request for
 *
 *     GET /api/knowledge-base/context/..%2F..%2Fadmin
 *
 * arrived with `projectId === '../../admin'` and was proxied to
 * `http://<shadow-service>/admin` — an authenticated proxy to ANY endpoint on
 * the internal service, not merely the one this route names. The service is not
 * otherwise reachable from outside, so this route was the way in.
 *
 * Two things had to be true at once, which is why it survived review: the
 * `/knowledge/...` prefix looks like it pins the destination (and it does defeat
 * a protocol-relative `//evil.com` host override — that part was fine), and a
 * single route param looks like it cannot contain a slash. `%2F` is why it can.
 *
 * The fix is `encodeURIComponent`, which keeps the value one inert path segment.
 *
 * @compliance 21 CFR Part 11 §11.10(d) — limiting system access to authorized
 *             individuals; an internal-service proxy is system access.
 */

import { describe, it, expect } from 'vitest';

const SHADOW = 'http://shadow-service:8001/';

/** The vulnerable construction, kept so the test can show what it did. */
const unsafeUpstream = (projectId: string) =>
  new URL(`/knowledge/project-context/${projectId}`, SHADOW).toString();

/** The shipped construction — mirrors routes/knowledge-base.ts. */
const safeUpstream = (projectId: string) =>
  new URL(`/knowledge/project-context/${encodeURIComponent(projectId)}`, SHADOW).toString();

/** What Express hands the handler for a `%2F`-encoded route param. */
const asExpressWouldDecode = (raw: string) => decodeURIComponent(raw);

describe('the vulnerable construction really was vulnerable', () => {
  // Asserted rather than asserted-about: a test that only checks the fix cannot
  // show the fix was needed, and this is the difference between a real finding
  // and a defensive tidy-up.
  it('escapes the /knowledge prefix entirely', () => {
    const projectId = asExpressWouldDecode('..%2F..%2Fadmin');
    expect(projectId).toBe('../../admin');
    expect(unsafeUpstream(projectId)).toBe('http://shadow-service:8001/admin');
  });

  it('reaches an arbitrary nested internal endpoint', () => {
    const projectId = asExpressWouldDecode('..%2f..%2finternal%2fkeys');
    expect(unsafeUpstream(projectId)).toBe('http://shadow-service:8001/internal/keys');
  });
});

describe('the shipped construction keeps the param inert', () => {
  it('refuses to traverse out of the project-context path', () => {
    const projectId = asExpressWouldDecode('..%2F..%2Fadmin');
    expect(safeUpstream(projectId)).toBe(
      'http://shadow-service:8001/knowledge/project-context/..%2F..%2Fadmin'
    );
  });

  it('still proxies an ordinary project id unchanged', () => {
    // The negative control. Encoding everything into oblivion would satisfy the
    // assertions above while breaking the endpoint for every real caller.
    expect(safeUpstream('proj-42')).toBe(
      'http://shadow-service:8001/knowledge/project-context/proj-42'
    );
  });

  it('still proxies a UUID project id unchanged', () => {
    const uuid = '11111111-2222-3333-4444-555555555555';
    expect(safeUpstream(uuid)).toBe(`http://shadow-service:8001/knowledge/project-context/${uuid}`);
  });

  it('never changes the host, whatever the param', () => {
    for (const raw of ['..%2F..%2Fadmin', '%2F%2Fevil.com', 'https%3A%2F%2Fevil.com', '..%2F..%2F..']) {
      const host = new URL(safeUpstream(asExpressWouldDecode(raw))).host;
      expect(host, `param ${raw} moved the proxy target`).toBe('shadow-service:8001');
    }
  });
});

describe('the shipped route uses the encoded form', () => {
  it('interpolates encodeURIComponent, not the bare param', async () => {
    // The helpers above reproduce the construction, so they cannot notice the
    // route drifting away from them. This reads the source.
    const fs = await import('node:fs');
    const url = await import('node:url');
    const path = await import('node:path');
    const here = path.dirname(url.fileURLToPath(import.meta.url));
    const src = fs.readFileSync(path.join(here, '..', 'knowledge-base.ts'), 'utf8');
    expect(src).toContain('`/knowledge/project-context/${encodeURIComponent(projectId)}`');
    expect(
      src.includes('`/knowledge/project-context/${projectId}`'),
      'the bare-interpolation form is back'
    ).toBe(false);
  });
});
