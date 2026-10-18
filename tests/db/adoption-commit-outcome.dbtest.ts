/** Real JWT, request ALS, app_service/FORCE policies and capture/audit commits.
 * Faults replace only COMMIT acknowledgements; no schema or retained rows change. */
import { randomUUID, createHash } from 'node:crypto';
import { promises as fs } from 'node:fs';
import path from 'node:path';
import express from 'express';
import request from 'supertest';
import jwt from 'jsonwebtoken';
import bcrypt from 'bcryptjs';
import { Pool, type PoolClient } from 'pg';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { databaseUrl } from '../setup.db';
import { requestPgClient } from '../../server/db/requestDb';
import { getTenantScope } from '../../server/db/tenantStore';
import { shouldUseSsl } from '../../server/db/ssl';

const processing = vi.hoisted(() => vi.fn(async () => ({ ok: true, processed: true, status: 'completed' })));
vi.mock('../../server/services/clinical-regulatory-evidence/data-room-processing.js', () => ({ processCapturedSource: processing }));
const tag = `syn_adopt_${randomUUID()}`;
let owner: Pool;
let runtime: Pool;
let app: express.Express;
let organizationId: number;
let userId: number;
let programId: string;
let token: string;
let fault: 'none' | 'before' | 'after' = 'none';
const observations: Array<{ pid: number; statements: string[]; evicted: boolean }> = [];
const sha = (text: string) => createHash('sha256').update(text).digest('hex');

function instrument(client: PoolClient): PoolClient {
  const query = client.query.bind(client);
  const release = client.release.bind(client);
  const observation = { pid: Number((client as unknown as { processID: number }).processID), statements: [] as string[], evicted: false };
  let capture = false;
  client.query = (async (...args: unknown[]) => {
    const text = typeof args[0] === 'string' ? args[0] : '';
    observation.statements.push(text.trim());
    if (/INSERT INTO cre_evidence_sources/i.test(text)) { capture = true; observations.push(observation); }
    if (capture && fault !== 'none' && /^COMMIT$/i.test(text.trim())) {
      if (fault === 'after') await Reflect.apply(query, client, args);
      throw new Error('Private synthetic capture COMMIT acknowledgement loss');
    }
    return Reflect.apply(query, client, args);
  }) as typeof client.query;
  client.release = ((error?: Error | boolean) => {
    observation.evicted ||= Boolean(error); client.query = query as typeof client.query; client.release = release; release(error);
  }) as typeof client.release;
  return client;
}

async function seedActorAndProject() {
  const org = (await owner.query("INSERT INTO organizations(name,slug,status) VALUES($1,$1,'active') RETURNING id", [tag])).rows[0];
  organizationId = Number(org.id);
  const password = await bcrypt.hash('Synthetic-adoption-only!', 4);
  userId = Number((await owner.query("INSERT INTO users(email,name,status,password_hash) VALUES($1,'Synthetic adoption actor','active',$2) RETURNING id", [`${tag}@example.invalid`, password])).rows[0].id);
  await owner.query("INSERT INTO organization_users(organization_id,user_id,role,created_at) VALUES($1,$2,'member',now()-interval '1 day')", [organizationId, userId]);
  programId = String((await owner.query(`INSERT INTO regulatory_programs(organization_id,name,code,program_type,product_type,primary_agency,product_name,lead_user_id)
    VALUES($1,$2::text,$2::text,'ind','small_molecule','FDA','Synthetic study',$3) RETURNING id`, [organizationId, tag, userId])).rows[0].id);
  const workspaceId = Number((await owner.query("INSERT INTO client_workspaces(organization_id,name,slug,status,created_by_id) VALUES($1,$2::text,$2::text,'active',$3) RETURNING id", [organizationId, tag, userId])).rows[0].id);
  const projectId = Number((await owner.query(`INSERT INTO projects(organization_id,client_workspace_id,name,type,status,owner_id,created_by_id,regulatory_program_id,settings)
    VALUES($1,$2,$3,'regulatory','active',$4,$4,$5,'{}') RETURNING id`, [organizationId, workspaceId, tag, userId, programId])).rows[0].id);
  await owner.query("INSERT INTO project_visibility_settings(organization_id,project_id,visibility) VALUES($1,$2,'private')", [organizationId, projectId]);
}

async function upload(suffix: string) {
  const fileId = `${tag}_${suffix}`;
  const body = `Synthetic controlled source ${suffix} ${randomUUID()}`;
  const relative = `uploads/org-${organizationId}/${fileId}`;
  const absolute = path.resolve(process.cwd(), relative);
  await fs.mkdir(path.dirname(absolute), { recursive: true }); await fs.writeFile(absolute, body);
  await owner.query(`INSERT INTO file_uploads(id,user_id,organization_id,original_name,mime_type,file_size,storage_path,checksum_sha256,status)
    VALUES($1,$2,$3,'Synthetic study.txt','text/plain',$4,$5,$6,'uploaded')`, [fileId, userId, organizationId, Buffer.byteLength(body), relative, sha(body)]);
  return fileId;
}
const adopt = (fileId: string) => request(app).post(`/api/c2c/projects/${programId}/adopt`).set('Authorization', `Bearer ${token}`).send({ fileUploadId: fileId });

