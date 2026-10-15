/** Actual canonical source-authority/filter SQL on an owned synthetic local
 * PostgreSQL database. Ordinary NOSUPERUSER NOBYPASSRLS table owner; only the
 * explicitly forced policy control represents RLS. No deployed policy claim. */
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
// Exact synthetic embedding seam enables missing-index SQL proof without a
// model/provider call. It does not qualify semantic serving or vector quality.
vi.mock('../../../../server/services/enhancedEmbeddingService.js', () => ({ getEmbeddingService: () => ({ embed: async () => ({ embedding: [1, 2, 3] }) }) }));
import { admitAnaSourceReadScope } from '../../../../server/services/ana/source-read-scope.ts';
import { listProjectDocumentsForActor, loadDocumentForActor, listChatUploadsForActor } from '../../../../server/services/vault/document-catalog.service.ts';
import { writeGuardedLegacyReadReceipt } from '../../../../server/services/ana/source-read-receipt.ts';
import { deferReadReceipt, settleReadReceipts } from '../../../../server/services/ana/read-receipts.ts';
import { registerDocumentCatalogHandlers } from '../../../../server/services/ana/document-catalog-tools.ts';
import { searchVaultForAssistant } from '../../../../server/services/vault/vault-assistant-search.ts';
import { lockDocumentDispositionProgram } from '../../../../server/services/document-data-disposition/program-lock.ts';
import { runWithTenantScope } from '../../../../server/db/tenantStore.ts';

const dir = new URL('.', import.meta.url);
const fixture = JSON.parse(fs.readFileSync(new URL('source-fixture-state.json', dir), 'utf8'));
if (fixture.phase !== 'ready' || fixture.host !== '127.0.0.1' || fixture.database !== 'ana_source_access_fixture'
    || fixture.ownerRole !== 'source_fixture_owner' || !Number.isInteger(fixture.port)
    || !/^c2c-source-access-[a-z0-9-]+$/.test(fixture.name)) throw new Error('OWNED_DISPOSABLE_FIXTURE_NOT_READY');
const connection = { host: fixture.host, port: fixture.port, database: fixture.database, user: fixture.ownerRole,
  ssl: false, connectionTimeoutMillis: 3000, statement_timeout: 12000 };
const owner = new pg.Pool({ ...connection, max: 6, application_name: 'source-independent-observer' });
const observations: any[] = [];
const handles: pg.Pool[] = [];
const hashes: Record<string, string> = {};
const sha = (s: string | Buffer) => createHash('sha256').update(s).digest('hex');
const TEXT = 'Synthetic clinical source. Cohort K17: 82 participants.';
const migrations = ['20260905_document_catalog.sql', '20261008e_document_catalog_attribution.sql',
  '20260930_vault_documents_version_lineage.sql', '20261006_document_data_dispositions.sql', '20260906_vault_documents_fulltext.sql'];
const files = ['server/services/ana/source-read-scope.ts', 'server/services/ana/project-scope-admission.ts',
  'server/services/vault/document-catalog.service.ts', 'server/services/vault/document-catalog-actor-access.ts',
  'server/services/vault/document-catalog-actor-reads.ts', 'server/services/vault/document-catalog-actor-captures.ts',
  'server/services/ana/source-read-receipt.ts', 'server/services/vault/document-catalog-admission.ts',
  'server/services/ana/document-catalog-tools.ts', 'server/services/ana/document-tools-shared.ts',
  'server/services/ana/catalog-scope.ts', 'server/services/ana/document-catalog-input.ts',
  'server/services/vault/vault-search.ts', 'server/services/vault/vault-assistant-search.ts',
  'server/services/vault/document-catalog-search.ts', 'server/services/vault/document-catalog-search-query.ts',
  'server/services/vault/retrieval-source-access.ts', 'server/services/vault/vector-index-availability.ts',
  'server/services/report-os/project-access.ts', 'server/services/project-sharing-access.ts',
  'server/services/ana/source-context-admission.ts', 'server/services/ana/read-receipts.ts',
  'server/services/vault/vault-version-family.ts', 'server/services/document-data-disposition/eligibility.ts',
  'server/services/c2c/program-access.ts', 'server/services/c2c/program-project-anchor.ts',
  ...migrations.map(m => `migrations/${m}`),
  'docs/evidence/D2-ANA-SOURCE-ACCESS/2026-10-14/source-postgres.test.mts',
  'docs/evidence/D2-ANA-SOURCE-ACCESS/2026-10-14/source-postgres.config.mts'];
