/** Draft only: retained invocation-owned SQL and transparent native HTTP observation. */
import { createHash, randomUUID } from 'node:crypto';
import { writeFileSync } from 'node:fs';
import express from 'express';
import jwt from 'jsonwebtoken';
import { Pool, type QueryConfig, type QueryResultRow } from 'pg';
import request from 'supertest';
import { expect } from 'vitest';
import { databaseUrl } from '../setup.db';
import { getPool } from '../../server/db';
import { createAuthBoundary } from '../../server/middleware/authBoundary';
import { authenticateToken } from '../../server/middleware/auth';
import { requireTenantContext } from '../../server/middleware/tenantContext';
import { LazyRequestDbClient, type RequestDbClient } from '../../server/middleware/lazyRequestDbClient';
import { activeJwtSecret } from '../../server/utils/jwtVerify';
import { nativeCatalogRunId, seedNativeCatalogProject, withNativeCatalogClient } from './catalog-native-fixture';

export const BODY = 'Invented QA device description: a retained synthetic instrument measures a controlled sample. This is test prose, not a clinical or regulatory claim.';
export const sha = (value: string) => createHash('sha256').update(value).digest('hex');
export interface Actor { id: number; organizationId: number; organizationUuid: string; role: string; token: string }
export interface Program { id: string; projectId: number; organizationId: number; owner: Actor; type: string; region: string; pathway: string; title: string }
export interface Filing { id: number; sequenceId: number; leafId: number | null; sectionId: number | null; documentId: string | null; program: Program | null; title: string }
interface FilingOptions { status?: string; body?: string; pin?: string | null; pointer?: boolean; recorded?: boolean; deleted?: boolean }
export interface NativeFacts { posture: Record<string, unknown>; sql: string[]; pids: number[]; lazy: boolean }
type AfterQuery = (sql: string) => Promise<void>;
const postureSql = `SELECT current_database() AS database,current_user AS role,pg_backend_pid() AS pid,
  r.rolsuper,r.rolbypassrls,current_setting('app.rls_enforce',true) AS enforcement,
  current_setting('app.current_tenant_id',true) AS tenant,current_setting('app.current_user_role',true) AS user_role,
  current_setting('app.bypass_rls',true) AS bypass,current_setting('app.is_admin',true) AS admin
  FROM pg_roles r WHERE r.rolname=current_user`;
const STORES = ['users', 'organization_users', 'regulatory_programs', 'projects',
  'project_visibility_settings', 'project_members', 'submissions', 'submission_regions', 'ectd_sequences',
  'submission_leaves', 'c2c_documents', 'c2c_document_sections'];

export class NativeSubmissionFixture {
  readonly tag = `sdd_${nativeCatalogRunId()}`;
  readonly owner = new Pool({ connectionString: databaseUrl, max: 3 });
  readonly app = express();
  readonly actors: Record<string, Actor> = {};
  readonly programs: Record<string, Program> = {};
  readonly filings: Record<string, Filing> = {};
  readonly facts = new Map<string, NativeFacts>();
  readonly barriers = new Map<string, AfterQuery>();
  readonly observations: Record<string, unknown> = { namespace: this.tag, cases: {} };
  organizationId = 0;
  organizationUuid = '';
  foreignOrganizationId = 0;
  foreignOrganizationUuid = '';
  database = '';
  rulePackVersion = '';

  async setup() {
    this.validateTargets();
    await this.verifyStoresBeforeFixtureWrites();
    const home = await this.organization('home');
    const foreign = await this.organization('foreign');
    this.organizationId = home.id; this.organizationUuid = home.uuid;
    this.foreignOrganizationId = foreign.id; this.foreignOrganizationUuid = foreign.uuid;
    for (const name of ['owner', 'member', 'unassigned', 'demoted', 'disabled', 'late']) await this.actor(name);
    await this.actor('manager', 'manager');
    await this.actor('missing-ou', 'member', false);
    await this.actor('foreign', 'member', true, true);
    this.programs.private = await this.program('private');
    this.programs.public = await this.program('public', { visibility: 'org_public' });
    this.programs.foreign = await this.program('foreign', { foreign: true, visibility: 'org_public' });
    this.programs.ind = await this.program('ind', { type: 'IND', pathway: 'ectd_v322' });
    this.programs.mdr = await this.program('mdr', { type: 'EU_MDR_TECHDOC', region: 'eu', pathway: 'mdr' });
    await this.member(this.programs.private, this.actors.member);
    for (const name of ['private', 'public', 'foreign', 'ind', 'mdr']) this.filings[name] = await this.filing(name, this.programs[name]);
    this.filings.unanchored = await this.filing('unanchored', null);
    await new Promise(resolve => setTimeout(resolve, 1100));
    for (const actor of Object.values(this.actors)) this.mint(actor);
    await this.installRoutes();
    Object.assign(this.observations, { organizationId: this.organizationId,
      programs: Object.fromEntries(Object.entries(this.programs).map(([name, program]) => [name, {
        id: program.id, projectId: program.projectId, organizationId: program.organizationId,
        ownerId: program.owner.id, type: program.type, region: program.region, pathway: program.pathway,
      }])),
      filings: Object.fromEntries(Object.entries(this.filings).map(([name, filing]) => [name, {
        id: filing.id, sequenceId: filing.sequenceId, leafId: filing.leafId,
        sectionId: filing.sectionId, documentId: filing.documentId, programId: filing.program?.id ?? null,
      }])),
    }); // No access token or database credential enters observations.
  }

