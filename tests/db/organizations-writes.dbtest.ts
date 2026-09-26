/**
 * An organization's row is written by that organization or the platform
 * (D3, 2026-09-26; evidence docs/evidence/D3/2026-09-26-organizations-writes/).
 *
 * public.organizations had no RLS, and app_service may UPDATE it, so any tenant
 * scope could rewrite any organization's tier, seats, settings, Stripe ids and
 * API key. (Its tenant key, id and uuid, is immutable since 2026-09-25:
 * docs/evidence/D3/2026-09-25-organizations-tenant-key/.)
 *
 * The write policy could not land alone. Five platform-staff override paths
 * write ANOTHER organization's row from the staff member's OWN request scope —
 * role super_admin, not the system scope's app_super_admin:
 *   organizations-routes.ts  PATCH /:id/profile, PATCH /:id/settings
 *   tenant-config.ts         PATCH /:tenantId/settings, POST …/settings/reset,
 *                            PATCH …/settings/:section
 * Under an own-org policy they would write nothing — /:id/settings while
 * answering success, because it never checked its UPDATE. So those paths now
 * open the system scope when, and only when, staff target another org.
 *
 * Mounted as production mounts them: the global /api auth boundary, then each
 * router at its registered path (server/bootstrap/register-tenant-routes.ts).
 * Every statement runs as app_service with RLS enforcing (the fixture asserts
 * the posture). Nothing is stubbed.
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import express from 'express';
import request from 'supertest';
import { getPool } from '../../server/db';
import { runWithTenantScope } from '../../server/db/tenantStore';
import { createAuthBoundary } from '../../server/middleware/authBoundary';
import organizationsRoutes from '../../server/routes/organizations-routes';
import tenantConfig from '../../server/routes/tenant-config';
import {
  TAG,
  ORG_A,
  ORG_B,
  FIXTURE_ORGS,
  owner,
  accessToken,
  auth,
  provisionTwoTenantFixture,
  teardownTwoTenantFixture,
} from './two-tenant-fixture';

let app: express.Express;
let staff = 0; // platform staff, a member of org A
let adminA = 0; // org A's own administrator
const original: Record<number, { name: string; settings: unknown }> = {};

beforeAll(async () => {
  await provisionTwoTenantFixture();
  const { rows } = await owner.query(
    'SELECT id, name, settings FROM organizations WHERE id = ANY($1::int[])',
    [FIXTURE_ORGS]
  );
  for (const r of rows) original[r.id] = { name: r.name, settings: r.settings };

  const users = await owner.query(
    `INSERT INTO users (email, name, password_hash)
     VALUES ($1, 'WO03 staff', 'not-a-real-password'), ($2, 'WO03 admin A', 'not-a-real-password')
     RETURNING id`,
    [`${TAG}-staff@example.invalid`, `${TAG}-admin-a@example.invalid`]
  );
  [staff, adminA] = users.rows.map(r => Number(r.id));
  await owner.query(
    `INSERT INTO organization_users (organization_id, user_id, role)
     VALUES ($1, $2, 'super_admin'), ($1, $3, 'admin')`,
    [ORG_A, staff, adminA]
  );

  app = express();
  app.use(express.json());
  app.use('/api', createAuthBoundary());
  app.use('/api/organizations', organizationsRoutes);
  app.use('/api/tenant-config', tenantConfig);
}, 60_000);

/** Both fixture organizations exactly as they were. */
async function restoreOrgs(): Promise<void> {
  for (const [id, o] of Object.entries(original)) {
    await owner.query('UPDATE organizations SET name = $2, settings = $3 WHERE id = $1', [
      Number(id),
      o.name,
      JSON.stringify(o.settings ?? {}),
    ]);
  }
}

afterAll(async () => {
  if (owner) {
    await restoreOrgs();
    const ids = [staff, adminA].filter(Boolean);
    await owner.query('DELETE FROM organization_users WHERE user_id = ANY($1::int[])', [ids]);
    await owner.query('DELETE FROM users WHERE id = ANY($1::int[])', [ids]);
  }
  await teardownTwoTenantFixture();
});

const settingsOf = async (org: number) =>
  (await owner.query('SELECT settings FROM organizations WHERE id = $1', [org])).rows[0]
    ?.settings ?? {};

const asStaff = () => auth(accessToken(staff, ORG_A, 'super_admin'));
const asAdminA = () => auth(accessToken(adminA, ORG_A, 'admin'));

describe("an organization's row is written by that organization or the platform (D3)", () => {
  it('a tenant scope cannot write another organization at the database', async () => {
    // A no-op write: whatever the outcome, B's row is unchanged.
    const touched = await runWithTenantScope(
      {
        tenantId: String(ORG_A),
        role: 'member',
        source: 'request',
        caller: 'tests/db/organizations-writes.dbtest.ts',
      },
      () =>
        getPool().query('UPDATE organizations SET updated_at = updated_at WHERE id = $1', [ORG_B])
    );
    expect(touched.rowCount, "tenant A's scope wrote B's organization row").toBe(0);
  });

  it("an org admin still updates its own organization's settings", async () => {
    try {
      const res = await request(app)
        .patch(`/api/organizations/${ORG_A}/settings`)
        .set(asAdminA())
        .send({ settings: { wo03probe: `${TAG}-own` }, reason: 'contract: own-org edit' });
      expect(res.status).toBe(200);
      expect((await settingsOf(ORG_A)).wo03probe).toBe(`${TAG}-own`);
    } finally {
      await restoreOrgs();
    }
  });

  it("an org admin still cannot touch another organization's settings", async () => {
    const res = await request(app)
      .patch(`/api/organizations/${ORG_B}/settings`)
      .set(asAdminA())
      .send({ settings: { wo03probe: `${TAG}-foreign` }, reason: 'contract: foreign edit' });
    expect(res.status).toBe(403);
    expect((await settingsOf(ORG_B)).wo03probe).toBeUndefined();
  });

  it("platform staff edit another organization's settings, and the change is really there", async () => {
    try {
      const res = await request(app)
        .patch(`/api/organizations/${ORG_B}/settings`)
        .set(asStaff())
        .send({ settings: { wo03probe: `${TAG}-staff` }, reason: 'contract: staff edit' });
      expect(res.status).toBe(200);
      // A success answer is not evidence; the row is.
      expect((await settingsOf(ORG_B)).wo03probe, 'answered success, wrote nothing').toBe(
        `${TAG}-staff`
      );
      expect(res.body.auditTrail, "the §11.10(e) row for B's change").toMatchObject({
        persisted: true,
      });
    } finally {
      await restoreOrgs();
    }
  });

  it("platform staff edit another organization's profile", async () => {
    try {
      const res = await request(app)
        .patch(`/api/organizations/${ORG_B}/profile`)
        .set(asStaff())
        .send({ name: `${TAG} renamed B`, reason: 'contract: staff profile edit' });
      expect(res.status).toBe(200);
      const { rows } = await owner.query('SELECT name FROM organizations WHERE id = $1', [ORG_B]);
      expect(rows[0].name).toBe(`${TAG} renamed B`);
    } finally {
      await restoreOrgs();
    }
  });

  it("platform staff update another tenant's configuration through tenant-config", async () => {
    try {
      const res = await request(app)
        .patch(`/api/tenant-config/${ORG_B}/settings`)
        .set(asStaff())
        .send({ branding: { primaryColor: '#123456' } });
      expect(res.status).toBe(200);
      expect((await settingsOf(ORG_B)).branding?.primaryColor).toBe('#123456');
    } finally {
      await restoreOrgs();
    }
  });
});
