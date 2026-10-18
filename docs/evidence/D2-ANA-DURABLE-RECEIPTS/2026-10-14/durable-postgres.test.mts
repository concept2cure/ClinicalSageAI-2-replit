/** Genuine owned PostgreSQL runtime source admission, ledger/RLS/lifecycle
 * proof. Runtime is app_service NOSUPERUSER NOBYPASSRLS; schema applier only
 * creates synthetic source/lifecycle prerequisites and applies actual SQL.
 * No provider requests, client endpoint, deployed/full-schema claim. */
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { randomUUID, createHash } from 'node:crypto';
import fs from 'node:fs';
import pg from 'pg';
const seam = vi.hoisted(() => ({ db: null as any }));
vi.mock('../../../../server/db.js', () => {
  const selected = () => { if (!seam.db) throw new Error('UNOWNED_DATABASE_ACCESS'); return seam.db; };
  const pool = { query: (...args: any[]) => selected().query(...args), connect: () => selected().connect() };
  return { pool, getPool: () => pool, db: {} };
});
// Synthetic audit HMAC fixture; actual audit chain/sequence/INSERT/transaction.
vi.mock('../../../../server/services/audit/audit-hmac-seal.js', async actual => ({ ...(await actual<any>()), sealRecord: () => 'f'.repeat(64) }));
import { runWithTenantScope } from '../../../../server/db/tenantStore.ts';
import { setTenantContextTx } from '../../../../server/services/tenant/governed-tenant-context.ts';
import { deferReadReceipt, readReceiptContext, settleReadReceipts } from '../../../../server/services/ana/read-receipts.ts';
import { writeGuardedReadReceipt } from '../../../../server/services/ana/source-read-receipt.ts';
import { getReadCoverage } from '../../../../server/services/vault/document-catalog.service.ts';
import { appendSourceAdmissionReceipt, readSourceAdmissionReceiptRow } from '../../../../server/services/ana/source-admission-receipt-store.ts';
import { listSourceAdmissionReceiptsForActor } from '../../../../server/services/ana/source-admission-receipt-history.ts';
import { lockDocumentDispositionProgram } from '../../../../server/services/document-data-disposition/program-lock.ts';
import { exportTenantFull, recordExportReceipt, digestOf } from '../../../../server/services/tenant-export/tenant-full-export.service.ts';
import { purgeTenant } from '../../../../server/services/tenant/tenant-offboarding.ts';

const dir = new URL('.', import.meta.url);
const fixture = JSON.parse(fs.readFileSync(new URL('durable-fixture-state.json', dir), 'utf8'));
if (fixture.phase !== 'ready' || fixture.host !== '127.0.0.1' || fixture.database !== 'ana_durable_receipt_fixture'
    || fixture.ownerRole !== 'durable_fixture_applier' || !Number.isInteger(fixture.port)
    || !/^c2c-durable-receipts-[a-z0-9-]+$/.test(fixture.name)) throw new Error('OWNED_DISPOSABLE_FIXTURE_NOT_READY');
const connection = { host: fixture.host, port: fixture.port, database: fixture.database, ssl: false,
  connectionTimeoutMillis: 3000, statement_timeout: 12000 };
const applier = new pg.Pool({ ...connection, user: fixture.ownerRole, max: 6, application_name: 'durable-review-observer' });
const handles: pg.Pool[] = [];
const observations: any[] = [];
const sha = (s: string | Buffer) => createHash('sha256').update(s).digest('hex');
const TEXT = 'Synthetic prefix '.repeat(1500) + '🧬 Specimen K17 measured 27 mg.';
const SPAN = { start: 25500, end: TEXT.length };
const migrations = ['migrations/20260905_document_catalog.sql', 'migrations/20261008e_document_catalog_attribution.sql',
  'migrations/20260930_vault_documents_version_lineage.sql', 'migrations/20261006_document_data_dispositions.sql',
  'migrations/20260906b_vault_legal_holds.sql', 'migrations/20260813_tenant_offboarding_lifecycle.sql',
  'migrations/20260813b_tenant_export_receipts.sql', 'migrations/20260921_audit_logs_chain_seq.sql',
  'migrations/20260926_vault_documents_record_immutability.sql', 'migrations/20261014_ana_source_read_receipts.sql'];
const tails = ['db/migrations/20260801_uuid_tenant_isolation_nonpublic.sql',
  'db/migrations/20260813_child_table_parent_scoped_rls.sql', 'db/migrations/20260801_tenant_isolation_sweep.sql'];
