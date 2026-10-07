import { beforeEach, describe, expect, it, vi } from 'vitest';

const h = vi.hoisted(() => ({
  query: vi.fn(), connect: vi.fn(), release: vi.fn(),
  mkdir: vi.fn(), writeFile: vi.fn(), unlink: vi.fn(), readFile: vi.fn(),
  createSource: vi.fn(), audit: vi.fn(), resolveProgram: vi.fn(), lockProgram: vi.fn(),
}));
vi.mock('node:fs', () => ({ promises: {
  mkdir: h.mkdir, writeFile: h.writeFile, unlink: h.unlink, readFile: h.readFile,
} }));
vi.mock('../../../db.js', () => ({ getPool: () => ({ query: h.query, connect: h.connect }) }));
vi.mock('../../clinical-regulatory-evidence/evidence-spine.service.js', () => ({ createSource: h.createSource }));
vi.mock('../../auditService', () => ({ writeChainedAuditRow: h.audit }));
vi.mock('../../c2c/program-access.js', () => ({ resolveOpenProgram: h.resolveProgram }));
vi.mock('../../document-data-disposition/program-lock.js', () => ({ lockDocumentDispositionProgram: h.lockProgram }));

import { saveDerivedUpload, sha256Hex } from '../uploaded-file-access';

const programId = 'a1111111-1111-4111-8111-111111111111';
const original = Buffer.from('original verified workbook');
const sourceSha256 = sha256Hex(original);
const row = {
  id: 'file_original', original_name: 'study.xlsx', mime_type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  file_size: original.length, storage_path: 'uploads/org-7/file_original', organization_id: 7, checksum_sha256: sourceSha256,
};
function params() {
  return {
    buffer: Buffer.from('derived workbook bytes'), fileName: 'study (edited).xlsx',
    mimeType: row.mime_type, organizationId: 7, userId: 41,
    derivation: {
      sourceFileId: row.id, sourceSha256, projectRef: programId,
      edits: [{ sheet: 'Assay', cell: 'B7', value: 99.2 }], createdSheets: [],
    },
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  h.mkdir.mockResolvedValue(undefined); h.writeFile.mockResolvedValue(undefined); h.unlink.mockResolvedValue(undefined);
  h.readFile.mockResolvedValue(original);
  h.connect.mockResolvedValue({ query: h.query, release: h.release });
  h.query.mockImplementation(async (sql: string) => {
    if (sql.includes('FROM file_uploads')) return { rows: [row] };
    if (sql.includes('FROM cre_evidence_sources')) return { rows: [{ id: 12 }] };
    return { rows: [], rowCount: 1 };
  });
  h.resolveProgram.mockResolvedValue(programId);
  h.lockProgram.mockResolvedValue(undefined);
  h.createSource.mockResolvedValue({ id: 77 });
  h.audit.mockResolvedValue(undefined);
});

