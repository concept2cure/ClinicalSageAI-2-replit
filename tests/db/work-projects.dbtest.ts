/** S12 (founder decisions P-83, P-109 clarified 2026-11-09): a work project is added under its filing project's
 * anchor through the one project intake, POST /api/c2c/projects with { parentProjectId, workKind } (ruling of
 * 2026-11-09: canonical intake stays the one creator), on a restricted native PostgreSQL role with forced
 * row-level security. The child carries no program id (PF-08's one anchor per program stays), its kind is
 * metadata.workKind, and the write and its chained audit row commit together. Authentication and request assembly
 * are synthetic, as in project-settings.dbtest.ts, whose harness this follows. */
import express from 'express';
import request from 'supertest';
import { readFile } from 'node:fs/promises';
import { Pool } from 'pg';
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { databaseUrl } from '../setup.db';
import { tenantIsolationPolicySql } from './harness';
import { provisionAppServiceRole } from '../../scripts/db/provision-app-role.mjs';

const h = vi.hoisted(() => ({ pool: null as unknown }));
vi.mock('../../server/db.js', () => ({ get pool() { return h.pool; }, getPool: () => h.pool, db: {} }));
vi.mock('../../server/auth', () => ({ authMiddleware: (_q: unknown, _s: unknown, next: () => void) => next() }));
const PROGRAM = '9a7f0b10-0000-4000-8000-0000000012aa';
const FOREIGN = '9a7f0b10-0000-4000-8000-0000000012bb';
const suffix = `${process.pid}_${Date.now().toString(36)}`;
const databaseName = `dbs12_${suffix}`, runtimeRole = `dbs12_rt_${suffix}`;
let maintenance: Pool, owner: Pool;
let runtime: typeof import('../../server/db/runtime');
let store: typeof import('../../server/db/tenantStore');
let router: express.Router;
let intake: express.Router;
let scope: typeof import('../../server/middleware/establishRequestTenantScope');

async function tableDdl(file: string, tables: string[]) {
  const source = await readFile(file, 'utf8');
  return tables.map(table => {
    const match = source.match(new RegExp(`CREATE TABLE (?:IF NOT EXISTS )?(?:"?public"?\\.)?"?${table}"?\\s*\\(([\\s\\S]*?)\\n\\);`, 'i'));
    if (!match) throw new Error(`Canonical table missing: ${file}/${table}`);
    return `CREATE TABLE IF NOT EXISTS "${table}" (${match[1]}\n);`;
  }).join('\n');
}

/* The request's database client, bound as production binds it: establishRequestTenantScope pins one lazily acquired,
   tenant-scoped connection per request (its session variables applied), so a route's BEGIN, writes and COMMIT are
   one transaction under row-level security. Authentication itself is synthetic. */
function app(actor = 7, organizationId = 9) {
  const a = express(); a.use(express.json());
  a.use((req, _res, next) => {
    Object.assign(req, { userId: actor, user: { id: actor, organizationId, role: 'member' }, organizationId });
    next();
  });
  a.use((req, res, next) => scope.establishRequestTenantScope(req, res, next));
  a.use('/api/c2c/projects', intake); a.use('/api/project-hierarchy', router); return a;
}
const add = (parentId: number, body: Record<string, unknown>, actor = 7, organizationId = 9) =>
  request(app(actor, organizationId)).post('/api/c2c/projects').send({ parentProjectId: parentId, ...body });
const cmc = { name: 'Drug substance CMC', workKind: 'cmc' };
async function auditRows() { return (await owner.query("SELECT *,xmin::text AS tx FROM audit_logs WHERE action='project.work_project.create' ORDER BY chain_seq")).rows; }
async function children() { return (await owner.query('SELECT id,organization_id,client_workspace_id,parent_project_id,depth,path,regulatory_program_id,metadata,xmin::text AS tx FROM projects WHERE parent_project_id IS NOT NULL ORDER BY id')).rows; }

