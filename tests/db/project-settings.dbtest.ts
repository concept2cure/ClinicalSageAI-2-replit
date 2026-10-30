/** PM-06 real profile/audit SQL on a restricted native PostgreSQL role.
 * Authentication/request assembly is synthetic; the narrow disposable schema
 * is not a full installation or deployed authentication qualification. */
import express from 'express';
import request from 'supertest';
import { readFile } from 'node:fs/promises';
import { Pool } from 'pg';
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { databaseUrl } from '../setup.db';
import { tenantIsolationPolicySql } from './harness';
import { provisionAppServiceRole } from '../../scripts/db/provision-app-role.mjs';

const h = vi.hoisted(() => ({ pool: null as unknown }));
vi.mock('../../server/db.js', () => ({ get pool() { return h.pool; } }));
vi.mock('../../server/auth', () => ({ authMiddleware: (_q: unknown, _s: unknown, next: () => void) => next() }));
const PROGRAM = '9a7f0b10-0000-4000-8000-0000000000aa';
const FOREIGN = '9a7f0b10-0000-4000-8000-0000000000bb';
const suffix = `${process.pid}_${Date.now().toString(36)}`;
const databaseName = `dbpm06_${suffix}`, runtimeRole = `dbpm06_rt_${suffix}`;
let maintenance: Pool, owner: Pool;
let runtime: typeof import('../../server/db/runtime');
let store: typeof import('../../server/db/tenantStore');
let router: express.Router;
let lostCommit = false, lostRollback = false, discards = 0;
let beforeUpdate: (() => Promise<void>) | undefined;

async function tableDdl(file: string, tables: string[]) {
  const source = await readFile(file, 'utf8');
  return tables.map(table => {
    const match = source.match(new RegExp(`CREATE TABLE (?:IF NOT EXISTS )?(?:"?public"?\\.)?"?${table}"?\\s*\\(([\\s\\S]*?)\\n\\);`, 'i'));
    if (!match) throw new Error(`Canonical table missing: ${file}/${table}`);
    return `CREATE TABLE IF NOT EXISTS "${table}" (${match[1]}\n);`;
  }).join('\n');
}

function app(actor = 7, organizationId = 9) {
  const a = express(); a.use(express.json());
  a.use((req, _res, next) => {
    void store.runWithTenantScope({ tenantId: String(organizationId), accountId: actor, role: 'member', source: 'request', caller: 'pm06-native-settings' }, async () => {
      Object.assign(req, { userId: actor, userRole: 'admin', user: { id: actor, organizationId, role: 'admin' },
        organizationId, tenantId: organizationId, dbClient: runtime.getPool() });
      next();
    }).catch(next);
  });
  a.use('/api/c2c/projects', router); return a;
}
const path = `/api/c2c/projects/${PROGRAM}/settings`;
const read = () => request(app()).get(path).set('x-client-id', '71');
const save = (revision: string, patch: Record<string, unknown> = { priority: 'high' }) =>
  request(app()).patch(path).set('x-client-id', '71').send({ revision, reason: 'Agreed revised delivery baseline', patch });
async function auditRows() { return (await owner.query("SELECT *,xmin::text AS tx FROM audit_logs WHERE action='c2c.project.settings.update' ORDER BY chain_seq")).rows; }
async function retainedWork() {
  const tables = ['projects', 'project_workflow_stages', 'project_schedule_of_events', 'project_schedule_goals', 'project_schedule_revisions', 'program_milestones', 'c2c_documents', 'c2c_document_sections'];
  return Object.fromEntries(await Promise.all(tables.map(async table => [table, (await owner.query(`SELECT to_jsonb(t) AS row,xmin::text AS tx FROM ${table} t ORDER BY id`)).rows])));
}

