/**
 * RR2 of docs/design/REVIEW_ROUTING_2026-10-23.md (§2.6, §2.10, §2.11, §3,
 * NEW-4) on a Vault version: reviewers one after another, more than one
 * approver, and adding a reviewer to an open route. On PostgreSQL as the
 * runtime role with RLS on, through the real ingest, Vault, lifecycle, task and
 * notification routes; the signing ceremony is the one stand-in (its own suites
 * pin it). The harness is RR3's (review-route-vault-rr3.dbtest.ts).
 *
 *   - sequential: each step opens only when the one before it has signed;
 *     each step has its own due date (the header's reviewer_step_due_at and the
 *     member's task); a later step is blocked, reads "waiting", is not
 *     overdue, is not told until it is their turn, and cannot sign;
 *   - several approvers: the approval needs every one of them; an earlier
 *     approver's signature leaves the version in review; /advance→approved is
 *     refused while any is outstanding; the last signature approves and
 *     supersedes the earlier version, on its own transaction;
 *   - adding a reviewer: the sender or an administrator, with a reason and a
 *     due date, through the one validator; the approvers are blocked again and
 *     told; refused once any approval is signed, and in each other case with
 *     nothing written.
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import express from 'express';
import request from 'supertest';
import { Pool } from 'pg';
import { nativeCatalogRunId } from './catalog-native-fixture';
import { assertVaultFixtureDatabase, assertVaultFixtureRuntime, closeVaultFixtureRuntime, seedVaultFixtureParent } from './vault-current-access-fixture';
import { databaseUrl } from '../setup.db';

const RUN = nativeCatalogRunId();
const PROBE = `dbtest-rr2 ${RUN} `;
const CODE = `DBTEST-RR2-${RUN}`;

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

async function ingest(code: string, supersedes?: string): Promise<string> {
  let r = request(await appFor(mine, 'uploader')).post('/api/vault/ingest').field('programId', mine.programId)
    .field('documentTitle', `Clinical overview ${code}`).field('documentType', 'OTHER');
  r = supersedes ? r.field('supersedesDocumentId', supersedes) : r.field('documentCode', `${CODE}-${code}`);
  const res = await r.attach('file', pdf(code), 'overview.pdf');
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
async function sent(code: string, reviewers: Who[], approvers: Who[], shape: object = route(reviewers, approvers), supersedes?: string): Promise<{ vaultId: string; id: string }> {
  const vaultId = await ingest(code, supersedes);
  const s = await post('uploader', '', { sources: { vault_documents: { nativeId: vaultId, role: 'artifact' } } });
  expect(s.status, JSON.stringify(s.body)).toBe(201);
  const id = String(s.body.canonicalId);
  const r = await post('uploader', `/${id}/advance`, { to: 'in_review', reason: 'Ready for named review', route: shape });
  expect(r.status, JSON.stringify(r.body)).toBe(200);
  return { vaultId, id };
}
const sign = (who: Who, id: string, meaning: 'reviewed' | 'approved') =>
  post(who, `/${id}/sign`, { meaning, password: 'x', mfaToken: '000000', reason: `Signed as ${meaning}` });
/** Reviewers one after another, each step with its own due date. */
const sequential = (reviewers: Who[], approvers: Who[], steps: string[] = reviewers.map((_, i) => day(3 + i))) => ({
  reviewers: reviewers.map((w) => users[w]), approvers: approvers.map((w) => users[w]),
  order: 'sequential', reviewStepDueDates: steps, approvalDueDate: day(9),
});
/** Start a version's record and try to send it on `shape`; the version is left wherever the send leaves it. */
async function trySend(code: string, shape: object) {
  const vaultId = await ingest(code);
  const s = await post('uploader', '', { sources: { vault_documents: { nativeId: vaultId, role: 'artifact' } } });
  expect(s.status, JSON.stringify(s.body)).toBe(201);
  const id = String(s.body.canonicalId);
  return { id, res: await post('uploader', `/${id}/advance`, { to: 'in_review', reason: 'Ready for named review', route: shape }) };
}
const addReviewer = (who: Who, id: string, add: Who, opts: { reason?: string | null; dueDate?: string; tenant?: Tenant } = {}) => {
  const reason = opts.reason === undefined ? 'Biostatistics must see the PK tables too' : opts.reason;
  return post(who, `/${id}/review-route/members`, { assigneeId: users[add], dueDate: opts.dueDate ?? day(4), ...(reason === null ? {} : { reason }) }, opts.tenant ?? mine);
};
const stageOf = async (id: string) => (await owner.query(
  `SELECT stage, review_signature FROM canonical_documents WHERE organization_id = $1 AND canonical_id = $2`, [mine.orgId, id])).rows[0];
