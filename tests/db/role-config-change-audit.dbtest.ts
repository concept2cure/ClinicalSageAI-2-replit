/**
 * P1-49 (DP-58; 21 CFR 11.10(e), EU GMP Annex 11 §12.4): a role or
 * configuration change made by an identity provider or by the AnA platform
 * controller is recorded in the change's own transaction, as the in-product
 * changes are (P1-41) — so a change whose record cannot be written does not
 * happen.
 *
 *   scim.ts  PATCH /Groups/:id       member_role_changed, one chained audit_logs
 *                                    row per membership changed
 *   scim.ts  POST/PUT/PATCH/DELETE   scim.user.* audit_events row, in the write's
 *            /Users[/:id]            transaction (provision, deactivate, remove
 *                                    this organisation's membership)
 *   ana-platform-control.ts          tenant_settings_changed through the one
 *   PATCH /settings, /modules/toggle settings writer tenant-config uses
 *
 * Fix round: the connector for Claude (P1-47, ADR-0014 §10) is its owner's
 * setting. An administrator naming `claudeConnector` on the controller's doors
 * (PATCH /settings, /ai-config, POST /execute) or on PATCH
 * /api/organizations/:id/settings is refused, stores nothing and writes no row.
 *
 * Mounted as production mounts them: SCIM at /scim/v2 under the system scope
 * (register-platform-routes.ts), the other two behind the global /api auth
 * boundary, on the runtime pool the suite asserts is app_service, NOSUPERUSER,
 * NOBYPASSRLS, with app.rls_enforce=on. "Same transaction" is read from the
 * database: the changed row and its record carry the same xmin.
 *
 * The only stand-ins are two refusal switches: one on writeChainedAuditRow, and
 * one on the INSERT INTO audit_events statement on whichever handle issues it.
 *
 * Lane "dbp149": organisations 94900 and 94901 (range 94900–94949); every email
 * starts `dbp149-`. Evidence: docs/evidence/D6/2026-10-01-tranche-4/P1-49-role-change-audit/.
 */
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';

const probe = vi.hoisted(() => ({ refuseChained: false, refuseEvents: false }));
vi.mock('../../server/services/auditService', async importOriginal => {
  const actual = await importOriginal<typeof import('../../server/services/auditService')>();
  return {
    ...actual,
    writeChainedAuditRow: async (...args: Parameters<typeof actual.writeChainedAuditRow>) => {
      if (probe.refuseChained) throw new Error('probe: the audit store refused the row');
      return actual.writeChainedAuditRow(...args);
    },
  };
});
vi.mock('../../server/db', async importOriginal => {
  const actual = await importOriginal<typeof import('../../server/db')>();
  const refused = (sql: unknown) => probe.refuseEvents && /INSERT INTO audit_events/i.test(String(sql));
  const refusal = () => Promise.reject(new Error('probe: the audit store refused the event'));
  type Q = { query: (sql: string, params?: unknown[]) => Promise<unknown> };
  return {
    ...actual,
    query: (sql: string, params?: unknown[]) => (refused(sql) ? refusal() : actual.query(sql, params)),
    transaction: <T>(cb: (client: Q) => Promise<T>) =>
      actual.transaction((client: Q) =>
        cb({ query: (sql: string, params?: unknown[]) => (refused(sql) ? refusal() : client.query(sql, params)) })
      ),
  };
});

