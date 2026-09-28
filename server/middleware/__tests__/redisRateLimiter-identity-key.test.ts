/**
 * Redis-backed /api limiter (server/middleware/redisRateLimiter.ts) — the key
 * is the credential for authenticated traffic and the IP for the rest.
 *
 * ── The defect (VSR-001 F-5) ─────────────────────────────────────────────────
 * `createRedisRateLimiter()` is mounted on `/api` by startup/middleware.ts
 * BEFORE the auth boundary, so `req.userId` — the field its key generator
 * preferred — was never set when it ran. Every request was keyed by IP,
 * `api` bucket = 100/minute, and one browser session (or one office behind a
 * NAT) tripped it during ordinary use.
 *
 * The limiter cannot verify a token that early, but it can SEE one. A request
 * that presents a bearer credential is keyed by a hash of that credential
 * with the documented authenticated ceiling; a request that presents none
 * keeps the per-IP bucket at the per-IP ceiling. Because an unverified
 * credential could be minted per request to escape the IP bucket, credentialed
 * traffic is ALSO counted against a per-IP guard with a NAT-sized ceiling
 * (`maxRequestsPerIpAuthenticated`), so rotation buys an attacker nothing past
 * that guard. A verified identity (`req.userId`, when the limiter runs after
 * auth) still wins over the credential hash.
 *
 * No REDIS_URL → the in-memory path, which is what every local and CI run
 * uses; the key logic under test is shared by both stores. Small ceilings are
 * passed as rules so each case is fast; the platform numbers are asserted
 * separately.
 */
import { describe, it, expect } from 'vitest';
import express from 'express';
import request from 'supertest';

import { createRedisRateLimiter } from '../redisRateLimiter';
import { RATE_LIMITS } from '../../config/platform-limits';
import { resolveTrustProxy } from '../../config/trust-proxy';

const PER_IP = 5;
const PER_CREDENTIAL = 12;
const PER_IP_CREDENTIALED = 20;

let n = 0;
function app(opts: { verifiedUserId?: (req: express.Request) => number | null } = {}) {
  const a = express();
  a.set('trust proxy', resolveTrustProxy({ NODE_ENV: 'production' }).hops);
  if (opts.verifiedUserId) {
    a.use((req, _res, next) => {
      const id = opts.verifiedUserId!(req);
      if (id != null) (req as unknown as { userId: number }).userId = id;
      next();
    });
  }
  a.use(
    '/api',
    createRedisRateLimiter({
      keyPrefix: `identity-key-test-${process.pid}-${++n}:`,
      rules: {
        api: {
          windowMs: 60_000,
          maxRequests: PER_IP,
          maxRequestsAuthenticated: PER_CREDENTIAL,
          maxRequestsPerIpAuthenticated: PER_IP_CREDENTIALED,
          message: 'slow down',
        },
      } as never,
    }),
  );
  a.get('/api/things', (_req, res) => res.json({ ok: true }));
  return a;
}

async function burst(a: express.Express, ip: string, count: number, headers: Record<string, string> = {}) {
  const statuses: number[] = [];
  for (let i = 0; i < count; i++) {
    const r = await request(a).get('/api/things').set('X-Forwarded-For', ip).set(headers);
    statuses.push(r.status);
  }
  return statuses;
}

const bearer = (t: string) => ({ Authorization: `Bearer ${t}` });

describe('redisRateLimiter — credential key for authenticated traffic (F-5)', () => {
  it('platform numbers: api and concept2cure carry an authenticated ceiling above the per-IP one, and a per-IP guard above that', () => {
    for (const cat of ['api', 'concept2cure'] as const) {
      const rule = RATE_LIMITS[cat] as unknown as {
        maxRequests: number;
        maxRequestsAuthenticated?: number;
        maxRequestsPerIpAuthenticated?: number;
      };
      expect(rule.maxRequestsAuthenticated).toBeGreaterThan(rule.maxRequests);
      expect(rule.maxRequestsPerIpAuthenticated).toBeGreaterThan(rule.maxRequestsAuthenticated as number);
    }
    // Auth stays IP-only by nature: a login carries no bearer credential.
    expect((RATE_LIMITS.auth as { maxRequestsAuthenticated?: number }).maxRequestsAuthenticated).toBeUndefined();
  });

  it('no credential: the per-IP bucket trips at exactly the per-IP ceiling', async () => {
    const s = await burst(app(), '10.1.0.1', PER_IP + 1);
    expect(s.slice(0, PER_IP).every((x) => x === 200)).toBe(true);
    expect(s[PER_IP]).toBe(429);
  });

  it('bearer credential: not tripped at the per-IP ceiling, tripped at the credential ceiling', async () => {
    const s = await burst(app(), '10.1.0.2', PER_CREDENTIAL + 1, bearer('token-A'));
    // Pre-fix: s[PER_IP] was 429 — the request was keyed by IP regardless.
    expect(s[PER_IP]).toBe(200);
    expect(s.slice(0, PER_CREDENTIAL).every((x) => x === 200)).toBe(true);
    expect(s[PER_CREDENTIAL]).toBe(429);
  });

  it('two credentials behind one address have their own buckets; anonymous traffic from it keeps its own', async () => {
    const a = app();
    const NAT = '10.1.0.3';
    const first = await burst(a, NAT, PER_CREDENTIAL, bearer('token-B'));
    expect(first.every((x) => x === 200)).toBe(true);
    expect((await burst(a, NAT, 1, bearer('token-B')))[0]).toBe(429);
    expect((await burst(a, NAT, 1, bearer('token-C')))[0]).toBe(200);
    const anon = await burst(a, NAT, PER_IP + 1);
    expect(anon[PER_IP]).toBe(429);
  });

  it('rotating credentials from one address is bounded by the per-IP credentialed guard', async () => {
    const a = app();
    const statuses: number[] = [];
    for (let i = 0; i < PER_IP_CREDENTIALED + 1; i++) {
      statuses.push((await burst(a, '10.1.0.4', 1, bearer(`minted-${i}`)))[0]);
    }
    expect(statuses.slice(0, PER_IP_CREDENTIALED).every((x) => x === 200)).toBe(true);
    expect(statuses[PER_IP_CREDENTIALED]).toBe(429);
  });

  it('a verified identity wins over the credential: two tokens for one user share the user bucket', async () => {
    const a = app({ verifiedUserId: () => 42 });
    const s1 = await burst(a, '10.1.0.5', PER_CREDENTIAL - 1, bearer('session-1'));
    expect(s1.every((x) => x === 200)).toBe(true);
    const s2 = await burst(a, '10.1.0.5', 2, bearer('session-2'));
    expect(s2).toEqual([200, 429]);
  });

  it('the headers name the ceiling that applied', async () => {
    const a = app();
    const anon = await request(a).get('/api/things').set('X-Forwarded-For', '10.1.0.6');
    expect(Number(anon.headers['x-ratelimit-limit'])).toBe(PER_IP);
    const cred = await request(a).get('/api/things').set('X-Forwarded-For', '10.1.0.7').set(bearer('token-D'));
    expect(Number(cred.headers['x-ratelimit-limit'])).toBe(PER_CREDENTIAL);
  });
});
