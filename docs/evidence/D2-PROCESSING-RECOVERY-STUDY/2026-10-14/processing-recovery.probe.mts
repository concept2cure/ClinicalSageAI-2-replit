/**
 * D2 recovery PREPARATION, opt-in evidence, outside the normal test collection. The red cases are
 * proposed contract assertions against CURRENT production functions/SQL.
 * No external database, file loader, model, cloud transport, or embedding is
 * reached: PostgreSQL is PGlite, persistence failures/extraction are injected.
 */
import { beforeAll, beforeEach, afterAll, describe, expect, it, vi } from 'vitest';
import { PGlite } from '@electric-sql/pglite';
import fs from 'node:fs';
import { createHash } from 'node:crypto';

const seam = vi.hoisted(() => ({ query: vi.fn(), extract: vi.fn(), load: vi.fn(), warn: vi.fn() }));
vi.mock('../../../../server/db.js', () => ({ pool: { query: seam.query } }));
vi.mock('../../../../server/utils/logger.js', () => ({ createScopedLogger: () => ({ warn: seam.warn, info: vi.fn(), error: vi.fn() }) }));
vi.mock('../../../../server/services/clinical-regulatory-evidence/dataset-profile.js', () => ({ profileDataset: async () => null }));
vi.mock('../../../../server/services/ocr/index.js', () => ({ extractDocumentText: seam.extract }));
vi.mock('../../../../server/services/ana/uploaded-file-access.js', () => ({ loadUploadedFile: seam.load }));
vi.mock('../../../../server/services/vault/vault-filing.service.js', () => ({
  resolveVaultView: async () => 'test', resolveOrgVaultView: async () => 'test',
  classifyForFiling: () => ({ evidenceKind: 'protocol', folderId: null, ctdSection: null, confidence: 0, needsReview: true, rationale: 'test seam' }),
}));

import { recordSourceProcessing, processPendingSources, processCapturedSource } from '../../../../server/services/clinical-regulatory-evidence/data-room-processing.ts';

const ORG = 901041;
const BODY = 'Clinical study protocol version 2.0. Cardiotoxicity monitoring is required.';
const DIGEST = createHash('sha256').update(BODY).digest('hex');
const extracted = { text: BODY, method: 'plain-text', pageCount: null, words: 11 };
let db: PGlite;

const exec = {
  query: async (sql: string, params?: unknown[]) => {
    const result = await db.query(sql, params);
    return { rows: result.rows as any[], rowCount: result.affectedRows ?? result.rows.length };
  },
};

async function seed(status: string, options: { current?: boolean; organization?: number; deleted?: boolean } = {}) {
  const r = await exec.query(`INSERT INTO cre_evidence_sources
      (organization_id, source_type, title, checksum, is_current, extraction_status, provenance, metadata, deleted_at)
    VALUES ($1, 'client_document', 'Protocol.txt', $2, $3, $4,
      '{"fileUploadId":"probe-file"}'::jsonb, '{"mimeType":"text/plain"}'::jsonb, $5)
    RETURNING id`, [options.organization ?? ORG, DIGEST, options.current ?? true, status, options.deleted ? new Date() : null]);
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
  // Only the columns read/written by the REAL functions; not a full deployed
  // schema/RLS harness. The real FTS migrations are then applied below.
  await db.exec(`CREATE SCHEMA vault;
    CREATE TABLE vault.documents (document_title text, file_name text, extracted_text text, deleted_at timestamptz);
    CREATE TABLE cre_evidence_sources (
      id serial PRIMARY KEY, organization_id integer, source_type text, title text,
      client_program_id uuid, checksum text, is_current boolean, extraction_status text,
      provenance jsonb, metadata jsonb, version text, product text, indication text,
      phase text, application_type text, application_number text, agency text,
      trial_registry_identifier text, document_date date, study_ref integer,
      created_at timestamptz DEFAULT now(), updated_at timestamptz DEFAULT now(), deleted_at timestamptz
    );`);
  for (const file of ['20260906_vault_documents_fulltext.sql', '20261008c_data_room_source_text.sql', '20261001_cre_evidence_sources_capture_immutability.sql']) {
    await db.exec(fs.readFileSync(new URL(`../../../../migrations/${file}`, import.meta.url), 'utf8'));
  }
}, 60000);

beforeEach(async () => {
  // The real capture guard refuses TRUNCATE. This embedded fixture runs as
  // its table owner, who alone is allowed to delete their own test records.
  await db.exec('DELETE FROM cre_evidence_sources');
  seam.query.mockReset().mockImplementation(exec.query);
  seam.warn.mockReset();
  seam.extract.mockReset().mockResolvedValue({ text: BODY, method: 'plain-text', pageSpans: [] });
  seam.load.mockReset().mockResolvedValue({ buffer: Buffer.from(BODY), fileName: 'Protocol.txt', mimeType: 'text/plain', integrity: 'verified' });
});
afterAll(async () => { await db.close(); });