const header = async (id: string) => (await owner.query(
  `SELECT * FROM review_routes WHERE organization_id = $1 AND subject_id = $2 ORDER BY created_at DESC LIMIT 1`, [mine.orgId, id])).rows[0];
async function noNotice(who: Who, title: string): Promise<void> {
  await new Promise((r) => setTimeout(r, 600));
  const { rows } = await owner.query(`SELECT 1 FROM mdx_notifications WHERE organization_id = $1 AND recipient_user_id = $2 AND title = $3`, [mine.orgId, users[who], title]);
  expect(rows, `${who} was told "${title}" before it was their turn`).toHaveLength(0);
}

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
    [`${PROBE}${slug}`, `dbtest-rr2-${RUN}-${slug}`]);
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
      [`dbtest-rr2-${RUN}-${who}@example.test`, names[who]]);
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


describe('reviewers one after another (RR2, §3, §2.11)', () => {
  it('stores each step with its own due date; only the first step is open, and only it is told', async () => {
    const steps = [day(3), day(5)];
    const { id, vaultId } = await sent('SEQ-SEND', ['r1', 'r2'], ['approver'], sequential(['r1', 'r2'], ['approver'], steps));
    const h = await header(id);
    expect(h.review_order).toBe('sequential');
    expect((h.reviewer_step_due_at as Date[]).map((d) => new Date(d).toISOString())).toHaveLength(2);
    expect(new Date(h.review_due_at).getTime()).toBe(new Date((h.reviewer_step_due_at as Date[])[1]).getTime());
    const [r1, r2, ap] = [await memberOf(id, 'r1'), await memberOf(id, 'r2'), await memberOf(id, 'approver')];
    expect([r1.review_step, r2.review_step, ap.review_step]).toEqual([1, 2, 3]);
    expect([r1.status, r2.status, ap.status]).toEqual(['pending', 'blocked', 'blocked']);
    const dues = (await owner.query(`SELECT assignee_id, due_date FROM unified_tasks WHERE organization_id = $1 AND task_id = ANY($2::text[])`,
      [mine.orgId, [r1.task_id, r2.task_id]])).rows;
    const dueOf = (who: Who) => new Date(dues.find((d) => Number(d.assignee_id) === users[who]).due_date).getTime();
    expect(dueOf('r1')).toBeLessThan(dueOf('r2'));
    expect(dueOf('r1')).toBe(new Date((h.reviewer_step_due_at as Date[])[0]).getTime());
    await noticeFor('r1', 'Review requested: Clinical overview SEQ-SEND');
    await noNotice('r2', 'Review requested: Clinical overview SEQ-SEND');
    const sendRow = (await ledger(id, 'review-route.send'))[0];
    expect(sendRow.payload.order).toBe('sequential');
    expect(sendRow.payload.members.map((m: { step: number }) => m.step)).toEqual([1, 2, 3]);
    const panel = await round(vaultId);
    expect(panel.members.map((m: { stepOpen: boolean }) => m.stepOpen)).toEqual([true, false, false]);
  });

  it('a later step is waiting: it cannot sign, is not overdue in Tasks, and the due sweep leaves it alone', async () => {
    const { id } = await sent('SEQ-WAIT', ['r1', 'r2'], ['approver'], sequential(['r1', 'r2'], ['approver']));
    const r2 = await memberOf(id, 'r2');
    const early = await sign('r2', id, 'reviewed');
    expect(early.status, JSON.stringify(early.body)).toBe(409);
    expect(early.body.error).toBe('ROUTE_STEP_NOT_OPEN');
    // Its due date passes while it waits: it is still not overdue, and not reminded.
    await owner.query(`ALTER TABLE unified_tasks DISABLE TRIGGER unified_tasks_route_rows_guard`);
    try {
      await owner.query(`UPDATE unified_tasks SET due_date = now() - interval '2 days' WHERE organization_id = $1 AND task_id = $2`, [mine.orgId, r2.task_id]);
    } finally {
      await owner.query(`ALTER TABLE unified_tasks ENABLE TRIGGER unified_tasks_route_rows_guard`);
    }
    const item = (await myWork('r2')).find((i) => i.taskId === r2.task_id) as { status: string; waitingOn: string | null; overdue?: boolean };
    expect(item).toMatchObject({ status: 'blocked', overdue: false });
    expect(item.waitingOn).toBeTruthy();
    const { runTaskDueSweep } = await import('../../server/jobs/taskDueSweep');
    await runTaskDueSweep();
    const meta = (await owner.query(`SELECT metadata FROM unified_tasks WHERE organization_id = $1 AND task_id = $2`, [mine.orgId, r2.task_id])).rows[0].metadata;
    expect(meta?.overdueNotifiedAt ?? null).toBeNull();
  });

  it('opens each step when the one before signs, telling only that step; the review completes on the last', async () => {
    const { id } = await sent('SEQ-OPEN', ['r1', 'r2'], ['approver'], sequential(['r1', 'r2'], ['approver']));
    const first = await sign('r1', id, 'reviewed');
    expect(first.status, JSON.stringify(first.body)).toBe(200);
    expect(first.body.reviewComplete).toBe(false);
    expect((await stageOf(id)).review_signature).toBeNull();
    expect((await memberOf(id, 'r2')).status).toBe('pending');
    expect((await memberOf(id, 'approver')).status).toBe('blocked');
    const turn = await noticeFor('r2', 'It is your turn: review Clinical overview SEQ-OPEN');
    expect(turn.category).toBe('task_update');
    await noNotice('approver', 'It is your turn: approve Clinical overview SEQ-OPEN');
    const opened = await taskLedger((await memberOf(id, 'r2')).task_id, 'task.transition');
    expect(opened.some((t) => t.payload.from === 'blocked' && t.payload.to === 'pending')).toBe(true);

    expect((await sign('approver', id, 'approved')).body.error).toBe('REVIEW_INCOMPLETE');
    const second = await sign('r2', id, 'reviewed');
    expect(second.status, JSON.stringify(second.body)).toBe(200);
    expect(second.body.reviewComplete).toBe(true);
    expect((await stageOf(id)).review_signature).not.toBeNull();
    await noticeFor('approver', 'It is your turn: approve Clinical overview SEQ-OPEN');
    const approved = await sign('approver', id, 'approved');
    expect(approved.status, JSON.stringify(approved.body)).toBe(200);
    expect(approved.body.stage).toBe('approved');
  });

  it('refuses a sequential route whose steps lack dates, whose dates run backwards, or whose approval is due before the last step, with nothing written', async () => {
    const cases: Array<[string, object, string]> = [
      ['no step dates', { ...sequential(['r1', 'r2'], ['approver']), reviewStepDueDates: undefined }, 'ROUTE_DUE_DATES_REQUIRED'],
      ['one date for two steps', sequential(['r1', 'r2'], ['approver'], [day(3)]), 'ROUTE_DUE_DATES_REQUIRED'],
      ['steps due backwards', sequential(['r1', 'r2'], ['approver'], [day(5), day(3)]), 'ROUTE_DUE_ORDER'],
      ['approval before the last step', { ...sequential(['r1', 'r2'], ['approver'], [day(3), day(8)]), approvalDueDate: day(6) }, 'ROUTE_DUE_ORDER'],
      ['a step already past', sequential(['r1', 'r2'], ['approver'], [day(-1), day(3)]), 'ROUTE_DUE_IN_PAST'],
    ];
    for (const [label, shape, code] of cases) {
      const { id, res } = await trySend(`SEQ-BAD-${code}-${label.length}`, shape);
      expect(res.status, `${label}: ${JSON.stringify(res.body)}`).toBeGreaterThanOrEqual(400);
      expect(res.body.error, label).toBe(code);
      expect((await stageOf(id)).stage, label).toBe('authoring');
      expect(await header(id), label).toBeUndefined();
    }
  });
});

