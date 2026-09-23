/**
 * The security-health endpoint's organisation-admin gate guards that endpoint,
 * not every route under /api/admin.
 *
 * ── The defect this pins (VSR-001 F-31, found by OQ-PROJ-18 on 2026-09-23) ────
 * routes/admin-security.ts is mounted at /api/admin (bootstrap/register-
 * platform-routes.ts), and it applied authMiddleware and requireAdminRole with
 * router.use. Router-level middleware runs for every request that enters the
 * router, including requests it has no route for. So every request for the six
 * routers mounted under /api/admin after it had to come from an organisation
 * admin first, whatever those routers' own gates said:
 *
 *   · Master Administration's gate (requirePlatformAdmin) admits platform
 *     roles only, by design "no org-admin bypass". A platform administrator or
 *     support engineer designated through platform_role_grants who was not also
 *     an organisation admin got 403 "Admin permissions required" from every
 *     Master Administration route. That includes PATCH /users/:id/status, the
 *     route that takes an account out of use. The same was true of Access
 *     Management and both SCIM consoles, which use the same gate;
 *   · the Business Center admits its business roles, and the SIEM feed admits
 *     a compliance officer. Neither could be reached by one who was not also an
 *     organisation admin.
 *
 * The mounts under /api/admin are read from the bootstrap files, so a router
 * mounted there later is covered without editing this test. Each is replaced
 * here by a probe that answers 200: the question is only whether a request
 * reaches the router it is addressed to. What each router then admits is its
 * own gate's business.
 */
import fs from 'node:fs';
import path from 'node:path';
import express from 'express';
import request from 'supertest';
import { describe, expect, it, vi } from 'vitest';

// The session is whatever the test says it is; requireAdminRole is the real one.
vi.mock('../../auth.js', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../auth')>()),
  authMiddleware: (req: any, res: any, next: any) => {
    const role = req.headers['x-test-role'];
    if (!role) return res.status(401).json({ error: 'Authentication required' });
    req.user = { id: 5, userId: 5, organizationId: 3, role };
    req.userId = 5;
    req.userRole = role;
    next();
  },
}));
vi.mock('../../db.js', () => ({ getPool: () => ({ query: async () => ({ rows: [] }) }), pool: { query: async () => ({ rows: [] }) } }));
vi.mock('../../services/auditService', () => ({
  default: { logAction: async () => ({ persisted: true, chained: true, tamperProof: true }) },
}));
vi.mock('../../services/securityHealthScheduler', () => ({
  getLastSecurityHealthReport: () => ({
    report: { overall: 'healthy', checkedAt: '2026-09-23T00:00:00.000Z', checks: [] },
    ageMs: 1_000,
  }),
}));
vi.mock('../../services/securityHealth', () => ({ runSecurityHealthChecks: async () => ({ overall: 'healthy', checks: [] }) }));

const BOOTSTRAP = path.resolve(__dirname, '../../bootstrap');

/** Every path production mounts a router at under /api/admin/, in the order the bootstrap files mount them. */
function mountsUnderAdmin(): string[] {
  const found: string[] = [];
  for (const file of ['register-platform-routes.ts', 'register-admin-routes.ts']) {
    const source = fs.readFileSync(path.join(BOOTSTRAP, file), 'utf8');
    for (const m of source.matchAll(/app\.use\(\s*'(\/api\/admin\/[^']+)'/g)) found.push(m[1]);
  }
  return found;
}

async function productionShapedApp() {
  const adminSecurity = (await import('../admin-security')).default;
  const app = express();
  // As register-platform-routes.ts mounts it, ahead of every router below.
  app.use('/api/admin', adminSecurity);
  for (const prefix of mountsUnderAdmin()) {
    const probe = express.Router();
    probe.use((_req, res) => res.status(200).json({ reached: prefix }));
    app.use(prefix, probe);
  }
  return app;
}

describe('/api/admin: the security-health gate is its own route\'s, not the prefix\'s', () => {
  it('finds the routers production mounts under /api/admin', () => {
    // A parse that finds nothing would make every case below vacuous.
    expect(mountsUnderAdmin()).toEqual(
      expect.arrayContaining([
        '/api/admin/master',
        '/api/admin/business',
        '/api/admin/access',
        '/api/admin/scim-tenants',
        '/api/admin/audit',
        '/api/admin/scim-ip-allowlist',
      ]),
    );
  });

  it.each(mountsUnderAdmin())(
    'a request for %s reaches its own router, whatever the caller\'s organisation role',
    async (prefix) => {
      const app = await productionShapedApp();
      for (const role of ['member', 'compliance_officer', 'viewer']) {
        const res = await request(app).get(`${prefix}/anything`).set('x-test-role', role);
        expect(res.status, `a ${role}'s request for ${prefix} was answered by another router's gate: ${JSON.stringify(res.body)}`).toBe(200);
        expect(res.body.reached).toBe(prefix);
      }
    },
  );

  it('the security-health endpoint still refuses a caller who is not an organisation admin', async () => {
    const app = await productionShapedApp();
    const res = await request(app).get('/api/admin/security-health').set('x-test-role', 'member');
    expect(res.status).toBe(403);
    expect(res.body.error).toBe('Admin permissions required');
  });

  it('the security-health endpoint still refuses a request with no session', async () => {
    const app = await productionShapedApp();
    const res = await request(app).get('/api/admin/security-health');
    expect(res.status).toBe(401);
  });

  it('the security-health endpoint answers an organisation admin', async () => {
    const app = await productionShapedApp();
    const res = await request(app).get('/api/admin/security-health').set('x-test-role', 'admin');
    expect(res.status, JSON.stringify(res.body)).toBe(200);
    expect(res.body.overall).toBe('healthy');
  });
});