let orgCounter = 971000;
let org: number;
type Source = { org: number; user: number; program: string; project: number; document: string; hash: string; code: string };
const actor = (s: Source, extra: Record<string, any> = {}) => ({ organizationId: s.org, userId: s.user, ...extra });
const scope = (s: Source, fn: () => any) => runWithTenantScope({ tenantId: String(s.org), role: 'member', source: 'request', caller: 'owned-source-access-review' }, fn);
function receipt(s: Source) {
  const sourceSnapshot = { organizationId: s.org, userId: s.user, programId: s.program, documentId: s.document,
    contentHash: s.hash, extractedTextSha256: sha(TEXT), totalChars: TEXT.length, span: { start: 0, end: TEXT.length }, threadId: 'owned-source-fixture' };
  return { documentId: s.document, contentHash: s.hash, span: { ...sourceSnapshot.span }, readBy: s.user, sourceSnapshot,
    result: JSON.stringify({ ok: true, documentId: s.document, contentHash: s.hash, extractedTextSha256: sha(TEXT), totalChars: TEXT.length,
      window: { start: 0, end: TEXT.length, text: TEXT }, receiptScope: 'host-budget-admitted legacy byte history' }) };
}
async function receipts(s: Source) { return (await owner.query('SELECT * FROM vault.document_read_receipts WHERE document_id=$1', [s.document])).rows; }
function deferred() { let resolve!: () => void; const promise = new Promise<void>(r => { resolve = r; }); return { promise, resolve }; }
function database(label: string, hook?: (sql: string, pid: number) => Promise<void> | void) {
  const pool = new pg.Pool({ ...connection, max: 3, application_name: `source-${label}` }); handles.push(pool);
  return { query: (sql: string, params?: any[]) => pool.query(sql, params), connect: async () => {
    const client = await pool.connect(); const pid = (await client.query('SELECT pg_backend_pid() AS pid')).rows[0].pid;
    return { release: () => client.release(), query: async (sql: string, params: any[] = []) => {
      const result = await client.query(sql, params); await hook?.(sql, pid); return result;
    } };
  } };
}
async function holder(label = 'holder') {
  const client = new pg.Client({ ...connection, application_name: `source-${label}` }); await client.connect();
  const pid = (await client.query('SELECT pg_backend_pid() AS pid')).rows[0].pid; return { client, pid };
}
async function blocked(label: string, blocker: number) {
  const deadline = Date.now() + 3500;
  while (Date.now() < deadline) {
    const rows = (await owner.query(`SELECT pid,application_name,wait_event_type,pg_blocking_pids(pid) AS blockers FROM pg_stat_activity
      WHERE datname=current_database() AND application_name LIKE $1 AND $2=ANY(pg_blocking_pids(pid))`, [`source-${label}%`, blocker])).rows;
    if (rows.length) { observations.push({ barrier: label, blocker, waiters: rows }); return rows; }
    await new Promise(r => setTimeout(r, 25));
  }
  throw new Error(`Independent PostgreSQL blocking barrier not observed: ${label}`);
}
async function waitThenChange(s: Source, label: string, change: (client: pg.Client) => Promise<any>) {
  const held = await holder(); await held.client.query('BEGIN'); await lockDocumentDispositionProgram(held.client, s.org, s.program);
  seam.db = database(label); const pending = scope(s, () => writeGuardedLegacyReadReceipt(receipt(s))).then(() => ({ ok: true }), () => ({ ok: false }));
  try { await blocked(label, held.pid); await change(held.client); await held.client.query('COMMIT'); return await pending; }
  finally { await held.client.query('ROLLBACK').catch(() => {}); await held.client.end(); }
}

