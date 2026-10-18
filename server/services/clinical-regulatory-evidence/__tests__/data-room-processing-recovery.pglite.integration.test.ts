/**
 * D2 recovery canonical red-first SQL contract (sequential PGlite, not two sessions). The red cases are
 * proposed contract assertions against CURRENT production functions/SQL.
 * No external database, file loader, model, cloud transport, or embedding is
 * reached: PostgreSQL is PGlite, persistence failures/extraction are injected.
 */
import { beforeAll, beforeEach, afterAll, describe, expect, it, vi } from 'vitest';
import { PGlite } from '@electric-sql/pglite';
import fs from 'node:fs';
import { createHash, randomUUID } from 'node:crypto';

const seam = vi.hoisted(() => ({ query: vi.fn(), extract: vi.fn(), load: vi.fn(), profile: vi.fn(), warn: vi.fn() }));
vi.mock('../../../db.js', () => ({ pool: { query: seam.query, connect: async () => ({ query: seam.query, release: () => undefined }) } }));
vi.mock('../../../utils/logger.js', () => ({ createScopedLogger: () => ({ warn: seam.warn, info: vi.fn(), error: vi.fn() }) }));
vi.mock('../dataset-profile.js', () => ({ profileDataset: seam.profile }));
vi.mock('../../ocr/index.js', () => ({ extractDocumentText: seam.extract }));
vi.mock('../../ana/uploaded-file-access.js', () => ({ loadUploadedFile: seam.load }));
vi.mock('../../vault/vault-filing.service.js', () => ({
  resolveVaultView: async () => 'test', resolveOrgVaultView: async () => 'test',
  classifyForFiling: () => ({ evidenceKind: 'protocol', folderId: null, ctdSection: null, confidence: 0, needsReview: true, rationale: 'test seam' }),
}));

import { recordSourceProcessing, processPendingSources, processCapturedSource } from '../data-room-processing';
import { claimSource, finishClaim } from '../data-room-processing-store';

let ORG = 901041;
let PROGRAM = randomUUID();
const BODY = 'Clinical study protocol version 2.0. Cardiotoxicity monitoring is required.';
const DIGEST = createHash('sha256').update(BODY).digest('hex');
const extracted = { text: BODY, method: 'plain-text', pageCount: null, words: 11 };
let db: PGlite;
const transactionalDb = { query: (sql: string, args?: unknown[]) => seam.query(sql, args), connect: async () => ({ query: (sql: string, args?: unknown[]) => seam.query(sql, args), release: () => undefined }) };
const input = (over: Record<string, unknown> = {}) => ({ bytes: Buffer.from(BODY), fileName: 'Protocol.txt', mimeType: 'text/plain', programId: PROGRAM, processedBy: 'test', ...over });
const opts = () => ({ db: transactionalDb });

const exec = {
  query: async (sql: string, params?: unknown[]) => {
    const result = await db.query(sql, params);
    return { rows: result.rows as any[], rowCount: result.affectedRows ?? result.rows.length };
  },
};

async function seed(status: string, options: { current?: boolean; organization?: number; deleted?: boolean; text?: string | null; metadata?: unknown; workspace?: number | null } = {}) {
  const fileId = randomUUID(), org = options.organization ?? ORG;
  const storagePath = `uploads/org-${org}/${fileId}`;
  await exec.query(`INSERT INTO file_uploads (id,organization_id,original_name,mime_type,file_size,storage_path,checksum_sha256,status)
    VALUES ($1,$2,'Protocol.txt','text/plain',$3,$4,$5,'uploaded')`, [fileId, org, Buffer.byteLength(BODY), storagePath, DIGEST]);
  const r = await exec.query(`INSERT INTO cre_evidence_sources
      (organization_id, client_program_id, source_type, title, checksum, stored_artifact_ref, is_current, extraction_status, extracted_text, provenance, metadata, deleted_at, client_workspace_id)
    VALUES ($1,$2,'client_document','Protocol.txt',$3,$4,$5,$6,$7,$8::jsonb,$9::jsonb,$10,$11)
    RETURNING id`, [org, PROGRAM, DIGEST, storagePath, options.current ?? true, status, options.text ?? null,
    JSON.stringify({fileUploadId:fileId}), JSON.stringify(options.metadata ?? {mimeType:'text/plain', unrelated:'preserve'}), options.deleted ? new Date() : null, options.workspace ?? null]);
  return Number(r.rows[0].id);
}

async function state(id: number) {
  const r = await exec.query('SELECT * FROM cre_evidence_sources WHERE id=$1', [id]);
  return r.rows[0];
}

