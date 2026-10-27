/** PM-05: real creation/outline/anchor/ledger SQL under a restricted PostgreSQL
 * role and FORCE RLS. Authentication and quota are synthetic; this is a narrow
 * disposable public database, not a full install or deployed-auth claim. */
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
vi.mock('../../server/services/license-manager.js', () => ({ checkProgramQuota: async () => ({ withinQuota: true, currentCount: 0, maxAllowed: 100, unlimited: false }) }));

const suffix = `${process.pid}_${Date.now().toString(36)}`;
const databaseName = `dbpm05_${suffix}`;
const runtimeRole = `dbpm05_rt_${suffix}`;
const runtimePassword = 'pm05-disposable-runtime-password';
let maintenance: Pool;
let owner: Pool;
let runtime: typeof import('../../server/db/runtime');
let store: typeof import('../../server/db/tenantStore');
let router: express.Router;
let clients: express.Router;
let closeOwner: (() => Promise<void>) | undefined;
let closeRuntime: (() => Promise<void>) | undefined;
let lostCommit = false;
let projectionFailure = false;
let discards = 0;
let beforeAnchor: (() => Promise<void>) | undefined;

/** pool.end() can resolve before its clients acknowledge connection end. */
function closePoolAfterClientsEnd(pool: Pool): () => Promise<void> {
  const closing = new Set<Promise<void>>();
  pool.on('connect', client => {
    const ended = new Promise<void>(resolve => { client.once('end', resolve); });
    closing.add(ended);
    void ended.then(() => { closing.delete(ended); });
  });
  return async () => { await pool.end(); await Promise.all(closing); };
}

async function tableDdl(file: string, tables: string[]) {
  const sql = await readFile(file, 'utf8');
  return tables.map(table => {
    const match = sql.match(new RegExp(`CREATE TABLE (?:IF NOT EXISTS )?(?:"?public"?\\.)?"?${table}"?\\s*\\(([\\s\\S]*?)\\n\\);`, 'i'));
    if (!match) throw new Error(`Canonical table missing: ${file}/${table}`);
    return `CREATE TABLE IF NOT EXISTS "${table}" (${match[1]}\n);`;
  }).join('\n');
}

function app(actor = 7, organizationId = 9) {
  const a = express(); a.use(express.json());
  a.use((req, _res, next) => {
    void store.runWithTenantScope({ tenantId: String(organizationId), role: 'member', source: 'test', caller: 'pm05-native-intake' }, async () => {
      Object.assign(req, { userId: actor, userRole: 'admin', user: { id: actor, organizationId, role: 'admin' },
        organizationId, tenantId: organizationId, dbClient: runtime.getPool() });
      next();
    }).catch(next);
  });
  a.use('/api/c2c/projects', router); a.use('/api/clients', clients);
  return a;
}

const body = (clientWorkspaceId: unknown = 71) => ({ name: 'Sponsor A meter', productName: 'Meter', programType: '510k', primaryAgency: 'FDA', clientWorkspaceId });
const create = (clientWorkspaceId: unknown = 71) => request(app()).post('/api/c2c/projects').send(body(clientWorkspaceId));
async function holdings() {
  const tables = ['regulatory_programs', 'projects', 'submissions', 'c2c_documents', 'c2c_document_sections', 'audit_logs', 'c2c_ana_actions'];
  return Object.fromEntries(await Promise.all(tables.map(async table => [table, Number((await owner.query(`SELECT count(*) AS n FROM ${table}`)).rows[0].n)])));
}

