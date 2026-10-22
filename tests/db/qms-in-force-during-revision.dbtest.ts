/**
 * An effective SOP stays in force while its next version is drafted
 * (MR-12 Stage 2, CAT2-18; 21 CFR 820.40, ISO 13485 §4.2.4).
 *
 * Revising turns the register row into the next version's draft and clears
 * its approval stamps. Every reader that asked the row whether it was
 * effective then lost the SOP for as long as the revision was open: training
 * coverage and readiness dropped it, and its read-and-understood
 * acknowledgement was refused, although the approved v1.0 still governed the
 * work. Here, through the real routes as app_service under RLS:
 *   - v1.0 is released by an independent signature and acknowledged;
 *   - v2.0 is opened by the real revise route;
 *   - v1.0 is still the release in force: readable for training, counted in
 *     coverage with its receipt, acknowledgeable by someone else, counted by
 *     readiness, and named on the register beside the v2.0 draft;
 *   - once v2.0 is signed, v2.0 is in force and v1.0 receipts no longer count.
 */
import { randomUUID } from 'node:crypto';
import bcrypt from 'bcryptjs';
import express from 'express';
import jwt from 'jsonwebtoken';
import { Pool } from 'pg';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { databaseUrl } from '../setup.db';
import { seedNativeCatalogProject } from './catalog-native-fixture';

const TAG = `qms-inforce-${randomUUID().slice(0, 8)}`;
const PASSWORD = 'test-qms-in-force-fixture';
const REASON = 'Independent review of the invented in-force QA procedure.';
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
let secondViewer: Actor;
let documentId: number;
let v1: { documentVersion: string; contentDigest: string };
let v1SignatureId: number;

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
const sign = (id: number, by = signer) =>
  http(by, 'post', `/api/mdx/qms/documents/${id}/approve`, { password: PASSWORD, meaning: 'APPROVED', reason: REASON });
const acknowledge = (id: number, context: { documentVersion: string; contentDigest: string }, by: Actor) =>
  http(by, 'post', `/api/mdx/qms/documents/${id}/training-ack`, {
    documentVersion: context.documentVersion, contentDigest: context.contentDigest, understood: true, method: 'attestation' });
const coverageOf = async (id: number) => {
  const res = await http(viewer, 'get', '/api/mdx/qms/training/compliance');
  expect(res.status, JSON.stringify(res.body)).toBe(200);
  return res.body.data.find((row: { id: number }) => row.id === id);
};

beforeAll(async () => {
  if (!process.env.APP_DATABASE_URL) throw new Error('APP_DATABASE_URL must use the provisioned non-owner runtime role.');
  process.env.GOVERNANCE_RBAC_ENFORCE = 'false';
  owner = new Pool({ connectionString: databaseUrl, max: 4 });
  const org = (await owner.query("INSERT INTO organizations(name,slug,status,payment_status) VALUES($1,$1,'active','active') RETURNING id,uuid", [TAG])).rows[0];
  orgId = Number(org.id); orgUuid = String(org.uuid);
  author = await account('author', 'member'); signer = await account('signer', 'approver');
  viewer = await account('viewer', 'viewer'); secondViewer = await account('second-viewer', 'viewer');
  const program = await owner.query(`INSERT INTO regulatory_programs (name, code, organization_id, program_type, product_type, primary_agency, product_name)
    VALUES ($1, $2, $3, 'IND', 'drug', 'FDA', 'Invented product') RETURNING id`, [`${TAG} program`, TAG.toUpperCase(), orgId]);
  programId = String(program.rows[0].id);
  const { projectId } = await seedNativeCatalogProject(owner, { organizationId: orgId, userId: author.id, programId, namespace: TAG });
  await owner.query('INSERT INTO project_visibility_settings (organization_id, project_id, visibility) VALUES ($1, $2, $3)', [orgId, projectId, 'org_public']);
  const { authMiddleware } = await import('../../server/auth');
  app = express(); app.use(express.json());
  app.use('/api/mdx', authMiddleware, (await import('../../server/routes/mdx-qms')).default);

  // v1.0: a register entry with inline procedure text, released by an independent signature.
  const row = (await owner.query(`INSERT INTO qms_documents (organization_id,doc_number,title,doc_type,version,status,author_id,metadata)
    VALUES($1,$2,$3,'sop','1.0','in_review',$4,$5::jsonb) RETURNING id`,
  [orgId, `${TAG}-SOP`, `${TAG} invented controlled procedure`, author.id,
    JSON.stringify({ sections: [{ key: 'procedure', label: 'Procedure', body: 'Record each correction with its reason and keep the original.' }] })])).rows[0];
  documentId = Number(row.id);
  const approved = await sign(documentId);
  expect(approved.status, JSON.stringify(approved.body)).toBe(200);
  v1SignatureId = Number(approved.body.meta.signature.id);
  const read = await http(viewer, 'get', `/api/mdx/qms/documents/${documentId}`);
  v1 = read.body.meta.training;
  expect(read.body.meta.training).toMatchObject({ eligible: true, documentVersion: '1.0' });
  expect((await acknowledge(documentId, v1, viewer)).status).toBe(201);

  // The real revise route opens v2.0.
  const revised = await http(author, 'post', `/api/mdx/qms/documents/${documentId}/revise`,
    { reason: 'Open the annual revision of the invented procedure', programId, templateKey: 'sop' });
  expect(revised.status, JSON.stringify(revised.body)).toBe(200);
  expect(revised.body.data).toMatchObject({ version: '2.0', status: 'draft' });
}, 120_000);