async function searchable(id: number) {
  const r = await exec.query(`SELECT vault.document_search_vector(title, NULL::text, left(extracted_text, 900000))
    @@ websearch_to_tsquery('english', 'cardiotoxicity') AS found FROM cre_evidence_sources WHERE id=$1`, [id]);
  return r.rows[0].found;
}

beforeAll(async () => {
  db = new PGlite();
  await db.exec(`CREATE SCHEMA vault;
    CREATE TABLE vault.documents (id uuid PRIMARY KEY,organization_id integer,program_id uuid,content_hash text,document_title text,file_name text,extracted_text text,deleted_at timestamptz);
    CREATE TABLE regulatory_programs (id uuid PRIMARY KEY,organization_id integer,deleted_at timestamptz,product_name text,indication text,phase text,program_type text,application_number text,primary_agency text);
    CREATE TABLE projects(id serial PRIMARY KEY,organization_id integer,regulatory_program_id uuid,client_workspace_id integer,status text DEFAULT 'active');
    CREATE TABLE file_uploads (id text PRIMARY KEY,organization_id integer,user_id integer,original_name text,mime_type text,file_size bigint,storage_path text,checksum_sha256 text,status text);
    CREATE TABLE audit_logs(id uuid PRIMARY KEY,tenant_id integer,action text,table_name text,target text,record_id text,new_values json);
  `);
  for (const file of ['db/migrations/20260724_clinical_regulatory_evidence_spine.sql', 'migrations/20260726_cre_source_program_scope.sql',
      'migrations/20260829_cre_source_versioning.sql','migrations/20260906_vault_documents_fulltext.sql','migrations/20261008c_data_room_source_text.sql',
      'migrations/20261001_cre_evidence_sources_capture_immutability.sql','migrations/20261008d_cre_source_study_ref.sql','migrations/20261006_document_data_dispositions.sql']) {
    await db.exec(fs.readFileSync(new URL(`../../../../${file}`, import.meta.url), 'utf8'));
  }
}, 60000);

beforeEach(async () => {
  // The real capture guard refuses TRUNCATE. This embedded fixture runs as
  // its table owner, who alone is allowed to delete their own test records.
  ORG += 1; PROGRAM = randomUUID();
  await exec.query('INSERT INTO regulatory_programs(id,organization_id) VALUES($1,$2)',[PROGRAM,ORG]);
  seam.query.mockReset().mockImplementation(exec.query);
  seam.warn.mockReset();
  seam.profile.mockReset().mockResolvedValue(null);
  seam.extract.mockReset().mockResolvedValue({ text: BODY, method: 'plain-text', pageSpans: [] });
  seam.load.mockReset().mockImplementation(async (fileId: string) => { const r=await exec.query('SELECT storage_path FROM file_uploads WHERE id=$1',[fileId]); return {fileId,storagePath:r.rows[0]?.storage_path,buffer:Buffer.from(BODY),fileName:'Protocol.txt',mimeType:'text/plain',integrity:'verified'}; });
});

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>(done => { resolve = done; });
  return { promise, resolve };
}

describe('D2 held-out stage coherence', () => {
  it.each(['missing_reason', 'normalized_hour', 'normalized_second'])('keeps malformed %s metadata out of runnable slots', async kind => {
    const poisoned = await seed('pending');
    seam.profile.mockRejectedValueOnce(new Error('synthetic profile outage'));
    expect((await processCapturedSource(ORG, poisoned, input(), opts())).status).toBe('retryable_failure');
    const valid = (await state(poisoned)).metadata.dataRoomProcessing;
    const bad = kind === 'missing_reason' ? { ...valid, reasonCode: null, nextRetryAt: '2026-01-02T00:15:00.000Z' } : {
      ...valid, state: 'running', retryable: false, reasonCode: null, nextRetryAt: null, completedAt: null,
      claimedAt: kind === 'normalized_hour' ? '2026-01-01T24:00:00.000Z' : '2026-01-01T23:59:60.000Z',
      leaseExpiresAt: '2026-01-02T00:15:00.000Z',
    };
    await exec.query(`UPDATE cre_evidence_sources SET metadata=jsonb_set(metadata,'{dataRoomProcessing}',$2::jsonb) WHERE id=$1`, [poisoned, JSON.stringify(bad)]);
    const runnable = await seed('pending');
    const report = await processPendingSources(ORG, { db: transactionalDb, limit: 1 });
    expect(report.items.filter(item => item.status === 'candidate').map(item => item.sourceId)).toEqual([runnable]);
    expect(report.items).toContainEqual({ sourceId: poisoned, status: 'blocked', reasonCode: 'STAGE_METADATA_INVALID' });
  });

  it('refuses same-token stage identity changes before completion or failure journaling', async () => {
    const id = await seed('pending');
    seam.extract.mockImplementationOnce(async () => {
      await exec.query(`UPDATE cre_evidence_sources SET metadata=jsonb_set(metadata,'{dataRoomProcessing,identity,mimeType}','"application/pdf"'::jsonb) WHERE id=$1`, [id]);
      return { text: BODY, method: 'plain-text' };
    });
    expect(await processCapturedSource(ORG, id, input(), opts())).toMatchObject({
      ok: false, processed: false, status: 'stale_source', reasonCode: 'SOURCE_IDENTITY_CHANGED',
    });
    const row = await state(id);
    expect(row.extracted_text).toBeNull();
    expect(row.metadata.dataRoomProcessing.state).toBe('running');
  });
});
async function stage(id: number) { return (await state(id)).metadata?.dataRoomProcessing; }
async function expire(id: number) {
  await exec.query(`UPDATE cre_evidence_sources SET metadata=jsonb_set(jsonb_set(metadata,'{dataRoomProcessing,claimedAt}',
    to_jsonb('2000-01-01T00:00:00.000Z'::text)),'{dataRoomProcessing,leaseExpiresAt}',to_jsonb('2000-01-01T00:15:00.000Z'::text)) WHERE id=$1`, [id]);
}

