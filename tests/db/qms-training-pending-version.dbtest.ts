/**
 * Training opens at approval (P-49; MR-12 Stage 4 slice 3b; docs/design/QMS_TRAINING_ASSIGNMENT_2026-10-29.md
 * §1.2, §3.4, §3.5, D6). When v2.0 of an effective SOP is approved for a later
 * day, v1.0 stays in force until that day, and the people assigned can read and
 * acknowledge v2.0 now, so they are trained when it takes effect. Here, through
 * the real routes as app_service under RLS:
 *   - the training read opens on v1.0 (in force) and offers v2.0 beside it, with
 *     its effective date;
 *   - v2.0 can be acknowledged ahead of its day (bound to v2.0's own digest and
 *     approval signature), and does not count until then; v1.0 can still be
 *     acknowledged, and counts;
 *   - being assigned lets a person read the version they must train on (D3,
 *     confirmed by P-50 Q2), and only that: someone neither assigned nor shared
 *     onto v2.0's authored copy is told they cannot read it;
 *   - a version approved for a later day cannot be revised (D6): revising would
 *     discard it before it ever took effect.
 */
import { randomUUID } from 'node:crypto';
import bcrypt from 'bcryptjs';
import express from 'express';
import jwt from 'jsonwebtoken';
import { Pool } from 'pg';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { databaseUrl } from '../setup.db';
import { seedNativeCatalogProject, withNativeCatalogClient } from './catalog-native-fixture';

const TAG = `qms-pending-${randomUUID().slice(0, 8)}`;
const PASSWORD = 'test-qms-pending-version-fixture';
const REASON = 'Independent review of the invented pending-version procedure.';
const originalRbacFlag = process.env.GOVERNANCE_RBAC_ENFORCE;
type Actor = { id: number; token: string; role: string };
type Context = { documentVersion: string; contentDigest: string; eligible: boolean; inForce?: boolean; effectiveDate?: string | null;
  unavailableReason: string | null; sections: unknown[]; successor?: Context | null };
let owner: Pool;
let orgId: number;
let orgUuid: string;
let programId: string;
let app: express.Express;
let author: Actor;
let signer: Actor;
let trainee: Actor;
let secondTrainee: Actor;
let bystander: Actor;
let documentId: number;
let v2SignatureId: number;
const EFFECTIVE = new Date(Date.now() + 10 * 86_400_000).toISOString().slice(0, 10);

async function account(key: string, role: string): Promise<Actor> {
  const user = (await owner.query(`INSERT INTO users(email,name,password_hash,status) VALUES($1,$2,$3,'active') RETURNING id`,
    [`${TAG}-${key}@example.invalid`, `${TAG} invented ${key}`, await bcrypt.hash(PASSWORD, 4)])).rows[0];
  const id = Number(user.id);
  await owner.query('INSERT INTO organization_users(organization_id,user_id,role) VALUES($1,$2,$3)', [orgId, id, role]);
  const { activeJwtSecret } = await import('../../server/utils/jwtVerify');
  return { id, role, token: jwt.sign({ type: 'access', id: String(id), userId: String(id), organizationId: String(orgId), role },
    activeJwtSecret(), { expiresIn: '1h' }) };
}
const http = (by: Actor, method: 'get' | 'post' | 'patch', path: string, body?: Record<string, unknown>) =>
  request(app)[method](path).set('Authorization', `Bearer ${by.token}`).send(body);
const sign = (id: number, extra: Record<string, unknown> = {}) =>
  http(signer, 'post', `/api/mdx/qms/documents/${id}/approve`, { password: PASSWORD, meaning: 'APPROVED', reason: REASON, ...extra });
const acknowledge = (id: number, context: { documentVersion: string; contentDigest: string }, by: Actor) =>
  http(by, 'post', `/api/mdx/qms/documents/${id}/training-ack`, {
    documentVersion: context.documentVersion, contentDigest: context.contentDigest, understood: true, method: 'attestation' });
const trainingOf = async (by: Actor): Promise<Context> => {
  const read = await http(by, 'get', `/api/mdx/qms/documents/${documentId}`);
  expect(read.status, JSON.stringify(read.body)).toBe(200);
  return read.body.meta.training as Context;
};
const coverageOf = async (by: Actor) => {
  const res = await http(by, 'get', '/api/mdx/qms/training/compliance');
  expect(res.status, JSON.stringify(res.body)).toBe(200);
  return res.body.data.find((row: { id: number }) => row.id === documentId);
};
const share = (docId: string, principal: Actor, role: 'APPROVER' | 'VIEWER', reason: string) =>
  withNativeCatalogClient({ organizationId: orgId, organizationUuid: orgUuid, userId: author.id, role: 'member', caller: 'qms-pending-share' },
    async (sqlClient) => {
      const { grantAuthoringPermission } = await import('../../server/services/authoring/authoring-permissions');
      await grantAuthoringPermission({ pool: sqlClient, tenantId: orgId, docId, principalId: String(principal.id), role, grantedBy: String(author.id), reason });
    });

