/**
 * The fixture both training-assignment suites run on (P-49, P-50; MR-12 Stage 4,
 * docs/design/QMS_TRAINING_ASSIGNMENT_2026-10-29.md slice 2): four invented
 * organizations, their members by role, a project for an authored document,
 * and the real /api/mdx QMS routes behind authMiddleware, on PostgreSQL as the
 * runtime role with RLS on. Moved out of qms-training-assignments.dbtest.ts
 * unchanged when its review round took it past the 500-line limit, as
 * two-tenant-fixture.ts was. vitest.db.config.ts runs files one at a time, and
 * each suite provisions its own organizations under its own TAG.
 *
 * The bindings below are live ES-module exports: provisionTrainingAssignmentFixture()
 * assigns them, and a suite reads them after its beforeAll has run. A suite's
 * vi.mock calls apply to the server modules imported here, which load inside
 * provisioning.
 */
import { randomUUID } from 'node:crypto';
import bcrypt from 'bcryptjs';
import express from 'express';
import jwt from 'jsonwebtoken';
import { Pool } from 'pg';
import request from 'supertest';
import { expect } from 'vitest';
import { databaseUrl } from '../setup.db';
import { seedNativeCatalogProject } from './catalog-native-fixture';

export const TAG = `qms-trnassign-${randomUUID().slice(0, 8)}`;
export const REASON = 'Who must train on this controlled procedure.';
export const PASSWORD = 'test-qms-training-assignment-fixture';
const originalRbacFlag = process.env.GOVERNANCE_RBAC_ENFORCE;
export type Actor = { id: number; token: string; orgId: number };
export type Org = { id: number; uuid: string };
export let owner: Pool;
export let orgA: Org;
export let orgB: Org;
export let orgC: Org;
export let orgD: Org;
export let programId: string;
export let app: express.Express;
export const A: Record<'admin' | 'admin2' | 'demoted' | 'approver' | 'member' | 'manager' | 'viewer' | 'author'
  | 'qa1' | 'qa2' | 'named' | 'both' | 'suspended' | 'departed' | 'dropped' | 'oldRole' | 'unassigned', Actor> = {} as never;
export const B: Record<'admin' | 'member', Actor> = {} as never;
/** Organization C is put into pending deletion by one case, so nothing else runs there. */
export const C: Record<'admin', Actor> = {} as never;
/** Organization D has designated a QMS approver, so the Approver role no longer stands in. */
export const D: Record<'admin' | 'designated' | 'approver' | 'member', Actor> = {} as never;

export async function newOrg(suffix: string): Promise<Org> {
  const row = (await owner.query("INSERT INTO organizations(name,slug,status,payment_status) VALUES($1,$1,'active','active') RETURNING id, uuid",
    [`${TAG}-${suffix}`])).rows[0];
  return { id: Number(row.id), uuid: String(row.uuid) };
}

let passwordHash: string;
export async function account(orgId: number, key: string, role: string): Promise<Actor> {
  const user = (await owner.query(`INSERT INTO users(email,name,password_hash,status) VALUES($1,$2,$3,'active') RETURNING id`,
    [`${TAG}-${key}@example.invalid`, `${TAG} invented ${key}`, passwordHash])).rows[0];
  const id = Number(user.id);
  await owner.query('INSERT INTO organization_users(organization_id,user_id,role) VALUES($1,$2,$3)', [orgId, id, role]);
  const { activeJwtSecret } = await import('../../server/utils/jwtVerify');
  return { id, orgId, token: jwt.sign({ type: 'access', id: String(id), userId: String(id), organizationId: String(orgId), role },
    activeJwtSecret(), { expiresIn: '1h' }) };
}

