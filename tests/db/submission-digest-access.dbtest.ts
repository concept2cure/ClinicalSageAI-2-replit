/** Actual JWT/request SQL/native RLS recipient receipts. Fresh synthetic records
 * and their audit history remain retained; no provider or digest generator runs. */
import { randomUUID } from 'node:crypto';
import express from 'express';
import request from 'supertest';
import jwt from 'jsonwebtoken';
import { Pool, type PoolClient } from 'pg';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { databaseUrl } from '../setup.db';
import { shouldUseSsl } from '../../server/db/ssl';
import { requestPgClient } from '../../server/db/requestDb';
import { getTenantScope } from '../../server/db/tenantStore';

const tag = `native-digest-${randomUUID().slice(0, 12)}`;
type Actor = { id: number; token: string };
type Observation = { pid: number; statements: string[]; evicted: boolean };
let owner: Pool, runtime: Pool, app: express.Express, org: number, project: number;
let reader: Actor, viewer: Actor, other: Actor, revoked: Actor;
let privateProject: number;
let fault: 'none' | 'audit' | 'before' | 'after' = 'none';
const observations: Observation[] = [];
const digest = (label: string) => `${tag}-${label}`;
const get = (by = reader, suffix = '') => request(app).get(`/api/submission-ops/digests${suffix}`).set('Authorization', `Bearer ${by.token}`);
const mark = (label: string, by = reader) => request(app).post(`/api/submission-ops/digests/${digest(label)}/read`).set('Authorization', `Bearer ${by.token}`);

function instrument(client: PoolClient): PoolClient {
  const query = client.query.bind(client), release = client.release.bind(client);
  const observation = { pid: Number((client as unknown as { processID: number }).processID), statements: [] as string[], evicted: false };
  let writing = false;
  client.query = (async (...args: unknown[]) => {
    const input = args[0];
    const text = typeof input === 'string' ? input : input && typeof input === 'object' && 'text' in input ? String(input.text) : '';
    observation.statements.push(text.trim());
    if (/UPDATE\s+"?c2c_digests"?/i.test(text)) { writing = true; observations.push(observation); }
    if (writing && fault === 'audit' && /INSERT INTO audit_logs/i.test(text)) return query('SELECT 1/0');
    if (writing && ['before', 'after'].includes(fault) && /^COMMIT$/i.test(text.trim())) {
      if (fault === 'after') await Reflect.apply(query, client, args);
      throw new Error('Synthetic digest COMMIT acknowledgement loss');
    }
    return Reflect.apply(query, client, args);
  }) as typeof client.query;
  client.release = ((error?: Error | boolean) => {
    observation.evicted ||= Boolean(error); client.query = query as typeof client.query; client.release = release; release(error);
  }) as typeof client.release;
  return client;
}

async function actor(label: string, role = 'member'): Promise<Actor> {
  const id = Number((await owner.query(`INSERT INTO users(email,name,password_hash,status,default_organization_id)
    VALUES($1,$2,'unused-synthetic-password-hash','active',$3) RETURNING id`, [`${tag}-${label}@example.invalid`, `${tag}-${label}`, org])).rows[0].id);
  await owner.query("INSERT INTO organization_users(organization_id,user_id,role,created_at) VALUES($1,$2,$3,now()-interval '1 day')", [org, id, role]);
  const { activeJwtSecret } = await import('../../server/utils/jwtVerify');
  return { id, token: jwt.sign({ type: 'access', userId: id, organizationId: String(org), role: 'admin' }, activeJwtSecret(), { expiresIn: '15m' }) };
}
async function anchor(label: string, lead: Actor, visibility: string): Promise<number> {
  const program = randomUUID();
  const workspace = (await owner.query('INSERT INTO client_workspaces(organization_id,name,slug) VALUES($1,$2,$2) RETURNING id', [org, `${tag}-${label}`])).rows[0].id;
  await owner.query(`INSERT INTO regulatory_programs(id,organization_id,name,code,program_type,product_type,primary_agency,product_name,lead_user_id,status)
    VALUES($1,$2,$3::text,$3::text,'IND','small_molecule','FDA',$3::text,$4,'active')`, [program, org, `${tag}-${label}`, lead.id]);
  const id = Number((await owner.query(`INSERT INTO projects(organization_id,client_workspace_id,name,type,status,owner_id,created_by_id,regulatory_program_id,settings)
    VALUES($1,$2,$3,'program','active',$4,$4,$5,$6::json) RETURNING id`, [org, workspace, tag, lead.id, program, JSON.stringify({ projectSharing: { visibility, members: [] } })])).rows[0].id);
  await owner.query('INSERT INTO project_visibility_settings(organization_id,project_id,visibility) VALUES($1,$2,$3)', [org, id, visibility]);
  return id;
}
async function seed(label: string, recipient = reader, parent = project): Promise<void> {
  await owner.query(`INSERT INTO c2c_digests(digest_id,org_id,project_id,digest_type,recipient_user_id,title,sections,status)
    VALUES($1,$2,$3,'daily',$4,$5,$6::json,'generated')`, [digest(label), org, parent, recipient.id, `Invented retained digest ${label}`, JSON.stringify([{ heading: 'Invented regulatory tasks', body: tag }])]);
}
async function stored(label: string) {
  return (await owner.query(`SELECT status,read_at,xmin::text AS tx FROM c2c_digests WHERE digest_id=$1 AND org_id=$2`, [digest(label), org])).rows[0];
}
async function audits(label: string) {
  return (await owner.query(`SELECT id,xmin::text AS tx,hmac_seal FROM audit_logs WHERE tenant_id=$1
    AND record_id=$2 AND action='submission_digest_read'`, [org, digest(label)])).rows;
}