afterAll(async () => {
  if (originalRbacFlag == null) delete process.env.GOVERNANCE_RBAC_ENFORCE;
  else process.env.GOVERNANCE_RBAC_ENFORCE = originalRbacFlag;
  // Retain every signature, audit and receipt; only stop the organization.
  if (owner && orgId) await owner.query("UPDATE organizations SET status='inactive' WHERE id=$1", [orgId]);
  const { getPool } = await import('../../server/db/runtime');
  await getPool().end(); await owner?.end();
});

describe('an effective SOP while its next version is drafted', () => {
  it('is still the release a member reads for training: v1.0, eligible', async () => {
    const read = await http(viewer, 'get', `/api/mdx/qms/documents/${documentId}`);
    expect(read.status, JSON.stringify(read.body)).toBe(200);
    expect(read.body.data).toMatchObject({ version: '2.0', status: 'draft' });
    expect(read.body.meta.training).toMatchObject({ eligible: true, documentVersion: '1.0', contentDigest: v1.contentDigest });
  });

  it('is counted in training coverage with its standing receipt', async () => {
    expect(await coverageOf(documentId)).toMatchObject({ document_version: '1.0', eligible: true, current: 1 });
  });

  it('can still be acknowledged by a member who has not yet read it', async () => {
    const res = await acknowledge(documentId, v1, secondViewer);
    expect(res.status, JSON.stringify(res.body)).toBe(201);
    expect(res.body.data).toMatchObject({ documentVersion: '1.0', contentDigest: v1.contentDigest });
    expect(await coverageOf(documentId)).toMatchObject({ document_version: '1.0', current: 2 });
  });

  it('is named on the register beside the draft, and counted as effective by readiness', async () => {
    const list = await http(viewer, 'get', '/api/mdx/qms/documents');
    expect(list.status).toBe(200);
    const entry = list.body.data.find((row: { id: number }) => row.id === documentId);
    expect(entry).toMatchObject({ version: '2.0', status: 'draft', in_force: { version: '1.0', approverId: signer.id } });
    const readiness = await http(viewer, 'get', '/api/mdx/qms/readiness');
    expect(readiness.status, JSON.stringify(readiness.body)).toBe(200);
    expect(readiness.body.data.documents).toMatchObject({ available: true, effective: 1, underRevision: 1, draft: 0 });
  });
});

