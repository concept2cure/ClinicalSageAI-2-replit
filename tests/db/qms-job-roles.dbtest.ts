/**
 * Each organization's job roles and who holds them (P-49, P-50; MR-12 Stage 4;
 * docs/design/QMS_TRAINING_ASSIGNMENT_2026-10-29.md §3.1, §3.8 and D4, slice 1).
 *
 * A job role is a job function the organization manages (QA, Manufacturing),
 * not a permission role. Who holds one decides who must train on a controlled
 * document and who may read it (D3), so it is an access decision: an
 * administrator's alone, read from the persisted membership inside the write's
 * transaction, and every change carries its governed ledger pair on that same
 * transaction. Here, on PostgreSQL as the runtime role with RLS on, through the
 * real routes:
 *   - an administrator creates, renames and deletes a role, and adds and
 *     removes its members; each write is one row change and one ledger pair,
 *     committed by one transaction;
 *   - a viewer is refused by requireEditorAccess, and a member, a manager and
 *     an approver by the administrator rule, with nothing written;
 *   - a short reason, a duplicate name, a person who is not an active member,
 *     another organization's role, removing oneself, deleting a role a document
 *     is assigned to, and a ledger that cannot be written are each refused, with
 *     nothing written;
 *   - removal and deletion are soft: the history rows stay;
 *   - a demotion committed while a write waits on the membership row is seen
 *     by that write (FOR SHARE), and an organization the lifecycle guard still
 *     holds as active, but that is pending deletion, takes no change;
 *   - a member who left or was suspended stays listed, marked inactive, and an
 *     assignment on a deleted document does not hold a role in use.
 */
import { randomUUID } from 'node:crypto';
import express from 'express';
import jwt from 'jsonwebtoken';
import { Pool } from 'pg';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { databaseUrl } from '../setup.db';

/* The governed ledger writer, real unless a case asks the next job-role write's pair to fail. */
const failLedger = vi.hoisted(() => ({ on: false }));
vi.mock('../../server/routes/c2c/actions', async (importOriginal) => {
  const real = await importOriginal<typeof import('../../server/routes/c2c/actions')>();
  return {
    ...real,
    recordGovernedAction: async (...args: Parameters<typeof real.recordGovernedAction>) => {
      if (failLedger.on && String(args[1]?.target ?? '').startsWith('qms-job-role:')) {
        failLedger.on = false;
        throw new Error('injected ledger write failure');
      }
      return real.recordGovernedAction(...args);
    },
  };
});

const TAG = `qms-jobrole-${randomUUID().slice(0, 8)}`;
const REASON = 'Quality system job functions for training.';
type Actor = { id: number; token: string; orgId: number };
let owner: Pool;
let orgA: number;
let orgB: number;
let orgC: number;
let app: express.Express;
const A: Record<'admin' | 'admin2' | 'demoted' | 'former' | 'member' | 'manager' | 'approver' | 'viewer' | 'suspended' | 'lapsed' | 'leaver', Actor> = {} as never;
const B: Record<'admin' | 'member', Actor> = {} as never;
/** Organization C is put into pending deletion by one case, so nothing else runs there. */
const C: Record<'admin', Actor> = {} as never;

async function account(orgId: number, key: string, role: string, status = 'active'): Promise<Actor> {
  const user = (await owner.query(`INSERT INTO users(email,name,password_hash,status) VALUES($1,$2,'x',$3) RETURNING id`,
    [`${TAG}-${key}@example.invalid`, `${TAG} invented ${key}`, status])).rows[0];
  const id = Number(user.id);
  await owner.query('INSERT INTO organization_users(organization_id,user_id,role) VALUES($1,$2,$3)', [orgId, id, role]);
  const { activeJwtSecret } = await import('../../server/utils/jwtVerify');
  return { id, orgId, token: jwt.sign({ type: 'access', id: String(id), userId: String(id), organizationId: String(orgId), role },
    activeJwtSecret(), { expiresIn: '1h' }) };
}

