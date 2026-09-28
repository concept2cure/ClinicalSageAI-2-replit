/**
 * A membership is written by its own organization or the platform, and no
 * tenant can mint a platform-staff role
 * (D3, 2026-09-26; evidence docs/evidence/D3/2026-09-26-memberships/).
 *
 * public.organization_users decides who is in which tenant: authMiddleware
 * (server/auth.ts) accepts a token for an organization on exactly one row of
 * it, and "platform staff" is a staff role on that row. It carried no RLS — it
 * is on RLS_ALLOWLIST because its READS must stay unscoped (the pre-auth
 * membership check, a user's organization list) — and app_service may write
 * it. Measured as app_service in a member's tenant scope: its user written an
 * `admin` membership in another tenant, and promoted to `super_admin` in its
 * own.
 *
 * Reads are not narrowed here, for the reason the allowlist gives. Writes are:
 * own organization or the platform scope, and a staff role only from the
 * platform scope.
 *
 * Every statement runs through the application pool in a request tenant scope
 * (app_service, RLS enforcing, asserted by the fixture). The end-to-end case
 * sends the resulting token through the production global auth boundary.
 */
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
// Sign-up mails a verification link (IAM-17): observed here, never sent.
vi.mock('../../server/services/emailService', async importOriginal => ({
  ...(await importOriginal<typeof import('../../server/services/emailService')>()),
  isEmailConfigured: () => true,
  sendVerificationEmail: vi.fn(async () => undefined),
  sendWelcomeEmail: vi.fn(async () => undefined),
}));
import express from 'express';
import request from 'supertest';
import { getPool } from '../../server/db';
import { runWithTenantScope, runWithSystemTenantScope } from '../../server/db/tenantStore';
import { createAuthBoundary } from '../../server/middleware/authBoundary';
import organizationsRoutes from '../../server/routes/organizations-routes';
import tenantUsers from '../../server/routes/tenant-users';
import {
  TAG,
  ORG_A,
  ORG_B,
  FIXTURE_ORGS,
  owner,
  userA,
  userB,
  accessToken,
  auth,
  provisionTwoTenantFixture,
  teardownTwoTenantFixture,
} from './two-tenant-fixture';

let app: express.Express;
/** The pre-auth platform routes (/api/auth, /api/users), mounted by production's own registration. */
let platform: express.Express;
let multiAdmin = 0; // admin of both A and B, signed into A
const SIGNUP_EMAIL = `${TAG}-signup@example.invalid`;
let recruit = 0; // a user belonging to no organization yet

beforeAll(async () => {
  await provisionTwoTenantFixture();
  const u = await owner.query(
    `INSERT INTO users (email, name, password_hash) VALUES ($1, 'WO03 recruit', 'not-a-real-password')
     RETURNING id`,
    [`${TAG}-recruit@example.invalid`]
  );
  recruit = Number(u.rows[0].id);
  const m = await owner.query(
    `INSERT INTO users (email, name, password_hash) VALUES ($1, 'WO03 multi-org admin', 'not-a-real-password')
     RETURNING id`,
    [`${TAG}-multi-admin@example.invalid`]
  );
  multiAdmin = Number(m.rows[0].id);

  app = express();
  app.use(express.json());
  app.use('/api', createAuthBoundary());
  // A real route that authenticates itself: organizations-routes applies
  // server/auth.ts authMiddleware, which admits a token for an organization only
  // on that organization's membership row (401 "Invalid tenant membership"
  // otherwise). The global boundary alone is not the probe: outside production
  // it runs in warn mode and passes a request with no token at all.
  app.use('/api/organizations', organizationsRoutes);
  app.use('/api/tenant-users', tenantUsers);

  const { registerPlatformRoutes } = await import(
    '../../server/bootstrap/register-platform-routes'
  );
  platform = express();
  platform.use(express.json());
  await registerPlatformRoutes({
    app: platform,
    pool: getPool(),
    authMiddleware: (_req: unknown, res: express.Response) => {
      res.status(401).json({ error: 'the global gate was reached; signup must not reach it' });
    },
  });
}, 60_000);