beforeAll(async () => {
  maintenance = new Pool({ connectionString: databaseUrl });
  await maintenance.query(`CREATE DATABASE ${databaseName}`);
  const isolated = new URL(databaseUrl); isolated.pathname = `/${databaseName}`;
  owner = new Pool({ connectionString: isolated.toString() });
  await owner.query(await tableDdl('migrations/0000_sweet_joseph.sql', ['organizations', 'users', 'organization_users', 'client_workspaces', 'projects', 'audit_logs']));
  await owner.query(`CREATE TABLE project_members(project_id integer,organization_id integer,user_id integer,role text,status text);
    CREATE TABLE project_visibility_settings(project_id integer,organization_id integer,visibility text);
    CREATE TABLE concept2cure_artifacts(id integer,organization_id integer,project_id integer);
    CREATE TABLE concept2cure_review_assignments(id serial PRIMARY KEY,artifact_id integer,reviewer_id integer,organization_id integer,status text)`);
  for (const migration of [
    '20260527_mutation_primitives.sql', '20260609_audit_hmac_seal.sql', '20260524_program_workbench_schema.sql',
    '20260814_projects_regulatory_program_anchor.sql', '20261001b_projects_one_anchor_per_program.sql',
    '20260921_audit_logs_chain_seq.sql', '20260929_actor_names.sql',
  ]) await owner.query(await readFile(`migrations/${migration}`, 'utf8'));
  await owner.query(await readFile('db/migrations/20260813_audit_tamper_proof_log.sql', 'utf8'));
  for (const [table, column] of [
    ['organizations', 'id'], ['organization_users', 'organization_id'], ['client_workspaces', 'organization_id'],
    ['projects', 'organization_id'], ['regulatory_programs', 'organization_id'], ['audit_logs', 'tenant_id'],
    ['project_members', 'organization_id'], ['project_visibility_settings', 'organization_id'],
    ['concept2cure_artifacts', 'organization_id'], ['concept2cure_review_assignments', 'organization_id'],
  ]) await owner.query(`ALTER TABLE ${table} ENABLE ROW LEVEL SECURITY; ALTER TABLE ${table} FORCE ROW LEVEL SECURITY; ${tenantIsolationPolicySql(table, column)}`);
  await provisionAppServiceRole(owner, { env: { APP_SERVICE_DB_ROLE: runtimeRole, APP_SERVICE_DB_PASSWORD: 's12-disposable-runtime-password' } });
  const restricted = new URL(isolated); restricted.username = runtimeRole; restricted.password = 's12-disposable-runtime-password';
  process.env.APP_DATABASE_URL = restricted.toString(); process.env.RLS_ENFORCE = 'on'; process.env.PGOPTIONS = '-c search_path=public';
  process.env.AUDIT_HMAC_KEY = 's12-synthetic-ledger-key'; process.env.AUDIT_HMAC_SECRET = 's12-synthetic-audit-key';
  runtime = await import('../../server/db/runtime'); store = await import('../../server/db/tenantStore');
  const pool = runtime.getPool();
  h.pool = { query: (sql: string, params?: unknown[]) => pool.query(sql, params), connect: () => pool.connect() };
  router = (await import('../../server/routes/project-hierarchy')).default;
  intake = (await import('../../server/routes/c2c/projects')).default;
  scope = await import('../../server/middleware/establishRequestTenantScope');
  const role = await store.runWithTenantScope({ tenantId: '9', role: 'member', source: 'test', caller: 's12-role-proof' }, () =>
    pool.query('SELECT current_user AS role,rolsuper,rolbypassrls FROM pg_roles WHERE rolname=current_user'));
  expect(role.rows[0]).toEqual({ role: runtimeRole, rolsuper: false, rolbypassrls: false });
  // The cross-organisation cases mean something only if a request's connection enforces RLS for its own tenant.
  const probe = express(); probe.use((req, _res, next) => { Object.assign(req, { user: { id: 7, organizationId: 9, role: 'member' } }); next(); });
  probe.use((req, res, next) => scope.establishRequestTenantScope(req, res, next));
  probe.get('/vars', async (req, res) => { res.json((await (req as unknown as { dbClient: Pool }).dbClient.query(
    "SELECT current_setting('app.rls_enforce', true) AS rls, current_setting('app.current_tenant_id', true) AS tenant")).rows[0]); });
  expect((await request(probe).get('/vars')).body).toEqual({ rls: 'on', tenant: '9' });
}, 120_000);