const call = (by: Actor, method: 'get' | 'post' | 'patch' | 'delete', path: string, body?: Record<string, unknown>) => {
  const req = request(app)[method](`/api/mdx/qms${path}`).set('Authorization', `Bearer ${by.token}`);
  return body === undefined ? req : req.send(body);
};
const createRole = (by: Actor, name: string, extra: Record<string, unknown> = {}) => call(by, 'post', '/job-roles', { name, reason: REASON, ...extra });

const roleRow = async (id: number) => (await owner.query(
  `SELECT id, organization_id, name, description, created_by, updated_by, deleted_by, deleted_at IS NOT NULL AS deleted, xmin::text AS xmin
     FROM qms_job_roles WHERE id = $1`, [id])).rows[0];
const memberRows = async (roleId: number) => (await owner.query(
  `SELECT id, user_id, added_by, removed_by, removed_at IS NOT NULL AS removed, xmin::text AS xmin
     FROM qms_job_role_members WHERE job_role_id = $1 ORDER BY id`, [roleId])).rows;
const rolesNamed = async (orgId: number, name: string) => (await owner.query(
  `SELECT id FROM qms_job_roles WHERE organization_id = $1 AND lower(name) = lower($2)`, [orgId, name])).rows;
/** The ledger pair for a target: the chained audit row and its governed action, joined by the action id. */
const ledger = async (orgId: number, target: string) => (await owner.query(
  `SELECT a.action, a.reason, a.user_id, a.xmin::text AS audit_xmin, c.command, c.domain, c.payload, c.xmin::text AS action_xmin
     FROM audit_logs a JOIN c2c_ana_actions c ON c.id = a.ana_action_id
    WHERE a.tenant_id::text = $1::text AND a.target = $2 ORDER BY a.occurred_at, a.id`, [orgId, target])).rows;
const countAll = async () => Number((await owner.query(
  `SELECT (SELECT count(*) FROM qms_job_roles WHERE organization_id = ANY($1::int[]))
        + (SELECT count(*) FROM qms_job_role_members WHERE organization_id = ANY($1::int[]))
        + (SELECT count(*) FROM audit_logs WHERE tenant_id::text = ANY($2::text[]) AND target LIKE 'qms-job-role:%') AS n`,
  [[orgA, orgB], [String(orgA), String(orgB)]])).rows[0].n);

beforeAll(async () => {
  if (!process.env.APP_DATABASE_URL) throw new Error('APP_DATABASE_URL must use the provisioned non-owner runtime role.');
  owner = new Pool({ connectionString: databaseUrl, max: 4 });
  orgA = Number((await owner.query("INSERT INTO organizations(name,slug,status,payment_status) VALUES($1,$1,'active','active') RETURNING id", [`${TAG}-a`])).rows[0].id);
  orgB = Number((await owner.query("INSERT INTO organizations(name,slug,status,payment_status) VALUES($1,$1,'active','active') RETURNING id", [`${TAG}-b`])).rows[0].id);
  orgC = Number((await owner.query("INSERT INTO organizations(name,slug,status,payment_status) VALUES($1,$1,'active','active') RETURNING id", [`${TAG}-c`])).rows[0].id);
  A.admin = await account(orgA, 'admin', 'admin');
  A.admin2 = await account(orgA, 'admin2', 'admin');
  A.demoted = await account(orgA, 'demoted', 'admin');
  A.former = await account(orgA, 'former', 'admin');
  A.member = await account(orgA, 'member', 'member');
  A.manager = await account(orgA, 'manager', 'manager');
  A.approver = await account(orgA, 'approver', 'approver');
  A.viewer = await account(orgA, 'viewer', 'viewer');
  A.suspended = await account(orgA, 'suspended', 'member', 'suspended');
  A.lapsed = await account(orgA, 'lapsed', 'member');
  A.leaver = await account(orgA, 'leaver', 'member');
  B.admin = await account(orgB, 'b-admin', 'admin');
  B.member = await account(orgB, 'b-member', 'member');
  C.admin = await account(orgC, 'c-admin', 'admin');
  const { authMiddleware } = await import('../../server/auth');
  app = express(); app.use(express.json());
  app.use('/api/mdx', authMiddleware, (await import('../../server/routes/mdx-qms')).default);
}, 120_000);