const files = ['shared/ana/source-admission-receipts.ts', 'server/services/ana/read-receipts.ts',
  'server/services/ana/source-read-receipt.ts', 'server/services/ana/source-admission-receipt-store.ts',
  'server/services/ana/source-admission-receipt-history.ts', 'server/services/ana/source-read-scope.ts',
  'server/services/ana/project-scope-admission.ts', 'server/services/vault/document-catalog.service.ts',
  'server/services/vault/document-catalog-actor-access.ts', 'server/services/vault/document-catalog-admission.ts',
  'server/services/report-os/project-access.ts', 'server/services/project-sharing-access.ts',
  'server/services/vault/vault-version-family.ts', 'server/services/document-data-disposition/eligibility.ts',
  'server/services/document-data-disposition/program-lock.ts', 'server/services/tenant/tenant-offboarding.ts',
  'server/services/tenant/tenant-source-read-receipt-purge.ts', 'server/services/tenant/tenant-purge-audit.ts',
  'server/services/tenant-export/tenant-full-export.service.ts', 'server/services/auditService.ts',
  'server/services/audit/chain.ts', 'server/services/tenant/governed-tenant-context.ts', 'server/db/sessionScope.ts',
  ...migrations, ...tails, 'docs/evidence/D2-ANA-DURABLE-RECEIPTS/2026-10-14/durable-postgres.test.mts',
  'docs/evidence/D2-ANA-DURABLE-RECEIPTS/2026-10-14/durable-postgres.config.mts'];