beforeEach(async () => {
  await owner.query('ALTER TABLE audit_logs DROP CONSTRAINT IF EXISTS synthetic_work_project_audit_failure');
  await owner.query(`TRUNCATE organizations,users,organization_users,client_workspaces,projects,regulatory_programs,
    audit_logs,project_members,project_visibility_settings RESTART IDENTITY CASCADE`);
  await owner.query(`INSERT INTO organizations(id,name,slug,status) VALUES(9,'Consultancy','consultancy','active'),(10,'Other','other','active');
    INSERT INTO users(id,name,email,password_hash,status) VALUES(7,'Lead','lead@example.test','x','active'),(8,'Viewer','viewer@example.test','x','active'),(9,'Foreign','foreign@example.test','x','active'),(12,'Colleague','colleague@example.test','x','active');
    INSERT INTO organization_users(organization_id,user_id,role) VALUES(9,7,'member'),(9,8,'viewer'),(10,9,'member'),(9,12,'member');
    INSERT INTO client_workspaces(id,organization_id,name,slug,status) VALUES(71,9,'Sponsor A','sponsor-a','active'),(81,10,'Foreign','foreign','active');
    INSERT INTO regulatory_programs(id,organization_id,name,code,program_type,product_type,primary_agency,product_name,priority,status,lead_user_id)
      VALUES('${PROGRAM}',9,'Program A','PA','IND','drug','FDA','Product A','high','active',7),
      ('${FOREIGN}',10,'Foreign','PF','IND','drug','FDA','Foreign product','medium','active',9);
    INSERT INTO projects(id,organization_id,client_workspace_id,name,type,priority,owner_id,created_by_id,regulatory_program_id)
      VALUES(11,9,71,'Program A','regulatory','high',7,7,'${PROGRAM}'),(21,10,81,'Foreign','regulatory','medium',9,9,'${FOREIGN}'),
      (31,9,71,'Unrelated root','regulatory','medium',7,7,NULL);
    SELECT setval(pg_get_serial_sequence('projects','id'), 100)`);
});

afterAll(async () => {
  if (runtime) await runtime.getPool().end();
  if (owner) { await owner.query(`DROP OWNED BY ${runtimeRole}`).catch(() => undefined); await owner.end(); }
  if (maintenance) { await maintenance.query(`DROP DATABASE IF EXISTS ${databaseName}`); await maintenance.query(`DROP ROLE IF EXISTS ${runtimeRole}`); await maintenance.end(); }
  delete process.env.PGOPTIONS; delete process.env.AUDIT_HMAC_KEY; delete process.env.AUDIT_HMAC_SECRET;
});

