/**
 * Independent, opt-in D2 contract evidence. Real service SQL and actual
 * capture/FTS/disposition migrations on PGlite; controlled sequential state
 * changes/interleavings outside the DB transaction. This does NOT establish
 * independent PostgreSQL connection races, production role/RLS, actual OCR,
 * filesystem-loader behavior, or a live repair. No external service is used.
 */
import { beforeAll, beforeEach, afterAll, describe, expect, it, vi } from 'vitest';
import { createHash, randomUUID } from 'node:crypto';
import fs from 'node:fs';

const seam = vi.hoisted(() => ({ query: vi.fn(), connect: vi.fn(), extract: vi.fn(), load: vi.fn() }));
vi.mock('../../../../server/db.js', () => ({
  pool: { query: seam.query, connect: seam.connect },
  getPool: () => ({ query: seam.query, connect: seam.connect }),
}));
vi.mock('../../../../server/utils/logger.js', () => ({ createScopedLogger: () => ({ warn: vi.fn(), info: vi.fn(), error: vi.fn() }) }));
vi.mock('../../../../server/services/clinical-regulatory-evidence/dataset-profile.js', () => ({ profileDataset: async () => null }));
vi.mock('../../../../server/services/ocr/index.js', () => ({ extractDocumentText: seam.extract }));
vi.mock('../../../../server/services/ana/uploaded-file-access.js', () => ({ loadUploadedFile: seam.load }));
vi.mock('../../../../server/services/vault/vault-filing.service.js', () => ({
  resolveVaultView: async () => 'test', resolveOrgVaultView: async () => 'test',
  classifyForFiling: () => ({ evidenceKind: 'protocol', folderId: null, ctdSection: null, confidence: 0, needsReview: true, rationale: 'independent test seam' }),
}));

import { createDispositionHarness } from '../../../../server/services/document-data-disposition/__tests__/disposition-fixture.ts';
import { createDocumentDispositionService } from '../../../../server/services/document-data-disposition/service.ts';
import { processCapturedSource, processPendingSources } from '../../../../server/services/clinical-regulatory-evidence/data-room-processing.ts';

const BODY = 'Clinical study protocol version 2.0. Cardiotoxicity monitoring is required.';
const NEXT_BODY = 'Revised protocol version 3.0. Myocarditis monitoring is required.';
const hash = (value: string | Buffer) => createHash('sha256').update(value).digest('hex');
const SHA = hash(BODY);
const NEXT_SHA = hash(NEXT_BODY);
let harness: Awaited<ReturnType<typeof createDispositionHarness>>;
let orgCounter = 942000;
let activeOrg: number;
let capturedSql: string[] = [];
let queryFault: ((sql: string, params?: unknown[]) => Promise<void> | void) | undefined;
let afterQuery: ((sql: string, params?: unknown[]) => Promise<void> | void) | undefined;

const db = {
  query: async (sql: string, params?: unknown[]) => {
    capturedSql.push(sql);
    await queryFault?.(sql, params);
    const result = await harness.pg.query(sql, params);
    await afterQuery?.(sql, params);
    return { rows: result.rows as any[], rowCount: result.affectedRows ?? result.rows.length };
  },
  connect: async () => ({ query: db.query, release: () => undefined }),
};

type Capture = { org: number; id: number; program: string | null; workspace: number | null; fileId: string; storagePath: string; bytes: Buffer; sha: string };

async function program(org: number): Promise<string> {
  const id = randomUUID();
  await harness.pg.query('INSERT INTO regulatory_programs (id,organization_id,lead_user_id) VALUES ($1,$2,42)', [id, org]);
  return id;
}