describe('the controlled document register report while the revision is open', () => {
  it('names the version in force and the signature that approved it, beside the draft', async () => {
    const { findReport } = await import('../../server/services/audit/compliance-reports/catalog');
    const { runComplianceReport } = await import('../../server/services/audit/compliance-reports/generate');
    const { platformIntegrityChecks } = await import('../../server/services/audit/compliance-reports/integrity-checks');
    const { parseReportPeriod } = await import('../../server/services/audit/compliance-reports/period');
    const { runWithTenantScope } = await import('../../server/db/tenantStore');
    const { getPool } = await import('../../server/db/runtime');
    const window = parseReportPeriod({}, 'as-of');
    if (!window.ok) throw new Error(window.message);
    const { data } = await runWithTenantScope({ tenantId: String(orgId), orgUuid, role: 'admin', source: 'request', caller: 'qms-in-force-report' },
      () => runComplianceReport(getPool(), findReport('controlled-documents')!, orgId, window, {
        walkChain: async () => ({ ok: null, reason: 'not walked by this probe' }), checks: platformIntegrityChecks }));
    const row = data.sections.find((x) => x.key === 'documents')!.rows.find((x) => Number(x.id) === documentId);
    expect(row).toMatchObject({ version: '2.0', status: 'draft', approval_signature_id: null,
      in_force_version: '1.0', in_force_approval_signature_id: v1SignatureId });
    expect(String(row!.in_force_approval_signer_name)).toContain('invented signer');
  });
});

describe('when the successor is signed', () => {
  it('v2.0 is in force and v1.0 receipts no longer count', async () => {
    const row = (await owner.query('SELECT authoring_document_id FROM qms_documents WHERE id=$1', [documentId])).rows[0];
    await owner.query(`UPDATE authoring_sections SET content = '<p>Record each correction, its reason and its approver.</p>'
      WHERE doc_id = $1 AND code = 'qms-purpose'`, [row.authoring_document_id]);
    // The approver is shared onto the v2.0 editing copy as approver, the way a person is in the product.
    const { withNativeCatalogClient } = await import('./catalog-native-fixture');
    const { grantAuthoringPermission } = await import('../../server/services/authoring/authoring-permissions');
    await withNativeCatalogClient({ organizationId: orgId, organizationUuid: orgUuid, userId: author.id, role: 'member', caller: 'qms-in-force-share' },
      (sqlClient) => grantAuthoringPermission({ pool: sqlClient, tenantId: orgId, docId: String(row.authoring_document_id),
        principalId: String(signer.id), role: 'APPROVER', grantedBy: String(author.id), reason: 'Independent approver of v2.0' }));
    // An authored SOP is read by the people it is shared with; the trainee is one.
    await withNativeCatalogClient({ organizationId: orgId, organizationUuid: orgUuid, userId: author.id, role: 'member', caller: 'qms-in-force-share' },
      (sqlClient) => grantAuthoringPermission({ pool: sqlClient, tenantId: orgId, docId: String(row.authoring_document_id),
        principalId: String(viewer.id), role: 'VIEWER', grantedBy: String(author.id), reason: 'Trainee on v2.0' }));
    const review = await http(author, 'patch', `/api/mdx/qms/documents/${documentId}`, { status: 'in_review', reason: 'Saved v2.0 text ready for review' });
    expect(review.status, JSON.stringify(review.body)).toBe(200);
    const approved = await sign(documentId);
    expect(approved.status, JSON.stringify(approved.body)).toBe(200);
    const read = await http(viewer, 'get', `/api/mdx/qms/documents/${documentId}`);
    expect(read.status, JSON.stringify(read.body)).toBe(200);
    expect(read.body.meta.training).toMatchObject({ documentVersion: '2.0' });
    expect(read.body.meta.training.contentDigest).not.toBe(v1.contentDigest);
    expect(await coverageOf(documentId)).toMatchObject({ document_version: '2.0', current: 0 });
    const list = await http(viewer, 'get', '/api/mdx/qms/documents');
    expect(list.body.data.find((r: { id: number }) => r.id === documentId)).toMatchObject({ version: '2.0', status: 'effective', in_force: null });
  }, 60_000);
});
