/** Real PostgreSQL SQL/rollback via PGlite; FS and capture/audit seams are
 * explicit test doubles. Not live RLS, scanner, audit-HMAC or concurrency PQ. */
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { randomUUID } from 'node:crypto';
import { createDispositionHarness, type DispositionHarness, type DispositionFixture } from '../../document-data-disposition/__tests__/disposition-fixture';

const h = vi.hoisted(() => ({ db: null as any, original: Buffer.from('study workbook source'),
  readBytes: Buffer.from('study workbook source'), writeFile: vi.fn(), unlink: vi.fn(), captureFails: false, auditFails: false }));
vi.mock('node:fs', async importOriginal => {
  const original = await importOriginal<typeof import('node:fs')>();
  return { ...original, promises: { ...original.promises, mkdir: vi.fn(async () => undefined),
    writeFile: h.writeFile, unlink: h.unlink, readFile: vi.fn(async () => h.readBytes) } };
});
vi.mock('../../../db.js', () => ({ getPool: () => h.db }));
vi.mock('../../clinical-regulatory-evidence/evidence-spine.service.js', () => ({
  createSource: async (org: number, p: any, q: any) => {
    const result = await q.query(`INSERT INTO cre_evidence_sources
      (organization_id,client_program_id,source_type,title,checksum,extraction_status,ingestion_status,provenance,metadata,is_current)
      VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,true) RETURNING id`,
    [org, p.clientProgramId, p.sourceType, p.title, p.checksum, p.extractionStatus, p.ingestionStatus, JSON.stringify(p.provenance), JSON.stringify(p.metadata)]);
    if (h.captureFails) throw new Error('capture seam failed');
    return result.rows[0];
  },
}));
vi.mock('../../auditService', () => ({
  writeChainedAuditRow: async (q: any, entry: any) => {
    await q.query('INSERT INTO test_disposition_audit VALUES ($1,$2,$3)', [randomUUID(), entry.tenantId, JSON.stringify(entry)]);
    await q.query(`INSERT INTO audit_logs (id,tenant_id,action,table_name,record_id,target,new_values)
      VALUES ($1,$2,$3,$4,$5,$6,$7::json)`, [randomUUID(), entry.tenantId, entry.action,
      entry.resourceType, entry.resourceId, `${entry.resourceType}:${entry.resourceId}`, JSON.stringify(entry.details)]);
    if (h.auditFails) throw new Error('audit seam failed');
  },
}));

import { saveDerivedUpload, sha256Hex, type DerivedUploadParams } from '../uploaded-file-access';

let harness: DispositionHarness;
let f: DispositionFixture;
beforeAll(async () => {
  harness = await createDispositionHarness(); h.db = harness.db;
  await harness.pg.exec(`ALTER TABLE file_uploads ADD COLUMN user_id integer,
    ADD COLUMN original_name text, ADD COLUMN mime_type text, ADD COLUMN file_size bigint,
    ADD COLUMN created_at timestamptz DEFAULT now()`);
});
afterAll(async () => { await harness.close(); });
beforeEach(async () => {
  vi.clearAllMocks(); h.captureFails = false; h.auditFails = false;
  h.readBytes = h.original;
  h.writeFile.mockResolvedValue(undefined); h.unlink.mockResolvedValue(undefined);
  f = await harness.seed();
  await f.pg.query(`UPDATE file_uploads SET checksum_sha256=$1, original_name='source.xlsx',
    mime_type='application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', file_size=$2 WHERE id=$3`,
  [sha256Hex(h.original), h.original.length, f.upload]);
  await f.pg.query('UPDATE cre_evidence_sources SET checksum=$1 WHERE id=$2', [sha256Hex(h.original), f.capture]);
});
function params(): DerivedUploadParams & { derivation: NonNullable<DerivedUploadParams['derivation']> } {
  return { buffer: Buffer.from('edited workbook'), fileName: 'edited.xlsx',
    mimeType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', organizationId: f.org, userId: 42,
    derivation: { sourceFileId: f.upload, sourceSha256: sha256Hex(h.original), projectRef: f.program,
      edits: [{ cell: 'A1', value: 99.2 }], createdSheets: [] } };
}