async function seed(options: { org?: number; program?: string | null; workspace?: number | null; body?: string; sourceSha?: string; uploadSha?: string | null; fileId?: string; status?: string; text?: string | null; provenance?: Record<string, unknown> } = {}): Promise<Capture> {
  const org = options.org ?? activeOrg;
  const prog = options.program === undefined ? await program(org) : options.program;
  const workspace = options.workspace ?? null;
  const fileId = options.fileId ?? randomUUID();
  const bytes = Buffer.from(options.body ?? BODY);
  const sha = options.sourceSha ?? hash(bytes);
  const storagePath = `uploads/org-${org}/${fileId}.txt`;
  await harness.pg.query(`INSERT INTO file_uploads (id,organization_id,checksum_sha256,storage_path,status,original_name,mime_type,file_size)
    VALUES ($1,$2,$3,$4,'uploaded','Protocol.txt','text/plain',$5) ON CONFLICT (id) DO NOTHING`,
  [fileId, org, options.uploadSha === undefined ? hash(bytes) : options.uploadSha, storagePath, bytes.length]);
  const out = await harness.pg.query<{ id: number }>(`INSERT INTO cre_evidence_sources
    (organization_id,client_program_id,client_workspace_id,source_type,title,checksum,stored_artifact_ref,
      extraction_status,ingestion_status,provenance,metadata,is_current,extracted_text,char_count)
    VALUES ($1,$2,$3,'client_document','Protocol.txt',$4,$5,$6,'ingested',$7,'{}',true,$8,$9) RETURNING id`,
  [org, prog, workspace, sha, storagePath, options.status ?? 'pending',
    JSON.stringify({ origin: 'adopt', fileUploadId: fileId, ...options.provenance }), options.text ?? null, options.text?.length ?? null]);
  return { org, id: out.rows[0].id, program: prog, workspace, fileId, storagePath, bytes, sha };
}

async function row(c: Capture) {
  return (await harness.pg.query<any>('SELECT * FROM cre_evidence_sources WHERE id=$1 AND organization_id=$2', [c.id, c.org])).rows[0];
}

async function stage(c: Capture) { return (await row(c)).metadata?.dataRoomProcessing; }

async function updateStage(c: Capture, value: Record<string, unknown>) {
  await harness.pg.query(`UPDATE cre_evidence_sources SET metadata=jsonb_set(COALESCE(metadata,'{}'::jsonb),'{dataRoomProcessing}',$3::jsonb,true)
    WHERE id=$1 AND organization_id=$2`, [c.id, c.org, JSON.stringify(value)]);
}

async function expire(c: Capture) {
  const existing = await stage(c);
  if (!existing) throw new Error('Fixture expected a real claimed stage before expiry injection');
  await updateStage(c, { ...existing, claimedAt: new Date(Date.now() - 120000).toISOString(), leaseExpiresAt: new Date(Date.now() - 60000).toISOString() });
}

function run(c: Capture, extra: Record<string, unknown> = {}, opts: Record<string, unknown> = {}) {
  return processCapturedSource(c.org, c.id, { bytes: c.bytes, fileName: 'Protocol.txt', mimeType: 'text/plain', programId: c.program, processedBy: 'independent evidence', ...extra }, { db, ...opts });
}

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (reason?: unknown) => void;
  const promise = new Promise<T>((yes, no) => { resolve = yes; reject = no; });
  return { promise, resolve, reject };
}

async function paused(c: Capture) {
  const reached = deferred<void>();
  const release = deferred<{ text: string; method: string; pageSpans: never[] }>();
  seam.extract.mockImplementationOnce(async () => { reached.resolve(); return release.promise; });
  const pending = run(c);
  await Promise.race([reached.promise, pending.then(result => { throw new Error(`Attempt ended before extraction pause: ${JSON.stringify(result)}`); })]);
  return { pending, finish: () => release.resolve({ text: BODY, method: 'plain-text', pageSpans: [] }), fail: () => release.reject(new Error('injected extraction outage')) };
}

