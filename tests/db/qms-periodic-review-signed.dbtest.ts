/**
 * A periodic review of a controlled document is a signed act on the version in
 * force (gap 5.2; docs/design/QMS_PERIODIC_REVIEW_SIGNED_2026-10-22.md).
 *
 * The register tracked next_review_date, but nothing recorded a review. The
 * date is part of what the approval signed, so the only way to show a review
 * was a new version with no change. Here, through the real routes as
 * app_service under RLS:
 *   - a reviewer signs "remains current" with the next date; the document
 *     leaves review-due, the register names the review, and the effective row
 *     and its approval are untouched;
 *   - the signature is bound to the release's content digest, with the
 *     outcome on its manifest and the sign ledger pair written;
 *   - "revision required" is recorded and leaves the date due;
 *   - refused, with nothing signed: a past date, a document under revision, a
 *     viewer, a wrong password;
 *   - a review of v1.0 stops counting once v2.0 is approved.
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

const TAG = `qms-review-${randomUUID().slice(0, 8)}`;
const PASSWORD = 'test-qms-periodic-review-fixture';
const REASON = 'Annual periodic review of the invented controlled procedure.';
const originalRbacFlag = process.env.GOVERNANCE_RBAC_ENFORCE;
type Actor = { id: number; token: string; role: string };
let owner: Pool;
let orgId: number;
let orgUuid: string;
let programId: string;
let app: express.Express;
let author: Actor;
let signer: Actor;
let viewer: Actor;

const day = (offset: number) => new Date(Date.now() + offset * 86_400_000).toISOString().slice(0, 10);

async function account(key: string, role: string): Promise<Actor> {
  const user = (await owner.query(`INSERT INTO users(email,name,password_hash,status) VALUES($1,$2,$3,'active') RETURNING id`,
    [`${TAG}-${key}@example.invalid`, `${TAG} invented ${key}`, await bcrypt.hash(PASSWORD, 4)])).rows[0];
  const id = Number(user.id);
  await owner.query('INSERT INTO organization_users(organization_id,user_id,role) VALUES($1,$2,$3)', [orgId, id, role]);
  const { activeJwtSecret } = await import('../../server/utils/jwtVerify');
  return { id, role, token: jwt.sign({ type: 'access', id: String(id), userId: String(id), organizationId: String(orgId), role },
    activeJwtSecret(), { expiresIn: '1h' }) };
}

const http = (by: Actor, method: 'get' | 'post', path: string, body?: Record<string, unknown>) =>
  request(app)[method](path).set('Authorization', `Bearer ${by.token}`).send(body);
const approve = (id: number) =>
  http(signer, 'post', `/api/mdx/qms/documents/${id}/approve`, { password: PASSWORD, meaning: 'APPROVED', reason: 'Independent approval of the invented procedure.' });
const review = (id: number, body: Record<string, unknown>, by = signer) =>
  http(by, 'post', `/api/mdx/qms/documents/${id}/periodic-review`, { password: PASSWORD, meaning: 'review', reason: REASON, ...body });

/** An effective v1.0, released by the real signed approval, due for review on `due`. */
async function effectiveDocument(key: string, due: string): Promise<number> {
  const row = (await owner.query(`INSERT INTO qms_documents (organization_id,doc_number,title,doc_type,version,status,author_id,next_review_date,metadata)
    VALUES($1,$2,$3,'sop','1.0','in_review',$4,$5::date,$6::jsonb) RETURNING id`,
  [orgId, `${TAG}-${key}`, `${TAG} invented procedure ${key}`, author.id, due,
    JSON.stringify({ sections: [{ key: 'procedure', label: 'Procedure', body: `Record each ${key} correction with its reason.` }] })])).rows[0];
  const approved = await approve(Number(row.id));
  expect(approved.status, JSON.stringify(approved.body)).toBe(200);
  return Number(row.id);
}

