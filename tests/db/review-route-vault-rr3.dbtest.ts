/**
 * Reassign a named reviewer or approver on an open route, and hand back an
 * assignment (RR3, docs/design/REVIEW_ROUTING_2026-10-23.md §2.5, §2.10, §2.11,
 * §2.12; findings B9, B11, M2, M3, M6). On PostgreSQL as the runtime role with
 * RLS on, through the real ingest, Vault, lifecycle, task and notification
 * routes; the signing ceremony is the one stand-in (its own suites pin it).
 *
 *   - reassign: the sender or an administrator hands an unsigned member's
 *     assignment to another person, through assignTaskInTx (the task id, role
 *     and step kept, the reminder markers cleared, a task.assign row), with the
 *     same validator as at send; a governed review-route.reassign row on the
 *     version, with the route id, from, to, role, reason and both printed
 *     names, on the same transaction; the new member told, the old one told and
 *     out of their tray;
 *   - refused, each with nothing written: no reason, an actor who is neither
 *     the sender nor an administrator, a member who signed, a route that was
 *     returned, the actor naming themselves, an author, a reviewer of this
 *     content as approver, someone already named, another organization's
 *     account, another organization's version;
 *   - hand back: a named member returns their own assignment to the sender,
 *     with a reason; the sender is told; the member stays named and cannot
 *     sign until the sender reassigns, and then the new member signs;
 *   - the version's round carries the naming history, by printed name.
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import express from 'express';
import request from 'supertest';
import { Pool } from 'pg';
import { nativeCatalogRunId } from './catalog-native-fixture';
import { assertVaultFixtureDatabase, assertVaultFixtureRuntime, closeVaultFixtureRuntime, seedVaultFixtureParent } from './vault-current-access-fixture';
import { databaseUrl } from '../setup.db';

const RUN = nativeCatalogRunId();
const PROBE = `dbtest-rr3 ${RUN} `;
const CODE = `DBTEST-RR3-${RUN}`;

type Tenant = { orgId: number; orgUuid: string; programId: string };
const WHO = ['uploader', 'r1', 'r2', 'r3', 'approver', 'approver2', 'admin2', 'rev', 'outsider'] as const;
type Who = (typeof WHO)[number];
let owner: Pool;
const users = {} as Record<Who, number>;
const names = {} as Record<Who, string>;
let mine: Tenant;
let theirs: Tenant;

const pdf = (tag: string) => Buffer.from(`%PDF-1.4\n1 0 obj<</Type/Catalog>>endobj\n% ${tag}\ntrailer<</Root 1 0 R>>\n%%EOF\n`, 'utf8');
const day = (n: number) => new Date(Date.now() + n * 86_400_000).toISOString().slice(0, 10);
const reverify = async () => ({ ok: true as const, authenticationMethod: 'password+totp', secondFactorVerified: true });
/** The request's role is the membership's, so a reviewer is not an administrator anywhere. */
const requestRole = (who: Who) => (who === 'rev' ? 'reviewer' : 'admin');

async function appFor(t: Tenant, who: Who): Promise<express.Express> {
  const createVaultIngestRoutes = (await import('../../server/routes/vault-ingest')).default;
  const createProjectVaultRoutes = (await import('../../server/routes/c2c/project-vault')).default;
  const { createDocumentLifecycleRouter } = await import('../../server/routes/document-lifecycle');
  const taskRoutes = (await import('../../server/routes/taskManagement.routes')).default;
  const { establishRequestTenantScope } = await import('../../server/middleware/establishRequestTenantScope');
  const { expandRoleClaims } = await import('../../server/middleware/auth');
  const { db } = await import('../../server/db');
  const role = requestRole(who);
  // The claims a session token carries for this role (P-18: a reviewer holds what a member holds).
  const roles = expandRoleClaims(role, undefined);
  const a = express();
  a.use(express.json());
  a.use((req, _res, next) => {
    const r = req as unknown as Record<string, unknown>;
    r.userId = users[who]; r.tenantId = t.orgId; r.userRole = role;
    r.user = { id: users[who], organizationId: t.orgId, organizationUuid: t.orgUuid, role, roles };
    next();
  });
  a.use(establishRequestTenantScope);
  a.use('/api/vault/ingest', createVaultIngestRoutes());
  a.use('/api/c2c/project-vault', createProjectVaultRoutes());
  a.use('/api/regulatory/documents', createDocumentLifecycleRouter({ db: db as never, reverify }));
  a.use('/api/tasks', taskRoutes);
  return a;
}