describe('D2 program-bound capture workspace admission', () => {
  async function anchor(workspace = 900, status = 'active') {
    const result = await exec.query('INSERT INTO projects (organization_id,regulatory_program_id,client_workspace_id,status) VALUES ($1,$2,$3,$4) RETURNING id', [ORG, PROGRAM, workspace, status]);
    return Number(result.rows[0].id);
  }

  it('automatically recovers an exact captured workspace that differs from the project row identifier', async () => {
    const projectId = await anchor(), id = await seed('pending', { workspace: 900 });
    expect(projectId).not.toBe(900);
    expect((await processPendingSources(ORG, { ...opts(), sourceId: id, apply: true })).processed).toBe(1);
    const row = await state(id);
    expect(row.client_workspace_id).toBe(900);
    expect(row.extracted_text).toBe(BODY);
    expect(row.metadata.dataRoomProcessing).toMatchObject({ state: 'completed', identity: { workspaceId: 900, programId: PROGRAM } });
    const held = seam.query.mock.calls.filter(([sql]) => String(sql).includes('FROM projects') && String(sql).includes('FOR SHARE'));
    expect(held.length).toBeGreaterThanOrEqual(2);
    expect(held.every(([, args]) => args[0] === projectId && args[1] === ORG)).toBe(true);
  });

  it('refuses a wrong workspace even when that number is an unrelated project ID', async () => {
    await anchor(); await exec.query('INSERT INTO projects (id,organization_id,regulatory_program_id,client_workspace_id) VALUES (901,$1,$2,901)', [ORG, randomUUID()]);
    const id = await seed('pending', { workspace: 901 }), valid = await seed('pending', { workspace: 900 });
    const report = await processPendingSources(ORG, { ...opts(), limit: 1 });
    expect(report.items.filter(item => item.status === 'candidate').map(item => item.sourceId)).toEqual([valid]);
    expect(report.items.find(item => item.sourceId === id)?.status).toBe('blocked');
    expect((await processCapturedSource(ORG, id, input({ expectedWorkspaceId: 901 }), opts())).status).toBe('blocked');
    expect(seam.extract).not.toHaveBeenCalled();
    expect((await state(id)).extracted_text).toBeNull();
  });

  it.each(['ambiguous', 'deleted'])('refuses an %s anchor before extraction', async kind => {
    if (kind === 'ambiguous') { await anchor(); await anchor(); }
    else await anchor(900, 'deleted');
    const id = await seed('pending', { workspace: 900 });
    expect((await processPendingSources(ORG, { ...opts(), limit: 1 })).examined).toBe(0);
    expect((await processCapturedSource(ORG, id, input(), opts())).status).toBe('blocked');
    expect(seam.extract).not.toHaveBeenCalled();
  });

  it('rechecks the exact program workspace after extraction before storing derived text', async () => {
    const projectId = await anchor(), id = await seed('pending', { workspace: 900 });
    seam.extract.mockImplementationOnce(async () => {
      await exec.query('UPDATE projects SET client_workspace_id=902 WHERE id=$1 AND organization_id=$2', [projectId, ORG]);
      return { text: BODY, method: 'plain-text' };
    });
    expect((await processCapturedSource(ORG, id, input(), opts())).status).toBe('stale_source');
    expect((await state(id)).extracted_text).toBeNull();
  });

  it('refuses an anchor swap after extraction even if the new anchor has the same workspace', async () => {
    const projectId = await anchor(), id = await seed('pending', { workspace: 900 });
    seam.extract.mockImplementationOnce(async () => {
      await exec.query('UPDATE projects SET regulatory_program_id=$1 WHERE id=$2 AND organization_id=$3', [randomUUID(), projectId, ORG]);
      await anchor();
      return { text: BODY, method: 'plain-text' };
    });
    expect(await processCapturedSource(ORG, id, input(), opts())).toMatchObject({ status: 'stale_source', reasonCode: 'SOURCE_SCOPE_CHANGED' });
    expect(await state(id)).toMatchObject({ extracted_text: null, metadata: { dataRoomProcessing: { state: 'running' } } });
  });

  it('a copied claim cannot self-attest the attempt-local workspace admission', async () => {
    await anchor(); const id = await seed('pending', { workspace: 900 });
    const admitted = await claimSource(transactionalDb, ORG, id, { programId: PROGRAM, expectedWorkspaceId: 900 });
    if (!('claim' in admitted)) throw new Error('Positive claim control did not run');
    await expect(finishClaim(transactionalDb, { ...admitted.claim }, { state: 'completed', reasonCode: null, retryable: false })).rejects.toMatchObject({ status: 'stale_source', reasonCode: 'SOURCE_SCOPE_CHANGED' });
    expect((await stage(id)).state).toBe('running');
    await finishClaim(transactionalDb, admitted.claim, { state: 'failed', reasonCode: 'EXTRACTION_FAILED', retryable: false });
    expect((await stage(id)).state).toBe('failed');
  });
});