export const call = (by: Actor, method: 'get' | 'post' | 'delete', path: string, body?: Record<string, unknown>) => {
  const req = request(app)[method](`/api/mdx/qms${path}`).set('Authorization', `Bearer ${by.token}`);
  return body === undefined ? req : req.send(body);
};
export const assign = (by: Actor, documentId: number, subject: { jobRoleId?: number; userId?: number }, extra: Record<string, unknown> = {}) =>
  call(by, 'post', `/documents/${documentId}/training-assignments`, { ...subject, reason: REASON, ...extra });
export const unassign = (by: Actor, documentId: number, assignmentId: number) =>
  call(by, 'delete', `/documents/${documentId}/training-assignments/${assignmentId}`, { reason: REASON });
export const listing = (by: Actor, documentId: number) => call(by, 'get', `/documents/${documentId}/training-assignments`);

export async function role(by: Actor, name: string, members: Actor[] = []): Promise<number> {
  const res = await call(by, 'post', '/job-roles', { name: `${name} ${randomUUID().slice(0, 4)}`, reason: REASON });
  expect(res.status, JSON.stringify(res.body)).toBe(201);
  const id = Number(res.body.data.id);
  for (const m of members) {
    const added = await call(by, 'post', `/job-roles/${id}/members`, { userId: m.id, reason: REASON });
    expect(added.status, JSON.stringify(added.body)).toBe(201);
  }
  return id;
}

let docSeq = 0;
/** A register entry with inline procedure text. Effective and retired are reached only by their signed routes (the signature guard). */
export async function document(org: Org, fields: { docType?: string; status?: 'draft' | 'in_review' } = {}): Promise<number> {
  docSeq += 1;
  const row = (await owner.query(`INSERT INTO qms_documents (organization_id, doc_number, title, doc_type, version, status, author_id, metadata)
      VALUES ($1, $2, $3, $4, '1.0', $5, NULL, $6::jsonb) RETURNING id`,
    [org.id, `${TAG}-${docSeq}`, `${TAG} invented procedure ${docSeq}`, fields.docType ?? 'sop', fields.status ?? 'draft',
      JSON.stringify({ sections: [{ key: 'procedure', label: 'Procedure', body: 'Record each correction with its reason.' }] })])).rows[0];
  return Number(row.id);
}
/** Released by the Approver-role stand-in's signature, through the real approve route. */
export async function effectiveDocument(): Promise<number> {
  const id = await document(orgA, { status: 'in_review' });
  const res = await call(A.approver, 'post', `/documents/${id}/approve`, { password: PASSWORD, meaning: 'APPROVED', reason: 'Independent release of the invented procedure.' });
  expect(res.status, JSON.stringify(res.body)).toBe(200);
  return id;
}
/** Retired by a signature, through the real retire route. */
export async function retiredDocument(): Promise<number> {
  const id = await document(orgA);
  const res = await call(A.approver, 'post', `/documents/${id}/retire`, { password: PASSWORD, meaning: 'retirement', reason: 'Withdrawn from use: replaced by another procedure.' });
  expect(res.status, JSON.stringify(res.body)).toBe(200);
  return id;
}

export const assignmentRows = async (documentId: number) => (await owner.query(
  `SELECT id, organization_id, document_id, job_role_id, user_id, assigned_by, removed_by, removed_at IS NOT NULL AS removed, xmin::text AS xmin
     FROM qms_training_assignments WHERE document_id = $1 ORDER BY id`, [documentId])).rows;
/** The ledger pair for a target: the chained audit row and its governed action, joined by the action id. */
export const ledger = async (orgId: number, target: string) => (await owner.query(
  `SELECT a.action, a.reason, a.user_id, a.xmin::text AS audit_xmin, c.command, c.domain, c.payload, c.xmin::text AS action_xmin
     FROM audit_logs a JOIN c2c_ana_actions c ON c.id = a.ana_action_id
    WHERE a.tenant_id::text = $1::text AND a.target = $2 ORDER BY a.occurred_at, a.id`, [orgId, target])).rows;
