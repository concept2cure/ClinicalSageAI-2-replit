/**
 * RR4 of docs/design/REVIEW_ROUTING_2026-10-23.md: the review route on a QMS
 * controlled document (§2.7–§2.10, §2.13; NEW-4; decision D-Q). On PostgreSQL
 * as the runtime role with RLS on, through the real QMS, membership, task and
 * signing routes. The signing ceremony is the real one (password, bcrypt).
 *
 *   - D-Q: an administrator designates QMS approvers with a reason, each a
 *     governed chained ledger row; a designee holds signing authority; until
 *     the organization designates anyone, the Approver role stands in;
 *   - the route rule: at least one designated approver, reviewers optional, the
 *     approver not the author or a contributor; sending without a route is
 *     refused;
 *   - signing: the review is signGovernedAct with a precheck before the
 *     credential and afterSign on its transaction; the task-close row cites
 *     esig:<id>; the approval goes through the existing approve and completes
 *     the route; the review digest equals the approval digest;
 *   - every exit from review closes the route: Return for revision
 *     (in_review → draft), retirement, and edits refused while it is open;
 *   - withdraw never falls back to the old rule; reassign and hand back as RR3;
 *   - grandfathering: a document already in review with no route keeps
 *     today's rule until someone names reviewers on it.
 */
import { randomUUID } from 'node:crypto';
import bcrypt from 'bcryptjs';
import express from 'express';
import jwt from 'jsonwebtoken';
import { Pool } from 'pg';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { databaseUrl } from '../setup.db';
import { seedNativeCatalogProject } from './catalog-native-fixture';

vi.mock('../../server/middleware/signing-attempt-limiter', () => ({
  signingAttemptLimiter: () => (_req: unknown, _res: unknown, next: () => void) => next(),
}));

const TAG = `qms-rr4-${randomUUID().slice(0, 8)}`;
const PASSWORD = 'test-qms-rr4-route-fixture';
const REASON = 'Ready for independent quality review of the invented procedure.';
const originalRbacFlag = process.env.GOVERNANCE_RBAC_ENFORCE;
const WHO = ['author', 'r1', 'r2', 'r3', 'qa', 'qa2', 'admin', 'member', 'contrib', 'outsider'] as const;
type Who = (typeof WHO)[number];
type Actor = { id: number; token: string; role: string; name: string };
let owner: Pool;
let orgId: number;
let otherOrgId: number;
let programId: string;
let app: express.Express;
const actors = {} as Record<Who, Actor>;

const day = (offset: number) => new Date(Date.now() + offset * 86_400_000).toISOString().slice(0, 10);

async function account(key: Who, role: string, org: number): Promise<Actor> {
  const name = `Quinn ${key[0].toUpperCase()}${key.slice(1)} ${TAG}`;
  const user = (await owner.query(`INSERT INTO users(email,name,password_hash,status) VALUES($1,$2,$3,'active') RETURNING id`,
    [`${TAG}-${key}@example.invalid`, name, await bcrypt.hash(PASSWORD, 4)])).rows[0];
  const id = Number(user.id);
  await owner.query('INSERT INTO organization_users(organization_id,user_id,role) VALUES($1,$2,$3)', [org, id, role]);
  const { activeJwtSecret } = await import('../../server/utils/jwtVerify');
  return { id, role, name, token: jwt.sign({ type: 'access', id: String(id), userId: String(id), organizationId: String(org), role },
    activeJwtSecret(), { expiresIn: '1h' }) };
}

const http = (who: Who, method: 'get' | 'post' | 'patch' | 'put', path: string, body?: Record<string, unknown>) =>
  request(app)[method](path).set('Authorization', `Bearer ${actors[who].token}`).send(body);
const qms = (who: Who, method: 'get' | 'post' | 'patch', path: string, body?: Record<string, unknown>) => http(who, method, `/api/mdx/qms${path}`, body);
const codeOf = (r: request.Response) => r.body?.details?.code ?? r.body?.error?.code ?? r.body?.error;

