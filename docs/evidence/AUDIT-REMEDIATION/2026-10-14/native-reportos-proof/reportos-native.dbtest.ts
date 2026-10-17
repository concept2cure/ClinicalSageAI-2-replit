/** Native read proof: actual app_service runtime, auth/ALS and enforcing RLS.
 * Owner writes only uniquely named synthetic prerequisites. Fixture evidence is
 * preserved; no trigger, RLS policy, deployment gate or provider is bypassed.
 */
import { beforeAll, afterAll, describe, it, expect } from 'vitest';
import express from 'express';
import request from 'supertest';
import jwt from 'jsonwebtoken';
import { Pool } from 'pg';
import { randomUUID } from 'node:crypto';
import { databaseUrl } from '../../../../../tests/setup.db';

const TAG = `audit-reportos-native-${Date.now().toString(36)}`;
type Fixture = { org: number; actor: number; project: number; program: string; workspace: number; run: number; subscription: number; bundle: string; token: string };
let owner: Pool;
let rawRuntime: Pool;
let app: express.Express;
let own: Fixture;
let other: Fixture;
const observed: Array<{ actor: number; tenant: string; role: string; lazy: boolean; account: number | null }> = [];

async function seed(label: string): Promise<Fixture> {
  const org = (await owner.query(`INSERT INTO organizations(name,slug,status,tier) VALUES($1,$1,'active','enterprise') RETURNING id`, [`${TAG}-${label}`])).rows[0].id;
  const actor = (await owner.query(`INSERT INTO users(email,name,password_hash,status,mfa_enabled) VALUES($1,$2,$3,'active',false) RETURNING id`, [`${TAG}-${label}@example.invalid`, `${TAG}-${label}`, 'SYNTHETIC_FIXTURE_NOT_A_LOGIN_HASH'])).rows[0].id;
  await owner.query('INSERT INTO organization_users(organization_id,user_id,role) VALUES($1,$2,$3)', [org, actor, 'admin']);
  const workspace = (await owner.query('INSERT INTO client_workspaces(organization_id,name,slug) VALUES($1,$2,$2) RETURNING id', [org, `${TAG}-${label}`])).rows[0].id;
  const program = randomUUID();
  await owner.query(`INSERT INTO regulatory_programs(id,organization_id,name,code,program_type,product_type,primary_agency,product_name,lead_user_id,status) VALUES($1,$2,$3::text,$3::text,'IND','small_molecule','FDA',$3::text,$4,'active')`, [program, org, `${TAG}-${label}`, actor]);
  const project = (await owner.query(`INSERT INTO projects(organization_id,client_workspace_id,name,type,status,owner_id,created_by_id,regulatory_program_id,settings) VALUES($1,$2,$3,'program','active',$4,$4,$5,$6::json) RETURNING id`, [org, workspace, `${TAG}-${label}`, actor, program, JSON.stringify({ projectSharing: { visibility: 'private', members: [] } })])).rows[0].id;
  await owner.query('INSERT INTO project_visibility_settings(organization_id,project_id,visibility) VALUES($1,$2,$3)', [org, project, 'private']);
  const { runWithTenantScope } = await import('../../../../../server/db/tenantStore');
  const { persistReportRun } = await import('../../../../../server/services/report-os/persistence');
  const scope = { tenantId: String(org), role: 'admin', accountId: actor, source: 'test' as const, caller: 'native-reportos-synthetic-recording' };
  const persisted = await runWithTenantScope(scope, () => persistReportRun({
    run: { organizationId: org, clientWorkspaceId: workspace, scopeType: 'project', scopeId: String(project), reportTypeId: 'readiness.executive_digest', status: 'draft', requestedBy: actor, dependencySummary: { summary: { scopeLabel: `${TAG}-${label}`, syntheticFixture: true } }, blockers: [], completedAt: new Date() },
    snapshot: { organizationId: org, scopeType: 'project', scopeId: String(project), createdBy: actor, snapshotMetadata: { syntheticFixture: true, tag: TAG } },
    dependencies: [],
  }, { userId: actor }));
  // Trusted schedule/container fixtures exercise READ handlers only; this is
  // not evidence that a schedule fired or that bundle creation was qualified.
  const subscription = (await owner.query(`INSERT INTO report_subscriptions(organization_id,client_workspace_id,report_type_id,scope_type,scope_id,schedule,recipients,format,channel,enabled,created_by) VALUES($1,$2,$3,'project',$4,$5::json,'[]'::json,'in_app','platform',false,$6) RETURNING id`, [org, workspace, 'readiness.executive_digest', String(project), JSON.stringify({ cadence: 'weekly', hour: 7, minute: 0, dayOfWeek: 1, timeZone: 'UTC' }), actor])).rows[0].id;
  const profile = (await owner.query('INSERT INTO project_intelligence_profiles(project_id,organization_id,created_by,profile_status) VALUES($1,$2,$3,$4) RETURNING id', [project, org, actor, 'active'])).rows[0].id;
  const bundle = randomUUID();
  const record = { bundleId: bundle, organizationId: org, name: `${TAG}-${label}`, createdAt: new Date().toISOString(), createdBy: actor, projectIds: [project], runIds: [persisted.run.id], items: [{ runId: persisted.run.id, runUuid: persisted.run.runUuid, reportTypeId: 'readiness.executive_digest', reportTypeLabel: 'Executive Readiness Digest', scopeType: 'project', scopeId: String(project), status: 'draft', confidence: null, blockers: [], createdAt: persisted.run.createdAt.toISOString() }] };
  await owner.query(`INSERT INTO project_memory_entries(project_profile_id,project_id,organization_id,category,subcategory,title,content,source_document_type,importance_level,extracted_by) VALUES($1,$2,$3,'regulatory','report_bundle_record',$4,$5,'report_os_state','high','native_reportos_fixture')`, [profile, project, org, `bundle:${bundle}`, JSON.stringify({ bundleRecord: record })]);
  const { activeJwtSecret } = await import('../../../../../server/utils/jwtVerify');
  const token = jwt.sign({ type: 'access', userId: actor, organizationId: String(org), role: 'admin' }, activeJwtSecret(), { expiresIn: '15m' });
  return { org, actor, project, program, workspace, run: persisted.run.id, subscription, bundle, token };
}