beforeAll(async () => {
  if (!process.env.APP_DATABASE_URL) throw new Error('A provisioned restricted application role is required.');
  owner = new Pool({ connectionString: databaseUrl, max: 2 });
  org = Number((await owner.query("INSERT INTO organizations(name,slug,status) VALUES($1,$1,'active') RETURNING id", [tag])).rows[0].id);
  reader = await actor('reader'); viewer = await actor('viewer', 'viewer'); other = await actor('other'); revoked = await actor('revoked');
  project = await anchor('shared', reader, 'org'); privateProject = await anchor('private', other, 'private');
  for (const label of ['own', 'audit-failure', 'before', 'after']) await seed(label);
  await seed('other', other); await seed('private', reader, privateProject); await seed('viewer', viewer); await seed('revoked', revoked);
  const { authMiddleware } = await import('../../server/auth');
  runtime = (await import('../../server/db/runtime')).getPool();
  const connect = runtime.connect.bind(runtime);
  vi.spyOn(runtime, 'connect').mockImplementation((async (...args: unknown[]) => instrument(await Reflect.apply(connect, runtime, args))) as typeof runtime.connect);
  app = express(); app.use(express.json());
  app.get('/native-digest-scope', authMiddleware, async (req, res) => {
    const identity = (await requestPgClient(req).query(`SELECT current_user AS role,rolsuper,rolbypassrls,
      current_setting('app.rls_enforce',true) AS enforcement,(SELECT ssl FROM pg_stat_ssl WHERE pid=pg_backend_pid()) AS tls
      FROM pg_roles WHERE rolname=current_user`)).rows[0];
    res.json({ ...identity, tenant: getTenantScope()?.tenantId });
  });
  app.use('/api/submission-ops', authMiddleware, (await import('../../server/routes/submission-ops')).default);
});
afterAll(async () => { fault = 'none'; vi.restoreAllMocks(); await runtime?.end(); await owner?.end(); });

