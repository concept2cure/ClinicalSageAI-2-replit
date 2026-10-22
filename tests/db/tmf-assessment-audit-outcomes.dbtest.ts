/** Native canonical tables, genuine authentication/ALS and non-bypass configured
 * app_service. No test schema, policy, trigger or grants are installed. All
 * fixture content is synthetic. The targeted audit refusal changes only the
 * destination tenant at the audit boundary; actual PostgreSQL/tenant guards
 * reject it. The thrown control tests the documented unexpected rejection. */
import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import express from 'express';
import request from 'supertest';
import { Pool } from 'pg';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { databaseUrl } from '../setup.db';
import { shouldUseSsl } from '../../server/db/ssl';
import { buildRlsStartupOptions } from '../../server/db/rlsEnforcement';
import { requestPgClient } from '../../server/db/requestDb';
import { getTenantScope } from '../../server/db/tenantStore';
import { LazyRequestDbClient } from '../../server/middleware/lazyRequestDbClient';
import auditService from '../../server/services/auditService';

let ORG: number;
let FOREIGN_ORG: number;
const PREFIX = `synthetic-tmf-assessment-${randomUUID()}`;
const SECRET = 'Synthetic internal driver detail must remain server-side';
let owner: Pool;
let runtime: Pool;
let sharedPool: Pool;
let originalQuery: Pool['query'];
let app: express.Express;
let token: string;
let foreignToken: string;
let viewerToken: string;
let userId: number;
let foreignUserId: number;
let control: 'none' | 'audit-refusal' | 'audit-thrown' | 'business-refusal' | 'bulk-completion-loss' = 'none';
let refusedBusinessCode: string | undefined;
let auditRefusal: Awaited<ReturnType<typeof auditService.logAction>> | undefined;
let serial = 0;
let auditSpy: { mockRestore(): void; mock: { calls: unknown[][] } };
let accessibleDocument: string;
let privateDocument: string;
let foreignDocument: string;

function queryParts(args: unknown[]) {
  const first = args[0];
  const config = first && typeof first === 'object' && 'text' in first ? first as { text: string; values?: unknown[] } : undefined;
  return { text: typeof first === 'string' ? first : config?.text ?? '',
    values: Array.isArray(args[1]) ? args[1] as unknown[] : config?.values, config };
}

function businessTenantParameter(text: string): number {
  const insert = /^\s*insert\s+into\s+(?:"?public"?\.)?"?(?:tmf_artifact_filings|regulatory_assessments)"?\s*\(([^)]+)\)\s*values\s*\(([^)]+)\)/i.exec(text);
  if (!insert) return -1;
  const columns = insert[1].split(',').map(column => column.replaceAll('"', '').trim());
  const position = columns.indexOf('organization_id');
  const value = insert[2].split(',')[position]?.trim();
  return value && /^\$\d+$/.test(value) ? Number(value.slice(1)) - 1 : -1;
}

const file = (trial: string, bearer = token, artifactCode = 'protocol') => request(app)
  .post(`/api/etmf/trials/${trial}/artifacts`).set('Authorization', `Bearer ${bearer}`)
  .send({ artifactCode, documentRef: 'external-archive-synthetic-reference', organizationId: FOREIGN_ORG, userId: foreignUserId });
const assessment = (submissionId: number, bearer = token) => request(app).post('/api/regulatory-assessments')
  .set('Authorization', `Bearer ${bearer}`).send({ submissionId, assessmentType: `${PREFIX}-${++serial}`, ready: false,
    result: { fixture: PREFIX, verification: 'not-established' }, organizationId: FOREIGN_ORG, userId: foreignUserId });
const rows = (trial: string) => owner.query('SELECT * FROM tmf_artifact_filings WHERE trial_id=$1 ORDER BY organization_id', [trial]);
const auditRows = (resourceId: string) => owner.query(`SELECT tenant_id,user_id,action,table_name,record_id,sha256_chain,hmac_seal
  FROM audit_logs WHERE tenant_id=$1 AND record_id=$2 ORDER BY occurred_at`, [ORG, resourceId]);

