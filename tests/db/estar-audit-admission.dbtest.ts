/** Deployed schema, genuine authentication and non-bypass runtime TLS. Fault
 * controls target synthetic fixture writes; no schema, grant or policy changes. */
import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import express from 'express';
import request from 'supertest';
import { Pool } from 'pg';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import JSZip from 'jszip';
import { databaseUrl } from '../setup.db';
import { buildRlsStartupOptions } from '../../server/db/rlsEnforcement';
import { requestPgClient } from '../../server/db/requestDb';
import { getTenantScope } from '../../server/db/tenantStore';
import { LazyRequestDbClient } from '../../server/middleware/lazyRequestDbClient';

const ORG = 94970;
const FOREIGN = 94971;
const PREFIX = 'Synthetic native eSTAR audit admission';
const BASE = '/api/510k/estar';
let owner: Pool;
let runtime: Pool;
let app: express.Express;
let userId: number;
let otherUser: number;
let ownProject: number;
let privateProject: number;
let foreignProject: number;
let ownFiling: string;
let privateFiling: string;
let foreignFiling: string;
let unboundFiling: string;
const technicalProgram = randomUUID();
let token: string;
let control: 'none' | 'audit-refusal' | 'audit-throw' | 'assembly-audit-refusal' | 'remove-member' | 'viewer' | 'inactive' = 'none';
let restoreAudit: () => void;
const get = (path: string) => request(app).get(BASE + path).set('Authorization', `Bearer ${token}`);
const post = (path: string, body: unknown) => request(app).post(BASE + path).set('Authorization', `Bearer ${token}`).send(body);
const patch = (id: string, body: unknown) => request(app).patch(`${BASE}/submissions/${id}`).set('Authorization', `Bearer ${token}`).send(body);
const put = (body: unknown) => request(app).put(`${BASE}/registration`).set('Authorization', `Bearer ${token}`).send(body);

async function membership(role = 'member') {
  await owner.query(`INSERT INTO organization_users (organization_id,user_id,role,created_at)
    VALUES ($1,$2,$3,now()-interval '1 day') ON CONFLICT(user_id,organization_id) DO UPDATE SET role=EXCLUDED.role`, [ORG, userId, role]);
  await owner.query("UPDATE users SET status='active',sessions_ended_at=NULL WHERE id=$1", [userId]);
  const { activeJwtSecret } = await import('../../server/utils/jwtVerify');
  token = jwt.sign({ type: 'access', userId, organizationId: String(ORG), role, jti: randomUUID() }, activeJwtSecret(), { expiresIn: '1h' });
}

async function createTechnicalFileFixture() {
  await owner.query(`INSERT INTO regulatory_programs
    (id,organization_id,name,code,program_type,product_type,primary_agency,product_name,lead_user_id)
    VALUES ($1,$2,$3,$4,'CER','device','EMA','Synthetic technical-file device',$5)`,
  [technicalProgram, ORG, PREFIX, `SYN-TF-${technicalProgram}`, userId]);
  const documentId = `synthetic-technical-file-${randomUUID()}`;
  await owner.query(`INSERT INTO c2c_documents (id,org_id,project_id,doc_type,agency,rule_pack_version,title,owner_id)
    VALUES ($1,$2,$3,'mdr','ema','eu-mdr-2017-745-annex-ii-v1.0',$4,$5)`, [documentId, ORG, technicalProgram, PREFIX, userId]);
  await owner.query(`INSERT INTO c2c_document_sections (document_id,section_key,label,path_order,status,content)
    VALUES ($1,'II.1.a','Product name and intended purpose',1,'approved',$2::jsonb)`,
  [documentId, JSON.stringify({ text: 'Disposable synthetic device-description source for local audit qualification.' })]);
}

