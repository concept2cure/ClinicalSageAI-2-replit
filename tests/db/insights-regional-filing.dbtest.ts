/** Actual authenticated regional catalog context on native app_service/RLS.
 * Fresh invented QA rows only; no policy/auth/entitlement/source/provider mocks.
 * Preserve every fixture, sharing withdrawal, login session and audit record. */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import express from 'express';
import request from 'supertest';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { randomUUID } from 'node:crypto';
import { writeFileSync } from 'node:fs';
import { Pool, type QueryConfig, type QueryResult, type QueryResultRow } from 'pg';
import { databaseUrl } from '../setup.db';
import { getPool } from '../../server/db/runtime';
import { applySessionScope, clearSessionScope } from '../../server/db/sessionScope';
import { authenticateToken } from '../../server/middleware/auth';
import type { RequestDbClient } from '../../server/middleware/lazyRequestDbClient';

const TAG = `regional-native-${randomUUID()}`;
const NATIVE_DATABASE = new URL(databaseUrl).pathname.slice(1);
const TYPES = ['usa_fda.ind_safety_readiness', 'usa_fda.nda_bla_filing_readiness',
  'ema.maa_readiness_assessment', 'japan_pmda.jnda_shonin_readiness'] as const;
type Actor = { id: number; organizationId: number; token: string };
type Program = { id: string; projectId: number; title: string };
type RequestFacts = { metadataReads: Array<{ sql: string; params: unknown[] }>;
  posture: Record<string, unknown>; actorReadsAfterMetadata: number; metadataReturned: boolean };
const actors = {} as Record<'owner' | 'reader' | 'unassigned' | 'foreign' | 'withdrawn', Actor>;
const programs = {} as Record<'ind' | 'bla' | 'maa' | 'jnda' | 'missing' | 'conflict' | 'late', Program>;
const observations: Record<string, unknown> = { tag: TAG, scope: 'Synthetic native implementation checks only', cases: {} };
let owner: Pool;
let runtimeMutation: Pool;
let app: express.Express;
let orgId: number;
let orgUuid: string;
let workspaceId: number;
const requestFacts = new Map<string, RequestFacts>();
const metadataSql = 'SELECT metadata FROM projects WHERE id=$1 AND organization_id=$2 AND regulatory_program_id=$3';

function deferred() {
  let resolve!: () => void;
  const promise = new Promise<void>(done => { resolve = done; });
  return { promise, resolve };
}
type MetadataBarrier = { reached: ReturnType<typeof deferred>; released: ReturnType<typeof deferred> };
let activeBarrier: { requestId: string; control: MetadataBarrier } | undefined;

/** Only the selected route's Promise query ABI is observed. Every QueryConfig
 * (including Drizzle rowMode=array), parameter and complete pg result passes
 * unchanged to/from the actual request-pinned lazy client. No row is invented. */
function observedClient(actual: RequestDbClient, requestId: string, facts: RequestFacts) {
  return {
    async query<R extends QueryResultRow = QueryResultRow>(statement: string | QueryConfig<unknown[]>, params?: unknown[]): Promise<QueryResult<R>> {
      const sql = typeof statement === 'string' ? statement : statement.text;
      const result = await actual.query<R, unknown[]>(statement, params);
      if (facts.metadataReturned && /FROM organization_users|JOIN organization_users|FROM public\.actor_standing/i.test(sql)) facts.actorReadsAfterMetadata += 1;
      if (sql === metadataSql) {
        facts.metadataReads.push({ sql, params: params ?? statementValues(statement) });
        facts.metadataReturned = true;
        if (activeBarrier?.requestId === requestId) {
          const barrier = activeBarrier.control;
          barrier.reached.resolve();
          await barrier.released.promise;
        }
      }
      return result;
    },
  };
}
function statementValues(statement: string | QueryConfig<unknown[]>): unknown[] {
  return typeof statement === 'string' ? [] : statement.values ?? [];
}
const postureSql = "SELECT current_database() AS database,current_user AS role,rolsuper,rolbypassrls,current_setting('app.rls_enforce') AS enforcement,current_setting('app.current_tenant_id') AS tenant FROM pg_roles WHERE rolname=current_user";