const hashes: Record<string, string> = {};
let orgCounter = 981000;
let org: number;
type Source = { org: number; user: number; program: string; project: number; document: string; hash: string };
type Hook = (sql: string, params: any[], pid: number) => Promise<void> | void;
function deferred() { let resolve!: () => void; const promise = new Promise<void>(r => { resolve = r; }); return { promise, resolve }; }
function database(s: Source, label: string, platform = false, hook?: Hook) {
  const role = platform ? 'app_super_admin' : 'viewer';
  const pool = new pg.Pool({ ...connection, user: 'app_service', max: 3, application_name: `durable-${label}`,
    options: `-c app.rls_enforce=on -c app.current_tenant_id=${s.org} -c app.current_org_id=${s.org} -c app.current_user_role=${role}` });
  handles.push(pool);
  return { query: (sql: string, params?: any[]) => pool.query(sql, params), connect: async () => {
    const client = await pool.connect(); const pid = (await client.query('SELECT pg_backend_pid() AS pid')).rows[0].pid;
    return { release: () => client.release(), query: async (sql: string, params: any[] = []) => {
      const result = await client.query(sql, params); await hook?.(sql, params, pid); return result;
    } };
  } };
}
const scoped = <T,>(s: Source, fn: () => T, platform = false) => runWithTenantScope({ tenantId: String(s.org), role: platform ? 'app_super_admin' : 'member', source: 'request', caller: 'owned-durable-review' }, fn);
async function seed(): Promise<Source> {
  const user = org; const program = randomUUID(); const document = randomUUID(); const hash = sha(document);
  await applier.query("INSERT INTO organizations(id,status,name,slug) VALUES($1,'active','Synthetic Tenant',$2)", [org, `synthetic-${org}`]);
  await applier.query("INSERT INTO users(id,status,name) VALUES($1,'active','Synthetic Viewer'),($2,'active','Synthetic Owner')", [user, user + 1000000]);
  await applier.query("INSERT INTO organization_users(user_id,organization_id,role) VALUES($1,$2,'viewer'),($3,$2,'member')", [user, org, user + 1000000]);
  await applier.query("INSERT INTO regulatory_programs(id,organization_id,lead_user_id) VALUES($1,$2,$3)", [program, org, user]);
  const project = (await applier.query("INSERT INTO projects(organization_id,regulatory_program_id,owner_id,created_by_id,settings) VALUES($1,$2,$3,$3,'{}') RETURNING id", [org, program, user + 1000000])).rows[0].id;
  await applier.query("INSERT INTO project_visibility_settings(project_id,organization_id,visibility) VALUES($1,$2,'private')", [project, org]);
  await applier.query("INSERT INTO project_members(project_id,organization_id,user_id,role,status) VALUES($1,$2,$3,'use','active')", [project, org, user]);
  await applier.query(`INSERT INTO vault.documents(id,organization_id,program_id,document_code,document_title,file_name,content_hash,processing_status,extracted_text)
    VALUES($1,$2,$3,$4,'Synthetic Source','source.pdf',$5,'INDEXED',$6)`, [document, org, program, `DUR-${org}`, hash, TEXT]);
  await applier.query("INSERT INTO vault.document_catalog(document_id,content_hash,catalog_status,extraction_method,char_count) VALUES($1,$2,'extracted','text',$3)", [document, hash, TEXT.length]);
  return { org, user, program, project, document, hash };
}
function pending(s: Source) {
  const sourceSnapshot = { organizationId: s.org, userId: s.user, programId: s.program, documentId: s.document,
    contentHash: s.hash, extractedTextSha256: sha(TEXT), totalChars: TEXT.length, span: { ...SPAN }, threadId: 'synthetic-reported-thread' };
  const result = JSON.stringify({ ok: true, documentId: s.document, contentHash: s.hash, extractedTextSha256: sha(TEXT), totalChars: TEXT.length,
    window: { ...SPAN, text: TEXT.slice(SPAN.start, SPAN.end) } });
  const map = new Map(); expect(deferReadReceipt(readReceiptContext(map, 'synthetic-tool'), { documentId: s.document, contentHash: s.hash, span: { ...SPAN }, readBy: s.user, sourceSnapshot, result })).toBe(true);
  return { map, receipt: map.get('synthetic-tool'), entries: [{ tool_use_id: 'synthetic-tool', content: result }] };
}
async function ledger(s: Source) { return (await applier.query('SELECT * FROM public.ana_source_read_receipts WHERE organization_id=$1 ORDER BY accepted_at,id', [s.org])).rows; }
async function legacy(s: Source) { return (await applier.query('SELECT * FROM vault.document_read_receipts WHERE document_id=$1', [s.document])).rows; }
async function save(s: Source) { seam.db = database(s, 'writer'); const p = pending(s); const outcome = await scoped(s, () => writeGuardedReadReceipt(p.receipt)); return { ...p, outcome }; }
async function stampedClient(s: Source, label: string) {
  const client = new pg.Client({ ...connection, user: 'app_service', application_name: `durable-${label}` }); await client.connect();
  await client.query('BEGIN'); await setTenantContextTx(client, s.org, 'viewer');
  const pid = (await client.query('SELECT pg_backend_pid() AS pid')).rows[0].pid; return { client, pid };
}
async function holder(label = 'holder') { const client = new pg.Client({ ...connection, user: fixture.ownerRole, application_name: `durable-${label}` }); await client.connect(); const pid = (await client.query('SELECT pg_backend_pid() AS pid')).rows[0].pid; return { client, pid }; }
async function blocked(label: string, blocker: number) {
  const deadline = Date.now() + 3500;
  while (Date.now() < deadline) {
    const rows = (await applier.query(`SELECT pid,application_name,wait_event_type,pg_blocking_pids(pid) AS blockers FROM pg_stat_activity
      WHERE datname=current_database() AND application_name LIKE $1 AND $2=ANY(pg_blocking_pids(pid))`, [`durable-${label}%`, blocker])).rows;
    if (rows.length) { observations.push({ barrier: label, blocker, waiters: rows }); return rows; }
    await new Promise(r => setTimeout(r, 25));
  }
  throw new Error(`PostgreSQL blocking barrier not observed: ${label}`);
}
async function finalExport(s: Source) {
  const q = database(s, 'export'); const payload = await exportTenantFull(q as any, s.org);
  expect(payload.coverage.tablesFailed).toEqual([]); expect(payload.coverage.truncatedTables).toEqual([]);
  const digest = digestOf(payload);
  expect(await recordExportReceipt(q as any, { organizationId: s.org, digest, tableCount: payload.tables.length, rowCount: payload.coverage.totalRows, createdBy: s.user, coverage: payload.coverage })).toMatchObject({ recorded: true });
  return { payload, digest };
}
async function readyPurge(s: Source) { await applier.query("UPDATE organizations SET status='pending_deletion',deletion_requested_at=now()-interval '60 days',deletion_requested_by=$2,deletion_reason='Synthetic offboarding request',purge_eligible_at=now()-interval '30 days' WHERE id=$1", [s.org, s.user]); return finalExport(s); }
function purge(s: Source, digest: string, db: any = database(s, 'purge', true)) {
  return scoped(s, () => purgeTenant(db as any, { organizationId: s.org, purgedByUserId: s.user,
    preconditions: { finalExportDigest: digest }, childTables: ['ana_source_read_receipts', 'vault.documents'] }), true);
}
async function status(s: Source) { return (await applier.query('SELECT status FROM organizations WHERE id=$1', [s.org])).rows[0].status; }
async function audits(s: Source) { return (await applier.query("SELECT * FROM audit_logs WHERE tenant_id=$1 AND action='tenant_purged'", [s.org])).rows; }
async function docs(s: Source) { return (await applier.query('SELECT * FROM vault.documents WHERE id=$1', [s.document])).rows; }

