/**
 * P1-41 (DP-49): an administrator's change to a member's role, and a member's
 * removal, each write one chained audit row in the SAME transaction as the
 * change, carrying the role before and after, the member, and the stated
 * reason. No reason, no change (400). A failed audit write is a failed change:
 * the transaction rolls back and the 500 carries no error text.
 *
 * The database is a recorder here: every statement and the audit write land in
 * one ordered log, so the test reads where the audit row falls relative to
 * BEGIN, the write and COMMIT. tests/db/admin-change-audit.dbtest.ts proves the
 * same on PostgreSQL, as app_service with RLS enforcing.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import express from 'express';
import type { Request, Response, NextFunction } from 'express';
import request from 'supertest';
import { ADMINISTRATIVE_ACTIONS } from '../../services/audit/compliance-reports/queries/administrative-changes';

const h = vi.hoisted(() => ({
  log: [] as string[],
  clients: [] as unknown[],
  auditCalls: [] as Array<{ client: unknown; entry: Record<string, unknown> }>,
  auditFails: false,
  targetRole: 'member' as string | null,
  invalidated: [] as Array<[number, number]>,
  /** The organisation's administrator rows, as the last-administrator lock reads them. */
  administrators: [] as number[],
}));

async function fakeQuery(sql: string, params: unknown[] = []) {
  const text = sql.replace(/\s+/g, ' ').trim();
  h.log.push(text);
  // authorizeOrgAccess: the caller administers the target organisation.
  if (/^SELECT role FROM organization_users WHERE user_id = \$1 AND organization_id = \$2/i.test(text)) {
    return { rows: [{ role: 'admin' }], rowCount: 1 };
  }
  // The organisation's administrators, locked for the change (last-administrator guard).
  if (/^SELECT user_id FROM organization_users WHERE organization_id = \$1 AND role IN \('admin', 'owner'\)/i.test(text)) {
    return { rows: h.administrators.map(user_id => ({ user_id })), rowCount: h.administrators.length };
  }
  // The member's current role, locked for the change.
  if (/^SELECT role FROM organization_users WHERE organization_id = \$1 AND user_id = \$2/i.test(text)) {
    return h.targetRole ? { rows: [{ role: h.targetRole }], rowCount: 1 } : { rows: [], rowCount: 0 };
  }
  if (/^UPDATE organization_users/i.test(text)) {
    return h.targetRole ? { rows: [{ role: params[0] }], rowCount: 1 } : { rows: [], rowCount: 0 };
  }
  if (/^DELETE FROM organization_users/i.test(text)) {
    return h.targetRole ? { rows: [{ role: h.targetRole }], rowCount: 1 } : { rows: [], rowCount: 0 };
  }
  return { rows: [], rowCount: 0 };
}

function fakeClient() {
  const client = { query: vi.fn(fakeQuery), release: vi.fn() };
  h.clients.push(client);
  return client;
}

vi.mock('../../db', () => ({
  pool: { query: vi.fn(fakeQuery), connect: vi.fn(async () => fakeClient()) },
  // The canonical BEGIN/COMMIT/ROLLBACK helper (server/db/runtime.ts), on a recorded client.
  transaction: vi.fn(async (cb: (c: unknown) => Promise<unknown>) => {
    const c = fakeClient();
    await c.query('BEGIN');
    try {
      const out = await cb(c);
      await c.query('COMMIT');
      return out;
    } catch (err) {
      await c.query('ROLLBACK');
      throw err;
    }
  }),
}));

vi.mock('../../services/auditService', () => ({
  default: { logAction: vi.fn(async () => ({ persisted: true })) },
  writeChainedAuditRow: vi.fn(async (client: unknown, entry: Record<string, unknown>) => {
    h.log.push(`AUDIT ${String(entry.action)}`);
    if (h.auditFails) throw new Error('relation "audit_logs" is locked by probe');
    h.auditCalls.push({ client, entry });
  }),
}));