async function seed(): Promise<Source> {
  const user = org; const program = randomUUID(); const document = randomUUID(); const hash = sha(document); const code = `SRC-${org}`;
  await owner.query("INSERT INTO organizations(id,status) VALUES($1,'active')", [org]);
  await owner.query("INSERT INTO users(id,status,name) VALUES($1,'active','Synthetic Viewer'),($2,'active','Synthetic Owner')", [user, user + 1000000]);
  await owner.query("INSERT INTO organization_users VALUES($1,$2,'viewer'),($3,$2,'member')", [user, org, user + 1000000]);
  await owner.query('INSERT INTO regulatory_programs(id,organization_id,lead_user_id,name) VALUES($1,$2,$3,\'Synthetic project\')', [program, org, user]);
  const project = (await owner.query(`INSERT INTO projects(organization_id,regulatory_program_id,owner_id,created_by_id,settings,client_workspace_id)
    VALUES($1,$2,$3,$3,'{}',NULL) RETURNING id`, [org, program, user + 1000000])).rows[0].id;
  await owner.query("INSERT INTO project_visibility_settings VALUES($1,$2,'private')", [project, org]);
  await owner.query("INSERT INTO project_members(project_id,organization_id,user_id,role,status) VALUES($1,$2,$3,'use','active')", [project, org, user]);
  await owner.query(`INSERT INTO vault.documents(id,organization_id,program_id,document_code,document_title,file_name,content_hash,processing_status,extracted_text)
    VALUES($1,$2,$3,$4,'Synthetic source','visible-source.pdf',$5,'INDEXED',$6)`, [document, org, program, code, hash, TEXT]);
  await owner.query("INSERT INTO vault.document_catalog(document_id,content_hash,catalog_status,extraction_method,char_count) VALUES($1,$2,'extracted','text',$3)", [document, hash, TEXT.length]);
  return { org, user, program, project, document, hash, code };
}
async function privateSource(s: Source) {
  const program = randomUUID(); const document = randomUUID();
  await owner.query("INSERT INTO regulatory_programs(id,organization_id,name) VALUES($1,$2,'PRIVATE_NAME_SENTINEL')", [program, s.org]);
  const project = (await owner.query("INSERT INTO projects(organization_id,regulatory_program_id,owner_id,created_by_id,settings) VALUES($1,$2,$3,$3,'{}') RETURNING id", [s.org, program, s.user + 1000000])).rows[0].id;
  await owner.query("INSERT INTO project_visibility_settings VALUES($1,$2,'private')", [project, s.org]);
  await owner.query(`INSERT INTO vault.documents(id,organization_id,program_id,document_code,document_title,file_name,content_hash,processing_status,extracted_text,created_at)
    VALUES($1,$2,$3,$4,'PRIVATE_TITLE_SENTINEL','PRIVATE_FILENAME_SENTINEL', $5,'FAILED',NULL,now()+interval '1 day')`, [document, s.org, program, 'PRIVATE_CODE_SENTINEL', sha(document)]);
  await owner.query("INSERT INTO vault.document_catalog(document_id,content_hash,catalog_status,extraction_error,char_count) VALUES($1,$2,'extraction_failed','PRIVATE_FAILURE_SENTINEL',0)", [document, sha(document)]);
  return { program, document, project };
}
async function withdrawal(s: Source, choice: 'keep_data' | 'remove_data') {
  await owner.query(`INSERT INTO document_data_dispositions(organization_id,program_id,vault_document_id,choice,reason,actor_id,source_sha256,preview_hash,linked_ids,impact_snapshot,audit_receipt)
    VALUES($1,$2,$3,$4,'Synthetic source disposition',$5,$6,$7,$8,'{}',$9)`, [s.org, s.program, s.document, choice, s.user, s.hash, 'a'.repeat(64),
    JSON.stringify({ capturedSourceIds: [], vaultDocumentIds: [s.document], artifactIds: [], uploadIds: [] }), JSON.stringify({ id: randomUUID(), sha256Chain: 'b'.repeat(64) })]);
}
beforeAll(async () => {
  expect(vi.isMockFunction(pg.Pool)).toBe(false);
  const identity = (await owner.query(`SELECT version(),current_database(),current_user,pg_backend_pid(),
    (SELECT rolsuper FROM pg_roles WHERE rolname=current_user) AS superuser,
    (SELECT rolbypassrls FROM pg_roles WHERE rolname=current_user) AS bypassrls`)).rows[0];
  expect(identity.current_database).toBe(fixture.database); expect(identity.current_user).toBe(fixture.ownerRole);
  expect(identity.superuser).toBe(false); expect(identity.bypassrls).toBe(false);
  observations.push({ server: identity, image: fixture.image, rolePosture: 'Synthetic minimal schema, ordinary table owner NOSUPERUSER NOBYPASSRLS. Owner bypasses ordinary RLS; explicit FORCE case separately labelled.' });
  await owner.query('DROP SCHEMA IF EXISTS vault CASCADE; DROP SCHEMA public CASCADE; CREATE SCHEMA public AUTHORIZATION source_fixture_owner');
  const fixtureSource = fs.readFileSync(new URL('../../../../server/services/document-data-disposition/__tests__/disposition-fixture.ts', dir), 'utf8');
  const templates = [...fixtureSource.matchAll(/const DDL = `([\s\S]*?)`;/g)]; expect(templates).toHaveLength(1); expect(templates[0][1]).not.toContain('${');
  await owner.query(templates[0][1]);
  await owner.query(`DROP TABLE vault.document_catalog;
    CREATE TABLE organizations(id integer PRIMARY KEY,status text);
    CREATE TABLE users(id integer PRIMARY KEY,status text,name text);
    CREATE TABLE organization_users(user_id integer REFERENCES users(id),organization_id integer REFERENCES organizations(id),role text,PRIMARY KEY(user_id,organization_id));
    ALTER TABLE regulatory_programs ADD COLUMN name text;
    ALTER TABLE projects ADD COLUMN client_workspace_id integer,ADD COLUMN owner_id integer,ADD COLUMN created_by_id integer,ADD COLUMN settings jsonb;
    CREATE TABLE project_visibility_settings(project_id integer PRIMARY KEY REFERENCES projects(id),organization_id integer,visibility text);
    CREATE TABLE project_members(id serial PRIMARY KEY,project_id integer REFERENCES projects(id),organization_id integer,user_id integer,role text,status text);
    CREATE TABLE concept2cure_review_assignments(id serial PRIMARY KEY,artifact_id integer REFERENCES concept2cure_artifacts(id),organization_id integer,reviewer_id integer,status text);
    ALTER TABLE vault.documents ADD COLUMN document_code text,ADD COLUMN document_type text,ADD COLUMN file_name text,ADD COLUMN mime_type text,ADD COLUMN folder_id uuid,
      ADD COLUMN evidence_kind text,ADD COLUMN ctd_section text,ADD COLUMN placement_status text DEFAULT 'unfiled',ADD COLUMN created_at timestamptz DEFAULT now(),ADD COLUMN version text,ADD COLUMN file_size bigint;
    ALTER TABLE cre_evidence_sources ADD COLUMN client_workspace_id integer,ADD COLUMN created_by integer,ADD COLUMN version text,ADD COLUMN created_at timestamptz DEFAULT now(),ADD COLUMN visibility_class text;
    ALTER TABLE file_uploads ADD COLUMN user_id integer;`);
  for (const name of migrations) { const content = fs.readFileSync(new URL(`../../../../migrations/${name}`, dir), 'utf8'); await owner.query(content); await owner.query(content); }
  for (const file of files) hashes[file] = sha(fs.readFileSync(new URL(`../../../../${file}`, dir)));
  seam.db = owner;
});
beforeEach(() => { org = ++orgCounter; seam.db = owner; });
afterAll(async () => {
  const after = Object.fromEntries(files.map(file => [file, sha(fs.readFileSync(new URL(`../../../../${file}`, dir)))]));
  const changedSources = files.filter(file => hashes[file] !== after[file]);
  fs.writeFileSync(new URL('source-postgres-observations.json', dir), JSON.stringify({ runtime: process.version,
    fixture: { database: fixture.database, ownerRole: fixture.ownerRole, name: fixture.name, image: fixture.image },
    proofScope: 'Actual canonical source admission/catalog filter SQL on owned synthetic PostgreSQL. Ordinary table owner except forced policy control. No provider/client/deployed RLS qualification.', observations,
    before: hashes, after, changedSources, sourcesUnchangedDuringRun: changedSources.length === 0 }, null, 2) + '\n');
  await Promise.all(handles.map(p => p.end())); await owner.end(); seam.db = null;
  expect(changedSources, 'Actual PostgreSQL review sources changed during the run').toEqual([]);
});