beforeAll(async () => {
  if (!process.env.APP_DATABASE_URL) throw new Error('APP_DATABASE_URL must use the provisioned non-owner runtime role.');
  process.env.GOVERNANCE_RBAC_ENFORCE = 'false';
  owner = new Pool({ connectionString: databaseUrl, max: 4 });
  const org = (await owner.query("INSERT INTO organizations(name,slug,status,payment_status) VALUES($1,$1,'active','active') RETURNING id,uuid", [TAG])).rows[0];
  orgId = Number(org.id); orgUuid = String(org.uuid);
  author = await account('author', 'member'); signer = await account('signer', 'approver');
  trainee = await account('trainee', 'member'); secondTrainee = await account('second-trainee', 'member');
  bystander = await account('bystander', 'member');
  const program = await owner.query(`INSERT INTO regulatory_programs (name, code, organization_id, program_type, product_type, primary_agency, product_name)
    VALUES ($1, $2, $3, 'IND', 'drug', 'FDA', 'Invented product') RETURNING id`, [`${TAG} program`, TAG.toUpperCase(), orgId]);
  programId = String(program.rows[0].id);
  // A private project: the authored v2.0 copy is read only by those it is shared with, or (D3) assigned to train on it.
  await seedNativeCatalogProject(owner, { organizationId: orgId, userId: author.id, programId, namespace: TAG });
  const { authMiddleware } = await import('../../server/auth');
  app = express(); app.use(express.json());
  app.use('/api/mdx', authMiddleware, (await import('../../server/routes/mdx-qms')).default);

  // v1.0: inline procedure text, released by an independent signature, in force from today.
  const row = (await owner.query(`INSERT INTO qms_documents (organization_id,doc_number,title,doc_type,version,status,author_id,metadata)
    VALUES($1,$2,$3,'sop','1.0','in_review',$4,$5::jsonb) RETURNING id`,
  [orgId, `${TAG}-SOP`, `${TAG} invented controlled procedure`, author.id,
    JSON.stringify({ sections: [{ key: 'procedure', label: 'Procedure', body: 'Record each correction with its reason and keep the original.' }] })])).rows[0];
  documentId = Number(row.id);
  expect((await sign(documentId)).status).toBe(200);
  // The trainees, by name (P-49).
  await owner.query(`INSERT INTO qms_training_assignments (organization_id, document_id, user_id, assigned_by)
    VALUES ($1, $2, $3, $5), ($1, $2, $4, $5)`, [orgId, documentId, trainee.id, secondTrainee.id, signer.id]);

  // v2.0: opened by the real revise route, its text changed, then approved for a day ten days out.
  const revised = await http(author, 'post', `/api/mdx/qms/documents/${documentId}/revise`,
    { reason: 'Open the annual revision of the invented procedure', programId, templateKey: 'sop' });
  expect(revised.status, JSON.stringify(revised.body)).toBe(200);
  const authored = String((await owner.query('SELECT authoring_document_id FROM qms_documents WHERE id=$1', [documentId])).rows[0].authoring_document_id);
  await owner.query(`UPDATE authoring_sections SET content = '<p>Record each correction, its reason and its approver.</p>'
    WHERE doc_id = $1 AND code = 'qms-purpose'`, [authored]);
  await share(authored, signer, 'APPROVER', 'Independent approver of v2.0');
  const route = { reviewers: [], approvers: [signer.id], approvalDueDate: new Date(Date.now() + 5 * 86_400_000).toISOString().slice(0, 10) };
  const review = await http(author, 'patch', `/api/mdx/qms/documents/${documentId}`, { status: 'in_review', reason: 'Saved v2.0 text ready for review', route });
  expect(review.status, JSON.stringify(review.body)).toBe(200);
  const approved = await sign(documentId, { effectiveDate: EFFECTIVE });
  expect(approved.status, JSON.stringify(approved.body)).toBe(200);
  v2SignatureId = Number(approved.body.meta.signature.id);
}, 180_000);

