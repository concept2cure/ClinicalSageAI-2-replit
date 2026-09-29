/**
 * D3: the control plane's platform-wide data is for platform operators, and its
 * tenant-scoped reads are for the caller's own organization administrators
 * (ledger L183).
 *
 * The kernel decision log is process-wide: every tenant's request paths, tenant
 * ids and actor ids. The guard in front of it admitted any role whose name
 * CONTAINED "admin", which covers a tenant administrator and a
 * `research_admin`. In any environment that is not production it admitted
 * everyone, unless an operator had thought to set
 * ANA_ALLOW_NONPROD_CONTROL_PLANE=false.
 *
 * Runs on the shared two-tenant fixture (./two-tenant-fixture.ts) through the
 * real JWT/scope middleware and the real router, with NODE_ENV=test. That is a
 * non-production environment, which is the point: the bypass must be off unless
 * it is asked for.
 *
 * The entry tenant B's traffic left in the log is re-recorded before every case,
 * so a case that cleared it cannot hide the next case's read.
 */
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import express from 'express';
import request from 'supertest';
import { authenticateToken } from '../../server/middleware/auth';
import controlPlaneRouter from '../../server/src/routes/control-plane.router';
import {
  getRecentKernelDecisions,
  recordKernelDecision,
} from '../../server/src/control-plane/decision-log';
import {
  TAG,
  ORG_A,
  ORG_B,
  userA,
  userB,
  accessToken,
  auth,
  provisionTwoTenantFixture,
  provisionMember,
  grantPlatformRole,
  teardownTwoTenantFixture,
} from './two-tenant-fixture';

beforeAll(provisionTwoTenantFixture, 60_000);
afterAll(teardownTwoTenantFixture);

