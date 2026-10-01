/**
 * P1-41 (DP-49, DP-57): an administrator's access and configuration changes
 * each leave one chained audit row on the organisation's own chain, written in
 * the same transaction as the change — so a change whose row cannot be written
 * does not happen.
 *
 *   tenant-users.ts   PATCH  /:organizationId/:userId   member_role_changed
 *                     DELETE /:organizationId/:userId   member_removed
 *   tenant-config.ts  PATCH  /:tenantId/settings[/:section], POST …/settings/reset
 *                                                       tenant_settings_changed / _reset
 *
 * Mounted as production mounts them (the global /api auth boundary, then each
 * router at its registered path), on the runtime pool the fixture asserts is
 * app_service, NOSUPERUSER, NOBYPASSRLS, with app.rls_enforce=on. The only
 * stand-in is a switch on writeChainedAuditRow that makes it refuse, to show a
 * refused audit row takes the change down with it; otherwise the real writer runs.
 *
 * Evidence: docs/evidence/D6/2026-10-01-tranche-4/P1-41/.
 */
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';

const probe = vi.hoisted(() => ({ refuseAudit: false }));
vi.mock('../../server/services/auditService', async importOriginal => {
  const actual = await importOriginal<typeof import('../../server/services/auditService')>();
  return {
    ...actual,
    writeChainedAuditRow: async (...args: Parameters<typeof actual.writeChainedAuditRow>) => {
      if (probe.refuseAudit) throw new Error('probe: the audit store refused the row');
      return actual.writeChainedAuditRow(...args);
    },
  };
});

import express from 'express';
import request from 'supertest';
import { createAuthBoundary } from '../../server/middleware/authBoundary';
import tenantUsers from '../../server/routes/tenant-users';
import tenantConfig from '../../server/routes/tenant-config';
import { deriveChainHash, hashPayload } from '../../server/services/audit/chain';
import { GENESIS_PREVIOUS_HASH } from '../../server/services/audit/audit-hmac-seal';
import {
  TAG,
  ORG_A,
  ORG_B,
  FIXTURE_ORGS,
  owner,
  accessToken,
  auth,
  provisionMember,
  provisionTwoTenantFixture,
  teardownTwoTenantFixture,
} from './two-tenant-fixture';

let app: express.Express;
let admin = 0; // org A's administrator, the actor of every change here
let member = 0; // the org A member whose access changes
let originalSettings: unknown = null;
const asAdmin = () => auth(accessToken(admin, ORG_A, 'admin'));
const REASON = `${TAG} quarterly access review`;

beforeAll(async () => {
  await provisionTwoTenantFixture();
  admin = await provisionMember(ORG_A, 'admin', 'p141-admin');
  member = await provisionMember(ORG_A, 'member', 'p141-member');
  originalSettings = (await owner.query('SELECT settings FROM organizations WHERE id = $1', [ORG_A])).rows[0]
    ?.settings;
  app = express();
  app.use(express.json());
  app.use('/api', createAuthBoundary());
  app.use('/api/tenant-users', tenantUsers);
  app.use('/api/tenant-config', tenantConfig);
}, 60_000);

afterAll(async () => {
  if (owner) {
    await restoreSettings();
    await owner.query('DELETE FROM organization_users WHERE user_id = ANY($1::int[])', [[admin, member]]);
    // This run's own chain rows (its administrator is their only actor), removed the
    // way the fixture removes audit rows: the no-delete trigger off for this transaction only.
    const c = await owner.connect();
    try {
      await c.query('BEGIN');
      await c.query('ALTER TABLE audit_logs DISABLE TRIGGER trg_audit_logs_no_delete');
      await c.query('DELETE FROM audit_logs WHERE tenant_id = ANY($1::int[]) AND actor_id = $2', [FIXTURE_ORGS, admin]);
      await c.query('ALTER TABLE audit_logs ENABLE TRIGGER trg_audit_logs_no_delete');
      await c.query('COMMIT');
    } catch (err) {
      await c.query('ROLLBACK').catch(() => undefined);
      console.warn('[admin-change-audit] audit cleanup incomplete:', err);
    } finally {
      c.release();
    }
  }
  await teardownTwoTenantFixture();
});

async function restoreSettings(): Promise<void> {
  await owner.query('UPDATE organizations SET settings = $2 WHERE id = $1', [
    ORG_A,
    originalSettings == null ? null : JSON.stringify(originalSettings),
  ]);
}