beforeAll(async () => {
  if (!process.env.APP_DATABASE_URL) throw new Error('APP_DATABASE_URL must name the non-bypass TLS runtime role.');
  owner = new Pool({ connectionString: databaseUrl, max: 2 });
  runtime = new Pool({ connectionString: process.env.APP_DATABASE_URL, options: buildRlsStartupOptions(), max: 2 });
  await owner.query(`INSERT INTO organizations (id,name,slug,status) VALUES
    ($1,$3,'synthetic-estar-audit-native','active'),($2,$4,'synthetic-estar-audit-native-foreign','active')
    ON CONFLICT(id) DO NOTHING`, [ORG, FOREIGN, PREFIX, `${PREFIX} foreign`]);
  const passwordHash = await bcrypt.hash('Synthetic-estar-audit-only-password!', 4);
  const users = await owner.query(`INSERT INTO users (email,name,status,password_hash) VALUES
    ('synthetic-estar-audit@example.invalid','Synthetic eSTAR member','active',$1),
    ('synthetic-estar-audit-other@example.invalid','Synthetic other owner','active',$1)
    ON CONFLICT(email) DO UPDATE SET status='active',mfa_enabled=false,mfa_secret=NULL,
      password_changed_at=NULL,sessions_ended_at=NULL RETURNING id,email`, [passwordHash]);
  userId = Number(users.rows.find(row => row.email === 'synthetic-estar-audit@example.invalid').id);
  otherUser = Number(users.rows.find(row => row.email === 'synthetic-estar-audit-other@example.invalid').id);
  await membership();
  await owner.query(`INSERT INTO organization_users (organization_id,user_id,role,created_at)
    VALUES ($1,$2,'member',now()-interval '1 day'),($3,$2,'member',now()-interval '1 day')
    ON CONFLICT(user_id,organization_id) DO NOTHING`, [ORG, otherUser, FOREIGN]);
  const workspace = async (organizationId: number) => Number((await owner.query(`INSERT INTO client_workspaces
    (organization_id,name,slug) VALUES ($1,$2,$3) ON CONFLICT(organization_id,slug) DO UPDATE SET status='active' RETURNING id`,
  [organizationId, PREFIX, `synthetic-estar-audit-${organizationId}`])).rows[0].id);
  const ownWorkspace = await workspace(ORG);
  const foreignWorkspace = await workspace(FOREIGN);
  const project = async (organizationId: number, workspaceId: number, actor: number) => Number((await owner.query(`INSERT INTO projects
    (organization_id,client_workspace_id,name,type,status,owner_id,created_by_id,settings)
    VALUES ($1,$2,$3,'regulatory','active',$4,$4,'{"projectSharing":{"visibility":"private","members":[]}}') RETURNING id`,
  [organizationId, workspaceId, PREFIX, actor])).rows[0].id);
  ownProject = await project(ORG, ownWorkspace, userId);
  privateProject = await project(ORG, ownWorkspace, otherUser);
  foreignProject = await project(FOREIGN, foreignWorkspace, otherUser);
  const filing = async (organizationId: number, projectId: number | null) => String((await owner.query(`INSERT INTO estar_submissions
    (organization_id,project_id,catalog_key,program_type,variant,title,status,created_by)
    VALUES ($1,$2,'510k','510k','device',$3,'draft',$4) RETURNING id`, [organizationId, projectId, PREFIX, userId])).rows[0].id);
  ownFiling = await filing(ORG, ownProject);
  privateFiling = await filing(ORG, privateProject);
  foreignFiling = await filing(FOREIGN, foreignProject);
  unboundFiling = await filing(ORG, null);
  await createTechnicalFileFixture();
  const { activeJwtSecret } = await import('../../server/utils/jwtVerify');
  token = jwt.sign({ type: 'access', userId, organizationId: String(ORG), role: 'member' }, activeJwtSecret(), { expiresIn: '1h' });
  const { authMiddleware } = await import('../../server/auth');
  const audit = (await import('../../server/services/auditService')).default;
  const actualAudit = audit.logAction.bind(audit);
  const spy = vi.spyOn(audit, 'logAction').mockImplementation(async (...args: Parameters<typeof audit.logAction>) => {
    if (control === 'audit-throw') throw new Error('Synthetic private audit sink failure; never expose this text.');
    const entry = args[0];
    if (control === 'audit-refusal' || (control === 'assembly-audit-refusal' && typeof entry === 'object' && entry.action === 'DEVICE_TECHNICAL_FILE_ASSEMBLED')) {
      if (entry && typeof entry === 'object') return actualAudit({ ...entry, organizationId: FOREIGN, tenantId: FOREIGN });
    }
    return actualAudit(...args);
  });
  restoreAudit = () => spy.mockRestore();
  app = express();
  app.use(express.json());
  app.get('/native-estar-scope', authMiddleware, async (req, res) => {
    const result = await requestPgClient(req).query(`SELECT current_user AS role,
      current_setting('app.current_tenant_id',true) AS tenant_id`);
    res.json({ ...result.rows[0], alsTenant: getTenantScope()?.tenantId, lazy: req.dbClient instanceof LazyRequestDbClient });
  });
  app.use(BASE, authMiddleware, async (_req, _res, next) => {
    try {
      if (control === 'remove-member') await owner.query('DELETE FROM organization_users WHERE organization_id=$1 AND user_id=$2', [ORG, userId]);
      if (control === 'viewer') await owner.query("UPDATE organization_users SET role='viewer' WHERE organization_id=$1 AND user_id=$2", [ORG, userId]);
      if (control === 'inactive') await owner.query("UPDATE users SET status='inactive' WHERE id=$1", [userId]);
      next();
    } catch (error) { next(error); }
  }, (await import('../../server/routes/510k-estar-routes')).default);
  app.use('/api/submissions', authMiddleware, (await import('../../server/routes/submissions')).default);
});

