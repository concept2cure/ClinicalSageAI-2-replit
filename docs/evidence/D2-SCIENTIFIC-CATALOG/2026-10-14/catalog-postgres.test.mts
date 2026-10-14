/** Owned synthetic PostgreSQL sessions. Actual catalog/admission/source/audit SQL.
 * The only global DB route is the explicitly selected owned pool. HMAC seal is
 * synthetic; no model, client database, live provider or deployment claim. */
import { beforeAll, beforeEach, afterAll, describe, expect, it, vi } from 'vitest';
import { createHash, randomUUID } from 'node:crypto';
import fs from 'node:fs';
import pg from 'pg';

const seam = vi.hoisted(() => ({ db: null as any }));
vi.mock('../../../../server/db.js', () => {
  const selected = () => { if (!seam.db) throw new Error('UNOWNED_DATABASE_ACCESS'); return seam.db; };
  const pool = { query: (...args: any[]) => selected().query(...args), connect: () => selected().connect() };
  return { pool, getPool: () => pool, db: {} };
});
vi.mock('../../../../server/services/audit/audit-hmac-seal.js', async original => ({ ...(await original<any>()), sealRecord: () => 'f'.repeat(64) }));
import { writeCatalogSuggestion, readCatalogRecord, reviewCatalogRecord } from '../../../../server/services/vault/document-catalog-governance.service.ts';
import { lockDocumentDispositionProgram } from '../../../../server/services/document-data-disposition/program-lock.ts';
import { runWithTenantScope } from '../../../../server/db/tenantStore.ts';

const dir = new URL('.', import.meta.url);
const fixture = JSON.parse(fs.readFileSync(new URL('catalog-fixture-state.json', dir), 'utf8'));
if (fixture.phase !== 'ready' || fixture.host !== '127.0.0.1' || fixture.database !== 'scientific_catalog_fixture'
    || fixture.ownerRole !== 'catalog_fixture_owner' || !Number.isInteger(fixture.port)
    || !/^c2c-catalog-race-[a-z0-9-]+$/.test(fixture.name)) throw new Error('OWNED_DISPOSABLE_FIXTURE_NOT_READY');
const connection = { host: fixture.host, port: fixture.port, database: fixture.database, user: fixture.ownerRole,
  ssl: false, connectionTimeoutMillis: 3000, statement_timeout: 12000 };
const owner = new pg.Pool({ ...connection, max: 6, application_name: 'catalog-observer' });
const handles: pg.Pool[] = [];
const observations: any[] = [];
const hashes: Record<string, string> = {};
const sha = (s: string | Buffer) => createHash('sha256').update(s).digest('hex');
const TEXT = 'Certificate of Analysis. Product XR batch B17 measured assay HPLC: 99.20 %.';
const migrations = ['20260905_document_catalog.sql', '20261008e_document_catalog_attribution.sql',
  '20260930_vault_documents_version_lineage.sql', '20261006_document_data_dispositions.sql', '20260921_audit_logs_chain_seq.sql'];
const files = ['server/services/vault/document-catalog-governance.service.ts', 'server/services/vault/document-catalog-admission.ts',
  'server/services/vault/document-catalog-write-integrity.ts',
  'server/services/vault/document-catalog-core.ts', 'server/services/vault/catalog-fact-verification.ts',
  'server/services/vault/vault-version-family.ts', 'server/services/vault/vault-write-authority.ts',
  'server/services/ana/project-scope-admission.ts', 'server/services/report-os/project-access.ts',
  'server/services/project-sharing-access.ts', 'server/services/c2c/program-access.ts',
  'server/services/c2c/program-project-anchor.ts', 'server/services/document-data-disposition/eligibility.ts',
  'server/services/document-data-disposition/program-lock.ts', 'server/services/auditService.ts',
  'server/services/audit/chain.ts', 'server/services/tenant/governed-tenant-context.ts', 'server/db/sessionScope.ts',
  'server/db/rlsEnforcement.ts', 'server/db/tenantStore.ts', 'server/lib/project-id.ts',
  'server/middleware/orgMembership.ts', 'shared/constants/permissions.ts', 'shared/constants/org-roles.ts',
  'shared/canonical-json.ts', 'shared/ana/catalog-facts.ts',
  'server/services/document-data-disposition/__tests__/disposition-fixture.ts', ...migrations.map(m => `migrations/${m}`),
  'docs/evidence/D2-SCIENTIFIC-CATALOG/2026-10-14/catalog-postgres.test.mts',
  'docs/evidence/D2-SCIENTIFIC-CATALOG/2026-10-14/catalog-postgres.config.mts'];