beforeAll(async () => {
  expect(vi.isMockFunction(pg.Pool)).toBe(false);
  await applier.query('DROP SCHEMA IF EXISTS vault CASCADE; DROP SCHEMA public CASCADE; CREATE SCHEMA public AUTHORIZATION durable_fixture_applier; CREATE SCHEMA core AUTHORIZATION durable_fixture_applier');
  const fixtureText = fs.readFileSync('server/services/document-data-disposition/__tests__/disposition-fixture.ts', 'utf8');
  const matches = [...fixtureText.matchAll(/const DDL = `([\s\S]*?)`;/g)]; expect(matches).toHaveLength(1); expect(matches[0][1]).not.toContain('${');
  await applier.query(matches[0][1]);
  await applier.query(`DROP TABLE vault.document_catalog; DROP TABLE vault.legal_holds;
    CREATE TABLE organizations(id integer PRIMARY KEY,status text,name text,slug text,api_key text,stripe_subscription_id text,updated_at timestamptz DEFAULT now());
    CREATE TABLE users(id integer PRIMARY KEY,status text,name text);
    CREATE TABLE organization_users(user_id int,organization_id int,role text,PRIMARY KEY(user_id,organization_id));
    ALTER TABLE projects ADD COLUMN client_workspace_id integer,ADD COLUMN owner_id integer,ADD COLUMN created_by_id integer,ADD COLUMN settings jsonb;
    CREATE TABLE project_visibility_settings(project_id int PRIMARY KEY,organization_id int,visibility text);
    CREATE TABLE project_members(id serial PRIMARY KEY,project_id int,organization_id int,user_id int,role text,status text);
    CREATE TABLE concept2cure_review_assignments(id serial PRIMARY KEY,artifact_id int,organization_id int,reviewer_id int,status text);
    ALTER TABLE vault.documents ADD COLUMN document_code text,ADD COLUMN document_type text,ADD COLUMN file_name text,ADD COLUMN mime_type text,ADD COLUMN folder_id uuid,
      ADD COLUMN evidence_kind text,ADD COLUMN ctd_section text,ADD COLUMN placement_status text DEFAULT 'unfiled',ADD COLUMN created_at timestamptz DEFAULT now(),
      ADD COLUMN storage_version_id text,ADD COLUMN storage_provider text;
    CREATE FUNCTION core.can_access_program(p uuid) RETURNS boolean LANGUAGE sql STABLE AS $$
      SELECT EXISTS(SELECT 1 FROM public.regulatory_programs WHERE id=p AND organization_id=NULLIF(current_setting('app.current_tenant_id',true),'')::int) $$;
    CREATE FUNCTION core.can_write_program(p uuid) RETURNS boolean LANGUAGE sql STABLE AS $$
      SELECT core.can_access_program(p) AND current_setting('app.current_user_role',true) IN ('admin','manager','member','app_super_admin') $$;`);
  for (const file of migrations) { const sql = fs.readFileSync(file, 'utf8'); await applier.query(sql); await applier.query(sql); }
  for (const file of tails) { await applier.query(fs.readFileSync(file, 'utf8')); }
  await applier.query('GRANT USAGE ON SCHEMA public,vault,core TO app_service; GRANT SELECT,INSERT,UPDATE,DELETE ON ALL TABLES IN SCHEMA public,vault TO app_service; GRANT USAGE,SELECT ON ALL SEQUENCES IN SCHEMA public,vault TO app_service');
  // Normal mutation grants here let the actual append-only triggers prove
  // refusal. No schema CREATE, role membership or BYPASS is granted to runtime.
  process.env.ANA_DURABLE_SOURCE_READ_RECEIPTS = '1'; process.env.AUDIT_HMAC_KEY = 'synthetic-owned-durable-fixture-key';
  for (const file of files) hashes[file] = sha(fs.readFileSync(file));
});
beforeEach(() => { org = ++orgCounter; });
afterEach(async () => {
  // Each case owns its runtime pools. Keep only the observer/applier alive;
  // retaining every prior pool would consume the bounded fixture's slots.
  const caseHandles = handles.splice(0);
  await Promise.all(caseHandles.map(p => p.end()));
  seam.db = null;
});
afterAll(async () => {
  const after = Object.fromEntries(files.map(f => [f, sha(fs.readFileSync(f))])); const changedSources = files.filter(f => hashes[f] !== after[f]);
  fs.writeFileSync(new URL('durable-postgres-observations.json', dir), JSON.stringify({ runtime: process.version, fixture: { name: fixture.name, database: fixture.database, applier: fixture.ownerRole, runtimeRole: 'app_service', image: fixture.image },
    proofScope: 'Actual application selected writer, ledger/history, installed FORCE tenant RLS, idempotence/concurrency, complete tenant export and controlled canonical purge SQL on owned synthetic PostgreSQL. Synthetic minimum precursor schema/core program functions/audit HMAC. Not deployed roles/full schema/provider or regulatory qualification.', observations,
    before: hashes, after, changedSources, sourcesUnchangedDuringRun: changedSources.length === 0 }, null, 2) + '\n');
  await Promise.all(handles.map(p => p.end())); await applier.end(); seam.db = null;
  expect(changedSources).toEqual([]);
});