describe('genuine PostgreSQL source scope and source filtering', () => {
  it('viewer read uses actual active membership and private share', async () => {
    const s = await seed(); expect(await admitAnaSourceReadScope(owner, actor(s, { projectRef: s.program }))).toMatchObject({ role: 'viewer', programId: s.program });
    expect(await scope(s, () => loadDocumentForActor({ ...actor(s), documentId: s.document }, { includeText: true, currentOnly: true }))).toMatchObject({ id: s.document, extractedText: TEXT });
  });
  it('allowed programs constrain window counts and LIMIT before newer private records', async () => {
    const s = await seed(); const priv = await privateSource(s);
    const page = await scope(s, () => listProjectDocumentsForActor(actor(s), { limit: 1 }));
    expect(page).toMatchObject({ total: 1, withheld: 0, extractionFailed: 0 });
    expect(page.documents).toHaveLength(1); expect(page.documents[0].id).toBe(s.document);
    expect(JSON.stringify(page)).not.toContain('PRIVATE_');
    // Give the denied document a high-ranked matching title/body. Filtering
    // after top-N would now hide the authorized source and reveal its count.
    await owner.query('UPDATE vault.documents SET document_title=$2,extracted_text=$3 WHERE id=$1', [priv.document, 'Synthetic clinical source participants participants participants PRIVATE_TITLE_SENTINEL', TEXT.repeat(3)]);
    const readScope = await admitAnaSourceReadScope(owner, actor(s));
    const search = await scope(s, () => searchVaultForAssistant(owner, { organizationId: s.org, programId: null,
      query: 'participants', limit: 1, catalogEnabled: false, sourceReadScope: readScope }));
    expect(search).toMatchObject({ textMatches: 1, hits: [{ documentId: s.document }], semantic: { available: false, reason: 'catalog_off' } });
    expect(JSON.stringify(search)).not.toContain('PRIVATE_');
    const queries: string[] = [];
    seam.db = { query: (...args: any[]) => owner.query(...args as [any]), connect: async () => {
      const client = await owner.connect(); return { release: () => client.release(), query: async (sql: string, params?: any[]) => { queries.push(sql); return client.query(sql, params); } };
    } };
    const fallback = await scope(s, () => searchVaultForAssistant(owner, { organizationId: s.org, programId: null,
      query: 'participants', limit: 1, catalogEnabled: true, sourceReadScope: readScope }));
    expect(fallback).toMatchObject({ textMatches: 1, hits: [{ documentId: s.document }], semantic: { available: false, reason: 'no_embedding_provider' } });
    expect(queries).toContain('ROLLBACK TO SAVEPOINT catalog_meaning_search');
    observations.push({ optionalIndex: 'Actual missing catalog vector SQL rolled back to SAVEPOINT; authorized lexical result survived on PostgreSQL. Embedding was synthetic, no provider serving proof.' });
    seam.db = owner;
    // Capture identity admission and full page counting are independently
    // constrained: private/newer, foreign-unbound and mismatched-workspace
    // rows must not displace the authorized creator-owned sample.
    for (const [file, creator, parent, workspace, title] of [
      ['file_163_own', s.user, null, null, 'visible-upload.pdf'],
      ['file_163_private', s.user + 1000000, priv.program, priv.project, 'PRIVATE_UPLOAD_SENTINEL'],
      ['file_163_unbound', s.user + 1000000, null, null, 'PRIVATE_UNBOUND_SENTINEL'],
      ['file_163_mismatch', s.user, s.program, priv.project, 'PRIVATE_WORKSPACE_SENTINEL'],
    ] as const) {
      const hash = sha(file);
      await owner.query("INSERT INTO file_uploads(id,organization_id,user_id,checksum_sha256,storage_path,status) VALUES($1,$2,$3,$4,$5,'processed')", [file, s.org, creator, hash, `uploads/org-${s.org}/${file}`]);
      await owner.query(`INSERT INTO cre_evidence_sources(organization_id,client_program_id,client_workspace_id,created_by,source_type,title,checksum,extraction_status,ingestion_status,provenance,metadata,is_current,created_at)
        VALUES($1,$2,$3,$4,'client_document',$5,$6,'extracted','ingested',$7,$8,true,now()+interval '1 day')`, [s.org, parent, workspace, creator, title, hash,
        JSON.stringify({ origin: 'chat_upload', fileUploadId: file }), JSON.stringify({ originalName: title })]);
    }
    const uploads = await scope(s, () => listChatUploadsForActor(actor(s), { limit: 1 }));
    expect(uploads).toMatchObject({ total: 1, withheld: 0, hasMore: false }); expect(uploads.uploads[0].fileId).toBe('file_163_own');
    expect(JSON.stringify(uploads)).not.toContain('PRIVATE_');
  });
  it('an accessible anchor cannot launder a second private duplicate', async () => {
    const s = await seed();
    const duplicate = (await owner.query("INSERT INTO projects(organization_id,regulatory_program_id,owner_id,created_by_id,settings) VALUES($1,$2,$3,$3,'{}') RETURNING id", [s.org, s.program, s.user + 1000000])).rows[0].id;
    await owner.query("INSERT INTO project_visibility_settings VALUES($1,$2,'private')", [duplicate, s.org]);
    const admitted = await admitAnaSourceReadScope(owner, actor(s)); expect(admitted.accessibleProgramIds).toEqual([]);
    await expect(admitAnaSourceReadScope(owner, actor(s, { projectRef: s.program }))).rejects.toMatchObject({ status: 409 });
    const page = await scope(s, () => listProjectDocumentsForActor(actor(s), { limit: 1 })); expect(page.total).toBe(0);
  });
  it('pending canonical review assignment admits a viewer without project membership', async () => {
    const s = await seed(); await owner.query('DELETE FROM project_members WHERE project_id=$1 AND user_id=$2', [s.project, s.user]);
    const artifact = (await owner.query("INSERT INTO concept2cure_artifacts(organization_id,project_id,artifact_id,metadata) VALUES($1,$2,$3,'{}') RETURNING id", [s.org, s.project, randomUUID()])).rows[0].id;
    await owner.query("INSERT INTO concept2cure_review_assignments(artifact_id,organization_id,reviewer_id,status) VALUES($1,$2,$3,'pending')", [artifact, s.org, s.user]);
    expect(await admitAnaSourceReadScope(owner, actor(s, { projectRef: s.program }))).toMatchObject({ role: 'viewer', programId: s.program });
  });
  it('recorded source tenant mismatch cannot trust its otherwise valid program', async () => {
    const s = await seed(); await owner.query('UPDATE vault.documents SET organization_id=$2 WHERE id=$1', [s.document, s.org + 1]);
    expect(await scope(s, () => loadDocumentForActor({ ...actor(s), documentId: s.document }, { includeText: true, currentOnly: true }))).toBeNull();
    expect((await scope(s, () => listProjectDocumentsForActor(actor(s), { limit: 1 }))).total).toBe(0);
  });
  it('keep_data preserves eligible text but withdraws original availability', async () => {
    const s = await seed(); await withdrawal(s, 'keep_data');
    expect(await scope(s, () => loadDocumentForActor({ ...actor(s), documentId: s.document }, { includeText: true, currentOnly: true }))).toMatchObject({ id: s.document, extractedText: TEXT, disposition: 'keep_data', originalFileAvailable: false });
  });
  it('remove_data excludes source content and counts', async () => {
    const s = await seed(); await withdrawal(s, 'remove_data');
    expect(await scope(s, () => loadDocumentForActor({ ...actor(s), documentId: s.document }, { includeText: true, currentOnly: true }))).toBeNull();
    expect((await scope(s, () => listProjectDocumentsForActor(actor(s), { limit: 1 }))).total).toBe(0);
  });
  it('active viewer inserts the exact unchanged legacy receipt once', async () => {
    const s = await seed(); const handlers = new Map<string, any>(); registerDocumentCatalogHandlers((name, fn) => handlers.set(name, fn));
    const map = new Map();
    const result = await scope(s, () => handlers.get('read_project_document')({ document_id: s.document }, {
      organizationId: s.org, userId: s.user, projectId: s.project, projectRef: s.program,
      threadId: 'owned-source-fixture', toolUseId: 'real-viewer-read', readReceipts: map,
    }));
    expect(JSON.parse(result)).toMatchObject({ ok: true, window: { text: TEXT }, coverage: {
      prospective: true, currentActorExtractionProof: false, providerServedProof: false,
    } });
    expect(map.size).toBe(1); const entries = [{ tool_use_id: 'real-viewer-read', content: result }];
    expect(await scope(s, () => settleReadReceipts(entries, entries, map))).toBe(1);
    expect(await receipts(s)).toHaveLength(1); expect((await receipts(s))[0]).toMatchObject({ read_by: s.user, char_start: 0, char_end: TEXT.length, thread_id: 'owned-source-fixture' });
  });
  it('same-length extraction committed during advisory wait refuses the old snapshot', async () => {
    const s = await seed(); expect(await waitThenChange(s, 'same-length', c => c.query('UPDATE vault.documents SET extracted_text=$2 WHERE id=$1', [s.document, TEXT.replace('82', '83')]))).toEqual({ ok: false });
    expect(await receipts(s)).toHaveLength(0);
  });
  it('private access revoked during advisory wait refuses the deferred source', async () => {
    const s = await seed(); expect(await waitThenChange(s, 'revoked', c => c.query('DELETE FROM project_members WHERE project_id=$1 AND user_id=$2', [s.project, s.user]))).toEqual({ ok: false });
    expect(await receipts(s)).toHaveLength(0);
  });
  it('source SHARE reservation serializes concurrent extraction through receipt commit', async () => {
    const s = await seed(); const ready = deferred(); const release = deferred(); let writerPid = 0;
    seam.db = database('source-fence', async (sql, pid) => { if (sql.includes('SELECT d.id, d.organization_id')) { writerPid = pid; ready.resolve(); await release.promise; } });
    const pending = scope(s, () => writeGuardedLegacyReadReceipt(receipt(s))); await ready.promise;
    const held = await holder('source-dml'); const mutation = held.client.query('UPDATE vault.documents SET extracted_text=$2 WHERE id=$1', [s.document, TEXT.replace('82', '83')]);
    try { await blocked('source-dml', writerPid); release.resolve(); await pending; await mutation; }
    finally { release.resolve(); await held.client.end(); }
    expect(await receipts(s)).toHaveLength(1);
  });
  it('forced synthetic INSERT policy refusal cannot be counted as a receipt', async () => {
    const s = await seed();
    await owner.query('ALTER TABLE vault.document_read_receipts FORCE ROW LEVEL SECURITY; CREATE POLICY source_synthetic_select ON vault.document_read_receipts FOR SELECT USING(true); CREATE POLICY source_synthetic_insert ON vault.document_read_receipts FOR INSERT WITH CHECK(false)');
    try {
      const r = receipt(s); const map = new Map(); expect(deferReadReceipt({ toolUseId: 'policy-read', readReceipts: map }, r)).toBe(true);
      const entries = [{ tool_use_id: 'policy-read', content: r.result }];
      expect(await scope(s, () => settleReadReceipts(entries, entries, map))).toBe(0); expect(await receipts(s)).toHaveLength(0);
      observations.push({ rolePolicy: 'Explicit forced synthetic SELECT true / INSERT false; actual SQL refusal, zero accepted receipt count. Not deployed RLS qualification.' });
    } finally { await owner.query('DROP POLICY source_synthetic_select ON vault.document_read_receipts; DROP POLICY source_synthetic_insert ON vault.document_read_receipts; ALTER TABLE vault.document_read_receipts NO FORCE ROW LEVEL SECURITY'); }
  });
});