afterAll(async () => {
  control = 'none';
  restoreAudit?.();
  if (owner && userId) await membership();
  await owner?.end(); await runtime?.end();
  await (await import('../../server/db/runtime')).getPool().end();
});

describe('native eSTAR audit outcomes and current project admission', () => {
  it('executes on genuine authenticated TLS app_service with ALS and FORCE RLS', async () => {
    const role = (await runtime.query('SELECT current_user AS role,rolsuper,rolbypassrls FROM pg_roles WHERE rolname=current_user')).rows[0];
    expect(role).toMatchObject({ rolsuper: false, rolbypassrls: false });
    const response = await request(app).get('/native-estar-scope').set('Authorization', `Bearer ${token}`);
    expect(response.status).toBe(200);
    expect(response.body).toMatchObject({ role: role.role, tenant_id: String(ORG), alsTenant: String(ORG), lazy: true });
    const tables = (await owner.query(`SELECT relrowsecurity,relforcerowsecurity FROM pg_class
      WHERE oid IN ('estar_submissions'::regclass,'estar_registrations'::regclass,'projects'::regclass)`)).rows;
    expect(tables).toHaveLength(3);
    expect(tables.every(row => row.relrowsecurity && row.relforcerowsecurity)).toBe(true);
    expect((await runtime.query('SELECT id FROM estar_submissions WHERE organization_id=$1', [ORG])).rows).toEqual([]);
  });

  it('reads only current admitted projects, retains unbound records and refuses malformed scopes', async () => {
    const list = await get('/submissions');
    expect(list.status, JSON.stringify(list.body)).toBe(200);
    expect(list.body.submissions.map((row: { id: string }) => row.id)).toEqual(expect.arrayContaining([ownFiling, unboundFiling]));
    expect(list.body.submissions.map((row: { id: string }) => row.id)).not.toEqual(expect.arrayContaining([privateFiling]));
    for (const id of [privateFiling, foreignFiling]) expect((await get(`/submissions/${id}`)).status).toBe(404);
    expect((await get(`/submissions/${ownFiling}`)).body.id).toBe(ownFiling);
    for (const filter of ['nope', '-1', '0', '1.5', '']) expect((await get(`/submissions?projectId=${filter}`)).status).toBe(400);
    for (const filter of ['nope', '', 'draft&status=withdrawn']) expect((await get(`/submissions?status=${filter}`)).status).toBe(400);
  });

  it('refuses private/foreign project writes and preserves the business refusal without an audit warning', async () => {
    for (const projectId of [privateProject, foreignProject]) {
      const response = await post('/submissions', { catalogKey: '510k', projectId });
      expect(response.status).toBe(404); expect(response.body.meta).toBeUndefined();
    }
    const response = await patch(privateFiling, { status: 'withdrawn' });
    expect(response.status).toBe(404);
    expect((await owner.query('SELECT status FROM estar_submissions WHERE id=$1', [privateFiling])).rows[0].status).toBe('draft');
    const invalid = await post('/submissions', { catalogKey: 'not-real', projectId: ownProject });
    expect(invalid.status).toBe(400); expect(invalid.body.meta).toBeUndefined();
  });

  it('registration create/update and tracker creation return real chained audit rows', async () => {
    const registered = await put({ fdaEsgAccount: true });
    expect(registered.status, JSON.stringify(registered.body)).toBe(200);
    expect(registered.body.meta.auditTrail).toEqual({ persisted: true, chained: true });
    const updated = await put({ cdrhPortalAccount: true });
    expect(updated.body.registration.id).toBe(registered.body.registration.id);
    expect(updated.body.meta.auditTrail).toEqual({ persisted: true, chained: true });
    const created = await post('/submissions', { catalogKey: '510k', projectId: ownProject, title: `${PREFIX} ${randomUUID()}` });
    expect(created.status, JSON.stringify(created.body)).toBe(201);
    expect(created.body).toMatchObject({ projectId: ownProject, status: 'draft', meta: { auditTrail: { persisted: true, chained: true } } });
    const rows = (await owner.query(`SELECT action,record_id,sha256_chain FROM audit_logs
      WHERE tenant_id=$1 AND record_id=ANY($2::text[]) ORDER BY id`, [ORG, [registered.body.registration.id, created.body.id]])).rows;
    expect(rows.some(row => row.action === 'ESTAR_REGISTRATION_UPDATED')).toBe(true);
    expect(rows.some(row => row.action === 'ESTAR_SUBMISSION_CREATED')).toBe(true);
    expect(rows.every(row => /^[a-f0-9]{64}$/.test(row.sha256_chain))).toBe(true);
  });

  it.each(['audit-refusal', 'audit-throw'] as const)('a %s preserves a completed tracker write and exposes only the bounded actual outcome', async failure => {
    control = failure;
    const response = await post('/submissions', { catalogKey: '510k', projectId: ownProject });
    control = 'none';
    expect(response.status, JSON.stringify(response.body)).toBe(201);
    expect(response.body.meta.auditTrail).toMatchObject({ persisted: false, code: 'AUDIT_ROW_NOT_PERSISTED' });
    expect(JSON.stringify(response.body)).not.toMatch(/private audit sink|permission denied|row-level security/i);
    expect((await owner.query('SELECT status FROM estar_submissions WHERE id=$1', [response.body.id])).rows[0].status).toBe('draft');
    expect((await owner.query('SELECT id FROM audit_logs WHERE tenant_id=$1 AND record_id=$2', [ORG, response.body.id])).rows).toEqual([]);
    const recovery = await patch(response.body.id, { status: 'withdrawn' });
    expect(recovery.status).toBe(200);
    expect(recovery.body.meta.auditTrail).toEqual({ persisted: true, chained: true });
  });

  it.each(['viewer', 'remove-member', 'inactive'] as const)('rechecks %s after genuine admission before writing', async changed => {
    control = changed;
    const response = await post('/submissions', { catalogKey: '510k', projectId: ownProject });
    control = 'none'; await membership();
    expect(response.status, JSON.stringify(response.body)).toBe(changed === 'viewer' ? 403 : 401);
    expect(response.body.meta).toBeUndefined();
  });

  it('keeps unsigned filing refused before any filing state or signature is recorded', async () => {
    const response = await patch(ownFiling, { status: 'filed' });
    expect(response.status).toBe(400);
    expect((await owner.query('SELECT status,filed_at FROM estar_submissions WHERE id=$1', [ownFiling])).rows[0]).toEqual({ status: 'draft', filed_at: null });
  });

});