  private validateTargets() {
    if (!process.env.APP_DATABASE_URL) throw new Error('Actual restricted APP_DATABASE_URL is required.');
    const owner = new URL(databaseUrl); const runtime = new URL(process.env.APP_DATABASE_URL);
    if (runtime.username !== 'app_service' || owner.pathname !== runtime.pathname || owner.hostname !== runtime.hostname ||
      (owner.port || '5432') !== (runtime.port || '5432')) throw new Error('Owner/runtime target mismatch.');
    this.database = decodeURIComponent(owner.pathname.slice(1));
    const approvedLocalDatabase = 'platform_ci_sharing_blank_20261014_d25f4a7b';
    const approvedLocal = this.database === approvedLocalDatabase && process.env.SUBMISSION_REQUIRED_DELIVERABLES_NATIVE_DATABASE === approvedLocalDatabase;
    const canonicalCi = this.database === 'concept2cure-ri_dbtest' && process.env.CI === 'true' && process.env.NODE_ENV === 'test';
    if (!approvedLocal && !canonicalCi) throw new Error('This fixture requires the explicitly reviewed QA target or canonical disposable CI database.');
  }

  private async verifyStoresBeforeFixtureWrites() {
    // A technical read-only role probe, not authorization or an admitted application actor.
    await withNativeCatalogClient({ organizationId: 1, organizationUuid: '', userId: 1, role: 'member', caller: 'sdd-native-posture-only' }, async q => {
      const row = (await q.query(postureSql)).rows[0];
      expect(row).toMatchObject({ database: this.database, role: 'app_service', rolsuper: false, rolbypassrls: false, enforcement: 'on', bypass: '', admin: '' });
      this.observations.preflightRuntime = row;
    });
    const rows = (await this.owner.query(`SELECT relname,relrowsecurity,relforcerowsecurity FROM pg_class
      WHERE relnamespace='public'::regnamespace AND relname=ANY($1::text[]) ORDER BY relname`, [STORES])).rows;
    expect(rows).toHaveLength(STORES.length);
    expect(rows.every(row => row.relrowsecurity && row.relforcerowsecurity)).toBe(true);
    this.observations.stores = rows;
    const packs = (await this.owner.query<{ version: string }>("SELECT version FROM c2c_rule_packs WHERE doc_type='k510' AND agency='fda' AND superseded_by IS NULL ORDER BY effective_from DESC,version DESC LIMIT 1")).rows;
    expect(packs).toHaveLength(1);
    this.rulePackVersion = packs[0].version;
  }

  private async organization(name: string) {
    return (await this.owner.query<{ id: number; uuid: string }>("INSERT INTO organizations(name,slug,status,tier) VALUES($1,$1,'active','standard') RETURNING id,uuid", [`${this.tag}-${name}`])).rows[0];
  }

  async actor(name: string, role = 'member', membership = true, foreign = false): Promise<Actor> {
    const organizationId = foreign ? this.foreignOrganizationId : this.organizationId;
    const organizationUuid = foreign ? this.foreignOrganizationUuid : this.organizationUuid;
    const id = Number((await this.owner.query<{ id: number }>(`INSERT INTO users(email,name,password_hash,status,default_organization_id)
      VALUES($1,$2,'fixture-not-a-password','active',$3) RETURNING id`, [`${this.tag}-${name}@example.invalid`, `${this.tag} ${name}`, organizationId])).rows[0].id);
    if (membership) await this.owner.query('INSERT INTO organization_users(organization_id,user_id,role) VALUES($1,$2,$3)', [organizationId, id, role]);
    const actor = { id, organizationId, organizationUuid, role, token: '' };
    this.actors[name] = actor;
    return actor;
  }