/** A draft with saved controlled text, written by `author` (and, optionally, a recorded contributor). */
async function draft(key: string, contributors: Who[] = [], author: Who = 'author'): Promise<number> {
  const metadata: Record<string, unknown> = { sections: [{ key: 'procedure', label: 'Procedure', body: `Record each ${key} correction with its reason.` }] };
  if (contributors.length) metadata.controlledTextAuthorship = { authorUserIds: [actors.author.id, ...contributors.map((w) => actors[w].id)].sort((a, b) => a - b) };
  const row = (await owner.query(`INSERT INTO qms_documents (organization_id,doc_number,title,doc_type,version,status,author_id,next_review_date,metadata)
    VALUES($1,$2,$3,'sop','1.0','draft',$4,$5::date,$6::jsonb) RETURNING id`,
  [orgId, `${TAG}-${key}`, `${TAG} invented procedure ${key}`, actors[author].id, day(200), JSON.stringify(metadata)])).rows[0];
  return Number(row.id);
}
const route = (reviewers: Who[], approvers: Who[]) => ({
  reviewers: reviewers.map((w) => actors[w].id), approvers: approvers.map((w) => actors[w].id),
  order: 'parallel', ...(reviewers.length ? { reviewDueDate: day(3) } : {}), approvalDueDate: day(5),
});
const send = (id: number, reviewers: Who[], approvers: Who[], by: Who = 'author') =>
  qms(by, 'patch', `/documents/${id}`, { status: 'in_review', reason: REASON, route: route(reviewers, approvers) });
const signReview = (who: Who, id: number, password = PASSWORD) =>
  qms(who, 'post', `/documents/${id}/review`, { password, meaning: 'REVIEWED', reason: 'I reviewed the procedure as written.' });
const approve = (who: Who, id: number, password = PASSWORD) =>
  qms(who, 'post', `/documents/${id}/approve`, { password, meaning: 'APPROVED', reason: 'Approved as the designated QMS approver.' });
const designate = (who: Who, target: Who, designated: boolean, reason: string | null = 'Named the site QA approver for SOP control.') =>
  http(who, 'put', `/api/tenant-users/${orgId}/${actors[target].id}/qms-approver`, { designated, ...(reason === null ? {} : { reason }) });

const doc = async (id: number) => (await owner.query(`SELECT status, version, approver_id, metadata FROM qms_documents WHERE id = $1`, [id])).rows[0];
const latestRoute = async (id: number) => (await owner.query(
  `SELECT * FROM review_routes WHERE organization_id = $1 AND subject_type = 'qms_document' AND subject_id = $2 ORDER BY created_at DESC LIMIT 1`,
  [orgId, String(id)])).rows[0];
const routeCount = async (id: number) => Number((await owner.query(
  `SELECT count(*)::int AS n FROM review_routes WHERE organization_id = $1 AND subject_type = 'qms_document' AND subject_id = $2`, [orgId, String(id)])).rows[0].n);
async function members(id: number) {
  const r = await latestRoute(id);
  if (!r) return [];
  const { rows } = await owner.query(
    `SELECT task_id, assignee_id, review_role, review_step, status, route_signature_id, route_act_id, module_type
       FROM unified_tasks WHERE organization_id = $1 AND review_route_id = $2 ORDER BY review_step, id`, [orgId, r.id]);
  return rows.map((m) => ({ ...m, assignee_id: Number(m.assignee_id) }));
}
const memberOf = async (id: number, who: Who) => (await members(id)).find((m) => m.assignee_id === actors[who].id)!;
const signatures = async (id: number) => (await owner.query(
  `SELECT id, signer_id, signature_meaning, signature_type, bound_payload_digest, binding_basis, organization_id
     FROM electronic_signatures WHERE signed_target = $1 ORDER BY id`, [`qms-document:${id}`])).rows;
const ledger = async (target: string, command: string) => (await owner.query(
  `SELECT a.command, a.decision_reason, a.payload, a.proposed_by, l.sha256_chain
     FROM c2c_ana_actions a LEFT JOIN audit_logs l ON l.ana_action_id = a.id
    WHERE a.org_id = $1 AND a.target = $2 AND a.command = $3 ORDER BY a.executed_at, a.id`, [orgId, target, command])).rows;
const ledgerCount = async () => Number((await owner.query(`SELECT count(*)::int AS n FROM c2c_ana_actions WHERE org_id = $1`, [orgId])).rows[0].n);
const taskClose = async (taskId: string) => (await owner.query(
  `SELECT payload FROM c2c_ana_actions WHERE org_id = $1 AND command = 'task.transition' AND target LIKE '%' || $2 ORDER BY executed_at, id`,
  [orgId, taskId])).rows.map((r) => r.payload);
const failedAttempts = async (who: Who) => Number((await owner.query(`SELECT COALESCE(failed_login_attempts,0)::int AS n FROM users WHERE id = $1`, [actors[who].id])).rows[0].n);
async function noticeFor(who: Who, title: RegExp): Promise<{ category: string; title: string; body: string | null }> {
  for (let i = 0; i < 50; i++) {
    const { rows } = await owner.query(
      `SELECT category, title, body FROM mdx_notifications WHERE organization_id = $1 AND recipient_user_id = $2 ORDER BY id DESC LIMIT 20`,
      [orgId, actors[who].id]);
    const hit = rows.find((r) => title.test(String(r.title)));
    if (hit) return hit;
    await new Promise((r) => setTimeout(r, 100));
  }
  throw new Error(`No notice ${title} reached ${who}`);
}