describe('a work project under its filing project (S12)', () => {
  it('adds the child under the anchor with no program id of its own, its kind, and its audit row in one transaction', async () => {
    const result = await add(11, cmc);
    expect(result.status, JSON.stringify(result.body)).toBe(201);
    expect(result.body.data).toMatchObject({ created: true, parentId: 11, depth: 1, programId: PROGRAM, workKind: 'cmc' });
    const [child] = await children();
    expect(child).toMatchObject({ id: result.body.data.projectId, organization_id: 9, client_workspace_id: 71, parent_project_id: 11,
      depth: 1, path: `11/${result.body.data.projectId}`, regulatory_program_id: null, metadata: { workKind: 'cmc' } });
    const [audit] = await auditRows();
    expect(audit.tx).toBe(child.tx);
    expect(audit.new_values ?? audit.details).toBeTruthy();
    // PF-08: still one anchor row for the program.
    expect((await owner.query('SELECT count(*)::int AS n FROM projects WHERE regulatory_program_id=$1', [PROGRAM])).rows[0].n).toBe(1);
  });

  it('is idempotent: the same name and kind under the same parent is the existing child, with no second audit row', async () => {
    const first = await add(11, cmc); const again = await add(11, { ...cmc, name: ' drug substance cmc ' });
    expect(again.status, JSON.stringify(again.body)).toBe(200);
    expect(again.body.data).toMatchObject({ created: false, projectId: first.body.data.projectId });
    expect(await children()).toHaveLength(1); expect(await auditRows()).toHaveLength(1);
  });

  it('adds a Quality work project (P-111 item 5): quality is a work kind', async () => {
    const quality = await add(11, { name: 'Drug product QA', workKind: 'quality' });
    expect(quality.status, JSON.stringify(quality.body)).toBe(201);
    expect(quality.body.data).toMatchObject({ created: true, parentId: 11, depth: 1, workKind: 'quality' });
    expect((await owner.query('SELECT metadata FROM projects WHERE id=$1', [quality.body.data.projectId])).rows[0].metadata)
      .toMatchObject({ workKind: 'quality' });
  });

  it('nests under one of the program\'s work projects, and refuses a fourth level by name', async () => {
    const study = await add(11, { name: 'Study 201 biostatistics', workKind: 'biostatistics' });
    const sub = await add(study.body.data.projectId, { name: 'Study 201 data management', workKind: 'data_management' });
    expect(sub.status, JSON.stringify(sub.body)).toBe(201); expect(sub.body.data.depth).toBe(2);
    const third = await add(sub.body.data.projectId, { name: 'Interim analyses', workKind: 'biostatistics' });
    expect(third.body.data.depth).toBe(3);
    const fourth = await add(third.body.data.projectId, { name: 'Too deep', workKind: 'rbm' });
    expect(fourth.status).toBe(409); expect(fourth.body.error).toBe('WORK_PROJECT_TOO_DEEP');
  });

  it('refuses, by name, a parent that is not the program\'s project or below it, and writes nothing', async () => {
    const unrelated = await add(31, cmc);
    expect(unrelated.status).toBe(404); expect(unrelated.body.error).toBe('PARENT_NOT_IN_PROGRAM');
    expect(await children()).toHaveLength(0); expect(await auditRows()).toHaveLength(0);
  });

  it('under row-level security, refuses a child of another organisation\'s anchor and reads none of it', async () => {
    // Organisation 9's editor names organisation 10's anchor as the parent: under RLS it is not there to be read.
    const crossParent = await add(21, cmc);
    expect(crossParent.status).toBe(404); expect(crossParent.body.error).toBe('PARENT_NOT_IN_PROGRAM');
    expect(JSON.stringify(crossParent.body)).not.toContain(FOREIGN);
    // Organisation 10's member names organisation 9's program and anchor.
    const intruder = await add(11, cmc, 9, 10);
    expect(intruder.status).toBeGreaterThanOrEqual(403); expect(intruder.status).toBeLessThan(500);
    expect(await children()).toHaveLength(0); expect(await auditRows()).toHaveLength(0);
  });

  it('refuses a viewer, an unknown kind and an empty name', async () => {
    const viewer = await add(11, cmc, 8);
    expect(viewer.status).toBe(403);
    expect((await add(11, { ...cmc, workKind: 'marketing' })).status).toBe(400);
    expect((await add(11, { ...cmc, name: '   ' })).status).toBe(400);
    expect((await add(0, cmc)).status).toBe(400);
    expect(await children()).toHaveLength(0); expect(await auditRows()).toHaveLength(0);
  });

  it('has one door: the project hierarchy no longer creates a project', async () => {
    const retired = await request(app()).post('/api/project-hierarchy/11/children').send({ programId: PROGRAM, ...cmc });
    expect(retired.status).toBe(404);
    expect(await children()).toHaveLength(0); expect(await auditRows()).toHaveLength(0);
  });

  it('rolls the child back if its chained audit row cannot be written', async () => {
    await owner.query("ALTER TABLE audit_logs ADD CONSTRAINT synthetic_work_project_audit_failure CHECK(action<>'project.work_project.create')");
    const result = await add(11, cmc);
    expect(result.status).toBe(500); expect(result.body.error).toBe('WORK_PROJECT_NOT_ADDED');
    expect(JSON.stringify(result.body)).not.toContain('synthetic_work_project_audit_failure');
    expect(await children()).toHaveLength(0);
  });
});