import express from 'express';
import request from 'supertest';
import { Pool } from 'pg';
import { databaseUrl } from '../setup.db';
import { getPool } from '../../server/db/runtime';
import { runWithTenantScope } from '../../server/db/tenantStore';
import { createAuthBoundary } from '../../server/middleware/authBoundary';
import { establishRequestSystemScope } from '../../server/middleware/establishRequestTenantScope';
import { invalidateOrgMembershipCache } from '../../server/middleware/orgMembership';
import scimRouter from '../../server/routes/scim';
import tenantConfig from '../../server/routes/tenant-config';
import anaPlatformControl from '../../server/routes/ana-platform-control';
import organizationsRoutes from '../../server/routes/organizations-routes';
import { CONNECTOR_NOT_A_GENERAL_SETTING } from '../../server/mcp/auth/connector-enablement';
import { deriveChainHash, hashPayload } from '../../server/services/audit/chain';
import { GENESIS_PREVIOUS_HASH } from '../../server/services/audit/audit-hmac-seal';
import { accessToken, auth } from './two-tenant-fixture';

const ORG = 94900;
const OTHER_ORG = 94901;
const ORGS = [ORG, OTHER_ORG];
const RUN = `${process.pid}_${Date.now().toString(36)}`;
const SCIM_TOKEN = `dbp149-scim-token-${RUN}`;
const scim = () => ({ Authorization: `Bearer ${SCIM_TOKEN}` });
const PATCH_OP = 'urn:ietf:params:scim:api:messages:2.0:PatchOp';
const SEEDED_SETTINGS = {
  security: { mfaRequired: false, sessionTimeoutMinutes: 45, maxConcurrentSessions: 2 },
  anaToolPolicy: { deny: ['send_external_email'] },
};

let owner: Pool;
let app: express.Express;
const user: Record<'admin' | 'member' | 'leaver' | 'shared' | 'putLeaver', number> = {
  admin: 0, member: 0, leaver: 0, shared: 0, putLeaver: 0,
};
const savedEnv = { token: process.env.SCIM_BEARER_TOKEN, org: process.env.SCIM_ORG_ID, tenants: process.env.SCIM_TENANTS };

async function seedUser(label: string, orgs: Array<[number, string]>): Promise<number> {
  const u = await owner.query(
    `INSERT INTO users (email,name,password_hash,default_organization_id,status)
     VALUES ($1,$2,'not-a-real-password',$3,'active') RETURNING id`,
    [`dbp149-${label}-${RUN}@example.invalid`, `P149 ${label}`, orgs[0][0]]
  );
  const id = Number(u.rows[0].id);
  for (const [org, role] of orgs) {
    await owner.query('INSERT INTO organization_users (organization_id,user_id,role) VALUES ($1,$2,$3)', [org, id, role]);
  }
  return id;
}

beforeAll(async () => {
  owner = new Pool({ connectionString: databaseUrl, max: 2 });
  const identity = await runWithTenantScope(
    { tenantId: String(ORG), role: 'member', source: 'test', caller: 'dbp149-role-posture' },
    () =>
      getPool().query(`SELECT current_setting('is_superuser')::boolean AS superuser, r.rolbypassrls,
              current_setting('app.rls_enforce', true) AS enforcement
         FROM pg_roles r WHERE r.rolname = current_user`)
  );
  expect(identity.rows).toEqual([{ superuser: false, rolbypassrls: false, enforcement: 'on' }]);
  for (const id of ORGS) {
    await owner.query(
      `INSERT INTO organizations (id,name,slug,status,payment_status,settings)
       VALUES ($1,$2,$2,'active','active',$3::json)
       ON CONFLICT (id) DO UPDATE SET status='active', payment_status='active', settings=EXCLUDED.settings`,
      [id, `dbp149-${id}`, JSON.stringify(SEEDED_SETTINGS)]
    );
  }
  user.admin = await seedUser('admin', [[ORG, 'admin']]);
  user.member = await seedUser('member', [[ORG, 'member']]);
  user.leaver = await seedUser('leaver', [[ORG, 'member']]);
  user.putLeaver = await seedUser('put-leaver', [[ORG, 'member']]);
  user.shared = await seedUser('shared', [[ORG, 'member'], [OTHER_ORG, 'member']]);

  process.env.SCIM_BEARER_TOKEN = SCIM_TOKEN;
  process.env.SCIM_ORG_ID = String(ORG);
  delete process.env.SCIM_TENANTS;

  app = express();
  app.use(express.json());
  app.use('/scim/v2', establishRequestSystemScope, scimRouter);
  app.use('/api', createAuthBoundary());
  app.use('/api/tenant-config', tenantConfig);
  app.use('/api/ana/platform', anaPlatformControl);
  app.use('/api/organizations', organizationsRoutes);
}, 60_000);