  mint(actor: Actor, claimedRole = actor.role) {
    actor.token = jwt.sign({ type: 'access', userId: actor.id, organizationId: String(actor.organizationId), organizationUuid: actor.organizationUuid, role: claimedRole }, activeJwtSecret(), { expiresIn: '20m' });
  }

  async program(name: string, options: { visibility?: string; foreign?: boolean; type?: string; region?: string; pathway?: string } = {}): Promise<Program> {
    const owner = this.actors[options.foreign ? 'foreign' : 'owner']; const id = randomUUID(); const title = `${this.tag} ${name} invented device programme`;
    const type = options.type ?? 'US_510K'; const region = options.region ?? 'fda'; const pathway = options.pathway ?? 'estar';
    const productType = type === 'IND' ? 'drug' : 'device'; const agency = region === 'eu' ? 'EMA' : region === 'jp' ? 'PMDA' : 'FDA';
    await this.owner.query(`INSERT INTO regulatory_programs(id,organization_id,name,code,program_type,product_type,primary_agency,product_name,lead_user_id,status)
      VALUES($1,$2,$3,$4,$5,$6,$7,'Invented QA product',$8,'active')`, [id, owner.organizationId, title, `SDD-${id.slice(0, 8)}`, type, productType, agency, owner.id]);
    const { projectId } = await seedNativeCatalogProject(this.owner, { organizationId: owner.organizationId, userId: owner.id, programId: id, namespace: `${this.tag}-${name}-${id.slice(0, 8)}` });
    await this.owner.query('INSERT INTO project_visibility_settings(organization_id,project_id,visibility) VALUES($1,$2,$3)', [owner.organizationId, projectId, options.visibility ?? 'private']);
    return { id, projectId, organizationId: owner.organizationId, owner, type, region, pathway, title };
  }

  async member(program: Program, actor: Actor) {
    await this.owner.query("INSERT INTO project_members(organization_id,project_id,user_id,role,status) VALUES($1,$2,$3,'use','active')", [program.organizationId, program.projectId, actor.id]);
  }

  async filing(name: string, program: Program | null, options: FilingOptions = {}): Promise<Filing> {
    const actor = program?.owner ?? this.actors.owner; const title = `${this.tag} ${name} retained filing`;
    const id = Number((await this.owner.query<{ id: number }>(`INSERT INTO submissions(title,application_type,client_type,primary_region,organization_id,created_by,program_id,deleted_at)
      VALUES($1,$2,'mdx',$3,$4,$5,$6,CASE WHEN $7 THEN now() ELSE NULL END) RETURNING id`, [title, program?.type ?? 'US_510K', program?.region ?? 'fda', actor.organizationId, actor.id, program?.id ?? null, Boolean(options.deleted)])).rows[0].id);
    const sequenceId = Number((await this.owner.query<{ id: number }>(`INSERT INTO ectd_sequences(submission_id,region,sequence_number,type,organization_id,created_by)
      VALUES($1,$2,'0000','amendment',$3,$4) RETURNING id`, [id, program?.region ?? 'fda', actor.organizationId, actor.id])).rows[0].id);
    if (program && options.recorded !== false) await this.owner.query('INSERT INTO submission_regions(submission_id,region,pathway,organization_id,created_by) VALUES($1,$2,$3,$4,$5)', [id, program.region, program.pathway, actor.organizationId, actor.id]);
    if (!program) return { id, sequenceId, leafId: null, sectionId: null, documentId: null, program, title };
    const source = await this.seedSource(name, program, sequenceId, options);
    return { id, sequenceId, ...source, program, title };
  }