beforeAll(async () => {
  maintenance = new Pool({ connectionString: databaseUrl });
  // The canonical writer deliberately checks public's catalog. A disposable
  // database preserves that check without touching the shared test database.
  await maintenance.query(`CREATE DATABASE ${databaseName}`);
  const isolatedUrl = new URL(databaseUrl); isolatedUrl.pathname = `/${databaseName}`;
  owner = new Pool({ connectionString: isolatedUrl.toString() });
  closeOwner = closePoolAfterClientsEnd(owner);
  await owner.query(await tableDdl('migrations/0000_sweet_joseph.sql', [
    'organizations', 'users', 'organization_users', 'client_workspaces', 'projects', 'audit_logs',
  ]));
  await owner.query(`CREATE TABLE project_members(project_id integer,organization_id integer,user_id integer,role text,status text);
    CREATE TABLE project_visibility_settings(project_id integer,organization_id integer,visibility text)`);
  for (const migration of [
    '20260527_mutation_primitives.sql', '20260609_audit_hmac_seal.sql',
    '20260524_program_workbench_schema.sql', '20260907_regulatory_programs_application_number.sql',
    '20260903_regulatory_programs_estar_device_fields.sql', '20261012b_regulatory_programs_eu_device_classes.sql',
    '20260814_projects_regulatory_program_anchor.sql', '20261001b_projects_one_anchor_per_program.sql',
    '20260528_phase9_document_schema.sql', '20260604_submission_core_canonical.sql',
    '20260926b_program_same_org_keys.sql',
    '20260921_audit_logs_chain_seq.sql', '20260929_actor_names.sql',
  ]) await owner.query(await readFile(`migrations/${migration}`, 'utf8'));
  await owner.query(await readFile('migrations/20260925b_submissions_program_anchor.sql', 'utf8'));
  await owner.query(await readFile('db/migrations/20260813_audit_tamper_proof_log.sql', 'utf8'));
  // Only the empty review relationships needed by canonical project admission.
  await owner.query(`CREATE TABLE concept2cure_artifacts(id integer,organization_id integer,project_id integer);
    CREATE TABLE concept2cure_review_assignments(artifact_id integer,reviewer_id integer,organization_id integer,status text)`);
  for (const [table, tenantColumn] of [
    ['organizations','id'], ['organization_users','organization_id'], ['client_workspaces','organization_id'],
    ['projects','organization_id'], ['submissions','organization_id'], ['regulatory_programs','organization_id'], ['c2c_documents','org_id'],
    ['audit_logs','tenant_id'], ['c2c_ana_actions','org_id'], ['project_members','organization_id'],
    ['project_visibility_settings','organization_id'], ['concept2cure_artifacts','organization_id'],
    ['concept2cure_review_assignments','organization_id'],
  ]) await owner.query(`ALTER TABLE ${table} ENABLE ROW LEVEL SECURITY; ALTER TABLE ${table} FORCE ROW LEVEL SECURITY; ${tenantIsolationPolicySql(table, tenantColumn)}`);
  await owner.query(`ALTER TABLE c2c_document_sections ENABLE ROW LEVEL SECURITY; ALTER TABLE c2c_document_sections FORCE ROW LEVEL SECURITY;
    CREATE POLICY document_scope ON c2c_document_sections FOR ALL USING (EXISTS(SELECT 1 FROM c2c_documents d WHERE d.id=document_id))
      WITH CHECK (EXISTS(SELECT 1 FROM c2c_documents d WHERE d.id=document_id))`);
  await provisionAppServiceRole(owner, { env: { APP_SERVICE_DB_ROLE: runtimeRole, APP_SERVICE_DB_PASSWORD: runtimePassword } });
  await owner.query(`GRANT EXECUTE ON FUNCTION public.actor_name(integer) TO ${runtimeRole}`);
  const restrictedUrl = new URL(isolatedUrl); restrictedUrl.username = runtimeRole; restrictedUrl.password = runtimePassword;
  process.env.APP_DATABASE_URL = restrictedUrl.toString(); process.env.RLS_ENFORCE = 'on';
  process.env.PGOPTIONS = '-c search_path=public';
  process.env.AUDIT_HMAC_KEY = 'pm05-synthetic-chain-seal-not-a-production-secret';
  process.env.AUDIT_HMAC_SECRET = 'pm05-synthetic-tamper-seal-not-a-production-secret';
  runtime = await import('../../server/db/runtime'); store = await import('../../server/db/tenantStore');
  const pool = runtime.getPool();
  closeRuntime = closePoolAfterClientsEnd(pool);
  h.pool = {
    async query(sql: string, params?: unknown[]) {
      if (projectionFailure && sql.includes('LEFT JOIN LATERAL public.actor_name')) throw new Error('Synthetic committed projection failure');
      return pool.query(sql, params);
    },
    async connect() {
      const client = await pool.connect();
      return {
        async query(sql: string | {text:string}, params?: unknown[]) {
          const text = typeof sql === 'string' ? sql : sql.text;
          if (beforeAnchor && /INSERT INTO projects\s/.test(text)) await beforeAnchor();
          const result = await client.query(sql, params);
          if (lostCommit && text.trim() === 'COMMIT') { lostCommit = false; throw new Error('Synthetic lost actual COMMIT acknowledgement'); }
          return result;
        },
        release(error?: Error) { if (error) discards++; client.release(error); },
      };
    },
  };
  router = (await import('../../server/routes/c2c/projects')).default;
  clients = (await import('../../server/routes/clients-routes')).default;
  const proof = await store.runWithTenantScope({ tenantId: '9', role: 'member', source: 'test', caller: 'pm05-role-proof' }, () =>
    pool.query('SELECT current_user AS role,rolsuper,rolbypassrls FROM pg_roles WHERE rolname=current_user'));
  expect(proof.rows[0]).toEqual({role:runtimeRole,rolsuper:false,rolbypassrls:false});
}, 120_000);