async function disposition(c: Capture, choice: 'keep_data' | 'remove_data' = 'keep_data') {
  if (!c.program) throw new Error('Fixture needs a program target');
  const service = createDocumentDispositionService({
    db,
    audit: async (q, entry) => {
      const id = randomUUID();
      await q.query('INSERT INTO test_disposition_audit VALUES ($1,$2,$3)', [id, c.org, JSON.stringify(entry)]);
      return { id, sha256Chain: 'f'.repeat(64) };
    },
    enabled: () => true,
    tokenSecret: 'independent-d2-evidence-secret-at-least-32-characters',
  });
  const scope = { organizationId: c.org, programId: c.program, actorId: 42, orgRole: 'manager', targetType: 'captured_source' as const, targetId: String(c.id) };
  const preview = await service.preview(scope);
  return service.apply({ ...scope, choice, reason: 'Independent controlled withdrawal acceptance fixture', previewToken: preview.previewToken });
}

beforeAll(async () => {
  harness = await createDispositionHarness();
  await harness.pg.exec(`
    ALTER TABLE cre_evidence_sources ADD COLUMN client_workspace_id integer, ADD COLUMN stored_artifact_ref text,
      ADD COLUMN created_by integer, ADD COLUMN created_at timestamptz DEFAULT now(), ADD COLUMN version text,
      ADD COLUMN product text, ADD COLUMN indication text, ADD COLUMN phase text, ADD COLUMN application_type text,
      ADD COLUMN application_number text, ADD COLUMN agency text, ADD COLUMN trial_registry_identifier text,
      ADD COLUMN document_date date, ADD COLUMN study_ref integer;
    ALTER TABLE file_uploads ADD COLUMN original_name text, ADD COLUMN mime_type text, ADD COLUMN file_size bigint;
    ALTER TABLE vault.documents ADD COLUMN file_name text;
    ALTER TABLE regulatory_programs ADD COLUMN product_name text, ADD COLUMN indication text, ADD COLUMN phase text,
      ADD COLUMN program_type text, ADD COLUMN application_number text, ADD COLUMN primary_agency text;
    CREATE TABLE client_workspaces (id serial PRIMARY KEY,organization_id integer,status text,deleted_at timestamptz);
    CREATE TABLE cdisc_prm_studies (id serial PRIMARY KEY, tenant_id integer,program_id uuid,study_id text,protocol_id text);
  `);
  for (const name of ['20260906_vault_documents_fulltext.sql', '20261008c_data_room_source_text.sql', '20261001_cre_evidence_sources_capture_immutability.sql']) {
    await harness.pg.exec(fs.readFileSync(new URL(`../../../../migrations/${name}`, import.meta.url), 'utf8'));
  }
});

beforeEach(() => {
  activeOrg = ++orgCounter;
  queryFault = undefined;
  afterQuery = undefined;
  capturedSql = [];
  seam.query.mockReset().mockImplementation(db.query);
  seam.connect.mockReset().mockImplementation(db.connect);
  seam.extract.mockReset().mockImplementation(async (bytes: Buffer) => ({ text: bytes.toString('utf8'), method: 'plain-text', pageSpans: [] }));
  seam.load.mockReset().mockImplementation(async (fileId: string, org: number) => {
    const upload = (await harness.pg.query<any>('SELECT * FROM file_uploads WHERE id=$1 AND organization_id=$2', [fileId, org])).rows[0];
    if (!upload) throw new Error('controlled original unavailable');
    return { fileId, fileName: upload.original_name, mimeType: upload.mime_type, fileSize: Number(upload.file_size), storagePath: upload.storage_path,
      buffer: Buffer.from(upload.checksum_sha256 === NEXT_SHA ? NEXT_BODY : BODY), integrity: upload.checksum_sha256 ? 'verified' : 'unverifiable' };
  });
});
afterAll(async () => { await harness.close(); });

