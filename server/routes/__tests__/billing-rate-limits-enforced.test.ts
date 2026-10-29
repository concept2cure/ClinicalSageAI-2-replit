/**
 * GET /api/billing/rate-limits states the limits the product enforces
 * (D2, fold billing Part 2; decision P-68; docs/evidence/D2-ONE-ANA/2026-10-29/fold-billing/).
 *
 * The route answered from a hand-written per-tier grid in billing-dashboard.ts
 * (free 10 requests a minute … enterprise 500, with per-module keys) that
 * nothing enforces, and an organisation with no tier was told it was on
 * 'standard'. What the product applies is server/config/platform-limits.ts:
 * RATE_LIMITS, which the Redis limiter applies to every /api request
 * (server/startup/middleware.ts), and LEGACY_RATE_LIMITS, which the in-memory
 * limiter applies on the routers that mount createRateLimiter(). Neither varies
 * by subscription.
 *
 * So the route reads those two objects, says the limits are the same for every
 * subscription, and reports the organisation's tier as recorded, or says it is
 * not recorded. The unenforced grid is deleted.
 */
import fs from 'node:fs';
import path from 'node:path';
import express, { type Request, type Response, type NextFunction } from 'express';
import request from 'supertest';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const h = vi.hoisted(() => ({ query: vi.fn(), tier: 'professional' as string | null }));
vi.mock('../../db.js', () => ({ pool: { query: h.query }, db: {} }));
vi.mock('../../middleware/auth.js', async (original) => ({
  ...(await original<typeof import('../../middleware/auth')>()),
  authenticateToken: (req: Request, res: Response, next: NextFunction) => {
    if (req.get('x-test-user') === 'none') return res.status(401).json({ error: 'Authentication required' });
    (req as Request & { user: unknown }).user = { id: 3, organizationId: 7, role: req.get('x-test-role') ?? 'member' };
    next();
  },
}));

import billing, { SHARED_LIMITER_ROUTES } from '../billing-dashboard';
import { LEGACY_RATE_LIMITS, RATE_LIMITS } from '../../config/platform-limits';

const app = express();
app.use(express.json());
app.use('/api/billing', billing);

beforeEach(() => {
  h.tier = 'professional';
  h.query.mockReset();
  h.query.mockImplementation(async (sql: string) => {
    if (/SELECT tier FROM organizations/.test(sql)) return { rows: [{ tier: h.tier }] };
    return { rows: [] };
  });
});

const get = (role = 'member') => request(app).get('/api/billing/rate-limits').set('x-test-role', role);

