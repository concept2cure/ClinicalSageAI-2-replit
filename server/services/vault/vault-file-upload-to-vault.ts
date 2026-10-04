/**
 * File an upload into a program's Vault. This is the ONE orchestration from a
 * `file_uploads` row to a governed Vault document (VR-11, row D2).
 *
 * Two callers file an upload that is not yet in the Vault:
 *   - AnA's file_chat_upload_to_vault (server/services/ana/document-catalog-tools.ts);
 *   - the data room's "File into Vault" (POST /api/c2c/project-vault/:id/data-room/file,
 *     through vault-data-room-filing.ts).
 * Until VR-11 the orchestration was private to the AnA tool, and the data room
 * had no way to file at all. Both callers now call this, so the load, the
 * byte check and the admission cannot drift apart.
 *
 * The admission is ingestVaultDocument, the same governed ingest a Vault
 * upload uses: role, vocabulary, program ownership, signature and antivirus,
 * one transaction with its chained audit row. Without a named folder the
 * classifier proposes one, so the document lands suggested or unfiled and is
 * never confirmed by a machine.
 *
 * `capturedChecksum` is the digest recorded when the bytes were captured
 * (`cre_evidence_sources.checksum`). Bytes that no longer hash to it are
 * refused SOURCE_BYTES_CHANGED before anything is stored, so the data room
 * cannot launder changed bytes into the Vault under a capture's name.
 *
 * Must be called inside the acting organization's tenant scope, like the
 * ingest it calls.
 */
import { createHash } from 'node:crypto';
import { loadUploadedFile, UploadedFileError, type UploadedFile } from '../ana/uploaded-file-access.js';
import { ingestVaultDocument, type VaultIngestResult } from './vault-ingest.service.js';

export interface FileUploadIntoVaultArgs {
  organizationId: number;
  userId: number | null;
  programId: string;
  /** The `file_uploads` id the bytes live under. */
  fileId: string;
  documentTitle: string;
  documentType: string;
  /** Defaults to a code derived from the file name (derivedDocumentCode). */
  documentCode?: string;
  /** A folder the person named. Without one the classifier proposes a folder. */
  folderId?: string;
  /** The checksum recorded at capture. When given, the loaded bytes must still hash to it. */
  capturedChecksum?: string | null;
  /** The data-room capture being filed, named in the ingest's audit row (VR-16b). */
  dataRoomSourceId?: number;
  ipAddress?: string;
  userAgent?: string;
}

type Refusal = Extract<VaultIngestResult, { ok: false }>;

const UPLOAD_REFUSAL_STATUS: Record<UploadedFileError['code'], number> = {
  UPLOAD_NOT_FOUND: 404,
  UPLOAD_BYTES_MISSING: 410,
  UPLOAD_INTEGRITY_FAILED: 409,
};

/**
 * A stable per-program code derived from the file name when none is given.
 * The ingest upserts on (program, code, version), so filing the same file
 * twice updates one row instead of growing duplicates.
 */
export function derivedDocumentCode(fileName: string, fallback: string): string {
  return (
    fileName
      .replace(/\.[^.]+$/, '')
      .replace(/[^A-Za-z0-9._-]+/g, '-')
      .slice(0, 64) || fallback
  );
}

/** Load the upload's bytes, turning the reader's coded errors into refusals. */
async function loadForFiling(args: FileUploadIntoVaultArgs): Promise<UploadedFile | Refusal> {
  try {
    return await loadUploadedFile(args.fileId, args.organizationId);
  } catch (err) {
    if (!(err instanceof UploadedFileError)) throw err;
    return { ok: false, status: UPLOAD_REFUSAL_STATUS[err.code], code: err.code, message: err.message };
  }
}

function capturedBytesRefusal(file: UploadedFile, capturedChecksum: string | null | undefined): Refusal | null {
  if (capturedChecksum === undefined) return null;
  const recorded = capturedChecksum?.trim().toLowerCase() ?? '';
  if (recorded && createHash('sha256').update(file.buffer).digest('hex') === recorded) return null;
  return {
    ok: false,
    status: 409,
    code: 'SOURCE_BYTES_CHANGED',
    message: recorded
      ? 'The stored file no longer matches the checksum recorded when it was captured. Nothing was filed. Capture the file again.'
      : 'No checksum was recorded when this file was captured, so these bytes cannot be shown to be the ones captured. Nothing was filed. Capture the file again.',
  };
}

/** File one upload into the Vault through the governed ingest. Never throws for a refusal. */
export async function fileUploadIntoVault(args: FileUploadIntoVaultArgs): Promise<VaultIngestResult> {
  const file = await loadForFiling(args);
  if ('ok' in file) return file;
  const changed = capturedBytesRefusal(file, args.capturedChecksum);
  if (changed) return changed;

  return ingestVaultDocument({
    organizationId: args.organizationId,
    userId: args.userId,
    programId: args.programId,
    documentCode: args.documentCode ?? derivedDocumentCode(file.fileName, args.fileId),
    documentTitle: args.documentTitle,
    documentType: args.documentType,
    folderId: args.folderId,
    fileBuffer: file.buffer,
    fileName: file.fileName,
    mimeType: file.mimeType,
    dataRoomSourceId: args.dataRoomSourceId,
    ipAddress: args.ipAddress,
    userAgent: args.userAgent,
  });
}