function overview(actor: Actor, program: Program) {
  const id = randomUUID();
  const response = request(app).get(`/api/insights-canvas/overview?programId=${program.id}`)
    .set('Authorization', `Bearer ${actor.token}`).set('X-Regional-Native-Request', id);
  return { id, response };
}
function regionalRows(response: request.Response): Array<{ typeId: string; runnable: boolean; entitled: boolean; availabilityState: string; reasonCode: string | null }> {
  return response.body.data.reportTypes.filter((row: { typeId: string }) => TYPES.some(type => type === row.typeId));
}
function assertRequestContext(id: string, actor: Actor, program?: Program) {
  const facts = requestFacts.get(id);
  expect(facts).toBeDefined();
  expect(facts!.posture).toMatchObject({ database: NATIVE_DATABASE, role: 'app_service', rolsuper: false, rolbypassrls: false,
    enforcement: 'on', tenant: String(actor.organizationId) });
  expect(facts!.metadataReads).toEqual(program ? [{ sql: metadataSql, params: [program.projectId, actor.organizationId, program.id] }] : []);
  return facts!;
}
function observe(name: string, value: unknown) {
  (observations.cases as Record<string, unknown>)[name] = value;
}
function assertNoPrivateBody(response: request.Response, program: Program) {
  const json = JSON.stringify(response.body);
  expect(response.body.success).toBe(false);
  expect(response.body.data).toBeUndefined();
  for (const text of [program.id, program.title, 'US_IND', 'EU_MAA', 'JP_MKT_APPROVAL']) expect(json).not.toContain(text);
}