const roleOf = async (userId: number) =>
  (
    await owner.query('SELECT role FROM organization_users WHERE organization_id = $1 AND user_id = $2', [
      ORG_A,
      userId,
    ])
  ).rows[0]?.role ?? null;

const settingsOf = async () =>
  (await owner.query('SELECT settings FROM organizations WHERE id = $1', [ORG_A])).rows[0]?.settings ?? {};

interface AuditRow {
  id: string;
  tenant_id: number;
  action: string;
  actor_id: number;
  target: string;
  record_id: string;
  table_name: string;
  payload_hash: string;
  occurred_at: Date;
  sha256_chain: string;
  chain_seq: string | null;
  reason: string | null;
  new_values: Record<string, any>;
}

/** Every row this run's administrator has written, on either organisation's chain. */
async function rowsByAdmin(action?: string): Promise<AuditRow[]> {
  const { rows } = await owner.query(
    `SELECT id::text, tenant_id, action, actor_id, target, record_id, table_name, payload_hash, occurred_at,
            sha256_chain, chain_seq::text, reason, new_values
       FROM audit_logs
      WHERE tenant_id = ANY($1::int[]) AND actor_id = $2 AND ($3::text IS NULL OR action = $3)
      ORDER BY chain_seq NULLS LAST, occurred_at, id`,
    [FIXTURE_ORGS, admin, action ?? null],
  );
  return rows as AuditRow[];
}

/** The row is the next link of its organisation's chain: its hash derives from the head before it. */
async function expectChainedOnOwnChain(row: AuditRow): Promise<void> {
  expect(row.tenant_id).toBe(ORG_A);
  expect(row.chain_seq, 'sequenced on the tenant chain').not.toBeNull();
  expect(row.sha256_chain).toMatch(/^[0-9a-f]{64}$/);
  expect(row.payload_hash).toBe(hashPayload(row.new_values));
  const prev = await owner.query(
    `SELECT sha256_chain FROM audit_logs
      WHERE tenant_id = $1 AND sha256_chain IS NOT NULL AND id::text <> $2 AND chain_seq < $3::bigint
      ORDER BY chain_seq DESC LIMIT 1`,
    [ORG_A, row.id, row.chain_seq],
  );
  const previous = (prev.rows[0]?.sha256_chain as string | undefined) ?? GENESIS_PREVIOUS_HASH;
  expect(
    deriveChainHash(
      { action: row.action, actor_id: row.actor_id, target: row.target, payload_hash: row.payload_hash, occurred_at: row.occurred_at },
      previous,
    ),
    "the row links to its organisation's chain head",
  ).toBe(row.sha256_chain);
}

describe("a member's role change (DP-49)", () => {
  it('without a reason: 400, the role unchanged, nothing recorded', async () => {
    const res = await request(app).patch(`/api/tenant-users/${ORG_A}/${member}`).set(asAdmin()).send({ role: 'viewer' });
    expect(res.status).toBe(400);
    expect(res.body.error).toBe('REASON_REQUIRED');
    expect(await roleOf(member)).toBe('member');
    expect(await rowsByAdmin()).toHaveLength(0);
  });

  it('when its audit row cannot be written, the role change is rolled back', async () => {
    probe.refuseAudit = true;
    try {
      const res = await request(app)
        .patch(`/api/tenant-users/${ORG_A}/${member}`)
        .set(asAdmin())
        .send({ role: 'viewer', reason: REASON });
      expect(res.status).toBe(500);
      expect(JSON.stringify(res.body)).not.toContain('probe');
    } finally {
      probe.refuseAudit = false;
    }
    expect(await roleOf(member), 'the change outlived its missing audit row').toBe('member');
    expect(await rowsByAdmin()).toHaveLength(0);
  });

  it("writes exactly one chained row on the organisation's chain, with the roles, the member and the reason", async () => {
    const res = await request(app)
      .patch(`/api/tenant-users/${ORG_A}/${member}`)
      .set(asAdmin())
      .send({ role: 'viewer', reason: REASON });
    expect(res.status, JSON.stringify(res.body)).toBe(200);
    expect(await roleOf(member)).toBe('viewer');
    const rows = await rowsByAdmin();
    expect(rows, 'one row for one change').toHaveLength(1);
    expect(rows[0]).toMatchObject({
      action: 'member_role_changed',
      actor_id: admin,
      table_name: 'organization_users',
      record_id: String(member),
      reason: REASON,
      new_values: { targetUserId: member, previousRole: 'member', newRole: 'viewer', reason: REASON },
    });
    await expectChainedOnOwnChain(rows[0]);
    const onB = await owner.query('SELECT count(*)::int AS n FROM audit_logs WHERE tenant_id = $1 AND actor_id = $2', [ORG_B, admin]);
    expect(onB.rows[0].n).toBe(0);
  });
});