const dueList = async () => {
  const res = await http(viewer, 'get', '/api/mdx/qms/documents/review-due?within=30');
  expect(res.status, JSON.stringify(res.body)).toBe(200);
  return res.body.data as Array<{ id: number; overdue: boolean; next_review_date: string; periodic_review: unknown }>;
};
const reviewSignatures = async (id: number) => (await owner.query(
  `SELECT id, signer_id, signature_meaning, binding_basis, bound_payload_digest, signature_manifest::jsonb AS manifest
     FROM electronic_signatures WHERE organization_id = $1 AND signed_target = $2 AND signature_meaning = 'review' ORDER BY id`,
  [orgId, `qms-document:${id}`])).rows;
const row = async (id: number) => (await owner.query(
  `SELECT status, version, next_review_date::text AS next_review_date, approved_at, metadata FROM qms_documents WHERE id = $1`, [id])).rows[0];

let current: number;
let toRevise: number;
let stale: number;
let lapsed: number;

beforeAll(async () => {
  if (!process.env.APP_DATABASE_URL) throw new Error('APP_DATABASE_URL must use the provisioned non-owner runtime role.');
  process.env.GOVERNANCE_RBAC_ENFORCE = 'false';
  owner = new Pool({ connectionString: databaseUrl, max: 4 });
  const org = (await owner.query("INSERT INTO organizations(name,slug,status,payment_status) VALUES($1,$1,'active','active') RETURNING id,uuid", [TAG])).rows[0];
  orgId = Number(org.id); orgUuid = String(org.uuid);
  author = await account('author', 'member'); signer = await account('signer', 'approver'); viewer = await account('viewer', 'viewer');
  const program = await owner.query(`INSERT INTO regulatory_programs (name, code, organization_id, program_type, product_type, primary_agency, product_name)
    VALUES ($1, $2, $3, 'IND', 'drug', 'FDA', 'Invented product') RETURNING id`, [`${TAG} program`, TAG.toUpperCase(), orgId]);
  programId = String(program.rows[0].id);
  const { projectId } = await seedNativeCatalogProject(owner, { organizationId: orgId, userId: author.id, programId, namespace: TAG });
  await owner.query('INSERT INTO project_visibility_settings (organization_id, project_id, visibility) VALUES ($1, $2, $3)', [orgId, projectId, 'org_public']);
  const { authMiddleware } = await import('../../server/auth');
  app = express(); app.use(express.json());
  app.use('/api/mdx', authMiddleware, (await import('../../server/routes/mdx-qms')).default);
  current = await effectiveDocument('CUR', day(10));
  toRevise = await effectiveDocument('REV', day(-3));
  stale = await effectiveDocument('OLD', day(12));
  lapsed = await effectiveDocument('LAP', day(-2));
}, 120_000);

afterAll(async () => {
  if (originalRbacFlag == null) delete process.env.GOVERNANCE_RBAC_ENFORCE;
  else process.env.GOVERNANCE_RBAC_ENFORCE = originalRbacFlag;
  if (owner && orgId) await owner.query("UPDATE organizations SET status='inactive' WHERE id=$1", [orgId]);
  const { getPool } = await import('../../server/db/runtime');
  await getPool().end(); await owner?.end();
});