async function ingest(code: string): Promise<string> {
  const res = await request(await appFor(mine, 'uploader')).post('/api/vault/ingest').field('programId', mine.programId)
    .field('documentTitle', `Clinical overview ${code}`).field('documentType', 'OTHER')
    .field('documentCode', `${CODE}-${code}`).attach('file', pdf(code), 'overview.pdf');
  expect(res.status, JSON.stringify(res.body)).toBe(201);
  return String(res.body.document.id);
}
const post = async (who: Who, path: string, body: object, t: Tenant = mine) =>
  request(await appFor(t, who)).post(`/api/regulatory/documents${path}`).send(body);
const route = (reviewers: Who[], approvers: Who[]) => ({
  reviewers: reviewers.map((w) => users[w]), approvers: approvers.map((w) => users[w]),
  order: 'parallel', reviewDueDate: day(3), approvalDueDate: day(5),
});
/** A version sent by the uploader on a route naming these people. */
async function sent(code: string, reviewers: Who[], approvers: Who[]): Promise<{ vaultId: string; id: string }> {
  const vaultId = await ingest(code);
  const s = await post('uploader', '', { sources: { vault_documents: { nativeId: vaultId, role: 'artifact' } } });
  expect(s.status, JSON.stringify(s.body)).toBe(201);
  const id = String(s.body.canonicalId);
  const r = await post('uploader', `/${id}/advance`, { to: 'in_review', reason: 'Ready for named review', route: route(reviewers, approvers) });
  expect(r.status, JSON.stringify(r.body)).toBe(200);
  return { vaultId, id };
}
const sign = (who: Who, id: string, meaning: 'reviewed' | 'approved') =>
  post(who, `/${id}/sign`, { meaning, password: 'x', mfaToken: '000000', reason: `Signed as ${meaning}` });
/** `reason: null` sends none at all; `tenant` is the actor's organization. */
const reassign = (who: Who, id: string, taskId: string, to: Who, opts: { reason?: string | null; tenant?: Tenant } = {}) => {
  const reason = opts.reason === undefined ? 'Rae is on leave until next month' : opts.reason;
  return post(who, `/${id}/review-route/reassign`, { taskId, assigneeId: users[to], ...(reason === null ? {} : { reason }) }, opts.tenant ?? mine);
};
const handBack = (who: Who, id: string, reason: string | null = 'I am on leave for the review window') =>
  post(who, `/${id}/review-route/hand-back`, reason === null ? {} : { reason });

type MemberRow = { task_id: string; assignee_id: number; assignee_name: string; review_role: string; review_step: number; status: string; route_act_id: string | null; metadata: Record<string, unknown> | null };
async function memberRows(id: string): Promise<MemberRow[]> {
  const { rows } = await owner.query(
    `SELECT t.task_id, t.assignee_id, t.assignee_name, t.review_role, t.review_step, t.status, t.route_act_id, t.metadata
       FROM unified_tasks t JOIN review_routes r ON r.organization_id = t.organization_id AND r.id = t.review_route_id
      WHERE r.organization_id = $1 AND r.subject_id = $2 ORDER BY r.created_at DESC, t.id`, [mine.orgId, id]);
  return rows.map((r) => ({ ...r, assignee_id: Number(r.assignee_id) }));
}
const memberOf = async (id: string, who: Who) => (await memberRows(id)).find((m) => m.assignee_id === users[who])!;
const routeIdOf = async (id: string) =>
  String((await owner.query(`SELECT id FROM review_routes WHERE organization_id = $1 AND subject_id = $2 ORDER BY created_at DESC LIMIT 1`, [mine.orgId, id])).rows[0].id);