const priorAuditHmacKey = process.env.AUDIT_HMAC_KEY;
const priorAuditHmacSecret = process.env.AUDIT_HMAC_SECRET;
function restoreAuditKeys(): void {
  if (priorAuditHmacKey === undefined) delete process.env.AUDIT_HMAC_KEY; else process.env.AUDIT_HMAC_KEY = priorAuditHmacKey;
  if (priorAuditHmacSecret === undefined) delete process.env.AUDIT_HMAC_SECRET; else process.env.AUDIT_HMAC_SECRET = priorAuditHmacSecret;
}

beforeAll(async () => {
  if (!process.env.APP_DATABASE_URL) throw new Error('APP_DATABASE_URL is required for native non-bypass TMF/assessment proof.');
  process.env.AUDIT_HMAC_KEY ??= 'synthetic-tmf-assessment-audit-hmac-key-no-production-use';
  process.env.AUDIT_HMAC_SECRET ??= 'synthetic-tmf-assessment-tamper-proof-key-no-production-use';
  owner = new Pool({ connectionString: databaseUrl, max: 2 });
  runtime = new Pool({ connectionString: process.env.APP_DATABASE_URL, options: buildRlsStartupOptions(), max: 2 });
  // Canonical ID defaults give this invocation new tenants. Fixed IDs shared
  // with the IND proof previously reused unrelated retained fixture history.
  const organization = async (name: string, suffix: string): Promise<number> => {
    const result = await owner.query<{ id: number }>(`INSERT INTO organizations (name,slug,status)
      VALUES ($1,$2,'active') RETURNING id`, [name, `${PREFIX}-${suffix}`]);
    const id = result.rows[0]?.id;
    if (typeof id !== 'number' || !Number.isSafeInteger(id) || id <= 0) throw new Error('A fresh TMF fixture organization could not be allocated.');
    return id;
  };
  ORG = await organization('Synthetic TMF assessment audit', 'organization');
  FOREIGN_ORG = await organization('Synthetic TMF assessment foreign audit', 'foreign-organization');
  expect((await owner.query('SELECT id,name,status FROM organizations WHERE id=ANY($1::integer[]) ORDER BY id', [[ORG, FOREIGN_ORG]])).rows)
    .toEqual([{ id: ORG, name: 'Synthetic TMF assessment audit', status: 'active' },
      { id: FOREIGN_ORG, name: 'Synthetic TMF assessment foreign audit', status: 'active' }]);
  const hash = await bcrypt.hash('Synthetic TMF assessment native fixture only!', 4);
  const account = async (suffix: string, org: number, role: string) => {
    const id = Number((await owner.query(`INSERT INTO users (email,name,status,password_hash)
      VALUES ($1,$2,'active',$3) RETURNING id`, [`${PREFIX}-${suffix}@example.invalid`, `Synthetic ${PREFIX}-${suffix}`, hash])).rows[0].id);
    await owner.query(`INSERT INTO organization_users (organization_id,user_id,role,created_at) VALUES ($1,$2,$3,now()-interval '1 day')`, [org, id, role]);
    return id;
  };
  userId = await account('author', ORG, 'member');
  foreignUserId = await account('foreign-author', FOREIGN_ORG, 'member');
  const viewerId = await account('viewer', ORG, 'viewer');
  const workspace = Number((await owner.query(`INSERT INTO client_workspaces(organization_id,name,slug) VALUES($1,$2,$2) RETURNING id`, [ORG, PREFIX])).rows[0].id);
  const foreignWorkspace = Number((await owner.query(`INSERT INTO client_workspaces(organization_id,name,slug) VALUES($1,$2,$2) RETURNING id`, [FOREIGN_ORG, PREFIX])).rows[0].id);
  const sourceDocument = async (org: number, workspaceId: number, actor: number, name: string) => {
    const program = randomUUID();
    await owner.query(`INSERT INTO regulatory_programs(id,organization_id,name,code,program_type,product_type,primary_agency,product_name,lead_user_id)
      VALUES($1,$2,$3::text,$5,'ind','small_molecule','FDA',$3::text,$4)`, [program, org, `${PREFIX}-${name}`, actor, program]);
    await owner.query(`INSERT INTO projects(organization_id,client_workspace_id,name,type,status,owner_id,created_by_id,regulatory_program_id,settings)
      VALUES($1,$2,$3,'program','active',$4,$4,$5,'{"projectSharing":{"visibility":"private","members":[]}}')`, [org, workspaceId, name, actor, program]);
    const id = randomUUID();
    await owner.query(`INSERT INTO vault.documents(id,program_id,organization_id,document_code,document_title,document_type,version,
      file_name,file_size,mime_type,content_hash,s3_bucket,s3_key,created_by)
      VALUES($1,$2,$3,$4::text,$4::text,'PROTOCOL','1.0','synthetic-protocol.pdf',1,'application/pdf',$5,'synthetic-local','synthetic-key',$6)`,
    [id, program, org, `TMF-${id}`, 'a'.repeat(64), actor]);
    return id;
  };
  accessibleDocument = await sourceDocument(ORG, workspace, userId, 'accessible-source');
  privateDocument = await sourceDocument(ORG, workspace, viewerId, 'private-source');
  foreignDocument = await sourceDocument(FOREIGN_ORG, foreignWorkspace, foreignUserId, 'foreign-source');
  const { activeJwtSecret } = await import('../../server/utils/jwtVerify');
  const bearer = (id: number, organizationId: number, role: string) => jwt.sign({ type: 'access', userId: id, organizationId: String(organizationId), role }, activeJwtSecret(), { expiresIn: '1h' });
  token = bearer(userId, ORG, 'member');
  foreignToken = bearer(foreignUserId, FOREIGN_ORG, 'member');
  viewerToken = bearer(viewerId, ORG, 'viewer');
  const { authMiddleware } = await import('../../server/auth');
  const { requireRole } = await import('../../server/middleware/auth');
  app = express();
  app.use(express.json());
  app.get('/native-tmf-assessment-scope', authMiddleware, async (req, res) => {
    const who = await requestPgClient(req).query(`SELECT current_user AS role,ssl,
      current_setting('app.current_tenant_id',true) AS tenant_id FROM pg_stat_ssl WHERE pid=pg_backend_pid()`);
    res.json({ ...who.rows[0], alsTenantId: getTenantScope()?.tenantId, lazyRequestClient: req.dbClient instanceof LazyRequestDbClient,
      functionalRoles: req.user?.roles });
  });
  app.get('/native-tmf-assessment-admin', authMiddleware, requireRole('admin'), (_req, res) => res.json({ admitted: true }));
  app.use('/api/etmf', authMiddleware, (await import('../../server/routes/etmf.routes')).default);
  app.use('/api/regulatory-assessments', authMiddleware, (await import('../../server/routes/regulatory-assessments.routes')).default);
  const originalAudit = auditService.logAction.bind(auditService);
  auditSpy = vi.spyOn(auditService, 'logAction').mockImplementation(async entry => {
    const owned = typeof entry === 'object' && entry.userId === userId
      && (entry.resourceType === 'tmf_artifact' || entry.resourceType === 'regulatory_assessment');
    if (owned && control === 'audit-thrown') throw new Error(SECRET);
    if (owned && control === 'audit-refusal') {
      auditRefusal = await originalAudit({ ...entry, organizationId: FOREIGN_ORG, tenantId: FOREIGN_ORG });
      return auditRefusal;
    }
    return originalAudit(entry);
  });
  sharedPool = (await import('../../server/db/runtime')).getPool();
  originalQuery = sharedPool.query;
  const delegate = originalQuery.bind(sharedPool);
  sharedPool.query = ((...args: unknown[]) => {
    const { text, values, config } = queryParts(args);
    const tenant = businessTenantParameter(text);
    const owned = values?.some(value => typeof value === 'string' && value.includes(PREFIX));
    if (control === 'bulk-completion-loss' && owned && tenant >= 0 && values?.includes('investigators_brochure')) {
      return (Reflect.apply(delegate, sharedPool, args) as Promise<unknown>).then(() => {
        throw Object.assign(new Error(SECRET), { code: 'ECONNRESET' });
      });
    }
    if (control !== 'business-refusal' || !owned || tenant < 0 || values?.[tenant] !== ORG) return Reflect.apply(delegate, sharedPool, args);
    const replacement = [...values];
    replacement[tenant] = FOREIGN_ORG;
    const actual = config && !Array.isArray(args[1]) ? [{ ...config, values: replacement }, ...args.slice(1)] : [args[0], replacement, ...args.slice(2)];
    return (Reflect.apply(delegate, sharedPool, actual) as Promise<unknown>).catch(error => { refusedBusinessCode = (error as { code?: string }).code; throw error; });
  }) as Pool['query'];
});