describe('native tracked-filing concurrency', () => {
  it('serializes two actual concurrent nonsigned transitions with one audit and one stale-state refusal', async () => {
    const created = await post('/submissions', { catalogKey: '510k', projectId: ownProject });
    expect(created.status).toBe(201);
    const id = String(created.body.id);
    const shared = (await import('../../server/db/runtime')).getPool();
    const original = shared.query;
    let arrivals = 0;
    let release: () => void = () => undefined;
    let timer: ReturnType<typeof setTimeout>;
    const barrier = new Promise<void>((resolve, reject) => {
      release = resolve;
      timer = setTimeout(() => reject(new Error('Both real transition UPDATEs did not reach the barrier.')), 5000);
    });
    shared.query = ((...args: unknown[]) => {
      const first = args[0];
      const text = typeof first === 'string' ? first : first && typeof first === 'object' && 'text' in first ? String(first.text) : '';
      const values = Array.isArray(args[1]) ? args[1] : first && typeof first === 'object' && 'values' in first ? first.values : [];
      if (/update\s+"?estar_submissions"?/i.test(text) && Array.isArray(values) && values.includes(id)) {
        if (++arrivals === 2) release();
        return barrier.then(() => Reflect.apply(original, shared, args));
      }
      return Reflect.apply(original, shared, args);
    }) as typeof shared.query;
    let responses: request.Response[];
    try { responses = await Promise.all([patch(id, { status: 'withdrawn' }), patch(id, { status: 'withdrawn' })]); }
    finally { shared.query = original; clearTimeout(timer!); }
    expect(arrivals).toBe(2);
    expect(responses.map(response => response.status).sort()).toEqual([200, 409]);
    expect(responses.find(response => response.status === 409)?.body).toMatchObject({ error: 'STATE_CHANGED' });
    expect((await owner.query('SELECT status FROM estar_submissions WHERE id=$1', [id])).rows[0].status).toBe('withdrawn');
    expect((await owner.query("SELECT id FROM audit_logs WHERE tenant_id=$1 AND record_id=$2 AND action='ESTAR_SUBMISSION_ADVANCED'", [ORG, id])).rows).toHaveLength(1);
  });

});