beforeAll(async () => {
  if (!process.env.APP_DATABASE_URL) throw new Error('APP_DATABASE_URL must use the provisioned non-owner runtime role.');
  process.env.GOVERNANCE_RBAC_ENFORCE = 'false';
  owner = new Pool({ connectionString: databaseUrl, max: 4 });
  const org = (await owner.query("INSERT INTO organizations(name,slug,status,payment_status) VALUES($1,$1,'active','active') RETURNING id", [TAG])).rows[0];
  orgId = Number(org.id);
  const other = (await owner.query("INSERT INTO organizations(name,slug,status,payment_status) VALUES($1,$1,'active','active') RETURNING id", [`${TAG}-other`])).rows[0];
  otherOrgId = Number(other.id);
  const roles: Record<Who, string> = {
    author: 'member', r1: 'reviewer', r2: 'reviewer', r3: 'reviewer', qa: 'approver', qa2: 'approver', admin: 'admin',
    member: 'member', contrib: 'reviewer', outsider: 'admin',
  };
  for (const who of WHO) actors[who] = await account(who, roles[who], who === 'outsider' ? otherOrgId : orgId);
  const program = await owner.query(`INSERT INTO regulatory_programs (name, code, organization_id, program_type, product_type, primary_agency, product_name)
    VALUES ($1, $2, $3, 'IND', 'drug', 'FDA', 'Invented product') RETURNING id`, [`${TAG} program`, TAG.toUpperCase(), orgId]);
  programId = String(program.rows[0].id);
  const { projectId } = await seedNativeCatalogProject(owner, { organizationId: orgId, userId: actors.author.id, programId, namespace: TAG });
  await owner.query('INSERT INTO project_visibility_settings (organization_id, project_id, visibility) VALUES ($1, $2, $3)', [orgId, projectId, 'org_public']);
  const { createAuthBoundary } = await import('../../server/middleware/authBoundary');
  app = express(); app.use(express.json());
  app.use('/api', createAuthBoundary());
  app.use('/api/mdx', (await import('../../server/routes/mdx-qms')).default);
  app.use('/api/tenant-users', (await import('../../server/routes/tenant-users')).default);
}, 120_000);

afterAll(async () => {
  if (originalRbacFlag == null) delete process.env.GOVERNANCE_RBAC_ENFORCE;
  else process.env.GOVERNANCE_RBAC_ENFORCE = originalRbacFlag;
  if (owner && orgId) await owner.query("UPDATE organizations SET status='inactive' WHERE id = ANY($1::int[])", [[orgId, otherOrgId]]);
  const { getPool } = await import('../../server/db/runtime');
  await getPool().end(); await owner?.end();
});