afterAll(async () => {
  for (const [key, value] of [
    ['SCIM_BEARER_TOKEN', savedEnv.token],
    ['SCIM_ORG_ID', savedEnv.org],
    ['SCIM_TENANTS', savedEnv.tenants],
  ] as const) {
    if (value === undefined) delete process.env[key];
    else process.env[key] = value;
  }
  invalidateOrgMembershipCache();
  if (!owner) return;
  const c = await owner.connect();
  try {
    // Append-only stores: the no-delete triggers off for this transaction only.
    await c.query('BEGIN');
    await c.query('ALTER TABLE audit_logs DISABLE TRIGGER trg_audit_logs_no_delete');
    await c.query('ALTER TABLE audit_events DISABLE TRIGGER trg_audit_events_no_delete');
    await c.query('DELETE FROM audit_logs WHERE tenant_id = ANY($1::int[])', [ORGS]);
    await c.query('DELETE FROM audit_events WHERE organization_id = ANY($1::int[])', [ORGS]);
    await c.query('ALTER TABLE audit_events ENABLE TRIGGER trg_audit_events_no_delete');
    await c.query('ALTER TABLE audit_logs ENABLE TRIGGER trg_audit_logs_no_delete');
    await c.query('COMMIT');
  } catch (err) {
    await c.query('ROLLBACK').catch(() => undefined);
    console.warn('[dbp149] audit cleanup incomplete:', err);
  } finally {
    c.release();
  }
  try {
    await owner.query('DELETE FROM organization_users WHERE organization_id = ANY($1::int[])', [ORGS]);
    await owner.query("DELETE FROM users WHERE email LIKE 'dbp149-%'");
    await owner.query('DELETE FROM organizations WHERE id = ANY($1::int[])', [ORGS]);
  } catch (err) {
    console.warn('[dbp149] fixture cleanup incomplete:', err);
  }
  await owner.end();
});

const one = async (sql: string, params: unknown[]) => (await owner.query(sql, params)).rows[0] ?? null;
const roleOf = async (id: number) =>
  (await one('SELECT role FROM organization_users WHERE organization_id = $1 AND user_id = $2', [ORG, id]))?.role ?? null;
const membershipXmin = async (id: number) =>
  (await one('SELECT xmin::text AS x FROM organization_users WHERE organization_id = $1 AND user_id = $2', [ORG, id]))?.x;
const statusOf = async (id: number) => (await one('SELECT status FROM users WHERE id = $1', [id]))?.status;
const settingsOf = async () => (await one('SELECT settings FROM organizations WHERE id = $1', [ORG]))?.settings;

interface AuditRow {
  id: string;
  xmin: string;
  tenant_id: number;
  action: string;
  actor_id: number | null;
  target: string;
  record_id: string;
  table_name: string;
  payload_hash: string;
  occurred_at: Date;
  sha256_chain: string;
  chain_seq: string | null;
  reason: string | null;
  ip_address: string | null;
  user_agent: string | null;
  new_values: Record<string, any>;
}

async function auditRows(action: string, recordId?: string): Promise<AuditRow[]> {
  const { rows } = await owner.query(
    `SELECT id::text, xmin::text, tenant_id, action, actor_id, target, record_id, table_name, payload_hash,
            occurred_at, sha256_chain, chain_seq::text, reason, ip_address, user_agent, new_values
       FROM audit_logs
      WHERE tenant_id = $1 AND action = $2 AND ($3::text IS NULL OR record_id = $3)
      ORDER BY chain_seq NULLS LAST, occurred_at, id`,
    [ORG, action, recordId ?? null]
  );
  return rows as AuditRow[];
}

