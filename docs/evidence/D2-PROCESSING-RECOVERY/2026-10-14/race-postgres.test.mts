/** Opt-in genuine PostgreSQL sessions against ONLY race-postgres-fixture.mjs.
 * Actual canonical processing/disposition SQL and selected migrations.
 * OCR, classification, dataset profiling, filesystem loader and audit seal are
 * controlled seams. This is bounded local race/policy proof, not deployment PQ.
 */
import { beforeAll, beforeEach, afterAll, describe, expect, it, vi } from 'vitest';
import { createHash, randomUUID } from 'node:crypto';
import fs from 'node:fs';
import pg from 'pg';

const seam = vi.hoisted(() => ({ extract: vi.fn(), profile: vi.fn(), load: vi.fn() }));
// Explicit injection is mandatory; an accidental global DB call fails closed.
vi.mock('../../../../server/db.js', () => ({
  pool: { query: () => { throw new Error('UNOWNED_DATABASE_ACCESS'); }, connect: () => { throw new Error('UNOWNED_DATABASE_ACCESS'); } },
  getPool: () => { throw new Error('UNOWNED_DATABASE_ACCESS'); },
}));
vi.mock('../../../../server/utils/logger.js', () => ({ createScopedLogger: () => ({ warn: vi.fn(), info: vi.fn(), error: vi.fn() }) }));
vi.mock('../../../../server/services/clinical-regulatory-evidence/dataset-profile.js', () => ({ profileDataset: seam.profile }));
vi.mock('../../../../server/services/ocr/index.js', () => ({ extractDocumentText: seam.extract }));
vi.mock('../../../../server/services/ana/uploaded-file-access.js', () => ({ loadUploadedFile: seam.load }));
vi.mock('../../../../server/services/vault/vault-filing.service.js', () => ({
  resolveVaultView: async () => 'fixture', resolveOrgVaultView: async () => 'fixture',
  classifyForFiling: () => ({ evidenceKind: 'protocol', needsReview: true, confidence: 0, rationale: 'controlled fixture classifier' }),
}));
import { processCapturedSource } from '../../../../server/services/clinical-regulatory-evidence/data-room-processing.ts';
import { lockDocumentDispositionProgram } from '../../../../server/services/document-data-disposition/program-lock.ts';
import { createDocumentDispositionService } from '../../../../server/services/document-data-disposition/service.ts';
import { tenantIsolationPolicySql } from '../../../../tests/db/harness.ts';

const dir = new URL('.', import.meta.url);
const fixture = JSON.parse(fs.readFileSync(new URL('race-fixture-state.json', dir), 'utf8'));
if (fixture.phase !== 'ready' || fixture.host !== '127.0.0.1' || fixture.database !== 'd2_processing_fixture'
  || fixture.ownerRole !== 'd2_fixture_owner' || !Number.isInteger(fixture.port) || !fixture.name.startsWith('c2c-d2-race-')) {
  throw new Error('OWNED_DISPOSABLE_FIXTURE_NOT_READY');
}
const connection = { host: fixture.host, port: fixture.port, database: fixture.database, user: fixture.ownerRole,
  ssl: false, connectionTimeoutMillis: 3000, statement_timeout: 10000 };
const owner = new pg.Pool({ ...connection, max: 6, application_name: 'd2-race-observer' });
const handles: Array<pg.Pool> = [];
const observations: any[] = [];
const hashes: Record<string, string> = {};
const bodies = new Map<string, Buffer>();
let tenant = 946000;
let org: number;
const BODY = 'Clinical study protocol version 2.0. Cardiotoxicity monitoring is required.';
const sha = (v: string | Buffer) => createHash('sha256').update(v).digest('hex');
type Capture = { org: number; id: number; program: string | null; workspace: number | null; fileId: string; bytes: Buffer; hash: string };
type Hook = (sql: string, params: unknown[], context: { pid: number; tx: number }) => Promise<void> | void;