describe('D2 recovery continuation: current-code failure probes', () => {
  it('RED: an upload capture claiming extracted with a failed derived UPDATE must remain recoverable', async () => {
    // This is the state committed by chat/upload.ts:505 before the derived
    // write at :556. Inject a persistence exception at that second write.
    const id = await seed('extracted');
    const broken = { query: async () => { throw new Error('injected derived persistence failure'); } };
    await expect(recordSourceProcessing(broken, ORG, id, { extracted, processedBy: 'chat_upload ingest' })).rejects.toThrow('injected');
    expect((await state(id)).extraction_status).toBe('extracted');
    expect((await state(id)).extracted_text).toBeNull();
    expect(await searchable(id)).toBe(false);
    const report = await processPendingSources(ORG, { exec });
    console.log('lost-recovery probe', JSON.stringify({ sourceId: id, status: 'extracted', text: null, report }));
    expect(report.examined).toBe(1);
  });

  it('CONTROL: pending capture is selected, one successful derived UPDATE makes text searchable, then leaves retry set', async () => {
    const id = await seed('pending');
    expect((await processPendingSources(ORG, { exec })).examined).toBe(1);
    expect(await recordSourceProcessing(exec, ORG, id, { extracted, processedBy: 'probe' })).toBe(true);
    const row = await state(id);
    expect(row.extraction_status).toBe('extracted');
    expect(row.extracted_text).toBe(BODY);
    expect(row.char_count).toBe(BODY.length);
    expect(row.checksum).toBe(DIGEST);
    expect(await searchable(id)).toBe(true);
    expect((await processPendingSources(ORG, { exec })).examined).toBe(0);
    expect(seam.load).not.toHaveBeenCalled();
  });

  it('CONTROL: foreign organization and deleted capture are refused at the derived writer', async () => {
    const foreign = await seed('pending', { organization: ORG + 1 });
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
    const done = await processCapturedSource(ORG, id, { bytes: Buffer.from(BODY), fileName: 'Protocol.txt', mimeType: 'text/plain', programId: null, processedBy: 'adopt' });
    expect(done.ok).toBe(false);
    expect((await state(id)).extraction_status).toBe('pending');
    expect((await processPendingSources(ORG, { exec })).examined).toBe(1);
    expect(seam.warn).toHaveBeenCalledWith(expect.stringContaining('left pending'), expect.objectContaining({ sourceId: id }));
  });

  it('RED: shared processor must bind supplied bytes to the recorded capture digest before deriving text', async () => {
    const id = await seed('pending');
    const replacement = 'Different trial: serious adverse events only.';
    seam.extract.mockResolvedValue({ text: replacement, method: 'plain-text' });
    const done = await processCapturedSource(ORG, id, { bytes: Buffer.from(replacement), fileName: 'Protocol.txt', mimeType: 'text/plain', programId: null, processedBy: 'mismatched bytes probe' });
    expect((await state(id)).checksum).toBe(DIGEST);
    console.log('capture-byte-binding probe', JSON.stringify({ sourceId: id, done, captureDigest: DIGEST, suppliedDigest: createHash('sha256').update(replacement).digest('hex') }));
    expect(done.ok).toBe(false);
    expect((await state(id)).extracted_text).toBeNull();
  });

  it('RED: a source superseded while processing was in flight must refuse the stale derived commit', async () => {
    const id = await seed('pending');
    await exec.query('UPDATE cre_evidence_sources SET is_current=false WHERE id=$1', [id]);
    const committed = await recordSourceProcessing(exec, ORG, id, { extracted, processedBy: 'old in-flight attempt' });
    console.log('stale-source probe', JSON.stringify({ sourceId: id, committed, current: (await state(id)).is_current }));
    expect(committed).toBe(false);
  });

  it('RED: current-source recovery must exclude a superseded pending source', async () => {
    await seed('pending', { current: false });
    const report = await processPendingSources(ORG, { exec });
    console.log('superseded-candidate probe', JSON.stringify(report));
    expect(report.examined).toBe(0);
  });

  it('RED: failed extraction must be named as failed, rather than counted as processed success', async () => {
    const id = await seed('pending');
    seam.extract.mockResolvedValue({ text: '', method: 'plain-text' });
    const report = await processPendingSources(ORG, { exec, apply: true });
    expect((await state(id)).extraction_status).toBe('failed');
    expect((await state(id)).extracted_text).toBeNull();
    console.log('failed-extraction report probe', JSON.stringify(report));
    expect(report.processed).toBe(0);
    expect(report.unreadable).toEqual([expect.objectContaining({ sourceId: id })]);
  });
});
