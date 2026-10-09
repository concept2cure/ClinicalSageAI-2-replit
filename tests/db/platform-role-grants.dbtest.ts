/**
 * A platform role is granted, changed and revoked by the platform scope only
 * (D3, 2026-09-28; evidence docs/evidence/D3/2026-09-28-platform-role-grants/).
 *
 * public.platform_role_grants is what requirePlatformAdmin, requireBusinessAdmin
 * and the master-admin entitlement read to decide "platform operator": an
 * active row for a user admits them to every cross-tenant console. It carried
 * no row-level security and app_service may write it, so a plain member's
 * tenant scope could write itself super_admin.
 *
 * Reads stay open: the platform-admin check runs in the caller's own tenant
 * scope (behind authenticateToken), for a caller who may be a member of any
 * organization. Writes need the platform scope; the one application writer,
 * the Access Management console (/api/admin/access), runs in it.
 *
 * Every statement runs through the application pool (app_service, RLS
 * enforcing, asserted by the fixture). The end-to-end probe is the Access
 * Management router behind the production auth boundary.
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import express from 'express';
import request from 'supertest';
import { getPool } from '../../server/db';
import { runWithSystemTenantScope, runWithTenantScope } from '../../server/db/tenantStore';
import { createAuthBoundary } from '../../server/middleware/authBoundary';
import accessManagementRoutes from '../../server/routes/admin/access-management';
import {
  ORG_A,
  owner,
  userA,
  accessToken,
  auth,
  grantPlatformRole,
  provisionMember,
  provisionTwoTenantFixture,
  teardownTwoTenantFixture,
} from './two-tenant-fixture';

let app: express.Express;
let operator = 0; // a platform operator, designated as production designates one

beforeAll(async () => {
  await provisionTwoTenantFixture();
  operator = await provisionMember(ORG_A, 'member', 'prg-operator');
  await grantPlatformRole(operator, 'super_admin');
  app = express();
  app.use(express.json());
  app.use('/api', createAuthBoundary());
  app.use('/api/admin/access', accessManagementRoutes);
}, 60_000);

afterAll(async () => {
  if (owner) {
    await owner.query('DELETE FROM platform_role_grants WHERE user_id = ANY($1::int[])', [
      [userA, operator],
    ]);
  }
  await teardownTwoTenantFixture();
});

/** One statement in tenant A's request scope, as a plain member. */
function asA(sql: string, params: unknown[] = []) {
  return runWithTenantScope(
    {
      tenantId: String(ORG_A),
      role: 'member',
      source: 'request',
      caller: 'platform-role-grants.dbtest',
    },
    () => getPool().query(sql, params)
  );
}
function asPlatform(sql: string, params: unknown[] = []) {
  return runWithSystemTenantScope('platform-role-grants.dbtest', () =>
    getPool().query(sql, params)
  );
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

const activeGrants = async (userId: number) =>
  (
    await owner.query(
      'SELECT role FROM platform_role_grants WHERE user_id = $1 AND revoked_at IS NULL ORDER BY role',
      [userId]
    )
  ).rows.map(r => r.role as string);

const asMemberOfA = () => auth(accessToken(userA, ORG_A, 'member'));

describe('a tenant scope cannot make anyone a platform operator (D3)', () => {
  it('positive control: the console refuses a plain member', async () => {
    const res = await request(app).get('/api/admin/access/grants').set(asMemberOfA());
    expect(res.status).toBe(403);
  });

  it('cannot write its member a platform role, so the console never admits them', async () => {
    try {
      const n = await written(() =>
        asA(
          `INSERT INTO platform_role_grants (user_id, role, granted_by, reason)
           VALUES ($1, 'super_admin', 'tenant scope', 'probe')`,
          [userA]
        )
      );
      // End to end: what the planted row would buy.
      const res = await request(app).get('/api/admin/access/grants').set(asMemberOfA());
      expect(res.status, 'the platform-admin gate admitted a plain member').toBe(403);
      expect(n, "A's scope wrote a platform role").toBe(0);
      expect(await activeGrants(userA)).toEqual([]);
    } finally {
      await owner.query('DELETE FROM platform_role_grants WHERE user_id = $1', [userA]);
    }
  });

  it('cannot reinstate, re-role or delete a grant', async () => {
    const g = await owner.query(
      `INSERT INTO platform_role_grants (user_id, role, granted_by, reason, revoked_at, revoked_by)
       VALUES ($1, 'support', 'fixture', 'revoked grant', now(), 'fixture') RETURNING id`,
      [userA]
    );
    const id = Number(g.rows[0].id);
    try {
      const reinstated = await written(() =>
        asA('UPDATE platform_role_grants SET revoked_at = NULL WHERE id = $1', [id])
      );
      const rerolled = await written(() =>
        asA("UPDATE platform_role_grants SET role = 'super_admin' WHERE user_id = $1", [operator])
      );
      const deleted = await written(() =>
        asA('DELETE FROM platform_role_grants WHERE user_id = $1', [operator])
      );
      expect({ reinstated, rerolled, deleted }).toEqual({ reinstated: 0, rerolled: 0, deleted: 0 });
      expect(await activeGrants(userA)).toEqual([]);
      expect(await activeGrants(operator)).toEqual(['super_admin']);
    } finally {
      await owner.query('DELETE FROM platform_role_grants WHERE id = $1', [id]);
      // A red run deletes or re-roles the operator's grant: put it back.
      await owner.query('DELETE FROM platform_role_grants WHERE user_id = $1', [operator]);
      await grantPlatformRole(operator, 'super_admin');
    }
  });
});

describe('what still works (D3)', () => {
  it("a tenant scope reads grants: the platform-admin check runs in the caller's own scope", async () => {
    const { rows } = await asA(
      'SELECT role FROM platform_role_grants WHERE user_id = $1 AND revoked_at IS NULL',
      [operator]
    );
    expect(rows).toEqual([{ role: 'super_admin' }]);
  });

  it('the platform scope grants and revokes', async () => {
    try {
      expect(
        await written(() =>
          asPlatform(
            `INSERT INTO platform_role_grants (user_id, role, granted_by, reason)
             VALUES ($1, 'support', 'platform scope', 'contract')`,
            [userA]
          )
        )
      ).toBe(1);
      expect(
        await written(() =>
          asPlatform(
            `UPDATE platform_role_grants SET revoked_at = now(), revoked_by = 'contract'
              WHERE user_id = $1 AND role = 'support'`,
            [userA]
          )
        )
      ).toBe(1);
    } finally {
      await owner.query('DELETE FROM platform_role_grants WHERE user_id = $1', [userA]);
    }
  });

  it('a platform operator grants and revokes through the Access Management console', async () => {
    const op = auth(accessToken(operator, ORG_A, 'member'));
    try {
      const granted = await request(app)
        .post('/api/admin/access/grants')
        .set(op)
        .send({ userId: userA, role: 'support', reason: 'contract: grant through the console' });
      expect(granted.status, JSON.stringify(granted.body).slice(0, 300)).toBe(200);
      expect(await activeGrants(userA)).toEqual(['support']);

      const revoked = await request(app)
        .delete(`/api/admin/access/grants/${granted.body.id}`)
        .set(op)
        .send({ reason: 'contract: revoke through the console' });
      expect(revoked.status, JSON.stringify(revoked.body).slice(0, 300)).toBe(200);
      expect(await activeGrants(userA)).toEqual([]);
    } finally {
      await owner.query('DELETE FROM platform_role_grants WHERE user_id = $1', [userA]);
    }
  });
});