async function ledger(id: string, command: string) {
  const { rows } = await owner.query(
    `SELECT id, command, decision_reason, payload, proposed_by FROM c2c_ana_actions WHERE org_id = $1 AND target = $2 AND command = $3 ORDER BY executed_at, id`,
    [mine.orgId, `canonical_document:${id}`, command]);
  return rows;
}
async function taskLedger(taskId: string, command: string) {
  const { rows } = await owner.query(
    `SELECT payload, decision_reason FROM c2c_ana_actions WHERE org_id = $1 AND command = $2 AND target LIKE '%' || $3 ORDER BY executed_at, id`,
    [mine.orgId, command, taskId]);
  return rows;
}
/** Everything a refused act could have written: the route's rows as they stand, and the ledger. */
async function snapshot(id: string) {
  const ledgerCount = (await owner.query(`SELECT count(*)::int AS n FROM c2c_ana_actions WHERE org_id = $1`, [mine.orgId])).rows[0].n;
  return { members: await memberRows(id), ledgerCount };
}

/** The notices are sent after COMMIT, fire-and-forget: wait for the recipient's. */
async function noticeFor(who: Who, title: string): Promise<{ id: number; category: string; body: string | null; resource_id: string }> {
  for (let i = 0; i < 50; i++) {
    const { rows } = await owner.query(
      `SELECT id, category, body, resource_id FROM mdx_notifications
        WHERE organization_id = $1 AND recipient_user_id = $2 AND title = $3 ORDER BY id DESC LIMIT 1`,
      [mine.orgId, users[who], title]);
    if (rows[0]) return { ...rows[0], id: Number(rows[0].id) };
    await new Promise((r) => setTimeout(r, 100));
  }
  throw new Error(`No notice "${title}" reached ${who}`);
}
async function myWork(who: Who): Promise<Array<{ taskId: string; status: string; waitingOn: string | null }>> {
  const r = await request(await appFor(mine, who)).get('/api/tasks/my-work');
  expect(r.status, JSON.stringify(r.body)).toBe(200);
  return r.body.data.items;
}
async function round(vaultId: string) {
  const r = await request(await appFor(mine, 'uploader')).get(`/api/c2c/project-vault/${mine.programId}/documents/${vaultId}/versions`);
  expect(r.status, JSON.stringify(r.body)).toBe(200);
  return r.body.data.versions[0].lifecycle.round;
}

async function tenant(slug: string): Promise<Tenant> {
  const org = await owner.query(
    `INSERT INTO organizations (name, slug) VALUES ($1, $2) ON CONFLICT (slug) DO UPDATE SET name = EXCLUDED.name RETURNING id, uuid`,
    [`${PROBE}${slug}`, `dbtest-rr3-${RUN}-${slug}`]);
  const prog = await owner.query(
    `INSERT INTO regulatory_programs (name, code, organization_id, program_type, product_type, primary_agency, product_name)
     VALUES ($1, $2, $3, 'ind', 'drug', 'FDA', 'Routin 5mg') RETURNING id`,
    [`${PROBE}${slug} program`, `${CODE}-${slug.toUpperCase()}`, org.rows[0].id]);
  const scoped = { orgId: Number(org.rows[0].id), orgUuid: String(org.rows[0].uuid), programId: String(prog.rows[0].id) };
  await seedVaultFixtureParent(owner, scoped, { userId: users.uploader, namespace: `${CODE}-${slug}` });
  return scoped;
}

