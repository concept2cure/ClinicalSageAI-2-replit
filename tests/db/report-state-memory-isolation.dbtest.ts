/** Real JWT, application-role SQL and pgvector readers on the deployed schema.
 * The reserved manifest is inserted directly: production ReportOS generation is
 * qualified separately. All synthetic records and original bytes are retained.
 * Only the embedding provider boundary uses a deterministic local vector. */
import { randomUUID } from 'node:crypto';
import express from 'express';
import request from 'supertest';
import jwt from 'jsonwebtoken';
import { Pool } from 'pg';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { databaseUrl } from '../setup.db';
import { shouldUseSsl } from '../../server/db/ssl';
import { requestPgClient } from '../../server/db/requestDb';
import { getTenantScope, runWithTenantScope } from '../../server/db/tenantStore';

const local = vi.hoisted(() => ({
  vector: [1, ...Array<number>(1535).fill(0)],
  calls: vi.fn(),
}));
vi.mock('../../server/services/enhancedEmbeddingService.js', async importOriginal => ({
  ...await importOriginal<typeof import('../../server/services/enhancedEmbeddingService')>(),
  getEmbeddingService: () => ({
    embed: async (query: string, model: string) => {
      local.calls(query, model);
      return { embedding: local.vector, model, tokens: 1 };
    },
  }),
}));

const tag = `native-report-memory-${randomUUID().slice(0, 10)}`;
const secretSource = `${tag}-private-assessment`;
const titles = { legacy: `${tag}-legacy`, pdf: `${tag}-pdf`, reserved: `${tag}-reserved` };
const ordinary = ['Ordinary public project knowledge', 'Read from a public project PDF'];
let owner: Pool, runtime: Pool, app: express.Express;
let org: number, orgUuid: string, readerId: number, privateOwnerId: number;
let publicProject: number, privateProject: number, profileId: number, token: string;
let manifest: Record<string, unknown>;
let memory: typeof import('../../server/services/client-intelligence-memory');
let intelligence: typeof import('../../server/services/intelligence/project-intelligence-service');
const previousRouter = process.env.MEMORY_RAG_ROUTER;
const within = <T>(body: () => T): T => runWithTenantScope({
  tenantId: String(org), orgUuid, role: 'member', source: 'test', caller: tag,
}, body);
const get = (path: string) => request(app).get(path).set('Authorization', `Bearer ${token}`);
function excludesManifest(value: unknown): void {
  expect(JSON.stringify(value)).not.toContain(secretSource);
  expect(JSON.stringify(value)).not.toContain(titles.reserved);
  expect(JSON.stringify(value)).not.toContain('report_os_state');
}

async function actor(label: string): Promise<number> {
  const id = Number((await owner.query(`INSERT INTO users(email,name,password_hash,status,default_organization_id)
    VALUES($1,$2,'unused-synthetic-password-hash','active',$3) RETURNING id`,
  [`${tag}-${label}@example.invalid`, `${tag}-${label}`, org])).rows[0].id);
  await owner.query("INSERT INTO organization_users(organization_id,user_id,role,created_at) VALUES($1,$2,'member',now()-interval '1 day')", [org, id]);
  return id;
}
async function project(label: string, leadId: number, visibility: string): Promise<number> {
  const programId = randomUUID();
  const workspaceId = (await owner.query('INSERT INTO client_workspaces(organization_id,name,slug) VALUES($1,$2,$2) RETURNING id', [org, `${tag}-${label}`])).rows[0].id;
  await owner.query(`INSERT INTO regulatory_programs(id,organization_id,name,code,program_type,product_type,primary_agency,product_name,lead_user_id,status)
    VALUES($1,$2,$3::text,$3::text,'IND','small_molecule','FDA',$3::text,$4,'active')`, [programId, org, `${tag}-${label}`, leadId]);
  const id = Number((await owner.query(`INSERT INTO projects(organization_id,client_workspace_id,name,type,status,owner_id,created_by_id,regulatory_program_id,settings)
    VALUES($1,$2,$3,'program','active',$4,$4,$5,$6::json) RETURNING id`,
  [org, workspaceId, `${tag}-${label}`, leadId, programId, JSON.stringify({ projectSharing: { visibility, members: [] } })])).rows[0].id);
  await owner.query('INSERT INTO project_visibility_settings(organization_id,project_id,visibility) VALUES($1,$2,$3)', [org, id, visibility]);
  return id;
}

