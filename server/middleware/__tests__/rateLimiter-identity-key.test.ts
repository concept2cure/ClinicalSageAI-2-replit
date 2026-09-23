/**
 * Legacy in-memory limiter (server/middleware/rateLimiter.ts) — authenticated
 * traffic is keyed by the verified identity, unauthenticated traffic by IP.
 *
 * ── The defect (VSR-001 F-5, OQ-PROJ-10 / OQ-SUBC-13) ───────────────────────
 * Eleven routers mount `createRateLimiter()` and every instance shares ONE
 * module-level store keyed by client IP, `api` bucket = 60 requests/minute.
 * One browser session opening Tasks, Vault and the Submission Center makes
 * more than sixty calls across those routers inside a minute, so every run
 * rendered their "didn't respond" error state on the first attempt. Behind a
 * corporate NAT the whole office shares that bucket.
 *
 * The limiter runs AFTER `authenticateToken` on every router that mounts it,
 * so the identity it sees is verified. Authenticated requests are therefore
 * keyed `user:<id>` with the higher, documented ceiling
 * (`LEGACY_RATE_LIMITS.api.maxRequestsAuthenticated`); a request with no
 * verified identity keeps the per-IP bucket and the per-IP ceiling.
 *
 * `trust proxy` is on so X-Forwarded-For selects the IP: the store is
 * process-global with no reset API, so each case uses an IP of its own.
 */
import { describe, it, expect } from 'vitest';
import express from 'express';
import request from 'supertest';

import { createRateLimiter } from '../rateLimiter';
import { LEGACY_RATE_LIMITS } from '../../config/platform-limits';

const PER_IP = LEGACY_RATE_LIMITS.api.maxRequests;
const PER_USER = (LEGACY_RATE_LIMITS.api as { maxRequestsAuthenticated?: number }).maxRequestsAuthenticated;

function app(identity?: (req: express.Request) => number | null) {
  const a = express();
  a.set('trust proxy', true);
  if (identity) {
    a.use((req, _res, next) => {
      const id = identity(req);
      if (id != null) {
        (req as unknown as { user: unknown }).user = { id, userId: id, organizationId: 2 };
        (req as unknown as { userId: number }).userId = id;
      }
      next();
    });
  }
  a.use(createRateLimiter());
  a.get('/api/things', (_req, res) => res.json({ ok: true }));
  return a;
}

async function burst(a: express.Express, ip: string, n: number, headers: Record<string, string> = {}) {
  const statuses: number[] = [];
  for (let i = 0; i < n; i++) {
    const r = await request(a).get('/api/things').set('X-Forwarded-For', ip).set(headers);
    statuses.push(r.status);
  }
  return statuses;
}

describe('legacy rateLimiter — identity key for authenticated traffic (F-5)', () => {
  it('documents an authenticated ceiling above the per-IP one', () => {
    expect(typeof PER_USER).toBe('number');
    expect(PER_USER as number).toBeGreaterThan(PER_IP);
  });

  it('unauthenticated: the per-IP bucket still trips at exactly the per-IP ceiling', async () => {
    const a = app();
    const s = await burst(a, '10.0.0.1', PER_IP + 1);
    expect(s.slice(0, PER_IP).every((x) => x === 200)).toBe(true);
    expect(s[PER_IP]).toBe(429);
  });

  it('authenticated: one user is NOT tripped by ordinary shell traffic beyond the per-IP ceiling', async () => {
    const a = app(() => 7);
    const s = await burst(a, '10.0.0.2', PER_IP + 1);
    // Pre-fix: the 61st request from this IP answered 429 — the VSR's
    // "Tasks, Vault and Submission Center rendered their error state".
    expect(s[PER_IP]).toBe(200);
    expect(s.every((x) => x === 200)).toBe(true);
  });

  it('authenticated: the per-user ceiling still exists and trips at exactly that number', async () => {
    const a = app(() => 8);
    const s = await burst(a, '10.0.0.3', (PER_USER as number) + 1);
    expect(s.filter((x) => x === 429)).toHaveLength(1);
    expect(s[PER_USER as number]).toBe(429);
  });

  it('two users behind one NAT address do not share a bucket, and anonymous traffic from it keeps its own', async () => {
    const a = app((req) => {
      const h = req.header('x-test-user');
      return h ? Number(h) : null;
    });
    const NAT = '10.0.0.4';
    const first = await burst(a, NAT, PER_USER as number, { 'x-test-user': '21' });
    expect(first.every((x) => x === 200)).toBe(true);
    const exhausted = await request(a).get('/api/things').set('X-Forwarded-For', NAT).set('x-test-user', '21');
    expect(exhausted.status).toBe(429);
    // Their colleague on the same address is unaffected.
    const other = await request(a).get('/api/things').set('X-Forwarded-For', NAT).set('x-test-user', '22');
    expect(other.status).toBe(200);
    // Anonymous traffic from that address is limited on its own per-IP bucket.
    const anon = await burst(a, NAT, PER_IP + 1);
    expect(anon[PER_IP]).toBe(429);
    expect(anon.slice(0, PER_IP).every((x) => x === 200)).toBe(true);
  });

  it('the 429 and the headers name the ceiling that applied', async () => {
    const a = app(() => 9);
    const r = await request(a).get('/api/things').set('X-Forwarded-For', '10.0.0.5');
    expect(r.status).toBe(200);
    expect(Number(r.headers['x-ratelimit-limit'])).toBe(PER_USER);
    const b = app();
    const r2 = await request(b).get('/api/things').set('X-Forwarded-For', '10.0.0.6');
    expect(Number(r2.headers['x-ratelimit-limit'])).toBe(PER_IP);
  });
});
