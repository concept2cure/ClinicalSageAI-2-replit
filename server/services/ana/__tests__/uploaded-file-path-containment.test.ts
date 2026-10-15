/**
 * Both canonical upload readers reject raw tenant prefixes that resolve into a
 * different namespace. Actual loader/digest logic runs with DB/filesystem seams
 * mocked; this proves lexical containment, not symlink/immutable-storage safety.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';
import path from 'node:path';

const h = vi.hoisted(() => ({ query: vi.fn(), readFile: vi.fn() }));
vi.mock('../../../db.js', () => ({ getPool: () => ({ query: h.query }), pool: { query: h.query } }));
vi.mock('node:fs', () => ({ promises: { readFile: h.readFile } }));

import { loadUploadedFile, loadUploadedFileMetadata, sha256Hex } from '../uploaded-file-access';

const bytes = Buffer.from('unchanged source evidence');
const fileId = 'file_1';
function upload(storagePath: string, organizationId: number | null | undefined) {
  return {
    id: fileId, original_name: 'study.csv', mime_type: 'text/csv',
    file_size: bytes.length, checksum_sha256: sha256Hex(bytes),
    storage_path: storagePath, organization_id: organizationId,
  };
}

const escapedPaths: Array<[string, number | null, number | null | undefined]> = [
  ['uploads/org-7/../org-9/file_1', 7, 7],
  ['uploads/org-7/../unscoped/file_1', 7, 7],
  ['uploads/org-7/../../outside', 7, 7],
  ['uploads/org-7/../org-70/file_1', 7, 7],
  ['uploads/org-7/.', 7, 7],
  ['uploads/org-7/../org-9/file_1', 7, undefined],
  ['uploads/unscoped/../org-7/file_1', null, null],
  ['uploads/unscoped/../file_legacy', null, null],
  ['uploads/unscoped/../../outside', null, null],
  ['uploads/unscoped/.', null, null],
];
const ownedPaths: Array<[string, number | null, number | null | undefined]> = [
  ['uploads/org-7/file_1', 7, 7],
  ['uploads/org-7/nested/../file_1', 7, 7],
  ['uploads/org-7/file_1', 7, undefined],
  ['uploads/unscoped/file_1', null, null],
  ['uploads/file_legacy', null, null],
];

beforeEach(() => {
  vi.clearAllMocks();
  h.query.mockResolvedValue({ rows: [] });
  h.readFile.mockResolvedValue(bytes);
});

describe('canonical metadata reader — resolved namespace containment', () => {
  it.each(escapedPaths)('hides %s for caller %s, including pre-migration rows', async (storagePath, callerOrg, rowOrg) => {
    h.query.mockResolvedValue({ rows: [upload(storagePath, rowOrg)] });
    expect(await loadUploadedFileMetadata([fileId], callerOrg)).toEqual([]);
    expect(h.readFile).not.toHaveBeenCalled();
  });

  it.each(ownedPaths)('retains %s for caller %s', async (storagePath, callerOrg, rowOrg) => {
    h.query.mockResolvedValue({ rows: [upload(storagePath, rowOrg)] });
    expect(await loadUploadedFileMetadata([fileId], callerOrg)).toEqual([
      { fileId, fileName: 'study.csv', mimeType: 'text/csv', storagePath, checksumSha256: sha256Hex(bytes) },
    ]);
  });
});

describe('canonical byte reader — resolved namespace containment and integrity', () => {
  it.each(escapedPaths)('refuses %s for caller %s as an indistinguishable missing upload', async (storagePath, callerOrg, rowOrg) => {
    h.query.mockResolvedValue({ rows: [upload(storagePath, rowOrg)] });
    await expect(loadUploadedFile(fileId, callerOrg)).rejects.toMatchObject({ code: 'UPLOAD_NOT_FOUND' });
    expect(h.readFile).not.toHaveBeenCalled();
  });

  it.each(ownedPaths)('retains %s for caller %s and verifies actual loaded bytes', async (storagePath, callerOrg, rowOrg) => {
    h.query.mockResolvedValue({ rows: [upload(storagePath, rowOrg)] });
    expect(await loadUploadedFile(fileId, callerOrg)).toMatchObject({ fileId, storagePath, buffer: bytes, integrity: 'verified' });
    expect(h.readFile).toHaveBeenCalledWith(path.resolve(process.cwd(), storagePath));
  });

  it('preserves the digest-mismatch refusal for an otherwise contained path', async () => {
    h.query.mockResolvedValue({ rows: [upload('uploads/org-7/file_1', 7)] });
    h.readFile.mockResolvedValue(Buffer.from('changed source evidence'));
    await expect(loadUploadedFile(fileId, 7)).rejects.toMatchObject({ code: 'UPLOAD_INTEGRITY_FAILED' });
  });

  it('preserves the missing-byte refusal for an otherwise contained path', async () => {
    h.query.mockResolvedValue({ rows: [upload('uploads/org-7/file_1', 7)] });
    h.readFile.mockRejectedValue(new Error('ENOENT'));
    await expect(loadUploadedFile(fileId, 7)).rejects.toMatchObject({ code: 'UPLOAD_BYTES_MISSING' });
  });

  it('preserves honest unverifiable status when the legacy upload has no recorded checksum', async () => {
    h.query.mockResolvedValue({ rows: [{ ...upload('uploads/org-7/file_1', 7), checksum_sha256: null }] });
    expect(await loadUploadedFile(fileId, 7)).toMatchObject({ integrity: 'unverifiable', buffer: bytes });
  });
});