describe('a signed periodic review that finds the document current', () => {
  it('moves the next review out, leaves the effective row and its approval untouched, and says who reviewed it', async () => {
    expect((await dueList()).map((r) => r.id)).toContain(current);
    const before = await row(current);
    const next = day(365);
    const res = await review(current, { outcome: 'current', nextReviewDate: next });
    expect(res.status, JSON.stringify(res.body)).toBe(201);
    expect(res.body).toMatchObject({ data: { outcome: 'current', nextReviewDate: next, version: '1.0' }, meaning: 'review' });
    expect((await dueList()).map((r) => r.id)).not.toContain(current);
    // Nothing on the signed row changed: its date is the approval's, and the approval still verifies.
    expect(await row(current)).toEqual(before);
    const read = await http(viewer, 'get', `/api/mdx/qms/documents/${current}`);
    expect(read.body.meta.training).toMatchObject({ eligible: true, documentVersion: '1.0' });
    const list = await http(viewer, 'get', '/api/mdx/qms/documents');
    const listed = list.body.data.find((d: { id: number }) => d.id === current);
    expect(String(listed.next_review_date).slice(0, 10), 'the signed date stays as approved').toBe(before.next_review_date);
    expect(listed).toMatchObject({
      next_review_due: next,
      periodic_review: { outcome: 'current', nextReviewDate: next, reviewerId: signer.id, nextDue: next, version: '1.0' },
    });
  });

  it('is one review signature bound to the release content, with the decision on its manifest', async () => {
    const { computeQmsDocumentContentDigest } = await import('../../server/services/qms/document-approval-signature');
    const full = (await owner.query('SELECT * FROM qms_documents WHERE id = $1', [current])).rows[0];
    const sigs = await reviewSignatures(current);
    expect(sigs).toHaveLength(1);
    expect(sigs[0]).toMatchObject({ signer_id: signer.id, signature_meaning: 'review', bound_payload_digest: computeQmsDocumentContentDigest(full) });
    expect(sigs[0].manifest.act).toMatchObject({ kind: 'qms-periodic-review', documentId: current, version: '1.0', outcome: 'current' });
    const ledger = (await owner.query(
      `SELECT domain, payload FROM c2c_ana_actions WHERE org_id = $1 AND command = 'sign' AND target = $2`,
      [orgId, `qms-document:${current}`])).rows;
    expect(ledger).toHaveLength(1);
    expect(ledger[0].domain).toBe('qms');
    expect(JSON.stringify(ledger[0].payload)).toContain('qms-periodic-review');
  });

  it('is in the controlled document register report beside the date its approval signed', async () => {
    const { findReport } = await import('../../server/services/audit/compliance-reports/catalog');
    const { runComplianceReport } = await import('../../server/services/audit/compliance-reports/generate');
    const { platformIntegrityChecks } = await import('../../server/services/audit/compliance-reports/integrity-checks');
    const { parseReportPeriod } = await import('../../server/services/audit/compliance-reports/period');
    const { runWithTenantScope } = await import('../../server/db/tenantStore');
    const { getPool } = await import('../../server/db/runtime');
    const window = parseReportPeriod({}, 'as-of');
    if (!window.ok) throw new Error(window.message);
    const { data } = await runWithTenantScope({ tenantId: String(orgId), orgUuid, role: 'admin', source: 'request', caller: 'qms-review-report' },
      () => runComplianceReport(getPool(), findReport('controlled-documents')!, orgId, window, {
        walkChain: async () => ({ ok: null, reason: 'not walked by this probe' }), checks: platformIntegrityChecks }));
    const rows = data.sections.find((x) => x.key === 'documents')!.rows;
    const [sig] = await reviewSignatures(current);
    expect(rows.find((x) => Number(x.id) === current)).toMatchObject({
      next_review_date: day(10), last_review_signature_id: sig.id, last_review_outcome: 'current',
      last_review_signer_name: `${TAG} invented signer`, next_review_due: day(365),
    });
    // Not yet reviewed: no review, and due on its own signed date.
    expect(rows.find((x) => Number(x.id) === stale)).toMatchObject({ last_review_signature_id: null, next_review_due: day(12) });
  });
});

describe('a review that finds a revision is required', () => {
  it('is recorded, and the document stays due', async () => {
    const res = await review(toRevise, { outcome: 'revision-required' });
    expect(res.status, JSON.stringify(res.body)).toBe(201);
    const due = (await dueList()).find((r) => r.id === toRevise);
    expect(due).toMatchObject({ overdue: true, periodic_review: { outcome: 'revision-required' } });
  });
});

describe('a review is refused, and nothing is signed', () => {
  it.each([
    ['a next review date that has passed', () => review(current, { outcome: 'current', nextReviewDate: day(-1) }), 400],
    ['"remains current" with no next date', () => review(current, { outcome: 'current' }), 400],
    ['a viewer, who has no signing authority', () => review(current, { outcome: 'current', nextReviewDate: day(200) }, viewer), 403],
    ['a wrong password', () => http(signer, 'post', `/api/mdx/qms/documents/${current}/periodic-review`,
      { password: 'not-the-password', meaning: 'review', reason: REASON, outcome: 'current', nextReviewDate: day(200) }), 401],
  ])('%s', async (_label, send, status) => {
    const before = (await reviewSignatures(current)).length;
    const res = await send();
    expect(res.status, JSON.stringify(res.body)).toBe(status);
    expect((await reviewSignatures(current)).length).toBe(before);
  });
});