beforeEach(async () => {
  lostCommit = false; projectionFailure = false; discards = 0; beforeAnchor = undefined;
  await owner.query('ALTER TABLE audit_logs DROP CONSTRAINT IF EXISTS synthetic_intake_ledger_failure');
  await owner.query(`TRUNCATE organizations, users, organization_users, client_workspaces, projects, regulatory_programs,
    submissions, c2c_documents, c2c_document_sections, audit_logs, c2c_ana_actions, project_members, project_visibility_settings RESTART IDENTITY CASCADE`);
  await owner.query(`INSERT INTO organizations(id,name,slug,status) VALUES (9,'Consultancy','consultancy','active'),(10,'Other','other','active');
    INSERT INTO users(id,name,email,password_hash,status) VALUES (7,'Creator','creator@example.test','x','active'),(8,'Other member','member@example.test','x','active'),(9,'Foreign','foreign@example.test','x','active');
    INSERT INTO organization_users(organization_id,user_id,role) VALUES (9,7,'member'),(9,8,'member'),(10,9,'member');
    INSERT INTO client_workspaces(id,organization_id,name,slug,status,metadata) VALUES
      (71,9,'Sponsor A','sponsor-a','active',NULL),(72,9,'Consultancy own','own','active','{"defaultForOrganization":true}'),
      (73,9,'Inactive','inactive','inactive',NULL),(81,10,'Foreign','foreign','active',NULL)`);
});

afterAll(async () => {
  await closeRuntime?.();
  if (owner) { await owner.query(`DROP OWNED BY ${runtimeRole}`).catch(() => undefined); await closeOwner?.(); }
  if (maintenance) {
    await maintenance.query(`DROP DATABASE IF EXISTS ${databaseName}`);
    await maintenance.query(`DROP ROLE IF EXISTS ${runtimeRole}`);
    await maintenance.end();
  }
  delete process.env.PGOPTIONS; delete process.env.AUDIT_HMAC_KEY; delete process.env.AUDIT_HMAC_SECRET;
});