describe('D2 exact original identity and atomic derived processing', () => {
  it('loads the recorded original; correct duplicate bytes do not mask missing original', async () => {
    const id = await seed('pending');
    seam.load.mockRejectedValue(Object.assign(new Error('private storage path'), { code: 'UPLOAD_BYTES_MISSING' }));
    const done = await processCapturedSource(ORG,id,input(),opts());
    expect(done).toMatchObject({ok:false,status:'blocked',reasonCode:'ORIGINAL_BYTES_MISSING'});
    expect(seam.extract).not.toHaveBeenCalled();
    expect((await state(id)).extracted_text).toBeNull();
  });

  it.each([null, 'bad', 'b'.repeat(64)])('refuses independently invalid/different upload digest %s', async digest => {
    const id = await seed('pending');
    await exec.query(`UPDATE file_uploads SET checksum_sha256=$2 WHERE id=(SELECT provenance->>'fileUploadId' FROM cre_evidence_sources WHERE id=$1)`,[id,digest]);
    expect((await processCapturedSource(ORG,id,input(),opts())).status).toBe('blocked');
    expect(seam.extract).not.toHaveBeenCalled();
  });

  it('refuses wrong caller project and a missing live project', async () => {
    const id = await seed('pending');
    expect((await processCapturedSource(ORG,id,input({programId:randomUUID()}),opts())).status).toBe('blocked');
    await exec.query('UPDATE regulatory_programs SET deleted_at=now() WHERE id=$1',[PROGRAM]);
    expect((await processCapturedSource(ORG,id,input(),opts())).status).toBe('blocked');
    expect(seam.extract).not.toHaveBeenCalled();
  });

  it('rejects project deletion after claim/extraction', async () => {
    const id = await seed('pending');
    seam.extract.mockImplementation(async () => { await exec.query('UPDATE regulatory_programs SET deleted_at=now() WHERE id=$1',[PROGRAM]); return {text:BODY,method:'plain-text'}; });
    expect((await processCapturedSource(ORG,id,input(),opts())).status).toBe('stale_source');
    expect((await state(id)).extracted_text).toBeNull();
  });

  it('rejects mutable original association after extraction even with equal bytes', async () => {
    const id = await seed('pending');
    seam.extract.mockImplementation(async () => {
      await exec.query(`UPDATE cre_evidence_sources SET provenance=provenance||'{"fileUploadId":"substituted"}'::jsonb WHERE id=$1`,[id]);
      return {text:BODY,method:'plain-text'};
    });
    expect((await processCapturedSource(ORG,id,input(),opts())).status).toBe('stale_source');
    expect((await state(id)).extracted_text).toBeNull();
  });

  it('owns the caller Buffer before any await', async () => {
    const id = await seed('pending');
    const bytes = Buffer.from(BODY);
    const done = processCapturedSource(ORG,id,input({bytes}),opts());
    bytes.fill(0);
    expect((await done).status).toBe('completed');
    expect(seam.extract.mock.calls[0][0]).toEqual(Buffer.from(BODY));
  });

  it('reuses only byte/revision-bound extraction and clears old error on success', async () => {
    const id = await seed('pending');
    await exec.query(`UPDATE cre_evidence_sources SET provenance=provenance||'{"extractionError":"obsolete failure"}'::jsonb WHERE id=$1`,[id]);
    const preExtracted = {...extracted,sourceSha256:DIGEST,extractionRevision:'capture-extraction:v1'};
    expect((await processCapturedSource(ORG,id,input({preExtracted}),opts())).status).toBe('completed');
    expect(seam.extract).not.toHaveBeenCalled();
    expect((await state(id)).provenance.extractionError).toBeUndefined();
    expect((await state(id)).metadata.unrelated).toBe('preserve');
  });

  it('does not trust arbitrary supplied pre-extracted content', async () => {
    const id = await seed('pending');
    expect((await processCapturedSource(ORG,id,input({preExtracted:{...extracted,text:'unbound fabricated text'}}),opts())).status).toBe('completed');
    expect(seam.extract).toHaveBeenCalledTimes(1);
    expect((await state(id)).extracted_text).toBe(BODY);
  });

  it.each([{fileName:'Renamed.csv'}, {mimeType:'text/csv'}])('same bytes with changed extraction behavior cannot reuse cached text %j',async changed=>{
    const id=await seed('pending');
    const preExtracted={...extracted,text:'cached interpretation under another MIME/name',sourceSha256:DIGEST,extractionRevision:'capture-extraction:v1'};
    expect((await processCapturedSource(ORG,id,input({...changed,preExtracted}),opts())).status).toBe('completed');
    expect(seam.extract).toHaveBeenCalledTimes(1); expect((await state(id)).extracted_text).toBe(BODY);
    expect(seam.extract.mock.calls[0].slice(1)).toEqual(['text/plain','Protocol.txt']);
  });

  it('healthy same identity is idempotent without extraction or new attempt', async () => {
    const id = await seed('pending');
    expect((await processCapturedSource(ORG,id,input(),opts())).status).toBe('completed');
    const first = await stage(id);
    seam.extract.mockClear();
    expect((await processCapturedSource(ORG,id,input(),opts())).status).toBe('already_complete');
    expect(await stage(id)).toEqual(first);
    expect(seam.extract).not.toHaveBeenCalled();
  });

  it.each([{version:2}, {version:1,state:'running',leaseExpiresAt:'not-a-date'}, {version:1,state:'failed',attempts:-1}])('blocks malformed/future stage without resetting it %j', async bad => {
    const id = await seed('pending',{metadata:{dataRoomProcessing:bad}});
    expect((await processCapturedSource(ORG,id,input(),opts())).status).toBe('blocked');
    expect(await stage(id)).toEqual(bad);
    expect(seam.extract).not.toHaveBeenCalled();
  });
});