async function provisionActor(key: keyof typeof actors, organizationId: number) {
  const hash = await bcrypt.hash(randomUUID(), 4);
  const result = await owner.query<{ id: number }>("INSERT INTO users(email,name,password_hash,status,default_organization_id) VALUES($1,$2,$3,'active',$4) RETURNING id",
    [`${TAG}-${key}@example.invalid`, `${TAG} ${key}`, hash, organizationId]);
  const id = Number(result.rows[0].id);
  await owner.query("INSERT INTO organization_users(organization_id,user_id,role) VALUES($1,$2,'member')", [organizationId, id]);
  actors[key] = { id, organizationId, token: '' };
}
async function seedProgram(key: keyof typeof programs, metadata: unknown, shared = false) {
  const id = randomUUID();
  const title = `${TAG} ${key} misleading IND/FDA title`;
  await owner.query(`INSERT INTO regulatory_programs(id,organization_id,name,code,program_type,product_type,primary_agency,product_name,lead_user_id,status)
    VALUES($1,$2,$3,$4,'IND','drug','FDA','Invented QA product',$5,'active')`, [id, orgId, title, `NQA-${id.slice(0, 8)}`, actors.owner.id]);
  const result = await owner.query<{ id: number }>(`INSERT INTO projects(organization_id,client_workspace_id,name,type,status,owner_id,created_by_id,regulatory_program_id,settings,metadata)
    VALUES($1,$2,$3,'regulatory','active',$4,$4,$5,'{}'::jsonb,$6::jsonb) RETURNING id`, [orgId, workspaceId, title, actors.owner.id, id, JSON.stringify(metadata)]);
  const projectId = Number(result.rows[0].id);
  await owner.query("INSERT INTO project_visibility_settings(organization_id,project_id,visibility) VALUES($1,$2,'private')", [orgId, projectId]);
  if (shared) await owner.query("INSERT INTO project_members(organization_id,project_id,user_id,role,status) VALUES($1,$2,$3,'use','active')", [orgId, projectId, actors.reader.id]);
  programs[key] = { id, projectId, title };
}
async function seedPrograms() {
  await seedProgram('ind', { registryId: 'US_IND' }, true);
  await seedProgram('bla', { registryId: 'US_BLA' }, true);
  await seedProgram('maa', { registryId: 'EU_MAA' }, true);
  await seedProgram('jnda', { registryId: 'JP_MKT_APPROVAL' }, true);
  await seedProgram('missing', {});
  await seedProgram('conflict', { registryId: 'EU_MAA', submissionType: 'NDA' });
  await seedProgram('late', { registryId: 'US_IND' });
  await owner.query("INSERT INTO project_members(organization_id,project_id,user_id,role,status) VALUES($1,$2,$3,'use','active')", [orgId, programs.late.projectId, actors.withdrawn.id]);
}
async function installActualRoutes() {
  app = express(); app.use(express.json());
  const { default: createInsightsCanvasRoutes } = await import('../../server/routes/insights-canvas-routes');
  app.use('/api/insights-canvas', authenticateToken, async (req, _res, next) => {
    try {
      if (!req.dbClient) throw new Error('Actual authenticator did not install its request executor.');
      const id = req.get('X-Regional-Native-Request');
      if (!id) throw new Error('Native request identifier missing.');
      const actual = req.dbClient;
      const posture = (await actual.query<Record<string, unknown>>(postureSql)).rows[0];
      const facts: RequestFacts = { metadataReads: [], posture, actorReadsAfterMetadata: 0, metadataReturned: false };
      requestFacts.set(id, facts);
      Object.assign(req, { dbClient: observedClient(actual, id, facts) });
      next();
    } catch (error) { next(error); }
  }, createInsightsCanvasRoutes());
  app.use('/api/report-os', (await import('../../server/routes/report-os')).default);
}
async function verifyNativeStores() {
  const rows = (await owner.query<{ relname: string; relrowsecurity: boolean; relforcerowsecurity: boolean }>(`SELECT relname,relrowsecurity,relforcerowsecurity FROM pg_class
    WHERE oid=ANY(ARRAY['public.projects'::regclass,'public.regulatory_programs'::regclass,'public.project_members'::regclass,'public.project_visibility_settings'::regclass,'public.organization_users'::regclass]) ORDER BY relname`)).rows;
  expect(rows).toHaveLength(5); expect(rows.every(row => row.relrowsecurity && row.relforcerowsecurity)).toBe(true);
  const catalog = (await owner.query<{ type_id: string; enabled: boolean }>('SELECT type_id,enabled FROM report_type_registry WHERE type_id=ANY($1::text[]) ORDER BY type_id', [TYPES])).rows;
  expect(catalog.map(row => row.type_id).sort()).toEqual([...TYPES].sort());
  expect(catalog.every(row => row.enabled)).toBe(true);
  Object.assign(observations, { organizationId: orgId, programs, stores: rows, catalog });
}
beforeAll(async () => {
  if (!process.env.APP_DATABASE_URL) throw new Error('Restricted native APP_DATABASE_URL is required.');
  if (new URL(process.env.APP_DATABASE_URL).pathname.slice(1) !== NATIVE_DATABASE) throw new Error('Owner and restricted runtime must target the same real native database.');
  owner = new Pool({ connectionString: databaseUrl, max: 3 });
  runtimeMutation = new Pool({ connectionString: process.env.APP_DATABASE_URL, max: 1 });
  const org = (await owner.query<{ id: number; uuid: string }>("INSERT INTO organizations(name,slug,status,tier) VALUES($1,$1,'active','standard') RETURNING id,uuid", [TAG])).rows[0];
  orgId = Number(org.id); orgUuid = org.uuid;
  const foreign = Number((await owner.query<{ id: number }>("INSERT INTO organizations(name,slug,status,tier) VALUES($1,$1,'active','standard') RETURNING id", [`${TAG}-foreign`])).rows[0].id);
  for (const key of ['owner', 'reader', 'unassigned', 'withdrawn'] as const) await provisionActor(key, orgId);
  await provisionActor('foreign', foreign);
  workspaceId = Number((await owner.query<{ id: number }>('INSERT INTO client_workspaces(organization_id,name,slug,created_by_id) VALUES($1,$2,$2,$3) RETURNING id', [orgId, TAG, actors.owner.id])).rows[0].id);
  await seedPrograms(); await verifyNativeStores();
  // Real token standing compares second-resolution iat with actual OU creation.
  await new Promise(resolve => setTimeout(resolve, 1100));
  const { activeJwtSecret } = await import('../../server/utils/jwtVerify');
  for (const actor of Object.values(actors)) actor.token = jwt.sign({ type: 'access', userId: actor.id, organizationId: String(actor.organizationId), role: 'member' }, activeJwtSecret(), { expiresIn: '15m' });
  await installActualRoutes();
}, 120_000);
afterAll(async () => {
  activeBarrier?.control.released.resolve();
  if (process.env.REGIONAL_FILING_NATIVE_OBSERVATIONS) writeFileSync(process.env.REGIONAL_FILING_NATIVE_OBSERVATIONS, JSON.stringify(observations, null, 2) + '\n', { mode: 0o600 });
  await runtimeMutation?.end(); await getPool().end(); await owner?.end();
  // No deletes, grants, fixture teardown, schema changes or history resets.
});

