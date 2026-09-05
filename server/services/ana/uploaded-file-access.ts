/**
 * Uploaded-file access for AnA tools — tenant-scoped load/save of `file_uploads`
 * rows so document tools (read_uploaded_document, ocr_document_pages,
 * read_spreadsheet, edit_spreadsheet, …) can work directly from a file_id.
 *
 * Tenancy is carried two independent ways and BOTH are enforced on every read
 * (see migrations/20260726_file_uploads_tenancy.sql, which owns the contract):
 *
 *   1. `file_uploads.organization_id` — the explicit, indexable column.
 *   2. The storage path written by the upload route — `uploads/org-{id}/{fileId}`,
 *      or `uploads/unscoped/{fileId}` when no org was present.
 *
 * Requiring both means a row whose org column is wrong or NULL (legacy writes
 * predating the column) still cannot serve another tenant's bytes, and a
 * forged/mismatched storage path cannot escape the org filter. A foreign
 * tenant's file is indistinguishable from a missing one.
 *
 * This module is the ONLY place that resolves an upload id to a tenant. Route
 * handlers must not hand-roll `WHERE id = ANY(...)` lookups — that is precisely
 * how stream.ts, chat.ts and chat-context-builder.ts drifted into three
 * different (and two broken) tenancy rules.
 *
 * Edits never mutate the original: `saveDerivedUpload` writes a new row + new
 * bytes (provenance intact).
 */

import { promises as fs } from 'node:fs';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { createScopedLogger } from '../../utils/logger';

const logger = createScopedLogger('ana-uploaded-files');

export interface UploadedFile {
  fileId: string;
  fileName: string;
  mimeType: string;
  fileSize: number;
  storagePath: string;
  buffer: Buffer;
  /**
   * What the stored digest proved about these bytes.
   *
   *   'verified'      — a checksum was recorded and the bytes still match it.
   *   'unverifiable'  — the row predates checksumming (checksum_sha256 IS NULL).
   *
   * A MISMATCH is never reported here: loadUploadedFile throws instead, because
   * a document whose bytes no longer match what was received must not be handed
   * to a caller that would then treat it as the original.
   *
   * Present rather than omitted-when-unknown on purpose. A caller that renders
   * "verified" has to look at this field to do so, which means it cannot claim
   * verification for a legacy row by forgetting to check.
   */
  integrity: 'verified' | 'unverifiable';
}

/** Lowercase hex SHA-256, the form stored in file_uploads.checksum_sha256. */
export function sha256Hex(buffer: Buffer): string {
  return createHash('sha256').update(buffer).digest('hex');
}

function uploadsRoot(): string {
  return path.resolve(process.cwd(), 'uploads');
}

function assertWithinUploads(resolved: string): void {
  if (!resolved.startsWith(uploadsRoot() + path.sep)) {
    throw new Error('storage path resolves outside the uploads root');
  }
}

/** Metadata-only view of an upload — no bytes read. */
export interface UploadedFileMetadata {
  fileId: string;
  fileName: string;
  mimeType: string;
  storagePath: string;
}

/**
 * True when `storagePath` is the "no proven owner" form: uploads written
 * without an authenticated org (`uploads/unscoped/…`) and pre-tenancy flat rows
 * (`uploads/file_*`).
 */
function isUnscopedPath(storagePath: string): boolean {
  return storagePath.startsWith('uploads/unscoped/') || /^uploads\/file_[^/]+$/.test(storagePath);
}

/**
 * Tenancy predicate, enforced symmetrically:
 *
 *   tenant caller  → may read only rows whose org column AND storage path name
 *                    that same org.
 *   unscoped caller → may read only unscoped rows.
 *
 * Symmetry matters in both directions. Letting a tenant read unscoped files
 * would make every ownerless upload globally readable; letting an unscoped
 * caller read tenant files would bypass tenancy entirely. The previous rule
 * did the former — `unscoped` short-circuited the check for every caller.
 *
 * `organization_id` may be undefined on a database that has not yet run
 * migrations/20260726_file_uploads_tenancy.sql; there the path prefix alone
 * carries the decision rather than failing every read closed.
 */
function rowBelongsToOrg(
  row: { organization_id?: number | string | null; storage_path?: string | null },
  organizationId?: number | null,
): boolean {
  const storagePath = row.storage_path || '';

  if (organizationId == null) {
    // An unscoped caller gets unscoped files only, and only when the row does
    // not claim an owner of its own.
    return isUnscopedPath(storagePath) && !row.organization_id;
  }

  if (!storagePath.startsWith(`uploads/org-${Number(organizationId)}/`)) return false;
  if (row.organization_id === undefined) return true; // pre-migration database
  if (row.organization_id === null) return false;
  return Number(row.organization_id) === Number(organizationId);
}

