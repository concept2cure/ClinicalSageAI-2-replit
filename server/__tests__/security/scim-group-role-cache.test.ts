/**
 * A role an identity provider changes through a SCIM group is recorded in the
 * change's own transaction, and takes effect at the member's next request
 * (P1-49, DP-58; 21 CFR 11.10(e), EU GMP Annex 11 §12.4; security audit
 * 2026-09-24 IAM-04 (b) / IAM-10).
 *
 * PATCH /scim/v2/Groups/:role changes organization_users.role: `add` and
 * `replace` assign the group's role, `remove` demotes a member who holds it to
 * 'member'. Each change goes through changeMemberRole
 * (services/tenant/membership-change.ts), which writes the change's chained
 * audit row on the same client; the request's changes share one transaction
 * (a SCIM PATCH is atomic, RFC 7644 §3.5.2).
 *
 * The membership role is cached for 60 s per server task
 * (middleware/orgMembership.ts), so each member whose role changed is dropped
 * from that cache once the transaction has committed, as the tenant-users PATCH
 * does (c1f2cb9c) — and not when nothing changed or the audit row was refused,
 * because then nothing did.
 *
 * The data layer is a recorder: one ordered log of the transaction's
 * statements, the audit writes and the cache invalidations. No database is
 * needed; tests/db/role-config-change-audit.dbtest.ts proves the same on
 * PostgreSQL.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.hoisted(() => {
  process.env.NODE_ENV = process.env.NODE_ENV || 'test';
  process.env.SCIM_BEARER_TOKEN = 'test-scim-group-token-value';
  process.env.SCIM_ORG_ID = '7';
});

import express from 'express';
import request from 'supertest';

const h = vi.hoisted(() => ({
  log: [] as string[],
  roles: new Map<number, string>(),
  auditFails: false,
  audits: [] as Array<{ client: unknown; entry: Record<string, unknown> }>,
}));

const client = vi.hoisted(() => ({
  query: async (sql: string, params: unknown[] = []) => {
    if (/SELECT role FROM organization_users/i.test(sql)) {
      const role = h.roles.get(Number(params[1]));
      return { rows: role === undefined ? [] : [{ role }] };
    }
    if (/UPDATE organization_users SET role/i.test(sql)) {
      h.log.push(`UPDATE ${params[2]} ${params[0]}`);
      h.roles.set(Number(params[2]), String(params[0]));
      return { rows: [] };
    }
    return { rows: [] };
  },
}));

vi.mock('../../services/tenant/tenant-lifecycle.js', () => ({
  shouldProcessTenantInBackground: vi.fn(async () => true),
}));

vi.mock('../../db', () => ({
  query: client.query,
  transaction: async (cb: (c: unknown) => Promise<unknown>) => {
    h.log.push('BEGIN');
    try {
      const out = await cb(client);
      h.log.push('COMMIT');
      return out;
    } catch (err) {
      h.log.push('ROLLBACK');
      throw err;
    }
  },
}));

vi.mock('../../services/auditService', () => ({
  writeChainedAuditRow: async (c: unknown, entry: Record<string, unknown>) => {
    h.log.push(`AUDIT ${entry.resourceId}`);
    if (h.auditFails) throw new Error('probe: the audit store refused the row');
    h.audits.push({ client: c, entry });
  },
}));

vi.mock('../../middleware/orgMembership', () => ({
  invalidateOrgMembershipCache: (userId: number, orgId: number) => h.log.push(`INVALIDATE ${userId}@${orgId}`),
}));

const TOKEN = 'test-scim-group-token-value';
const ORG = 7;

let app: express.Express;

beforeEach(async () => {
  h.log = [];
  h.audits = [];
  h.auditFails = false;
  h.roles = new Map([
    [101, 'member'],
    [102, 'viewer'],
    [103, 'admin'],
    [104, 'admin'],
  ]);
  const router = (await import('../../routes/scim')).default;
  app = express();
  app.use(express.json({ type: ['application/json', 'application/scim+json'] }));
  app.use('/scim/v2', router);
});

const patchGroup = (role: string, op: string, ids: number[]) =>
  request(app)
    .patch(`/scim/v2/Groups/${role}`)
    .set('Authorization', `Bearer ${TOKEN}`)
    .send({
      schemas: ['urn:ietf:params:scim:api:messages:2.0:PatchOp'],
      Operations: [{ op, path: 'members', value: ids.map(id => ({ value: String(id) })) }],
    });

describe('a SCIM group role change: recorded in its transaction, then the cached role dropped', () => {
  it.each(['add', 'replace'])(
    '%s: each change and its audit row in one transaction; each changed member dropped after COMMIT',
    async op => {
      const res = await patchGroup('admin', op, [101, 102]);
      expect(res.status).toBe(200);
      expect(h.log).toEqual([
        'BEGIN',
        'UPDATE 101 admin',
        'AUDIT 101',
        'UPDATE 102 admin',
        'AUDIT 102',
        'COMMIT',
        `INVALIDATE 101@${ORG}`,
        `INVALIDATE 102@${ORG}`,
      ]);
      expect(h.audits.map(a => a.client)).toEqual([client, client]);
      expect(h.audits[0].entry).toMatchObject({
        tenantId: ORG,
        action: 'member_role_changed',
        resourceType: 'organization_users',
        resourceId: '101',
        details: { targetUserId: 101, previousRole: 'member', newRole: 'admin' },
      });
      expect(h.audits[0].entry.userId, 'no person made this change').toBeUndefined();
      expect(String(h.audits[0].entry.reason)).toMatch(/SCIM/);
    }
  );

  it('remove: a member holding the group role is demoted to member, recorded, and dropped after COMMIT', async () => {
    const res = await patchGroup('admin', 'remove', [103]);
    expect(res.status).toBe(200);
    expect(h.log).toEqual(['BEGIN', 'UPDATE 103 member', 'AUDIT 103', 'COMMIT', `INVALIDATE 103@${ORG}`]);
    expect(h.audits[0].entry.details).toMatchObject({ previousRole: 'admin', newRole: 'member' });
  });

  it('a member already holding the role, or not holding the removed one, changes nothing and drops nothing', async () => {
    expect((await patchGroup('admin', 'add', [103])).status).toBe(200);
    expect((await patchGroup('manager', 'remove', [101])).status).toBe(200);
    expect(h.log).toEqual(['BEGIN', 'COMMIT', 'BEGIN', 'COMMIT']);
  });

  it('a user who is not a member of this organisation is not given the role', async () => {
    expect((await patchGroup('admin', 'add', [999])).status).toBe(200);
    expect(h.log).toEqual(['BEGIN', 'COMMIT']);
    expect(h.roles.has(999)).toBe(false);
  });

  it('a refused audit row rolls the whole request back: 500, nothing dropped, no detail leaked', async () => {
    h.auditFails = true;
    const res = await patchGroup('admin', 'add', [101, 102]);
    expect(res.status).toBe(500);
    expect(JSON.stringify(res.body)).not.toContain('probe');
    expect(h.log).toEqual(['BEGIN', 'UPDATE 101 admin', 'AUDIT 101', 'ROLLBACK']);
    expect(h.log.some(l => l.startsWith('INVALIDATE'))).toBe(false);
  });

  it('a group that names no member changes no role and drops nothing', async () => {
    const res = await patchGroup('admin', 'add', []);
    expect(res.status).toBe(200);
    expect(h.log.filter(l => l.startsWith('UPDATE') || l.startsWith('INVALIDATE'))).toEqual([]);
  });
});