describe('D2 sequential worker fencing, retries and sweep diagnostics', () => {
  it('a live claim excludes a second worker before it extracts', async () => {
    const id = await seed('pending');
    const entered=deferred<void>(); const output=deferred<any>();
    seam.extract.mockImplementationOnce(async () => {entered.resolve(); return output.promise;});
    const a=processCapturedSource(ORG,id,input(),opts());
    await entered.promise;
    const b=await processCapturedSource(ORG,id,input(),opts());
    output.resolve({text:BODY,method:'plain-text'});
    expect(b.status).toBe('busy');
    expect((await a).status).toBe('completed');
    expect(seam.extract).toHaveBeenCalledTimes(1);
    expect((await stage(id)).attempts).toBe(1);
  });

  it.each(['success','failure'])('lease takeover fences late original worker %s', async late => {
    const id=await seed('pending');
    const entered=deferred<void>(); const output=deferred<any>();
    seam.extract.mockImplementationOnce(async () => {entered.resolve(); return output.promise;});
    const a=processCapturedSource(ORG,id,input(),opts());
    await entered.promise;
    await expire(id);
    const b=await processCapturedSource(ORG,id,input(),opts());
    const winner=await stage(id);
    if(late==='failure') seam.profile.mockRejectedValue(new Error('late failed old worker'));
    output.resolve({text:BODY,method:'plain-text'});
    const old=await a;
    expect(b.status).toBe('completed');
    expect(old.status).toBe('stale_source');
    expect(await stage(id)).toEqual(winner);
    expect((await state(id)).extracted_text).toBe(BODY);
    expect(winner.attempts).toBe(2);
  });

  it('expired ownership without takeover cannot finalize', async () => {
    const id=await seed('pending'); const entered=deferred<void>(); const output=deferred<any>();
    seam.extract.mockImplementationOnce(async()=>{entered.resolve();return output.promise;});
    const a=processCapturedSource(ORG,id,input(),opts());
    await entered.promise; await expire(id); output.resolve({text:BODY,method:'plain-text'});
    expect(await a).toMatchObject({status:'stale_source',reasonCode:'LEASE_EXPIRED'});
    expect((await state(id)).extracted_text).toBeNull();
  });

  it('failed extraction is named and requires explicit retry, then clears its error', async () => {
    const id=await seed('pending'); seam.extract.mockResolvedValue({text:'',method:'plain-text'});
    expect((await processCapturedSource(ORG,id,input(),opts())).status).toBe('extraction_failed');
    expect((await processCapturedSource(ORG,id,input(),opts())).status).toBe('extraction_failed');
    seam.extract.mockResolvedValue({text:BODY,method:'plain-text'});
    expect((await processCapturedSource(ORG,id,input(),{...opts(),retryFailed:true})).status).toBe('completed');
    expect((await state(id)).provenance.extractionError).toBeUndefined();
    expect((await stage(id)).attempts).toBe(2);
  });

});