afterAll(async () => {
  if (originalRbacFlag == null) delete process.env.GOVERNANCE_RBAC_ENFORCE;
  else process.env.GOVERNANCE_RBAC_ENFORCE = originalRbacFlag;
  if (owner && orgId) await owner.query("UPDATE organizations SET status='inactive' WHERE id=$1", [orgId]);
  const { getPool } = await import('../../server/db/runtime');
  await getPool().end(); await owner?.end();
});

describe('during the training period', () => {
  it('the training read opens on v1.0, in force, and offers v2.0 beside it with its effective date', async () => {
    const training = await trainingOf(trainee);
    expect(training).toMatchObject({ documentVersion: '1.0', eligible: true, inForce: true });
    expect(training.successor, 'v2.0 is offered').toMatchObject({ documentVersion: '2.0', eligible: true, inForce: false, effectiveDate: EFFECTIVE });
    expect(training.successor!.sections.length, 'its own signed text').toBeGreaterThan(0);
  });

  it('v2.0 can be acknowledged ahead of its day, bound to its own digest and signature, and does not count yet', async () => {
    const successor = (await trainingOf(trainee)).successor!;
    const res = await acknowledge(documentId, successor, trainee);
    expect(res.status, JSON.stringify(res.body)).toBe(201);
    expect(res.body.data).toMatchObject({ documentVersion: '2.0', contentDigest: successor.contentDigest });
    const receipt = (await owner.query(`SELECT metadata FROM qms_training_records WHERE organization_id=$1 AND user_id=$2 AND document_version='2.0'`,
      [orgId, trainee.id])).rows[0].metadata;
    expect(receipt).toMatchObject({ releaseApprovalSignatureId: v2SignatureId, effectiveDate: EFFECTIVE, inForceAtAcknowledgement: false });
    expect(await coverageOf(trainee)).toMatchObject({ document_version: '1.0', current: 0, of: 2, me: { assigned: true, countsNow: false } });
    expect((await trainingOf(trainee)).successor, 'their v2.0 receipt is shown with it').toMatchObject({ acknowledgement: { documentVersion: '2.0' } });
  });

  it('v1.0 can still be acknowledged, and counts', async () => {
    const training = await trainingOf(secondTrainee);
    const res = await acknowledge(documentId, training, secondTrainee);
    expect(res.status, JSON.stringify(res.body)).toBe(201);
    expect(res.body.data).toMatchObject({ documentVersion: '1.0' });
    expect(await coverageOf(secondTrainee)).toMatchObject({ document_version: '1.0', current: 1, of: 2, me: { assigned: true, countsNow: true } });
  });

  it('a version that is neither in force nor pending is refused as stale', async () => {
    const res = await acknowledge(documentId, { documentVersion: '0.9', contentDigest: 'a'.repeat(64) }, trainee);
    expect(res.status, JSON.stringify(res.body)).toBe(409);
    expect(JSON.stringify(res.body)).toMatch(/QMS_TRAINING_STALE/);
  });
});

describe('being assigned lets a person read the version they must train on (D3, P-50 Q2)', () => {
  it('someone neither assigned nor shared onto v2.0 reads v1.0 and is told they cannot read v2.0; nothing of it is sent', async () => {
    const training = await trainingOf(bystander);
    expect(training).toMatchObject({ documentVersion: '1.0', eligible: true });
    expect(training.successor).toMatchObject({ documentVersion: '2.0', eligible: false, sections: [] });
    expect(training.successor!.unavailableReason).toMatch(/permission|cannot read/i);
    const res = await acknowledge(documentId, { documentVersion: '2.0', contentDigest: (await trainingOf(trainee)).successor!.contentDigest }, bystander);
    expect(res.status, 'nor can they acknowledge what they may not read').toBe(403);
  });
});

describe('a version approved for a later day cannot be revised (D6)', () => {
  it('revise is refused with QMS_REVISION_PENDING_EFFECT, and the pending version is untouched', async () => {
    const before = (await owner.query('SELECT version, status, effective_date FROM qms_documents WHERE id=$1', [documentId])).rows[0];
    const res = await http(author, 'post', `/api/mdx/qms/documents/${documentId}/revise`,
      { reason: 'Try to revise before the version takes effect', programId, templateKey: 'sop' });
    expect(res.status, JSON.stringify(res.body)).toBe(409);
    expect(JSON.stringify(res.body)).toMatch(/QMS_REVISION_PENDING_EFFECT/);
    expect((await owner.query('SELECT version, status, effective_date FROM qms_documents WHERE id=$1', [documentId])).rows[0]).toEqual(before);
  });
});
