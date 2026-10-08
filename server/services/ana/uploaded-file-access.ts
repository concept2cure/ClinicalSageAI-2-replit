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
import { capturedDataEligibleSql, uploadedBinaryAvailableSql } from '../document-data-disposition/eligibility.js';
import type { SpreadsheetEdit } from '../documentIntelligence/spreadsheetService.js';
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

/**
 * Why an upload could not be loaded, for a caller that reports per item rather
 * than relaying a thrown message (the data room's "File into Vault", VR-11).
 * The messages are the ones this module always threw; only the code is new.
 *
 *   UPLOAD_NOT_FOUND         — unknown, or another tenant's (indistinguishable on purpose).
 *   UPLOAD_BYTES_MISSING     — the row exists but its bytes are gone.
 *   UPLOAD_INTEGRITY_FAILED  — the bytes no longer match the digest recorded on receipt.
 */
export type UploadedFileErrorCode = 'UPLOAD_NOT_FOUND' | 'UPLOAD_BYTES_MISSING' | 'UPLOAD_INTEGRITY_FAILED';

export class UploadedFileError extends Error {
  readonly code: UploadedFileErrorCode;
  constructor(code: UploadedFileErrorCode, message: string, options?: { cause?: unknown }) {
    super(message, options);
    this.name = 'UploadedFileError';
    this.code = code;
  }
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
  /** The SHA-256 recorded at upload (file_uploads.checksum_sha256); null for rows that predate it. */
  checksumSha256: string | null;
}

/**
 * True when `storagePath` is the "no proven owner" form: uploads written
 * without an authenticated org (`uploads/unscoped/…`) and pre-tenancy flat rows
 * (`uploads/file_*`).
 */
function isUnscopedPath(storagePath: string): boolean {
  if (storagePath.startsWith('uploads/unscoped/')) {
    return resolvesWithinUploadNamespace(storagePath, 'unscoped');
  }
  return /^uploads\/file_[^/]+$/.test(storagePath) && resolvesWithinUploadNamespace(storagePath, '');
}

/**
 * Lexical containment after resolving dot segments, shared by metadata and
 * byte readers. A raw org prefix alone accepts org-7/../org-9; the resolved
 * path must be a CHILD of its permitted namespace, not the directory itself.
 * This does not resolve symlinks or guarantee filesystem immutability.
 */