let orgCounter = 961000;
let org: number;
type Source = { org: number; user: number; program: string; project: number; document: string; hash: string; code: string };
type Hook = (sql: string, params: any[], pid: number) => Promise<void> | void;
function deferred() { let resolve!: () => void; const promise = new Promise<void>(r => { resolve = r; }); return { promise, resolve }; }
function database(label: string, hook?: Hook) {
  const pool = new pg.Pool({ ...connection, max: 3, application_name: `catalog-${label}` }); handles.push(pool);
  const events: Array<{ sql: string; pid: number; rowCount: number | null }> = [];
  return { events, query: (sql: string, params?: any[]) => pool.query(sql, params), connect: async () => {
    const client = await pool.connect();
    const pid = (await client.query('SELECT pg_backend_pid() AS pid')).rows[0].pid;
    return { release: () => client.release(), query: async (sql: string, params: any[] = []) => {
      const result = await client.query(sql, params); events.push({ sql, pid, rowCount: result.rowCount });
      await hook?.(sql, params, pid); return result;
    } };
  } };
}
async function seed(): Promise<Source> {
  const user = org;
  const program = randomUUID(); const document = randomUUID(); const hash = sha(document); const code = `CAT-${org}`;
  await owner.query('INSERT INTO organizations(id,status) VALUES ($1,\'active\')', [org]);
  await owner.query('INSERT INTO users(id,status,name) VALUES ($1,\'active\',\'Synthetic Reviewer\'),($2,\'active\',\'Synthetic Owner\')', [user, user + 1000000]);
  await owner.query('INSERT INTO organization_users VALUES ($1,$2,\'member\')', [user, org]);
  await owner.query('INSERT INTO regulatory_programs(id,organization_id,lead_user_id) VALUES ($1,$2,$3)', [program, org, user]);
  const project = (await owner.query(`INSERT INTO projects (organization_id,regulatory_program_id,owner_id,created_by_id,settings)
    VALUES ($1,$2,$3,$3,'{}') RETURNING id`, [org, program, user + 1000000])).rows[0].id;
  await owner.query(`INSERT INTO project_visibility_settings(project_id,organization_id,visibility) VALUES ($1,$2,'private')`, [project, org]);
  await owner.query(`INSERT INTO project_members(project_id,organization_id,user_id,role,status) VALUES ($1,$2,$3,'edit','active')`, [project, org, user]);
  await owner.query(`INSERT INTO vault.documents(id,organization_id,program_id,document_code,document_title,content_hash,processing_status,extracted_text)
    VALUES ($1,$2,$3,$4,'Synthetic CoA',$5,'INDEXED',$6)`, [document, org, program, code, hash, TEXT]);
  await owner.query(`INSERT INTO vault.document_catalog(document_id,content_hash,catalog_status,extraction_method,char_count)
    VALUES ($1,$2,'extracted','text',$3)`, [document, hash, TEXT.length]);
  return { org, user, program, project, document, hash, code };
}
function args(s: Source, extra: Record<string, any> = {}) {
  return { documentId: s.document, contentHash: s.hash, expectedExtractedTextSha256: sha(TEXT), organizationId: s.org,
    programId: s.program, documentTitle: 'Synthetic CoA', documentKind: 'cert', purpose: 'Synthetic source evidence.',
    summary: 'Batch B17 measured assay 99.20 %.', keyData: { batch: 'B17', assay: '99.20 %' }, embeddingStatus: 'failed' as const,
    embeddingLiteral: null, userId: s.user, proposer: { actorKind: 'agent:ana' as const, model: 'fixture-model', threadId: 'fixture-thread', turnId: 'fixture-turn', audit: {} }, ...extra };
}
const scope = (s: Source, fn: () => any) => runWithTenantScope({ tenantId: String(s.org), role: 'member', source: 'request', caller: 'owned-catalog-races' }, fn);
async function row(s: Source) { return (await owner.query('SELECT * FROM vault.document_catalog WHERE document_id=$1', [s.document])).rows[0]; }
async function audits(s: Source) { return (await owner.query('SELECT * FROM audit_logs WHERE tenant_id=$1 AND record_id=$2 ORDER BY chain_seq', [s.org, s.document])).rows; }
async function holder() { const client = new pg.Client({ ...connection, application_name: 'catalog-holder' }); await client.connect(); const pid = (await client.query('SELECT pg_backend_pid() AS pid')).rows[0].pid; return { client, pid }; }
async function blocked(label: string, blocker: number) {
  const deadline = Date.now() + 3500;
  while (Date.now() < deadline) {
    const r = await owner.query(`SELECT pid,application_name,wait_event_type,pg_blocking_pids(pid) AS blockers FROM pg_stat_activity
      WHERE datname=current_database() AND application_name LIKE $1 AND $2=ANY(pg_blocking_pids(pid))`, [`catalog-${label}%`, blocker]);
    if (r.rows.length) { observations.push({ barrier: label, blocker, waiters: r.rows }); return r.rows; }
    await new Promise(r => setTimeout(r, 25));
  }
  throw new Error(`Independent PostgreSQL blocking barrier not observed: ${label}`);
}
async function waitThenChange(s: Source, label: string, change: (client: pg.Client) => Promise<any>) {
  const held = await holder();
  await held.client.query('BEGIN'); await lockDocumentDispositionProgram(held.client, s.org, s.program);
  seam.db = database(label);
  const pending = scope(s, () => writeCatalogSuggestion(args(s)));
  try { await blocked(label, held.pid); await change(held.client); await held.client.query('COMMIT'); return await pending; }
  finally { await held.client.query('ROLLBACK').catch(() => {}); await held.client.end(); }
}
async function withdraw(client: pg.Client, s: Source) {
  await client.query(`INSERT INTO document_data_dispositions (organization_id,program_id,vault_document_id,choice,reason,actor_id,
    source_sha256,preview_hash,linked_ids,impact_snapshot,audit_receipt) VALUES ($1,$2,$3,'remove_data',
    'Synthetic withdrawal before catalog admission',$4,$5,$6,$7,'{}',$8)`, [s.org, s.program, s.document, s.user, s.hash, 'a'.repeat(64),
    JSON.stringify({ capturedSourceIds: [], vaultDocumentIds: [s.document], artifactIds: [], uploadIds: [] }),
    JSON.stringify({ id: randomUUID(), sha256Chain: 'b'.repeat(64) })]);
}
async function successor(client: pg.Client, s: Source) {
  await client.query(`INSERT INTO vault.documents(id,organization_id,program_id,document_code,document_title,content_hash,processing_status,extracted_text,supersedes_id)
    VALUES ($1,$2,$3,$4,'Synthetic successor',$5,'INDEXED',$6,$7)`, [randomUUID(), s.org, s.program, s.code, sha(randomUUID()), TEXT, s.document]);
}
beforeAll(async () => {
  expect(vi.isMockFunction(pg.Pool)).toBe(false);
  const identity = (await owner.query(`SELECT version(),current_database(),current_user,pg_backend_pid(),
    (SELECT rolsuper FROM pg_roles WHERE rolname=current_user) AS superuser,
    (SELECT rolbypassrls FROM pg_roles WHERE rolname=current_user) AS bypassrls`)).rows[0];
  expect(identity.current_database).toBe(fixture.database); expect(identity.current_user).toBe(fixture.ownerRole);
  expect(identity.superuser).toBe(false); expect(identity.bypassrls).toBe(false);
  observations.push({ server: identity, image: fixture.image, rolePosture: 'synthetic table owner NOSUPERUSER NOBYPASSRLS; ordinary table ownership bypasses RLS except the explicitly forced policy case' });
  // Verified owned disposable database only. No application/client endpoint.
  await owner.query('DROP SCHEMA IF EXISTS vault CASCADE; DROP SCHEMA public CASCADE; CREATE SCHEMA public AUTHORIZATION catalog_fixture_owner');
  const fixtureSource = fs.readFileSync(new URL('../../../../server/services/document-data-disposition/__tests__/disposition-fixture.ts', dir), 'utf8');
  const templates = [...fixtureSource.matchAll(/const DDL = `([\s\S]*?)`;/g)]; expect(templates).toHaveLength(1); expect(templates[0][1]).not.toContain('${');
  await owner.query(templates[0][1]);
  await owner.query(`DROP TABLE vault.document_catalog;
    CREATE TABLE organizations(id integer PRIMARY KEY,status text);
    CREATE TABLE users(id integer PRIMARY KEY,status text,name text);
    CREATE TABLE organization_users(user_id integer REFERENCES users(id),organization_id integer REFERENCES organizations(id),role text,PRIMARY KEY(user_id,organization_id));
    ALTER TABLE projects ADD COLUMN client_workspace_id integer,ADD COLUMN owner_id integer,ADD COLUMN created_by_id integer,ADD COLUMN settings jsonb;
    CREATE TABLE project_visibility_settings(project_id integer PRIMARY KEY REFERENCES projects(id),organization_id integer,visibility text);
    CREATE TABLE project_members(id serial PRIMARY KEY,project_id integer REFERENCES projects(id),organization_id integer,user_id integer,role text,status text);
    CREATE TABLE concept2cure_review_assignments(id serial PRIMARY KEY,artifact_id integer REFERENCES concept2cure_artifacts(id),organization_id integer,reviewer_id integer,status text);
    ALTER TABLE vault.documents ADD COLUMN document_code text;`);
  for (const name of migrations) { const content = fs.readFileSync(new URL(`../../../../migrations/${name}`, dir), 'utf8'); await owner.query(content); await owner.query(content); }
  for (const file of files) hashes[file] = sha(fs.readFileSync(new URL(`../../../../${file}`, dir)));
  process.env.AUDIT_HMAC_KEY = 'synthetic-independent-catalog-seal-key';
});
beforeEach(() => { org = ++orgCounter; seam.db = database(`default-${org}`); });
afterAll(async () => {
  const after = Object.fromEntries(files.map(file => [file, sha(fs.readFileSync(new URL(`../../../../${file}`, dir)))]));
  const changedSources = files.filter(file => hashes[file] !== after[file]);
  fs.writeFileSync(new URL('catalog-postgres-observations.json', dir), JSON.stringify({ runtime: process.version, fixture: { database: fixture.database, ownerRole: fixture.ownerRole, name: fixture.name, image: fixture.image },
    proofScope: 'Actual canonical catalog/admission/source eligibility/version guard/chained audit SQL on distinct local PostgreSQL sessions. Synthetic minimal DDL, explicit policy case, synthetic HMAC seal, no deployed role/provider/client data qualification.', observations, before: hashes, after, changedSources, sourcesUnchangedDuringRun: changedSources.length === 0 }, null, 2) + '\n');
  await Promise.all(handles.map(p => p.end())); await owner.end(); seam.db = null;
  expect(changedSources, 'The actual PostgreSQL review sources changed during the run').toEqual([]);
});