vi.mock('../../middleware/auth', async importOriginal => ({
  ...(await importOriginal<typeof import('../../middleware/auth')>()),
  invalidateOrgMembershipCache: vi.fn((userId: number, orgId: number) => {
    h.invalidated.push([userId, orgId]);
  }),
}));

const ORG = 777;
const CALLER = 1;
const MEMBER = 42;
let app: express.Express;

beforeEach(async () => {
  h.log = [];
  h.clients = [];
  h.auditCalls = [];
  h.auditFails = false;
  h.targetRole = 'member';
  h.invalidated = [];
  h.administrators = [CALLER];
  const mod = await import('../tenant-users');
  app = express();
  app.use(express.json());
  app.use((req: Request, _res: Response, next: NextFunction) => {
    (req as any).user = { id: CALLER, role: 'admin', organizationId: ORG };
    (req as any).userRole = 'admin';
    next();
  });
  app.use('/api/tenant-users', mod.default);
});

const written = (re: RegExp) => h.log.filter(s => re.test(s));
const patch = (body: unknown) => request(app).patch(`/api/tenant-users/${ORG}/${MEMBER}`).send(body as object);
const remove = (body?: unknown) => {
  const r = request(app).delete(`/api/tenant-users/${ORG}/${MEMBER}`);
  return body === undefined ? r : r.send(body as object);
};

describe('PATCH /:organizationId/:userId — a role change is recorded with its reason', () => {
  it.each([
    ['no reason', { role: 'viewer' }],
    ['an empty reason', { role: 'viewer', reason: '' }],
    ['a blank reason', { role: 'viewer', reason: '   ' }],
  ])('%s: 400 REASON_REQUIRED and nothing written', async (_label, body) => {
    const res = await patch(body);
    expect(res.status).toBe(400);
    expect(res.body.error).toBe('REASON_REQUIRED');
    expect(written(/^UPDATE organization_users/i)).toHaveLength(0);
    expect(h.auditCalls).toHaveLength(0);
  });

  it('writes one chained row on the change transaction, before COMMIT, with roles, member and reason', async () => {
    const res = await patch({ role: 'viewer', reason: 'Quarterly access review: no longer edits' });
    expect(res.status, JSON.stringify(res.body)).toBe(200);
    expect(h.auditCalls).toHaveLength(1);
    const [{ client, entry }] = h.auditCalls;
    // The audit row is written on the client that made the change, between BEGIN and COMMIT.
    const update = h.clients.find(c => (c as any).query.mock.calls.some((q: unknown[]) => /UPDATE organization_users/i.test(String(q[0]))));
    expect(client).toBe(update);
    const order = h.log.filter(s => /^(BEGIN|COMMIT|ROLLBACK|UPDATE organization_users|AUDIT)/.test(s)).map(s => s.split(' ')[0]);
    expect(order).toEqual(['BEGIN', 'UPDATE', 'AUDIT', 'COMMIT']);
    expect(entry).toMatchObject({
      tenantId: ORG,
      userId: CALLER,
      action: 'member_role_changed',
      resourceType: 'organization_users',
      resourceId: String(MEMBER),
      reason: 'Quarterly access review: no longer edits',
      details: {
        targetUserId: MEMBER,
        previousRole: 'member',
        newRole: 'viewer',
        reason: 'Quarterly access review: no longer edits',
      },
    });
  });

  it('revokes the cached membership once the change commits, so a demotion takes effect on the next request', async () => {
    const res = await patch({ role: 'viewer', reason: 'Demoted after the access review' });
    expect(res.status).toBe(200);
    expect(h.invalidated).toEqual([[MEMBER, ORG]]);
  });

  it('a failed audit write leaves the cached membership alone (nothing changed)', async () => {
    h.auditFails = true;
    const res = await patch({ role: 'viewer', reason: 'r' });
    expect(res.status).toBe(500);
    expect(h.invalidated).toHaveLength(0);
  });

  it('the action it writes is one the administrative changes report reads', async () => {
    await patch({ role: 'viewer', reason: 'r' });
    expect(ADMINISTRATIVE_ACTIONS).toContain(h.auditCalls[0]?.entry.action);
  });

  it('a failed audit write rolls the change back and the 500 carries no error text', async () => {
    h.auditFails = true;
    const res = await patch({ role: 'viewer', reason: 'Quarterly access review' });
    expect(res.status).toBe(500);
    expect(JSON.stringify(res.body)).not.toMatch(/audit_logs|locked|probe/);
    expect(written(/^ROLLBACK/)).toHaveLength(1);
    expect(written(/^COMMIT/)).toHaveLength(0);
  });

  it('a role set to the one the member already holds writes nothing and records nothing', async () => {
    const res = await patch({ role: 'member', reason: 'Quarterly access review' });
    expect(res.status).toBe(200);
    expect(res.body.unchanged).toBe(true);
    expect(written(/^UPDATE organization_users/i)).toHaveLength(0);
    expect(h.auditCalls).toHaveLength(0);
  });

  it('a member not in the organisation is 404 and nothing is recorded', async () => {
    h.targetRole = null;
    const res = await patch({ role: 'viewer', reason: 'r' });
    expect(res.status).toBe(404);
    expect(h.auditCalls).toHaveLength(0);
  });
});