describe('a project\'s work projects, read by the project page (S12)', () => {
  const list = (parentId: number, actor = 7, organizationId = 9, programId = PROGRAM) =>
    request(app(actor, organizationId)).get(`/api/project-hierarchy/${parentId}/children`).query({ programId });

  it('lists the anchor\'s work projects with their kind, admitted as the project page is', async () => {
    const added = await add(11, cmc);
    await add(11, { name: 'Study 201 biostatistics', workKind: 'biostatistics' });
    const read = await list(11);
    expect(read.status, JSON.stringify(read.body)).toBe(200);
    expect(read.body.data).toMatchObject({ parentId: 11, programId: PROGRAM, anchorProjectId: 11, total: 2 });
    expect(read.body.data.children.map((c: { name: string; workKind: string }) => [c.name, c.workKind])).toEqual([
      ['Drug substance CMC', 'cmc'], ['Study 201 biostatistics', 'biostatistics']]);
    expect(read.body.data.children[0]).toMatchObject({ id: added.body.data.projectId, depth: 1, ownerName: 'Lead', childCount: 0 });
  });

  it('refuses a project outside the program, another organisation\'s member, and a member not on a private project', async () => {
    await add(11, cmc);
    expect((await list(31)).body.error.code).toBe('PARENT_NOT_IN_PROGRAM');
    const foreign = await list(11, 9, 10);
    expect(foreign.status).toBeGreaterThanOrEqual(403); expect(foreign.status).toBeLessThan(500);
    expect(JSON.stringify(foreign.body)).not.toContain('Drug substance CMC');
    await owner.query("INSERT INTO project_visibility_settings(project_id,organization_id,visibility) VALUES(11,9,'private')");
    const outsider = await list(11, 12);
    expect(outsider.status).toBeGreaterThanOrEqual(403); expect(outsider.status).toBeLessThan(500);
    expect(JSON.stringify(outsider.body)).not.toContain('Drug substance CMC');
  });

  it('needs the program named', async () => {
    expect((await request(app()).get('/api/project-hierarchy/11/children')).status).toBe(400);
  });
});


/* P-111 slice 2, the coordinating session's ruling (b) of 2026-11-09: a filing project's writers are admitted on its work
   projects' tasks, in one direction only, through the one task admission (tasking/task-project.ts). Each case calls
   admitTaskCreationProject on a request's own tenant-scoped connection, inside its transaction, as POST /tasks does. */