describe('PM-05 current client selection with actual creation transaction and RLS', () => {
  it('lists only current active organization choices and refuses a freshly revoked creator', async () => {
    const r = await request(app()).get('/api/clients?purpose=project-intake');
    expect(r.status,JSON.stringify(r.body)).toBe(200);
    expect(r.body.meta).toMatchObject({purpose:'project-intake',organizationId:9,actorUserId:7});
    expect(r.body.clients.map((row: {id:string}) => row.id).sort()).toEqual(['71','72']);
    await owner.query("UPDATE organization_users SET role='viewer' WHERE user_id=7");
    expect((await request(app()).get('/api/clients?purpose=project-intake')).status).toBe(403);
    expect((await create()).status).toBe(403);
    expect(Object.values(await holdings()).every(n => n===0)).toBe(true);
  });

  it('saves the selected sponsor, real outline and both ledger paths in one native transaction', async () => {
    const r = await create(); expect(r.status,JSON.stringify(r.body)).toBe(201);
    expect(r.body.meta).toMatchObject({organizationId:9,actorUserId:7,clientWorkspaceId:71,clientWorkspaceName:'Sponsor A',projectAnchorCreated:true});
    const saved = (await owner.query(`SELECT p.client_workspace_id,p.regulatory_program_id::text AS program_id,p.xmin::text AS tx,
      d.id AS document_id,d.xmin::text AS doc_tx FROM projects p JOIN c2c_documents d ON d.project_id=p.regulatory_program_id`)).rows[0];
    expect(saved).toMatchObject({client_workspace_id:71,program_id:r.body.data.id,document_id:r.body.meta.documentId,doc_tx:saved.tx});
    const audit = (await owner.query("SELECT new_values,chain_seq,hmac_seal,xmin::text AS tx FROM audit_logs WHERE action='c2c.project.create'")).rows[0];
    expect(audit.new_values.client_workspace_id).toBe(71); expect(audit.tx).toBe(saved.tx); expect(audit.chain_seq).toBeTruthy(); expect(audit.hmac_seal).toBeTruthy();
    expect((await owner.query('SELECT DISTINCT xmin::text AS tx FROM c2c_ana_actions')).rows).toEqual([{tx:saved.tx}]);
    expect(Number((await owner.query('SELECT count(*) AS n FROM c2c_document_sections')).rows[0].n)).toBeGreaterThan(0);
    // Intake changes placement, not the existing org_public fallback. Once
    // private visibility is recorded by the existing sharing policy, another
    // ordinary member cannot read the selected sponsor's program.
    expect((await request(app(8)).get(`/api/c2c/projects/${r.body.data.id}`)).status).toBe(200);
    await owner.query("INSERT INTO project_visibility_settings(project_id,organization_id,visibility) VALUES($1,9,'private')", [r.body.meta.projectAnchorId]);
    expect((await request(app(8)).get(`/api/c2c/projects/${r.body.data.id}`)).status).toBe(404);
    const foreign = await store.runWithTenantScope({tenantId:'10',role:'member',source:'test',caller:'pm05-foreign-read'}, () =>
      runtime.getPool().query('SELECT id FROM projects UNION ALL SELECT org_id FROM c2c_documents'));
    expect(foreign.rows).toEqual([]);
    const chain = await import('../../server/services/audit/chain');
    const verifier = await owner.connect();
    try {
      expect(await chain.verifyAuditChain(verifier,{tenantId:9})).toMatchObject({ok:true,rowsChecked:2,sequencedRows:2,legacyRows:0});
      expect(await chain.verifyAuditChainSeals(verifier,{tenantId:9})).toMatchObject({valid:true,verified:2});
    } finally { verifier.release(); }
  });

  it.each([null,0,'71',73,81,999])('refuses invalid, inactive or foreign explicit choice %s with no partial rows', async choice => {
    const r = await create(choice); expect([400,409]).toContain(r.status);
    expect(Object.values(await holdings()).every(n => n===0)).toBe(true);
  });

  it('keeps the canonical medicinal submission linked to the selected sponsor through the saved program', async () => {
    const r = await request(app()).post('/api/c2c/projects').send({...body(),programType:'ind',productType:'drug'});
    expect(r.status,JSON.stringify(r.body)).toBe(201);
    expect(r.body.meta).toMatchObject({clientWorkspaceId:71,submissionCreated:true});
    const saved = (await owner.query(`SELECT s.id,s.program_id::text,s.xmin::text AS tx,p.xmin::text AS anchor_tx,p.client_workspace_id,
      d.xmin::text AS doc_tx FROM submissions s JOIN projects p ON p.regulatory_program_id=s.program_id
      JOIN c2c_documents d ON d.project_id=s.program_id`)).rows[0];
    expect(saved).toMatchObject({id:r.body.meta.submissionId,program_id:r.body.data.id,client_workspace_id:71,anchor_tx:saved.tx,doc_tx:saved.tx});
    const audit = (await owner.query("SELECT new_values,xmin::text AS tx FROM audit_logs WHERE action='c2c.project.create'")).rows[0];
    expect(audit.new_values).toMatchObject({submission_id:saved.id,client_workspace_id:71}); expect(audit.tx).toBe(saved.tx);
  });

  it('refuses omitted multi-client intent despite the marked default and contradictory header', async () => {
    const omitted = {...body(),clientWorkspaceId:undefined};
    expect((await request(app()).post('/api/c2c/projects').send(omitted)).status).toBe(409);
    expect((await request(app()).post('/api/c2c/projects').set('x-client-id','72').send(body())).status).toBe(409);
    expect(Object.values(await holdings()).every(n => n===0)).toBe(true);
  });

  it('keeps the one-active-workspace compatibility path honest', async () => {
    await owner.query("UPDATE client_workspaces SET status='inactive' WHERE id=72");
    const omitted = {...body(),clientWorkspaceId:undefined};
    const r = await request(app()).post('/api/c2c/projects').send(omitted);
    expect(r.status,JSON.stringify(r.body)).toBe(201); expect(r.body.meta.clientWorkspaceId).toBe(71);
  });

  it.each(['510k','ind'])('rolls back the real %s program, outline, anchor, submission and scaffold audit if creation audit fails', async programType => {
    await owner.query("ALTER TABLE audit_logs ADD CONSTRAINT synthetic_intake_ledger_failure CHECK (action <> 'c2c.project.create') NOT VALID");
    const r = await request(app()).post('/api/c2c/projects').send({...body(),programType,...(programType==='ind'?{productType:'drug'}:{})});
    expect(r.status).toBeGreaterThanOrEqual(500);
    expect(Object.values(await holdings()).every(n => n===0)).toBe(true);
  });

  it('retains the selected active workspace lock through all creation writes', async () => {
    beforeAnchor = async () => {
      const contender = await owner.connect();
      try {
        await contender.query("SET lock_timeout='100ms'");
        await expect(contender.query("UPDATE client_workspaces SET status='inactive' WHERE id=71")).rejects.toMatchObject({code:'55P03'});
      } finally { await contender.query('RESET lock_timeout'); contender.release(); }
    };
    const r = await create(); expect(r.status,JSON.stringify(r.body)).toBe(201);
  });

  it('discards a connection after lost actual COMMIT acknowledgement and reports uncertainty without claiming rollback', async () => {
    lostCommit = true; const r = await create();
    expect(r.status).toBe(503); expect(r.body.error).toBe('PROJECT_CREATE_OUTCOME_UNKNOWN'); expect(r.body.created).toBeUndefined();
    expect(discards).toBe(1); expect((await holdings()).projects).toBe(1);
  });

  it('reports confirmed creation separately when the committed card projection is unavailable', async () => {
    projectionFailure = true; const r = await create();
    expect(r.status).toBe(503); expect(r.body).toMatchObject({error:'PROJECT_CREATED_DETAILS_UNAVAILABLE',created:true,organizationId:9,actorUserId:7,clientWorkspaceId:71});
    expect(discards).toBe(0); expect((await holdings()).projects).toBe(1);
  });
});