describe('DELETE /:organizationId/:userId — a removal is recorded with its reason', () => {
  it.each([
    ['no body', undefined],
    ['no reason', {}],
    ['a blank reason', { reason: ' \n ' }],
  ])('%s: 400 REASON_REQUIRED and nothing removed', async (_label, body) => {
    const res = await remove(body);
    expect(res.status).toBe(400);
    expect(res.body.error).toBe('REASON_REQUIRED');
    expect(written(/^DELETE FROM organization_users/i)).toHaveLength(0);
    expect(h.auditCalls).toHaveLength(0);
  });

  it('writes one chained row on the removal transaction, before COMMIT, then revokes the cached membership', async () => {
    const res = await remove({ reason: 'Left the company' });
    expect(res.status, JSON.stringify(res.body)).toBe(200);
    expect(h.auditCalls).toHaveLength(1);
    const order = h.log.filter(s => /^(BEGIN|COMMIT|ROLLBACK|DELETE FROM organization_users|AUDIT)/.test(s)).map(s => s.split(' ')[0]);
    expect(order).toEqual(['BEGIN', 'DELETE', 'AUDIT', 'COMMIT']);
    expect(h.auditCalls[0].entry).toMatchObject({
      tenantId: ORG,
      userId: CALLER,
      action: 'member_removed',
      resourceType: 'organization_users',
      resourceId: String(MEMBER),
      reason: 'Left the company',
      details: { targetUserId: MEMBER, previousRole: 'member', newRole: null, reason: 'Left the company' },
    });
    expect(ADMINISTRATIVE_ACTIONS).toContain('member_removed');
    expect(h.invalidated).toEqual([[MEMBER, ORG]]);
  });

  it('a failed audit write rolls the removal back: 500, no error text, the membership cache untouched', async () => {
    h.auditFails = true;
    const res = await remove({ reason: 'Left the company' });
    expect(res.status).toBe(500);
    expect(JSON.stringify(res.body)).not.toMatch(/audit_logs|locked|probe/);
    expect(written(/^ROLLBACK/)).toHaveLength(1);
    expect(written(/^COMMIT/)).toHaveLength(0);
    expect(h.invalidated).toHaveLength(0);
  });
});

/**
 * QA 2026-10-08 (j9, finding 1): the member drawer now offers role change and
 * removal. An organisation must never be left with no administrator — not by a
 * platform operator acting on the last one, and not by two administrators
 * demoting each other at the same moment (each request sees itself as an
 * administrator; only a lock on the organisation's administrator rows, taken in
 * the change's transaction, makes the second one see the first one's change).
 */