async function events(eventType: string, userId: number): Promise<Array<{ xmin: string; reason: string }>> {
  const { rows } = await owner.query(
    `SELECT xmin::text, reason FROM audit_events
      WHERE organization_id = $1 AND event_type = $2 AND entity_id = $3 ORDER BY id`,
    [ORG, eventType, userId]
  );
  return rows;
}

/** The row is the next link of its organisation's chain: its hash derives from the head before it. */
async function expectChainedOnOwnChain(row: AuditRow): Promise<void> {
  expect(row.tenant_id).toBe(ORG);
  expect(row.chain_seq, 'sequenced on the tenant chain').not.toBeNull();
  expect(row.payload_hash).toBe(hashPayload(row.new_values));
  const prev = await one(
    `SELECT sha256_chain FROM audit_logs
      WHERE tenant_id = $1 AND sha256_chain IS NOT NULL AND chain_seq < $2::bigint
      ORDER BY chain_seq DESC LIMIT 1`,
    [ORG, row.chain_seq]
  );
  const { action, actor_id, target, payload_hash, occurred_at } = row;
  expect(
    deriveChainHash({ action, actor_id, target, payload_hash, occurred_at }, prev?.sha256_chain ?? GENESIS_PREVIOUS_HASH),
    "the row links to its organisation's chain head"
  ).toBe(row.sha256_chain);
}

const groupPatch = (group: string, op: string, ids: number[]) =>
  request(app)
    .patch(`/scim/v2/Groups/${group}`)
    .set(scim())
    .send({ schemas: [PATCH_OP], Operations: [{ op, path: 'members', value: ids.map(id => ({ value: String(id) })) }] });

async function refusing<T>(which: 'refuseChained' | 'refuseEvents', send: () => Promise<T>): Promise<T> {
  probe[which] = true;
  try {
    return await send();
  } finally {
    probe[which] = false;
  }
}

describe('a role change through a SCIM group (DP-58)', () => {
  it('when its audit row cannot be written, the role stays as it was', async () => {
    const res = await refusing('refuseChained', () => groupPatch('admin', 'add', [user.member]));
    expect(res.status).toBe(500);
    expect(JSON.stringify(res.body)).not.toContain('probe');
    expect(await roleOf(user.member), 'the role change outlived its missing audit row').toBe('member');
    expect(await auditRows('member_role_changed', String(user.member))).toHaveLength(0);
  });

  it("an added member: one chained row on the organisation's chain, written by the change's own transaction", async () => {
    const res = await groupPatch('admin', 'add', [user.member]);
    expect(res.status, JSON.stringify(res.body)).toBe(200);
    expect(await roleOf(user.member)).toBe('admin');
    const rows = await auditRows('member_role_changed', String(user.member));
    expect(rows, 'one row for one change').toHaveLength(1);
    expect(rows[0]).toMatchObject({
      table_name: 'organization_users',
      record_id: String(user.member),
      actor_id: null,
      new_values: { targetUserId: user.member, previousRole: 'member', newRole: 'admin' },
    });
    expect(rows[0].reason).toMatch(/SCIM/);
    expect(rows[0].xmin, 'the role and its record were written by one transaction').toBe(await membershipXmin(user.member));
    await expectChainedOnOwnChain(rows[0]);
  });

  it('a member already in the group: nothing changes, nothing is recorded', async () => {
    const res = await groupPatch('admin', 'add', [user.member]);
    expect(res.status, JSON.stringify(res.body)).toBe(200);
    expect(await auditRows('member_role_changed', String(user.member))).toHaveLength(1);
  });

  it('a removed member is set to member, with the role it held recorded', async () => {
    const res = await groupPatch('admin', 'remove', [user.member]);
    expect(res.status, JSON.stringify(res.body)).toBe(200);
    expect(await roleOf(user.member)).toBe('member');
    const rows = await auditRows('member_role_changed', String(user.member));
    expect(rows).toHaveLength(2);
    expect(rows[1].new_values).toMatchObject({ previousRole: 'admin', newRole: 'member' });
    expect(rows[1].xmin).toBe(await membershipXmin(user.member));
    await expectChainedOnOwnChain(rows[1]);
  });

  it('removal from a group the member is not in changes nothing and records nothing', async () => {
    const res = await groupPatch('manager', 'remove', [user.member]);
    expect(res.status, JSON.stringify(res.body)).toBe(200);
    expect(await roleOf(user.member)).toBe('member');
    expect(await auditRows('member_role_changed', String(user.member))).toHaveLength(2);
  });
});