/**
 * The fixture's two memberships exactly as provisioned: anything planted is
 * dropped, and a membership a red run deleted is put back.
 */
async function restoreMemberships(): Promise<void> {
  await owner.query(
    `DELETE FROM organization_users
      WHERE organization_id = ANY($1::int[])
        AND NOT ((organization_id = $2 AND user_id = $3) OR (organization_id = $4 AND user_id = $5))`,
    [FIXTURE_ORGS, ORG_A, userA, ORG_B, userB]
  );
  await owner.query(
    `INSERT INTO organization_users (organization_id, user_id, role)
     VALUES ($1, $2, 'member'), ($3, $4, 'member')
     ON CONFLICT (organization_id, user_id) DO UPDATE SET role = 'member'`,
    [ORG_A, userA, ORG_B, userB]
  );
}

afterAll(async () => {
  if (owner) {
    await restoreMemberships();
    await removeSignup();
    if (multiAdmin) {
      await owner.query('DELETE FROM organization_users WHERE user_id = $1', [multiAdmin]);
      await owner.query('DELETE FROM users WHERE id = $1', [multiAdmin]);
    }
    if (recruit) {
      await owner.query('DELETE FROM organization_users WHERE user_id = $1', [recruit]);
      await owner.query('DELETE FROM users WHERE id = $1', [recruit]);
    }
  }
  await teardownTwoTenantFixture();
});

/** Everything the signup case created: its organization, user and dependants. */
async function removeSignup(): Promise<void> {
  const orgs = (
    await owner.query('SELECT id, uuid::text AS uuid FROM organizations WHERE slug LIKE $1', [
      `${TAG.toLowerCase().replace(/_/g, '-')}-signup%`,
    ])
  ).rows as Array<{ id: number; uuid: string }>;
  const ids = orgs.map(o => o.id);
  if (ids.length) {
    for (const t of [
      'module_subscriptions',
      'organization_industry_profiles',
      'organization_users',
      'client_workspaces',
    ]) {
      await owner.query(`DELETE FROM ${t} WHERE organization_id = ANY($1::int[])`, [ids]);
    }
  }
  await owner.query('DELETE FROM users WHERE email = $1', [SIGNUP_EMAIL]);
  if (ids.length) {
    await owner.query('DELETE FROM organizations WHERE id = ANY($1::int[])', [ids]);
    await owner
      .query(
        `DELETE FROM identity.organizations WHERE id = ANY($1::uuid[]) AND created_by = 'c48-stage1-sync'`,
        [orgs.map(o => o.uuid)]
      )
      .catch(() => undefined);
  }
}

/** One statement in tenant A's request scope, as a plain member. */
function asA(sql: string, params: unknown[] = []) {
  return runWithTenantScope(
    { tenantId: String(ORG_A), role: 'member', source: 'request', caller: 'memberships.dbtest' },
    () => getPool().query(sql, params)
  );
}

function asPlatform(sql: string, params: unknown[] = []) {
  return runWithSystemTenantScope('memberships.dbtest', () => getPool().query(sql, params));
}

/** rowCount of a write, a refusal counted as nothing written. */
async function written(run: () => Promise<{ rowCount: number | null }>): Promise<number> {
  try {
    return (await run()).rowCount ?? 0;
  } catch (err) {
    if ((err as { code?: string }).code === '42501') return 0;
    throw err;
  }
}

const roleOf = async (org: number, user: number) =>
  (
    await owner.query(
      'SELECT role FROM organization_users WHERE organization_id = $1 AND user_id = $2',
      [org, user]
    )
  ).rows[0]?.role ?? null;