describe('GET /api/billing/rate-limits', () => {
  it('states every platform limit exactly as platform-limits.ts sets it', async () => {
    const res = await get();
    expect(res.status).toBe(200);
    expect(res.body.sameForEverySubscription).toBe(true);
    const byCategory = Object.fromEntries((res.body.limits as Array<{ category: string }>).map((l) => [l.category, l]));
    expect(Object.keys(byCategory).sort()).toEqual(Object.keys(RATE_LIMITS).sort());
    for (const [category, rule] of Object.entries(RATE_LIMITS)) {
      const r = rule as { windowMs: number; maxRequests: number; maxRequestsAuthenticated?: number; skipRoles?: string[] };
      expect(byCategory[category], category).toMatchObject({
        windowSeconds: r.windowMs / 1000,
        perSignedInUser: r.maxRequestsAuthenticated ?? r.maxRequests,
        perAddress: r.maxRequests,
        exemptRoles: r.skipRoles ?? [],
      });
      expect(typeof (byCategory[category] as { label?: unknown }).label).toBe('string');
    }
  });

  it('states the second limiter where it applies, with its own numbers', async () => {
    const res = await get();
    const shared = res.body.sharedRouteLimits;
    expect(shared.appliesTo.length).toBeGreaterThan(0);
    const byCategory = Object.fromEntries((shared.limits as Array<{ category: string }>).map((l) => [l.category, l]));
    expect(Object.keys(byCategory).sort()).toEqual(Object.keys(LEGACY_RATE_LIMITS).sort());
    for (const [category, rule] of Object.entries(LEGACY_RATE_LIMITS)) {
      const r = rule as { windowMs: number; maxRequests: number; maxRequestsAuthenticated?: number };
      expect(byCategory[category], category).toMatchObject({
        windowSeconds: r.windowMs / 1000,
        perSignedInUser: r.maxRequestsAuthenticated ?? r.maxRequests,
        perAddress: r.maxRequests,
      });
    }
  });

  it('every router it names as applying the second limiter really mounts it, and it names them all', async () => {
    const res = await get();
    expect(res.body.sharedRouteLimits.appliesTo).toEqual(SHARED_LIMITER_ROUTES.map((r) => r.name));
    for (const { file } of SHARED_LIMITER_ROUTES) {
      const src = fs.readFileSync(path.resolve(__dirname, '..', file), 'utf8');
      expect(src, file).toMatch(/createRateLimiter\(/);
    }
    // And none is left out: every route file that mounts it is named.
    const routes = path.resolve(__dirname, '..');
    const walk = (dir: string): string[] => fs.readdirSync(dir, { withFileTypes: true }).flatMap((e) =>
      e.isDirectory() ? (e.name === '__tests__' ? [] : walk(path.join(dir, e.name))) : /\.ts$/.test(e.name) ? [path.join(dir, e.name)] : []);
    // Comments are blanked: a note that names the limiter is not a mount.
    const code = (f: string) => fs.readFileSync(f, 'utf8').replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:'"`])\/\/.*$/gm, '$1');
    const mounting = walk(routes)
      .filter((f) => /createRateLimiter\(/.test(code(f)))
      .map((f) => path.relative(routes, f).split(path.sep).join('/'))
      .sort();
    expect([...SHARED_LIMITER_ROUTES.map((r) => r.file)].sort()).toEqual(mounting);
  });

  it('answers the same limits whatever the subscription', async () => {
    h.tier = 'free';
    const free = (await get()).body;
    h.tier = 'enterprise';
    const enterprise = (await get()).body;
    expect(free.limits).toEqual(enterprise.limits);
    expect(free.sharedRouteLimits).toEqual(enterprise.sharedRouteLimits);
    expect(free.tier).toBe('free');
    expect(enterprise.tier).toBe('enterprise');
  });

  it.each([null, ''])('an organisation with no tier (%j) is told its tier is not recorded, never "standard"', async (tier) => {
    h.tier = tier;
    const res = await get();
    expect(res.status).toBe(200);
    expect(res.body.tier).toBeNull();
    expect(res.body.tierRecorded).toBe(false);
    expect(JSON.stringify(res.body)).not.toContain('standard');
  });

  it('a recorded tier is reported as recorded', async () => {
    const res = await get();
    expect(res.body).toMatchObject({ tier: 'professional', tierRecorded: true });
  });

  it('carries no per-tier grid', async () => {
    const res = await get();
    expect(JSON.stringify(res.body)).not.toMatch(/requestsPerDay|cer-generator|ind-wizard/);
    const src = fs.readFileSync(path.resolve(__dirname, '..', 'billing-dashboard.ts'), 'utf8');
    expect(src).not.toMatch(/requestsPerDay|'cer-generator'|'ind-wizard'/);
  });

  it('any member reads it; a failed tier read is an error, not a guess', async () => {
    expect((await get('viewer')).status).toBe(200);
    h.query.mockRejectedValue(new Error('db down'));
    const res = await get();
    expect(res.status).toBe(500);
    expect(res.body).not.toHaveProperty('limits');
  });

  it('requires the authenticated principal', async () => {
    const res = await request(app).get('/api/billing/rate-limits').set('x-test-user', 'none');
    expect(res.status).toBe(401);
  });
});