describe('genuine PostgreSQL catalog admission and source races', () => {
  it('control persists one exact source-bound suggestion and one actual chained audit', async () => {
    const s = await seed(); expect(await scope(s, () => writeCatalogSuggestion(args(s)))).toMatchObject({ ok: true });
    expect(await row(s)).toMatchObject({ catalog_state: 'suggested', proposed_by: 'agent:ana', proposed_model: 'fixture-model' });
    const a = await audits(s); expect(a).toHaveLength(1); expect(a[0].chain_seq).not.toBeNull();
    expect(a[0].new_values).toMatchObject({ contentHash: s.hash, extractedTextSha256: sha(TEXT), checkScope: { kind: 'legacy_value_presence', context: 'not_recorded', scientificQualification: 'unassessed' } });
  });
  it('withdrawal holds the advisory fence before fresh READ COMMITTED admission', async () => {
    const s = await seed(); expect(await waitThenChange(s, 'withdrawal', c => withdraw(c, s))).toMatchObject({ ok: false });
    expect((await row(s)).catalog_state).toBeNull(); expect(await audits(s)).toHaveLength(0);
  });
  it('a canonical successor inserted during the advisory wait refuses the predecessor', async () => {
    const s = await seed(); expect(await waitThenChange(s, 'successor', c => successor(c, s))).toMatchObject({ ok: false });
    expect(await audits(s)).toHaveLength(0);
  });
  it('same-byte re-extraction during advisory wait refuses the old expected digest', async () => {
    const s = await seed(); expect(await waitThenChange(s, 'extraction', c => c.query('UPDATE vault.documents SET extracted_text=$2 WHERE id=$1', [s.document, TEXT + ' changed extraction']))).toMatchObject({ ok: false });
    expect(await audits(s)).toHaveLength(0);
  });
  it('moving the source to another valid program during the wait refuses its prior scope', async () => {
    const s = await seed(); const next = randomUUID(); await owner.query('INSERT INTO regulatory_programs(id,organization_id) VALUES ($1,$2)', [next, s.org]);
    expect(await waitThenChange(s, 'move', c => c.query('UPDATE vault.documents SET program_id=$2 WHERE id=$1', [s.document, next]))).toMatchObject({ ok: false });
    expect(await audits(s)).toHaveLength(0);
  });
  it('persisted viewer role overrides stale member request scope after waiting', async () => {
    const s = await seed(); expect(await waitThenChange(s, 'viewer', c => c.query('UPDATE organization_users SET role=\'viewer\' WHERE user_id=$1 AND organization_id=$2', [s.user, s.org]))).toMatchObject({ ok: false });
    expect(await audits(s)).toHaveLength(0);
  });
  it('membership removal during waiting refuses without a receipt', async () => {
    const s = await seed(); expect(await waitThenChange(s, 'membership', c => c.query('DELETE FROM organization_users WHERE user_id=$1 AND organization_id=$2', [s.user, s.org]))).toMatchObject({ ok: false });
    expect(await audits(s)).toHaveLength(0);
  });
  it('private-project member revocation during waiting uses actual canonical sharing policy', async () => {
    const s = await seed(); expect(await waitThenChange(s, 'private', c => c.query('DELETE FROM project_members WHERE project_id=$1 AND user_id=$2', [s.project, s.user]))).toMatchObject({ ok: false });
    expect(await audits(s)).toHaveLength(0);
  });
  it('inactive actor during waiting refuses despite existing membership and stale scope', async () => {
    const s = await seed(); expect(await waitThenChange(s, 'inactive', c => c.query('UPDATE users SET status=\'inactive\' WHERE id=$1', [s.user]))).toMatchObject({ ok: false });
    expect(await audits(s)).toHaveLength(0);
  });
  it('document SHARE reservation serializes concurrent re-extraction after admission', async () => {
    const s = await seed(); const ready = deferred(); const release = deferred(); let writerPid = 0;
    seam.db = database('source-fence', async (sql, _params, pid) => { if (sql.includes('FOR UPDATE OF d')) { writerPid = pid; ready.resolve(); await release.promise; } });
    const pending = scope(s, () => writeCatalogSuggestion(args(s)));
    await ready.promise; const held = await holder(); await held.client.query("SET application_name='catalog-source-dml'");
    const mutation = held.client.query('UPDATE vault.documents SET extracted_text=$2 WHERE id=$1', [s.document, TEXT + ' later extraction']);
    try { await blocked('source-dml', writerPid); release.resolve(); expect(await pending).toMatchObject({ ok: true }); await mutation; }
    finally { release.resolve(); await held.client.end(); }
    expect(await audits(s)).toHaveLength(1);
  });
  it('held active membership serializes concurrent role revocation through commit', async () => {
    const s = await seed(); const ready = deferred(); const release = deferred(); let writerPid = 0;
    seam.db = database('actor-fence', async (sql, _params, pid) => { if (sql.includes('FOR UPDATE OF d')) { writerPid = pid; ready.resolve(); await release.promise; } });
    const pending = scope(s, () => writeCatalogSuggestion(args(s))); await ready.promise;
    const held = await holder(); await held.client.query("SET application_name='catalog-actor-dml'");
    const mutation = held.client.query('UPDATE organization_users SET role=\'viewer\' WHERE user_id=$1 AND organization_id=$2', [s.user, s.org]);
    try { await blocked('actor-dml', writerPid); release.resolve(); expect(await pending).toMatchObject({ ok: true }); await mutation; }
    finally { release.resolve(); await held.client.end(); }
  });
  it('stale shown extraction refuses review while historical confirmed decision stays visible', async () => {
    const s = await seed(); expect(await scope(s, () => writeCatalogSuggestion(args(s)))).toMatchObject({ ok: true });
    const shown = await scope(s, () => readCatalogRecord({ programId: s.program, documentId: s.document, organizationId: s.org, userId: s.user }));
    await owner.query('UPDATE vault.documents SET extracted_text=$2 WHERE id=$1', [s.document, TEXT + ' updated']);
    const stale = await scope(s, () => reviewCatalogRecord({ programId: s.program, documentId: s.document, organizationId: s.org, userId: s.user, action: 'confirm', expectedRevision: shown!.revision!, expectedContentHash: s.hash, expectedExtractedTextSha256: sha(TEXT) }));
    expect(stale).toMatchObject({ ok: false, code: 'EXTRACTION_CHANGED' });
    const fresh = await scope(s, () => readCatalogRecord({ programId: s.program, documentId: s.document, organizationId: s.org, userId: s.user }));
    expect(await scope(s, () => reviewCatalogRecord({ programId: s.program, documentId: s.document, organizationId: s.org, userId: s.user, action: 'confirm', expectedRevision: fresh!.revision!, expectedContentHash: s.hash, expectedExtractedTextSha256: sha(TEXT + ' updated') }))).toMatchObject({ ok: true });
    const held = await holder(); await withdraw(held.client, s); await held.client.end();
    const historic = await scope(s, () => readCatalogRecord({ programId: s.program, documentId: s.document, organizationId: s.org, userId: s.user }));
    expect(historic).toMatchObject({ state: 'confirmed', confirmedBy: { id: s.user }, canWrite: false, currentUse: { eligible: false, reasonCode: 'SOURCE_DATA_WITHDRAWN' } });
  });
  it('a real zero-row BEFORE UPDATE refusal cannot produce success or an audit on vector fallback', async () => {
    const s = await seed();
    await owner.query(`CREATE FUNCTION vault.synthetic_zero_receipt() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RETURN NULL; END $$;
      CREATE TRIGGER synthetic_zero_receipt BEFORE UPDATE ON vault.document_catalog FOR EACH ROW EXECUTE FUNCTION vault.synthetic_zero_receipt()`);
    try { expect(await scope(s, () => writeCatalogSuggestion(args(s, { embeddingLiteral: '[1,2]', embeddingStatus: 'embedded' })))).toMatchObject({ ok: false }); expect(await audits(s)).toHaveLength(0); expect((await row(s)).catalog_state).toBeNull(); }
    finally { await owner.query('DROP TRIGGER synthetic_zero_receipt ON vault.document_catalog; DROP FUNCTION vault.synthetic_zero_receipt()'); }
  });
  it('a forced synthetic UPDATE policy refusal cannot become non-vector success', async () => {
    const s = await seed();
    await owner.query(`ALTER TABLE vault.document_catalog FORCE ROW LEVEL SECURITY;
      CREATE POLICY synthetic_select ON vault.document_catalog FOR SELECT USING (true);
      CREATE POLICY synthetic_insert ON vault.document_catalog FOR INSERT WITH CHECK (true);
      CREATE POLICY synthetic_update ON vault.document_catalog FOR UPDATE USING (true) WITH CHECK (false)`);
    try { await expect(scope(s, () => writeCatalogSuggestion(args(s, { embeddingLiteral: '[1,2]', embeddingStatus: 'embedded' })))).rejects.toMatchObject({ code: '42501' }); expect(await audits(s)).toHaveLength(0); }
    finally { await owner.query(`ALTER TABLE vault.document_catalog NO FORCE ROW LEVEL SECURITY; DROP POLICY synthetic_select ON vault.document_catalog; DROP POLICY synthetic_insert ON vault.document_catalog; DROP POLICY synthetic_update ON vault.document_catalog`); }
    observations.push({ case: 'forced synthetic catalog policy', superuser: false, bypassrls: false, result: '42501 propagated, no success audit', limits: 'explicit local policy only; no deployed RLS qualification' });
  });
  it('actual audit INSERT failure rolls the catalog mutation back', async () => {
    const s = await seed(); const before = await row(s);
    await owner.query(`CREATE FUNCTION synthetic_audit_failure() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION 'SYNTHETIC_AUDIT_FAILURE'; END $$;
      CREATE TRIGGER synthetic_audit_failure BEFORE INSERT ON audit_logs FOR EACH ROW EXECUTE FUNCTION synthetic_audit_failure()`);
    try { await expect(scope(s, () => writeCatalogSuggestion(args(s)))).rejects.toThrow('SYNTHETIC_AUDIT_FAILURE'); expect(await row(s)).toEqual(before); expect(await audits(s)).toHaveLength(0); }
    finally { await owner.query('DROP TRIGGER synthetic_audit_failure ON audit_logs; DROP FUNCTION synthetic_audit_failure()'); }
  });
});