describe("tenant A's scope cannot write tenant B's memberships (D3)", () => {
  it('positive control: the route admits A into its own organization', async () => {
    const res = await request(app)
      .get(`/api/organizations/${ORG_A}`)
      .set(auth(accessToken(userA, ORG_A, 'member')));
    expect(res.status).toBe(200);
  });

  it('cannot place its user in B, so the gate never admits a token for B', async () => {
    try {
      const n = await written(() =>
        asA(
          `INSERT INTO organization_users (organization_id, user_id, role) VALUES ($1, $2, 'admin')`,
          [ORG_B, userA]
        )
      );
      // End to end: what the planted row would buy.
      const res = await request(app)
        .get(`/api/organizations/${ORG_B}`)
        .set(auth(accessToken(userA, ORG_B, 'admin')));
      expect(res.status, 'the auth gate admitted A into B').toBe(401);
      expect(n, "A's scope wrote a membership in B").toBe(0);
      expect(await roleOf(ORG_B, userA)).toBeNull();
    } finally {
      await restoreMemberships();
    }
  });

  it("cannot change or remove B's members", async () => {
    try {
      const promoted = await written(() =>
        asA("UPDATE organization_users SET role = 'admin' WHERE organization_id = $1", [ORG_B])
      );
      const removed = await written(() =>
        asA('DELETE FROM organization_users WHERE organization_id = $1', [ORG_B])
      );
      expect({ promoted, removed }).toEqual({ promoted: 0, removed: 0 });
      expect(await roleOf(ORG_B, userB)).toBe('member');
    } finally {
      await restoreMemberships();
    }
  });
});

describe('no tenant can mint a platform-staff role, not even in its own organization (D3)', () => {
  it('its own member cannot be made super_admin, platform_admin or app_super_admin', async () => {
    try {
      for (const staff of ['super_admin', 'superadmin', 'platform_admin', 'app_super_admin']) {
        const n = await written(() =>
          asA(
            'UPDATE organization_users SET role = $3 WHERE organization_id = $1 AND user_id = $2',
            [ORG_A, userA, staff]
          )
        );
        expect(n, `A's scope made its member ${staff}`).toBe(0);
      }
      expect(await roleOf(ORG_A, userA)).toBe('member');
    } finally {
      await restoreMemberships();
    }
  });
});

describe('the legitimate writers still write (D3)', () => {
  it("an organization manages its own members' ordinary roles", async () => {
    try {
      expect(
        await written(() =>
          asA(
            "UPDATE organization_users SET role = 'manager' WHERE organization_id = $1 AND user_id = $2",
            [ORG_A, userA]
          )
        )
      ).toBe(1);
      expect(
        await written(() =>
          asA(
            `INSERT INTO organization_users (organization_id, user_id, role) VALUES ($1, $2, 'viewer')`,
            [ORG_A, recruit]
          )
        )
      ).toBe(1);
      expect(
        await written(() =>
          asA('DELETE FROM organization_users WHERE organization_id = $1 AND user_id = $2', [
            ORG_A,
            recruit,
          ])
        )
      ).toBe(1);
    } finally {
      await restoreMemberships();
    }
  });

  it('the platform scope writes any organization, staff roles included', async () => {
    try {
      expect(
        await written(() =>
          asPlatform(
            `INSERT INTO organization_users (organization_id, user_id, role) VALUES ($1, $2, 'super_admin')`,
            [ORG_B, recruit]
          )
        )
      ).toBe(1);
      expect(await roleOf(ORG_B, recruit)).toBe('super_admin');
    } finally {
      await owner.query('DELETE FROM organization_users WHERE user_id = $1', [recruit]);
    }
  });
});