function get(path: string, fixture: Fixture = own) {
  return request(app).get(path).set('Authorization', `Bearer ${fixture.token}`);
}

beforeAll(async () => {
  if (!process.env.APP_DATABASE_URL) throw new Error('APP_DATABASE_URL must name the provisioned non-superuser runtime.');
  owner = new Pool({ connectionString: databaseUrl, max: 3 });
  rawRuntime = new Pool({ connectionString: process.env.APP_DATABASE_URL, max: 2, options: '-c app.rls_enforce=on' });
  const identity = await rawRuntime.query('SELECT current_user AS actor,rolsuper,rolbypassrls FROM pg_roles WHERE rolname=current_user');
  expect(identity.rows[0]).toEqual({ actor: 'app_service', rolsuper: false, rolbypassrls: false });
  const tls = await rawRuntime.query('SELECT ssl,version FROM pg_stat_ssl WHERE pid=pg_backend_pid()');
  expect(tls.rows[0].ssl).toBe(true);
  const policies = await owner.query(`SELECT relname,relrowsecurity,relforcerowsecurity FROM pg_class WHERE relnamespace='public'::regnamespace AND relname=ANY($1::text[]) ORDER BY relname`, [['report_runs','report_snapshots','report_run_dependencies','report_subscriptions','project_memory_entries','projects']]);
  expect(policies.rows).toHaveLength(6);
  expect(policies.rows.every(row => row.relrowsecurity && row.relforcerowsecurity)).toBe(true);
  const registry = await owner.query("SELECT type_id FROM report_type_registry WHERE type_id='readiness.executive_digest' AND enabled=true");
  expect(registry.rows).toHaveLength(1);
  own = await seed('own');
  other = await seed('other');
  const { authMiddleware } = await import('../../../../../server/auth');
  const { getTenantScope } = await import('../../../../../server/db/tenantStore');
  const { LazyRequestDbClient } = await import('../../../../../server/middleware/lazyRequestDbClient');
  const reportos = (await import('../../../../../server/routes/report-os')).default;
  const insights = (await import('../../../../../server/routes/report-os-insights')).default;
  const canvas = (await import('../../../../../server/routes/insights-canvas-routes')).default();
  app = express(); app.use(express.json());
  app.use('/api', authMiddleware, (req, _res, next) => {
    const scope = getTenantScope();
    observed.push({ actor: Number(req.user?.id), tenant: scope?.tenantId ?? '', role: String(scope?.role), lazy: (req as express.Request & { dbClient?: unknown }).dbClient instanceof LazyRequestDbClient, account: scope?.accountId ?? null });
    next();
  });
  app.use('/api/report-os', reportos);
  app.use('/api/insights', insights);
  app.use('/api/insights-canvas', canvas);
  console.info(JSON.stringify({ proof: 'native-reportos-fixtures', tag: TAG, own: { ...own, token: '[redacted]' }, other: { ...other, token: '[redacted]' }, runtime: identity.rows[0], tls: tls.rows[0], policies: policies.rows }));
}, 120_000);

