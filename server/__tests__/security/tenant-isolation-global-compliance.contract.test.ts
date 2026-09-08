/**
 * Tenant-isolation contract test — Global Compliance family.
 *
 * Regression guard for a cross-tenant IDOR on GDPR + pharmacovigilance data:
 * server/routes/global-compliance.ts defines enforceOrgScope (super-admins
 * bypass; otherwise the JWT org must equal the route org) but originally wired
 * it into only 2 of ~18 handlers. The rest read req.params.orgId and queried
 * per-org ROPA, breach, DSR, adverse-event, signal, RMP and dashboard data
 * with no tenant check. Every org-scoped handler must now enforce the guard.
 *
 * The router self-applies authenticateToken, so this exercises the real auth
 * path with signed JWTs rather than an injected middleware.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.hoisted(() => {
  process.env.NODE_ENV = process.env.NODE_ENV || 'test';
  process.env.JWT_SECRET =
    process.env.JWT_SECRET || 'stage3-test-secret-padded-to-32-chars-or-more-okay';
});

import express from 'express';
import request from 'supertest';
import jwt from 'jsonwebtoken';

const { ORG_A, TARGET_ORG, calls } = vi.hoisted(() => ({
  ORG_A: 7,
  TARGET_ORG: 999,
  calls: [] as Array<{ sql: string; params: any[] }>,
}));

// The lifecycle guard's posture lookup is a real tenant-scoped DB read that
// answers 503 TENANT_STATE_UNVERIFIED when it cannot verify — correct in
// production, noise here where the subject is the route's org-path isolation.
// Passthrough like the sibling suites; the guard has its own dbtests.
vi.mock('../../middleware/tenantLifecycleGuard', () => ({
  enforceTenantLifecycle: (_req: any, _res: any, next: any) => next(),
}));

vi.mock('../../db', () => {
  // enforceOrgMembership (now in the canonical chain for every specifier
  // after the M-5 consolidation — this suite previously exercised the legacy
  // auth.js, which never re-checked membership) dynamically imports db.select
  // and refuses with 503 when it is absent. Answer the membership lookup with
  // a valid row for the JWT's own org; the foreign-org rejections under test
  // are the ROUTE's org-path comparison, which runs after membership.
  const membershipRow = { role: 'member', orgUuid: null };
  const chain = {
    from: () => chain,
    leftJoin: () => chain,
    where: () => chain,
    limit: async () => [membershipRow],
  };
  const pool = {
    query: vi.fn(async (sql: string, params: any[] = []) => {
      calls.push({ sql, params });
      return { rows: [{ id: 1, organization_id: ORG_A }], rowCount: 1 };
    }),
  };
  return {
    db: { select: () => chain },
    pool,
    getPool: () => pool,
  };
});

const token = (orgId: number, role = 'user') =>
  jwt.sign({ userId: 1, organizationId: orgId, role, type: 'access' }, process.env.JWT_SECRET as string, {
    algorithm: 'HS256',
  });

let app: express.Express;

beforeEach(async () => {
  vi.clearAllMocks();
  calls.length = 0;
  const router = (await import('../../routes/global-compliance')).default;
  app = express();
  app.use(express.json());
  app.use('/api/global-compliance', router);
});

const dataCalls = () => calls.filter(c => /SELECT|INSERT|UPDATE|DELETE/i.test(c.sql));
const allParams = () => calls.flatMap(c => c.params);

// A representative slice across the route families that were unguarded.
const READ_ROUTES = [
  '/regions/:org/config',
  '/gdpr/:org/ropa',
  '/gdpr/:org/dsr/overdue',
  '/pharmacovigilance/:org/adverse-events',
  '/pharmacovigilance/:org/overdue-reports',
  '/dashboard/:org',
];
const WRITE_ROUTES = [
  '/regions/:org/enable',
  '/gap-analysis/:org',
  '/gdpr/:org/breach',
  '/gdpr/:org/dsr',
  '/pharmacovigilance/:org/adverse-event',
  '/pharmacovigilance/:org/signal',
  '/pharmacovigilance/:org/rmp',
];
const path = (tpl: string, org: number) =>
  `/api/global-compliance${tpl.replace(':org', String(org))}`;

describe('Tenant isolation — global compliance reads', () => {
  it('serves a route org that matches the JWT org', async () => {
    const res = await request(app)
      .get(path('/regions/:org/config', ORG_A))
      .set('Authorization', `Bearer ${token(ORG_A)}`);
    expect(res.status).toBe(200);
    expect(allParams()).toContain(ORG_A);
  });

  it('rejects every read of a foreign org (no data query runs)', async () => {
    for (const tpl of READ_ROUTES) {
      calls.length = 0;
      const res = await request(app)
        .get(path(tpl, TARGET_ORG))
        .set('Authorization', `Bearer ${token(ORG_A)}`);
      expect(res.status, `${tpl} should be forbidden`).toBe(403);
      expect(allParams(), `${tpl} must not query the target org`).not.toContain(TARGET_ORG);
      expect(dataCalls(), `${tpl} must not hit the DB`).toHaveLength(0);
    }
  });

  it('lets a platform super-admin read across orgs', async () => {
    const res = await request(app)
      .get(path('/dashboard/:org', TARGET_ORG))
      .set('Authorization', `Bearer ${token(TARGET_ORG, 'super_admin')}`);
    expect(res.status).not.toBe(403);
  });
});

describe('Tenant isolation — global compliance writes', () => {
  it('rejects every write to a foreign org (no mutation runs)', async () => {
    for (const tpl of WRITE_ROUTES) {
      calls.length = 0;
      const res = await request(app)
        .post(path(tpl, TARGET_ORG))
        .set('Authorization', `Bearer ${token(ORG_A)}`)
        .send({ regionCode: 'US', frameworkId: 1, severity: 'high' });
      expect(res.status, `${tpl} should be forbidden`).toBe(403);
      expect(allParams(), `${tpl} must not write the target org`).not.toContain(TARGET_ORG);
      expect(dataCalls(), `${tpl} must not mutate`).toHaveLength(0);
    }
  });

  it('allows a same-org write', async () => {
    const res = await request(app)
      .post(path('/regions/:org/enable', ORG_A))
      .set('Authorization', `Bearer ${token(ORG_A)}`)
      .send({ regionCode: 'US', frameworkId: 1 });
    expect(res.status).not.toBe(403);
  });
});

describe('Tenant isolation — global compliance auth', () => {
  it('401s without a token', async () => {
    for (const tpl of [...READ_ROUTES, ...WRITE_ROUTES]) {
      const res = await request(app).get(path(tpl, ORG_A));
      expect(res.status).toBe(401);
    }
    expect(dataCalls()).toHaveLength(0);
  });
});