  private async seedSource(name: string, program: Program, sequenceId: number, options: FilingOptions) {
    const actor = program.owner;
    const documentId = `${this.tag}-${name}-${randomUUID()}`; const body = options.body ?? BODY;
    await this.owner.query(`INSERT INTO c2c_documents(id,org_id,project_id,doc_type,agency,rule_pack_version,title,status,owner_id)
      VALUES($1,$2,$3,'k510','fda',$4,$5,'approved',$6)`, [documentId, actor.organizationId, program.id, this.rulePackVersion, `${this.tag} ${name} actual source`, actor.id]);
    const sectionId = Number((await this.owner.query<{ id: string }>(`INSERT INTO c2c_document_sections(document_id,section_key,label,path_order,status,content,draft_source,owner_id)
      VALUES($1,'actual-source-key','Invented QA section',1,$2,$3::jsonb,'human',$4) RETURNING id`, [documentId, options.status ?? 'approved', JSON.stringify({ text: body }), actor.id])).rows[0].id);
    const pin = options.pin === undefined ? sha(body.trim()) : options.pin;
    const leafId = Number((await this.owner.query<{ id: number }>(`INSERT INTO submission_leaves(sequence_id,section_code,title,lifecycle_op,document_table,document_id,document_type,document_content_sha256,organization_id,created_by)
      VALUES($1,'filing.device-description','Device description','new',$2,$3,'device_description',$4,$5,$6) RETURNING id`, [sequenceId, options.pointer === false ? null : 'c2c_document_sections', options.pointer === false ? null : sectionId, pin, actor.organizationId, actor.id])).rows[0].id);
    return { leafId, sectionId, documentId };
  }

  private async installRoutes() {
    process.env.AUTH_BOUNDARY_MODE = 'enforce';
    this.app.use(express.json());
    this.app.use('/api', createAuthBoundary());
    // Canonical tenant middleware is exercised; the production submissions mount re-authenticates after it.
    this.app.use('/api/submissions', requireTenantContext, authenticateToken, async (req, _res, next) => {
      try {
        if (!(req.dbClient instanceof LazyRequestDbClient)) throw new Error('Canonical Lazy request client absent.');
        const key = req.get('X-Deliverables-Native-Request'); if (!key) throw new Error('Native request ID absent.');
        const actual = req.dbClient; const posture = (await actual.query(postureSql)).rows[0];
        const facts: NativeFacts = { posture, sql: [], pids: [], lazy: true }; this.facts.set(key, facts);
        this.verifyPosture(facts, Number(req.user?.organizationId));
        if (req.get('X-Deliverables-Native-Missing-Q') === '1') delete req.dbClient;
        else Object.assign(req, { dbClient: this.observe(actual, key, facts) });
        next();
      } catch (error) { next(error); }
    }, (await import('../../server/routes/submissions')).default);
    this.app.use((error: Error, _req: express.Request, res: express.Response, _next: express.NextFunction) => res.status(500).json({ error: { code: 'NATIVE_HARNESS_FAILED', message: error.message } }));
  }

  private observe(actual: RequestDbClient, key: string, facts: NativeFacts): RequestDbClient {
    return { query: (async <R extends QueryResultRow>(input: string | QueryConfig<unknown[]>, params?: unknown[]) => {
      const sql = typeof input === 'string' ? input : input.text;
      const result = await actual.query<R, unknown[]>(input, params);
      const pin = (await actual.query<{ pid: number; tenant: string }>("SELECT pg_backend_pid() AS pid,current_setting('app.current_tenant_id',true) AS tenant")).rows[0];
      if (pin.pid !== facts.posture.pid || pin.tenant !== facts.posture.tenant) throw new Error('Request changed native connection or tenant.');
      facts.sql.push(sql); facts.pids.push(pin.pid);
      await this.barriers.get(key)?.(sql);
      return result; // Preserve actual rowMode=array, fields, rowCount and all real query results.
    }) as RequestDbClient['query'] };
  }

  verifyPosture(facts: NativeFacts, organizationId: number) {
    expect(facts.lazy).toBe(true);
    expect(facts.posture).toMatchObject({ database: this.database, role: 'app_service', rolsuper: false, rolbypassrls: false, enforcement: 'on', tenant: String(organizationId), bypass: '', admin: '' });
    expect(Number(facts.posture.pid)).toBeGreaterThan(0);
  }

  probe(actor: Actor, path: string, afterQuery?: AfterQuery, missingQ = false) {
    const key = randomUUID(); if (afterQuery) this.barriers.set(key, afterQuery);
    let http = request(this.app).get(`/api/submissions${path}`).set('Authorization', `Bearer ${actor.token}`).set('X-Deliverables-Native-Request', key);
    if (missingQ) http = http.set('X-Deliverables-Native-Missing-Q', '1');
    return { key, response: http.then(res => { (this.observations.cases as Record<string, unknown>)[key] = { path, actorId: actor.id, status: res.status, code: res.body.error?.code, facts: this.facts.get(key) }; return res; }) };
  }

  manifest(actor: Actor, filing: Filing, afterQuery?: AfterQuery) {
    return this.probe(actor, `/sequences/${filing.sequenceId}/pathway-manifest?programId=${filing.program!.id}&submissionId=${filing.id}`, afterQuery);
  }