afterAll(async () => {
  control = 'none';
  restoreAuditKeys();
  auditSpy?.mockRestore();
  if (sharedPool && originalQuery) sharedPool.query = originalQuery;
  if (owner) await owner.end();
  if (runtime) await runtime.end();
  if (sharedPool) await sharedPool.end();
});

function registerTmfAssessmentReceiptsCases1() {
  it('uses configured transport, genuine auth/ALS, app_service and deployed FORCE RLS policies', async () => {
    expect((await runtime.query('SELECT current_user AS role,rolsuper,rolbypassrls FROM pg_roles WHERE rolname=current_user')).rows[0])
      .toEqual({ role: 'app_service', rolsuper: false, rolbypassrls: false });
    const response = await request(app).get('/native-tmf-assessment-scope').set('Authorization', `Bearer ${token}`);
    expect(response.status, JSON.stringify(response.body)).toBe(200);
    expect(response.body).toEqual({ role: 'app_service', ssl: shouldUseSsl(process.env.APP_DATABASE_URL), tenant_id: String(ORG), alsTenantId: String(ORG), lazyRequestClient: true,
      functionalRoles: ['member', 'regulatory-author'] });
    const policies = await owner.query(`SELECT relname,relrowsecurity,relforcerowsecurity FROM pg_class
      WHERE oid IN ('tmf_artifact_filings'::regclass,'regulatory_assessments'::regclass,'audit_logs'::regclass)`);
    expect(policies.rows).toHaveLength(3);
    expect(policies.rows.every(row => row.relrowsecurity && row.relforcerowsecurity)).toBe(true);
    expect((await runtime.query('SELECT id FROM tmf_artifact_filings WHERE organization_id=$1', [ORG])).rows).toEqual([]);
  });

  it('derives functional authority only from current membership, ignoring token admin and platform grants', async () => {
    const { activeJwtSecret } = await import('../../server/utils/jwtVerify');
    const forgedClaims = jwt.sign({ type: 'access', userId, organizationId: String(ORG), role: 'admin',
      roles: ['admin', 'super_admin', 'platform_admin'], permissions: ['*'] }, activeJwtSecret(), { expiresIn: '1h' });
    const scope = await request(app).get('/native-tmf-assessment-scope').set('Authorization', `Bearer ${forgedClaims}`);
    expect(scope.status).toBe(200);
    expect(scope.body.functionalRoles).toEqual(['member', 'regulatory-author']);
    expect((await request(app).get('/native-tmf-assessment-admin').set('Authorization', `Bearer ${forgedClaims}`)).status).toBe(403);
    expect((await file(`${PREFIX}-current-member-claims`, forgedClaims)).status).toBe(201);
  });

  it('records native identities with verified actor/org and retrievable sealed audit rows', async () => {
    const trial = `${PREFIX}-positive`;
    const filed = await file(trial);
    expect(filed.status, JSON.stringify(filed.body)).toBe(201);
    expect(filed.body).toMatchObject({ organizationId: ORG, createdBy: userId, trialId: trial, meta: { auditTrail: { persisted: true, chained: true } } });
    expect((await rows(trial)).rows).toMatchObject([{ id: filed.body.id, organization_id: ORG, created_by: userId }]);
    const receipt = (await auditRows(filed.body.id)).rows;
    expect(receipt).toMatchObject([{ tenant_id: ORG, user_id: userId, action: 'TMF_ARTIFACT_FILED', table_name: 'tmf_artifact', record_id: filed.body.id }]);
    expect(receipt[0].sha256_chain).toMatch(/^[a-f0-9]{64}$/);
    expect(receipt[0].hmac_seal).toBeTruthy();
    const recorded = await assessment(12345);
    expect(recorded.status, JSON.stringify(recorded.body)).toBe(201);
    expect(recorded.body).toMatchObject({ organizationId: ORG, createdBy: userId, submissionId: 12345,
      result: { verification: 'not-established' }, meta: { auditTrail: { persisted: true, chained: true } } });
    expect((await auditRows(recorded.body.id)).rows).toMatchObject([{ action: 'REGULATORY_ASSESSMENT_RECORDED', table_name: 'regulatory_assessment' }]);
  });

  it('refuses viewer mutations and foreign reads/deletes without new audits', async () => {
    const trial = `${PREFIX}-access`;
    const filed = await file(trial);
    const recorded = await assessment(12346);
    const calls = auditSpy.mock.calls.length;
    expect((await file(`${trial}-viewer`, viewerToken)).status).toBe(403);
    expect((await assessment(12347, viewerToken)).status).toBe(403);
    expect((await request(app).delete(`/api/etmf/artifacts/${filed.body.id}`).set('Authorization', `Bearer ${viewerToken}`)).status).toBe(403);
    expect((await request(app).get(`/api/etmf/trials/${trial}/artifacts`).set('Authorization', `Bearer ${foreignToken}`)).body).toEqual([]);
    expect((await request(app).delete(`/api/etmf/artifacts/${filed.body.id}`).set('Authorization', `Bearer ${foreignToken}`)).status).toBe(404);
    expect((await request(app).get(`/api/regulatory-assessments/${recorded.body.id}`).set('Authorization', `Bearer ${foreignToken}`)).status).toBe(404);
    expect(auditSpy.mock.calls).toHaveLength(calls);
    expect((await rows(trial)).rows).toHaveLength(1);
  });
}