beforeAll(async () => {
  owner = new Pool({ connectionString: databaseUrl, max: 4 });
  await assertVaultFixtureDatabase(owner);
  for (const who of WHO) {
    names[who] = `Remy ${who[0].toUpperCase()}${who.slice(1)}`;
    const u = await owner.query(
      `INSERT INTO users (email, name, password_hash) VALUES ($1, $2, 'not-a-real-hash')
         ON CONFLICT (email) DO UPDATE SET name = EXCLUDED.name RETURNING id`,
      [`dbtest-rr3-${RUN}-${who}@example.test`, names[who]]);
    users[who] = Number(u.rows[0].id);
  }
  mine = await tenant('mine');
  theirs = await tenant('theirs');
  const roles: Array<[Who, string, Tenant]> = [
    ['r1', 'admin', mine], ['r2', 'admin', mine], ['r3', 'admin', mine], ['approver', 'admin', mine], ['approver2', 'admin', mine],
    ['admin2', 'admin', mine], ['rev', 'reviewer', mine], ['outsider', 'admin', theirs],
  ];
  for (const [who, role, t] of roles) {
    await owner.query(
      `INSERT INTO organization_users (organization_id, user_id, role) SELECT $1, $2, $3
        WHERE NOT EXISTS (SELECT 1 FROM organization_users WHERE organization_id = $1 AND user_id = $2)`,
      [t.orgId, users[who], role]);
  }
  // The reviewer-role member reaches the private project as a member of it.
  const member = await owner.query(
    `INSERT INTO project_members (project_id, organization_id, user_id, role, status, invited_by_id)
     SELECT id, organization_id, $3, 'edit', 'active', $4 FROM projects WHERE organization_id = $1 AND regulatory_program_id = $2
     RETURNING project_id`, [mine.orgId, mine.programId, users.rev, users.uploader]);
  expect(member.rows).toHaveLength(1);
  await assertVaultFixtureRuntime(mine);
}, 60_000);

afterAll(async () => {
  await owner.end().catch(() => {});
  await closeVaultFixtureRuntime();
});

describe('reassign an unsigned member (RR3, §2.10, B11, M3)', () => {
  it('keeps the task id, role and step, clears the reminder markers, and records task.assign and review-route.reassign with both names', async () => {
    const { id } = await sent('REASSIGN', ['r1', 'r2'], ['approver']);
    const before = await memberOf(id, 'r1');
    // The due sweep had reminded r1: the markers are metadata, writable without the route setting.
    await owner.query(
      `UPDATE unified_tasks SET metadata = '{"dueSoonNotifiedAt":"2026-10-28T00:00:00.000Z","overdueNotifiedAt":"2026-10-31T00:00:00.000Z","note":"kept"}'::json
        WHERE organization_id = $1 AND task_id = $2`, [mine.orgId, before.task_id]);

    const r = await reassign('uploader', id, before.task_id, 'r3');
    expect(r.status, JSON.stringify(r.body)).toBe(200);
    expect(r.body).toMatchObject({ ok: true, taskId: before.task_id, from: users.r1, to: users.r3, role: 'reviewer' });

    const after = await memberOf(id, 'r3');
    expect(after).toMatchObject({ task_id: before.task_id, review_role: 'reviewer', review_step: 1, status: 'pending', assignee_name: names.r3 });
    expect(after.metadata).toEqual({ note: 'kept' });
    expect((await memberRows(id)).some((m) => m.assignee_id === users.r1), 'r1 is no longer named').toBe(false);

    const assigned = await taskLedger(before.task_id, 'task.assign');
    expect(assigned).toHaveLength(1);
    expect(assigned[0].payload).toMatchObject({ previousAssigneeId: users.r1, assigneeId: users.r3, method: 'named' });
    expect(assigned[0].decision_reason).toBe('Rae is on leave until next month');

    const routeId = await routeIdOf(id);
    const rows = await ledger(id, 'review-route.reassign');
    expect(rows).toHaveLength(1);
    expect(rows[0].decision_reason).toBe('Rae is on leave until next month');
    expect(Number(rows[0].proposed_by)).toBe(users.uploader);
    expect(rows[0].payload).toMatchObject({
      routeId, taskId: before.task_id, role: 'reviewer', step: 1, actorName: names.uploader,
      from: { userId: users.r1, printedName: names.r1 }, to: { userId: users.r3, printedName: names.r3 },
    });
  });

  it('tells the new member and the old one; the task leaves the old tray and enters the new one; the new member signs, the old one cannot', async () => {
    const { id } = await sent('REASSIGN-TRAY', ['r1'], ['approver']);
    const { task_id: taskId } = await memberOf(id, 'r1');
    expect((await myWork('r1')).some((i) => i.taskId === taskId)).toBe(true);
    expect((await reassign('uploader', id, taskId, 'r3')).status).toBe(200);

    const toNew = await noticeFor('r3', 'Review requested: Clinical overview REASSIGN-TRAY');
    expect(toNew).toMatchObject({ category: 'task_assigned', resource_id: taskId });
    const toOld = await noticeFor('r1', 'Review reassigned: Clinical overview REASSIGN-TRAY');
    expect(toOld.category).toBe('task_update');
    expect(toOld.body).toContain('Rae is on leave until next month');

    expect((await myWork('r1')).some((i) => i.taskId === taskId), 'out of the old tray').toBe(false);
    expect((await myWork('r3')).find((i) => i.taskId === taskId)).toMatchObject({ status: 'pending', waitingOn: null });

    const old = await sign('r1', id, 'reviewed');
    expect(old.status, JSON.stringify(old.body)).toBe(403);
    expect(old.body.error).toBe('ROUTE_NOT_NAMED');
    const signed = await sign('r3', id, 'reviewed');
    expect(signed.status, JSON.stringify(signed.body)).toBe(200);
    expect(signed.body.reviewComplete).toBe(true);
  });

  it('an administrator who did not send it reassigns the waiting approver, who then approves once the review is complete', async () => {
    const { id } = await sent('REASSIGN-APPROVER', ['r1'], ['approver']);
    const { task_id: taskId } = await memberOf(id, 'approver');
    const r = await reassign('admin2', id, taskId, 'approver2', { reason: 'The approver has moved to another programme' });
    expect(r.status, JSON.stringify(r.body)).toBe(200);
    expect(await memberOf(id, 'approver2')).toMatchObject({ task_id: taskId, review_role: 'approver', review_step: 2, status: 'blocked' });
    await noticeFor('approver2', 'Approval requested: Clinical overview REASSIGN-APPROVER');
    expect((await sign('r1', id, 'reviewed')).status).toBe(200);
    await noticeFor('approver2', 'It is your turn: approve Clinical overview REASSIGN-APPROVER');
    const approved = await sign('approver2', id, 'approved');
    expect(approved.status, JSON.stringify(approved.body)).toBe(200);
    expect(approved.body.stage).toBe('approved');
  });
});