describe('D2 bounded sweep and honest observations',()=>{
  it('dry-run is read-only and strict invalid options refuse before I/O', async () => {
    await seed('pending'); seam.query.mockClear();
    const report=await processPendingSources(ORG,{...opts(),limit:1});
    expect(report).toMatchObject({dryRun:true,examined:1,processed:0});
    expect(report.items[0].status).toBe('candidate');
    expect(seam.load).not.toHaveBeenCalled(); expect(seam.extract).not.toHaveBeenCalled();
    expect(seam.query.mock.calls.every(([sql])=>!/^\s*(UPDATE|INSERT|BEGIN)/.test(sql))).toBe(true);
    for(const limit of [0,501,1.5,NaN]) await expect(processPendingSources(ORG,{...opts(),limit})).rejects.toThrow();
    await expect(processPendingSources(ORG,{exec,apply:true})).rejects.toThrow();
  });

  it('legacy readable text is already complete without fabricated stage history', async () => {
    const id=await seed('extracted',{text:BODY});
    expect((await processCapturedSource(ORG,id,input(),opts())).status).toBe('already_complete');
    expect(await stage(id)).toBeUndefined(); expect(seam.extract).not.toHaveBeenCalled();
  });

  it('diagnostic malformed rows do not starve runnable slots', async () => {
    for(let n=0;n<8;n++) await seed('pending',{metadata:{dataRoomProcessing:{version:2}}});
    const runnable=await seed('pending');
    const report=await processPendingSources(ORG,{...opts(),limit:1});
    expect(report.examined).toBe(1);
    expect(report.items).toContainEqual(expect.objectContaining({sourceId:runnable,status:'candidate'}));
    expect(report.diagnosticCounts.blocked).toBeGreaterThan(0);
  });

  it.each(['\u00a0','\ufeff','\u2003\n\t'])('legacy Unicode blank text remains repairable %j',async text=>{
    const id=await seed('extracted',{text});
    const report=await processPendingSources(ORG,{...opts(),limit:1});
    expect(report.items).toContainEqual({sourceId:id,status:'candidate'});
    expect((await processCapturedSource(ORG,id,input(),opts())).status).toBe('completed');
  });

  it('exact already-readable dryrun observes completion without claiming a processed count',async()=>{
    const id=await seed('extracted',{text:BODY});
    const report=await processPendingSources(ORG,{...opts(),sourceId:id});
    expect(report).toMatchObject({examined:0,processed:0,completed:0,dryRun:true});
    expect(report.items).toContainEqual(expect.objectContaining({sourceId:id,status:'already_complete'}));
    expect(seam.load).not.toHaveBeenCalled(); expect(seam.extract).not.toHaveBeenCalled();
  });

});