describe('SCIM account writes record their event in the same transaction (auditScim)', () => {
  it('DELETE: a refused event leaves the account active; otherwise status and event share a transaction', async () => {
    const refused = await refusing('refuseEvents', () =>
      request(app).delete(`/scim/v2/Users/${user.leaver}`).set(scim())
    );
    expect(refused.status).toBe(500);
    expect(await statusOf(user.leaver), 'the deactivation outlived its missing record').toBe('active');
    expect(await events('scim.user.deactivated', user.leaver)).toHaveLength(0);

    const res = await request(app).delete(`/scim/v2/Users/${user.leaver}`).set(scim());
    expect(res.status).toBe(204);
    expect(await statusOf(user.leaver)).toBe('inactive');
    const rows = await events('scim.user.deactivated', user.leaver);
    expect(rows).toHaveLength(1);
    expect(rows[0].xmin).toBe((await one('SELECT xmin::text AS x FROM users WHERE id = $1', [user.leaver]))?.x);
  });

  it('PUT active=false: a refused event leaves the account active', async () => {
    const body = { userName: `dbp149-put-leaver-${RUN}@example.invalid`, active: false };
    const refused = await refusing('refuseEvents', () =>
      request(app).put(`/scim/v2/Users/${user.putLeaver}`).set(scim()).send(body)
    );
    expect(refused.status).toBe(500);
    expect(await statusOf(user.putLeaver)).toBe('active');
    const res = await request(app).put(`/scim/v2/Users/${user.putLeaver}`).set(scim()).send(body);
    expect(res.status, JSON.stringify(res.body)).toBe(200);
    expect(await statusOf(user.putLeaver)).toBe('inactive');
    expect(await events('scim.user.deactivated', user.putLeaver)).toHaveLength(1);
  });

  it("PATCH active=false on a shared account: a refused event leaves this organisation's membership", async () => {
    const send = () =>
      request(app)
        .patch(`/scim/v2/Users/${user.shared}`)
        .set(scim())
        .send({ schemas: [PATCH_OP], Operations: [{ op: 'replace', path: 'active', value: false }] });
    expect((await refusing('refuseEvents', send)).status).toBe(500);
    expect(await roleOf(user.shared), 'the removal outlived its missing record').toBe('member');
    const res = await send();
    expect(res.status, JSON.stringify(res.body)).toBe(200);
    expect(await roleOf(user.shared)).toBeNull();
    expect(await statusOf(user.shared), 'the account stays active for its other organisation').toBe('active');
    expect(await events('scim.user.deactivated', user.shared)).toHaveLength(1);
  });

  it('POST: a refused event provisions nobody; otherwise membership and event share a transaction', async () => {
    const email = `dbp149-provisioned-${RUN}@example.invalid`;
    const send = () => request(app).post('/scim/v2/Users').set(scim()).send({ userName: email, active: true });
    expect((await refusing('refuseEvents', send)).status).toBe(500);
    expect(await one('SELECT id FROM users WHERE email = $1', [email]), 'the account outlived its missing record').toBeNull();

    const res = await send();
    expect(res.status, JSON.stringify(res.body)).toBe(201);
    const id = Number(res.body.id);
    const rows = await events('scim.user.provisioned', id);
    expect(rows).toHaveLength(1);
    expect(rows[0].xmin).toBe(await membershipXmin(id));
  });
});