describe('a work project\'s tasks admit its filing project\'s writers, one direction only (P-111)', () => {
  function admitApp(actor: number, organizationId = 9) {
    const a = express(); a.use(express.json());
    a.use((req, _res, next) => { Object.assign(req, { userId: actor, user: { id: actor, organizationId, role: 'member' }, organizationId }); next(); });
    a.use((req, res, next) => scope.establishRequestTenantScope(req, res, next));
    a.post('/admit', async (req, res) => {
      const { requestPgClient } = await import('../../server/db/requestDb');
      const { admitTaskCreationProject } = await import('../../server/services/tasking/task-project');
      const q = requestPgClient(req);
      await q.query('BEGIN');
      try {
        const admitted = await admitTaskCreationProject(q, { organizationId, actorUserId: actor, projectId: Number(req.body.projectId) });
        await q.query('ROLLBACK');
        res.json({ admitted: admitted.projectId });
      } catch (error) {
        await q.query('ROLLBACK');
        const e = error as { status?: number; code?: string };
        res.status(e.status ?? 500).json({ code: e.code ?? 'UNKNOWN' });
      }
    });
    return a;
  }
  const admit = (actor: number, projectId: number, organizationId = 9) => request(admitApp(actor, organizationId)).post('/admit').send({ projectId });

  /** Two work projects under project 11, created by the lead (7); a parent writer (12, an edit member of 11 only); a
   *  child-only member (13, an edit member of the first work project only). */
  async function family() {
    const cmcChild = (await add(11, cmc)).body.data.projectId as number;
    const sibling = (await add(11, { name: 'Drug product QA', workKind: 'quality' })).body.data.projectId as number;
    await owner.query(`INSERT INTO users(id,name,email,password_hash,status) VALUES(13,'Child member','child@example.test','x','active');
      INSERT INTO organization_users(organization_id,user_id,role) VALUES(9,13,'member');
      INSERT INTO project_members(project_id,organization_id,user_id,role,status) VALUES(11,9,12,'edit','active'),($1,9,13,'edit','active')`
      .replace('$1', String(cmcChild)));
    return { cmcChild, sibling };
  }

  it('admits a writer on the filing project to add on its work project', async () => {
    const { cmcChild } = await family();
    expect((await admit(12, 11)).body).toEqual({ admitted: 11 });
    const res = await admit(12, cmcChild);
    expect(res.status, JSON.stringify(res.body)).toBe(200);
    expect(res.body).toEqual({ admitted: cmcChild });
  });

  it('gives a work project\'s own member nothing on its filing project or on a sibling', async () => {
    const { cmcChild, sibling } = await family();
    expect((await admit(13, cmcChild)).body).toEqual({ admitted: cmcChild });
    for (const elsewhere of [11, sibling]) expect((await admit(13, elsewhere)).status).toBe(403);
  });

  it('gives another organisation nothing on a work project', async () => {
    const { cmcChild } = await family();
    const foreign = await admit(9, cmcChild, 10);
    expect([403, 404]).toContain(foreign.status);
    expect(foreign.body).not.toHaveProperty('admitted');
  });

  it('respects a work project\'s own private visibility: the filing project\'s writer is refused there', async () => {
    const { cmcChild } = await family();
    await owner.query(`INSERT INTO project_visibility_settings(project_id,organization_id,visibility) VALUES($1,9,'private')`, [cmcChild]);
    expect((await admit(12, cmcChild)).status).toBe(403);
    // Its own member is still admitted.
    expect((await admit(13, cmcChild)).body).toEqual({ admitted: cmcChild });
  });
});

/* P-111 item 3, the coordinating session's A1 of 2026-11-09: a filing project's work view rolls up its work projects'
   tasks for the reader the route admitted, decided for all work projects at once by the same rule as the task
   admission. Each case runs loadUnifiedWork on a request's own tenant-scoped connection under row-level security. */