describe("the writers that ran outside their membership's organization now run inside it (D3)", () => {
  it('self-serve signup gives the new organization its first admin', async () => {
    try {
      const res = await request(platform)
        .post('/api/auth/signup')
        .send({
          email: SIGNUP_EMAIL,
          password: 'Quartz-Meridian-Fjord-8841!',
          companyName: `${TAG} signup org`,
          industryMode: 'biotech',
          firstName: 'Membership',
          lastName: 'Contract',
        });
      expect(res.status, JSON.stringify(res.body).slice(0, 300)).toBe(201);
      const { rows } = await owner.query(
        `SELECT ou.role FROM organization_users ou JOIN users u ON u.id = ou.user_id WHERE u.email = $1`,
        [SIGNUP_EMAIL]
      );
      expect(rows).toEqual([{ role: 'admin' }]);
    } finally {
      await removeSignup();
    }
  });

  it('a member sets their own persona (a write to their own membership row)', async () => {
    try {
      const res = await request(platform)
        .put('/api/users/me/persona')
        .set(auth(accessToken(userA, ORG_A, 'member')))
        .send({ persona: 'ra_lead' });
      expect(res.status, JSON.stringify(res.body).slice(0, 200)).toBe(200);
      const { rows } = await owner.query(
        'SELECT persona FROM organization_users WHERE organization_id = $1 AND user_id = $2',
        [ORG_A, userA]
      );
      expect(rows[0]?.persona).toBe('ra_lead');
    } finally {
      await owner.query(
        'UPDATE organization_users SET persona = NULL WHERE organization_id = $1 AND user_id = $2',
        [ORG_A, userA]
      );
    }
  });

  it('an admin of both organizations adds a member to the one they are not signed into', async () => {
    // The path the 2026-09-26 organizations write policy had already broken:
    // atomicCreateUser locks the target organization's row FOR UPDATE, which
    // that policy filters outside the organization's own scope.
    const email = `${TAG}-added-to-b@example.invalid`;
    await owner.query(
      `INSERT INTO organization_users (organization_id, user_id, role) VALUES ($1, $3, 'admin'), ($2, $3, 'admin')`,
      [ORG_A, ORG_B, multiAdmin]
    );
    try {
      const res = await request(app)
        .post('/api/tenant-users')
        .set(auth(accessToken(multiAdmin, ORG_A, 'admin')))
        .send({ organizationId: ORG_B, email, name: 'Added to B', role: 'member' });
      expect(res.status, JSON.stringify(res.body).slice(0, 300)).toBe(201);
      const { rows } = await owner.query(
        `SELECT ou.organization_id, ou.role FROM organization_users ou JOIN users u ON u.id = ou.user_id
          WHERE u.email = $1`,
        [email]
      );
      expect(rows).toEqual([{ organization_id: ORG_B, role: 'member' }]);
    } finally {
      await owner.query(
        'DELETE FROM organization_users WHERE user_id IN (SELECT id FROM users WHERE email = $1)',
        [email]
      );
      await owner
        .query(
          'DELETE FROM user_invitation_tokens WHERE user_id IN (SELECT id FROM users WHERE email = $1)',
          [email]
        )
        .catch(() => undefined);
      await owner.query('DELETE FROM users WHERE email = $1', [email]).catch(() => undefined);
      await owner.query('DELETE FROM organization_users WHERE user_id = $1', [multiAdmin]);
      await restoreMemberships();
    }
  });

  it("an admin of both organizations changes a member's role in the one they are not signed into", async () => {
    await owner.query(
      `INSERT INTO organization_users (organization_id, user_id, role) VALUES ($1, $3, 'admin'), ($2, $3, 'admin')`,
      [ORG_A, ORG_B, multiAdmin]
    );
    try {
      const res = await request(app)
        .patch(`/api/tenant-users/${ORG_B}/${userB}`)
        .set(auth(accessToken(multiAdmin, ORG_A, 'admin')))
        .send({ role: 'viewer' });
      expect(res.status, JSON.stringify(res.body).slice(0, 200)).toBe(200);
      expect(await roleOf(ORG_B, userB)).toBe('viewer');
    } finally {
      await owner.query('DELETE FROM organization_users WHERE user_id = $1', [multiAdmin]);
      await restoreMemberships();
    }
  });
});