beforeAll(async () => {
  maintenance = new Pool({ connectionString: databaseUrl });
  await maintenance.query(`CREATE DATABASE ${databaseName}`);
  const isolated = new URL(databaseUrl); isolated.pathname = `/${databaseName}`;
  owner = new Pool({ connectionString: isolated.toString() });
  await owner.query(await tableDdl('migrations/0000_sweet_joseph.sql', [
    'organizations', 'users', 'organization_users', 'client_workspaces', 'projects', 'audit_logs', 'project_workflow_stages',
  ]));
  await owner.query(`CREATE TABLE project_members(project_id integer,organization_id integer,user_id integer,role text,status text);
    CREATE TABLE project_visibility_settings(project_id integer,organization_id integer,visibility text);
    CREATE TABLE concept2cure_artifacts(id integer,organization_id integer,project_id integer);
    CREATE TABLE concept2cure_review_assignments(id serial PRIMARY KEY,artifact_id integer,reviewer_id integer,organization_id integer,status text)`);
  for (const migration of [
    '20260527_mutation_primitives.sql', '20260609_audit_hmac_seal.sql', '20260524_program_workbench_schema.sql',
    '20260814_projects_regulatory_program_anchor.sql', '20261001b_projects_one_anchor_per_program.sql',
    '20260528_phase9_document_schema.sql', '20260921_audit_logs_chain_seq.sql', '20260929_actor_names.sql',
  ]) await owner.query(await readFile(`migrations/${migration}`, 'utf8'));
  await owner.query(await readFile('db/migrations/20260617_project_schedule_of_events.sql', 'utf8'));
  await owner.query(await readFile('db/migrations/20260813_audit_tamper_proof_log.sql', 'utf8'));
  for (const [table, column] of [
    ['organizations', 'id'], ['organization_users', 'organization_id'], ['client_workspaces', 'organization_id'],
    ['projects', 'organization_id'], ['regulatory_programs', 'organization_id'], ['audit_logs', 'tenant_id'],
    ['project_members', 'organization_id'], ['project_visibility_settings', 'organization_id'],
    ['concept2cure_artifacts', 'organization_id'], ['concept2cure_review_assignments', 'organization_id'],
    ['project_workflow_stages', 'organization_id'], ['project_schedule_of_events', 'organization_id'],
    ['project_schedule_goals', 'organization_id'], ['project_schedule_revisions', 'organization_id'], ['c2c_documents', 'org_id'],
  ]) await owner.query(`ALTER TABLE ${table} ENABLE ROW LEVEL SECURITY; ALTER TABLE ${table} FORCE ROW LEVEL SECURITY; ${tenantIsolationPolicySql(table, column)}`);
  await owner.query(`ALTER TABLE program_milestones ENABLE ROW LEVEL SECURITY; ALTER TABLE program_milestones FORCE ROW LEVEL SECURITY;
    CREATE POLICY milestone_parent_scope ON program_milestones FOR ALL USING (EXISTS(SELECT 1 FROM regulatory_programs p WHERE p.id=program_id));
    ALTER TABLE c2c_document_sections ENABLE ROW LEVEL SECURITY; ALTER TABLE c2c_document_sections FORCE ROW LEVEL SECURITY;
    CREATE POLICY section_parent_scope ON c2c_document_sections FOR ALL USING (EXISTS(SELECT 1 FROM c2c_documents d WHERE d.id=document_id))`);
  await provisionAppServiceRole(owner, { env: { APP_SERVICE_DB_ROLE: runtimeRole, APP_SERVICE_DB_PASSWORD: 'pm06-disposable-runtime-password' } });
  const restricted = new URL(isolated); restricted.username = runtimeRole; restricted.password = 'pm06-disposable-runtime-password';
  process.env.APP_DATABASE_URL = restricted.toString(); process.env.RLS_ENFORCE = 'on'; process.env.PGOPTIONS = '-c search_path=public';
  process.env.AUDIT_HMAC_KEY = 'pm06-synthetic-ledger-key'; process.env.AUDIT_HMAC_SECRET = 'pm06-synthetic-audit-key';
  runtime = await import('../../server/db/runtime'); store = await import('../../server/db/tenantStore');
  const pool = runtime.getPool();
  h.pool = {
    query: (sql: string, params?: unknown[]) => pool.query(sql, params),
    async connect() {
      const client = await pool.connect();
      return {
        async query(sql: string | { text: string }, params?: unknown[]) {
          const text = typeof sql === 'string' ? sql : sql.text;
          if (beforeUpdate && /^update "regulatory_programs"/i.test(text)) await beforeUpdate();
          const result = await client.query(sql, params);
          if (lostCommit && text.trim() === 'COMMIT') { lostCommit = false; throw new Error('Synthetic lost actual COMMIT acknowledgement'); }
          if (lostRollback && text.trim() === 'ROLLBACK') { lostRollback = false; throw new Error('Synthetic lost actual rollback acknowledgement'); }
          return result;
        },
        release(error?: Error) { if (error) discards++; client.release(error); },
      };
    },
  };
  router = (await import('../../server/routes/c2c/projects')).default;
  const role = await store.runWithTenantScope({ tenantId: '9', role: 'member', source: 'test', caller: 'pm06-role-proof' }, () =>
    pool.query('SELECT current_user AS role,rolsuper,rolbypassrls FROM pg_roles WHERE rolname=current_user'));
  expect(role.rows[0]).toEqual({ role: runtimeRole, rolsuper: false, rolbypassrls: false });
}, 120_000);