beforeAll(async () => {
  const target = new URL(databaseUrl);
  if (!['c2c_audit_remedies', 'concept2cure-ri_dbtest', 'c2c_audit_oct17_final_tls'].includes(target.pathname.slice(1)) || !process.env.APP_DATABASE_URL) throw new Error('Use the declared disposable audit database and restricted application role.');
  owner = new Pool({ connectionString: databaseUrl, max: 2 });
  await seedActorAndProject();
  const { activeJwtSecret } = await import('../../server/utils/jwtVerify');
  token = jwt.sign({ type: 'access', userId, organizationId: String(organizationId), role: 'member' }, activeJwtSecret(), { expiresIn: '1h' });
  const { authMiddleware } = await import('../../server/auth');
  runtime = (await import('../../server/db')).pool;
  const connect = runtime.connect.bind(runtime);
  vi.spyOn(runtime, 'connect').mockImplementation((async (...args: unknown[]) => instrument(await Reflect.apply(connect, runtime, args))) as typeof runtime.connect);
  app = express(); app.use(express.json());
  app.get('/native-adoption-scope', authMiddleware, async (req, res) => {
    const row = (await requestPgClient(req).query(`SELECT current_user AS role,rolsuper,rolbypassrls,
      current_setting('app.rls_enforce',true) AS enforcement,
      (SELECT ssl FROM pg_stat_ssl WHERE pid=pg_backend_pid()) AS tls FROM pg_roles WHERE rolname=current_user`)).rows[0];
    res.json({ ...row, tenant: getTenantScope()?.tenantId });
  });
  app.use('/api/c2c/projects', authMiddleware, (await import('../../server/routes/c2c/projects')).default);
});
// Retained captures must retain their source bytes as well as database history.
afterAll(async () => { vi.restoreAllMocks(); await owner?.end(); await runtime?.end(); });

describe('capture COMMIT recovery on the actual registered schema', () => {
  it('uses genuine authenticated tenant scope, a restricted role, and the configured transport', async () => {
    const response = await request(app).get('/native-adoption-scope').set('Authorization', `Bearer ${token}`);
    expect(response.status, JSON.stringify(response.body)).toBe(200);
    expect(response.body).toMatchObject({ role: 'app_service', rolsuper: false, rolbypassrls: false, enforcement: 'on', tenant: String(organizationId) });
    // Local CI may use plaintext; explicit TLS URLs and production must use TLS.
    expect(response.body.tls).toBe(shouldUseSsl(process.env.APP_DATABASE_URL));
  });

  it('confirms capture and its paired canonical audits before downstream processing', async () => {
    fault = 'none'; const fileId = await upload('healthy');
    const response = await adopt(fileId); expect(response.status, JSON.stringify(response.body)).toBe(201);
    expect(response.body).toMatchObject({ adopted: true, processed: true });
    const source = (await owner.query("SELECT id,xmin::text AS tx FROM cre_evidence_sources WHERE organization_id=$1 AND provenance->>'fileUploadId'=$2", [organizationId, fileId])).rows[0];
    const audits = (await owner.query("SELECT action,xmin::text AS tx,hmac_seal FROM audit_logs WHERE tenant_id=$1 AND new_values::text LIKE $2", [organizationId, `%${fileId}%`])).rows;
    expect(audits.map(row => row.action).sort()).toEqual(['c2c.project.adopt', 'data_room.capture']);
    expect(audits.every(row => row.tx === source.tx && row.hmac_seal)).toBe(true);
  });

  it.each(['before', 'after'] as const)('preserves real %s-COMMIT state, evicts the backend and returns authenticated readback', async timing => {
    const fileId = await upload(timing); const processedBefore = processing.mock.calls.length; fault = timing;
    const response = await adopt(fileId); fault = 'none';
    expect(response.status, JSON.stringify(response.body)).toBe(503);
    expect(response.body).toMatchObject({ adopted: null, code: 'ADOPTION_COMMIT_UNCONFIRMED', recovery: { programId, fileUploadId: fileId, method: 'GET', url: `/api/c2c/projects/${programId}/sources` } });
    expect(JSON.stringify(response.body)).not.toContain('Private synthetic');
    expect(processing.mock.calls.length).toBe(processedBefore);
    const observed = observations.at(-1)!; expect(observed.evicted).toBe(true); expect(observed.statements.at(-1)).toBe('COMMIT');
    expect(observed.statements).not.toContain('ROLLBACK');
    // Wait only for asynchronous socket close; physical disconnect rolls back an open transaction.
    for (let attempt = 0; attempt < 20; attempt++) {
      if (!(await owner.query('SELECT pid FROM pg_stat_activity WHERE pid=$1', [observed.pid])).rows.length) break;
      await new Promise(resolve => setTimeout(resolve, 25));
    }
    expect((await owner.query('SELECT pid FROM pg_stat_activity WHERE pid=$1', [observed.pid])).rows).toEqual([]);
    const captures = (await owner.query("SELECT id FROM cre_evidence_sources WHERE organization_id=$1 AND provenance->>'fileUploadId'=$2", [organizationId, fileId])).rows;
    expect(captures).toHaveLength(timing === 'after' ? 1 : 0);
    const audits = (await owner.query('SELECT action,hmac_seal FROM audit_logs WHERE tenant_id=$1 AND new_values::text LIKE $2', [organizationId, `%${fileId}%`])).rows;
    expect(audits.map(row => row.action).sort()).toEqual(timing === 'after' ? ['c2c.project.adopt', 'data_room.capture'] : []);
    expect(audits.every(row => row.hmac_seal)).toBe(true);
    const readback = await request(app).get(response.body.recovery.url).set('Authorization', `Bearer ${token}`);
    expect(readback.status, JSON.stringify(readback.body)).toBe(200);
    expect(readback.body.sources.some((row: { fileUploadId: string }) => row.fileUploadId === fileId)).toBe(timing === 'after');
    if (timing === 'after') expect(captures[0].id).toBe(response.body.sourceId);
  });
});