describe('a review counts only for the version it reviewed', () => {
  it('is refused while a revision is open, and stops counting once the next version is approved', { timeout: 60_000 }, async () => {
    const reviewed = await review(stale, { outcome: 'current', nextReviewDate: day(365) });
    expect(reviewed.status, JSON.stringify(reviewed.body)).toBe(201);
    expect((await dueList()).map((r) => r.id)).not.toContain(stale);
    const revised = await http(author, 'post', `/api/mdx/qms/documents/${stale}/revise`,
      { reason: 'Open the next revision of the invented procedure', programId, templateKey: 'sop' });
    expect(revised.status, JSON.stringify(revised.body)).toBe(200);
    // v1.0 is still in force while v2.0 is drafted, and its review still counts.
    expect((await dueList()).map((r) => r.id), 'the version in force keeps its review').not.toContain(stale);
    const during = await review(stale, { outcome: 'current', nextReviewDate: day(300) });
    expect(during.status, JSON.stringify(during.body)).toBe(409);
    expect(during.body.error.code).toBe('QMS_REVIEW_UNDER_REVISION');
    // v2.0 approved: its own date governs again, and v1.0's review no longer counts.
    const docId = String((await owner.query('SELECT authoring_document_id FROM qms_documents WHERE id = $1', [stale])).rows[0].authoring_document_id);
    await owner.query(`UPDATE authoring_sections SET content = '<p>Revised procedure text.</p>' WHERE doc_id = $1 AND code = 'qms-purpose'`, [docId]);
    const { withNativeCatalogClient } = await import('./catalog-native-fixture');
    const { grantAuthoringPermission } = await import('../../server/services/authoring/authoring-permissions');
    await withNativeCatalogClient({ organizationId: orgId, organizationUuid: orgUuid, userId: author.id, role: 'member', caller: 'qms-review-share' },
      (sqlClient) => grantAuthoringPermission({ pool: sqlClient, tenantId: orgId, docId, principalId: String(signer.id),
        role: 'APPROVER', grantedBy: String(author.id), reason: 'Independent approver of v2.0' }));
    const sent = await request(app).patch(`/api/mdx/qms/documents/${stale}`).set('Authorization', `Bearer ${author.token}`)
      .send({ status: 'in_review', reason: 'Saved v2.0 text ready for review' });
    expect(sent.status, JSON.stringify(sent.body)).toBe(200);
    const v2 = await approve(stale);
    expect(v2.status, JSON.stringify(v2.body)).toBe(200);
    expect((await row(stale)).version).toBe('2.0');
    const entry = (await dueList()).find((r) => r.id === stale);
    expect(entry, 'v2.0 is due on its own date again').toBeTruthy();
    expect(entry!.periodic_review).toBeNull();
  });
});

describe('readiness counts what is overdue after the last standing review', () => {
  const overdue = async () => {
    const res = await http(viewer, 'get', '/api/mdx/qms/readiness');
    expect(res.status, JSON.stringify(res.body)).toBe(200);
    return res.body.data.documents.reviewOverdue as number;
  };

  it('stops counting a reviewed document, and counts it again once that review is voided', async () => {
    // Overdue: the revision-required document and the lapsed one.
    expect(await overdue()).toBe(2);
    const res = await review(lapsed, { outcome: 'current', nextReviewDate: day(90) });
    expect(res.status, JSON.stringify(res.body)).toBe(201);
    expect(await overdue()).toBe(1);
    expect((await dueList()).map((r) => r.id)).not.toContain(lapsed);
    // A withdrawn review signature is no review (isSignatureWithdrawn).
    const [sig] = await reviewSignatures(lapsed);
    await owner.query(`UPDATE electronic_signatures SET verification_status = 'voided', is_valid = false WHERE id = $1`, [sig.id]);
    expect(await overdue()).toBe(2);
    expect((await dueList()).find((r) => r.id === lapsed)).toMatchObject({ overdue: true, periodic_review: null });
  });
});