describe('more than one approver (RR2, NEW-4: every named approver)', () => {
  it('an earlier approver leaves the version in review; /advance→approved is refused; the last approves and supersedes', async () => {
    // An approved first version, which the routed second one supersedes.
    const v1 = await sent('MULTI-V1', ['r1'], ['approver']);
    expect((await sign('r1', v1.id, 'reviewed')).status).toBe(200);
    expect((await sign('approver', v1.id, 'approved')).body.stage).toBe('approved');

    const { id, vaultId } = await sent('MULTI-V2', ['r2'], ['approver', 'approver2'], route(['r2'], ['approver', 'approver2']), v1.vaultId);
    expect([(await memberOf(id, 'approver')).review_step, (await memberOf(id, 'approver2')).review_step]).toEqual([2, 2]);
    expect((await sign('r2', id, 'reviewed')).body.reviewComplete).toBe(true);
    await noticeFor('approver', 'It is your turn: approve Clinical overview MULTI-V2');
    await noticeFor('approver2', 'It is your turn: approve Clinical overview MULTI-V2');

    const first = await sign('approver', id, 'approved');
    expect(first.status, JSON.stringify(first.body)).toBe(200);
    expect(first.body).toMatchObject({ approvalComplete: false, stage: 'in_review' });
    expect((await stageOf(id)).stage).toBe('in_review');
    expect((await header(id)).status).toBe('open');
    expect((await memberOf(id, 'approver')).status).toBe('completed');
    expect((await memberOf(id, 'approver2')).status).toBe('pending');
    const panel = await round(vaultId);
    expect(panel.approvalComplete).toBe(false);
    expect(panel.members.filter((m: { role: string; outcome: string }) => m.role === 'approver').map((m: { outcome: string }) => m.outcome)).toEqual(['signed', 'pending']);

    const advance = await post('approver2', `/${id}/advance`, { to: 'approved', password: 'x', reason: 'Approve by advancing' });
    expect(advance.status, JSON.stringify(advance.body)).toBe(409);
    expect(advance.body.error).toBe('ROUTE_APPROVAL_BY_SIGN');
    expect((await sign('approver', id, 'approved')).body.error).toBe('SIGNATURE_ALREADY_RECORDED');

    const last = await sign('approver2', id, 'approved');
    expect(last.status, JSON.stringify(last.body)).toBe(200);
    expect(last.body).toMatchObject({ approvalComplete: true, stage: 'approved' });
    expect(last.body.superseded).toContain(v1.id);
    expect((await stageOf(v1.id)).stage).toBe('superseded');
    expect((await header(id)).status).toBe('complete');
    const sigs = (await owner.query(
      `SELECT signer_id, upper(signature_meaning) AS meaning, bound_payload_digest FROM electronic_signatures
        WHERE organization_id = $1 AND signed_target = $2 ORDER BY id`, [mine.orgId, `canonical_document:${id}`])).rows;
    expect(sigs.filter((s) => s.meaning === 'APPROVED').map((s) => Number(s.signer_id))).toEqual([users.approver, users.approver2]);
    expect(new Set(sigs.map((s) => s.bound_payload_digest)).size).toBe(1);
  });
});