// eslint-disable-next-line max-lines-per-function
describe('The control plane gives platform data to platform operators and org data to org administrators (D3, L183)', () => {
  let cp: express.Express;
  const OPS_TOKEN = `${TAG}-ops-token`;
  const planted = `/api/${TAG}/tenant-b-traffic`;
  const saved = {
    bypass: process.env.ANA_ALLOW_NONPROD_CONTROL_PLANE,
    ops: process.env.ANA_OPS_TOKEN,
  };
  const restore = (key: string, value: string | undefined) => {
    if (value === undefined) delete process.env[key];
    else process.env[key] = value;
  };
  const inLog = () => getRecentKernelDecisions(2000).some(e => e.path === planted);
  /**
   * A user of tenant A whose membership ROW holds `role`. Since 414f203e1
   * (IAM-10) the request's role is the row's, not the token's claim, so a
   * token claiming `admin` for userA's `member` row is a member, and the admin
   * refusals below would refuse a member.
   */
  const callers: Record<string, number> = {};
  const as = (role: string) => {
    if (!callers[role]) throw new Error(`no tenant-A caller provisioned with role ${role}`);
    return auth(accessToken(callers[role], ORG_A, role));
  };
  /** Its own org row says `member`; its platform role is a platform_role_grants row. */
  let operator: number;

  beforeAll(async () => {
    // Mounted exactly as server/bootstrap/register-core-routes.ts mounts it.
    cp = express();
    cp.use(express.json());
    cp.use('/api/control-plane', authenticateToken, controlPlaneRouter);
    delete process.env.ANA_ALLOW_NONPROD_CONTROL_PLANE; // the default
    process.env.ANA_OPS_TOKEN = OPS_TOKEN;
    callers.member = userA;
    callers.admin = await provisionMember(ORG_A, 'admin', 'cp-admin');
    callers.research_admin = await provisionMember(ORG_A, 'research_admin', 'cp-research-admin');
    operator = await provisionMember(ORG_A, 'member', 'cp-operator');
    await grantPlatformRole(operator, 'platform_admin');
  });
  afterAll(() => {
    restore('ANA_ALLOW_NONPROD_CONTROL_PLANE', saved.bypass);
    restore('ANA_OPS_TOKEN', saved.ops);
  });

  beforeEach(() => {
    if (inLog()) return;
    // Tenant B's traffic, as the kernel middleware records it.
    recordKernelDecision({
      timestamp: new Date().toISOString(),
      method: 'POST',
      path: planted,
      statusCode: 200,
      requestId: `${TAG}-tenant-b`,
      tenantId: String(ORG_B),
      actorId: String(userB),
      kernel: {
        requestId: `${TAG}-tenant-b`,
        finalDecision: 'allow',
        score: 0,
        trace: [],
        flags: [],
        controls: { requiresHumanReview: false, requiresAuditEscalation: false },
      },
    });
  });

  it("a tenant administrator cannot read the kernel's cross-tenant log", async () => {
    const res = await request(cp).get('/api/control-plane/kernel/recent?limit=500').set(as('admin'));
    expect(JSON.stringify(res.body), "tenant B's traffic must not reach tenant A's administrator").not.toContain(
      planted
    );
    expect(res.status).toBe(403);
  });

  it('a role that merely contains "admin" is not a platform role', async () => {
    const res = await request(cp).get('/api/control-plane/kernel/recent?limit=500').set(as('research_admin'));
    expect(JSON.stringify(res.body), "tenant B's traffic must not reach a research_admin").not.toContain(planted);
    expect(res.status).toBe(403);
  });

  it("a tenant administrator cannot clear the platform's kernel log", async () => {
    const res = await request(cp).post('/api/control-plane/kernel/recent/clear').set(as('admin'));
    expect(inLog(), "the platform's log must keep tenant B's entry").toBe(true);
    expect(res.status).toBe(403);
  });

  it('outside production, a member is not let in by default', async () => {
    const res = await request(cp).get('/api/control-plane/kernel/recent?limit=500').set(as('member'));
    expect(JSON.stringify(res.body), 'the non-production bypass must be off unless asked for').not.toContain(
      planted
    );
    expect(res.status).toBe(403);
  });

  it("a member cannot read the organization's governed decisions", async () => {
    const res = await request(cp).get('/api/control-plane/governed/decisions').set(as('member'));
    expect(res.status).toBe(403);
  });

  it("the organization's administrator can", async () => {
    const res = await request(cp).get('/api/control-plane/governed/decisions').set(as('admin'));
    expect(res.status).toBe(200);
    expect(Array.isArray(res.body.entries)).toBe(true);
  });

  it('a platform operator reads the kernel log', async () => {
    const res = await request(cp)
      .get('/api/control-plane/kernel/recent?limit=500')
      .set(auth(accessToken(operator, ORG_A, 'member')));
    expect(res.status).toBe(200);
    expect(JSON.stringify(res.body)).toContain(planted);
  });

  it('monitoring that presents the ops token reads the kernel log', async () => {
    const res = await request(cp)
      .get('/api/control-plane/kernel/recent?limit=500')
      .set(as('member'))
      .set('x-ana-ops-token', OPS_TOKEN);
    expect(res.status).toBe(200);
    expect(JSON.stringify(res.body)).toContain(planted);
  });

  it('a wrong ops token is refused', async () => {
    const res = await request(cp)
      .get('/api/control-plane/kernel/recent?limit=500')
      .set(as('member'))
      .set('x-ana-ops-token', `${OPS_TOKEN}-wrong`);
    expect(JSON.stringify(res.body)).not.toContain(planted);
    expect(res.status).toBe(403);
  });

  it('the non-production bypass still opens the control plane when it is asked for', async () => {
    process.env.ANA_ALLOW_NONPROD_CONTROL_PLANE = 'true';
    try {
      const res = await request(cp).get('/api/control-plane/kernel/recent?limit=500').set(as('member'));
      expect(res.status).toBe(200);
    } finally {
      delete process.env.ANA_ALLOW_NONPROD_CONTROL_PLANE;
    }
  });
});