describe('native technical-file assembly audit and final delivery gate', () => {
  it('delivers actual native technical-file bytes and exposes a failed assembly audit after the final export is audited', async () => {
    control = 'assembly-audit-refusal';
    const response = await request(app).post(`/api/submissions/programs/${technicalProgram}/technical-file/export`)
      .set('Authorization', `Bearer ${token}`).send({ regulation: 'mdr' });
    control = 'none';
    expect(response.status, JSON.stringify(response.body)).toBe(200);
    expect(response.body).toMatchObject({ ok: true, ready: false, fileCount: 1, governed: false,
      meta: { auditTrail: { persisted: false, code: 'AUDIT_ROW_NOT_PERSISTED' } } });
    const zip = await JSZip.loadAsync(Buffer.from(response.body.downloadable_output_ref.data, 'base64'));
    expect(zip.file('manifest.json')).not.toBeNull();
    const audits = (await owner.query(`SELECT action FROM audit_logs WHERE tenant_id=$1 AND record_id=$2`, [ORG, technicalProgram])).rows;
    expect(audits.some(row => row.action === 'EXPORT_GENERATED')).toBe(true);
    expect(audits.some(row => row.action === 'DEVICE_TECHNICAL_FILE_ASSEMBLED')).toBe(false);
  });

  it('refuses native delivery when its final export audit is unavailable and recovers without relaxing that gate', async () => {
    control = 'audit-refusal';
    const response = await request(app).post(`/api/submissions/programs/${technicalProgram}/technical-file/export`)
      .set('Authorization', `Bearer ${token}`).send({ regulation: 'mdr' });
    control = 'none';
    expect(response.status).toBe(500);
    expect(response.body.downloadable_output_ref).toBeUndefined();
    expect(response.body.meta).toBeUndefined();
    const recovery = await request(app).post(`/api/submissions/programs/${technicalProgram}/technical-file/export`)
      .set('Authorization', `Bearer ${token}`).send({ regulation: 'mdr' });
    expect(recovery.status, JSON.stringify(recovery.body)).toBe(200);
    expect(recovery.body.meta.auditTrail).toEqual({ persisted: true, chained: true });
  });
});