describe('D-Q: an administrator designates QMS approvers (RR4, §7.8)', () => {
  it('until anyone is designated, the Approver role stands in; a reviewer is not a QMS approver', async () => {
    const id = await draft('STANDIN');
    const asReviewer = await send(id, [], ['r1']);
    expect(asReviewer.status, JSON.stringify(asReviewer.body)).toBe(409);
    expect(codeOf(asReviewer)).toBe('MEMBER_NOT_QMS_APPROVER');
    expect(asReviewer.body.error).toMatch(/until an administrator designates QMS approvers/);
    expect((await doc(id)).status).toBe('draft');
    expect(await routeCount(id)).toBe(0);
    const candidates = await qms('author', 'get', `/documents/${id}/route-candidates`);
    expect(candidates.status, JSON.stringify(candidates.body)).toBe(200);
    const byId = new Map(candidates.body.candidates.map((c: { id: number }) => [c.id, c]));
    expect((byId.get(actors.qa2.id) as { approver: unknown }).approver).toBeNull();
    expect((byId.get(actors.r1.id) as { approver: { code: string } }).approver.code).toBe('MEMBER_NOT_QMS_APPROVER');
  });

  it('is refused, with nothing written, without a reason, to a non-administrator, for oneself, and for a member who cannot sign', async () => {
    const before = await ledgerCount();
    for (const [label, res, status, code] of [
      ['no reason', await designate('admin', 'qa', true, null), 400, 'REASON_REQUIRED'],
      ['not an administrator', await designate('author', 'qa', true), 403, undefined],
      ['oneself', await designate('admin', 'admin', true), 400, 'SELF_DESIGNATION'],
      ['no signing authority', await designate('admin', 'member', true), 409, 'MEMBER_CANNOT_SIGN'],
      ['another organization’s administrator', await http('outsider', 'put', `/api/tenant-users/${orgId}/${actors.qa.id}/qms-approver`, { designated: true, reason: 'Cross-tenant attempt to designate.' }), 403, undefined],
    ] as const) {
      expect(res.status, `${label}: ${JSON.stringify(res.body)}`).toBe(status);
      if (code) expect(res.body.error, label).toBe(code);
    }
    expect(await ledgerCount()).toBe(before);
    expect((await owner.query(`SELECT count(*)::int AS n FROM organization_users WHERE organization_id = $1 AND qms_approver_designated_at IS NOT NULL`, [orgId])).rows[0].n).toBe(0);
  });

  it('designates with a reason as a governed, chained ledger row; the stand-in then ends; removal is recorded the same way', async () => {
    const res = await designate('admin', 'qa', true);
    expect(res.status, JSON.stringify(res.body)).toBe(200);
    const row = (await owner.query(`SELECT qms_approver_designated_at, qms_approver_designated_by FROM organization_users WHERE organization_id = $1 AND user_id = $2`,
      [orgId, actors.qa.id])).rows[0];
    expect(row.qms_approver_designated_at).not.toBeNull();
    expect(Number(row.qms_approver_designated_by)).toBe(actors.admin.id);
    const [designated] = await ledger(`organization-member:${actors.qa.id}`, 'qms-approver.designate');
    expect(designated).toMatchObject({ decision_reason: 'Named the site QA approver for SOP control.', proposed_by: actors.admin.id });
    expect(designated.payload).toMatchObject({ userId: actors.qa.id, endsStandIn: true });
    expect(designated.sha256_chain).toMatch(/^[0-9a-f]{64}$/);
    expect((await designate('admin', 'qa', true)).body.error).toBe('ALREADY_DESIGNATED');
    // qa2 holds the Approver role but is not designated: no longer a QMS approver.
    const id = await draft('AFTERDQ');
    const refused = await send(id, [], ['qa2']);
    expect(codeOf(refused)).toBe('MEMBER_NOT_QMS_APPROVER');
    expect(refused.body.error).toMatch(/not designated as a QMS approver/);
    expect(await routeCount(id)).toBe(0);
    // Designate qa2 and remove it again: both on the ledger.
    expect((await designate('admin', 'qa2', true)).status).toBe(200);
    const removed = await designate('admin', 'qa2', false, 'Moved to the manufacturing site; no longer approves SOPs.');
    expect(removed.status, JSON.stringify(removed.body)).toBe(200);
    const [removal] = await ledger(`organization-member:${actors.qa2.id}`, 'qms-approver.remove');
    expect(removal).toMatchObject({ decision_reason: 'Moved to the manufacturing site; no longer approves SOPs.', proposed_by: actors.admin.id });
    expect(removal.sha256_chain).toMatch(/^[0-9a-f]{64}$/);
    expect((await designate('admin', 'qa2', false)).body.error).toBe('NOT_DESIGNATED');
  });
});

describe('the route rule on a QMS document (NEW-4, §2.7)', () => {
  it('a send without a route is refused, REVIEW_ROUTE_REQUIRED, with nothing written', async () => {
    const id = await draft('NOROUTE');
    const before = await ledgerCount();
    const res = await qms('author', 'patch', `/documents/${id}`, { status: 'in_review', reason: REASON });
    expect(res.status, JSON.stringify(res.body)).toBe(409);
    expect(codeOf(res)).toBe('REVIEW_ROUTE_REQUIRED');
    expect((await doc(id)).status).toBe('draft');
    expect(await ledgerCount()).toBe(before);
  });

  it('refuses no approver, the author, a contributor, and another organization’s account, each with nothing written', async () => {
    const id = await draft('RULES', ['contrib'], 'r2');
    const before = await ledgerCount();
    const cases = [
      ['no approver', await send(id, ['r1'], []), 'ROUTE_APPROVER_REQUIRED'],
      ['a contributor as reviewer', await send(id, ['contrib'], ['qa']), 'MEMBER_IS_AUTHOR'],
      ['the recorded author as reviewer', await send(id, ['r2'], ['qa']), 'MEMBER_IS_AUTHOR'],
      ['the sender, who cannot sign', await send(id, ['author'], ['qa']), 'MEMBER_CANNOT_SIGN'],
      ['another organization’s account', await send(id, ['outsider'], ['qa']), 'MEMBER_NOT_IN_ORGANIZATION'],
      ['the same person twice', await send(id, ['qa'], ['qa']), 'MEMBER_ALREADY_NAMED'],
    ] as const;
    for (const [label, res, code] of cases) {
      expect([400, 409], `${label}: ${JSON.stringify(res.body)}`).toContain(res.status);
      expect(codeOf(res), label).toBe(code);
    }
    expect((await doc(id)).status).toBe('draft');
    expect(await routeCount(id)).toBe(0);
    expect(await ledgerCount()).toBe(before);
  });

  it('with zero reviewers, the one designated approver is asked at once and makes the document effective', async () => {
    const id = await draft('ZERO');
    const sent = await send(id, [], ['qa']);
    expect(sent.status, JSON.stringify(sent.body)).toBe(200);
    expect(sent.body.data.status).toBe('in_review');
    const [m] = await members(id);
    expect(m).toMatchObject({ assignee_id: actors.qa.id, review_role: 'approver', review_step: 1, status: 'pending', module_type: 'QMS' });
    await noticeFor('qa', /^Approval requested: /);
    const approved = await approve('qa', id);
    expect(approved.status, JSON.stringify(approved.body)).toBe(200);
    expect(approved.body.data.status).toBe('effective');
    expect((await latestRoute(id)).status).toBe('complete');
    const closed = await memberOf(id, 'qa');
    expect(closed.status).toBe('completed');
    expect(Number(closed.route_signature_id)).toBe(approved.body.meta.signature.id);
    expect((await taskClose(closed.task_id)).some((p) => p.signatureRef === `esig:${approved.body.meta.signature.id}`)).toBe(true);
  });
});