afterAll(async () => {
  if (owner && orgA) await owner.query("UPDATE organizations SET status='inactive' WHERE id = ANY($1::int[])", [[orgA, orgB, orgC].filter(Boolean)]);
  const { getPool } = await import('../../server/db/runtime');
  await getPool().end(); await owner?.end();
});

describe('an administrator manages the job roles, each change with its ledger pair on one transaction', () => {
  it('creates a role: one row, one ledger pair, committed together', async () => {
    const res = await createRole(A.admin, 'Quality Assurance', { description: 'Reviews and releases controlled documents.' });
    expect(res.status, JSON.stringify(res.body)).toBe(201);
    const id = Number(res.body.data.id);
    expect(res.body.data).toMatchObject({ id, name: 'Quality Assurance', description: 'Reviews and releases controlled documents.' });
    const row = await roleRow(id);
    expect(row).toMatchObject({ organization_id: orgA, name: 'Quality Assurance', created_by: A.admin.id, deleted: false });
    const pairs = await ledger(orgA, `qms-job-role:${id}`);
    expect(pairs).toHaveLength(1);
    expect(pairs[0]).toMatchObject({ action: 'c2c.work.create', reason: REASON, user_id: A.admin.id, command: 'create', domain: 'qms',
      payload: { name: 'Quality Assurance', description: 'Reviews and releases controlled documents.' } });
    expect(pairs[0].audit_xmin, 'the audit row was written by the transaction that wrote the role').toBe(row.xmin);
    expect(pairs[0].action_xmin).toBe(row.xmin);
  });

  it('renames a role, recording before and after; deletes it softly, so the name can be used again', async () => {
    const id = Number((await createRole(A.admin, 'Manufacturing')).body.data.id);
    const renamed = await call(A.admin, 'patch', `/job-roles/${id}`, { name: 'Manufacturing Operations', reason: REASON });
    expect(renamed.status, JSON.stringify(renamed.body)).toBe(200);
    expect(await roleRow(id)).toMatchObject({ name: 'Manufacturing Operations', updated_by: A.admin.id });
    const [, update] = await ledger(orgA, `qms-job-role:${id}`);
    expect(update).toMatchObject({ command: 'update', payload: {
      before: { name: 'Manufacturing', description: null }, after: { name: 'Manufacturing Operations', description: null } } });
    const deleted = await call(A.admin, 'delete', `/job-roles/${id}`, { reason: REASON });
    expect(deleted.status, JSON.stringify(deleted.body)).toBe(200);
    expect(await roleRow(id)).toMatchObject({ deleted: true, deleted_by: A.admin.id });
    expect((await ledger(orgA, `qms-job-role:${id}`)).map((p) => [p.command, p.payload])).toEqual([
      ['create', { name: 'Manufacturing', description: null }],
      ['update', expect.anything()],
      ['delete', { name: 'Manufacturing Operations' }],
    ]);
    const listed = await call(A.member, 'get', '/job-roles');
    expect(listed.body.data.roles.map((r: { id: number }) => r.id)).not.toContain(id);
    expect((await createRole(A.admin, 'Manufacturing Operations')).status, 'a deleted role frees its name').toBe(201);
    expect(await rolesNamed(orgA, 'Manufacturing Operations')).toHaveLength(2);
  });

  it('adds and removes a member softly; the member can be added again and both history rows stay', async () => {
    const id = Number((await createRole(A.admin, 'Clinical Operations')).body.data.id);
    const added = await call(A.admin, 'post', `/job-roles/${id}/members`, { userId: A.member.id, reason: REASON });
    expect(added.status, JSON.stringify(added.body)).toBe(201);
    const [first] = await memberRows(id);
    expect(first).toMatchObject({ user_id: A.member.id, added_by: A.admin.id, removed: false });
    const pairs = await ledger(orgA, `qms-job-role:${id}`);
    expect(pairs[1]).toMatchObject({ command: 'create', payload: { change: 'member-added', userId: A.member.id, memberId: first.id } });
    expect(pairs[1].audit_xmin).toBe(first.xmin);
    const removed = await call(A.admin, 'delete', `/job-roles/${id}/members/${A.member.id}`, { reason: REASON });
    expect(removed.status, JSON.stringify(removed.body)).toBe(200);
    expect((await memberRows(id))[0]).toMatchObject({ id: first.id, removed: true, removed_by: A.admin.id });
    expect((await ledger(orgA, `qms-job-role:${id}`))[2]).toMatchObject({ command: 'delete',
      payload: { change: 'member-removed', userId: A.member.id, memberId: first.id } });
    expect((await call(A.admin, 'post', `/job-roles/${id}/members`, { userId: A.member.id, reason: REASON })).status).toBe(201);
    expect((await memberRows(id)).map((m) => m.removed)).toEqual([true, false]);
  });

  it('lists the roles with their members, to every member, and says who may administer them', async () => {
    const id = Number((await createRole(A.admin, 'Regulatory Affairs')).body.data.id);
    await call(A.admin, 'post', `/job-roles/${id}/members`, { userId: A.manager.id, reason: REASON });
    const asMember = await call(A.member, 'get', '/job-roles');
    expect(asMember.status, JSON.stringify(asMember.body)).toBe(200);
    const listed = asMember.body.data.roles.find((r: { id: number }) => r.id === id);
    expect(listed).toMatchObject({ id, name: 'Regulatory Affairs', documentCount: 0,
      members: [{ userId: A.manager.id, label: `${TAG} invented manager` }] });
    expect(asMember.body.data.canAdminister).toBe(false);
    const people = asMember.body.data.people.map((p: { userId: number }) => p.userId);
    expect(people).toEqual(expect.arrayContaining([A.admin.id, A.member.id, A.manager.id]));
    expect(people, 'the roster is active members only').not.toContain(A.suspended.id);
    expect(people, 'and this organization\'s only').not.toContain(B.member.id);
    expect((await call(A.admin, 'get', '/job-roles')).body.data.canAdminister).toBe(true);
    expect((await call(A.viewer, 'get', '/job-roles')).status, 'reads are open to every member').toBe(200);
  });

  it('a member who was suspended, or whose membership ended, stays listed, is marked inactive, and is never a bare number', async () => {
    const id = Number((await createRole(A.admin, 'Quality Control')).body.data.id);
    // The former member acted in this organization (created a role), so its audit trail names them after they leave.
    expect((await createRole(A.former, 'Created before leaving')).status).toBe(201);
    for (const who of [A.lapsed, A.leaver, A.former, A.member]) {
      expect((await call(A.admin, 'post', `/job-roles/${id}/members`, { userId: who.id, reason: REASON })).status).toBe(201);
    }
    await owner.query("UPDATE users SET status = 'suspended' WHERE id = $1", [A.lapsed.id]);
    await owner.query('DELETE FROM organization_users WHERE organization_id = $1 AND user_id = ANY($2::int[])', [orgA, [A.leaver.id, A.former.id]]);
    const { body } = await call(A.member, 'get', '/job-roles');
    const listed = body.data.roles.find((r: { id: number }) => r.id === id);
    expect(listed.members.map((m: { userId: number; label: string; active: boolean }) => [m.userId, m.label, m.active]), 'the rows stay; active says who still holds the role').toEqual([
      [A.lapsed.id, `${TAG} invented lapsed`, false],
      // users RLS hides a departed account; public.actor_name answers only for someone this organization's record names.
      [A.leaver.id, `Account #${A.leaver.id}`, false],
      [A.former.id, `${TAG} invented former`, false],
      [A.member.id, `${TAG} invented member`, true],
    ]);
    const people = body.data.people.map((p: { userId: number }) => p.userId);
    for (const gone of [A.lapsed.id, A.leaver.id, A.former.id]) expect(people, 'the roster is active members only').not.toContain(gone);
  });
});