describe('the AnA platform controller writes settings through the tenant settings writer (DP-58)', () => {
  const asAdmin = () => auth(accessToken(user.admin, ORG, 'admin'));

  it('when its audit row cannot be written, the settings stay as they were', async () => {
    const before = await settingsOf();
    const res = await refusing('refuseChained', () =>
      request(app).patch('/api/ana/platform/settings').set(asAdmin()).send({ defaultModel: 'dbp149-model' })
    );
    expect(res.status).toBe(500);
    expect(JSON.stringify(res.body)).not.toContain('probe');
    expect(await settingsOf()).toEqual(before);
    expect(await auditRows('tenant_settings_changed')).toHaveLength(0);
  });

  it('a settings change writes the record the tenant configuration route writes, and keeps what it does not name', async () => {
    const viaRoute = await request(app)
      .patch(`/api/tenant-config/${ORG}/settings/security`)
      .set(asAdmin())
      .send({ mfaRequired: true });
    expect(viaRoute.status, JSON.stringify(viaRoute.body)).toBe(200);
    const viaController = await request(app)
      .patch('/api/ana/platform/settings')
      .set(asAdmin())
      .send({ security: { mfaRequired: false } });
    expect(viaController.status, JSON.stringify(viaController.body)).toBe(200);

    const [route, controller] = await auditRows('tenant_settings_changed');
    expect(controller, 'the controller wrote no tenant_settings_changed row').toBeDefined();
    for (const key of ['action', 'table_name', 'record_id', 'actor_id', 'ip_address', 'user_agent'] as const) {
      expect(controller[key], key).toEqual(route[key]);
    }
    expect(Object.keys(controller.new_values).sort()).toEqual(Object.keys(route.new_values).sort());
    expect(controller.new_values).toMatchObject({
      sections: ['security'],
      changedFields: { security: ['mfaRequired'] },
      values: { security: { before: { mfaRequired: true }, after: { mfaRequired: false } } },
    });
    expect(controller.xmin).toBe((await one('SELECT xmin::text AS x FROM organizations WHERE id = $1', [ORG]))?.x);
    await expectChainedOnOwnChain(controller);

    const stored = await settingsOf();
    expect(stored.security, 'the section keeps the fields the change did not name').toMatchObject({
      mfaRequired: false,
      sessionTimeoutMinutes: 45,
      maxConcurrentSessions: 2,
    });
    expect(stored.anaToolPolicy).toEqual(SEEDED_SETTINGS.anaToolPolicy);
  });

  it('a module toggle is recorded by the same writer', async () => {
    const res = await request(app)
      .post('/api/ana/platform/modules/toggle')
      .set(asAdmin())
      .send({ moduleId: 'cmc_blueprint', enabled: false });
    expect(res.status, JSON.stringify(res.body)).toBe(200);
    const rows = await auditRows('tenant_settings_changed');
    expect(rows[rows.length - 1].new_values).toMatchObject({ sections: ['disabledModules', 'enabledModules'] });
    expect((await settingsOf()).disabledModules).toEqual(['cmc_blueprint']);
  });
});

/*
 * Fix round (2026-10-01). The connector for Claude has one door, its owner's
 * (PUT /api/tenant-config/:id/claude-connector, P1-47; ADR-0014 §10), and the
 * connector reads the key live. updateSettings wrote any top-level key for an
 * owner or an administrator, so an administrator could open the connector
 * through this controller, recorded as an ordinary settings change; so could
 * PATCH /api/organizations/:id/settings. Each door now refuses a body that
 * names the key, whole: nothing is stored, not even the other keys beside it,
 * and nothing is recorded, because nothing changed.
 */
