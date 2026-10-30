/**
 * RR2 of docs/design/REVIEW_ROUTING_2026-10-23.md on a QMS controlled document
 * (§2.7, §2.8, §2.10, §3; NEW-4): reviewers one after another, more than one
 * QMS approver, and adding a reviewer to an open route. On PostgreSQL as the
 * runtime role with RLS on, through the real QMS, task and signing routes, with
 * the real signing ceremony. The harness is RR4's (review-route-qms-rr4.dbtest.ts).
 * No one is designated in this organization, so the Approver role stands in
 * (D-Q): qa and qa2 are both QMS approvers.
 *
 *   - sequential: the second reviewer's turn opens on the first's signature,
 *     and they are told only then; until then their signature is refused
 *     before the credential;
 *   - two approvers: every named approver signs; the first approval is a
 *     signature (meaning APPROVED, the one approval recipe, its own type since
 *     RR2 records) that leaves the document in review, with no approval stamp and no periodic review
 *     scheduled; the last makes it effective on its own transaction (the
 *     20261001 guard holds), and the route completes; one digest throughout;
 *   - adding a reviewer re-blocks the approver, is refused once an approval is
 *     signed, and the new reviewer signs before the approval.
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

const TAG = `qms-rr2-${randomUUID().slice(0, 8)}`;
const PASSWORD = 'test-qms-rr2-route-fixture';
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
const sequential = (reviewers: Who[], approvers: Who[]) => ({
  reviewers: reviewers.map((w) => actors[w].id), approvers: approvers.map((w) => actors[w].id),
  order: 'sequential', reviewStepDueDates: reviewers.map((_, i) => day(3 + i)), approvalDueDate: day(9),
});
const send = (id: number, reviewers: Who[], approvers: Who[], by: Who = 'author', shape: object = route(reviewers, approvers)) =>
  qms(by, 'patch', `/documents/${id}`, { status: 'in_review', reason: REASON, route: shape });
const addReviewer = (who: Who, id: number, add: Who, reason: string | null = 'Microbiology must review the sampling section') =>
  qms(who, 'post', `/documents/${id}/review-route/members`, { assigneeId: actors[add].id, dueDate: day(4), ...(reason === null ? {} : { reason }) });
const periodicTasks = async (id: number) => Number((await owner.query(
  `SELECT count(*)::int AS n FROM unified_tasks WHERE organization_id = $1 AND source_entity_type = 'qms_document' AND source_entity_id = $2 AND review_route_id IS NULL`,
  [orgId, String(id)])).rows[0].n);
const signReview = (who: Who, id: number, password = PASSWORD) =>
  qms(who, 'post', `/documents/${id}/review`, { password, meaning: 'REVIEWED', reason: 'I reviewed the procedure as written.' });
const approve = (who: Who, id: number, password = PASSWORD) =>
  qms(who, 'post', `/documents/${id}/approve`, { password, meaning: 'APPROVED', reason: 'Approved as the designated QMS approver.' });
const doc = async (id: number) => (await owner.query(`SELECT status, version, approver_id, metadata FROM qms_documents WHERE id = $1`, [id])).rows[0];
const latestRoute = async (id: number) => (await owner.query(
  `SELECT * FROM review_routes WHERE organization_id = $1 AND subject_type = 'qms_document' AND subject_id = $2 ORDER BY created_at DESC LIMIT 1`,
  [orgId, String(id)])).rows[0];
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
  app.use('/api/part11', (await import('../../server/routes/part11-compliance')).default);
}, 120_000);

afterAll(async () => {
  if (originalRbacFlag == null) delete process.env.GOVERNANCE_RBAC_ENFORCE;
  else process.env.GOVERNANCE_RBAC_ENFORCE = originalRbacFlag;
  if (owner && orgId) await owner.query("UPDATE organizations SET status='inactive' WHERE id = ANY($1::int[])", [[orgId, otherOrgId]]);
  const { getPool } = await import('../../server/db/runtime');
  await getPool().end(); await owner?.end();
});


describe('QMS reviewers one after another (RR2, §3)', () => {
  it('opens the second reviewer on the first one’s signature, telling them only then', async () => {
    const id = await draft('SEQ');
    const sent = await send(id, ['r1', 'r2'], ['qa'], 'author', sequential(['r1', 'r2'], ['qa']));
    expect(sent.status, JSON.stringify(sent.body)).toBe(200);
    expect((await latestRoute(id)).review_order).toBe('sequential');
    expect((await members(id)).map((m) => [m.review_role, m.review_step, m.status])).toEqual([
      ['reviewer', 1, 'pending'], ['reviewer', 2, 'blocked'], ['approver', 3, 'blocked'],
    ]);
    const before = await failedAttempts('r2');
    const early = await signReview('r2', id, 'not-the-password');
    expect(early.status, JSON.stringify(early.body)).toBe(409);
    expect(codeOf(early)).toBe('ROUTE_STEP_NOT_OPEN');
    expect(await failedAttempts('r2')).toBe(before);
    expect(await signatures(id)).toEqual([]);

    expect((await signReview('r1', id)).status).toBe(201);
    expect((await memberOf(id, 'r2')).status).toBe('pending');
    expect((await memberOf(id, 'qa')).status).toBe('blocked');
    await noticeFor('r2', /^It is your turn: review /);
    expect((await signReview('r2', id)).status).toBe(201);
    expect((await memberOf(id, 'qa')).status).toBe('pending');
    const approved = await approve('qa', id);
    expect(approved.status, JSON.stringify(approved.body)).toBe(200);
    expect(approved.body.data.status).toBe('effective');
  });
});

describe('two QMS approvers (RR2, NEW-4: every named approver)', () => {
  it('the first approval leaves the document in review; the last makes it effective; one digest throughout', async () => {
    const id = await draft('MULTI');
    const sent = await send(id, ['r1'], ['qa', 'qa2']);
    expect(sent.status, JSON.stringify(sent.body)).toBe(200);
    expect((await signReview('r1', id)).status).toBe(201);
    await noticeFor('qa', /^It is your turn: approve /);
    await noticeFor('qa2', /^It is your turn: approve /);

    const first = await approve('qa', id);
    expect(first.status, JSON.stringify(first.body)).toBe(200);
    expect(first.body.data.status).toBe('in_review');
    expect(first.body.meta.approvalComplete).toBe(false);
    const mid = await doc(id);
    expect(mid).toMatchObject({ status: 'in_review', approver_id: null });
    expect(mid.metadata?.approval).toBeUndefined();
    expect((await latestRoute(id)).status).toBe('open');
    expect((await memberOf(id, 'qa')).status).toBe('completed');
    expect((await memberOf(id, 'qa2')).status).toBe('pending');
    expect(await periodicTasks(id)).toBe(0);
    const [partial] = await ledger(`qms-document:${id}`, 'approve');
    expect(partial.payload).toMatchObject({ toStatus: 'in_review', approvalsRecorded: 1, approvalsRequired: 2 });
    expect(codeOf(await approve('qa', id))).toBe('SIGNATURE_ALREADY_RECORDED');
    await noticeFor('author', /signed: /);

    const last = await approve('qa2', id);
    expect(last.status, JSON.stringify(last.body)).toBe(200);
    expect(last.body.data.status).toBe('effective');
    expect(last.body.meta.approvalComplete).toBe(true);
    const done = await doc(id);
    expect(Number(done.approver_id)).toBe(actors.qa2.id);
    expect((await latestRoute(id)).status).toBe('complete');
    const sigs = await signatures(id);
    // RR2 records (2026-10-29): the first approval is its own type; only the last is the controlled-document approval.
    const approvals = sigs.filter((s) => s.signature_meaning === 'APPROVED');
    expect(approvals.map((s) => Number(s.signer_id))).toEqual([actors.qa.id, actors.qa2.id]);
    expect(approvals.map((s) => s.signature_type)).toEqual(['qms-document-interim-approval', 'qms-document-approval']);
    expect(new Set(sigs.map((s) => s.bound_payload_digest)).size).toBe(1);
    expect(done.metadata.approval.contentDigest).toBe(approvals[1].bound_payload_digest);
  });
});

describe('adding a reviewer to an open QMS route (RR2, §2.10)', () => {
  it('re-blocks the approver, who then waits for the new reviewer', async () => {
    const id = await draft('ADD');
    expect((await send(id, [], ['qa'])).status).toBe(200);
    expect((await memberOf(id, 'qa')).status).toBe('pending');
    const before = await ledgerCount();
    const noReason = await addReviewer('author', id, 'r1', null);
    expect(noReason.status).toBe(400);
    expect(codeOf(noReason)).toBe('REASON_REQUIRED');
    expect(await ledgerCount()).toBe(before);

    const added = await addReviewer('author', id, 'r1');
    expect(added.status, JSON.stringify(added.body)).toBe(200);
    expect(await memberOf(id, 'r1')).toMatchObject({ review_role: 'reviewer', review_step: 1, status: 'pending' });
    expect(await memberOf(id, 'qa')).toMatchObject({ review_step: 2, status: 'blocked' });
    await noticeFor('qa', /^Waiting on a new reviewer: /);
    await noticeFor('r1', /^Review requested: /);
    const [row] = await ledger(`qms-document:${id}`, 'review-route.add');
    expect(row.decision_reason).toBe('Microbiology must review the sampling section');
    expect(row.sha256_chain).toMatch(/^[0-9a-f]{64}$/);
    expect(codeOf(await approve('qa', id))).toBe('REVIEW_INCOMPLETE');
    expect((await signReview('r1', id)).status).toBe(201);
    expect((await approve('qa', id)).body.data.status).toBe('effective');
  });

  it('is refused once an approval is signed, with nothing written', async () => {
    const id = await draft('ADD-LATE');
    expect((await send(id, [], ['qa', 'qa2'])).status).toBe(200);
    expect((await approve('qa', id)).status).toBe(200);
    const before = { ledger: await ledgerCount(), members: await members(id) };
    const late = await addReviewer('author', id, 'r1');
    expect(late.status, JSON.stringify(late.body)).toBe(409);
    expect(codeOf(late)).toBe('ROUTE_APPROVAL_STARTED');
    expect({ ledger: await ledgerCount(), members: await members(id) }).toEqual(before);
  });
});

/* ── RR2 records (2026-10-29): an interim approval is its own record ─────────
   Design issue 2 of docs/evidence/D2-REVIEW-ROUTING/2026-10-29-RR2/: an earlier
   approver's signature carried the final approval's type, so the audit trail
   read "Controlled document approved" and the compliance register could name
   it as the approval of an SOP still in review. Each reader is read here as the
   runtime role, on the rows the real approve route writes, and on a row stored
   the way 37c17a3f0 wrote it (the final type, no share in its manifest). */
