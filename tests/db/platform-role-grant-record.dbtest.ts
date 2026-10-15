/**
 * DP-75 on PostgreSQL, as the runtime role with RLS on: a platform role grant
 * and its chained audit row (tenant 0, the platform chain) commit together,
 * under the system scope /api/admin/access runs in (SYSTEM_SCOPE_PREFIXES);
 * when the row is refused the grant rolls back with it. A revocation stands
 * and says whether its row was written.
 *
 * Mounted as server/bootstrap/register-admin-routes.ts mounts it, behind the
 * system scope the global gate opens for that prefix. The caller is a member
 * of organisation A holding a platform_role_grants row, so the real
 * authMiddleware and requirePlatformAdmin admit it.
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import express from 'express';
import request from 'supertest';
import { establishRequestSystemScope } from '../../server/middleware/establishRequestTenantScope';
import accessRouter from '../../server/routes/admin/access-management';
import { getPool } from '../../server/db/runtime';
import { runWithSystemTenantScope } from '../../server/db/tenantStore';
import {
  TAG,
  ORG_A,
  owner,
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

const REFUSE_FN = `dp75_refuse_grant_row_${process.pid}`;

describe('a platform role grant and its record commit together (DP-75)', () => {
  let app: express.Express;
  let operator: number;
  const grant = (role: string, reason: string) =>
    request(app)
      .post('/api/admin/access/grants')
      .set(auth(accessToken(operator, ORG_A, 'member')))
      .send({ userId: userB, role, reason });
  const grantRows = async (role: string) =>
    (await owner.query('SELECT id, revoked_at FROM platform_role_grants WHERE user_id = $1 AND role = $2', [userB, role])).rows;
  const records = async (role: string) =>
    (
      await owner.query(
        `SELECT new_values::jsonb AS details, sha256_chain IS NOT NULL AS chained, tenant_id FROM audit_logs
          WHERE table_name = 'platform_role_grant' AND record_id = $1 ORDER BY occurred_at`,
        [`${userB}:${role}`]
      )
    ).rows;

  beforeAll(async () => {
    app = express();
    app.use(express.json());
    app.use('/api/admin/access', establishRequestSystemScope, accessRouter);
    operator = await provisionMember(ORG_A, 'member', 'dp75-operator');
    await grantPlatformRole(operator, 'super_admin');
  });

  it('runs as a role RLS applies to (not the owner, not BYPASSRLS)', async () => {
    const r = await runWithSystemTenantScope('platform-role-grant-record.dbtest', () =>
      getPool().query(`SELECT current_user AS who, r.rolsuper, r.rolbypassrls FROM pg_roles r WHERE r.rolname = current_user`)
    );
    expect(r.rows[0]).toMatchObject({ rolsuper: false, rolbypassrls: false });
    expect(r.rows[0].who).not.toBe('postgres');
  });

  it('writes the grant and one chained platform row with its reason', async () => {
    const res = await grant('support', `${TAG} onboard support`);
    expect(res.status, JSON.stringify(res.body)).toBe(200);
    expect(await grantRows('support')).toHaveLength(1);
    const rows = await records('support');
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({
      chained: true,
      tenant_id: 0,
      details: { accessAction: 'role.grant', role: 'support', reason: `${TAG} onboard support` },
    });
  });

  it('when the record is refused, nothing is granted: 503, no grant row, no record', async () => {
    await owner.query(
      `CREATE FUNCTION ${REFUSE_FN}() RETURNS trigger LANGUAGE plpgsql AS $$
       BEGIN IF NEW.table_name = 'platform_role_grant' THEN RAISE EXCEPTION 'refused by the DP-75 dbtest'; END IF; RETURN NEW; END $$`
    );
    await owner.query(`CREATE TRIGGER ${REFUSE_FN} BEFORE INSERT ON audit_logs FOR EACH ROW EXECUTE FUNCTION ${REFUSE_FN}()`);
    try {
      const res = await grant('platform_admin', `${TAG} should not stand`);
      expect(res.status, JSON.stringify(res.body)).toBe(503);
      expect(res.body.code).toBe('GRANT_NOT_RECORDED');
      expect(JSON.stringify(res.body)).not.toContain('refused by the DP-75 dbtest');
    } finally {
      await owner.query(`DROP TRIGGER IF EXISTS ${REFUSE_FN} ON audit_logs`);
      await owner.query(`DROP FUNCTION IF EXISTS ${REFUSE_FN}()`);
    }
    expect(await grantRows('platform_admin')).toEqual([]);
    expect(await records('platform_admin')).toEqual([]);
  });

  it('a revocation stands and says its row was written', async () => {
    const [{ id }] = await grantRows('support');
    const res = await request(app)
      .delete(`/api/admin/access/grants/${id}`)
      .set(auth(accessToken(operator, ORG_A, 'member')))
      .send({ reason: `${TAG} offboarding` });
    expect(res.status, JSON.stringify(res.body)).toBe(200);
    expect(res.body.auditTrail).toEqual({ persisted: true, chained: true });
    const [row] = await grantRows('support');
    expect(row.revoked_at).not.toBeNull();
    expect((await records('support')).map(r => r.details.accessAction)).toEqual(['role.grant', 'role.revoke']);
  });

});