describe('genuine PostgreSQL durable source admission and governed lifecycle', () => {
  it('PG01 actual installed runtime/purger posture, populated replay and ordinary append-only controls', async () => {
    const s = await seed(); await save(s);
    // The generic append contract represents disjoint ranges; no new actual
    // multi-range source reader is inferred from this storage control.
    const base = (await readSourceAdmissionReceiptRow((await ledger(s))[0])).descriptor;
    const ranges = Array.from({ length: 8 }, (_, i) => ({ start: SPAN.start + i * 3, end: SPAN.start + i * 3 + 2, sha256: sha(TEXT.slice(SPAN.start + i * 3, SPAN.start + i * 3 + 2)) }));
    await appendSourceAdmissionReceipt(applier as any, { ...base, receiptId: randomUUID(), ranges, toolUseId: null, threadId: null });
    const before = await ledger(s); expect(before).toHaveLength(2);
    const q = database(s, 'role-probe'); const identity = (await q.query(`SELECT current_database(),current_user,pg_backend_pid(),rolsuper,rolbypassrls,rolcreaterole FROM pg_roles WHERE rolname=current_user`)).rows[0];
    expect(identity.current_database).toBe(fixture.database); expect(identity.current_user).toBe('app_service'); expect(identity.rolsuper).toBe(false); expect(identity.rolbypassrls).toBe(false); expect(identity.rolcreaterole).toBe(false);
    const posture = (await applier.query(`SELECT relrowsecurity,relforcerowsecurity FROM pg_class WHERE oid='public.ana_source_read_receipts'::regclass`)).rows[0]; expect(posture).toEqual({ relrowsecurity: true, relforcerowsecurity: true });
    const purger = (await applier.query("SELECT rolcanlogin,rolsuper,rolbypassrls,rolcreaterole FROM pg_roles WHERE rolname='ana_record_purger'")).rows[0]; expect(purger).toEqual({ rolcanlogin: false, rolsuper: false, rolbypassrls: false, rolcreaterole: false });
    expect((await applier.query("SELECT pg_has_role('app_service','ana_record_purger','MEMBER') AS member")).rows[0].member).toBe(false);
    expect((await applier.query("SELECT count(*)::int AS n FROM pg_proc p, LATERAL aclexplode(p.proacl) a WHERE p.oid='public.purge_tenant_source_read_receipts(integer)'::regprocedure AND a.grantee=0 AND a.privilege_type='EXECUTE'")).rows[0].n).toBe(0);
    await applier.query(fs.readFileSync('migrations/20261014_ana_source_read_receipts.sql', 'utf8')); for (const f of tails) await applier.query(fs.readFileSync(f, 'utf8'));
    expect(await ledger(s)).toEqual(before);
    for (const db of [q, applier]) for (const sql of ['UPDATE public.ana_source_read_receipts SET admitted_role=admitted_role WHERE organization_id=$1', 'DELETE FROM public.ana_source_read_receipts WHERE organization_id=$1']) await expect(db.query(sql, [s.org])).rejects.toThrow('IMMUTABILITY_VIOLATION');
    await expect(applier.query('TRUNCATE public.ana_source_read_receipts')).rejects.toThrow('IMMUTABILITY_VIOLATION');
    await expect(applier.query(`INSERT INTO public.ana_source_read_receipts(id,organization_id,receipt_version,checkpoint,actor_user_id,admitted_role,program_id,document_id,original_sha256,extraction_sha256,total_chars,ranges,payload_sha256,tool_use_id,thread_id,receipt_sha256)
      SELECT gen_random_uuid(),organization_id,receipt_version,checkpoint,actor_user_id,admitted_role,program_id,document_id,original_sha256,extraction_sha256,total_chars,ranges,payload_sha256,tool_use_id,'bad'||chr(128),receipt_sha256 FROM public.ana_source_read_receipts WHERE id=$1`, [base.receiptId])).rejects.toMatchObject({ code: '23514' });
    observations.push({ runtime: identity, policy: posture, purger, ordinaryMutationProof: 'Actual triggers, not merely missing runtime privileges; applier ordinary DML also refuses. Schema administrators remain outside immutable-runtime guarantee.' });
  });
  it('PG02 actual default selected writer commits viewer V2 despite actual legacy INSERT denial', async () => {
    const s = await seed(); seam.db = database(s, 'default-writer'); const p = pending(s); const outcomes: any[] = [];
    expect(await scoped(s, () => settleReadReceipts(p.entries, p.entries, p.map, undefined, { onReceiptSettled: (_id, out) => outcomes.push(out) }))).toBe(1);
    const rows = await ledger(s); expect(rows).toHaveLength(1); expect(await legacy(s)).toHaveLength(0);
    expect(await getReadCoverage(s.document, s.hash, TEXT.length, seam.db)).toMatchObject({ complete: false, coveredChars: 0 });
    expect(rows[0]).toMatchObject({ actor_user_id: s.user, admitted_role: 'viewer', total_chars: TEXT.length, ranges: [{ ...SPAN, sha256: sha(TEXT.slice(SPAN.start)) }], payload_sha256: sha(p.receipt.result) });
    expect(outcomes[0]).toMatchObject({ receiptId: p.receipt.admissionId, legacyReceipt: 'not_recorded_permission_denied', outcome: 'recorded' });
    expect(await scoped(s, () => writeGuardedReadReceipt(p.receipt))).toMatchObject({ outcome: 'already_recorded', receiptId: p.receipt.admissionId }); expect(await ledger(s)).toHaveLength(1);
  });
  it('PG03 actual FORCE tenant RLS hides foreign metadata and refuses foreign insert', async () => {
    const s = await seed(); await save(s); const foreign = { ...s, org: s.org + 1000000 }; const q = database(foreign, 'foreign');
    expect((await q.query('SELECT * FROM public.ana_source_read_receipts WHERE organization_id=$1', [s.org])).rows).toEqual([]);
    const d = (await readSourceAdmissionReceiptRow((await ledger(s))[0])).descriptor;
    await expect(appendSourceAdmissionReceipt(q as any, { ...d, receiptId: randomUUID() })).rejects.toMatchObject({ code: 'ANA_ADMISSION_RECEIPT_UNCONFIRMED' }); expect(await ledger(s)).toHaveLength(1);
  });
  it('PG04 two-session identical and mismatched ID retries wait then preserve one immutable row', async () => {
    const s = await seed(); await save(s); const base = (await readSourceAdmissionReceiptRow((await ledger(s))[0])).descriptor;
    for (const mismatch of [false, true]) {
      const d = { ...base, receiptId: randomUUID() }; const a = await stampedClient(s, 'id-first'); const b = await stampedClient(s, mismatch ? 'id-mismatch' : 'id-identical');
      try {
        expect(await appendSourceAdmissionReceipt(a.client as any, d)).toMatchObject({ outcome: 'recorded' });
        const changed = mismatch ? { ...d, payloadSha256: sha('different payload') } : d;
        const pending = appendSourceAdmissionReceipt(b.client as any, changed).then(value => ({ value }), error => ({ error }));
        await blocked(mismatch ? 'id-mismatch' : 'id-identical', a.pid); await a.client.query('COMMIT');
        const out = await pending;
        if (mismatch) { expect((out as any).error).toMatchObject({ code: 'ANA_ADMISSION_RECEIPT_CONFLICT' }); await b.client.query('ROLLBACK'); }
        else { expect((out as any).value).toMatchObject({ outcome: 'already_recorded' }); await b.client.query('COMMIT'); }
      } finally { await a.client.query('ROLLBACK').catch(() => {}); await b.client.query('ROLLBACK').catch(() => {}); await a.client.end(); await b.client.end(); }
    }
    expect(await ledger(s)).toHaveLength(3);
  });
  it('PG05 actor/private history filters before count/LIMIT and survives source removal', async () => {
    const s = await seed(); await save(s); const base = (await readSourceAdmissionReceiptRow((await ledger(s))[0])).descriptor;
    const privateProgram = randomUUID(); await applier.query('INSERT INTO regulatory_programs(id,organization_id) VALUES($1,$2)', [privateProgram, s.org]);
    const project = (await applier.query("INSERT INTO projects(organization_id,regulatory_program_id,owner_id,created_by_id,settings) VALUES($1,$2,$3,$3,'{}') RETURNING id", [s.org, privateProgram, s.user + 1000000])).rows[0].id;
    await applier.query("INSERT INTO project_visibility_settings VALUES($1,$2,'private')", [project, s.org]);
    await appendSourceAdmissionReceipt(applier as any, { ...base, receiptId: randomUUID(), programId: privateProgram, threadId: 'PRIVATE_THREAD_SENTINEL' });
    await appendSourceAdmissionReceipt(applier as any, { ...base, receiptId: randomUUID(), actorId: s.user + 1000000, threadId: 'OTHER_ACTOR_SENTINEL' });
    seam.db = database(s, 'history'); const input = { organizationId: s.org, userId: s.user };
    const page = await scoped(s, () => listSourceAdmissionReceiptsForActor(input, { limit: 1 })); expect(page).toMatchObject({ total: 1, withheld: 0, providerDelivery: 'unestablished', sourceUse: 'historical_admission_only' }); expect(JSON.stringify(page)).not.toMatch(/PRIVATE_THREAD|OTHER_ACTOR/);
    await applier.query('DELETE FROM vault.documents WHERE id=$1', [s.document]);
    expect((await scoped(s, () => listSourceAdmissionReceiptsForActor(input, { documentId: s.document }))).total).toBe(1);
    await applier.query('DELETE FROM project_members WHERE project_id=$1 AND user_id=$2', [s.project, s.user]);
    expect((await scoped(s, () => listSourceAdmissionReceiptsForActor(input))).total).toBe(0);
  });
  it('PG06 same-length re-extraction committed during advisory wait refuses V2 admission', async () => {
    const s = await seed(); const held = await holder(); await held.client.query('BEGIN'); await lockDocumentDispositionProgram(held.client, s.org, s.program);
    seam.db = database(s, 're-extract'); const p = pending(s); const writing = scoped(s, () => writeGuardedReadReceipt(p.receipt)).then(() => true, () => false);
    try { await blocked('re-extract', held.pid); await held.client.query('UPDATE vault.documents SET extracted_text=$2 WHERE id=$1', [s.document, TEXT.replace('27 mg', '72 mg')]); await held.client.query('COMMIT'); expect(await writing).toBe(false); }
    finally { await held.client.query('ROLLBACK').catch(() => {}); await held.client.end(); }
    expect(await ledger(s)).toHaveLength(0); expect(await legacy(s)).toHaveLength(0);
  });
  it('PG07 cancellation after actual V2 INSERT rolls back the transaction and accepted count', async () => {
    const s = await seed(); const controller = new AbortController(); seam.db = database(s, 'cancel', false, sql => { if (sql.startsWith('INSERT INTO public.ana_source_read_receipts')) controller.abort(); });
    const p = pending(s); expect(await scoped(s, () => settleReadReceipts(p.entries, p.entries, p.map, undefined, { signal: controller.signal }))).toBe(0);
    expect(await ledger(s)).toHaveLength(0); expect(await legacy(s)).toHaveLength(0);
  });
  it('PG08 actual complete export contains durable hashes/ranges and records final export evidence', async () => {
    const s = await seed(); await save(s); const out = await finalExport(s); const table = out.payload.tables.find(t => t.table === 'ana_source_read_receipts'); expect(table?.rows).toHaveLength(1);
    expect(table?.rows[0]).toMatchObject({ extraction_sha256: sha(TEXT), actor_user_id: s.user }); expect(JSON.stringify(table)).not.toContain('Specimen');
    expect((await applier.query('SELECT digest FROM tenant_export_receipts WHERE organization_id=$1', [s.org])).rows[0].digest).toBe(out.digest);
  });
  it('PG09 canonical purge uses actual NOLOGIN/Vault doors and one retained chained audit', async () => {
    const s = await seed(); await save(s); const out = await readyPurge(s); expect(await purge(s, out.digest)).toMatchObject({ status: 'purged', sourceReadReceiptErasure: { receipts: 1 } });
    expect(await ledger(s)).toHaveLength(0); expect(await docs(s)).toHaveLength(0); const audit = await audits(s); expect(audit).toHaveLength(1); expect(audit[0].chain_seq).not.toBeNull(); expect(audit[0].new_values).toMatchObject({ deletedRows: { ana_source_read_receipts: 1 }, exportManifest: { digest: out.digest } });
  });
  it('PG10 audit failure rolls back ledger, Vault deletion and status together', async () => {
    const s = await seed(); await save(s); const out = await readyPurge(s);
    await applier.query(`CREATE FUNCTION public.durable_fail_audit() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN IF NEW.action='tenant_purged' THEN RAISE EXCEPTION 'synthetic audit refused'; END IF; RETURN NEW; END $$; CREATE TRIGGER durable_fail_audit BEFORE INSERT ON audit_logs FOR EACH ROW EXECUTE FUNCTION public.durable_fail_audit()`);
    try { await expect(purge(s, out.digest)).rejects.toThrow('synthetic audit refused'); }
    finally { await applier.query('DROP TRIGGER durable_fail_audit ON audit_logs; DROP FUNCTION public.durable_fail_audit()'); }
    expect(await status(s)).toBe('pending_deletion'); expect(await ledger(s)).toHaveLength(1); expect(await docs(s)).toHaveLength(1); expect(await audits(s)).toHaveLength(0);
  });
  it('PG11 changed final export after source reservation wait refuses all erasure', async () => {
    const s = await seed(); await save(s); const out = await readyPurge(s); const held = await holder(); await held.client.query('BEGIN'); await held.client.query('LOCK TABLE vault.document_catalog IN SHARE MODE');
    const pending = purge(s, out.digest, database(s, 'export-change', true)).then(() => true, () => false);
    try { await blocked('export-change', held.pid); await held.client.query('UPDATE tenant_export_receipts SET row_count=row_count+1 WHERE organization_id=$1 AND digest=$2', [s.org, out.digest]); await held.client.query('COMMIT'); expect(await pending).toBe(false); }
    finally { await held.client.query('ROLLBACK').catch(() => {}); await held.client.end(); }
    expect(await ledger(s)).toHaveLength(1); expect(await status(s)).toBe('pending_deletion');
  });
  it('PG12 fresh status and retention are rechecked after organization lock waits', async () => {
    for (const change of ["status='active'", "purge_eligible_at=now()+interval '30 days'"]) {
      org = ++orgCounter; const s = await seed(); await save(s); const out = await readyPurge(s); const held = await holder(); await held.client.query('BEGIN'); await held.client.query('SELECT id FROM organizations WHERE id=$1 FOR UPDATE', [s.org]);
      const pending = purge(s, out.digest, database(s, 'status-change', true)).then(() => true, () => false);
      try { await blocked('status-change', held.pid); await held.client.query(`UPDATE organizations SET ${change} WHERE id=$1`, [s.org]); await held.client.query('COMMIT'); expect(await pending).toBe(false); }
      finally { await held.client.query('ROLLBACK').catch(() => {}); await held.client.end(); }
      expect(await ledger(s)).toHaveLength(1); expect(await docs(s)).toHaveLength(1);
    }
  });
  it('PG13 active hold committed while purge waits is observed before deletes', async () => {
    const s = await seed(); await save(s); const out = await readyPurge(s); const held = await holder(); await held.client.query('BEGIN');
    await held.client.query("INSERT INTO vault.legal_holds(organization_id,reference,reason,scope,program_id) VALUES($1,'synthetic matter','Synthetic hold','program',$2)", [s.org, s.program]);
    const pending = purge(s, out.digest, database(s, 'hold-change', true)).then(() => true, () => false);
    try { await blocked('hold-change', held.pid); await held.client.query('COMMIT'); expect(await pending).toBe(false); }
    finally { await held.client.query('ROLLBACK').catch(() => {}); await held.client.end(); }
    expect(await ledger(s)).toHaveLength(1); expect(await docs(s)).toHaveLength(1); expect(await audits(s)).toHaveLength(0);
  });
  it('PG14 source writer barriers precede purge organization locks without an inversion', async () => {
    const s = await seed(); await save(s); const out = await finalExport(s); const ready = deferred(); const release = deferred(); let writerPid = 0;
    seam.db = database(s, 'writer-before-org', false, async (sql, _v, pid) => { if (sql === 'LOCK TABLE vault.documents IN SHARE MODE') { writerPid = pid; ready.resolve(); await release.promise; } });
    const writing = scoped(s, () => writeGuardedReadReceipt(pending(s).receipt)).then(() => true, () => false); await ready.promise;
    await applier.query("UPDATE organizations SET status='pending_deletion',deletion_requested_at=now()-interval '60 days',deletion_reason='Synthetic offboarding',purge_eligible_at=now()-interval '30 days' WHERE id=$1", [s.org]);
    const purging = purge(s, out.digest, database(s, 'purge-after-writer', true));
    try { await blocked('purge-after-writer', writerPid); release.resolve(); expect(await writing).toBe(false); expect(await purging).toMatchObject({ status: 'purged' }); }
    finally { release.resolve(); }
    expect(await ledger(s)).toHaveLength(0);
  });
  it('PG15 held status and legal-hold reservations serialize late mutation through COMMIT', async () => {
    const s = await seed(); await save(s); const out = await readyPurge(s); const ready = deferred(); const release = deferred(); let purgePid = 0;
    const db = database(s, 'purge-fence', true, async (sql, _v, pid) => { if (sql.startsWith('SELECT receipts FROM public.purge_tenant_source_read_receipts')) { purgePid = pid; ready.resolve(); await release.promise; } });
    const purging = purge(s, out.digest, db); await ready.promise;
    const statusHolder = await holder('late-status'); const holdHolder = await holder('late-hold');
    const changingStatus = statusHolder.client.query("UPDATE organizations SET deletion_reason='Later synthetic reason' WHERE id=$1", [s.org]);
    const addingHold = holdHolder.client.query("INSERT INTO vault.legal_holds(organization_id,reference,reason,scope,program_id) VALUES($1,'later matter','Later hold','program',$2)", [s.org, s.program]);
    try { await blocked('late-status', purgePid); await blocked('late-hold', purgePid); release.resolve(); expect(await purging).toMatchObject({ status: 'purged' }); await changingStatus; await addingHold; }
    finally { release.resolve(); await statusHolder.client.end(); await holdHolder.client.end(); }
    expect(await ledger(s)).toHaveLength(0); expect(await audits(s)).toHaveLength(1);
  });
  it('PG16 zero-row status UPDATE cannot commit source erasure or its audit', async () => {
    const s = await seed(); await save(s); const out = await readyPurge(s);
    await applier.query(`CREATE FUNCTION public.durable_zero_status() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN IF NEW.status='purged' THEN RETURN NULL; END IF; RETURN NEW; END $$; CREATE TRIGGER durable_zero_status BEFORE UPDATE ON organizations FOR EACH ROW EXECUTE FUNCTION public.durable_zero_status()`);
    try { await expect(purge(s, out.digest)).rejects.toThrow(); }
    finally { await applier.query('DROP TRIGGER durable_zero_status ON organizations; DROP FUNCTION public.durable_zero_status()'); }
    expect(await ledger(s)).toHaveLength(1); expect(await docs(s)).toHaveLength(1); expect(await status(s)).toBe('pending_deletion'); expect(await audits(s)).toHaveLength(0);
  });
});