describe("the reassign picker's read: whom the reassignment would admit (RR3, §2.5)", () => {
  type Candidate = { id: number; reviewer: { code: string } | null; approver: { code: string } | null };
  it("an administrator's read refuses the route's sender, the reader, and everyone already named; another member is offered", async () => {
    const { id, vaultId } = await sent('PICKER-REASSIGN', ['r1'], ['approver']);
    const before = await snapshot(id);
    const r = await request(await appFor(mine, 'admin2')).get(`/api/regulatory/documents/route-candidates/${vaultId}?for=reassign`);
    expect(r.status, JSON.stringify(r.body)).toBe(200);
    const byWho = (who: Who) => (r.body.candidates as Candidate[]).find((c) => c.id === users[who])!;
    expect(byWho('r1').reviewer?.code).toBe('MEMBER_ALREADY_NAMED');
    expect(byWho('approver').approver?.code).toBe('MEMBER_ALREADY_NAMED');
    expect(byWho('uploader').reviewer?.code).toBe('MEMBER_IS_AUTHOR');
    expect(byWho('admin2').reviewer?.code).toBe('MEMBER_IS_ACTOR');
    expect(byWho('r3')).toMatchObject({ reviewer: null, approver: null });
    expect(await snapshot(id)).toEqual(before);
  });
});