beforeEach(async () => {
  lostCommit = false; lostRollback = false; discards = 0; beforeUpdate = undefined;
  await owner.query('ALTER TABLE audit_logs DROP CONSTRAINT IF EXISTS synthetic_settings_audit_failure');
  await owner.query(`TRUNCATE organizations,users,organization_users,client_workspaces,projects,regulatory_programs,
    audit_logs,project_members,project_visibility_settings,project_workflow_stages,project_schedule_of_events,
    project_schedule_goals,project_schedule_revisions,c2c_documents,c2c_document_sections RESTART IDENTITY CASCADE`);
  await owner.query(`INSERT INTO organizations(id,name,slug,status) VALUES(9,'Consultancy','consultancy','active'),(10,'Other','other','active');
    INSERT INTO users(id,name,email,password_hash,status) VALUES(7,'Lead','lead@example.test','x','active'),(8,'Member','member@example.test','x','active'),(9,'Foreign','foreign@example.test','x','active');
    INSERT INTO organization_users(organization_id,user_id,role) VALUES(9,7,'member'),(9,8,'member'),(10,9,'member');
    INSERT INTO client_workspaces(id,organization_id,name,slug,status) VALUES(71,9,'Sponsor A','sponsor-a','active'),(72,9,'Sponsor B','sponsor-b','active'),(81,10,'Foreign','foreign','active');
    INSERT INTO regulatory_programs(id,organization_id,name,code,program_type,product_type,primary_agency,product_name,
      description,priority,target_submission_date,actual_submission_date,approval_date,status,lead_user_id,progress_percent,completed_milestones)
      VALUES('${PROGRAM}',9,'Program A','PA','IND','drug','FDA','Product A','Original description','medium','2027-01-01','2026-09-01','2026-09-20','active',7,80,2),
      ('${FOREIGN}',10,'Foreign','PF','IND','drug','FDA','Foreign product','Foreign description','medium','2027-01-01',NULL,NULL,'active',9,0,0);
    INSERT INTO projects(id,organization_id,client_workspace_id,name,type,owner_id,created_by_id,regulatory_program_id) VALUES(11,9,71,'Program A','IND',7,7,'${PROGRAM}'),(21,10,81,'Foreign','IND',9,9,'${FOREIGN}');
    INSERT INTO project_workflow_stages(organization_id,project_id,name,"order",status,end_date,due_date,metadata)
      VALUES(9,11,'Completed study',1,'completed','2026-08-01','2026-08-02','{"source":"ana_schedule_of_events","evidenceId":"retained-source"}');
    INSERT INTO project_schedule_of_events(id,organization_id,project_id,version,target_date) VALUES(1,9,11,3,'2027-01-01');
    INSERT INTO project_schedule_goals(organization_id,project_id,schedule_id,title,status,target_date) VALUES(9,11,1,'Accepted report','completed','2026-08-01');
    INSERT INTO project_schedule_revisions(organization_id,project_id,schedule_id,revision_type,summary) VALUES(9,11,1,'baseline','Original accepted baseline');
    INSERT INTO program_milestones(program_id,name,category,target_date,actual_date,status,progress) VALUES('${PROGRAM}','Completed report','clinical','2026-08-02','2026-08-01','completed',100);
    INSERT INTO c2c_documents(id,org_id,project_id,doc_type,agency,rule_pack_version,title,status,artifact_id,locked_at)
      SELECT 'doc-settings',9,'${PROGRAM}',doc_type,agency,version,'Approved report','locked','retained-exact-version','2026-09-01' FROM c2c_rule_packs WHERE doc_type='ind' AND agency='fda' LIMIT 1;
    INSERT INTO c2c_document_sections(document_id,section_key,label,path_order,status,version,content) VALUES('doc-settings','m2.5','Approved text',1,'locked',5,'{"text":"Retain exact approved evidence"}')`);
});