beforeAll(async () => {
  if (!process.env.APP_DATABASE_URL) throw new Error('A provisioned restricted application role is required.');
  owner = new Pool({ connectionString: databaseUrl, max: 2 });
  const organization = (await owner.query("INSERT INTO organizations(name,slug,status) VALUES($1,$1,'active') RETURNING id,uuid", [tag])).rows[0];
  org = Number(organization.id); orgUuid = organization.uuid;
  readerId = await actor('reader'); privateOwnerId = await actor('private-owner');
  publicProject = await project('public', readerId, 'org');
  privateProject = await project('private', privateOwnerId, 'private');
  profileId = Number((await owner.query(`INSERT INTO project_intelligence_profiles(project_id,organization_id,profile_status)
    VALUES($1,$2,'active') RETURNING id`, [publicProject, org])).rows[0].id);
  manifest = {
    bundleId: `${tag}-mixed-account-bundle`, organizationId: org,
    projectIds: [publicProject, privateProject],
    items: [{ runId: secretSource, reportType: 'account-calendar', accessProjectIds: [publicProject, privateProject] }],
  };
  // The reserved record wins both recency and cosine rank without the filter.
  const records = [
    [titles.legacy, null, ordinary[0], '2026-10-16', [0.8, 0.6]],
    [titles.pdf, 'application/pdf', ordinary[1], '2026-10-17', [0.99, 0.1]],
    [titles.reserved, 'report_os_state', JSON.stringify(manifest), '2026-10-18', [1, 0]],
  ] as const;
  for (const [title, source, content, date, vector] of records) {
    const embedding = JSON.stringify([...vector, ...Array<number>(1534).fill(0)]);
    await owner.query(`INSERT INTO project_memory_entries(project_profile_id,project_id,organization_id,category,title,content,
      status,source_document_type,importance_level,confidence_score,embedding,created_at,updated_at)
      VALUES($1,$2,$3,'regulatory',$4,$5,'active',$6,'high',NULL,$7::vector,$8,$8)`,
    [profileId, publicProject, org, title, content, source, embedding, date]);
  }
  const { activeJwtSecret } = await import('../../server/utils/jwtVerify');
  token = jwt.sign({ type: 'access', userId: readerId, organizationId: String(org), role: 'member' }, activeJwtSecret(), { expiresIn: '15m' });
  const { authMiddleware } = await import('../../server/auth');
  const { readCurrentProgramActor } = await import('../../server/services/c2c/current-program-access');
  const { canAccessReportProject } = await import('../../server/services/report-os/project-access');
  runtime = (await import('../../server/db/runtime')).getPool();
  memory = await import('../../server/services/client-intelligence-memory');
  intelligence = await import('../../server/services/intelligence/project-intelligence-service');
  app = express(); app.use(express.json());
  app.get('/native-report-memory-scope', authMiddleware, async (req, res) => {
    const q = requestPgClient(req);
    const identity = (await q.query(`SELECT current_user AS role,rolsuper,rolbypassrls,
      current_setting('app.rls_enforce',true) AS enforcement,(SELECT ssl FROM pg_stat_ssl WHERE pid=pg_backend_pid()) AS tls
      FROM pg_roles WHERE rolname=current_user`)).rows[0];
    const actor = await readCurrentProgramActor(q, { organizationId: org, userId: readerId });
    res.json({ ...identity, tenant: getTenantScope()?.tenantId,
      publicAllowed: await canAccessReportProject(org, actor, publicProject, q),
      privateAllowed: await canAccessReportProject(org, actor, privateProject, q) });
  });
  app.use('/api/client-intelligence', authMiddleware, (await import('../../server/routes/client-intelligence')).default);
  app.use('/api/ana', (await import('../../server/routes/ana-features')).default);
});
afterAll(async () => {
  if (previousRouter === undefined) delete process.env.MEMORY_RAG_ROUTER;
  else process.env.MEMORY_RAG_ROUTER = previousRouter;
  vi.restoreAllMocks(); await runtime?.end(); await owner?.end();
});