/**
 * Batch, tenant-scoped metadata lookup for chat attachments. Returns only rows
 * the caller's org provably owns; unknown and foreign ids are simply absent
 * (never an error that would confirm their existence).
 *
 * This is the single lookup every chat/stream path must use to resolve
 * `file_ids` from a turn.
 */
export async function loadUploadedFileMetadata(
  fileIds: string[],
  organizationId?: number | null,
): Promise<UploadedFileMetadata[]> {
  const ids = (Array.isArray(fileIds) ? fileIds : []).filter(
    (id): id is string => typeof id === 'string' && id.length > 0,
  );
  if (ids.length === 0) return [];

  const { getPool } = await import('../../db.js');
  const pool = getPool();
  const { rows } = await pool.query<{
    id: string;
    original_name: string;
    mime_type: string;
    storage_path: string;
    organization_id: number | string | null;
  }>(
    `SELECT id, original_name, mime_type, storage_path, organization_id
       FROM file_uploads WHERE id = ANY($1)`,
    [ids],
  );

  const allowed = rows.filter(row => rowBelongsToOrg(row, organizationId));
  if (allowed.length !== rows.length) {
    logger.warn('tenant-scoped attachment access denied', {
      orgId: organizationId,
      requested: ids.length,
      denied: rows.length - allowed.length,
    });
  }
  return allowed.map(row => ({
    fileId: row.id,
    fileName: row.original_name || row.id,
    mimeType: row.mime_type || 'application/octet-stream',
    storagePath: row.storage_path || '',
  }));
}

/**
 * Load an upload's metadata + bytes, enforcing tenant scoping via both the
 * organization column and the storage path prefix. Throws (with a tool-friendly
 * message) when the file is unknown, belongs to another tenant, or its bytes
 * are no longer on disk.
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
    organization_id: number | string | null;
    checksum_sha256: string | null;
  }>(
    `SELECT id, original_name, mime_type, file_size, storage_path, organization_id, checksum_sha256
       FROM file_uploads WHERE id = $1`,
    [fileId],
  );
  if (rows.length === 0) {
    throw new Error(`upload "${fileId}" not found`);
  }
  const row = rows[0];
  const storagePath = row.storage_path || '';

  if (!rowBelongsToOrg(row, organizationId)) {
    // Same response as "not found" — don't confirm a foreign tenant's file exists.
    logger.warn('tenant-scoped upload access denied', { fileId, orgId: organizationId ?? null });
    throw new Error(`upload "${fileId}" not found`);
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

  // ── Integrity: the bytes must still be the bytes we were given ───────────
  // Until now nothing ever re-derived a digest from the stored bytes, so a file
  // altered on disk, truncated by a failed write, or restored from a bad backup
  // was served to a regulatory user as the original. Checked HERE, in the one
  // module that resolves an upload id to bytes, so no caller can opt out by
  // reading the row itself.
  //
  // Fails closed: a mismatch throws rather than returning the bytes with a
  // warning attached. A caller holding a Buffer will use it, and the whole
  // point is that these particular bytes cannot be trusted.
  const recorded = row.checksum_sha256;
  let integrity: UploadedFile['integrity'] = 'unverifiable';
  if (recorded) {
    const actual = sha256Hex(buffer);
    if (actual !== recorded) {
      logger.error('upload integrity check FAILED — stored bytes do not match the recorded digest', {
        fileId,
        orgId: organizationId ?? null,
        storagePath,
        recordedSha256: recorded,
        actualSha256: actual,
        recordedSize: Number(row.file_size) || null,
        actualSize: buffer.length,
      });
      throw new Error(
        `upload "${fileId}" failed its integrity check: the stored bytes no longer match the ` +
          `SHA-256 recorded when it was received. The file has been altered or corrupted since ` +
          `upload and will not be served. Ask the user to re-upload it.`,
      );
    }
    integrity = 'verified';
  }

  return {
    fileId: row.id,
    fileName: row.original_name || fileId,
    mimeType: row.mime_type || 'application/octet-stream',
    fileSize: Number(row.file_size) || buffer.length,
    storagePath,
    buffer,
    integrity,
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
    `INSERT INTO file_uploads (id, user_id, organization_id, original_name, mime_type, file_size, storage_path, checksum_sha256, status, created_at)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, 'uploaded', NOW())`,
    [
      fileId,
      params.userId ?? null,
      params.organizationId != null ? Number(params.organizationId) : null,
      params.fileName,
      params.mimeType,
      params.buffer.length,
      storagePath,
      // Digest of the bytes actually written, so a later read can prove the
      // file on disk is still this one.
      sha256Hex(params.buffer),
    ],
  );

  logger.info('derived upload saved', { fileId, bytes: params.buffer.length });
  return { fileId, storagePath };
}