describe('D2 durable failures and bounded recovery',()=>{
  it('final-write outage records bounded due retry and never marks readable completion',async()=>{
    const id=await seed('pending');
    seam.query.mockImplementation(async(sql:string,args?:unknown[])=>{
      if(sql.includes('extracted_text = CASE')) throw new Error('injected final UPDATE outage');
      return exec.query(sql,args);
    });
    expect((await processCapturedSource(ORG,id,input(),opts())).status).toBe('retryable_failure');
    expect((await state(id)).extracted_text).toBeNull();
    const failed=await stage(id);
    expect(failed).toMatchObject({state:'failed',attempts:1,retryable:true,reasonCode:'PERSISTENCE_FAILED'});
    expect(Date.parse(failed.nextRetryAt)-Date.parse(failed.claimedAt)).toBeGreaterThanOrEqual(60_000);
    expect((await processCapturedSource(ORG,id,input(),opts())).status).toBe('retry_not_due');
    seam.query.mockImplementation(exec.query);
    await exec.query(`UPDATE cre_evidence_sources SET metadata=jsonb_set(metadata,'{dataRoomProcessing,nextRetryAt}',to_jsonb('2000-01-01T00:00:00.000Z'::text)) WHERE id=$1`,[id]);
    expect((await processCapturedSource(ORG,id,input(),opts())).status).toBe('completed');
    expect((await stage(id)).attempts).toBe(2); expect(await searchable(id)).toBe(true);
  });

  it('final and failure-journal outage leaves the durable running lease reclaimable',async()=>{
    const id=await seed('pending');
    seam.query.mockImplementation(async(sql:string,args?:unknown[])=>{
      if(sql.includes('extracted_text = CASE')||(sql.startsWith('UPDATE cre_evidence_sources')&&sql.includes("->>'attemptId'"))) throw new Error('injected outcome storage unavailable');
      return exec.query(sql,args);
    });
    expect((await processCapturedSource(ORG,id,input(),opts())).status).toBe('retryable_failure');
    expect((await stage(id)).state).toBe('running'); expect((await state(id)).extracted_text).toBeNull();
    seam.query.mockImplementation(exec.query); await expire(id);
    expect((await processCapturedSource(ORG,id,input(),opts())).status).toBe('completed');
    expect((await stage(id)).attempts).toBe(2);
  });

  it('automatic attempt budget is bounded; explicit expired-claim retry never resets it',async()=>{
    const id=await seed('pending');
    expect((await processCapturedSource(ORG,id,input(),opts())).status).toBe('completed');
    const done=await stage(id);
    const running={...done,state:'running',attempts:3,claimedAt:'2000-01-01T00:00:00.000Z',leaseExpiresAt:'2000-01-01T00:15:00.000Z',completedAt:null};
    await exec.query(`UPDATE cre_evidence_sources SET extracted_text=NULL,extraction_status='pending',metadata=jsonb_set(metadata,'{dataRoomProcessing}',$2::jsonb) WHERE id=$1`,[id,JSON.stringify(running)]);
    expect((await processCapturedSource(ORG,id,input(),opts())).status).toBe('retry_exhausted');
    expect((await processPendingSources(ORG,{...opts(),limit:1})).diagnosticCounts.retry_exhausted).toBe(1);
    expect((await processCapturedSource(ORG,id,input(),{...opts(),retryFailed:true})).status).toBe('completed');
    expect((await stage(id)).attempts).toBe(4);
  });

  it('busy and not-due diagnostics cannot consume runnable slots',async()=>{
    const blocker=await seed('pending'); seam.profile.mockRejectedValue(new Error('temporary profiling persistence dependency failure'));
    expect((await processCapturedSource(ORG,blocker,input(),opts())).status).toBe('retryable_failure');
    seam.profile.mockResolvedValue(null);
    const runnable=await seed('pending');
    const report=await processPendingSources(ORG,{...opts(),limit:1});
    expect(report.items).toContainEqual({sourceId:runnable,status:'candidate'});
    expect(report.diagnosticCounts.retry_not_due).toBe(1);
  });

  it('a lost completion COMMIT reply is resolved by durable readable state on retry',async()=>{
    const id=await seed('pending'); let commits=0;
    seam.query.mockImplementation(async(sql:string,args?:unknown[])=>{
      const result=await exec.query(sql,args);
      if(sql==='COMMIT'&&++commits===2) throw new Error('injected lost COMMIT reply');
      return result;
    });
    const uncertain=await processCapturedSource(ORG,id,input(),opts());
    expect(uncertain.ok).toBe(false); expect((await stage(id)).state).toBe('completed');
    seam.query.mockImplementation(exec.query); seam.extract.mockClear();
    expect((await processCapturedSource(ORG,id,input(),opts())).status).toBe('already_complete');
    expect((await stage(id)).attempts).toBe(1); expect(seam.extract).not.toHaveBeenCalled();
  });
});
afterAll(async () => { await db.close(); });