describe('actual request-pinned regional filing catalog', () => {
  it.each([
    ['ind', 'US_IND', TYPES[0]], ['bla', 'US_BLA', TYPES[1]],
    ['maa', 'EU_MAA', TYPES[2]], ['jnda', 'JP_MKT_APPROVAL', TYPES[3]],
  ] as const)('offers exactly the authoritative %s binding to an actual shared reader', async (key, registryId, typeId) => {
    const probe = overview(actors.reader, programs[key]); const response = await probe.response;
    expect(response.status, JSON.stringify(response.body)).toBe(200);
    expect(response.body.data).toMatchObject({ tier: 'standard', tierResolved: true, leadProgram: { projectId: programs[key].projectId, registryId, pdufa: null } });
    const rows = regionalRows(response); expect(rows).toHaveLength(4);
    for (const row of rows) expect(row).toMatchObject({ runnable: row.typeId === typeId, entitled: true,
      availabilityState: row.typeId === typeId ? 'available' : 'not-applicable' });
    for (const row of rows.filter(row => row.typeId !== typeId)) expect(row.reasonCode).toMatch(/^REGIONAL_/);
    const facts = assertRequestContext(probe.id, actors.reader, programs[key]);
    observe(key, { program: programs[key], registryId, rows, executor: facts });
  });
  it.each([['missing', 'filing-context-required', 'REGIONAL_FILING_CONTEXT_REQUIRED'], ['conflict', 'context-unavailable', 'REGIONAL_FILING_CONTEXT_INVALID']] as const)(
    'preserves actual %s context without guessing from the IND/FDA title', async (key, state, reasonCode) => {
      const probe = overview(actors.owner, programs[key]); const response = await probe.response;
      expect(response.status, JSON.stringify(response.body)).toBe(200);
      for (const row of regionalRows(response)) expect(row).toMatchObject({ runnable: false, availabilityState: state, reasonCode });
      expect(response.body.data.leadProgram).toMatchObject({ registryId: null, filing: null, agency: null });
      assertRequestContext(probe.id, actors.owner, programs[key]);
    });
  it.each(['unassigned', 'foreign'] as const)('refuses the actual %s requester before reading private filing metadata', async key => {
    const probe = overview(actors[key], programs.ind); const response = await probe.response;
    expect(response.status, JSON.stringify(response.body)).toBe(404);
    assertNoPrivateBody(response, programs.ind); assertRequestContext(probe.id, actors[key]);
    observe(key, { status: response.status, body: response.body, executor: requestFacts.get(probe.id) });
  });
});