describe("a member's removal (DP-49)", () => {
  it('when its audit row cannot be written, the member stays', async () => {
    probe.refuseAudit = true;
    try {
      const res = await request(app).delete(`/api/tenant-users/${ORG_A}/${member}`).set(asAdmin()).send({ reason: REASON });
      expect(res.status).toBe(500);
    } finally {
      probe.refuseAudit = false;
    }
    expect(await roleOf(member), 'the removal outlived its missing audit row').toBe('viewer');
    expect(await rowsByAdmin('member_removed')).toHaveLength(0);
  });

  it('writes one chained row with the role the member held', async () => {
    const res = await request(app).delete(`/api/tenant-users/${ORG_A}/${member}`).set(asAdmin()).send({ reason: REASON });
    expect(res.status, JSON.stringify(res.body)).toBe(200);
    expect(await roleOf(member)).toBeNull();
    const rows = await rowsByAdmin('member_removed');
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({
      record_id: String(member),
      reason: REASON,
      new_values: { targetUserId: member, previousRole: 'viewer', newRole: null, reason: REASON },
    });
    await expectChainedOnOwnChain(rows[0]);
  });
});

describe('a tenant configuration change (DP-57)', () => {
  it('when its audit row cannot be written, the settings stay as they were', async () => {
    const before = await settingsOf();
    probe.refuseAudit = true;
    try {
      const res = await request(app)
        .patch(`/api/tenant-config/${ORG_A}/settings/security`)
        .set(asAdmin())
        .send({ mfaRequired: true, sessionTimeoutMinutes: 20 });
      expect(res.status).toBe(500);
    } finally {
      probe.refuseAudit = false;
    }
    expect(await settingsOf()).toEqual(before);
    expect(await rowsByAdmin('tenant_settings_changed')).toHaveLength(0);
  });

  it('a security change writes one chained row with the values before and after', async () => {
    try {
      const res = await request(app)
        .patch(`/api/tenant-config/${ORG_A}/settings/security`)
        .set(asAdmin())
        .send({ mfaRequired: true, sessionTimeoutMinutes: 20 });
      expect(res.status, JSON.stringify(res.body)).toBe(200);
      const rows = await rowsByAdmin('tenant_settings_changed');
      expect(rows).toHaveLength(1);
      expect(rows[0]).toMatchObject({
        table_name: 'organization_settings',
        record_id: String(ORG_A),
        new_values: {
          sections: ['security'],
          values: { security: { after: { mfaRequired: true, sessionTimeoutMinutes: 20 } } },
        },
      });
      await expectChainedOnOwnChain(rows[0]);
    } finally {
      await restoreSettings();
    }
  });

  it('a notifications change names the webhook field and never records its address', async () => {
    const secret = `https://hooks.example.invalid/${TAG}/s3cr3t-token`;
    try {
      const res = await request(app)
        .patch(`/api/tenant-config/${ORG_A}/settings/notifications`)
        .set(asAdmin())
        .send({ slackEnabled: true, slackWebhook: secret });
      expect(res.status, JSON.stringify(res.body)).toBe(200);
      const rows = await rowsByAdmin('tenant_settings_changed');
      expect(rows.length, 'the notifications change was recorded').toBeGreaterThan(0);
      const row = rows[rows.length - 1];
      expect(row.new_values).toMatchObject({ sections: ['notifications'] });
      expect(row.new_values.changedFields.notifications).toContain('slackWebhook');
      const stored = await owner.query('SELECT new_values::text AS t FROM audit_logs WHERE id::text = $1', [row.id]);
      expect(stored.rows[0].t).not.toContain('s3cr3t-token');
    } finally {
      await restoreSettings();
    }
  });

  it('a reset writes one tenant_settings_reset row with the retention values', async () => {
    try {
      const res = await request(app).post(`/api/tenant-config/${ORG_A}/settings/reset`).set(asAdmin()).send({});
      expect(res.status, JSON.stringify(res.body)).toBe(200);
      const rows = await rowsByAdmin('tenant_settings_reset');
      expect(rows).toHaveLength(1);
      expect(rows[0].new_values.sections).toContain('qmp');
      expect(rows[0].new_values.values.qmp.after).toHaveProperty('auditTrailRetentionDays');
      await expectChainedOnOwnChain(rows[0]);
    } finally {
      await restoreSettings();
    }
  });
});