describe('two reviewers, then the approver: signing on the route (§2.8, B7)', () => {
  let id: number;
  beforeAll(async () => {
    id = await draft('TWO');
    const sent = await send(id, ['r1', 'r2'], ['qa']);
    expect(sent.status, JSON.stringify(sent.body)).toBe(200);
  });

  it('a refusal the route decides is given before the credential: no password is checked or counted', async () => {
    const before = { qa: await failedAttempts('qa'), r3: await failedAttempts('r3') };
    const early = await approve('qa', id, 'not-the-password');
    expect(early.status, JSON.stringify(early.body)).toBe(409);
    expect(codeOf(early)).toBe('REVIEW_INCOMPLETE');
    const stranger = await signReview('r3', id, 'not-the-password');
    expect(stranger.status, JSON.stringify(stranger.body)).toBe(403);
    expect(codeOf(stranger)).toBe('ROUTE_NOT_NAMED');
    expect({ qa: await failedAttempts('qa'), r3: await failedAttempts('r3') }).toEqual(before);
    expect(await signatures(id)).toEqual([]);
    // A named reviewer with a wrong password reaches the ceremony, which refuses it.
    const wrong = await signReview('r1', id, 'not-the-password');
    expect(wrong.status).toBe(401);
    expect(await signatures(id)).toEqual([]);
  });

  it('approval is refused until both reviewers have signed; each review closes its task citing esig:<id>', async () => {
    const first = await signReview('r1', id);
    expect(first.status, JSON.stringify(first.body)).toBe(201);
    const r1 = await memberOf(id, 'r1');
    expect(r1.status).toBe('completed');
    expect(Number(r1.route_signature_id)).toBe(first.body.signatureId);
    expect((await taskClose(r1.task_id)).some((p) => p.signatureRef === `esig:${first.body.signatureId}`)).toBe(true);
    expect((await memberOf(id, 'qa')).status).toBe('blocked');
    const stillEarly = await approve('qa', id);
    expect(codeOf(stillEarly)).toBe('REVIEW_INCOMPLETE');
    expect((await doc(id)).status).toBe('in_review');
    const again = await signReview('r1', id);
    expect(codeOf(again)).toBe('SIGNATURE_ALREADY_RECORDED');
    const second = await signReview('r2', id);
    expect(second.status, JSON.stringify(second.body)).toBe(201);
    expect((await memberOf(id, 'qa')).status).toBe('pending');
    await noticeFor('qa', /^It is your turn: approve /);
    await noticeFor('author', /signed: /);
  });

  it('the approver approves through the existing approve; the review digest equals the approval digest and the route’s', async () => {
    const approved = await approve('qa', id);
    expect(approved.status, JSON.stringify(approved.body)).toBe(200);
    expect(approved.body.data.status).toBe('effective');
    const r = await latestRoute(id);
    expect(r.status).toBe('complete');
    const sigs = await signatures(id);
    const reviews = sigs.filter((s) => s.signature_meaning === 'REVIEWED');
    const approval = sigs.find((s) => s.signature_type === 'qms-document-approval')!;
    expect(reviews.map((s) => Number(s.signer_id)).sort()).toEqual([actors.r1.id, actors.r2.id].sort());
    expect(reviews.every((s) => Number(s.organization_id) === orgId)).toBe(true);
    for (const s of reviews) {
      expect(s.binding_basis).toBe('qms-document-version-content-sha256');
      expect(s.bound_payload_digest).toBe(approval.bound_payload_digest);
    }
    expect(approval.bound_payload_digest).toBe(r.content_digest);
    expect((await doc(id)).metadata.approval.contentDigest).toBe(r.content_digest);
    const { computeQmsDocumentContentDigest } = await import('../../server/services/qms/document-approval-signature');
    const stored = (await owner.query(`SELECT * FROM qms_documents WHERE id = $1`, [id])).rows[0];
    expect(computeQmsDocumentContentDigest(stored)).toBe(r.content_digest);
    // The 20261001 guard holds: the effective row carries its signature.
    expect((await doc(id)).approver_id).toBe(actors.qa.id);
    const round = await qms('author', 'get', `/documents/${id}/review-route`);
    expect(round.body.round.members.map((m: { outcome: string }) => m.outcome)).toEqual(['signed', 'signed', 'signed']);
  });
});