function resolvesWithinUploadNamespace(storagePath: string, namespace: string): boolean {
  const directory = path.resolve(uploadsRoot(), namespace);
  const resolved = path.resolve(process.cwd(), storagePath);
  return resolved.startsWith(directory + path.sep);
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
  if (!resolvesWithinUploadNamespace(storagePath, `org-${Number(organizationId)}`)) return false;
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
    checksum_sha256: string | null;
  }>(
    `SELECT id, original_name, mime_type, storage_path, organization_id, checksum_sha256
       FROM file_uploads f WHERE id = ANY($1) AND ${uploadedBinaryAvailableSql('f')}`,
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
    checksumSha256: row.checksum_sha256 ?? null,
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
       FROM file_uploads f WHERE id = $1 AND ${uploadedBinaryAvailableSql('f')}`,
    [fileId],
  );
  if (rows.length === 0) {
    throw new UploadedFileError('UPLOAD_NOT_FOUND', `upload "${fileId}" not found`);
  }
  const row = rows[0];
  const storagePath = row.storage_path || '';

  if (!rowBelongsToOrg(row, organizationId)) {
    // Same response as "not found" — don't confirm a foreign tenant's file exists.
    logger.warn('tenant-scoped upload access denied', { fileId, orgId: organizationId ?? null });
    throw new UploadedFileError('UPLOAD_NOT_FOUND', `upload "${fileId}" not found`);
  }

  const resolved = path.resolve(process.cwd(), storagePath);
  assertWithinUploads(resolved);
  let buffer: Buffer;
  try {
    buffer = await fs.readFile(resolved);
  } catch (err) {
    throw new UploadedFileError(
      'UPLOAD_BYTES_MISSING',
      `upload "${fileId}" exists but its bytes are no longer available — ask the user to re-upload the file`,
      { cause: err },
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
      throw new UploadedFileError(
        'UPLOAD_INTEGRITY_FAILED',
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
export interface DerivedUploadParams {
  buffer: Buffer;
  fileName: string;
  mimeType: string;
  organizationId?: number | null;
  userId?: number | null;
  /** Only the confirmed spreadsheet-edit handler supplies this, from the
   * verified source bytes and the active session context, never a chosen org. */
  derivation?: {
    sourceFileId: string;
    sourceSha256: string;
    edits: SpreadsheetEdit[];
    createdSheets: string[];
    projectRef?: string | null;
    projectId?: number | null;
  };
}

export interface DerivedUploadResult {
  fileId: string;
  storagePath: string;
  sourceId?: number | null;
  captureStatus?: 'captured' | 'conversation_only';
  derivationAudit?: { resourceType: 'file_upload'; resourceId: string };
}

export async function saveDerivedUpload(params: DerivedUploadParams): Promise<DerivedUploadResult> {
  const fileId = `file_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
  const orgSegment =
    params.organizationId != null ? `org-${Number(params.organizationId)}` : 'unscoped';
  const storagePath = `uploads/${orgSegment}/${fileId}`;

  const resolved = path.resolve(process.cwd(), storagePath);
  assertWithinUploads(resolved);
  if (params.derivation) return saveSpreadsheetDerivation(params, fileId, storagePath, resolved);
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

function verifiedDerivation(params: DerivedUploadParams) {
  const derivation = params.derivation!;
  const orgId = params.organizationId;
  const userId = params.userId;
  if (orgId == null || !Number.isSafeInteger(orgId) || orgId <= 0 ||
      userId == null || !Number.isSafeInteger(userId) || userId <= 0) {
    throw new Error('A spreadsheet derivation needs an identified tenant and user actor.');
  }
  if (!derivation.sourceFileId || !/^[a-f0-9]{64}$/.test(derivation.sourceSha256) || !derivation.edits.length) {
    throw new Error('A spreadsheet derivation requires its source file, SHA-256 and applied edits.');
  }
  if (!/\.xlsx$/i.test(params.fileName) || params.mimeType !== 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet') {
    throw new Error('An edited workbook is saved as .xlsx, including when the source was CSV.');
  }
  return { derivation, orgId, userId };
}

function assertDerivedSourceCurrent(
  current: { storage_path: string; checksum_sha256: string | null } | undefined,
  source: UploadedFile, sourceSha256: string,
) {
  if (!current || current.storage_path !== source.storagePath ||
      (source.integrity === 'verified' && current.checksum_sha256 !== sourceSha256) ||
      (current.checksum_sha256 != null && current.checksum_sha256 !== sourceSha256)) {
    throw new Error('The source is no longer available or its identity changed. Nothing was saved.');
  }
}

/** Preserve the edited copy's lineage in the existing audit/capture stores.
 * This is capture, not extraction, recalculation, qualification or filing.
 * Original uploads and sources are never mutated or automatically superseded. */
async function saveSpreadsheetDerivation(
  params: DerivedUploadParams, fileId: string, storagePath: string, resolved: string,
): Promise<DerivedUploadResult> {
  const { derivation, orgId, userId } = verifiedDerivation(params);
  // Re-read through the one scoped, integrity-checked loader rather than trust
  // a caller-supplied filename, path, hash, or tenant association.
  const source = await loadUploadedFile(derivation.sourceFileId, orgId);
  if (sha256Hex(source.buffer) !== derivation.sourceSha256) {
    throw new Error('The source digest changed since this workbook was edited. Read it again before editing.');
  }

  const [{ getPool }, { resolveOpenProgram }, { lockDocumentDispositionProgram }, { createSource }, { writeChainedAuditRow }] = await Promise.all([
    import('../../db.js'), import('../c2c/program-access.js'),
    import('../document-data-disposition/program-lock.js'),
    import('../clinical-regulatory-evidence/evidence-spine.service.js'), import('../auditService'),
  ]);
  const client = await getPool().connect();
  let bytesWritten = false;
  let commitAttempted = false;
  try {
    await client.query('BEGIN');
    const programId = await resolveOpenProgram(client, { organizationId: orgId, projectRef: derivation.projectRef, projectId: derivation.projectId });
    const requestedProject = Boolean(derivation.projectRef?.trim()) || derivation.projectId != null;
    if (requestedProject && !programId) throw new Error('The requested project could not be resolved in this organization. Nothing was saved.');
    if (programId) await lockDocumentDispositionProgram(client, orgId, programId);
    await client.query("SET LOCAL lock_timeout = '5s'");
    // Upload eligibility is organisation-wide, not only the destination
    // project. Reserve the tables this transaction will mutate BEFORE its
    // eligibility read, in disposition.apply's impact-lock order. Its SHARE
    // locks then serialize withdrawals even across projects/no-project edits.
    // A dispositions-table lock first would invert that order and deadlock.
    await client.query('LOCK TABLE public.cre_evidence_sources, public.file_uploads IN ROW EXCLUSIVE MODE');
    const eligible = await client.query(
      `SELECT f.id, f.checksum_sha256, f.storage_path FROM file_uploads f
        WHERE f.id = $1 AND f.organization_id = $2 AND ${uploadedBinaryAvailableSql('f')} FOR SHARE OF f`,
      [source.fileId, orgId],
    );
    assertDerivedSourceCurrent(eligible.rows[0], source, derivation.sourceSha256);
    const parents = programId ? await client.query(
      `SELECT s.id FROM cre_evidence_sources s WHERE s.organization_id = $1 AND s.client_program_id = $2
        AND s.source_type = 'client_document' AND s.is_current = TRUE AND s.deleted_at IS NULL
        AND s.provenance->>'fileUploadId' = $3 AND s.checksum = $4 AND ${capturedDataEligibleSql('s')} ORDER BY s.id`,
      [orgId, programId, source.fileId, derivation.sourceSha256],
    ) : { rows: [] };
    const parentSourceIds = parents.rows.map(r => Number(r.id));
    const checksum = sha256Hex(params.buffer);
    await fs.mkdir(path.dirname(resolved), { recursive: true });
    await fs.writeFile(resolved, params.buffer);
    bytesWritten = true;
    await client.query(
      `INSERT INTO file_uploads (id, user_id, organization_id, original_name, mime_type, file_size, storage_path, checksum_sha256, status, created_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, 'uploaded', NOW())`,
      [fileId, userId, orgId, params.fileName, params.mimeType, params.buffer.length, storagePath, checksum],
    );
    const captured = programId ? await createSource(orgId, {
      sourceType: 'client_document', visibilityClass: 'project_private', clientProgramId: programId,
      title: params.fileName, storedArtifactRef: storagePath, checksum, createdBy: userId,
      ingestionStatus: 'ingested', extractionStatus: 'pending',
      provenance: {
        origin: 'spreadsheet_edit', fileUploadId: fileId, storagePath, uploadedByUserId: userId,
        derivedFromFileId: source.fileId, derivedFromSha256: derivation.sourceSha256,
        sourceIntegrity: source.integrity, parentSourceIds,
      },
      metadata: { originalName: params.fileName, mimeType: params.mimeType, fileSize: params.buffer.length,
        scientificQualification: 'unassessed', formulaResults: 'not_recalculated' },
    }, client) : null;
    const sourceId = captured ? captured.id : null;
    await writeChainedAuditRow(client, {
      tenantId: orgId, userId, action: 'file_upload.derived', resourceType: 'file_upload', resourceId: fileId,
      details: {
        operation: 'spreadsheet_edit', sourceFileId: source.fileId, sourceSha256: derivation.sourceSha256,
        sourceIntegrity: source.integrity, fileId, checksumSha256: checksum, programId,
        sourceId, parentSourceIds, edits: derivation.edits, createdSheets: derivation.createdSheets,
        scientificQualification: 'unassessed', formulaResults: 'not_recalculated',
      },
    });
    commitAttempted = true;
    await client.query('COMMIT');
    if (captured) await (await import('../clinical-regulatory-evidence/data-room-processing.js')).processCapturedSource(orgId, captured.id, { bytes: params.buffer, fileName: params.fileName, mimeType: params.mimeType, programId, processedBy: 'spreadsheet_edit' });
    return { fileId, storagePath, sourceId,
      captureStatus: captured ? 'captured' : 'conversation_only',
      derivationAudit: { resourceType: 'file_upload', resourceId: fileId } };
  } catch (err) {
    await client.query('ROLLBACK').catch(() => undefined);
    // Only this invocation's new file is eligible for cleanup. An ambiguous
    // COMMIT must retain bytes, since a committed capture may already name them.
    if (bytesWritten && !commitAttempted) {
      await fs.unlink(resolved).catch(cleanupErr => logger.warn('derived upload cleanup failed', { fileId, error: String(cleanupErr) }));
    }
    throw err;
  } finally {
    client.release();
  }
}
