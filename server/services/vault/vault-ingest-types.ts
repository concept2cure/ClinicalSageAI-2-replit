/** Public types of the existing canonical Vault admission service. */
import type { RequestSqlClient } from '../../db/requestDb.js';
import type { Queryable } from './document-catalog.service.js';
import type { UploadOrigin } from '../../middleware/uploadSafety.js';
import type { ReuploadChange, ReuploadDiffer } from './vault-reupload.js';

/** Everything the governed ingest needs, independent of how it was requested. */
export interface VaultIngestArgs {
  organizationId: number | string | null | undefined;
  userId: number | null;
  programId: string;
  documentCode: string;
  documentTitle: string;
  documentType: string;
  version?: string;
  classification?: string;
  retentionPolicy?: string;
  /**
   * Check in the next version of an existing document (VR-08): the id of one of
   * its versions. The server finds the current head, keeps its document code
   * and filing, assigns the next version and links the predecessor
   * (vault-version-checkin.ts). `version` and a filing are not accepted with it.
   * Lineage is never taken from a caller any other way.
   */
  supersedesDocumentId?: string;
  /**
   * Server-owned: these bytes are an earlier version's, restored as the next
   * version (MR-08 Stage 5, `vault-version-restore.ts`). Only with
   * `supersedesDocumentId`. The check-in admits bytes the document already
   * holds only because they are this version's, and the audit row names it and
   * the person's reason. Never taken from a request body.
   */
  restoreOf?: { versionId: string; version: string; reason: string };
  /**
   * The caller lets the Vault number versions: a typed version is refused for
   * a document code that already has one (vault-ingest.service.ts
   * typedVersionRefusal). The upload route sets it; services with their own
   * numbering do not.
   */
  numberedByVault?: boolean;
  folderId?: string;
  evidenceKind?: string;
  ctdSection?: string;
  fileBuffer: Buffer;
  fileName: string;
  mimeType: string;
  /** Carried into the Part 11 audit row; a tool call has neither. */
  ipAddress?: string;
  userAgent?: string;
  /**
   * Where the bytes came from. Defaults to 'upload', which is every HTTP
   * ingest — the route's schema has no such field, so nothing a client sends
   * can reach it. 'platform-generated' is for bytes this process produced
   * itself (the official FDA eSTAR retained after an export); see the Origin
   * note in middleware/uploadSafety.
   */
  origin?: UploadOrigin;
  /**
   * The data-room capture these bytes were filed from (VR-11a, VR-16b). Named
   * in the ingest's audit row, so the chain links the capture to the Vault
   * document it became. Set only by vault-data-room-filing.ts.
   */
  dataRoomSourceId?: number;
  /** Server-owned provenance for an explicit byte-preserving company-library copy. */
  companyLegalSource?: { registryId: string; vaultDocumentId: string; contentHash: string; reason: string };
  /** Server-owned request executor; existing generated-file callers choose the tenant pool. */
  executor?: Queryable & { connect(): Promise<Queryable & { release(): void }> };
  /** Source admission is independent of target permission. Commit runs inside BEGIN,
   * before ingest child locks, so the caller can reserve the exact source identity. */
  assertSourceAccess?: (q: RequestSqlClient, phase: 'preview' | 'commit') => Promise<void>;
}

export interface VaultIngestFiling {
  view: string;
  folderId: string | null;
  folderLabel: string | null;
  evidenceKind: string | null;
  ctdSection: string | null;
  placementStatus: string;
  confidence: string | null;
  rationale: string | null;
  needsReview: boolean;
}

export type VaultIngestResult =
  | {
      ok: true;
      /** Creation is proven only by the UUID this admission attempted to insert. */
      admission: { created: boolean };
      document: {
        id: string;
        programId: string;
        documentCode: string;
        documentTitle: string;
        documentType: string;
        version: string;
        fileName: string;
        fileSize: number;
        mimeType: string;
        contentHash: string;
        processingStatus: string;
        hasExtractedText: boolean;
        /** Whether the text was read, is still being read (MR-08 Stage 3), or could not be. */
        extraction: 'extracted' | 'pending' | 'failed';
        wordCount: number | null;
        createdAt: string;
        updatedAt: string;
      };
      filing: VaultIngestFiling;
      /** Present when these bytes were already recorded here (vault-reupload.ts). */
      reupload?: { unchanged: boolean; changes: ReuploadChange[]; differs: ReuploadDiffer[] };
    }
  /** VERSION_CONTENT_CONFLICT: the current version at that code, which a check-in adds to. */
  | { ok: false; status: number; code: string; message: string; headDocumentId?: string; headVersion?: string };
