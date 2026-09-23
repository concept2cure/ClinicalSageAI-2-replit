/**
 * The enterprise /api/auth limit (enterprise-security.ts rateLimiters.auth,
 * mounted on every /api/auth request by applySecurityMiddleware) counts the
 * address the load balancer saw — not one the client writes.
 *
 * ── The defect (D6, 2026-09-23) ──────────────────────────────────────────────
 * Its key was the LEFT-MOST X-Forwarded-For entry, with the limiter's own
 * validation switched off. The load balancer appends to that header; the
 * left-most entry is the client's. A sign-in client that wrote a new value on
 * each attempt got a new allowance on each attempt, so this limit (5 per 15
 * minutes in production) stopped nobody who knew to send the header.
 *
 * The app here is configured as server/index.ts configures production: one
 * trusted hop (server/config/trust-proxy.ts). Outside production the limit is
 * 100 per 15 minutes, which is what these cases count to.
 */
import express from 'express';
import request from 'supertest';
import { describe, expect, it } from 'vitest';
import { resolveTrustProxy } from '../../config/trust-proxy';
import { rateLimiters } from '../enterprise-security';

const LIMIT = 100; // config.rateLimits.auth.max outside production

function behindTheLoadBalancer() {
  const app = express();
  app.set('trust proxy', resolveTrustProxy({ NODE_ENV: 'production' }).hops);
  app.use('/api/auth', rateLimiters.auth);
  app.post('/api/auth/login', (_req, res) => res.status(401).json({ error: 'wrong password' }));
  return app;
}

/** An attempt as the load balancer forwards it: the client's own claim, then the address it saw. */
const attempt = (app: express.Express, seen: string, claimed?: string) =>
  request(app)
    .post('/api/auth/login')
    .set('X-Forwarded-For', claimed ? `${claimed}, ${seen}` : seen);

describe('enterprise /api/auth limit: keyed by the address the load balancer saw', () => {
  it('a client that claims a new address on every attempt is still stopped at the limit', async () => {
    const app = behindTheLoadBalancer();
    const statuses: number[] = [];
    for (let i = 0; i <= LIMIT; i++) {
      statuses.push((await attempt(app, '203.0.113.77', `198.51.${Math.floor(i / 250)}.${i % 250}`)).status);
    }
    expect(statuses.slice(0, LIMIT).every((s) => s === 401)).toBe(true);
    expect(statuses[LIMIT], 'a new claimed address bought a new allowance').toBe(429);
  });

  it('control: different clients keep their own allowances', async () => {
    const app = behindTheLoadBalancer();
    for (let i = 0; i < LIMIT; i++) await attempt(app, '203.0.113.88');
    expect((await attempt(app, '203.0.113.88')).status).toBe(429);
    expect((await attempt(app, '203.0.113.89')).status).toBe(401);
  });
});