describe('reserved ReportOS state stays outside generic native memory readers', () => {
  it('proves actual JWT tenant scope, restricted role, configured transport and a denied private source', async () => {
    const result = await get('/native-report-memory-scope');
    expect(result.status, JSON.stringify(result.body)).toBe(200);
    expect(result.body).toMatchObject({ role: 'app_service', rolsuper: false, rolbypassrls: false,
      enforcement: 'on', tls: shouldUseSsl(process.env.APP_DATABASE_URL), tenant: String(org), publicAllowed: true, privateAllowed: false });
  });
  it('filters before direct raw limits and counts while preserving ordinary NULL/PDF sources', async () => {
    const first = await within(() => memory.getProjectMemoryEntries(profileId, { limit: 1 }));
    expect(first.totalCount).toBe(2); expect(first.entries.map(row => row.title)).toEqual([titles.pdf]);
    const all = await within(() => memory.getProjectMemoryEntries(profileId));
    expect(all.entries.map(row => row.sourceDocumentType)).toEqual(['application/pdf', null]); excludesManifest(all);
  });
  it('returns ordinary memories and the filtered total from the actual mounted memory endpoint', async () => {
    const result = await get(`/api/client-intelligence/project/${publicProject}/memory`);
    expect(result.status, JSON.stringify(result.body)).toBe(200); expect(result.body.totalCount).toBe(2);
    expect(result.body.entries.map((row: { title: string }) => row.title)).toEqual([titles.pdf, titles.legacy]); excludesManifest(result.body);
  });
  it('filters the shared pool before its limit and refuses a search matching only private manifest bytes', async () => {
    const first = await get(`/api/client-intelligence/memory/shared-pool?projectId=${publicProject}&limit=1`);
    expect(first.status, JSON.stringify(first.body)).toBe(200);
    expect(first.body.entries.map((row: { title: string }) => row.title)).toEqual([titles.pdf]); excludesManifest(first.body);
    const queried = await get(`/api/client-intelligence/memory/shared-pool?projectId=${publicProject}&query=${encodeURIComponent(secretSource)}`);
    expect(queried.status).toBe(200); expect(queried.body.entries).toEqual([]); expect(queried.body.totalCount).toBe(0);
  });
  it('builds the mounted project prompt exclusively from ordinary memories', async () => {
    const result = await get(`/api/client-intelligence/project/${publicProject}/context`);
    expect(result.status, JSON.stringify(result.body)).toBe(200);
    for (const content of ordinary) expect(result.body.context).toContain(content);
    excludesManifest(result.body);
  });
  it('keeps summary counts and the secondary intelligence reader consistent', async () => {
    const summary = await within(() => intelligence.getProjectIntelligence(publicProject, org));
    expect(summary?.memoryEntryCount).toBe(2);
    const rows = await within(() => intelligence.getProjectMemory(publicProject, org, { limit: 1 }));
    expect(rows.map(row => row.title)).toEqual([titles.pdf]); excludesManifest(rows);
  });
  it('filters the actual mounted intelligence feed before pagination and source metadata rendering', async () => {
    const result = await get('/api/ana/intelligence-feed?limit=1');
    expect(result.status, JSON.stringify(result.body)).toBe(200);
    expect(result.body.pagination.total).toBe(2);
    expect(result.body.items.map((row: { title: string }) => row.title)).toEqual([titles.pdf]); excludesManifest(result.body);
  });
  it.each(['router', 'legacy'])('filters before native pgvector ranking on the %s semantic path', async mode => {
    if (mode === 'legacy') process.env.MEMORY_RAG_ROUTER = 'legacy';
    else delete process.env.MEMORY_RAG_ROUTER;
    const previousCalls = local.calls.mock.calls.length;
    const result = await get(`/api/client-intelligence/project/${publicProject}/memory/semantic-search?query=retained%20project%20knowledge&limit=1&minSimilarity=0.7`);
    expect(result.status, JSON.stringify(result.body)).toBe(200);
    expect(local.calls.mock.calls.length).toBeGreaterThan(previousCalls);
    expect(result.body.entries.map((row: { title: string }) => row.title)).toEqual([titles.pdf]); excludesManifest(result.body);
    expect(result.body.entries[0].similarity).toBeGreaterThan(0.99);
  });
  it('retains the complete reserved manifest and all three original embedded rows', async () => {
    const rows = (await owner.query(`SELECT content,source_document_type,embedding IS NOT NULL AS embedded
      FROM project_memory_entries WHERE organization_id=$1 AND project_profile_id=$2 ORDER BY created_at`, [org, profileId])).rows;
    expect(rows).toHaveLength(3); expect(rows.every(row => row.embedded)).toBe(true);
    expect(rows.map(row => row.source_document_type)).toEqual([null, 'application/pdf', 'report_os_state']);
    expect(JSON.parse(rows[2].content)).toEqual(manifest);
  });
});
