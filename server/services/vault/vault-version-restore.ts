/**
 * Restore an earlier version of a Vault document as its next version (MR-08
 * Stage 5 step 2, CAT1-04, docs/work-orders/MR-08-vault-upload-safety-and-document-control.md).
 *
 * A version is a write-once row, so going back means adding one. A person who
 * wanted version 1 back had no way to: uploading its bytes again is refused
 * CONTENT_ALREADY_A_VERSION, because the document already holds them, and no
 * route restored a version. Restoring checks those exact bytes in again as the
 * next version, through the one ingest:
 *   - the source's stored file is read through the verified reader, and one
 *     that no longer matches its recorded hash is refused, never restored;
 *   - ingest stores the bytes as a new object (so every row keeps its own
 *     stored file), scans them, reads their text, keeps the document's filing
 *     and title, and writes the version and its chained audit row together;
 *   - the audit row names the version restored and the person's reason;
 *   - the new version has no review record of its own yet: an approval never
 *     travels with bytes (FD4).
 */
import type { RequestSqlClient } from '../../db/requestDb.js';
import { pool } from '../../db.js';
import { ProgramReadAccessError } from '../c2c/current-program-access.js';
import { currentVersionOfCode } from './vault-version-checkin.js';
import { ingestVaultDocument } from './vault-ingest.service.js';
import { requireGovernedReason } from '../../routes/governed-reason.js';
import type { VaultIngestResult } from './vault-ingest-types.js';

const NOTHING = 'Nothing was saved.';
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export interface RestoreVaultVersionArgs {
  organizationId: number;
  userId: number | null;
  programId: string;
  /** Any version of the document, as the versions panel names it. */
  documentId: string;
  /** The earlier version whose bytes become the next version. */
  versionId: string;
  /** The person's reason, held to the governed floor and recorded in the audit row. */
  reason: unknown;
  ipAddress?: string;
  userAgent?: string;
}

interface SourceRow {
  id: string; document_code: string; version: string; content_hash: string; file_name: string | null;
  mime_type: string | null; document_type: string | null; storage_version_id: string | null;
  s3_key: string | null; storage_provider: string | null;
}

type Refusal = Extract<VaultIngestResult, { ok: false }>;
const refuse = (status: number, code: string, message: string): Refusal => ({ ok: false, status, code, message });

/** The version to restore, if it is a live version of the named document in this program. */
async function readSource(q: RequestSqlClient, args: RestoreVaultVersionArgs): Promise<SourceRow | null> {
  const { rows } = await q.query(
    `SELECT s.id::text AS id, s.document_code, s.version, s.content_hash, s.file_name, s.mime_type, s.document_type,
            s.storage_version_id, s.s3_key, s.storage_provider
       FROM vault.documents s
       JOIN vault.documents d ON d.id = $2::uuid AND d.program_id = s.program_id AND d.organization_id = s.organization_id
                             AND d.document_code IS NOT DISTINCT FROM s.document_code AND d.deleted_at IS NULL
      WHERE s.id = $1::uuid AND s.program_id = $3::uuid AND s.organization_id = $4 AND s.deleted_at IS NULL`,
    [args.versionId, args.documentId, args.programId, args.organizationId],
  );
  return (rows[0] as unknown as SourceRow | undefined) ?? null;
}

export async function restoreVaultVersion(args: RestoreVaultVersionArgs): Promise<VaultIngestResult> {
  const notFound = refuse(404, 'VERSION_NOT_FOUND', `That version is not a version of this document in this project. ${NOTHING}`);
  const reason = requireGovernedReason(args.reason);
  if (!reason.ok) return refuse(422, 'REASON_REQUIRED', reason.error);
  if (!UUID_RE.test(args.versionId) || !UUID_RE.test(args.documentId) || !UUID_RE.test(args.programId)) return notFound;
  const source = await readSource(pool, args);
  if (!source) return notFound;
  const head = await currentVersionOfCode(pool, {
    organizationId: args.organizationId, programId: args.programId, documentCode: source.document_code,
  });
  if (!head) return refuse(409, 'VERSION_NOT_CURRENT', `The current version of this document could not be identified. ${NOTHING}`);
  if (head.id === source.id) return refuse(409, 'ALREADY_CURRENT', `Version ${source.version} is already the current version. ${NOTHING}`);
  // The document's title is the current version's; the bytes are the earlier one's.
  const title = (await pool.query(
    `SELECT document_title FROM vault.documents WHERE id = $1::uuid AND program_id = $2::uuid AND organization_id = $3`,
    [head.id, args.programId, args.organizationId],
  )).rows[0]?.document_title;
  const { readVerifiedVaultBytes } = await import('../../routes/c2c/project-vault.js');
  const read = await readVerifiedVaultBytes({
    storageVersionId: source.storage_version_id, storageKey: source.s3_key, storageProvider: source.storage_provider,
    organizationId: args.organizationId,
  }, source.content_hash, source.id);
  if (!read.ok) {
    return refuse(409, 'SOURCE_BYTES_UNVERIFIED',
      `The stored file of version ${source.version} does not match what was recorded for it, so it cannot be restored. ${NOTHING}`);
  }
  return ingestVaultDocument({
    organizationId: args.organizationId,
    userId: args.userId,
    programId: args.programId,
    supersedesDocumentId: head.id,
    documentCode: source.document_code,
    documentTitle: String(title ?? source.file_name ?? 'document'),
    documentType: source.document_type ?? 'OTHER',
    fileBuffer: read.bytes,
    fileName: source.file_name ?? 'document',
    mimeType: source.mime_type ?? 'application/octet-stream',
    restoreOf: { versionId: source.id, version: source.version, reason: reason.reason },
    ipAddress: args.ipAddress,
    userAgent: args.userAgent,
    // Under the ingest's transaction: the version restored is still a live
    // version holding those bytes, so a version retired meanwhile is not.
    assertSourceAccess: async (client, phase) => {
      if (phase !== 'commit') return;
      const live = await client.query(
        `SELECT 1 FROM vault.documents WHERE id = $1::uuid AND program_id = $2::uuid AND organization_id = $3
            AND content_hash = $4 AND deleted_at IS NULL FOR SHARE`,
        [source.id, args.programId, args.organizationId, source.content_hash],
      );
      if (!live.rows[0]) throw new ProgramReadAccessError(409, 'RESTORE_SOURCE_CHANGED', `Version ${source.version} was retired while it was being restored. ${NOTHING}`);
    },
  });
}