describe('spreadsheet derivation SQL and atomicity', () => {
  it('stores a new project-visible capture with parent hash and edit audit on the same transaction', async () => {
    const out = await saveDerivedUpload(params());
    const uploads = (await f.pg.query<any>('SELECT * FROM file_uploads WHERE organization_id=$1', [f.org])).rows;
    expect(uploads).toHaveLength(2);
    const original = uploads.find(r => r.id === f.upload);
    expect(original.checksum_sha256).toBe(sha256Hex(h.original));
    expect(original.status).toBe('processed');
    const capture = (await f.pg.query<any>('SELECT * FROM cre_evidence_sources WHERE id=$1', [out.sourceId])).rows[0];
    expect(capture.client_program_id).toBe(f.program);
    expect(capture.provenance.parentSourceIds).toEqual([f.capture]);
    expect(capture.provenance.derivedFromFileId).toBe(f.upload);
    expect(capture.extraction_status).toBe('pending');
    expect(capture.metadata.scientificQualification).toBe('unassessed');
    const audit = (await f.audits())[0] as any;
    expect(audit.entry.details.edits).toEqual(params().derivation.edits);
    expect(audit.entry.details.checksumSha256).toBe(sha256Hex(params().buffer));
  });

  it.each(['capture', 'audit'])('rolls back every new database record if the %s seam fails', async failure => {
    h.captureFails = failure === 'capture'; h.auditFails = failure === 'audit';
    await expect(saveDerivedUpload(params())).rejects.toThrow(`${failure} seam failed`);
    expect((await f.pg.query('SELECT id FROM file_uploads WHERE organization_id=$1', [f.org])).rows).toHaveLength(1);
    expect((await f.pg.query('SELECT id FROM cre_evidence_sources WHERE organization_id=$1', [f.org])).rows).toHaveLength(1);
    expect(await f.audits()).toEqual([]);
    expect(h.unlink).toHaveBeenCalledOnce();
  });

  it('refuses a withdrawn source using the real disposition eligibility SQL', async () => {
    await f.apply('remove_data');
    await expect(saveDerivedUpload(params())).rejects.toThrow(/not found|available/);
    expect(h.writeFile).not.toHaveBeenCalled();
    expect((await f.pg.query('SELECT id FROM file_uploads WHERE organization_id=$1', [f.org])).rows).toHaveLength(1);
  });

  it('rejects another tenant’s project using the canonical ownership query before writes', async () => {
    const other = await harness.seed();
    const p = params(); p.derivation.projectRef = other.program;
    await expect(saveDerivedUpload(p)).rejects.toThrow(/project/);
    expect(h.writeFile).not.toHaveBeenCalled();
  });

  it('keeps a no-project edit conversation-only but refuses another edit after its recorded ancestor was removed', async () => {
    const p = params(); p.derivation.projectRef = '';
    const conversation = await saveDerivedUpload(p);
    expect(conversation.captureStatus).toBe('conversation_only');
    expect(conversation.sourceId).toBeNull();
    expect((await f.pg.query('SELECT id FROM cre_evidence_sources WHERE organization_id=$1', [f.org])).rows).toHaveLength(1);
    await f.apply('remove_data');
    h.writeFile.mockClear(); h.readBytes = p.buffer;
    const next = { ...params(), derivation: { ...params().derivation,
      sourceFileId: conversation.fileId, sourceSha256: sha256Hex(p.buffer) } };
    await expect(saveDerivedUpload(next)).rejects.toThrow(/not found|available/);
    expect(h.writeFile).not.toHaveBeenCalled();
    expect((await f.pg.query('SELECT id FROM file_uploads WHERE organization_id=$1', [f.org])).rows).toHaveLength(2);
  });

  it('permits a further edited copy when a recorded ancestor retained extracted data', async () => {
    const p = params(); p.derivation.projectRef = '';
    const conversation = await saveDerivedUpload(p);
    await f.apply('keep_data'); h.readBytes = p.buffer;
    const next = { ...params(), derivation: { ...params().derivation,
      sourceFileId: conversation.fileId, sourceSha256: sha256Hex(p.buffer) } };
    const out = await saveDerivedUpload(next);
    expect(out.captureStatus).toBe('captured');
    const record = (await f.pg.query<{ provenance: Record<string, unknown> }>('SELECT provenance FROM cre_evidence_sources WHERE id=$1', [out.sourceId])).rows[0];
    expect(record.provenance).toMatchObject({ derivedFromFileId: conversation.fileId,
      derivedFromSha256: sha256Hex(p.buffer) });
  });
});