const signatureRows = async (id: number) => (await owner.query(
  `SELECT id, signer_id, signature_type, signature_meaning, signature_manifest FROM electronic_signatures
    WHERE organization_id = $1 AND signed_target = $2 ORDER BY id`, [orgId, `qms-document:${id}`])).rows;
const scope = () => ({ tenantId: String(orgId), orgUuid: null, role: 'admin', source: 'request', caller: 'qms-rr2 records dbtest' }) as const;
const notWalked = async () => ({ ok: true, rowsChecked: 0, tenants: 1, legacyRows: 0, sequencedRows: 0 }) as never;
async function trail(id: number): Promise<Array<{ event: string; signatureRef?: string | null }>> {
  const { runWithTenantScope } = await import('../../server/db/tenantStore');
  const { inTenantSnapshot } = await import('../../server/services/audit/compliance-reports/generate');
  const { readRecordAuditHistory } = await import('../../server/routes/audit-trail-ledger.routes');
  const { getPool } = await import('../../server/db/runtime');
  return runWithTenantScope(scope() as never, () => inTenantSnapshot(getPool() as never, orgId, async (client) =>
    (await readRecordAuditHistory(client as never, orgId, { tableName: 'qms-document', recordId: String(id) }, notWalked)).data));
}
async function reportRows(reportId: 'controlled-documents' | 'electronic-signatures', section: string): Promise<Array<Record<string, unknown>>> {
  const { runWithTenantScope } = await import('../../server/db/tenantStore');
  const { findReport } = await import('../../server/services/audit/compliance-reports/catalog');
  const { runComplianceReport } = await import('../../server/services/audit/compliance-reports/generate');
  const { platformIntegrityChecks } = await import('../../server/services/audit/compliance-reports/integrity-checks');
  const { parseReportPeriod } = await import('../../server/services/audit/compliance-reports/period');
  const { getPool } = await import('../../server/db/runtime');
  const def = findReport(reportId)!;
  const window = parseReportPeriod(def.period === 'range' ? { from: day(0), to: day(0) } : { to: day(0) }, def.period);
  if (!window.ok) throw new Error(window.message);
  const { data } = await runWithTenantScope(scope() as never, () => runComplianceReport(getPool() as never, def, orgId, window,
    { walkChain: async () => ({ ok: null, reason: 'not walked by this probe' }) as never, checks: platformIntegrityChecks }));
  return data.sections.find((s) => s.key === section)!.rows as Array<Record<string, unknown>>;
}
const documentRow = async (id: number) => (await reportRows('controlled-documents', 'documents')).find((r) => Number(r.id) === id)!;
const signatureRow = async (sigId: number) => (await reportRows('electronic-signatures', 'signatures')).find((r) => Number(r.id) === sigId)!;
/** The §11.50 manifestation read by target (GET /api/part11/signatures/by-target), as an inspector or the OQ reads it. */
async function byTarget(id: number): Promise<Array<Record<string, unknown>>> {
  const r = await http('admin', 'get', `/api/part11/signatures/by-target?target=${encodeURIComponent(`qms-document:${id}`)}`);
  expect(r.status, JSON.stringify(r.body)).toBe(200);
  return r.body.data;
}
const INTERIM_EVENT = 'Controlled document approval signed, 1 of 2 required; the document is not yet approved (e-signature)';
const APPROVED_EVENT = 'Controlled document approved (e-signature)';