describe('D2 recovery continuation: current-code failure probes', () => {
  it('RED: an upload capture claiming extracted with a failed derived UPDATE must remain recoverable', async () => {
    // This is the state committed by chat/upload.ts:505 before the derived
    // write at :556. Inject a persistence exception at that second write.
    const id = await seed('extracted');
    const broken = { query: async () => { throw new Error('injected derived persistence failure'); } };
    try { await recordSourceProcessing(broken, ORG, id, { extracted, processedBy: 'chat_upload ingest' }); }
    catch (err) { expect(String(err)).toContain('injected'); }
    expect((await state(id)).extraction_status).toBe('extracted');
    expect((await state(id)).extracted_text).toBeNull();
    expect(await searchable(id)).toBe(false);
    const report = await processPendingSources(ORG, { exec });
    console.info('lost-recovery probe', JSON.stringify({ sourceId: id, status: 'extracted', text: null, report }));
    expect(report.examined).toBe(1);
  });

  it('CONTROL: pending capture is selected, one successful derived UPDATE makes text searchable, then leaves retry set', async () => {
    const id = await seed('pending');
    expect((await processPendingSources(ORG, { exec })).examined).toBe(1);
    expect((await processCapturedSource(ORG,id,input(),opts())).ok).toBe(true);
    const row = await state(id);
    expect(row.extraction_status).toBe('extracted');
    expect(row.extracted_text).toBe(BODY);
    expect(row.char_count).toBe(BODY.length);
    expect(row.checksum).toBe(DIGEST);
    expect(await searchable(id)).toBe(true);
    expect((await processPendingSources(ORG, { exec })).examined).toBe(0);
    const loads=seam.load.mock.calls.length;
    await processPendingSources(ORG,{exec});
    expect(seam.load).toHaveBeenCalledTimes(loads);
  });

  it('CONTROL: foreign organization and deleted capture are refused at the derived writer', async () => {
    const foreign = await seed('pending', { organization: ORG + 1_000_000 });
    const deleted = await seed('pending', { deleted: true });
    expect(await recordSourceProcessing(exec, ORG, foreign, { extracted, processedBy: 'probe' })).toBe(false);
    expect(await recordSourceProcessing(exec, ORG, deleted, { extracted, processedBy: 'probe' })).toBe(false);
    expect((await state(foreign)).extracted_text).toBeNull();
    expect((await state(deleted)).extracted_text).toBeNull();
    expect((await processPendingSources(ORG, { exec })).examined).toBe(0);
  });

  it('CONTROL: a pending intake survives the shared processor persistence exception and stays retryable', async () => {
    const id = await seed('pending');
    seam.query.mockImplementation(async (sql: string, args?: unknown[]) => {
      if (sql.startsWith('UPDATE cre_evidence_sources')) throw new Error('injected shared processor write failure');
      return exec.query(sql, args);
    });
    const done = await processCapturedSource(ORG, id, input({processedBy:'adopt'}));
    expect(done.ok).toBe(false);
    expect((await state(id)).extraction_status).toBe('pending');
    expect((await processPendingSources(ORG, { exec })).examined).toBe(1);
    expect(seam.warn).toHaveBeenCalled();
  });

  it('RED: shared processor must bind supplied bytes to the recorded capture digest before deriving text', async () => {
    const id = await seed('pending');
    const replacement = 'Different trial: serious adverse events only.';
    seam.extract.mockResolvedValue({ text: replacement, method: 'plain-text' });
    const done = await processCapturedSource(ORG, id, input({bytes:Buffer.from(replacement),processedBy:'mismatched bytes probe'}));
    expect((await state(id)).checksum).toBe(DIGEST);
    console.info('capture-byte-binding probe', JSON.stringify({ sourceId: id, done, captureDigest: DIGEST, suppliedDigest: createHash('sha256').update(replacement).digest('hex') }));
    expect(done.ok).toBe(false);
    expect((await state(id)).extracted_text).toBeNull();
  });

  it('RED: a source superseded while processing was in flight must refuse the stale derived commit', async () => {
    const id = await seed('pending');
    await exec.query('UPDATE cre_evidence_sources SET is_current=false WHERE id=$1', [id]);
    const committed = await recordSourceProcessing(exec, ORG, id, { extracted, processedBy: 'old in-flight attempt' });
    console.info('stale-source probe', JSON.stringify({ sourceId: id, committed, current: (await state(id)).is_current }));
    expect(committed).toBe(false);
  });

  it('RED: current-source recovery must exclude a superseded pending source', async () => {
    await seed('pending', { current: false });
    const report = await processPendingSources(ORG, { exec });
    console.info('superseded-candidate probe', JSON.stringify(report));
    expect(report.examined).toBe(0);
  });

  it('RED: failed extraction must be named as failed, rather than counted as processed success', async () => {
    const id = await seed('pending');
    seam.extract.mockResolvedValue({ text: '', method: 'plain-text' });
    const report = await processPendingSources(ORG, { ...opts(), apply: true });
    expect((await state(id)).extraction_status).toBe('failed');
    expect((await state(id)).extracted_text).toBeNull();
    console.info('failed-extraction report probe', JSON.stringify(report));
    expect(report.processed).toBe(0);
    expect(report.unreadable).toEqual([expect.objectContaining({ sourceId: id })]);
  });
});