describe('adding a reviewer to an open route (RR2, §2.10)', () => {
  it('blocks the approvers again and tells them; the new reviewer signs, then the approver approves', async () => {
    const { id, vaultId } = await sent('ADD', ['r1'], ['approver']);
    expect((await sign('r1', id, 'reviewed')).body.reviewComplete).toBe(true);
    expect((await memberOf(id, 'approver')).status).toBe('pending');

    const r = await addReviewer('uploader', id, 'r2', { dueDate: day(4) });
    expect(r.status, JSON.stringify(r.body)).toBe(200);
    const added = await memberOf(id, 'r2');
    expect(added).toMatchObject({ review_role: 'reviewer', review_step: 1, status: 'pending', assignee_name: names.r2 });
    expect(r.body).toMatchObject({ ok: true, taskId: added.task_id, role: 'reviewer', step: 1 });
    expect((await memberOf(id, 'approver')).status).toBe('blocked');
    await noticeFor('r2', 'Review requested: Clinical overview ADD');
    const reblocked = await noticeFor('approver', 'Waiting on a new reviewer: Clinical overview ADD');
    expect(reblocked.category).toBe('task_update');
    expect(reblocked.body).toContain('Biostatistics must see the PK tables too');

    const [row] = await ledger(id, 'review-route.add');
    expect(row.decision_reason).toBe('Biostatistics must see the PK tables too');
    expect(row.payload).toMatchObject({ routeId: await routeIdOf(id), role: 'reviewer', step: 1, actorName: names.uploader,
      member: { userId: users.r2, printedName: names.r2 } });
    expect((await round(vaultId)).history.map((e: { action: string }) => e.action)).toEqual(['send', 'add']);

    const early = await sign('approver', id, 'approved');
    expect(early.body.error).toBe('REVIEW_INCOMPLETE');
    const signed = await sign('r2', id, 'reviewed');
    expect(signed.status, JSON.stringify(signed.body)).toBe(200);
    expect(signed.body.reviewComplete).toBe(true);
    await noticeFor('approver', 'It is your turn: approve Clinical overview ADD');
    const approved = await sign('approver', id, 'approved');
    expect(approved.status, JSON.stringify(approved.body)).toBe(200);
    expect(approved.body.stage).toBe('approved');
  });

  it('on a sequential route the new reviewer is the next step, and the approvers move after it', async () => {
    const { id } = await sent('ADD-SEQ', ['r1'], ['approver'], sequential(['r1'], ['approver']));
    const r = await addReviewer('admin2', id, 'r2', { reason: 'Clinical pharmacology to review after medical', dueDate: day(6) });
    expect(r.status, JSON.stringify(r.body)).toBe(200);
    expect(await memberOf(id, 'r2')).toMatchObject({ review_step: 2, status: 'blocked' });
    expect((await memberOf(id, 'approver')).review_step).toBe(3);
    const h = await header(id);
    expect((h.reviewer_step_due_at as Date[])).toHaveLength(2);
    expect(new Date(h.review_due_at).getTime()).toBe(new Date((h.reviewer_step_due_at as Date[])[1]).getTime());
    await noNotice('r2', 'Review requested: Clinical overview ADD-SEQ');
    expect((await sign('r1', id, 'reviewed')).body.reviewComplete).toBe(false);
    await noticeFor('r2', 'It is your turn: review Clinical overview ADD-SEQ');
    expect((await sign('r2', id, 'reviewed')).body.reviewComplete).toBe(true);
  });

  it('is refused, with nothing written: no reason, neither sender nor admin, someone named, an author, another organization, a date after the approval, and once an approval is signed', async () => {
    const { id } = await sent('ADD-REFUSE', ['r1'], ['approver', 'approver2'], route(['r1'], ['approver', 'approver2']));
    const before = await snapshot(id);
    const cases: Array<[string, () => Promise<request.Response>, number, string]> = [
      ['no reason', () => addReviewer('uploader', id, 'r2', { reason: null }), 400, 'REASON_REQUIRED'],
      ['neither sender nor admin', () => addReviewer('rev', id, 'r2'), 403, 'ROUTE_ADD_NOT_PERMITTED'],
      ['someone already named', () => addReviewer('uploader', id, 'approver2'), 409, 'MEMBER_ALREADY_NAMED'],
      ['the uploader', () => addReviewer('admin2', id, 'uploader'), 409, 'MEMBER_IS_AUTHOR'],
      ['another organization’s account', () => addReviewer('uploader', id, 'outsider'), 409, 'MEMBER_NOT_IN_ORGANIZATION'],
      ['due after the approval', () => addReviewer('uploader', id, 'r2', { dueDate: day(30) }), 400, 'ROUTE_DUE_ORDER'],
      ['another organization’s version', () => addReviewer('outsider', id, 'r2', { tenant: theirs }), 404, 'not_found'],
    ];
    for (const [label, act, status, code] of cases) {
      const res = await act();
      expect(res.status, `${label}: ${JSON.stringify(res.body)}`).toBe(status);
      expect(res.body.error, label).toBe(code);
    }
    expect(await snapshot(id)).toEqual(before);
    expect((await sign('r1', id, 'reviewed')).status).toBe(200);
    expect((await sign('approver', id, 'approved')).body.approvalComplete).toBe(false);
    const started = await snapshot(id);
    const late = await addReviewer('uploader', id, 'r2');
    expect(late.status, JSON.stringify(late.body)).toBe(409);
    expect(late.body.error).toBe('ROUTE_APPROVAL_STARTED');
    expect(await snapshot(id)).toEqual(started);
  });

  it("the add picker's read is the reassignment's: the sender, the reader and everyone named are refused", async () => {
    const { vaultId } = await sent('ADD-PICKER', ['r1'], ['approver']);
    const r = await request(await appFor(mine, 'admin2')).get(`/api/regulatory/documents/route-candidates/${vaultId}?for=add`);
    expect(r.status, JSON.stringify(r.body)).toBe(200);
    type C = { id: number; reviewer: { code: string } | null };
    const byWho = (who: Who) => (r.body.candidates as C[]).find((c) => c.id === users[who])!;
    expect(byWho('r1').reviewer?.code).toBe('MEMBER_ALREADY_NAMED');
    expect(byWho('admin2').reviewer?.code).toBe('MEMBER_IS_ACTOR');
    expect(byWho('r2').reviewer).toBeNull();
  });
});