describe('reassign is refused, with nothing written (RR3, §2.5, §2.10, B9, M2)', () => {
  let id: string;
  let r1Task: string;
  let r2Task: string;
  let approverTask: string;
  beforeAll(async () => {
    ({ id } = await sent('REFUSALS', ['r1', 'r2'], ['approver']));
    expect((await sign('r2', id, 'reviewed')).status).toBe(200);
    r1Task = (await memberOf(id, 'r1')).task_id;
    r2Task = (await memberOf(id, 'r2')).task_id;
    approverTask = (await memberOf(id, 'approver')).task_id;
  });
  const refusedWith = async (res: Promise<request.Response>, status: number, code: string) => {
    const before = await snapshot(id);
    const r = await res;
    expect(r.status, JSON.stringify(r.body)).toBe(status);
    expect(r.body.error).toBe(code);
    expect(r.body.message ?? '').not.toMatch(/Nothing was sent\./);
    expect(await snapshot(id)).toEqual(before);
    return r;
  };

  it('without a reason (REASON_REQUIRED)', async () => {
    await refusedWith(reassign('uploader', id, r1Task, 'r3', { reason: null }), 400, 'REASON_REQUIRED');
    await refusedWith(reassign('uploader', id, r1Task, 'r3', { reason: '  ' }), 400, 'REASON_REQUIRED');
  });
  it('by someone who is neither the sender nor an administrator', async () => {
    await refusedWith(reassign('rev', id, r1Task, 'r3'), 403, 'ROUTE_REASSIGN_NOT_PERMITTED');
  });
  it('for a member who has signed', async () => {
    await refusedWith(reassign('uploader', id, r2Task, 'r3'), 409, 'ROUTE_MEMBER_SIGNED');
  });
  it('for a task that is not on this route', async () => {
    await refusedWith(reassign('uploader', id, 'TASK-NOT-ON-ROUTE', 'r3'), 404, 'ROUTE_MEMBER_NOT_FOUND');
  });
  it('the reassigning actor naming themselves', async () => {
    await refusedWith(reassign('admin2', id, r1Task, 'admin2'), 409, 'MEMBER_IS_ACTOR');
    await refusedWith(reassign('uploader', id, r1Task, 'uploader'), 409, 'MEMBER_IS_AUTHOR');
  });
  it('an author of the version', async () => {
    const r = await refusedWith(reassign('admin2', id, r1Task, 'uploader'), 409, 'MEMBER_IS_AUTHOR');
    expect(r.body.message).toMatch(/Nothing was changed\./);
  });
  it('a reviewer of this content named as the approver', async () => {
    // r2 signed a review of this digest: the validator refuses them as approver before it sees they are named.
    await refusedWith(reassign('uploader', id, approverTask, 'r2'), 409, 'MEMBER_REVIEWED_THIS_CONTENT');
  });
  it('someone already named on this route', async () => {
    await refusedWith(reassign('uploader', id, r1Task, 'approver'), 409, 'MEMBER_ALREADY_NAMED');
  });
  it("another organization's account", async () => {
    await refusedWith(reassign('uploader', id, r1Task, 'outsider'), 409, 'MEMBER_NOT_IN_ORGANIZATION');
  });
  it("from another organization: the version is not found", async () => {
    await refusedWith(reassign('outsider', id, r1Task, 'r3', { reason: 'Cross-tenant attempt', tenant: theirs }), 404, 'not_found');
  });
  it('once the route was returned: a returner, and every member, is no longer reassigned', async () => {
    const { id: other } = await sent('REFUSALS-RETURNED', ['r1'], ['approver']);
    expect((await post('r1', `/${other}/review-route/return`, { reason: 'Section 2.7.2 needs the updated PK table' })).status).toBe(200);
    const returner = await memberOf(other, 'r1');
    expect(returner.route_act_id).not.toBeNull();
    const before = await snapshot(other);
    const r = await reassign('uploader', other, returner.task_id, 'r3');
    expect(r.status, JSON.stringify(r.body)).toBe(409);
    expect(r.body.error).toBe('ROUTE_NOT_OPEN');
    expect(await snapshot(other)).toEqual(before);
  });
});

