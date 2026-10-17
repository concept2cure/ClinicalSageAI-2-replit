/** Actual mounted consumers on the deployed local schema with FORCE RLS.
 * Canonical JWT authentication establishes BOTH ALS and the pinned request
 * client. This is not evidence that instrumented global reads fail under ALS.
 * Fixtures and permanent governed/signature rows are synthetic audit evidence.
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import express from 'express';
import request from 'supertest';
import { Pool } from 'pg';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { databaseUrl } from '../setup.db';
import { buildRlsStartupOptions } from '../../server/db/rlsEnforcement';
import { requestPgClient } from '../../server/db/requestDb';

const ORG = 93590; const FOREIGN_ORG = 93591;
const PROGRAM = '11111111-2222-4333-8444-000000093590';
const FOREIGN_PROGRAM = '11111111-2222-4333-8444-000000093591';
const PASSWORD = 'Synthetic-Bla-Ivd-2026!';
const REASON = 'Synthetic native BLA and IVD request connection proof';
let owner: Pool; let runtime: Pool; let app: express.Express; let userId: number; let token: string;
let downgradeBeforeRouter = false;
let blaId: string; let ivdId: string; let documentId: string; let foreignBlaId: string; let foreignIvdId: string;
const read = (path: string) => request(app).get(path).set('Authorization', `Bearer ${token}`);
const post = (path: string, body: Record<string, unknown>) => request(app).post(path).set('Authorization', `Bearer ${token}`).send(body);
const blaBody = (programId = PROGRAM) => ({ programId, reason: REASON, title: 'Synthetic comparability',
  attributes: [{ name: 'Synthetic potency', criticality: 'moderate', preChange: [98, 100, 102], postChange: [99, 100, 101] }] });
const ivdBody = (programId = PROGRAM) => ({ programId, reason: REASON, assessmentType: 'cdx_pairing',
  title: 'Synthetic pairing', inputs: { measured: true }, result: { verdict: 'synthetic' } });

beforeAll(async () => {
  if (!process.env.APP_DATABASE_URL) throw new Error('APP_DATABASE_URL required for non-superuser BLA/IVD proof.');
  owner = new Pool({ connectionString: databaseUrl, max: 2 });
  runtime = new Pool({ connectionString: process.env.APP_DATABASE_URL, options: buildRlsStartupOptions(), max: 2 });
  await owner.query(`INSERT INTO organizations (id,name,slug,status) VALUES
    ($1,'Synthetic BLA IVD audit','synthetic-bla-ivd-audit','active'),
    ($2,'Synthetic foreign BLA IVD audit','synthetic-foreign-bla-ivd-audit','active')
    ON CONFLICT(id) DO UPDATE SET status='active'`, [ORG, FOREIGN_ORG]);
  const account = await owner.query(`INSERT INTO users (email,name,password_hash,status)
    VALUES ('synthetic-bla-ivd@example.invalid','Synthetic BLA IVD Author',$1,'active')
    ON CONFLICT(email) DO UPDATE SET password_hash=EXCLUDED.password_hash,status='active',mfa_enabled=false,mfa_secret=NULL,
      mfa_totp_last_step=NULL,failed_login_attempts=0,locked_until=NULL,password_changed_at=NULL,sessions_ended_at=NULL RETURNING id`,
  [await bcrypt.hash(PASSWORD, 4)]); userId = Number(account.rows[0].id);
  await owner.query(`INSERT INTO organization_users (organization_id,user_id,role,created_at) VALUES ($1,$2,'admin',now()-interval '1 day')
    ON CONFLICT(user_id,organization_id) DO UPDATE SET role='admin',created_at=EXCLUDED.created_at`, [ORG, userId]);
  await owner.query(`INSERT INTO regulatory_programs
    (id,organization_id,name,code,program_type,product_type,primary_agency,product_name,lead_user_id)
    VALUES ($1,$2,'Synthetic BLA IVD','SYN-BLA-IVD','bla','biologic','FDA','Synthetic product',$3),
      ($4,$5,'Synthetic foreign BLA IVD','SYN-BLA-IVD-F','bla','biologic','FDA','Synthetic foreign product',$3)
    ON CONFLICT(id) DO UPDATE SET deleted_at=NULL,lead_user_id=EXCLUDED.lead_user_id`, [PROGRAM, ORG, userId, FOREIGN_PROGRAM, FOREIGN_ORG]);
  foreignBlaId = String((await owner.query(`INSERT INTO c2c_bla_assessments
    (org_id,program_id,kind,title,tenant_id) VALUES ($1,$2,'comparability','Synthetic foreign',$1) RETURNING id`, [FOREIGN_ORG, FOREIGN_PROGRAM])).rows[0].id);
  foreignIvdId = String((await owner.query(`INSERT INTO ivd_assessments
    (organization_id,program_id,assessment_type,inputs,result) VALUES ($1,$2,'cdx_pairing','{}','{}') RETURNING id`, [FOREIGN_ORG, FOREIGN_PROGRAM])).rows[0].id);
  await owner.query(`INSERT INTO ivd_generated_documents
    (organization_id,program_id,doc_type,payload) VALUES ($1,$2,'fsn','{}')`, [FOREIGN_ORG, FOREIGN_PROGRAM]);
  const { activeJwtSecret } = await import('../../server/utils/jwtVerify');
  token = jwt.sign({ type: 'access', userId, organizationId: String(ORG), role: 'admin' }, activeJwtSecret(), { expiresIn: '1h' });
  const { authMiddleware } = await import('../../server/auth');
  app = express(); app.use(express.json());
  app.get('/native-scope-proof', authMiddleware, async (req, res) => {
    const result = await requestPgClient(req).query(`SELECT current_user AS role,
      current_setting('app.current_user_role',true) AS policy_role,
      current_setting('app.current_tenant_id',true) AS tenant_id`);
    res.json(result.rows[0]);
  });
  // The only control seam changes the persisted row AFTER genuine admission;
  // it never fabricates a caller/role or replaces any route guard or SQL.
  const concurrentRoleChange: express.RequestHandler = async (_req, _res, next) => {
    if (downgradeBeforeRouter) await owner.query("UPDATE organization_users SET role='viewer' WHERE organization_id=$1 AND user_id=$2", [ORG, userId]);
    next();
  };
  app.use('/api/biopharma/bla', authMiddleware, concurrentRoleChange, (await import('../../server/routes/biopharma/bla-workbench')).default);
  app.use('/api/ivd-assessments', authMiddleware, concurrentRoleChange, (await import('../../server/routes/ivd-assessments')).default);
  app.use('/api/ivd-lifecycle', authMiddleware, (await import('../../server/routes/ivd-lifecycle')).default);
});
afterAll(async () => {
  if (owner) await owner.end(); if (runtime) await runtime.end();
  const { getPool } = await import('../../server/db/runtime'); await getPool().end();
});

describe('native BLA and IVD saved work survives refresh without a privileged reader', () => {
  it('runs as non-superuser without BYPASSRLS against the actual FORCE RLS tables', async () => {
    const who = await runtime.query('SELECT current_user AS role,rolsuper,rolbypassrls FROM pg_roles WHERE rolname=current_user');
    expect(who.rows[0]).toMatchObject({ rolsuper: false, rolbypassrls: false }); expect(who.rows[0].role).not.toBe('postgres');
    const scope = await read('/native-scope-proof'); expect(scope.status).toBe(200);
    expect(scope.body.role).toBe(who.rows[0].role); expect(scope.body.tenant_id).toBe(String(ORG));
    expect(scope.body.policy_role).not.toBe('app_super_admin');
    const tables = await owner.query(`SELECT relname,relrowsecurity,relforcerowsecurity FROM pg_class WHERE oid IN
      ('c2c_bla_assessments'::regclass,'ivd_assessments'::regclass,'ivd_generated_documents'::regclass)`);
    expect(tables.rows).toHaveLength(3); expect(tables.rows.every(row => row.relrowsecurity && row.relforcerowsecurity)).toBe(true);
  });
  it('saves and refreshes BLA, IVD assessments and generated draft documents through actual authenticated HTTP', async () => {
    const bla = await post('/api/biopharma/bla/comparability', blaBody());
    expect(bla.status, JSON.stringify(bla.body)).toBe(200); blaId = bla.body.assessment.id;
    expect(bla.body.assessment.governance.auditId).toBeTruthy();
    const blaList = await read(`/api/biopharma/bla/assessments?programId=${PROGRAM}`);
    expect(blaList.status).toBe(200); expect(blaList.body.assessments.some((row: { id: string }) => row.id === blaId)).toBe(true);
    const blaDetail = await read(`/api/biopharma/bla/assessments/${blaId}`);
    expect(blaDetail.status).toBe(200); expect(blaDetail.body.org_id).toBe(ORG);
    const ivd = await post('/api/ivd-assessments', ivdBody());
    expect(ivd.status, JSON.stringify(ivd.body)).toBe(201); ivdId = ivd.body.id; expect(ivd.body.governance.auditId).toBeTruthy();
    const list = await read(`/api/ivd-assessments?program_id=${PROGRAM}&type=cdx_pairing`);
    expect(list.status).toBe(200); expect(list.body.rows.some((row: { id: string }) => row.id === ivdId)).toBe(true);
    const detail = await read(`/api/ivd-assessments/${ivdId}`); expect(detail.status).toBe(200); expect(detail.body.organization_id).toBe(ORG);
    const doc = await post('/api/ivd-assessments/documents', { programId: PROGRAM, reason: REASON, docType: 'fsn', title: 'Synthetic FSN', payload: { notice: 'Synthetic draft' } });
    expect(doc.status, JSON.stringify(doc.body)).toBe(201); documentId = doc.body.id;
    const docs = await read(`/api/ivd-assessments/documents?program_id=${PROGRAM}&doc_type=fsn`);
    expect(docs.status).toBe(200); expect(docs.body.rows.some((row: { id: string }) => row.id === documentId)).toBe(true);
    expect((await post('/api/ivd-lifecycle/drift/detect', {})).status).toBe(200);
    expect((await runtime.query('SELECT id FROM ivd_assessments WHERE organization_id=$1', [ORG])).rows).toEqual([]);
  });
  it('refuses foreign tenant exact records and foreign-program saves without changing org-scoped read policy', async () => {
    expect((await read(`/api/biopharma/bla/assessments/${foreignBlaId}`)).status).toBe(404);
    expect((await read(`/api/ivd-assessments/${foreignIvdId}`)).status).toBe(404);
    expect((await read(`/api/ivd-assessments/documents?program_id=${FOREIGN_PROGRAM}`)).body.rows).toEqual([]);
    expect((await post('/api/biopharma/bla/comparability', blaBody(FOREIGN_PROGRAM))).status).toBe(404);
    expect((await post('/api/ivd-assessments', ivdBody(FOREIGN_PROGRAM))).status).toBe(404);
  });
  it('reverifies the actual BLA signer and commits its signed row, audit and signature together', async () => {
    const wrong = await post(`/api/biopharma/bla/assessments/${blaId}/sign`, { reason: REASON, meaning: 'approval', password: 'synthetic-wrong' });
    expect(wrong.status, JSON.stringify(wrong.body)).toBe(401);
    expect((await owner.query('SELECT failed_login_attempts FROM users WHERE id=$1', [userId])).rows[0].failed_login_attempts).toBe(1);
    const signed = await post(`/api/biopharma/bla/assessments/${blaId}/sign`, { reason: REASON, meaning: 'approval', password: PASSWORD });
    expect(signed.status, JSON.stringify(signed.body)).toBe(201); expect(signed.body.auditId).toBeTruthy(); expect(signed.body.signatureId).toBeTruthy();
    expect((await read(`/api/biopharma/bla/assessments/${blaId}`)).body.status).toBe('signed');
    const signature = await owner.query('SELECT signer_id,organization_id FROM electronic_signatures WHERE id=$1', [signed.body.signatureId]);
    expect(Number(signature.rows[0].signer_id)).toBe(userId); expect(signature.rows[0].organization_id).toBe(ORG);
  });
  it('refuses an in-flight writer downgraded to viewer after authentication even when still programme lead, and retains member-lead authority', async () => {
    const before = (await owner.query(`SELECT
      (SELECT count(*) FROM c2c_bla_assessments WHERE org_id=$1) AS bla,
      (SELECT count(*) FROM ivd_assessments WHERE organization_id=$1) AS ivd`, [ORG])).rows[0];
    downgradeBeforeRouter = true;
    try {
      const bla = await post('/api/biopharma/bla/comparability', blaBody());
      await owner.query("UPDATE organization_users SET role='admin' WHERE organization_id=$1 AND user_id=$2", [ORG, userId]);
      const ivd = await post('/api/ivd-assessments', ivdBody());
      expect(bla.status, JSON.stringify(bla.body)).toBe(403); expect(ivd.status, JSON.stringify(ivd.body)).toBe(403);
      expect(bla.body.error.code).toBe('FORBIDDEN'); expect(ivd.body.error.code).toBe('FORBIDDEN');
      const after = (await owner.query(`SELECT
        (SELECT count(*) FROM c2c_bla_assessments WHERE org_id=$1) AS bla,
        (SELECT count(*) FROM ivd_assessments WHERE organization_id=$1) AS ivd`, [ORG])).rows[0];
      expect(after).toEqual(before);
    } finally { downgradeBeforeRouter = false; await owner.query("UPDATE organization_users SET role='member' WHERE organization_id=$1 AND user_id=$2", [ORG, userId]); }
    const { invalidateOrgMembershipCache } = await import('../../server/middleware/orgMembership'); invalidateOrgMembershipCache(userId, ORG);
    expect((await post('/api/biopharma/bla/comparability', blaBody())).status).toBe(200);
    expect((await post('/api/ivd-assessments', ivdBody())).status).toBe(201);
  });
});