/* ── RR2 records (2026-10-29) ─────────────────────────────────────────────────
   Design issues 1 and 2 of docs/evidence/D2-REVIEW-ROUTING/2026-10-29-RR2/:
   an earlier approver's signature was recorded exactly as the last one, and the
   version's "Review signed by" line named only the reviewer whose signature
   first completed the review (review_signature, written once per round). */
async function lifecycleOf(vaultId: string) {
  const r = await request(await appFor(mine, 'uploader')).get(`/api/c2c/project-vault/${mine.programId}/documents/${vaultId}/versions`);
  expect(r.status, JSON.stringify(r.body)).toBe(200);
  return r.body.data.versions[0].lifecycle;
}
const signatureRows = async (id: string) => (await owner.query(
  `SELECT id, signer_id, signer_name, signed_at, signature_type, upper(signature_meaning) AS meaning, signature_manifest
     FROM electronic_signatures WHERE organization_id = $1 AND signed_target = $2 ORDER BY id`, [mine.orgId, `canonical_document:${id}`])).rows;
async function trail(id: string): Promise<Array<{ event: string; signatureRef?: string | null }>> {
  const { runWithTenantScope } = await import('../../server/db/tenantStore');
  const { inTenantSnapshot } = await import('../../server/services/audit/compliance-reports/generate');
  const { readRecordAuditHistory } = await import('../../server/routes/audit-trail-ledger.routes');
  const { getPool } = await import('../../server/db/runtime');
  const notWalked = async () => ({ ok: true, rowsChecked: 0, tenants: 1, legacyRows: 0, sequencedRows: 0 }) as never;
  return runWithTenantScope({ tenantId: String(mine.orgId), orgUuid: mine.orgUuid, role: 'admin', source: 'request', caller: 'vault-rr2 records dbtest' } as never,
    () => inTenantSnapshot(getPool() as never, mine.orgId, async (client) =>
      (await readRecordAuditHistory(client as never, mine.orgId, { tableName: 'canonical_document', recordId: id }, notWalked)).data));
}
const utcOf = (v: unknown) => new Date(v as string).toISOString();

