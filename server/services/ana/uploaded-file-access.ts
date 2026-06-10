/**
 * Uploaded-file access for AnA tools — tenant-scoped load/save of `file_uploads`
 * rows so document tools (read_uploaded_document, ocr_document_pages,
 * read_spreadsheet, edit_spreadsheet, …) can work directly from a file_id.
 *
 * Tenancy: `file_uploads` has no organization column; the org lives in the
 * storage path written by the upload route (`uploads/org-{id}/{fileId}`, or
 * `uploads/unscoped/{fileId}` when no org was present). Access therefore
 * enforces a path-prefix match against the caller's organizationId — a foreign
 * tenant's file is indistinguishable from a missing one. Edits never mutate the
 * original: `saveDerivedUpload` writes a new row + new bytes (provenance intact).
 */

import { promises as fs } from 'node:fs';
import path from 'node:path';
import { createScopedLogger } from '../../utils/logger';

const logger = createScopedLogger('ana-uploaded-files');

export interface UploadedFile {
  fileId: string;
  fileName: string;
  mimeType: string;
  fileSize: number;
  storagePath: string;
  buffer: Buffer;
}

function uploadsRoot(): string {
  return path.resolve(process.cwd(), 'uploads');
}

function assertWithinUploads(resolved: string): void {
  if (!resolved.startsWith(uploadsRoot() + path.sep)) {
    throw new Error('storage path resolves outside the uploads root');
  }
}

/**
 * Load an upload's metadata + bytes, enforcing tenant scoping via the storage
 * path prefix. Throws (with a tool-friendly message) when the file is unknown,
 * belongs to another tenant, or its bytes are no longer on disk.
 */
export async function loadUploadedFile(
  fileId: string,
  organizationId?: number | null,
): Promise<UploadedFile> {
  if (!fileId || typeof fileId !== 'string') {
    throw new Error('file_id is required (e.g. "file_1712…" from a chat upload)');
  }
  const { getPool } = await import('../../db.js');
  const pool = getPool();
  const { rows } = await pool.query<{
    id: string;
    original_name: string;
    mime_type: string;
    file_size: string | number;
    storage_path: string;
  }>(
    `SELECT id, original_name, mime_type, file_size, storage_path
       FROM file_uploads WHERE id = $1`,
    [fileId],
  );
  if (rows.length === 0) {
    throw new Error(`upload "${fileId}" not found`);
  }
  const row = rows[0];
  const storagePath = row.storage_path || '';

  const unscoped =
    storagePath.startsWith('uploads/unscoped/') || /^uploads\/file_[^/]+$/.test(storagePath);
  if (!unscoped) {
    const expected = organizationId != null ? `uploads/org-${Number(organizationId)}/` : null;
    if (!expected || !storagePath.startsWith(expected)) {
      // Same response as "not found" — don't confirm a foreign tenant's file exists.
      logger.warn('tenant-scoped upload access denied', { fileId, orgId: organizationId ?? null });
      throw new Error(`upload "${fileId}" not found`);
    }
  }

  const resolved = path.resolve(process.cwd(), storagePath);
  assertWithinUploads(resolved);
  let buffer: Buffer;
  try {
    buffer = await fs.readFile(resolved);
  } catch {
    throw new Error(
      `upload "${fileId}" exists but its bytes are no longer available — ask the user to re-upload the file`,
    );
  }

  return {
    fileId: row.id,
    fileName: row.original_name || fileId,
    mimeType: row.mime_type || 'application/octet-stream',
    fileSize: Number(row.file_size) || buffer.length,
    storagePath,
    buffer,
  };
}

/**
 * Persist derived bytes (e.g. an edited workbook) as a NEW upload row in the
 * caller's tenant namespace. Returns the new file_id.
 */
export async function saveDerivedUpload(params: {
  buffer: Buffer;
  fileName: string;
  mimeType: string;
  organizationId?: number | null;
  userId?: number | null;
}): Promise<{ fileId: string; storagePath: string }> {
  const fileId = `file_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
  const orgSegment =
    params.organizationId != null ? `org-${Number(params.organizationId)}` : 'unscoped';
  const storagePath = `uploads/${orgSegment}/${fileId}`;

  const resolved = path.resolve(process.cwd(), storagePath);
  assertWithinUploads(resolved);
  await fs.mkdir(path.dirname(resolved), { recursive: true });
  await fs.writeFile(resolved, params.buffer);

  const { getPool } = await import('../../db.js');
  const pool = getPool();
  await pool.query(
    `INSERT INTO file_uploads (id, user_id, original_name, mime_type, file_size, storage_path, status, created_at)
     VALUES ($1, $2, $3, $4, $5, $6, 'uploaded', NOW())`,
    [fileId, params.userId ?? null, params.fileName, params.mimeType, params.buffer.length, storagePath],
  );

  logger.info('derived upload saved', { fileId, bytes: params.buffer.length });
  return { fileId, storagePath };
}