  async changeBody(filing: Filing) {
    const client = await this.owner.connect();
    try {
      await client.query('BEGIN');
      await client.query("SELECT set_config('app.actor_id',$1,true),set_config('app.reason',$2,true)", [String(filing.program!.owner.id), `${this.tag}: committed late-content native witness`]);
      const result = await client.query('UPDATE c2c_document_sections SET content=$1::jsonb WHERE id=$2 AND document_id=$3 RETURNING id', [JSON.stringify({ text: BODY + ' Committed change after the admitted read.' }), filing.sectionId, filing.documentId]);
      expect(result.rowCount).toBe(1); await client.query('COMMIT');
    } catch (error) { await client.query('ROLLBACK'); throw error; }
    finally { client.release(); }
  }

  async spareAnchor(program: Program): Promise<number> {
    const inserted = await this.owner.query<{ id: number }>(`INSERT INTO projects
      (organization_id,client_workspace_id,name,type,owner_id,created_by_id,regulatory_program_id)
      SELECT organization_id,client_workspace_id,$1,type,owner_id,created_by_id,NULL FROM projects
      WHERE id=$2 AND organization_id=$3 AND regulatory_program_id=$4 RETURNING id`,
    [`${this.tag} spare anchor ${randomUUID()}`,program.projectId,program.organizationId,program.id]);
    expect(inserted.rows).toHaveLength(1);
    const projectId=inserted.rows[0].id;
    await this.owner.query("INSERT INTO project_visibility_settings(organization_id,project_id,visibility) VALUES($1,$2,'org_public')",
      [program.organizationId,projectId]);
    return projectId;
  }

  async transferAnchor(program: Program, projectId: number): Promise<void> {
    const client=await this.owner.connect();
    try {
      await client.query('BEGIN');
      const old=await client.query('UPDATE projects SET regulatory_program_id=NULL WHERE id=$1 AND organization_id=$2 AND regulatory_program_id=$3',
        [program.projectId,program.organizationId,program.id]);
      expect(old.rowCount).toBe(1);
      const moved=await client.query('UPDATE projects SET regulatory_program_id=$1 WHERE id=$2 AND organization_id=$3 AND regulatory_program_id IS NULL',
        [program.id,projectId,program.organizationId]);
      expect(moved.rowCount).toBe(1);
      await client.query('COMMIT');
    } catch(error) {await client.query('ROLLBACK');throw error;}
    finally {client.release();}
  }

  async addNullVaultLeaf(filing: Filing): Promise<{ id: string; title: string; image: unknown }> {
    if (!filing.program) throw new Error('The refusal fixture needs its actual recorded program.');
    const id=randomUUID();const title=`${this.tag} null-tenant Vault denial ${id}`;
    // Genesis with no predecessor passes the canonical lineage guard. No object
    // is created: this known local handle is only a denial-before-byte-read sentinel.
    await this.owner.query(`INSERT INTO vault.documents
      (id,organization_id,program_id,document_code,document_title,document_type,file_name,file_size,mime_type,
       content_hash,created_by,storage_version_id,storage_provider,supersedes_id,s3_bucket,s3_key)
      VALUES($1,NULL,$2,$3,$3,'REPORT',$4,0,'text/plain',$5,$6,$7,'local',NULL,'native-denial-no-object',$7)`,
    [id,filing.program.id,title,`${id}.txt`,sha(`${this.tag} denial metadata ${id}`),filing.program.owner.id,`native-denial-no-object-${id}`]);
    await this.owner.query(`INSERT INTO submission_leaves
      (sequence_id,section_code,title,lifecycle_op,document_table,document_uuid,document_content_sha256,organization_id,created_by)
      VALUES($1,'filing.device-description','Native NULL-tenant denial placement','new','vault_documents',$2,$3,$4,$5)`,
    [filing.sequenceId,id,sha(`${this.tag} denial metadata ${id}`),filing.program.organizationId,filing.program.owner.id]);
    const image=(await this.owner.query('SELECT row_to_json(d) AS image FROM vault.documents d WHERE d.id=$1::uuid',[id])).rows[0].image;
    return {id,title,image};
  }

  async close() {
    if (process.env.SUBMISSION_REQUIRED_DELIVERABLES_NATIVE_OBSERVATIONS) writeFileSync(process.env.SUBMISSION_REQUIRED_DELIVERABLES_NATIVE_OBSERVATIONS, JSON.stringify(this.observations, null, 2) + '\n', { mode: 0o600 });
    await getPool().end(); await this.owner.end();
    // All new rows and immutable history remain. No cleanup, DDL, grants or repair.
  }
}