describe('an earlier Vault approval is its own record (RR2 records, Part 11 §11.50)', () => {
  it('is its own signature type carrying k of n, and the audit trail never reads it as the approval', async () => {
    const { id } = await sent('REC-APPROVALS', ['r1'], ['approver', 'approver2'], route(['r1'], ['approver', 'approver2']));
    expect((await sign('r1', id, 'reviewed')).status).toBe(200);
    expect((await sign('approver', id, 'approved')).body).toMatchObject({ approvalComplete: false, stage: 'in_review' });
    const interim = (await signatureRows(id)).find((s) => s.meaning === 'APPROVED')!;
    expect(interim.signature_type).toBe('regulated-document-lifecycle-interim-approval');
    expect(interim.signature_manifest).toMatchObject({ approvalsRecorded: 1, approvalsRequired: 2, stage: 'in_review' });
    const [signedLedger] = (await ledger(id, 'sign')).filter((r) => r.payload.meaning === 'APPROVED');
    expect(signedLedger.payload).toMatchObject({ approvalsRecorded: 1, approvalsRequired: 2 });
    expect.soft((await trail(id)).find((e) => e.signatureRef === `electronic_signatures:${interim.id}`)?.event)
      .toBe('Version approval signed, 1 of 2 required; the version is not yet approved (e-signature)');

    expect((await sign('approver2', id, 'approved')).body).toMatchObject({ approvalComplete: true, stage: 'approved' });
    const final = (await signatureRows(id)).filter((s) => s.meaning === 'APPROVED')[1];
    expect(final.signature_type).toBe('regulated-document-lifecycle');
    expect(final.signature_manifest).toMatchObject({ approvalsRecorded: 2, approvalsRequired: 2 });
    const events = await trail(id);
    expect.soft(events.find((e) => e.signatureRef === `electronic_signatures:${interim.id}`)?.event)
      .toBe('Version approval signed, 1 of 2 required; the version is not yet approved (e-signature)');
    expect.soft(events.find((e) => e.signatureRef === `electronic_signatures:${final.id}`)?.event).not.toMatch(/required|not yet approved/);
  });
});