afterAll(async () => {
  if (runtime) await runtime.getPool().end();
  if (owner) { await owner.query(`DROP OWNED BY ${runtimeRole}`).catch(() => undefined); await owner.end(); }
  if (maintenance) { await maintenance.query(`DROP DATABASE IF EXISTS ${databaseName}`); await maintenance.query(`DROP ROLE IF EXISTS ${runtimeRole}`); await maintenance.end(); }
  delete process.env.PGOPTIONS; delete process.env.AUDIT_HMAC_KEY; delete process.env.AUDIT_HMAC_SECRET;
});

describe('native governed project settings', () => {
  it('commits exact reviewed fields and their chained reason/before-after audit together, preserving actuals and approved work', async () => {
    const initial = await read(); expect(initial.status, JSON.stringify(initial.body)).toBe(200);
    const work = await retainedWork();
    const dates = (await owner.query('SELECT actual_submission_date,approval_date,progress_percent,completed_milestones FROM regulatory_programs WHERE id=$1', [PROGRAM])).rows;
    const result = await save(initial.body.data.revision, { description: ' Revised description ', priority: 'high', targetSubmissionDate: '2028-02-29' });
    expect(result.status, JSON.stringify(result.body)).toBe(200);
    expect(result.body.data).toMatchObject({ programId: PROGRAM, projectId: 11, organizationId: 9, actorUserId: 7, clientWorkspaceId: 71, description: 'Revised description', priority: 'high', targetSubmissionDate: '2028-02-29' });
    expect(result.body.data.revision).not.toBe(initial.body.data.revision);
    const [audit] = await auditRows(); const changed = (await owner.query('SELECT xmin::text AS tx FROM regulatory_programs WHERE id=$1', [PROGRAM])).rows[0];
    expect(audit.tx).toBe(changed.tx); expect(audit.reason).toBe('Agreed revised delivery baseline');
    expect(audit.new_values.before).toMatchObject({ description: 'Original description', priority: 'medium' });
    expect(audit.new_values.after).toMatchObject({ description: 'Revised description', priority: 'high', targetSubmissionDate: '2028-02-29' });
    expect(audit.new_values).toMatchObject({ projectId: 11, clientWorkspaceId: 71 });
    expect(await retainedWork()).toEqual(work);
    expect((await owner.query('SELECT actual_submission_date,approval_date,progress_percent,completed_milestones FROM regulatory_programs WHERE id=$1', [PROGRAM])).rows).toEqual(dates);
    const chain = await import('../../server/services/audit/chain'); const verifier = await owner.connect();
    try { expect(await chain.verifyAuditChain(verifier, { tenantId: 9 })).toMatchObject({ ok: true, rowsChecked: 1 }); expect(await chain.verifyAuditChainSeals(verifier, { tenantId: 9 })).toMatchObject({ valid: true, verified: 1 }); }
    finally { verifier.release(); }
  });

  it('persists deliberate clearing and refuses a semantic no-op without a second audit', async () => {
    const first = await read(); const cleared = await save(first.body.data.revision, { description: ' ', targetSubmissionDate: null });
    expect(cleared.status, JSON.stringify(cleared.body)).toBe(200); expect(cleared.body.data).toMatchObject({ description: null, targetSubmissionDate: null });
    expect((await save(cleared.body.data.revision, { description: null, targetSubmissionDate: null })).status).toBe(409);
    expect(await auditRows()).toHaveLength(1);
  });

  it('serializes two real editors into one save and one stale refusal without a lock-upgrade deadlock', async () => {
    const first = await read(); expect(first.status, JSON.stringify(first.body)).toBe(200);
    let enter!: () => void, resume!: () => void;
    const entered = new Promise<void>(resolve => { enter = resolve; }); const resumed = new Promise<void>(resolve => { resume = resolve; });
    beforeUpdate = async () => { beforeUpdate = undefined; enter(); await resumed; };
    const saving = save(first.body.data.revision).then(result => result);
    await Promise.race([entered, saving.then(result => { throw new Error(`Save did not reach the locked update: ${result.status} ${JSON.stringify(result.body)}`); })]);
    const competing = save(first.body.data.revision, { priority: 'critical' }).then(result => result);
    try {
      let waiting = false;
      for (let i = 0; i < 40; i++) {
        waiting = (await owner.query("SELECT 1 FROM pg_stat_activity WHERE usename=$1 AND wait_event_type='Lock' AND query ILIKE '%regulatory_programs%'", [runtimeRole])).rowCount! > 0;
        if (waiting) break; await new Promise(resolve => setTimeout(resolve, 25));
      }
      expect(waiting).toBe(true);
    } finally { resume(); }
    expect((await saving).status).toBe(200); expect((await competing).status).toBe(409); expect(await auditRows()).toHaveLength(1);
  });

  it('rolls profile changes back if the actual chained-audit insert fails', async () => {
    const initial = await read(); await owner.query("ALTER TABLE audit_logs ADD CONSTRAINT synthetic_settings_audit_failure CHECK(action<>'c2c.project.settings.update')");
    const result = await save(initial.body.data.revision); expect(result.status).toBeGreaterThanOrEqual(500);
    expect((await read()).body.data).toEqual(initial.body.data); expect(await auditRows()).toHaveLength(0);
    expect(JSON.stringify(result.body)).not.toContain('synthetic_settings_audit_failure');
  });

  it('reports unknown after a real committed save loses its acknowledgement and discards once', async () => {
    const first = await read(); lostCommit = true; const result = await save(first.body.data.revision);
    expect(result.status).toBe(503); expect(result.body.error).toBe('PROJECT_SETTINGS_OUTCOME_UNKNOWN'); expect(discards).toBe(1);
    expect((await read()).body.data.priority).toBe('high'); expect(await auditRows()).toHaveLength(1);
    expect(JSON.stringify(result.body)).not.toMatch(/nothing (was )?(saved|changed)|not saved/i);
  });

  it('does not claim absence when rollback acknowledgement is lost', async () => {
    const first = await read(); await owner.query("ALTER TABLE audit_logs ADD CONSTRAINT synthetic_settings_audit_failure CHECK(action<>'c2c.project.settings.update')"); lostRollback = true;
    const result = await save(first.body.data.revision); expect(result.status).toBe(503); expect(result.body.error).toBe('PROJECT_SETTINGS_OUTCOME_UNKNOWN'); expect(discards).toBe(1);
    expect((await read()).body.data).toEqual(first.body.data); expect(await auditRows()).toHaveLength(0);
  });

  it('uses current persisted role and active membership rather than the stale administrator request claim', async () => {
    const first = await read(); await owner.query("UPDATE organization_users SET role='viewer' WHERE organization_id=9 AND user_id=7");
    expect((await read()).body.data.canChange).toBe(false); expect((await save(first.body.data.revision)).status).toBe(403);
    await owner.query("UPDATE users SET status='inactive' WHERE id=7"); expect((await read()).status).toBe(404); expect(await auditRows()).toHaveLength(0);
  });

  it('retains private/cross-organization admission and refuses a contradictory workspace claim', async () => {
    expect((await request(app()).get(path).set('x-client-id', '72')).status).toBe(409);
    await owner.query("INSERT INTO project_visibility_settings(project_id,organization_id,visibility) VALUES(11,9,'private')");
    expect((await request(app(8)).get(path)).status).toBe(404); expect((await request(app(9, 10)).get(path)).status).toBe(404);
    const rows = await store.runWithTenantScope({ tenantId: '10', role: 'member', source: 'test', caller: 'pm06-cross-org' }, () => runtime.getPool().query('SELECT id::text FROM regulatory_programs ORDER BY id'));
    expect(rows.rows).toEqual([{ id: FOREIGN }]); expect(await auditRows()).toHaveLength(0);
  });
});