/**
 * An earlier approval stored as 37c17a3f0 wrote it: the governed ledger pair and
 * one signature of the FINAL type, with no share in its manifest, stamped on the
 * approver's route task. Written through the real writers, on the owner's
 * transaction with the route writer's setting, since the code that wrote this
 * shape is gone. Signatures are never rewritten, so a reader must read these.
 */
async function storedEarlierApproval(id: number, who: Who): Promise<number> {
  const { recordGovernedAction } = await import('../../server/routes/c2c/actions');
  const { persistGovernedActionSignature } = await import('../../server/services/part11/signature-persistence');
  const header = await latestRoute(id);
  const m = await memberOf(id, who);
  const row = (await owner.query(`SELECT doc_number, version FROM qms_documents WHERE id = $1`, [id])).rows[0];
  const client = await owner.connect();
  try {
    await client.query('BEGIN');
    const target = `qms-document:${id}`;
    const reason = 'Approved as the designated QMS approver.';
    const gov = await recordGovernedAction(client, { orgId, userId: actors[who].id, command: 'approve', target, reason, domain: 'qms', surface: 'api',
      payload: { meaning: 'APPROVED', contentDigest: header.content_digest, bindingBasis: 'qms-document-version-content-sha256', docNumber: row.doc_number,
        version: row.version, fromStatus: 'in_review', toStatus: 'in_review', approvalsRecorded: 1, approvalsRequired: 2 } });
    const signed = await persistGovernedActionSignature(client, {
      orgId, userId: actors[who].id, target, reason, payload: { meaning: 'APPROVED' }, actionId: gov.actionId, auditId: gov.auditId,
      sha256Chain: gov.sha256Chain, authenticationMethod: 'password', secondFactorVerified: false, ipAddress: null, occurredAt: new Date(),
      signatureType: 'qms-document-approval', command: 'approve',
      binding: { digest: header.content_digest, basis: 'qms-document-version-content-sha256', note: 'as stored before 2026-10-29' },
      extraManifest: { docNumber: row.doc_number, version: row.version, twoPersonRule: 'enforced', originalAuthorId: actors.author.id, controlledTextAuthorUserIds: [] },
    });
    // The guard admits the route writer's role, never a setting (P-59, 2026-10-29): the owner assumes it for this one row.
    await client.query('SET LOCAL ROLE review_route_writer');
    await client.query(`UPDATE unified_tasks SET route_signature_id = $1, status = 'completed', updated_at = now()
      WHERE organization_id = $2 AND task_id = $3`, [signed.id, orgId, m.task_id]);
    await client.query('RESET ROLE');
    await client.query('COMMIT');
    return signed.id;
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
}

describe('an interim QMS approval is its own record (RR2 records, Part 11 §11.50)', () => {
  it('the earlier approval is its own type, carrying k of n; only the last is the controlled-document approval', async () => {
    const id = await draft('REC-TYPE');
    expect((await send(id, [], ['qa', 'qa2'])).status).toBe(200);
    expect((await approve('qa', id)).body.data.status).toBe('in_review');
    const [interim] = await signatureRows(id);
    expect(interim).toMatchObject({ signature_type: 'qms-document-interim-approval', signature_meaning: 'APPROVED' });
    expect(interim.signature_manifest).toMatchObject({ approvalsRecorded: 1, approvalsRequired: 2, command: 'approve' });
    expect((await approve('qa2', id)).body.data.status).toBe('effective');
    const [, final] = await signatureRows(id);
    expect(final).toMatchObject({ signature_type: 'qms-document-approval', signature_meaning: 'APPROVED' });
    expect(final.signature_manifest).toMatchObject({ approvalsRecorded: 2, approvalsRequired: 2 });
  });

  it('the audit trail, the two compliance registers and the QMS register never call the earlier approval the approval', async () => {
    const id = await draft('REC-READ');
    expect((await send(id, [], ['qa', 'qa2'])).status).toBe(200);
    expect((await approve('qa', id)).status).toBe(200);
    const [interim] = await signatureRows(id);
    expect.soft((await trail(id)).find((e) => e.signatureRef === `electronic_signatures:${interim.id}`)?.event).toBe(INTERIM_EVENT);
    const mid = await documentRow(id);
    expect.soft(mid).toMatchObject({ status: 'in_review', approval_signature_id: null, approval_signer_name: null, approval_meaning: null });
    expect.soft(String(mid.interim_approvals)).toContain(actors.qa.name);
    expect.soft(String(mid.interim_approvals)).toContain('1 of 2 required');
    expect.soft(await signatureRow(Number(interim.id))).toMatchObject({ interim_approval: true, approval_share: '1 of 2' });
    expect.soft((await qms('author', 'get', `/documents/${id}`)).body.data.approval_signature).toBeNull();

    expect((await approve('qa2', id)).status).toBe(200);
    const [, final] = await signatureRows(id);
    const events = await trail(id);
    expect.soft(events.find((e) => e.signatureRef === `electronic_signatures:${interim.id}`)?.event).toBe(INTERIM_EVENT);
    expect.soft(events.find((e) => e.signatureRef === `electronic_signatures:${final.id}`)?.event).toBe(APPROVED_EVENT);
    const done = await documentRow(id);
    expect.soft(done).toMatchObject({ status: 'effective', approval_signature_id: Number(final.id), approval_signer_name: actors.qa2.name });
    expect.soft(String(done.interim_approvals)).toContain(actors.qa.name);
    expect.soft(String(done.interim_approvals)).not.toContain(actors.qa2.name);
    expect.soft(await signatureRow(Number(final.id))).toMatchObject({ interim_approval: false, approval_share: '2 of 2' });
    expect.soft((await byTarget(id)).map((r) => [Number(r.id), r.signature_type, r.interim_approval, r.approvals_recorded, r.approvals_required])).toEqual([
      [Number(final.id), 'qms-document-approval', false, 2, 2], [Number(interim.id), 'qms-document-interim-approval', true, 1, 2],
    ]);
    expect.soft((await qms('author', 'get', `/documents/${id}`)).body.data.approval_signature).toMatchObject({ signatureId: Number(final.id), signerName: actors.qa2.name });
  });

  it('an earlier approval stored with the final type (before 2026-10-29) is read as interim from its route', async () => {
    const id = await draft('REC-LEGACY');
    expect((await send(id, [], ['qa', 'qa2'])).status).toBe(200);
    const stored = await storedEarlierApproval(id, 'qa');
    expect.soft((await trail(id)).find((e) => e.signatureRef === `electronic_signatures:${stored}`)?.event).toBe(INTERIM_EVENT);
    expect.soft(await documentRow(id)).toMatchObject({ status: 'in_review', approval_signature_id: null, approval_signer_name: null });
    expect.soft(await signatureRow(stored)).toMatchObject({ signature_type: 'qms-document-approval', interim_approval: true, approval_share: '1 of 2' });
    expect.soft((await byTarget(id)).find((r) => Number(r.id) === stored)).toMatchObject({ interim_approval: true, approvals_recorded: 1, approvals_required: 2 });

    // The route counts the stored signature: the second approval is the last one.
    const last = await approve('qa2', id);
    expect(last.status, JSON.stringify(last.body)).toBe(200);
    expect(last.body.data.status).toBe('effective');
    const final = (await signatureRows(id)).find((s) => Number(s.id) !== stored)!;
    expect.soft((await trail(id)).find((e) => e.signatureRef === `electronic_signatures:${stored}`)?.event).toBe(INTERIM_EVENT);
    expect.soft(await documentRow(id)).toMatchObject({ approval_signature_id: Number(final.id), approval_signer_name: actors.qa2.name });
    expect.soft(await signatureRow(stored)).toMatchObject({ interim_approval: true, approval_share: '1 of 2' });
  });
});