describe('hand back: a member returns their own assignment to the sender (RR3, §2.10, M6)', () => {
  it('needs a reason, notifies the sender, leaves the member named and unable to sign; the sender reassigns and the new member signs', async () => {
    const { id, vaultId } = await sent('HANDBACK', ['rev', 'r2'], ['approver']);
    const member = await memberOf(id, 'rev');

    const before = await snapshot(id);
    const noReason = await handBack('rev', id, null);
    expect(noReason.status, JSON.stringify(noReason.body)).toBe(400);
    expect(noReason.body.error).toBe('REASON_REQUIRED');
    expect(await snapshot(id)).toEqual(before);

    const r = await handBack('rev', id);
    expect(r.status, JSON.stringify(r.body)).toBe(200);
    expect(r.body).toMatchObject({ ok: true, taskId: member.task_id });
    const act = (await ledger(id, 'review-route.hand-back'))[0];
    expect(act.decision_reason).toBe('I am on leave for the review window');
    expect(act.payload).toMatchObject({ routeId: await routeIdOf(id), taskId: member.task_id, role: 'reviewer', userId: users.rev, printedName: names.rev });
    const after = await memberOf(id, 'rev');
    expect(after, 'the member stays named until the sender reassigns').toMatchObject({ task_id: member.task_id, route_act_id: act.id, status: 'blocked' });

    const told = await noticeFor('uploader', 'Handed back by Remy Rev: Clinical overview HANDBACK');
    expect(told.category).toBe('task_update');
    expect(told.body).toContain('I am on leave for the review window');
    expect((await myWork('rev')).find((i) => i.taskId === member.task_id)).toMatchObject({ waitingOn: 'the sender to reassign it' });

    const signs = await sign('rev', id, 'reviewed');
    expect(signs.status, JSON.stringify(signs.body)).toBe(409);
    expect(signs.body.error).toBe('ROUTE_HANDED_BACK');
    const twice = await handBack('rev', id);
    expect(twice.status).toBe(409);
    expect(twice.body.error).toBe('ROUTE_HANDED_BACK');
    // The review is not complete while a handed-back reviewer is named.
    const r2 = await sign('r2', id, 'reviewed');
    expect(r2.body.reviewComplete).toBe(false);

    const re = await reassign('uploader', id, member.task_id, 'r3', { reason: 'Remy Rev handed it back; Remy R3 covers' });
    expect(re.status, JSON.stringify(re.body)).toBe(200);
    expect(await memberOf(id, 'r3')).toMatchObject({ task_id: member.task_id, route_act_id: null, status: 'pending' });
    expect((await ledger(id, 'review-route.reassign'))[0].payload).toMatchObject({ handedBackActId: act.id });
    const done = await sign('r3', id, 'reviewed');
    expect(done.status, JSON.stringify(done.body)).toBe(200);
    expect(done.body.reviewComplete).toBe(true);

    // The naming history, by name: sent, handed back, reassigned (§2.12, M3).
    const rd = await round(vaultId);
    expect(rd.history.map((h: { action: string }) => h.action)).toEqual(['send', 'hand-back', 'reassign']);
    expect(rd.history[0]).toMatchObject({ actorName: names.uploader, reason: 'Ready for named review' });
    expect(rd.history[0].members.map((m: { printedName: string; role: string }) => [m.printedName, m.role])).toEqual([
      [names.rev, 'reviewer'], [names.r2, 'reviewer'], [names.approver, 'approver'],
    ]);
    expect(rd.history[1]).toMatchObject({ actorName: names.rev, role: 'reviewer', reason: 'I am on leave for the review window' });
    expect(rd.history[2]).toMatchObject({ actorName: names.uploader, role: 'reviewer', fromName: names.rev, toName: names.r3, reason: 'Remy Rev handed it back; Remy R3 covers' });
    for (const h of rd.history) expect(h.at).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/);
  });

  it('is refused for someone not named, for a member who signed, and from another organization', async () => {
    const { id } = await sent('HANDBACK-REFUSED', ['r1'], ['approver']);
    const notNamed = await handBack('r3', id);
    expect(notNamed.status).toBe(403);
    expect(notNamed.body.error).toBe('ROUTE_NOT_NAMED');
    expect((await sign('r1', id, 'reviewed')).status).toBe(200);
    const signed = await handBack('r1', id);
    expect(signed.status).toBe(409);
    expect(signed.body.error).toBe('ROUTE_MEMBER_SIGNED');
    const cross = await post('outsider', `/${id}/review-route/hand-back`, { reason: 'Cross-tenant attempt' }, theirs);
    expect(cross.status).toBe(404);
    expect(await ledger(id, 'review-route.hand-back')).toHaveLength(0);
  });
});