describe('the authority is read on the write\'s own transaction', () => {
  it('a demotion committed while the write waits on the membership row is seen: 403 QMS_JOB_ROLE_AUTHORITY, nothing written', async () => {
    const before = await countAll();
    const demotion = await owner.connect();
    let settled = false;
    try {
      await demotion.query('BEGIN');
      await demotion.query("UPDATE organization_users SET role = 'member' WHERE organization_id = $1 AND user_id = $2", [orgA, A.demoted.id]);
      const pending = createRole(A.demoted, 'Written during a demotion').then((res) => { settled = true; return res; });
      await new Promise((resolve) => setTimeout(resolve, 1_500));
      expect(settled, 'the write waits on the membership row the demotion holds (FOR SHARE)').toBe(false);
      await demotion.query('COMMIT');
      const res = await pending;
      expect(res.status, JSON.stringify(res.body)).toBe(403);
      expect(res.body.error).toBe('QMS_JOB_ROLE_AUTHORITY');
    } finally {
      await demotion.query('ROLLBACK').catch(() => undefined);
      demotion.release();
    }
    expect(await rolesNamed(orgA, 'Written during a demotion')).toHaveLength(0);
    expect(await countAll(), 'no role and no ledger row').toBe(before);
  });

  it('an organization pending deletion takes no change, though the lifecycle guard still holds it as active', async () => {
    // The guard trusts a resolved posture for 60 s (tenant-lifecycle.ts); this read primes it as active.
    expect((await call(C.admin, 'get', '/job-roles')).body.data.canAdminister).toBe(true);
    await owner.query("UPDATE organizations SET status = 'pending_deletion' WHERE id = $1", [orgC]);
    const res = await createRole(C.admin, 'Pending deletion');
    expect(res.status, JSON.stringify(res.body)).toBe(403);
    expect(res.body).toMatchObject({ error: 'TENANT_PENDING_DELETION', message: expect.stringMatching(/Nothing was changed\.$/) });
    const written = (await owner.query(
      `SELECT (SELECT count(*) FROM qms_job_roles WHERE organization_id = $1)
            + (SELECT count(*) FROM audit_logs WHERE tenant_id::text = $1::text AND target LIKE 'qms-job-role:%') AS n`, [orgC])).rows[0];
    expect(Number(written.n), 'no role and no ledger row').toBe(0);
    const listed = await call(C.admin, 'get', '/job-roles');
    expect(listed.status, 'the records stay readable').toBe(200);
    expect(listed.body.data.canAdminister, 'the screen is not offered a change the server refuses').toBe(false);
  });
});