/** Every assignment row and every ledger row on a document target, across the test organizations. */
export const countAll = async () => Number((await owner.query(
  `SELECT (SELECT count(*) FROM qms_training_assignments WHERE organization_id = ANY($1::int[]))
        + (SELECT count(*) FROM audit_logs WHERE tenant_id::text = ANY($2::text[]) AND target LIKE 'qms-document:%') AS n`,
  [[orgA.id, orgB.id, orgD.id], [orgA.id, orgB.id, orgD.id].map(String)])).rows[0].n);

/** Four organizations and their members, a project for authored documents, and the app. */
export async function provisionTrainingAssignmentFixture(): Promise<void> {
  if (!process.env.APP_DATABASE_URL) throw new Error('APP_DATABASE_URL must use the provisioned non-owner runtime role.');
  process.env.GOVERNANCE_RBAC_ENFORCE = 'false';
  owner = new Pool({ connectionString: databaseUrl, max: 4 });
  passwordHash = await bcrypt.hash(PASSWORD, 4);
  [orgA, orgB, orgC, orgD] = [await newOrg('a'), await newOrg('b'), await newOrg('c'), await newOrg('d')];
  const roles: Record<keyof typeof A, string> = {
    admin: 'admin', admin2: 'admin', demoted: 'admin', approver: 'approver', member: 'member', manager: 'manager', viewer: 'viewer',
    author: 'member', qa1: 'member', qa2: 'member', named: 'member', both: 'member', suspended: 'member', departed: 'member',
    dropped: 'member', oldRole: 'member', unassigned: 'member',
  };
  for (const key of Object.keys(roles) as Array<keyof typeof A>) A[key] = await account(orgA.id, key, roles[key]);
  B.admin = await account(orgB.id, 'b-admin', 'admin');
  B.member = await account(orgB.id, 'b-member', 'member');
  C.admin = await account(orgC.id, 'c-admin', 'admin');
  D.admin = await account(orgD.id, 'd-admin', 'admin');
  D.designated = await account(orgD.id, 'd-designated', 'member');
  D.approver = await account(orgD.id, 'd-approver', 'approver');
  D.member = await account(orgD.id, 'd-member', 'member');
  // Organization D designates a QMS approver (migrations/20261029f), which ends the Approver-role stand-in there.
  await owner.query(`UPDATE organization_users SET qms_approver_designated_at = now(), qms_approver_designated_by = $3
     WHERE organization_id = $1 AND user_id = $2`, [orgD.id, D.designated.id, D.admin.id]);
  const program = await owner.query(`INSERT INTO regulatory_programs (name, code, organization_id, program_type, product_type, primary_agency, product_name)
    VALUES ($1, $2, $3, 'IND', 'drug', 'FDA', 'Invented product') RETURNING id`, [`${TAG} program`, TAG.toUpperCase(), orgA.id]);
  programId = String(program.rows[0].id);
  const { projectId } = await seedNativeCatalogProject(owner, { organizationId: orgA.id, userId: A.author.id, programId, namespace: TAG });
  await owner.query('INSERT INTO project_visibility_settings (organization_id, project_id, visibility) VALUES ($1, $2, $3)', [orgA.id, projectId, 'org_public']);
  const { authMiddleware } = await import('../../server/auth');
  app = express(); app.use(express.json());
  app.use('/api/mdx', authMiddleware, (await import('../../server/routes/mdx-qms')).default);
}

export async function teardownTrainingAssignmentFixture(): Promise<void> {
  if (originalRbacFlag == null) delete process.env.GOVERNANCE_RBAC_ENFORCE;
  else process.env.GOVERNANCE_RBAC_ENFORCE = originalRbacFlag;
  if (owner && orgA) await owner.query("UPDATE organizations SET status='inactive' WHERE id = ANY($1::int[])", [[orgA, orgB, orgC, orgD].filter(Boolean).map((o) => o.id)]);
  const { getPool } = await import('../../server/db/runtime');
  await getPool().end(); await owner?.end();
}