describe('every exit from review closes the route (§2.9, B4)', () => {
  it('Return for revision by a named reviewer: in_review → draft, the route returned, others cancelled, the sender told', async () => {
    const id = await draft('RET');
    expect((await send(id, ['r1', 'r2'], ['qa'])).status).toBe(200);
    expect((await qms('r1', 'post', `/documents/${id}/return`, {})).body.details.code).toBe('REASON_REQUIRED');
    const notMine = await qms('r3', 'post', `/documents/${id}/return`, { reason: 'Not on this route but trying to return it.' });
    expect(codeOf(notMine)).toBe('ROUTE_RETURN_NOT_PERMITTED');
    const res = await qms('r1', 'post', `/documents/${id}/return`, { reason: 'Section 4 cites the retired form; update it first.' });
    expect(res.status, JSON.stringify(res.body)).toBe(200);
    expect((await doc(id)).status).toBe('draft');
    const r = await latestRoute(id);
    expect(r).toMatchObject({ status: 'returned', status_reason: 'Section 4 cites the retired form; update it first.' });
    const ms = await members(id);
    expect(ms.find((m) => m.assignee_id === actors.r1.id)!.route_act_id).not.toBeNull();
    expect(ms.every((m) => m.status === 'cancelled')).toBe(true);
    await noticeFor('author', /^Returned for revision: /);
    expect((await ledger(`qms-document:${id}`, 'review-route.return')).length).toBe(1);
    const [transition] = (await ledger(`qms-document:${id}`, 'transition')).filter((t) => t.payload.kind === 'return-for-revision');
    expect(transition.payload).toMatchObject({ from: 'in_review', to: 'draft', routeId: r.id });
    // Sent again after revision: a new round, and nobody signs the returned one.
    expect((await send(id, ['r2'], ['qa'])).status).toBe(200);
    expect((await latestRoute(id)).round).toBe(2);
  });

  it('the controlled-text save is refused while the route is open, and demotes once it is returned', async () => {
    const id = await draft('TXT');
    expect((await send(id, [], ['qa'])).status).toBe(200);
    const { computeQmsDocumentContentDigest } = await import('../../server/services/qms/document-approval-signature');
    const save = async () => {
      const stored = (await owner.query(`SELECT * FROM qms_documents WHERE id = $1`, [id])).rows[0];
      return qms('author', 'patch', `/documents/${id}`, { controlledText: { documentVersion: '1.0', contentDigest: computeQmsDocumentContentDigest(stored),
        sections: [{ key: 'procedure', label: 'Procedure', body: 'A changed procedure, typed during review.' }] }, reason: 'Fix the procedure text during review.' });
    };
    const refused = await save();
    expect(refused.status, JSON.stringify(refused.body)).toBe(409);
    expect(codeOf(refused)).toBe('QMS_ROUTE_OPEN');
    expect((await doc(id)).status).toBe('in_review');
    expect((await qms('author', 'post', `/documents/${id}/return`, { reason: 'Withdrawing to correct the procedure text.' })).status).toBe(200);
    const saved = await save();
    expect(saved.status, JSON.stringify(saved.body)).toBe(200);
  });

  it('a revision is refused while the route is open', async () => {
    const id = await draft('REVZ');
    expect((await send(id, [], ['qa'])).status).toBe(200);
    const res = await qms('author', 'post', `/documents/${id}/revise`, { reason: 'Open a revision during review.', programId, templateKey: 'sop' });
    expect(res.status, JSON.stringify(res.body)).toBe(409);
    expect(codeOf(res)).toBe('QMS_ROUTE_OPEN');
    expect((await latestRoute(id)).status).toBe('open');
  });

  it('retiring a document in review withdraws its route on the same transaction', async () => {
    const id = await draft('RETIRE');
    expect((await send(id, ['r1'], ['qa'])).status).toBe(200);
    const res = await qms('qa', 'post', `/documents/${id}/retire`, { password: PASSWORD, meaning: 'retirement', reason: 'The procedure is superseded by the site SOP.' });
    expect(res.status, JSON.stringify(res.body)).toBe(200);
    expect((await doc(id)).status).toBe('retired');
    expect(await latestRoute(id)).toMatchObject({ status: 'withdrawn', status_reason: 'Retired: The procedure is superseded by the site SOP.' });
    expect((await members(id)).every((m) => m.status === 'cancelled')).toBe(true);
  });
});