async function withdrawFreshMembership() {
  const client = await runtimeMutation.connect();
  try {
    await applySessionScope(client, { tenantId: String(orgId), orgUuid, role: 'member' });
    const posture = (await client.query<Record<string, unknown>>(postureSql)).rows[0];
    expect(posture).toMatchObject({ role: 'app_service', rolsuper: false, rolbypassrls: false, enforcement: 'on', tenant: String(orgId) });
    const changed = await client.query("UPDATE project_members SET status='revoked' WHERE organization_id=$1 AND project_id=$2 AND user_id=$3 AND status='active' RETURNING id",
      [orgId, programs.late.projectId, actors.withdrawn.id]);
    expect(changed.rowCount).toBe(1);
    observe('withdrawal', { posture, changedRows: changed.rowCount, projectId: programs.late.projectId, userId: actors.withdrawn.id });
  } finally { await clearSessionScope(client); client.release(); }
}
async function boundedBarrierReached(barrier: MetadataBarrier) {
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    await Promise.race([barrier.reached.promise, new Promise<never>((_, reject) => { timer = setTimeout(() => reject(new Error('Actual metadata query did not reach the deferred native barrier.')), 20_000); })]);
  } finally { if (timer) clearTimeout(timer); }
}
describe('fresh delivery and execution refusals', () => {
  it('withdraws real sharing after the actual metadata read and refuses the assembled response', async () => {
    const probe = overview(actors.withdrawn, programs.late);
    const control = { reached: deferred(), released: deferred() };
    activeBarrier = { requestId: probe.id, control };
    const pending = probe.response.then(response => response);
    try {
      await boundedBarrierReached(control);
      const read = assertRequestContext(probe.id, actors.withdrawn, programs.late);
      expect(read.metadataReturned).toBe(true);
      await withdrawFreshMembership();
      control.released.resolve();
      const response = await pending;
      expect(response.status, JSON.stringify(response.body)).toBe(403);
      expect(response.body.error.code).toBe('PROJECT_PERMISSION_DENIED');
      assertNoPrivateBody(response, programs.late);
      expect(requestFacts.get(probe.id)!.actorReadsAfterMetadata).toBeGreaterThan(0);
      observe('late-refusal', { status: response.status, body: response.body, executor: requestFacts.get(probe.id) });
    } finally { control.released.resolve(); activeBarrier = undefined; await pending; }
    const after = overview(actors.withdrawn, programs.late); const response = await after.response;
    expect(response.status).toBe(404); assertNoPrivateBody(response, programs.late); assertRequestContext(after.id, actors.withdrawn);
  });
  it('re-reads a newly recorded wrong market before creating any retained run or reporting audit', async () => {
    const probe = overview(actors.owner, programs.ind); const catalog = await probe.response;
    expect(catalog.status).toBe(200); expect(regionalRows(catalog).find(row => row.typeId === TYPES[0])?.runnable).toBe(true);
    await recordFreshMarketChange(programs.ind, 'EU_MAA');
    const before = await retainedCounts();
    const response = await request(app).post('/api/report-os/runs').set('Authorization', `Bearer ${actors.owner.token}`)
      .send({ scopeType: 'project', scopeId: String(programs.ind.projectId), reportTypeId: TYPES[0] });
    expect(response.status, JSON.stringify(response.body)).toBe(422);
    expect(response.body).toMatchObject({ code: 'REPORT_TYPE_NOT_COMPUTED' });
    expect(response.body.error).toMatch(/assesses a US filing/);
    expect(await retainedCounts()).toEqual(before);
    observe('current-market-refusal', { projectId: programs.ind.projectId, status: response.status, body: response.body, before, after: await retainedCounts() });
  });
});
async function retainedCounts() {
  return (await owner.query<Record<string, unknown>>(`SELECT
    (SELECT count(*)::int FROM report_runs WHERE organization_id=$1) AS runs,
    (SELECT count(*)::int FROM report_snapshots WHERE organization_id=$1) AS snapshots,
    (SELECT count(*)::int FROM electronic_signatures WHERE organization_id=$1) AS signatures,
    (SELECT count(*)::int FROM audit_logs WHERE tenant_id=$1 AND action LIKE 'report_os.%') AS reporting_audits`, [orgId])).rows[0];
}
async function recordFreshMarketChange(program: Program, registryId: string) {
  const client = await runtimeMutation.connect();
  try {
    await applySessionScope(client, { tenantId: String(orgId), orgUuid, role: 'member' });
    const posture = (await client.query<Record<string, unknown>>(postureSql)).rows[0];
    expect(posture).toMatchObject({ role: 'app_service', rolsuper: false, rolbypassrls: false, enforcement: 'on', tenant: String(orgId) });
    const changed = await client.query('UPDATE projects SET metadata=$1::jsonb WHERE id=$2 AND organization_id=$3 RETURNING id', [JSON.stringify({ registryId }), program.projectId, orgId]);
    expect(changed.rowCount).toBe(1);
    observe('recorded-market-change', { posture, changedRows: changed.rowCount, projectId: program.projectId, registryId });
  } finally { await clearSessionScope(client); client.release(); }
}
