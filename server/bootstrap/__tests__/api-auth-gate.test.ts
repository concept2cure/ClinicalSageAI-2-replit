/**
 * Pins the global /api auth-gate contract from
 * `register-platform-routes.ts`. The gate is the FIRST line of defense
 * against unauthenticated access to tenant-scoped routes — anything
 * not on the `openPrefixes` allowlist must hit authMiddleware before
 * any handler runs.
 *
 * If someone removes the gate, widens openPrefixes carelessly
 * (e.g. allowing /api/clients), or accidentally registers a route in
 * a way that bypasses it, one of these tests will fail.
 *
 * The test installs a stub authMiddleware that flags whether it was
 * invoked (and rejects the request), so we can assert both that the
 * gate calls into auth on protected paths AND that it skips auth on
 * the explicit public paths.
 */

import express, { type NextFunction, type Request, type Response } from 'express';
import request from 'supertest';
import { describe, expect, it, beforeEach, vi } from 'vitest';

// Stub out the dependencies registerPlatformRoutes pulls in. We're not
// testing the auth, health, users, sso routers themselves — we're
// testing the gate that decides whether to invoke authMiddleware.
vi.mock('../../routes/csp-report', () => ({
  default: express.Router().get('/', (_req, res) => res.json({ ok: 'csp-report' })),
}));
vi.mock('../../routes/auth', () => ({
  default: express.Router().get('/_probe', (_req, res) => res.json({ ok: 'auth' })),
}));
vi.mock('../../routes/users', () => ({
  default: express.Router().get('/_probe', (_req, res) => res.json({ ok: 'users' })),
}));
vi.mock('../../routes/authEnterprise', () => ({
  default: express.Router(),
}));
vi.mock('../../routes/sso', () => ({
  default: express.Router(),
}));
vi.mock('../../middleware/enterprise-security', () => ({
  CSP_REPORT_URI: '/api/csp-report',
}));
vi.mock('../../lib/health-check.js', () => ({ HealthCheckService: class {} }));
vi.mock('../../services/ai-gateway', () => ({ getGateway: () => null }));
vi.mock('../../db.js', () => ({ pool: null }));

let authCalls: string[] = [];
const stubAuth = (req: Request, res: Response, _next: NextFunction) => {
  authCalls.push(req.originalUrl);
  res.status(401).json({ error: 'AUTH_CALLED', path: req.originalUrl });
};

const stubPool: any = {
  query: vi.fn().mockResolvedValue({ rows: [] }),
};

let app: express.Express;

beforeEach(async () => {
  vi.resetModules();
  authCalls = [];
  app = express();
  const { registerPlatformRoutes } = await import('../register-platform-routes');
  await registerPlatformRoutes({
    app,
    pool: stubPool,
    authMiddleware: stubAuth,
  } as any);
});

describe('global /api auth gate — protected paths', () => {
  it.each([
    '/api/clients',
    '/api/clients/42',
    '/api/clients/42/security-settings',
    '/api/ind/anything',
    '/api/ind-submissions/SUB-1',
    '/api/documents/by-id/9',
    '/api/projects/1',
    '/api/cer/x',
    '/api/manufacturing/y',
    '/api/pharmacovigilance/z',
    '/api/fda510k/abc',
  ])('routes unauthenticated %s through authMiddleware', async path => {
    const res = await request(app).get(path);
    expect(res.status).toBe(401);
    expect(res.body.error).toBe('AUTH_CALLED');
    expect(authCalls).toContain(path);
  });
});

describe('global /api auth gate — public allowlist', () => {
  it.each([
    ['/api/auth/login', 'auth'],
    ['/api/auth/signup', 'auth'],
    ['/api/login', 'auth'],
    ['/api/register', 'auth'],
    ['/api/health', 'health'],
    ['/api/metrics', 'metrics'],
    ['/api/csp-report', 'csp-report'],
    ['/api/billing/webhooks/stripe', 'webhook'],
    ['/api/billing/dtc-pricing', 'pricing'],
    ['/api/v1/something', 'public-api'],
    ['/api/firecrawl-webhooks/x', 'firecrawl-webhook'],
  ])('does NOT invoke authMiddleware for %s (%s)', async (path, _label) => {
    await request(app).get(path);
    expect(authCalls).not.toContain(path);
  });
});

describe('global /api auth gate — boundary cases', () => {
  it('treats /api/health-imposter as protected (not a prefix match)', async () => {
    // openPrefixes use strict equality OR `startsWith(p + "/")` — a path
    // like /api/healthxyz must not be treated as /api/health.
    const res = await request(app).get('/api/healthxyz');
    expect(authCalls).toContain('/api/healthxyz');
    expect(res.status).toBe(401);
  });

  it('matches /api/health/* as a public sub-path', async () => {
    await request(app).get('/api/health/foo');
    expect(authCalls).not.toContain('/api/health/foo');
  });

  it('treats /api/clients-foo as protected even though /api/auth exists', async () => {
    // No prefix in openPrefixes should accidentally match a
    // similarly-named tenant path.
    const res = await request(app).get('/api/clients-foo');
    expect(authCalls).toContain('/api/clients-foo');
    expect(res.status).toBe(401);
  });
});