describe('the last administrator cannot be demoted or removed', () => {
  const ONLY_ADMIN = () => {
    h.targetRole = 'admin';
    h.administrators = [MEMBER];
  };

  it('PATCH: 409 LAST_ADMINISTRATOR, a sentence that says nothing changed, nothing written or recorded', async () => {
    ONLY_ADMIN();
    const res = await patch({ role: 'member', reason: 'Access review' });
    expect(res.status).toBe(409);
    expect(res.body.error).toBe('LAST_ADMINISTRATOR');
    expect(res.body.message).toMatch(/only administrator/i);
    expect(res.body.message).toMatch(/Nothing was changed/);
    expect(written(/^UPDATE organization_users/i)).toHaveLength(0);
    expect(h.auditCalls).toHaveLength(0);
    expect(h.invalidated).toHaveLength(0);
  });

  it('DELETE: 409 LAST_ADMINISTRATOR and nothing removed or recorded', async () => {
    ONLY_ADMIN();
    const res = await remove({ reason: 'Left the company' });
    expect(res.status).toBe(409);
    expect(res.body.error).toBe('LAST_ADMINISTRATOR');
    expect(written(/^DELETE FROM organization_users/i)).toHaveLength(0);
    expect(h.auditCalls).toHaveLength(0);
    expect(h.invalidated).toHaveLength(0);
  });

  it('locks the administrator rows FOR UPDATE on the change transaction, before the change', async () => {
    h.targetRole = 'admin';
    h.administrators = [CALLER, MEMBER];
    const res = await patch({ role: 'member', reason: 'Access review' });
    expect(res.status, JSON.stringify(res.body)).toBe(200);
    const order = h.log
      .filter(s => /^(BEGIN|COMMIT|UPDATE organization_users|SELECT user_id FROM organization_users)/i.test(s))
      .map(s => (/^SELECT user_id/i.test(s) ? (/FOR UPDATE$/i.test(s) ? 'LOCK_ADMINS' : 'READ_ADMINS') : s.split(' ')[0]));
    expect(order).toEqual(['BEGIN', 'LOCK_ADMINS', 'UPDATE', 'COMMIT']);
  });

  it('with another administrator left, an administrator can be demoted and removed', async () => {
    h.targetRole = 'admin';
    h.administrators = [CALLER, MEMBER];
    expect((await patch({ role: 'viewer', reason: 'Access review' })).status).toBe(200);
    expect((await remove({ reason: 'Left the company' })).status).toBe(200);
  });

  it('promoting a member to administrator is never refused by the guard', async () => {
    h.administrators = [];
    const res = await patch({ role: 'admin', reason: 'Second administrator' });
    expect(res.status, JSON.stringify(res.body)).toBe(200);
  });
});

/** P-18 (2026-10-08): the signing roles are assigned like any role — with a reason, and recorded. */
describe('assigning approver and reviewer', () => {
  it.each(['approver', 'reviewer'])('%s: assigned with a reason, recorded with the role before and after', async (role) => {
    const res = await patch({ role, reason: 'Named signer for the IND' });
    expect(res.status, JSON.stringify(res.body)).toBe(200);
    expect(h.auditCalls).toHaveLength(1);
    expect(h.auditCalls[0].entry).toMatchObject({
      action: 'member_role_changed',
      details: { previousRole: 'member', newRole: role, reason: 'Named signer for the IND' },
    });
  });

  it.each(['approver', 'reviewer'])('%s: refused without a reason (400 REASON_REQUIRED), nothing written', async (role) => {
    const res = await patch({ role });
    expect(res.status).toBe(400);
    expect(res.body.error).toBe('REASON_REQUIRED');
    expect(written(/^UPDATE organization_users/i)).toHaveLength(0);
    expect(h.auditCalls).toHaveLength(0);
  });

  it('a role outside the assignable list is still refused', async () => {
    const res = await patch({ role: 'owner', reason: 'r' });
    expect(res.status).toBe(400);
    expect(written(/^UPDATE organization_users/i)).toHaveLength(0);
  });
});