describe('a filing project\'s work rolls up its work projects\' tasks for the admitted reader (P-111 item 3)', () => {
  beforeAll(async () => {
    await owner.query(await tableDdl('migrations/0000_sweet_joseph.sql', ['unified_tasks']));
    for (const file of ['db/migrations/20260727_unified_tasks_mdx_metadata.sql', 'db/migrations/20260807_unified_tasks_soft_delete.sql',
      'migrations/20261023_review_routes.sql']) await owner.query(await readFile(file, 'utf8'));
    await owner.query(`ALTER TABLE unified_tasks ENABLE ROW LEVEL SECURITY; ALTER TABLE unified_tasks FORCE ROW LEVEL SECURITY;
      ${tenantIsolationPolicySql('unified_tasks', 'organization_id')};
      GRANT SELECT, INSERT, UPDATE, DELETE ON unified_tasks TO ${runtimeRole}; GRANT USAGE ON ALL SEQUENCES IN SCHEMA public TO ${runtimeRole}`);
  }, 60_000);
  beforeEach(async () => { await owner.query('TRUNCATE unified_tasks RESTART IDENTITY'); });

  function workApp(actor: number, organizationId = 9) {
    const a = express();
    a.use((req, _res, next) => { Object.assign(req, { userId: actor, user: { id: actor, organizationId, role: 'member' }, organizationId }); next(); });
    a.use((req, res, next) => scope.establishRequestTenantScope(req, res, next));
    a.get('/work/:projectId', async (req, res) => {
      const { requestDb, requestPgClient } = await import('../../server/db/requestDb');
      const { loadUnifiedWork } = await import('../../server/services/unified-work/unified-work-view');
      const view = await loadUnifiedWork({ organizationId, projectId: Number(req.params.projectId),
        rollUpFor: { userId: actor, role: 'member', executor: requestPgClient(req) } }, requestDb(req));
      res.json(view);
    });
    return a;
  }
  const work = async (actor: number, projectId: number, organizationId = 9) => {
    const res = await request(workApp(actor, organizationId)).get(`/work/${projectId}`);
    expect(res.status, JSON.stringify(res.body)).toBe(200);
    return (res.body.items as Array<{ title: string; projectId: number; workProject?: { id: number; name: string } }>)
      .map((i) => [i.title, i.projectId, i.workProject?.name ?? null]);
  };
  const task = (projectId: number, title: string, organizationId = 9) => owner.query(
    `INSERT INTO unified_tasks(task_id,organization_id,title,module_type,status,project_id) VALUES($1,$2,$3,'CMC','pending',$4)`,
    [`t-${projectId}-${title.length}-${Math.random().toString(36).slice(2, 8)}`, organizationId, title, projectId]);

  /** The filing project 11 with its own task; two work projects with one task each; a parent writer (12, edit on 11
   *  only) and a child-only member (13, edit on the CMC work project only). */
  async function family() {
    const cmcChild = (await add(11, cmc)).body.data.projectId as number;
    const sibling = (await add(11, { name: 'Drug product QA', workKind: 'quality' })).body.data.projectId as number;
    await owner.query(`INSERT INTO users(id,name,email,password_hash,status) VALUES(13,'Child member','child@example.test','x','active');
      INSERT INTO organization_users(organization_id,user_id,role) VALUES(9,13,'member');
      INSERT INTO project_members(project_id,organization_id,user_id,role,status) VALUES(11,9,12,'edit','active'),(${cmcChild},9,13,'edit','active')`);
    await task(11, 'Assemble Module 3'); await task(cmcChild, 'Confirm the specification'); await task(sibling, 'Close the CAPA');
    return { cmcChild, sibling };
  }

  it('shows a parent writer each work project\'s tasks, marked with where it lives; the filing project\'s own are unchanged', async () => {
    const { cmcChild, sibling } = await family();
    expect((await work(12, 11)).sort()).toEqual([
      ['Assemble Module 3', 11, null], ['Close the CAPA', sibling, 'Drug product QA'], ['Confirm the specification', cmcChild, 'Drug substance CMC'],
    ].sort());
  });

  it('leaves a private work project\'s tasks out for the parent writer', async () => {
    const { cmcChild, sibling } = await family();
    await owner.query(`INSERT INTO project_visibility_settings(project_id,organization_id,visibility) VALUES($1,9,'private')`, [cmcChild]);
    expect((await work(12, 11)).sort()).toEqual([['Assemble Module 3', 11, null], ['Close the CAPA', sibling, 'Drug product QA']].sort());
  });

  it('gives a reader who is not a writer exactly what the exact rule gives: a non-private work project, never a private one', async () => {
    const { cmcChild, sibling } = await family();
    await owner.query(`INSERT INTO users(id,name,email,password_hash,status) VALUES(14,'Reader','reader@example.test','x','active');
      INSERT INTO organization_users(organization_id,user_id,role) VALUES(9,14,'member');
      INSERT INTO project_members(project_id,organization_id,user_id,role,status) VALUES(11,9,14,'use','active')`);
    // A work project with no private setting is readable by the organisation's members by its own access.
    expect((await work(14, 11)).sort()).toEqual([['Assemble Module 3', 11, null], ['Close the CAPA', sibling, 'Drug product QA'],
      ['Confirm the specification', cmcChild, 'Drug substance CMC']].sort());
    await owner.query(`INSERT INTO project_visibility_settings(project_id,organization_id,visibility) VALUES($1,9,'private')`, [cmcChild]);
    expect((await work(14, 11)).sort()).toEqual([['Assemble Module 3', 11, null], ['Close the CAPA', sibling, 'Drug product QA']].sort());
  });

  it('gives a work project\'s own member its tasks directly, and nothing of its siblings', async () => {
    const { cmcChild } = await family();
    expect(await work(13, cmcChild)).toEqual([['Confirm the specification', cmcChild, null]]);
  });

  it('gives another organisation nothing', async () => {
    await family();
    expect(await work(9, 11, 10)).toEqual([]);
  });
});
