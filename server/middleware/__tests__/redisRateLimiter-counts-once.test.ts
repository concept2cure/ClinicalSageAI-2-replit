/**
 * A limiter counts a request once, however many routers that use it the
 * request passes through.
 *
 * ── The defect (VSR-001 F-33, found by the F-31 sweep, measured live) ─────────
 * register-concept2cure-routes.ts stacks fifteen routers at /api/concept2cure,
 * and each applies the one concept2cureRateLimiter (routes/c2c/shared.ts) with
 * router.use. A request passes every router in front of the one that answers
 * it, and the limiter counted every pass against the same key. On a live
 * server GET /api/concept2cure/reviews/my-queue (the first router) cost one
 * count and GET /api/concept2cure/projects/:id (the fifteenth) cost fifteen:
 * X-RateLimit-Remaining went 598 → 583 → 568, so the 600-a-minute bucket
 * allowed forty. The AI and document buckets, 30 and 20 a minute, were divided
 * the same way by the router's position.
 *
 * No REDIS_URL → the in-memory store, which every local and CI run uses; the
 * counting under test is the middleware's, shared by both stores.
 */
import { describe, expect, it } from 'vitest';
import express from 'express';
import request from 'supertest';
import { createRedisRateLimiter } from '../redisRateLimiter';

const LIMIT = 6;
let run = 0;

/** A limiter with a small `api` bucket and a key of its own, so cases do not share counts. */
const limiter = () =>
  createRedisRateLimiter({
    rules: { api: { windowMs: 60_000, maxRequests: LIMIT, message: 'slow down' } },
    perOrganization: true,
    keyPrefix: `counts-once-${process.pid}-${++run}:`,
  });

/** `routers` routers at one path, each applying `limit` router-wide; the last answers. */
function stackedApp(routers: number, limit = limiter()) {
  const app = express();
  for (let i = 1; i <= routers; i++) {
    const r = express.Router();
    r.use(limit);
    if (i === routers) r.get('/thing', (_req, res) => res.json({ answeredBy: i }));
    app.use('/api/stack', r);
  }
  return app;
}

describe('a request is one request to a limiter, whatever router answers it', () => {
  it('counts one per request when the third router of three answers it', async () => {
    const app = stackedApp(3);
    const remaining: number[] = [];
    for (let i = 0; i < 3; i++) {
      const res = await request(app).get('/api/stack/thing');
      expect(res.status).toBe(200);
      remaining.push(Number(res.headers['x-ratelimit-remaining']));
    }
    expect(remaining, 'each pass through a router was counted as another request').toEqual([LIMIT - 1, LIMIT - 2, LIMIT - 3]);
  });

  it('refuses the request after the limit, not after the limit divided by the router\'s position', async () => {
    const app = stackedApp(3);
    const statuses: number[] = [];
    for (let i = 0; i < LIMIT + 1; i++) statuses.push((await request(app).get('/api/stack/thing')).status);
    expect(statuses).toEqual([...Array(LIMIT).fill(200), 429]);
  });

  it('two limiters are two policies: each still counts the request once', async () => {
    const a = limiter();
    const b = limiter();
    const app = express();
    const first = express.Router();
    first.use(a);
    app.use('/api/stack', first);
    const second = express.Router();
    second.use(b);
    second.get('/thing', (_req, res) => res.json({ ok: true }));
    app.use('/api/stack', second);
    const res = await request(app).get('/api/stack/thing');
    expect(res.status).toBe(200);
    // The header is the last limiter's: one count against its own bucket.
    expect(Number(res.headers['x-ratelimit-remaining'])).toBe(LIMIT - 1);
    // Each counted it: a request through either alone is that limiter's second.
    for (const [name, one] of [['the first', a], ['the second', b]] as const) {
      const alone = express();
      const only = express.Router();
      only.use(one);
      only.get('/thing', (_req, r) => r.json({ ok: true }));
      alone.use('/api/stack', only);
      const probe = await request(alone).get('/api/stack/thing');
      expect(Number(probe.headers['x-ratelimit-remaining']), `${name} limiter did not count the request`).toBe(LIMIT - 2);
    }
  });
});