function database(label: string, hook?: Hook, overrides: Record<string, any> = {}) {
  const pool = new pg.Pool({ ...connection, max: 4, application_name: `d2-race-${label}`, ...overrides });
  handles.push(pool);
  let tx = 0;
  const events: Array<{ sql: string; tx: number; pid: number }> = [];
  return { events, query: (sql: string, params?: unknown[]) => pool.query(sql, params),
    connect: async () => {
      const c = await pool.connect();
      const pid = (await c.query('SELECT pg_backend_pid() AS pid')).rows[0].pid;
      const current = ++tx;
      await c.query('SELECT set_config($1,$2,false)', ['application_name', `d2-race-${label}-${current}`]);
      return { release: () => c.release(), query: async (sql: string, params: unknown[] = []) => {
        const result = await c.query(sql, params);
        events.push({ sql, tx: current, pid });
        await hook?.(sql, params, { pid, tx: current });
        return result;
      } };
    } };
}
function deferred<T = void>() {
  let resolve!: (value: T) => void;
  let reject!: (reason: unknown) => void;
  const promise = new Promise<T>((yes, no) => { resolve = yes; reject = no; });
  return { promise, resolve, reject };
}
async function program() {
  const id = randomUUID();
  await owner.query('INSERT INTO regulatory_programs (id,organization_id,lead_user_id) VALUES ($1,$2,42)', [id, org]);
  return id;
}
async function capture(options: { program?: string | null; workspace?: number; fileId?: string } = {}): Promise<Capture> {
  const p = options.program === undefined ? await program() : options.program;
  const fileId = options.fileId ?? randomUUID();
  const bytes = Buffer.from(BODY);
  const storagePath = `uploads/org-${org}/${fileId}.txt`;
  bodies.set(fileId, bytes);
  await owner.query(`INSERT INTO file_uploads (id,organization_id,checksum_sha256,storage_path,status,original_name,mime_type,file_size)
    VALUES ($1,$2,$3,$4,'uploaded','Protocol.txt','text/plain',$5) ON CONFLICT (id) DO NOTHING`, [fileId, org, sha(bytes), storagePath, bytes.length]);
  const result = await owner.query(`INSERT INTO cre_evidence_sources
    (organization_id,client_program_id,client_workspace_id,source_type,title,checksum,stored_artifact_ref,
      extraction_status,ingestion_status,provenance,metadata,is_current)
    VALUES ($1,$2,$3,'client_document','Protocol.txt',$4,$5,'pending','ingested',$6,'{}',true) RETURNING id`,
  [org, p, options.workspace ?? null, sha(bytes), storagePath, JSON.stringify({ origin: 'adopt', fileUploadId: fileId })]);
  return { org, id: result.rows[0].id, program: p, workspace: options.workspace ?? null, fileId, bytes, hash: sha(bytes) };
}
async function row(c: Capture) { return (await owner.query('SELECT * FROM cre_evidence_sources WHERE id=$1 AND organization_id=$2', [c.id, c.org])).rows[0]; }
function run(c: Capture, db: ReturnType<typeof database>) {
  return processCapturedSource(c.org, c.id, { bytes: c.bytes, fileName: 'Protocol.txt', mimeType: 'text/plain',
    programId: c.program, expectedWorkspaceId: c.workspace, processedBy: 'real PostgreSQL race fixture' }, { db });
}
async function paused(c: Capture, db: ReturnType<typeof database>) {
  const reached = deferred();
  const release = deferred<{ text: string; method: string; pageSpans: never[] }>();
  seam.extract.mockImplementationOnce(async () => { reached.resolve(); return release.promise; });
  const pending = run(c, db);
  await Promise.race([reached.promise, pending.then(result => { throw new Error(`Attempt ended before extraction barrier: ${JSON.stringify(result)}`); })]);
  return { pending, finish: () => release.resolve({ text: BODY, method: 'plain-text', pageSpans: [] }), fail: () => release.reject(new Error('controlled late extraction failure')) };
}
async function independent() {
  const c = new pg.Client({ ...connection, application_name: 'd2-race-holder' });
  await c.connect();
  const pid = (await c.query('SELECT pg_backend_pid() AS pid')).rows[0].pid;
  return { client: c, pid };
}
async function blocked(label: string, blocker: number, count = 1) {
  const deadline = Date.now() + 3500;
  while (Date.now() < deadline) {
    const { rows } = await owner.query(`SELECT pid,application_name,wait_event_type,pg_blocking_pids(pid) AS blockers
      FROM pg_stat_activity WHERE datname=current_database() AND application_name LIKE $1 AND $2=ANY(pg_blocking_pids(pid))`,
    [`d2-race-${label}%`, blocker]);
    if (rows.length >= count) { observations.push({ barrier: label, blocker, waiters: rows }); return rows; }
    await new Promise(resolve => setTimeout(resolve, 25));
  }
  throw new Error(`Independent-session barrier was not observed: ${label}`);
}
async function expire(c: Capture) {
  await owner.query(`UPDATE cre_evidence_sources SET metadata=jsonb_set(jsonb_set(metadata,'{dataRoomProcessing,leaseExpiresAt}',to_jsonb($3::text)),
    '{dataRoomProcessing,claimedAt}',to_jsonb($4::text)) WHERE id=$1 AND organization_id=$2`,
  [c.id, c.org, new Date(Date.now() - 60000).toISOString(), new Date(Date.now() - 16*60000).toISOString()]);
}
function disposition(c: Capture, db: ReturnType<typeof database>) {
  const service = createDocumentDispositionService({ db,
    audit: async (q, entry) => { const id = randomUUID(); await q.query('INSERT INTO test_disposition_audit VALUES ($1,$2,$3)', [id,c.org,JSON.stringify(entry)]); return { id, sha256Chain: 'f'.repeat(64) }; },
    enabled: () => true, tokenSecret: 'd2-local-race-fixture-secret-at-least-32-characters' });
  const scope = { organizationId: c.org, programId: c.program!, actorId: 42, orgRole: 'manager', targetType: 'captured_source' as const, targetId: String(c.id) };
  return { preview: () => service.preview(scope), apply: (previewToken: string) => service.apply({ ...scope, choice: 'keep_data',
    reason: 'Controlled fixture withdrawal of synthetic original bytes', previewToken }) };
}
beforeAll(async () => {
  expect(vi.isMockFunction(pg.Pool)).toBe(false);
  const identity = (await owner.query('SELECT version(),current_database(),current_user,pg_backend_pid()')).rows[0];
  expect(identity.current_database).toBe(fixture.database);
  expect(identity.current_user).toBe(fixture.ownerRole);
  observations.push({ server: identity, image: fixture.image, role: 'owner', RLS: 'not established by owner tests' });
  // Reinitialization is confined to this verified owned disposable database.
  await owner.query(`DROP SCHEMA IF EXISTS vault CASCADE; DROP SCHEMA public CASCADE;
    CREATE SCHEMA public AUTHORIZATION d2_fixture_owner; DROP ROLE IF EXISTS d2_fixture_runtime;`);
  const fixtureSource = fs.readFileSync(new URL('../../../../server/services/document-data-disposition/__tests__/disposition-fixture.ts', dir), 'utf8');
  const templates = [...fixtureSource.matchAll(/const DDL = `([\s\S]*?)`;/g)];
  expect(templates).toHaveLength(1);
  expect(templates[0][1]).not.toContain('${');
  await owner.query(templates[0][1]);
  await owner.query(`ALTER TABLE cre_evidence_sources ADD COLUMN client_workspace_id integer, ADD COLUMN stored_artifact_ref text,
    ADD COLUMN created_by integer, ADD COLUMN created_at timestamptz DEFAULT now(), ADD COLUMN version text,
    ADD COLUMN product text, ADD COLUMN indication text, ADD COLUMN phase text, ADD COLUMN application_type text,
    ADD COLUMN application_number text, ADD COLUMN agency text, ADD COLUMN trial_registry_identifier text,
    ADD COLUMN document_date date, ADD COLUMN study_ref integer;
    ALTER TABLE file_uploads ADD COLUMN original_name text, ADD COLUMN mime_type text, ADD COLUMN file_size bigint;
    ALTER TABLE vault.documents ADD COLUMN file_name text;
    ALTER TABLE regulatory_programs ADD COLUMN product_name text, ADD COLUMN indication text, ADD COLUMN phase text,
    ADD COLUMN program_type text, ADD COLUMN application_number text, ADD COLUMN primary_agency text;
    CREATE TABLE client_workspaces(id serial PRIMARY KEY,organization_id integer,status text,deleted_at timestamptz);
    CREATE TABLE cdisc_prm_studies(id serial PRIMARY KEY,tenant_id integer,program_id uuid,study_id text,protocol_id text);`);
  for (const name of ['20261006_document_data_dispositions.sql', '20261008e_document_catalog_attribution.sql',
    '20260906_vault_documents_fulltext.sql', '20261008c_data_room_source_text.sql', '20261001_cre_evidence_sources_capture_immutability.sql']) {
    const content = fs.readFileSync(new URL(`../../../../migrations/${name}`, dir), 'utf8');
    hashes[`migrations/${name}`] = sha(content);
    await owner.query(content); await owner.query(content);
  }
  for (const name of ['server/services/document-data-disposition/__tests__/disposition-fixture.ts',
    'server/services/clinical-regulatory-evidence/data-room-processing.ts', 'server/services/clinical-regulatory-evidence/data-room-processing-store.ts',
    'server/services/clinical-regulatory-evidence/data-room-processing-state.ts', 'server/services/document-data-disposition/service.ts',
    'server/services/clinical-regulatory-evidence/data-room-processing-sweep.ts',
    'server/services/document-data-disposition/eligibility.ts', 'server/services/document-data-disposition/program-lock.ts',
    'server/services/document-data-disposition/impact.ts', 'server/services/document-data-disposition/recorded-lineage.ts',
    'server/services/document-data-disposition/derived-impact.ts', 'shared/data-room-processing-status.ts', 'tests/db/harness.ts',
    'docs/evidence/D2-PROCESSING-RECOVERY/2026-10-14/race-postgres.test.mts',
    'docs/evidence/D2-PROCESSING-RECOVERY/2026-10-14/race-postgres.config.mts']) {
    hashes[name] = sha(fs.readFileSync(new URL(`../../../../${name}`, dir)));
  }
});
beforeEach(() => {
  org = ++tenant;
  seam.extract.mockReset().mockImplementation(async (bytes: Buffer) => ({ text: bytes.toString('utf8'), method: 'plain-text', pageSpans: [] }));
  seam.profile.mockReset().mockResolvedValue(null);
  seam.load.mockReset().mockImplementation(async (id: string, tenantId: number) => {
    const f = (await owner.query('SELECT * FROM file_uploads WHERE id=$1 AND organization_id=$2', [id,tenantId])).rows[0];
    if (!f || !bodies.has(id)) throw new Error('Synthetic original unavailable');
    return { fileId: id, fileName: f.original_name, mimeType: f.mime_type, storagePath: f.storage_path,
      fileSize: Number(f.file_size), buffer: Buffer.from(bodies.get(id)!), integrity: 'verified' };
  });
});
afterAll(async () => {
  await Promise.all(handles.map(pool => pool.end()));
  await owner.end();
  const finalHashes=Object.fromEntries(Object.keys(hashes).map(name=>[name,sha(fs.readFileSync(new URL(`../../../../${name}`,dir)))]));
  fs.writeFileSync(new URL('race-postgres-observations.json', dir), `${JSON.stringify({ fixture, hashes, finalHashes,
    sourcesUnchangedDuringRun:Object.keys(hashes).every(name=>hashes[name]===finalHashes[name]), observations,
    limits: ['Local synthetic PostgreSQL16 only', 'Controlled extraction/loader/profile/classifier/audit-seal seams',
      'Canonical RLS policy tested locally in last case; deployed roles/configuration not qualified'] }, null, 2)}\n`);
});