describe('Independent D2 adversarial contract, embedded sequential/interleaving evidence', () => {
  it('01: a live claimed attempt makes a second caller busy without a second extraction', async () => {
    const c = await seed();
    const a = await paused(c);
    try {
      const token = (await stage(c)).attemptId;
      const b = await run(c);
      expect(b.status).toBe('busy');
      expect(b.ok).toBe(false);
      expect((await stage(c)).attemptId).toBe(token);
      expect((await stage(c)).attempts).toBe(1);
      expect(seam.extract).toHaveBeenCalledTimes(1);
    } finally { a.finish(); await a.pending; }
  });

  it('02: expired A cannot overwrite B completed text with a late successful result', async () => {
    const c = await seed();
    const a = await paused(c);
    try {
      const oldToken = (await stage(c)).attemptId;
      await expire(c);
      const b = await run(c);
      expect(b.status).toBe('completed');
      const completed = await row(c);
      expect(completed.metadata.dataRoomProcessing.attemptId).not.toBe(oldToken);
      a.finish();
      expect((await a.pending).status).toBe('stale_source');
      expect(await row(c)).toEqual(completed);
    } finally { a.finish(); await a.pending; }
  });

  it('03: expired A late extraction failure cannot replace B completion or reintroduce an error', async () => {
    const c = await seed();
    const a = await paused(c);
    try {
      await expire(c);
      expect((await run(c)).ok).toBe(true);
      const completed = await row(c);
      a.fail();
      expect((await a.pending).status).toBe('stale_source');
      expect(await row(c)).toEqual(completed);
      expect((await row(c)).provenance.extractionError).toBeUndefined();
    } finally { a.finish(); await a.pending; }
  });

  it('04: an expired token is refused even before a replacement claims', async () => {
    const c = await seed();
    const a = await paused(c);
    try {
      await expire(c);
      a.finish();
      const result = await a.pending;
      expect(result.status).toBe('stale_source');
      expect(result.ok).toBe(false);
      expect((await row(c)).extracted_text).toBeNull();
    } finally { a.finish(); await a.pending; }
  });

  it('05: supersession while extraction runs refuses predecessor completion and preserves successor', async () => {
    const c = await seed();
    const a = await paused(c);
    try {
      await harness.pg.query('UPDATE cre_evidence_sources SET is_current=false WHERE id=$1 AND organization_id=$2', [c.id, c.org]);
      const successor = await seed({ program: c.program, body: NEXT_BODY });
      const before = await row(successor);
      a.finish();
      expect((await a.pending).status).toBe('stale_source');
      expect((await row(c)).is_current).toBe(false);
      expect((await row(c)).extracted_text).toBeNull();
      expect(await row(successor)).toEqual(before);
    } finally { a.finish(); await a.pending; }
  });

  it('06: actual same-program keep_data withdrawal fences new processing and retains prior text', async () => {
    const c = await seed();
    const a = await paused(c);
    try {
      await disposition(c);
      a.finish();
      expect((await a.pending).ok).toBe(false);
      expect((await row(c)).extracted_text).toBeNull();
      const retained = await seed({ body: NEXT_BODY, status: 'extracted', text: NEXT_BODY });
      await disposition(retained);
      const result = await run(retained);
      expect(result.ok).toBe(true);
      expect(result.status).toBe('already_complete');
      expect((await row(retained)).extracted_text).toBe(NEXT_BODY);
    } finally { a.finish(); await a.pending; }
  });

  it('07: another program withdrawing the same upload makes in-flight original processing unavailable', async () => {
    const c = await seed();
    const target = await seed({ program: await program(c.org), fileId: c.fileId });
    const a = await paused(c);
    try {
      await disposition(target);
      a.finish();
      expect((await a.pending).ok).toBe(false);
      expect((await row(c)).extracted_text).toBeNull();
      expect(capturedSql.some(sql => /LOCK TABLE public\.cre_evidence_sources, public\.file_uploads IN ROW EXCLUSIVE MODE/.test(sql))).toBe(true);
    } finally { a.finish(); await a.pending; }
  });

  it('08: a null-program capture still refuses organization-wide original withdrawal', async () => {
    const c = await seed({ program: null });
    const target = await seed({ fileId: c.fileId });
    const a = await paused(c);
    try {
      await disposition(target);
      a.finish();
      expect((await a.pending).ok).toBe(false);
      expect((await row(c)).extracted_text).toBeNull();
    } finally { a.finish(); await a.pending; }
  });

  it('09: nullable scope and mutable recorded file association cannot change during an attempt', async () => {
    for (const change of ['association', 'scope']) {
      const c = await seed({ program: null });
      const a = await paused(c);
      try {
        if (change === 'association') {
          const other = await seed({ program: null });
          await harness.pg.query(`UPDATE cre_evidence_sources SET provenance=jsonb_set(provenance,'{fileUploadId}',to_jsonb($3::text)) WHERE id=$1 AND organization_id=$2`, [c.id, c.org, other.fileId]);
        } else {
          const p = await program(c.org);
          await harness.pg.query('UPDATE cre_evidence_sources SET client_program_id=$3 WHERE id=$1 AND organization_id=$2', [c.id, c.org, p]);
        }
        a.finish();
        expect((await a.pending).status).toBe('stale_source');
        expect((await row(c)).extracted_text).toBeNull();
      } finally { a.finish(); await a.pending; }
    }
  });

  it('10: source/upload hash split, missing upload digest, and caller Buffer mutation fail safely', async () => {
    for (const options of [{ sourceSha: NEXT_SHA }, { uploadSha: null }, { uploadSha: 'malformed' }, { uploadSha: NEXT_SHA }]) {
      const c = await seed(options);
      const count = seam.extract.mock.calls.length;
      expect((await run(c)).ok).toBe(false);
      expect((await row(c)).extracted_text).toBeNull();
      expect(seam.extract.mock.calls.length).toBe(count);
    }
    const c = await seed();
    const original = Buffer.from(c.bytes);
    const a = await paused(c);
    try {
      c.bytes.fill(88);
      a.finish();
      expect((await a.pending).ok).toBe(true);
      expect(seam.extract.mock.calls.at(-1)?.[0]).toEqual(original);
      expect((await row(c)).extracted_text).toBe(BODY);
    } finally { a.finish(); await a.pending; }
  });

  it('11: correct duplicate input cannot bypass missing canonical original loading', async () => {
    const c = await seed();
    seam.load.mockRejectedValueOnce(new Error('controlled missing original'));
    const result = await run(c);
    expect(result.ok).toBe(false);
    expect(result.status).toBe('blocked');
    expect(seam.load).toHaveBeenCalledWith(c.fileId, c.org);
    expect(seam.extract).not.toHaveBeenCalled();
    expect((await row(c)).extracted_text).toBeNull();
  });

  it('12: failed final persistence and failed journaling retain an expired-lease recovery signal', async () => {
    const c = await seed();
    let extracted = false;
    seam.extract.mockImplementation(async () => { extracted = true; return { text: BODY, method: 'plain-text', pageSpans: [] }; });
    queryFault = sql => { if (extracted && /^\s*UPDATE\s+(?:public\.)?cre_evidence_sources/i.test(sql)) throw new Error('controlled DB write unavailable'); };
    const failed = await run(c);
    expect(failed.ok).toBe(false);
    expect(failed.status).toBe('retryable_failure');
    expect((await row(c)).extracted_text).toBeNull();
    queryFault = undefined;
    await expire(c);
    expect((await run(c)).status).toBe('completed');
    const found = (await harness.pg.query<{ found: boolean }>(`SELECT vault.document_search_vector(title,NULL::text,left(extracted_text,900000))
      @@ websearch_to_tsquery('english','cardiotoxicity') AS found FROM cre_evidence_sources WHERE id=$1 AND organization_id=$2`, [c.id, c.org])).rows[0].found;
    expect(found).toBe(true);
    expect((await stage(c)).state).toBe('completed');
  });

  it('13: lost completion reply is resolved from persisted state without repeating extraction', async () => {
    const c = await seed();
    let thrown = false;
    afterQuery = async sql => {
      if (sql.trim() === 'COMMIT' && !thrown && (await stage(c))?.state === 'completed') {
        thrown = true;
        throw new Error('controlled lost commit response');
      }
    };
    await run(c);
    afterQuery = undefined;
    const before = await row(c);
    const count = seam.extract.mock.calls.length;
    const again = await run(c);
    expect(again.status).toBe('already_complete');
    expect(again.ok).toBe(true);
    expect(seam.extract.mock.calls.length).toBe(count);
    expect(await row(c)).toEqual(before);
  });

  it('14: future/malformed metadata and timestamps cannot reset budget or crash a sweep', async () => {
    const healthy = await seed({ status: 'extracted', text: BODY });
    expect((await run(healthy)).status).toBe('already_complete');
    expect(await stage(healthy)).toBeUndefined();
    const template = await seed();
    expect((await run(template)).ok).toBe(true);
    const complete = await stage(template);
    for (const override of [{ version: 2 }, { state: 'future' }, { attempts: -1 }, { attempts: '3' }, { leaseExpiresAt: 'not-a-date', state: 'running' }, { nextRetryAt: 'not-a-date', state: 'failed', retryable: true }, { attemptId: 'invalid' }]) {
      const c = await seed();
      await updateStage(c, { ...complete, identity: { ...complete.identity, sourceId: c.id, fileUploadId: c.fileId, storageRef: c.storagePath, uploadStoragePath: c.storagePath, programId: c.program }, ...override });
      const before = await stage(c);
      const result = await run(c);
      expect(result.ok).toBe(false);
      expect(result.status).toBe('blocked');
      expect(await stage(c)).toEqual(before);
    }
    const selected = await processPendingSources(activeOrg, { db, limit: 2 });
    expect(selected.dryRun).toBe(true);
  });

  it('15: blockers do not consume runnable limit; dry run has no load, extraction or writes', async () => {
    const bad: Capture[] = [];
    for (let i = 0; i < 4; i++) {
      const c = await seed();
      await updateStage(c, { version: 99, state: 'future', nextRetryAt: 'invalid', attempts: -100 });
      bad.push(c);
    }
    const runnable = await seed();
    const before = await Promise.all([...bad, runnable].map(row));
    seam.load.mockClear();
    seam.extract.mockClear();
    capturedSql = [];
    const dry = await processPendingSources(activeOrg, { db, limit: 1 });
    expect(dry.dryRun).toBe(true);
    expect(seam.load).not.toHaveBeenCalled();
    expect(seam.extract).not.toHaveBeenCalled();
    expect(capturedSql.some(sql => /^\s*(UPDATE|INSERT|DELETE|BEGIN)/i.test(sql))).toBe(false);
    expect(await Promise.all([...bad, runnable].map(row))).toEqual(before);
    const applied = await processPendingSources(activeOrg, { db, limit: 1, apply: true });
    expect(applied.processed).toBe(1);
    expect((await row(runnable)).extracted_text).toBe(BODY);
    for (const c of bad) expect((await row(c)).extracted_text).toBeNull();
    await expect(processPendingSources(activeOrg, { db, limit: Number.NaN })).rejects.toThrow();
    await expect(processPendingSources(activeOrg, { db, limit: 1.5 })).rejects.toThrow();
  });

  it('16: persisted extraction failure is not completion, explicit retry clears stale prose, lineage changes fence a result', async () => {
    const c = await seed();
    seam.extract.mockResolvedValueOnce({ text: '', method: 'plain-text', pageSpans: [] });
    const failed = await run(c);
    expect(failed.status).toBe('extraction_failed');
    expect(failed.ok).toBe(false);
    expect(failed.processed).toBe(false);
    expect((await row(c)).extracted_text).toBeNull();
    expect((await run(c, {}, { retryFailed: true })).ok).toBe(true);
    expect((await row(c)).provenance.extractionError).toBeUndefined();
    const changing = await seed();
    const a = await paused(changing);
    try {
      await harness.pg.query(`UPDATE cre_evidence_sources SET provenance=provenance||'{"origin":"spreadsheet_edit","derivedFromFileId":"unknown-parent","derivedFromSha256":"${SHA}","parentSourceIds":[]}'::jsonb
        WHERE id=$1 AND organization_id=$2`, [changing.id, changing.org]);
      a.finish();
      expect((await a.pending).ok).toBe(false);
      expect((await row(changing)).extracted_text).toBeNull();
    } finally { a.finish(); await a.pending; }
  });
});