describe('retained digest recipient admission on the actual deployed schema', () => {
  it('uses authenticated tenant scope, restricted role, configured transport and enforced RLS', async () => {
    const result = await request(app).get('/native-digest-scope').set('Authorization', `Bearer ${reader.token}`);
    expect(result.status).toBe(200);
    expect(result.body).toMatchObject({ role: 'app_service', rolsuper: false, rolbypassrls: false, enforcement: 'on', tls: shouldUseSsl(process.env.APP_DATABASE_URL), tenant: String(org) });
  });
  it('lists only the actual recipient and admitted private parents and discloses generator unavailability', async () => {
    const result = await get(); expect(result.status, JSON.stringify(result.body)).toBe(200);
    const ids = result.body.data.map((row: { digestId: string }) => row.digestId);
    expect(ids).toContain(digest('own')); expect(ids).not.toContain(digest('other')); expect(ids).not.toContain(digest('private'));
    expect(result.body.meta.digestGeneration).toMatchObject({ status: 'unavailable', code: 'DIGEST_GENERATION_UNAVAILABLE' });
  });
  it.each(['other', 'private'])('refuses a %s recipient/parent marker without a receipt or audit', async label => {
    const result = await mark(label); expect(result.status, JSON.stringify(result.body)).toBe(404);
    expect(result.body.code).toBe('DIGEST_NOT_FOUND'); expect((await stored(label)).status).toBe('generated'); expect(await audits(label)).toEqual([]);
    expect((await get(reader, `?digestId=${encodeURIComponent(digest(label))}`)).body.data).toEqual([]);
  });
  it('conceals an unanchored private parent while its actual owner receives the repair refusal', async () => {
    const workspace = (await owner.query('INSERT INTO client_workspaces(organization_id,name,slug) VALUES($1,$2,$2) RETURNING id', [org, `${tag}-unanchored`])).rows[0].id;
    const parent = Number((await owner.query(`INSERT INTO projects(organization_id,client_workspace_id,name,type,status,owner_id,created_by_id,settings)
      VALUES($1,$2,$3,'program','active',$4,$4,$5::json) RETURNING id`, [org, workspace, tag, other.id, JSON.stringify({ projectSharing: { visibility: 'private', members: [] } })])).rows[0].id);
    await owner.query("INSERT INTO project_visibility_settings(organization_id,project_id,visibility) VALUES($1,$2,'private')", [org, parent]);
    await seed('unanchored', reader, parent);
    const hidden = await get(reader, `?projectId=${parent}`); expect(hidden.status).toBe(404); expect(hidden.body.code).toBe('DIGEST_NOT_FOUND');
    const admitted = await get(other, `?projectId=${parent}`); expect(admitted.status).toBe(409); expect(admitted.body.code).toBe('DIGEST_PROJECT_UNANCHORED');
    expect((await stored('unanchored')).status).toBe('generated'); expect(await audits('unanchored')).toEqual([]);
  });
  it('commits an own marker and its sealed audit atomically, and does not repeat the audit', async () => {
    const result = await mark('own'); expect(result.status, JSON.stringify(result.body)).toBe(200);
    expect(result.body.meta.readReceipt).toBe('marked_read'); expect(result.body.meta.auditTrail).toEqual({ persisted: true, chained: true });
    const row = await stored('own'), history = await audits('own'); expect(history).toHaveLength(1); expect(history[0].tx).toBe(row.tx); expect(history[0].hmac_seal).toBeTruthy();
    expect((await mark('own')).body.meta.readReceipt).toBe('already_read'); expect(await audits('own')).toHaveLength(1);
  });
  it('permits a current viewer to mark their own receipt without editing project content', async () => {
    const result = await mark('viewer', viewer); expect(result.status, JSON.stringify(result.body)).toBe(200); expect(result.body.meta.readReceipt).toBe('marked_read');
  });
  it('rejects a still-signed token after its current membership is removed', async () => {
    await owner.query('DELETE FROM organization_users WHERE organization_id=$1 AND user_id=$2', [org, revoked.id]);
    const result = await mark('revoked', revoked); expect([401, 403, 404]).toContain(result.status);
    expect((await stored('revoked')).status).toBe('generated'); expect(await audits('revoked')).toEqual([]);
  });
  it('rolls the marker back when actual audit SQL is refused', async () => {
    fault = 'audit'; try { const result = await mark('audit-failure'); expect(result.status).toBe(503); }
    finally { fault = 'none'; }
    expect((await stored('audit-failure')).status).toBe('generated'); expect(await audits('audit-failure')).toEqual([]);
  });
  it.each(['before', 'after'] as const)('reports %s-COMMIT lost replies without rollback or false confirmation and evicts the connection', async mode => {
    const start = observations.length; fault = mode;
    let result: request.Response;
    try { result = await mark(mode); } finally { fault = 'none'; }
    expect(result!.status, JSON.stringify(result!.body)).toBe(503); expect(result!.body.code).toBe('DIGEST_READ_COMMIT_UNCONFIRMED');
    expect(result!.body.data).toBeUndefined(); expect(result!.body.recovery).toEqual({ method: 'GET', url: `/api/submission-ops/digests?digestId=${encodeURIComponent(digest(mode))}`, digestId: digest(mode) });
    const observed = observations.slice(start).at(-1); expect(observed).toBeDefined(); expect(observed!.statements).toContain('COMMIT'); expect(observed!.statements).not.toContain('ROLLBACK');
    await vi.waitFor(() => expect(observed!.evicted).toBe(true));
    await vi.waitFor(async () => expect((await owner.query('SELECT pid FROM pg_stat_activity WHERE pid=$1', [observed!.pid])).rows).toEqual([]));
    expect((await stored(mode)).status).toBe(mode === 'after' ? 'read' : 'generated'); expect(await audits(mode)).toHaveLength(mode === 'after' ? 1 : 0);
    const readback = await get(reader, `?digestId=${encodeURIComponent(digest(mode))}`); expect(readback.status).toBe(200); expect(readback.body.data[0].status).toBe(mode === 'after' ? 'read' : 'generated');
  });
});
