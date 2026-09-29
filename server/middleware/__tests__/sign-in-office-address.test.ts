/**
 * An office behind one address can sign in, in production (D6, 2026-09-29).
 *
 * Two limiters stand in front of every /api/auth request before the sign-in
 * routes' own (auth-sign-in-limits.test.ts):
 *
 *   - the Redis /api limiter (startup/middleware.ts), whose `auth` bucket held
 *     20 requests per client address per 15 minutes in production, counting
 *     every request — a sign-in is two, so ten colleagues a quarter hour;
 *   - the enterprise /api/auth limiter (enterprise-security.ts), failures
 *     only, at 5 per address per 15 minutes in production — five mistyped
 *     passwords, or five expired sessions answering 401, refused everyone at
 *     that address.
 *
 * While the load balancer trusts one hop, "one address" is a CloudFront edge,
 * shared by every customer it serves (enterprise-auth-limiter-key.test.ts).
 *
 * Both are imported here with NODE_ENV=production, because their production
 * numbers are chosen at import time, and mounted as production mounts them.
 * The sign-in routes are stubs that answer as the real ones do (200 for a
 * right password or code, 401 for a wrong one): the routes' own limits are
 * tested through the real router.
 */
import express from 'express';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';

type Limiters = {
  createRedisRateLimiter: typeof import('../redisRateLimiter').createRedisRateLimiter;
  rateLimiters: typeof import('../enterprise-security').rateLimiters;
  SIGN_IN_LIMITS: typeof import('../../config/platform-limits').SIGN_IN_LIMITS;
};
let L: Limiters;

beforeAll(async () => {
  vi.resetModules();
  vi.stubEnv('NODE_ENV', 'production');
  const [redis, enterprise, limits] = await Promise.all([
    import('../redisRateLimiter'),
    import('../enterprise-security'),
    import('../../config/platform-limits'),
  ]);
  L = { createRedisRateLimiter: redis.createRedisRateLimiter, rateLimiters: enterprise.rateLimiters, SIGN_IN_LIMITS: limits.SIGN_IN_LIMITS };
});
afterAll(() => {
  vi.unstubAllEnvs();
  vi.resetModules();
});

/** Production's order: the Redis limiter on /api, then the enterprise one on /api/auth, then the routes. */
let nextAddress = 10;
function productionFrontDoor() {
  const app = express();
  app.set('trust proxy', 1);
  app.use(express.json());
  app.use('/api', L.createRedisRateLimiter());
  app.use('/api/auth', L.rateLimiters.auth);
  app.post('/api/auth/login', (req, res) =>
    req.body?.password === 'right-password' ? res.json({ requiresMfa: true }) : res.status(401).json({ error: 'Invalid credentials' }),
  );
  app.post('/api/auth/mfa/verify', (req, res) =>
    req.body?.code === '123456' ? res.json({ accessToken: 't' }) : res.status(401).json({ error: 'Invalid code' }),
  );
  const address = `203.0.113.${nextAddress++}`;
  const post = (path: string, body: object) => request(app).post(path).set('X-Forwarded-For', address).send(body);
  return {
    login: (email: string, password: string) => post('/api/auth/login', { email, password }),
    verify: (code: string) => post('/api/auth/mfa/verify', { challengeId: 'c', code }),
  };
}

describe('production, one office address', () => {
  it('a hundred colleagues sign in and twenty of them mistype a password first — nobody is refused', async () => {
    const office = productionFrontDoor();
    const refused: string[] = [];
    for (let i = 1; i <= 100; i++) {
      if (i % 5 === 0) {
        const typo = await office.login(`colleague${i}@acme.test`, 'wrong-password');
        if (typo.status === 429) refused.push(`colleague ${i}: the typo`);
      }
      const l = await office.login(`colleague${i}@acme.test`, 'right-password');
      const v = await office.verify('123456');
      if (l.status === 429) refused.push(`colleague ${i}: password step`);
      if (v.status === 429) refused.push(`colleague ${i}: second-factor step`);
    }
    expect(refused.slice(0, 5), `${refused.length} refusals at one office address`).toEqual([]);
  });

  it('spraying from one address is still stopped, at the per-address failure ceiling', async () => {
    const sprayer = productionFrontDoor();
    const max = L.SIGN_IN_LIMITS.failuresPerIp.max;
    const statuses: number[] = [];
    for (let i = 0; i <= max; i++) statuses.push((await sprayer.login(`victim${i}@acme.test`, 'guess')).status);
    expect(statuses.slice(0, max).every((s) => s === 401)).toBe(true);
    expect(statuses[max], 'the address kept guessing past its failure ceiling').toBe(429);
    // Another address is untouched.
    expect((await productionFrontDoor().login('someone@acme.test', 'right-password')).status).toBe(200);
  });

  it('the production numbers are the ones this change sets', () => {
    expect(L.SIGN_IN_LIMITS.failuresPerIp).toEqual({ windowMs: 15 * 60_000, max: 50 });
    expect(L.SIGN_IN_LIMITS.loginFailuresPerAccount).toEqual({ windowMs: 15 * 60_000, max: 10 });
    expect(L.SIGN_IN_LIMITS.mfaFailuresPerAccount).toEqual({ windowMs: 15 * 60_000, max: 10 });
  });
});