function registerTmfAssessmentReceiptsCases2() {

  it.each(['audit-refusal', 'audit-thrown'] as const)('%s preserves the real filing and idempotent retry recovers a real audit', async mode => {
    const trial = `${PREFIX}-${mode}`;
    control = mode;
    const response = await file(trial);
    control = 'none';
    expect(response.status, JSON.stringify(response.body)).toBe(201);
    expect(response.body.meta.auditTrail).toMatchObject({ persisted: false, code: 'AUDIT_ROW_NOT_PERSISTED' });
    expect(JSON.stringify(response.body)).not.toContain(SECRET);
    expect((await rows(trial)).rows).toHaveLength(1);
    expect((await auditRows(response.body.id)).rows).toEqual([]);
    if (mode === 'audit-refusal') expect(auditRefusal).toMatchObject({ persisted: false, chained: false, tamperProof: false });
    const retry = await file(trial);
    expect(retry.body.id).toBe(response.body.id);
    expect(retry.body.meta.auditTrail).toEqual({ persisted: true, chained: true });
    expect((await rows(trial)).rows).toHaveLength(1);
    expect((await auditRows(response.body.id)).rows).toHaveLength(1);
  });

  it('reports an assessment audit refusal without losing or replaying its append-only snapshot', async () => {
    control = 'audit-refusal';
    const recorded = await assessment(12348);
    control = 'none';
    expect(recorded.status).toBe(201);
    expect(recorded.body.meta.auditTrail).toMatchObject({ persisted: false, code: 'AUDIT_ROW_NOT_PERSISTED' });
    const stored = await request(app).get(`/api/regulatory-assessments/${recorded.body.id}`).set('Authorization', `Bearer ${token}`);
    expect(stored.body).toMatchObject({ id: recorded.body.id, submissionId: 12348, result: { verification: 'not-established' } });
    expect(stored.body).not.toHaveProperty('meta');
    expect((await auditRows(recorded.body.id)).rows).toEqual([]);
  });

  it('preserves the 204 removal and reports its failed audit through headers', async () => {
    const trial = `${PREFIX}-remove`;
    const created = await file(trial);
    control = 'audit-refusal';
    const removed = await request(app).delete(`/api/etmf/artifacts/${created.body.id}`).set('Authorization', `Bearer ${token}`);
    control = 'none';
    expect(removed.status).toBe(204);
    expect(removed.headers['x-audit-row-persisted']).toBe('false');
    expect(removed.headers['x-audit-row-code']).toBe('AUDIT_ROW_NOT_PERSISTED');
    expect((await rows(trial)).rows).toEqual([]);
    expect((await auditRows(created.body.id)).rows).toHaveLength(1); // creation only
  });

  it('real RLS business refusals produce neither a business row nor an ancillary audit', async () => {
    control = 'business-refusal';
    const calls = auditSpy.mock.calls.length;
    const trial = `${PREFIX}-business-refusal`;
    const filed = await file(trial);
    const recorded = await assessment(12349);
    control = 'none';
    expect(filed.status, JSON.stringify(filed.body)).toBe(500);
    expect(recorded.status, JSON.stringify(recorded.body)).toBe(500);
    expect(refusedBusinessCode).toBe('42501');
    expect((await rows(trial)).rows).toEqual([]);
    expect((await owner.query('SELECT id FROM regulatory_assessments WHERE organization_id=$1 AND submission_id=12349 AND assessment_type LIKE $2', [ORG, `${PREFIX}%`])).rows).toEqual([]);
    expect(auditSpy.mock.calls).toHaveLength(calls);
    expect(JSON.stringify([filed.body, recorded.body])).not.toContain('row-level security');
    expect((await file(trial)).status).toBe(201);
  });
}