afterAll(async () => {
  // Preserve all uniquely named synthetic rows, snapshots and chained audit
  // evidence. No trigger disable, policy bypass or destructive cleanup.
  const { getPool } = await import('../../../../../server/db/runtime');
  await getPool().end(); await rawRuntime?.end(); await owner?.end();
});

describe('ReportOS native canonical ALS read controls', () => {
  it('distinguishes raw no-ALS RLS denial from global instrumented full-context positives', async () => {
    expect((await rawRuntime.query('SELECT id FROM report_runs WHERE organization_id=$1', [own.org])).rows).toEqual([]);
    const { getPool, db } = await import('../../../../../server/db/runtime');
    const { runWithTenantScope } = await import('../../../../../server/db/tenantStore');
    const { reportRuns } = await import('../../../../../shared/schema/report-os');
    await expect(getPool().query('SELECT id FROM report_runs WHERE organization_id=$1', [own.org])).rejects.toThrow(/FAIL-CLOSED/);
    await runWithTenantScope({ tenantId: String(own.org), role: 'admin', accountId: own.actor, source: 'test', caller: 'native-reportos-global-positive' }, async () => {
      // No organization SQL predicate: FORCE RLS must do the isolation itself.
      const pooled = await getPool().query("SELECT id,current_user AS runtime_role,current_setting('app.rls_enforce',true) AS enforcement,current_setting('app.current_tenant_id',true) AS tenant,current_setting('app.current_user_role',true) AS role,current_setting('app.current_account_id',true) AS account FROM report_runs");
      expect(pooled.rows).toContainEqual({ id: own.run, runtime_role: 'app_service', enforcement: 'on', tenant: String(own.org), role: 'admin', account: String(own.actor) });
      expect(pooled.rows.some(row => row.id === other.run)).toBe(false);
      const orm = await db.select({ id: reportRuns.id }).from(reportRuns);
      expect(orm).toContainEqual({ id: own.run });
      expect(orm).not.toContainEqual({ id: other.run });
    });
  });

  it('matches actual runtime global and canonical lazy request-client saved-history reads', async () => {
    const { runWithTenantScope } = await import('../../../../../server/db/tenantStore');
    const { getPool } = await import('../../../../../server/db/runtime');
    const { applySessionScope } = await import('../../../../../server/db/sessionScope');
    const { LazyRequestDbClient } = await import('../../../../../server/middleware/lazyRequestDbClient');
    const { listReportRunHistory } = await import('../../../../../server/services/report-os/run-history');
    const scope = { tenantId: String(own.org), role: 'admin', accountId: own.actor, source: 'test' as const, caller: 'native-reportos-pinned-comparison' };
    await runWithTenantScope(scope, async () => {
      const global = await listReportRunHistory(own.org, { runId: own.run });
      expect(global.data.map(row => row.id)).toEqual([own.run]);
      expect((await listReportRunHistory(other.org, { runId: other.run })).data).toEqual([]);
      const client = new LazyRequestDbClient(getPool(), connection => applySessionScope(connection, scope));
      try { expect((await listReportRunHistory(own.org, { runId: own.run }, client)).data.map(row => row.id)).toEqual([own.run]); }
      finally { await client.release(); }
    });
  });

  it('lists the authenticated tenant own saved run while ignoring a foreign organization query claim', async () => {
    const response = await get(`/api/report-os/runs?organizationId=${other.org}`);
    expect(response.status, JSON.stringify(response.body)).toBe(200);
    expect(response.body.data.map((row: { id: number }) => row.id)).toContain(own.run);
    expect(response.body.data.map((row: { id: number }) => row.id)).not.toContain(other.run);
    expect(response.body.data.every((row: { organizationId: number }) => row.organizationId === own.org)).toBe(true);
    expect(observed.some(scope => scope.actor === own.actor && scope.tenant === String(own.org) && scope.role === 'admin' && scope.lazy)).toBe(true);
  });

  it('reads owned run details/render/dependencies/seal and refuses foreign IDs', async () => {
    for (const suffix of ['', '/rendered', '/dependencies', '/seal']) {
      const positive = await get(`/api/report-os/runs/${own.run}${suffix}`);
      expect(positive.status, `${suffix}: ${JSON.stringify(positive.body)}`).toBe(200);
      const denied = await get(`/api/report-os/runs/${other.run}${suffix}`);
      expect(denied.status, `${suffix}: ${JSON.stringify(denied.body)}`).toBe(404);
    }
  });

  it('lists the current tenant saved bundle from the global ORM while excluding foreign containers', async () => {
    const response = await get('/api/report-os/bundles');
    expect(response.status, JSON.stringify(response.body)).toBe(200);
    expect(response.body.data.map((row: { bundleId: string }) => row.bundleId)).toContain(own.bundle);
    expect(response.body.data.map((row: { bundleId: string }) => row.bundleId)).not.toContain(other.bundle);
  });

  it('lists current tenant subscriptions through the actual global service with foreign exclusion', async () => {
    const response = await get('/api/insights/subscriptions');
    expect(response.status, JSON.stringify(response.body)).toBe(200);
    expect(response.body.data.map((row: { id: number }) => row.id)).toContain(own.subscription);
    expect(response.body.data.map((row: { id: number }) => row.id)).not.toContain(other.subscription);
  });

  it('returns actual native analytics for the owned open program and excludes the foreign program', async () => {
    const response = await get(`/api/insights-canvas/overview?programId=${own.program}`);
    expect(response.status, JSON.stringify(response.body)).toBe(200);
    expect(response.body.data.organizationId).toBe(own.org);
    expect(response.body.data.programs.some((program: { programId: string }) => program.programId === own.program), JSON.stringify(response.body)).toBe(true);
    expect(response.body.data.leadProgram.projectId).toBe(own.project);
    expect(JSON.stringify(response.body)).not.toContain(other.program);
    const denied = await get(`/api/insights-canvas/overview?programId=${other.program}`);
    // Canonical overview intentionally uses an unanchored state for a UUID
    // unavailable in this tenant. It echoes the input, revealing no foreign
    // label/project/readiness; it does not distinguish missing from foreign.
    expect(denied.status, JSON.stringify(denied.body)).toBe(200);
    expect(denied.body.data.organizationId).toBe(own.org);
    expect(denied.body.data.leadProgram).toBeNull();
    expect(denied.body.data.openProgram.state).toBe('unanchored');
    expect(denied.body.data.programs.some((program: { programId: string }) => program.programId === other.program)).toBe(false);
    expect(JSON.stringify(denied.body)).not.toContain(`${TAG}-other`);
  });

  it('serves reciprocal positive reads for the other authenticated tenant', async () => {
    const response = await get('/api/report-os/runs', other);
    expect(response.status, JSON.stringify(response.body)).toBe(200);
    expect(response.body.data.map((row: { id: number }) => row.id)).toContain(other.run);
    expect(response.body.data.map((row: { id: number }) => row.id)).not.toContain(own.run);
  });
});