describe('withdraw never falls back to the old rule; grandfathering (§2.13)', () => {
  it('a withdrawn route signs nothing until a new one is sent; re-sending names it afresh', async () => {
    const id = await draft('WDN');
    expect((await send(id, ['r1'], ['qa'])).status).toBe(200);
    expect(codeOf(await qms('r1', 'post', `/documents/${id}/review-route/withdraw`, { reason: 'Only the sender withdraws this route.' }))).toBe('ROUTE_WITHDRAW_NOT_PERMITTED');
    const w = await qms('author', 'post', `/documents/${id}/review-route/withdraw`, { reason: 'The reviewer is on leave this month.' });
    expect(w.status, JSON.stringify(w.body)).toBe(200);
    expect((await doc(id)).status).toBe('in_review');
    expect(codeOf(await signReview('r1', id))).toBe('ROUTE_WITHDRAWN');
    expect(codeOf(await approve('qa', id))).toBe('ROUTE_WITHDRAWN');
    expect(codeOf(await approve('admin', id))).toBe('ROUTE_WITHDRAWN');
    expect((await doc(id)).status).toBe('in_review');
    const again = await qms('author', 'post', `/documents/${id}/review-route`, { reason: 'Re-routed to an available reviewer.', route: route(['r2'], ['qa']) });
    expect(again.status, JSON.stringify(again.body)).toBe(200);
    expect(codeOf(await signReview('r1', id))).toBe('ROUTE_NOT_NAMED');
    expect((await signReview('r2', id)).status).toBe(201);
    expect((await approve('qa', id)).status).toBe(200);
  });

  it('a document already in review with no route keeps today’s rule, until someone names reviewers on it', async () => {
    const legacy = Number((await owner.query(`INSERT INTO qms_documents (organization_id,doc_number,title,doc_type,version,status,author_id,metadata)
      VALUES($1,$2,$3,'sop','1.0','in_review',$4,$5::jsonb) RETURNING id`, [orgId, `${TAG}-LEG`, `${TAG} legacy`, actors.author.id,
      JSON.stringify({ sections: [{ key: 'procedure', label: 'Procedure', body: 'A procedure sent for review before RR4.' }] })])).rows[0].id);
    // Today's rule: any signing-authority approver who is not the author (here an administrator, not designated).
    const today = await approve('admin', legacy);
    expect(today.status, JSON.stringify(today.body)).toBe(200);
    const named = Number((await owner.query(`INSERT INTO qms_documents (organization_id,doc_number,title,doc_type,version,status,author_id,metadata)
      VALUES($1,$2,$3,'sop','1.0','in_review',$4,$5::jsonb) RETURNING id`, [orgId, `${TAG}-LEG2`, `${TAG} legacy 2`, actors.author.id,
      JSON.stringify({ sections: [{ key: 'procedure', label: 'Procedure', body: 'Another procedure sent for review before RR4.' }] })])).rows[0].id);
    const r = await qms('author', 'post', `/documents/${named}/review-route`, { reason: 'Naming the reviewers on a pre-RR4 review.', route: route(['r1'], ['qa']) });
    expect(r.status, JSON.stringify(r.body)).toBe(200);
    expect(codeOf(await approve('admin', named))).toBe('ROUTE_NOT_NAMED');
  });
});