function registerTmfAssessmentReceiptsCases3() {

  it('bulk completion loss preserves earlier receipts, marks uncertainty and stops before remaining writes', async () => {
    const trial = `${PREFIX}-bulk-completion-loss`;
    control = 'bulk-completion-loss';
    const response = await request(app).post(`/api/etmf/trials/${trial}/artifacts/bulk`).set('Authorization', `Bearer ${token}`)
      .send({ artifacts: [{ artifactCode: 'protocol' }, { artifactCode: 'investigators_brochure' }, { artifactCode: 'sample_crf' }] });
    control = 'none';
    expect(response.status, JSON.stringify(response.body)).toBe(207);
    expect(response.body).toMatchObject({ partial: true, filed: 1, total: 3,
      meta: { auditTrail: { persisted: true, chained: true } },
      results: [{ artifactCode: 'protocol', ok: true, auditTrail: { persisted: true, chained: true } },
        { artifactCode: 'investigators_brochure', ok: false, error: 'TMF_ARTIFACT_WRITE_UNCONFIRMED', completion: 'unconfirmed' },
        { artifactCode: 'sample_crf', ok: false, error: 'NOT_ATTEMPTED', completion: 'not-attempted' }] });
    expect(JSON.stringify(response.body)).not.toContain(SECRET);
    const readback = await request(app).get(response.body.recovery.url).set('Authorization', `Bearer ${token}`);
    expect(readback.status).toBe(200);
    expect(readback.body.map((row: { artifactCode: string }) => row.artifactCode)).toEqual(['investigators_brochure', 'protocol']);
    expect((await rows(trial)).rows).toHaveLength(2);
    const recovered = await file(trial, token, 'investigators_brochure');
    expect(recovered.status).toBe(201);
    expect((await rows(trial)).rows).toHaveLength(2);
    expect((await request(app).get(response.body.recovery.url).set('Authorization', `Bearer ${foreignToken}`)).body).toEqual([]);
  });

  it('checks each Vault reference against its actual project while retaining an unbound trial label', async () => {
    const trial = `${PREFIX}-private-source-check`;
    const response = await request(app).post(`/api/etmf/trials/${trial}/artifacts/bulk`).set('Authorization', `Bearer ${token}`)
      .send({ artifacts: [{ artifactCode: 'protocol', documentRef: `vault://${accessibleDocument}` },
        { artifactCode: 'investigators_brochure', documentRef: `vault://${privateDocument}` },
        { artifactCode: 'sample_crf', documentRef: `vault://${foreignDocument}` }] });
    expect(response.status, JSON.stringify(response.body)).toBe(200);
    expect(response.body).toMatchObject({ filed: 1, results: [
      { artifactCode: 'protocol', ok: true },
      { artifactCode: 'investigators_brochure', ok: false, error: 'DOCUMENT_ACCESS_DENIED' },
      { artifactCode: 'sample_crf', ok: false, error: 'UNRESOLVABLE_DOCUMENT_REF' }] });
    expect((await rows(trial)).rows).toMatchObject([{ document_ref: `vault://${accessibleDocument}` }]);
    expect(JSON.stringify(response.body)).not.toContain(privateDocument);
    expect(JSON.stringify(response.body)).not.toContain(foreignDocument);
  });
}

describe('native TMF and assessment ancillary audit outcomes', () => {
  registerTmfAssessmentReceiptsCases1();
  registerTmfAssessmentReceiptsCases2();
  registerTmfAssessmentReceiptsCases3();
});