describe('D2 actual independent PostgreSQL sessions', () => {
  it('01: two claimants wait on one real advisory barrier; one claim/extraction and one busy result', async () => {
    const c = await capture();
    const held = await independent();
    const a = database('claim-A'); const b = database('claim-B');
    const reached = deferred(); const release = deferred<{ text: string; method: string }>();
    seam.extract.mockImplementationOnce(async () => { reached.resolve(); return release.promise; });
    await held.client.query('BEGIN'); await lockDocumentDispositionProgram(held.client, c.org, c.program!);
    const first = run(c,a); const second = run(c,b);
    try {
      const waits = await blocked('claim-', held.pid, 2);
      expect(new Set([held.pid,...waits.map(w => w.pid)]).size).toBe(3);
      await held.client.query('COMMIT');
      await reached.promise;
      const loser = await Promise.race([first,second]);
      expect(loser.status).toBe('busy'); expect(loser.ok).toBe(false);
      expect((await row(c)).metadata.dataRoomProcessing.attempts).toBe(1);
    } finally { release.resolve({ text: BODY, method: 'plain-text' }); await Promise.all([first,second]); await held.client.query('ROLLBACK').catch(() => undefined); await held.client.end(); }
    expect(seam.extract).toHaveBeenCalledTimes(1);
    expect((await row(c)).metadata.dataRoomProcessing.state).toBe('completed');
  });

  it.each(['late-success','late-extraction-failure','late-profile-catch'])('02: expired A cannot overwrite B completion: %s', async failure => {
    const c = await capture(); const a = database(`takeover-A-${failure}`); const b = database(`takeover-B-${failure}`);
    const pending = await paused(c,a);
    try {
      const old = (await row(c)).metadata.dataRoomProcessing.attemptId;
      await expire(c);
      expect((await run(c,b)).status).toBe('completed');
      const completed = await row(c);
      expect(completed.metadata.dataRoomProcessing.attemptId).not.toBe(old);
      if (failure === 'late-profile-catch') seam.profile.mockRejectedValueOnce(new Error('Controlled late profiling outage'));
      if (failure === 'late-extraction-failure') pending.fail(); else pending.finish();
      expect((await pending.pending).status).toBe('stale_source');
      expect(await row(c)).toEqual(completed);
      expect(a.events[0].pid).not.toBe(b.events[0].pid);
      observations.push({ case: failure, firstPid: a.events[0].pid, secondPid: b.events[0].pid, oldAttempt: old,
        acceptedAttempt: completed.metadata.dataRoomProcessing.attemptId, sourceId: c.id });
    } finally { pending.finish(); await pending.pending; }
  });

  it('03: lease acceptance uses actual time after a real lock wait', async () => {
    const c = await capture(); const a = database('clock-A'); const pending = await paused(c,a);
    const held = await independent();
    try {
      const expires = new Date(Date.now()+500).toISOString();
      await owner.query(`UPDATE cre_evidence_sources SET metadata=jsonb_set(metadata,'{dataRoomProcessing,leaseExpiresAt}',to_jsonb($3::text))
        WHERE id=$1 AND organization_id=$2`, [c.id,c.org,expires]);
      await held.client.query('BEGIN'); await lockDocumentDispositionProgram(held.client,c.org,c.program!);
      pending.finish(); await blocked('clock-A',held.pid);
      const deadline = Date.now()+2500;
      while (Date.now()<deadline && !(await owner.query('SELECT clock_timestamp()>$1::timestamptz AS expired',[expires])).rows[0].expired) await new Promise(resolve=>setTimeout(resolve,25));
      expect((await owner.query('SELECT clock_timestamp()>$1::timestamptz AS expired',[expires])).rows[0].expired).toBe(true);
      await held.client.query('COMMIT');
      expect(await pending.pending).toMatchObject({ ok:false,status:'stale_source',reasonCode:'LEASE_EXPIRED' });
      expect((await row(c)).extracted_text).toBeNull();
    } finally { pending.finish(); await held.client.query('ROLLBACK').catch(()=>undefined); await held.client.end(); await pending.pending; }
  });

  it('04: supersession commits on an independent source lock before stale completion reads', async () => {
    const c = await capture(); const a = database('supersede-A'); const pending = await paused(c,a); const held = await independent();
    try {
      await held.client.query('BEGIN'); await held.client.query('UPDATE cre_evidence_sources SET is_current=false WHERE id=$1 AND organization_id=$2',[c.id,c.org]);
      pending.finish(); await blocked('supersede-A',held.pid); await held.client.query('COMMIT');
      expect(await pending.pending).toMatchObject({ ok:false,status:'stale_source',reasonCode:'SOURCE_SUPERSEDED' });
      expect((await row(c)).extracted_text).toBeNull();
    } finally { pending.finish(); await held.client.query('ROLLBACK').catch(()=>undefined); await held.client.end(); await pending.pending; }
  });

  it('05: project deletion commits on an independent project lock before stale completion', async () => {
    const c = await capture(); const a = database('project-A'); const pending = await paused(c,a); const held = await independent();
    try {
      await held.client.query('BEGIN'); await held.client.query('UPDATE regulatory_programs SET deleted_at=clock_timestamp() WHERE id=$1 AND organization_id=$2',[c.program,c.org]);
      pending.finish(); await blocked('project-A',held.pid); await held.client.query('COMMIT');
      expect(await pending.pending).toMatchObject({ ok:false,status:'stale_source',reasonCode:'PROJECT_UNAVAILABLE' });
      expect((await row(c)).extracted_text).toBeNull();
    } finally { pending.finish(); await held.client.query('ROLLBACK').catch(()=>undefined); await held.client.end(); await pending.pending; }
  });

  it.each(['same-program','cross-program','null-program'])('06: actual withdrawal SHARE reservation blocks completion and refuses it afterward: %s', async scope => {
    let c: Capture;
    if (scope==='null-program') {
      const p = (await owner.query('INSERT INTO projects (organization_id) VALUES ($1) RETURNING id',[org])).rows[0].id;
      c = await capture({program:null,workspace:p});
    } else c = await capture();
    const d = scope==='same-program' ? c : await capture({fileId:c.fileId});
    const reached = deferred(); const release = deferred(); let pid=0;
    const withdrawalDb = database(`withdraw-${scope}`,async (sql,_params,context)=>{
      if (sql.startsWith('LOCK TABLE public.authoring_citations') && sql.endsWith('IN SHARE MODE')) { pid=context.pid; reached.resolve(); await release.promise; }
    });
    const recoveryDb = database(`recover-${scope}`); const pending=await paused(c,recoveryDb);
    const operation=disposition(d,withdrawalDb); const preview=await operation.preview();
    const withdrawal=operation.apply(preview.previewToken).then(result=>({result,error:null}),error=>({result:null,error}));
    try {
      await reached.promise; pending.finish(); await blocked(`recover-${scope}`,pid);
      release.resolve(); const receipt=await withdrawal;
      expect(receipt.error).toBeNull();
      expect(await pending.pending).toMatchObject({ok:false,status:'stale_source',reasonCode:'SOURCE_WITHDRAWN'});
      expect((await row(c)).extracted_text).toBeNull();
      expect((await owner.query('SELECT count(*)::int AS n FROM document_data_dispositions WHERE organization_id=$1',[c.org])).rows[0].n).toBe(1);
    } finally { release.resolve(); pending.finish(); await withdrawal; await pending.pending; }
  });

  it.each(['same-program','cross-program'])('07: recovery-first order has a fresh impact or named stale preview, without deadlock: %s', async scope => {
    const c=await capture(); const d=scope==='same-program'?c:await capture({fileId:c.fileId});
    const reached=deferred(); const release=deferred(); let pid=0;
    const recoveryDb=database('reverse-recovery',async(sql,_params,context)=>{
      if(context.tx===2 && sql==='LOCK TABLE public.cre_evidence_sources, public.file_uploads IN ROW EXCLUSIVE MODE') {pid=context.pid;reached.resolve();await release.promise;}
    });
    const withdrawalDb=database('reverse-withdrawal'); const pending=await paused(c,recoveryDb);
    const operation=disposition(d,withdrawalDb); const preview=await operation.preview();
    pending.finish(); await reached.promise;
    const withdrawal=operation.apply(preview.previewToken).then(result=>({result,error:null}),error=>({result:null,error}));
    try {
      await blocked('reverse-withdrawal',pid); release.resolve();
      expect((await pending.pending).status).toBe('completed');
      const result=await withdrawal;
      if(scope==='same-program') {
        expect(result.error?.code).toBe('STALE_PREVIEW');
        expect((await owner.query('SELECT count(*)::int AS n FROM document_data_dispositions WHERE organization_id=$1',[c.org])).rows[0].n).toBe(0);
        const fresh=await operation.preview();
        expect(fresh.counts.extractedTexts).toBe(1);
        const confirmed=await operation.apply(fresh.previewToken);
        expect(confirmed.disposition.choice).toBe('keep_data');
        const receipt=(await owner.query('SELECT impact_snapshot FROM document_data_dispositions WHERE id=$1',[confirmed.disposition.id])).rows[0].impact_snapshot;
        expect(receipt.counts.extractedTexts).toBe(1);
        observations.push({case:'reverse fresh confirmation',scope,obsoleteResult:result.error.code,freshCounts:fresh.counts,receiptCounts:receipt.counts});
      } else if(result.error) expect(result.error.code).toBe('STALE_PREVIEW');
      else {
        expect(result.result.disposition.choice).toBe('keep_data');
        const receipt=(await owner.query('SELECT impact_snapshot FROM document_data_dispositions WHERE id=$1',[result.result.disposition.id])).rows[0].impact_snapshot;
        const expectedTexts=scope==='same-program'?1:0;
        observations.push({case:'reverse impact freshness',scope,previewCounts:preview.counts,receiptCounts:receipt.counts,
          expectedExtractedTexts:expectedTexts,recoveryStatus:(await row(c)).extraction_status});
        expect(receipt.counts.extractedTexts).toBe(expectedTexts);
      }
      expect((await row(c)).extracted_text).toBe(BODY);
      observations.push({case:'reverse reservation order',scope,withdrawal:result.error?.code??'committed',recoveryPid:pid});
    } finally {release.resolve();pending.finish();await withdrawal;await pending.pending;}
  });

  it('08: local NOSUPERUSER/NOBYPASSRLS role under canonical policy can process own source and cannot read another tenant', async()=>{
    const own=await capture(); const otherOrg=org+100000; const otherProgram=randomUUID();
    await owner.query('INSERT INTO regulatory_programs (id,organization_id) VALUES ($1,$2)',[otherProgram,otherOrg]);
    const foreignFile=randomUUID(); const foreignPath=`uploads/org-${otherOrg}/${foreignFile}.txt`;
    bodies.set(foreignFile,Buffer.from(BODY));
    await owner.query(`INSERT INTO file_uploads(id,organization_id,checksum_sha256,storage_path,status,original_name,mime_type,file_size)
      VALUES($1,$2,$3,$4,'uploaded','Foreign protocol.txt','text/plain',$5)`,[foreignFile,otherOrg,sha(BODY),foreignPath,Buffer.byteLength(BODY)]);
    const foreignId=(await owner.query(`INSERT INTO cre_evidence_sources(organization_id,client_program_id,source_type,title,checksum,
      stored_artifact_ref,extraction_status,ingestion_status,provenance,metadata,is_current)
      VALUES($1,$2,'client_document','Foreign protocol.txt',$3,$4,'pending','ingested',$5,'{}',true) RETURNING id`,
    [otherOrg,otherProgram,sha(BODY),foreignPath,JSON.stringify({origin:'adopt',fileUploadId:foreignFile})])).rows[0].id;
    await owner.query(`CREATE ROLE d2_fixture_runtime LOGIN NOSUPERUSER NOBYPASSRLS;
      GRANT USAGE ON SCHEMA public,vault TO d2_fixture_runtime;
      GRANT SELECT,INSERT,UPDATE,DELETE ON ALL TABLES IN SCHEMA public,vault TO d2_fixture_runtime;
      GRANT USAGE,SELECT ON ALL SEQUENCES IN SCHEMA public,vault TO d2_fixture_runtime;`);
    for(const table of ['cre_evidence_sources','file_uploads','regulatory_programs','projects']) {
      await owner.query(`ALTER TABLE public.${table} ENABLE ROW LEVEL SECURITY; ALTER TABLE public.${table} FORCE ROW LEVEL SECURITY;`);
      const policy=tenantIsolationPolicySql(`public.${table}`);
      await owner.query(policy);
      observations.push({case:'local canonical policy DDL',table,policy,sha256:sha(policy)});
    }
    const runtime=database('runtime-policy',undefined,{user:'d2_fixture_runtime',options:`-c app.rls_enforce=on -c app.current_tenant_id=${org} -c app.current_org_id=${org}`});
    const identity=(await runtime.query(`SELECT current_user AS role,r.rolsuper,r.rolbypassrls,current_setting('app.rls_enforce') AS enforcement
      FROM pg_roles r WHERE r.rolname=current_user`)).rows[0];
    expect(identity).toEqual({role:'d2_fixture_runtime',rolsuper:false,rolbypassrls:false,enforcement:'on'});
    expect((await runtime.query('SELECT id FROM regulatory_programs WHERE organization_id=$1',[otherOrg])).rows).toEqual([]);
    expect((await runtime.query('SELECT id FROM cre_evidence_sources WHERE id=$1',[foreignId])).rows).toEqual([]);
    expect((await runtime.query("UPDATE cre_evidence_sources SET extracted_text='foreign overwrite' WHERE id=$1 RETURNING id",[foreignId])).rows).toEqual([]);
    expect((await run(own,runtime)).status).toBe('completed');
    expect((await runtime.query('SELECT id FROM cre_evidence_sources WHERE organization_id=$1',[org])).rows.map(r=>r.id)).toContain(own.id);
    const refused=await processCapturedSource(otherOrg,foreignId,{bytes:own.bytes,fileName:'Foreign protocol.txt',mimeType:'text/plain',programId:otherProgram,processedBy:'foreign fixture request'},{db:runtime});
    expect(refused.ok).toBe(false);
    expect((await owner.query('SELECT extracted_text FROM cre_evidence_sources WHERE id=$1',[foreignId])).rows[0].extracted_text).toBeNull();
    observations.push({case:'local canonical policy',identity,ownSource:own.id,foreignSource:foreignId,foreignOrg:otherOrg,foreignResult:refused.status});
  });
});