describe('the version’s sign-off lines name every signer on a routed version (RR2 records, §2.12)', () => {
  it('two reviewers and two approvers: each line names everyone who signed, with printed name and UTC time', async () => {
    const { id, vaultId } = await sent('REC-LINES', ['r1', 'r2'], ['approver', 'approver2'], route(['r1', 'r2'], ['approver', 'approver2']));
    expect((await sign('r1', id, 'reviewed')).status).toBe(200);
    expect((await lifecycleOf(vaultId)).reviewSignOffs ?? null).toBeNull(); // the review is not signed off yet
    expect((await sign('r2', id, 'reviewed')).body.reviewComplete).toBe(true);
    const reviews = (await signatureRows(id)).filter((s) => s.meaning === 'REVIEWED');
    const reviewed = await lifecycleOf(vaultId);
    expect(reviewed.review.printedName).toBe(names.r2); // review_signature: only the signature that completed the review
    expect(reviewed.reviewSignOffs).toEqual(reviews.map((s) => ({
      printedName: s.signer_name, meaning: 'REVIEWED', signedAt: utcOf(s.signed_at), signatureRef: `esig:${s.id}`, signerId: Number(s.signer_id),
    })));
    expect(reviewed.reviewSignOffs.map((s: { printedName: string }) => s.printedName)).toEqual([names.r1, names.r2]);
    expect(reviewed.approvalSignOffs ?? null).toBeNull();

    expect((await sign('approver', id, 'approved')).status).toBe(200);
    expect((await lifecycleOf(vaultId)).approvalSignOffs ?? null).toBeNull(); // 1 of 2: the version is not approved
    expect((await sign('approver2', id, 'approved')).body.stage).toBe('approved');
    const approved = await lifecycleOf(vaultId);
    expect(approved.approvalSignOffs.map((s: { printedName: string; meaning: string }) => [s.printedName, s.meaning]))
      .toEqual([[names.approver, 'APPROVED'], [names.approver2, 'APPROVED']]);
    expect(approved.approvalSignOffs.every((s: { signedAt: string }) => /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/.test(s.signedAt))).toBe(true);
  });

  it('a reviewer added after the review was signed off is on the line too; review_signature is not rewritten', async () => {
    const { id, vaultId } = await sent('REC-ADDED', ['r1'], ['approver']);
    expect((await sign('r1', id, 'reviewed')).body.reviewComplete).toBe(true);
    const before = (await stageOf(id)).review_signature;
    expect((await addReviewer('uploader', id, 'r3')).status).toBe(200);
    expect((await sign('r3', id, 'reviewed')).status).toBe(200);
    expect((await stageOf(id)).review_signature).toEqual(before);
    const lc = await lifecycleOf(vaultId);
    expect(lc.review.printedName).toBe(names.r1);
    expect(lc.reviewSignOffs.map((s: { printedName: string }) => s.printedName)).toEqual([names.r1, names.r3]);
  });
});