describe('the connector for Claude is not a general setting on these doors (P1-47, ADR-0014 §10)', () => {
  const asAdmin = () => auth(accessToken(user.admin, ORG, 'admin'));
  const CONNECTOR = { claudeConnector: { enabled: true } };
  const execute = (category: string, parameters: object) => ({
    id: 'dbp149-connector',
    category,
    action: 'update',
    description: 'dbp149 administrator attempt',
    requiresConfirmation: false,
    parameters,
  });
  const auditCount = async () =>
    Number((await one('SELECT count(*)::int AS n FROM audit_logs WHERE tenant_id = $1', [ORG]))?.n);

  const DOORS: Array<[door: string, send: () => request.Test]> = [
    ['PATCH /api/ana/platform/settings', () => request(app).patch('/api/ana/platform/settings').set(asAdmin()).send(CONNECTOR)],
    [
      'PATCH /api/ana/platform/settings, beside another key',
      () => request(app).patch('/api/ana/platform/settings').set(asAdmin()).send({ ...CONNECTOR, defaultModel: 'dbp149-beside' }),
    ],
    ['PATCH /api/ana/platform/ai-config', () => request(app).patch('/api/ana/platform/ai-config').set(asAdmin()).send(CONNECTOR)],
    [
      'POST /api/ana/platform/execute (settings)',
      () => request(app).post('/api/ana/platform/execute').set(asAdmin()).send(execute('settings', CONNECTOR)),
    ],
    [
      'POST /api/ana/platform/execute (ai_config)',
      () => request(app).post('/api/ana/platform/execute').set(asAdmin()).send(execute('ai_config', CONNECTOR)),
    ],
    [
      'PATCH /api/organizations/:id/settings (with a reason)',
      () =>
        request(app)
          .patch(`/api/organizations/${ORG}/settings`)
          .set(asAdmin())
          .send({ settings: CONNECTOR, reason: 'dbp149 administrator attempt' }),
    ],
    [
      'PATCH /api/organizations/:id/settings (bare)',
      () => request(app).patch(`/api/organizations/${ORG}/settings`).set(asAdmin()).send(CONNECTOR),
    ],
  ];

  it.each(DOORS)('%s naming the connector: 403, nothing stored, no row written', async (_door, send) => {
    const before = await settingsOf();
    const rowsBefore = await auditCount();
    const res = await send();
    expect(res.status, JSON.stringify(res.body)).toBe(403);
    expect(res.body).toMatchObject({ success: false, error: CONNECTOR_NOT_A_GENERAL_SETTING });
    const after = await settingsOf();
    expect(after, 'the settings changed').toEqual(before);
    expect(after.claudeConnector, 'the connector key was stored').toBeUndefined();
    expect(await auditCount(), 'a row was written for a change that was not made').toBe(rowsBefore);
  });

  it('control: the same administrator, on the same doors, still changes another setting', async () => {
    const viaController = await request(app).patch('/api/ana/platform/settings').set(asAdmin()).send({ defaultModel: 'dbp149-control' });
    expect(viaController.status, JSON.stringify(viaController.body)).toBe(200);
    const viaExecute = await request(app)
      .post('/api/ana/platform/execute')
      .set(asAdmin())
      .send(execute('settings', { weeklyDigestEnabled: true }));
    expect(viaExecute.status, JSON.stringify(viaExecute.body)).toBe(200);
    const viaOrganizations = await request(app)
      .patch(`/api/organizations/${ORG}/settings`)
      .set(asAdmin())
      .send({ settings: { dbp149Probe: 'control' }, reason: 'dbp149 control' });
    expect(viaOrganizations.status, JSON.stringify(viaOrganizations.body)).toBe(200);
    expect(await settingsOf()).toMatchObject({ defaultModel: 'dbp149-control', weeklyDigestEnabled: true, dbp149Probe: 'control' });
    expect((await settingsOf()).claudeConnector).toBeUndefined();
  });
});