describe('only an administrator, with a reason, and nothing is written otherwise', () => {
  it('a viewer is refused by the editor gate; a member, a manager and an approver by the administrator rule', async () => {
    const before = await countAll();
    const viewer = await createRole(A.viewer, 'Viewer role');
    expect(viewer.status).toBe(403);
    expect(viewer.body.error).toBe('Insufficient permissions');
    for (const who of [A.member, A.manager, A.approver]) {
      const res = await createRole(who, `Not an administrator ${who.id}`);
      expect(res.status, JSON.stringify(res.body)).toBe(403);
      expect(res.body.error).toBe('QMS_JOB_ROLE_AUTHORITY');
    }
    const id = Number((await createRole(A.admin, 'Facilities')).body.data.id);
    const mid = await countAll();
    for (const res of [
      await call(A.manager, 'patch', `/job-roles/${id}`, { name: 'Renamed', reason: REASON }),
      await call(A.manager, 'delete', `/job-roles/${id}`, { reason: REASON }),
      await call(A.approver, 'post', `/job-roles/${id}/members`, { userId: A.approver.id, reason: REASON }),
    ]) {
      expect(res.status).toBe(403);
      expect(res.body.error).toBe('QMS_JOB_ROLE_AUTHORITY');
    }
    expect(await countAll()).toBe(mid);
    expect(mid - before, 'only the administrator\'s role and its ledger row').toBe(2);
  });

  it('a seven-character reason is 400 REASON_REQUIRED; an unknown field or a bad id is 422', async () => {
    const before = await countAll();
    const short = await call(A.admin, 'post', '/job-roles', { name: 'Short reason', reason: 'Because' });
    expect(short.status).toBe(400);
    expect(short.body.error).toBe('REASON_REQUIRED');
    const extra = await call(A.admin, 'post', '/job-roles', { name: 'Extra field', reason: REASON, organizationId: orgB });
    expect(extra.status).toBe(422);
    expect(extra.body.error).toBe('QMS_TRAINING_INPUT_INVALID');
    expect((await call(A.admin, 'patch', '/job-roles/abc', { name: 'x', reason: REASON })).status).toBe(422);
    expect((await call(A.admin, 'patch', '/job-roles/0', { name: 'x', reason: REASON })).status).toBe(422);
    expect(await countAll()).toBe(before);
  });
});