describe('derived spreadsheet upload — parent provenance and project capture', () => {
  it('captures the edited copy and its parent/hash/edit receipt atomically without retiring the original', async () => {
    const p = params();
    const result = await saveDerivedUpload(p);
    expect(result).toMatchObject({ sourceId: 77, captureStatus: 'captured', derivationAudit: { resourceType: 'file_upload', resourceId: result.fileId } });
    expect(h.lockProgram).toHaveBeenCalledWith(expect.anything(), 7, programId);
    expect(h.createSource).toHaveBeenCalledWith(7, expect.objectContaining({
      sourceType: 'client_document', clientProgramId: programId, createdBy: 41,
      extractionStatus: 'pending', ingestionStatus: 'ingested', checksum: sha256Hex(p.buffer),
      provenance: expect.objectContaining({
        origin: 'spreadsheet_edit', fileUploadId: result.fileId,
        derivedFromFileId: row.id, derivedFromSha256: sourceSha256, parentSourceIds: [12],
      }),
    }), expect.anything());
    expect(h.createSource.mock.calls[0][1].previousVersionId).toBeUndefined();
    expect(h.audit).toHaveBeenCalledWith(expect.anything(), expect.objectContaining({
      action: 'file_upload.derived', userId: 41,
      details: expect.objectContaining({ sourceFileId: row.id, sourceSha256, edits: p.derivation.edits, sourceId: 77 }),
    }));
    const sql = h.query.mock.calls.map(([s]) => s as string);
    expect(sql.indexOf('BEGIN')).toBeLessThan(sql.findIndex(s => /^\s*INSERT/.test(s)));
    expect(sql.at(-1)).toBe('COMMIT');
    expect(sql.some(s => /^\s*(UPDATE|DELETE)\b/i.test(s))).toBe(false);
    expect(h.release).toHaveBeenCalledOnce();
  });

  it('persists lineage but explicitly does not capture a conversation-only edit', async () => {
    const p = params(); p.derivation.projectRef = '';
    h.resolveProgram.mockResolvedValue(null);
    const result = await saveDerivedUpload(p);
    expect(result).toMatchObject({ sourceId: null, captureStatus: 'conversation_only', derivationAudit: { resourceType: 'file_upload', resourceId: result.fileId } });
    expect(h.createSource).not.toHaveBeenCalled();
    expect(h.audit).toHaveBeenCalledOnce();
  });

  it('refuses a requested foreign/missing project before storing bytes or rows', async () => {
    h.resolveProgram.mockResolvedValue(null);
    await expect(saveDerivedUpload(params())).rejects.toThrow(/project/i);
    expect(h.writeFile).not.toHaveBeenCalled();
    expect(h.query.mock.calls.some(([s]) => /INSERT/.test(s))).toBe(false);
  });

  it('refuses if the source bytes no longer match the bytes that were edited', async () => {
    const p = params(); p.derivation.sourceSha256 = 'b'.repeat(64);
    await expect(saveDerivedUpload(p)).rejects.toThrow(/source.*changed|hash|digest/i);
    expect(h.writeFile).not.toHaveBeenCalled();
    expect(h.createSource).not.toHaveBeenCalled();
  });

  it('rechecks source eligibility on the transaction before an edited copy is written', async () => {
    let reads = 0;
    h.query.mockImplementation(async (sql: string) => {
      if (sql.includes('FROM file_uploads')) return { rows: ++reads === 1 ? [row] : [] };
      return { rows: [] };
    });
    await expect(saveDerivedUpload(params())).rejects.toThrow(/source.*available|source.*eligible|source.*changed/i);
    expect(h.writeFile).not.toHaveBeenCalled();
  });

  it.each([programId, ''])('reserves capture/upload mutation locks before the eligibility recheck, including no-project edits (%s)', async projectRef => {
    const p = params(); p.derivation.projectRef = projectRef;
    if (!projectRef) h.resolveProgram.mockResolvedValue(null);
    await saveDerivedUpload(p);
    const sql = h.query.mock.calls.map(([s]) => s as string);
    const lock = sql.findIndex(s => s === 'LOCK TABLE public.cre_evidence_sources, public.file_uploads IN ROW EXCLUSIVE MODE');
    const recheck = sql.findIndex(s => s.includes('FOR SHARE OF f'));
    expect(lock).toBeGreaterThan(sql.indexOf('BEGIN'));
    expect(lock).toBeLessThan(recheck);
    expect(recheck).toBeLessThan(sql.findIndex(s => /^\s*INSERT/.test(s)));
  });

  it.each(['capture', 'audit'])('rolls back the upload and capture if %s fails and removes only the newly written bytes', async failure => {
    if (failure === 'capture') h.createSource.mockRejectedValueOnce(new Error('capture failed'));
    else h.audit.mockRejectedValueOnce(new Error('audit failed'));
    await expect(saveDerivedUpload(params())).rejects.toThrow(`${failure} failed`);
    expect(h.query).toHaveBeenCalledWith('ROLLBACK');
    expect(h.query).not.toHaveBeenCalledWith('COMMIT');
    expect(h.unlink).toHaveBeenCalledOnce();
    expect(h.unlink.mock.calls[0][0]).not.toContain('file_original');
    expect(h.release).toHaveBeenCalledOnce();
  });

  it('requires an identified tenant and actor for a derivation receipt', async () => {
    await expect(saveDerivedUpload({ ...params(), userId: null })).rejects.toThrow(/actor|user/i);
    expect(h.writeFile).not.toHaveBeenCalled();
  });
});

describe('derived spreadsheet failures and legacy compatibility', () => {
  it('never removes source or derived bytes after an ambiguous COMMIT failure', async () => {
    h.query.mockImplementation(async (sql: string) => {
      if (sql === 'COMMIT') throw new Error('connection lost on COMMIT');
      if (sql.includes('FROM file_uploads')) return { rows: [row] };
      if (sql.includes('FROM cre_evidence_sources')) return { rows: [{ id: 12 }] };
      return { rows: [] };
    });
    await expect(saveDerivedUpload(params())).rejects.toThrow(/connection lost/);
    expect(h.unlink).not.toHaveBeenCalled();
    expect(h.release).toHaveBeenCalledOnce();
  });

  it('retains honest unverifiable status for an original with no recorded checksum', async () => {
    h.query.mockImplementation(async (sql: string) => {
      if (sql.includes('FROM file_uploads')) return { rows: [{ ...row, checksum_sha256: null }] };
      if (sql.includes('FROM cre_evidence_sources')) return { rows: [] };
      return { rows: [] };
    });
    await saveDerivedUpload(params());
    expect(h.audit.mock.calls[0][1].details.sourceIntegrity).toBe('unverifiable');
    expect(h.audit.mock.calls[0][1].details.sourceSha256).toBe(sourceSha256);
    expect(h.createSource.mock.calls[0][1].provenance.parentSourceIds).toEqual([]);
  });

  it('hides a foreign upload before deriving any bytes', async () => {
    h.query.mockResolvedValue({ rows: [{ ...row, organization_id: 9, storage_path: 'uploads/org-9/file_original' }] });
    await expect(saveDerivedUpload(params())).rejects.toThrow(/not found/);
    expect(h.writeFile).not.toHaveBeenCalled();
    expect(h.connect).not.toHaveBeenCalled();
  });

  it('leaves the pre-existing authoring image save contract intact', async () => {
    const result = await saveDerivedUpload({ buffer: Buffer.from('image'), fileName: 'figure.png', mimeType: 'image/png', organizationId: 7, userId: 41 });
    expect(result.fileId).toMatch(/^file_/);
    expect(h.connect).not.toHaveBeenCalled();
    expect(h.createSource).not.toHaveBeenCalled();
    expect(h.audit).not.toHaveBeenCalled();
  });
});