describe('reassign and hand back on a QMS route (RR3’s acts, §2.10)', () => {
  it('a reviewer hands back; the sender reassigns to another reviewer, who signs; a non-designated approver is refused', async () => {
    const id = await draft('RSN');
    expect((await send(id, ['r1'], ['qa'])).status).toBe(200);
    const back = await qms('r1', 'post', `/documents/${id}/review-route/hand-back`, { reason: 'I am out for the whole review window.' });
    expect(back.status, JSON.stringify(back.body)).toBe(200);
    expect((await memberOf(id, 'r1')).status).toBe('blocked');
    await noticeFor('author', /^Handed back by /);
    expect(codeOf(await signReview('r1', id))).toBe('ROUTE_HANDED_BACK');
    const taskId = (await memberOf(id, 'r1')).task_id;
    const toR3 = await qms('author', 'post', `/documents/${id}/review-route/reassign`, { taskId, assigneeId: actors.r3.id, reason: 'Rae is out; Remy reviews instead.' });
    expect(toR3.status, JSON.stringify(toR3.body)).toBe(200);
    expect((await memberOf(id, 'r3')).task_id).toBe(taskId);
    expect((await signReview('r3', id)).status).toBe(201);
    const approverTask = (await memberOf(id, 'qa')).task_id;
    const toQa2 = await qms('author', 'post', `/documents/${id}/review-route/reassign`, { taskId: approverTask, assigneeId: actors.qa2.id, reason: 'Hand the approval to the other approver.' });
    expect(codeOf(toQa2)).toBe('MEMBER_NOT_QMS_APPROVER');
    expect((await memberOf(id, 'qa')).task_id).toBe(approverTask);
    expect((await approve('qa', id)).status).toBe(200);
    const history = (await qms('author', 'get', `/documents/${id}/review-route`)).body.round.history.map((h: { action: string }) => h.action);
    expect(history).toEqual(['send', 'hand-back', 'reassign']);
  });

  it('another organization cannot read or act on the document', async () => {
    const id = await draft('XT');
    expect((await send(id, ['r1'], ['qa'])).status).toBe(200);
    expect((await qms('outsider', 'get', `/documents/${id}/review-route`)).status).toBe(404);
    expect((await qms('outsider', 'post', `/documents/${id}/review-route/withdraw`, { reason: 'Cross-tenant withdrawal attempt.' })).status).toBe(404);
    expect((await signReview('outsider', id)).status).toBe(404);
    expect((await latestRoute(id)).status).toBe('open');
  });
});

describe('a document authored in the canonical editor (§2.8, §2.9)', () => {
  it('its sections cannot change under the route; the members get access to it; the review and the approval bind the same authored content', async () => {
    const created = await qms('author', 'post', '/documents', { title: `${TAG} authored procedure`, docType: 'sop', programId, templateKey: 'sop', reason: 'Author the deviation handling SOP.' });
    expect(created.status, JSON.stringify(created.body)).toBe(201);
    const id = Number(created.body.data.id);
    const docId = String(created.body.data.authoring_document_id);
    await owner.query(`UPDATE authoring_sections SET content = '<p>Record each deviation within one working day, with its reason.</p>' WHERE doc_id = $1`, [docId]);
    expect((await send(id, ['r1'], ['qa'])).status).toBe(200);
    // The named members can open and act on the authored copy: the route granted it.
    const grants = (await owner.query(`SELECT principal_id, role FROM doc_permissions WHERE doc_id = $1 AND revoked_at IS NULL ORDER BY role`, [docId])).rows;
    expect(grants).toEqual(expect.arrayContaining([
      { principal_id: String(actors.r1.id), role: 'REVIEWER' }, { principal_id: String(actors.qa.id), role: 'APPROVER' },
    ]));
    // Where the design's "RR4 confirms where" lands: the existing section guard
    // (db/migrations/20261014_qms_controlled_authoring_content.sql,
    // qms_authoring_content_guard) refuses every section write of an authored
    // QMS document that is not a draft, so its text cannot change under the route.
    await expect(owner.query(`UPDATE authoring_sections SET content = '<p>Changed under the route.</p>' WHERE doc_id = $1`, [docId]))
      .rejects.toThrow(/QMS_DOCUMENT_CONTROLLED/);
    const reviewed = await signReview('r1', id);
    expect(reviewed.status, JSON.stringify(reviewed.body)).toBe(201);
    const approved = await approve('qa', id);
    expect(approved.status, JSON.stringify(approved.body)).toBe(200);
    const sigs = await signatures(id);
    const review = sigs.find((s) => s.signature_meaning === 'REVIEWED')!;
    const approval = sigs.find((s) => s.signature_type === 'qms-document-approval')!;
    expect(review.bound_payload_digest).toBe(approval.bound_payload_digest);
    expect(approval.bound_payload_digest).toBe((await latestRoute(id)).content_digest);
    expect((await doc(id)).metadata.authoringContent.sections.some((x: { content: string }) => x.content.includes('one working day'))).toBe(true);
  });
});