describe('the refusals', () => {
  it('a name already live, in any case, is 409 QMS_JOB_ROLE_EXISTS, on create and on rename', async () => {
    expect((await createRole(A.admin, 'Validation')).status).toBe(201);
    const before = await countAll();
    const dup = await createRole(A.admin, 'VALIDATION');
    expect(dup.status, JSON.stringify(dup.body)).toBe(409);
    expect(dup.body.error).toBe('QMS_JOB_ROLE_EXISTS');
    const other = Number((await createRole(A.admin, 'Calibration')).body.data.id);
    const rename = await call(A.admin, 'patch', `/job-roles/${other}`, { name: 'validation', reason: REASON });
    expect(rename.status).toBe(409);
    expect(rename.body.error).toBe('QMS_JOB_ROLE_EXISTS');
    expect(await countAll()).toBe(before + 2);
    expect((await createRole(B.admin, 'Validation')).status, 'another organization keeps its own list').toBe(201);
  });

  it('a person who is not an active member of this organization is 422 QMS_NOT_A_MEMBER; a live member twice is 409', async () => {
    const id = Number((await createRole(A.admin, 'Packaging')).body.data.id);
    const before = await countAll();
    for (const userId of [B.member.id, A.suspended.id, 2_000_000_000]) {
      const res = await call(A.admin, 'post', `/job-roles/${id}/members`, { userId, reason: REASON });
      expect(res.status, `${userId}: ${JSON.stringify(res.body)}`).toBe(422);
      expect(res.body.error).toBe('QMS_NOT_A_MEMBER');
    }
    expect(await countAll()).toBe(before);
    expect((await call(A.admin, 'post', `/job-roles/${id}/members`, { userId: A.member.id, reason: REASON })).status).toBe(201);
    const twice = await call(A.admin, 'post', `/job-roles/${id}/members`, { userId: A.member.id, reason: REASON });
    expect(twice.status).toBe(409);
    expect(twice.body.error).toBe('QMS_ALREADY_MEMBER');
  });

  it('another organization\'s role is not listed and every change to it is 404', async () => {
    const id = Number((await createRole(A.admin, 'Supplier Quality')).body.data.id);
    await call(A.admin, 'post', `/job-roles/${id}/members`, { userId: A.member.id, reason: REASON });
    const before = await countAll();
    const listed = await call(B.admin, 'get', '/job-roles');
    expect(listed.body.data.roles.map((r: { id: number }) => r.id)).not.toContain(id);
    for (const res of [
      await call(B.admin, 'patch', `/job-roles/${id}`, { name: 'Taken over', reason: REASON }),
      await call(B.admin, 'delete', `/job-roles/${id}`, { reason: REASON }),
      await call(B.admin, 'post', `/job-roles/${id}/members`, { userId: B.member.id, reason: REASON }),
      await call(B.admin, 'delete', `/job-roles/${id}/members/${A.member.id}`, { reason: REASON }),
    ]) expect(res.status, JSON.stringify(res.body)).toBe(404);
    expect(await countAll()).toBe(before);
    expect(await roleRow(id)).toMatchObject({ name: 'Supplier Quality', deleted: false });
  });

  it('an administrator does not remove themselves from a role: 403 QMS_TRAINING_SELF_UNASSIGN; another administrator may', async () => {
    const id = Number((await createRole(A.admin, 'Internal Audit')).body.data.id);
    expect((await call(A.admin, 'post', `/job-roles/${id}/members`, { userId: A.admin.id, reason: REASON })).status, 'adding oneself only adds an obligation').toBe(201);
    const self = await call(A.admin, 'delete', `/job-roles/${id}/members/${A.admin.id}`, { reason: REASON });
    expect(self.status).toBe(403);
    expect(self.body.error).toBe('QMS_TRAINING_SELF_UNASSIGN');
    expect((await memberRows(id))[0]).toMatchObject({ removed: false });
    expect((await call(A.admin2, 'delete', `/job-roles/${id}/members/${A.admin.id}`, { reason: REASON })).status).toBe(200);
    expect((await call(A.admin2, 'delete', `/job-roles/${id}/members/${A.admin.id}`, { reason: REASON })).status, 'no live membership left').toBe(404);
  });

  it('a role a document is assigned to is not deleted: 409 QMS_JOB_ROLE_IN_USE naming the document', async () => {
    const id = Number((await createRole(A.admin, 'Sterilization')).body.data.id);
    const docId = Number((await owner.query(`INSERT INTO qms_documents (organization_id, doc_number, title, doc_type, version, status, author_id)
      VALUES ($1, $2, 'Invented sterilization procedure', 'sop', '1.0', 'draft', $3) RETURNING id`, [orgA, `${TAG}-STER`, A.admin.id])).rows[0].id);
    await owner.query(`INSERT INTO qms_training_assignments (organization_id, document_id, job_role_id, assigned_by) VALUES ($1, $2, $3, $4)`,
      [orgA, docId, id, A.admin.id]);
    const listed = (await call(A.member, 'get', '/job-roles')).body.data.roles.find((r: { id: number }) => r.id === id);
    expect(listed.documentCount).toBe(1);
    const before = await countAll();
    const res = await call(A.admin, 'delete', `/job-roles/${id}`, { reason: REASON });
    expect(res.status, JSON.stringify(res.body)).toBe(409);
    expect(res.body).toMatchObject({ error: 'QMS_JOB_ROLE_IN_USE', docNumbers: [`${TAG}-STER`] });
    expect(await countAll()).toBe(before);
    expect(await roleRow(id)).toMatchObject({ deleted: false });
  });

  it('an assignment on a deleted document does not hold the role in use', async () => {
    // Every QMS reader treats a deleted document as gone; its assignment could not be removed through any route.
    const id = Number((await createRole(A.admin, 'Aseptic Processing')).body.data.id);
    const docId = Number((await owner.query(`INSERT INTO qms_documents (organization_id, doc_number, title, doc_type, version, status, author_id)
      VALUES ($1, $2, 'Invented aseptic procedure', 'sop', '1.0', 'draft', $3) RETURNING id`, [orgA, `${TAG}-ASEP`, A.admin.id])).rows[0].id);
    await owner.query(`INSERT INTO qms_training_assignments (organization_id, document_id, job_role_id, assigned_by) VALUES ($1, $2, $3, $4)`,
      [orgA, docId, id, A.admin.id]);
    await owner.query('UPDATE qms_documents SET deleted_at = now() WHERE id = $1', [docId]);
    const listed = (await call(A.member, 'get', '/job-roles')).body.data.roles.find((r: { id: number }) => r.id === id);
    expect(listed.documentCount).toBe(0);
    const res = await call(A.admin, 'delete', `/job-roles/${id}`, { reason: REASON });
    expect(res.status, JSON.stringify(res.body)).toBe(200);
    expect(await roleRow(id)).toMatchObject({ deleted: true });
  });

  it('a ledger that cannot be written is 500 AUDIT_WRITE_FAILED, and the role was not created', async () => {
    const before = await countAll();
    failLedger.on = true;
    const res = await createRole(A.admin, 'Ledger failure');
    expect(failLedger.on, 'the injected failure was reached').toBe(false);
    expect(res.status).toBe(500);
    expect(res.body.error).toBe('AUDIT_WRITE_FAILED');
    expect(await rolesNamed(orgA, 'Ledger failure')).toHaveLength(0);
    expect(await countAll()).toBe(before);
  });
});
