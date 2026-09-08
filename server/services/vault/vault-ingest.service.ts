/**
 * The canonical vault ingest — the ONE implementation that admits a document
 * into vault.documents.
 *
 * It was the body of POST /api/vault/ingest, and nothing else could reach it:
 * a file already on the platform (a chat upload) could not be filed into the
 * project vault without a second ingest path, and a second ingest path is
 * exactly what this repository forbids — it would be two answers to "what does
 * it mean for a document to enter the governed corpus", diverging on the
 * Part 11 audit row, the placement proposal, the catalog tier, or the passage
 * index. So the route kept the HTTP (multer, status codes, response shape) and
 * the governed work moved here, where the AnA tool that files a chat upload
 * calls the same function.
 *
 * The order is load-bearing and unchanged:
 *   1. ownership — the acting org must own the program, refused before any write
 *   2. safety — magic bytes + AV, fail-closed
 *   3. bytes to storage — FATAL on failure, because a content hash for bytes
 *      nobody holds is a record that lies
 *   4. extraction — best-effort for admission, but the OUTCOME is always
 *      captured so the catalog can record a failure as a failure
 *   5. placement — an explicit folder is 'confirmed', else the classifier
 *      proposes, else visibly 'unfiled'
 *   6. INSERT + catalog tier + hash-chained audit row, in ONE transaction
 *   7. passage index, post-commit and awaited
 *
 * TENANT SCOPE. This function does not open one: it assumes the caller is
 * already inside the acting organization's scope (`runWithTenantScope`), which
 * is what `pool` requires under RLS_ENFORCE=on. The route re-enters the scope
 * multer destroyed and wraps the whole call; the tool runs inside the turn's
 * scope already. Keeping the scope at the callers means there is one span
 * rather than a dozen re-entries, and the reason it is needed stays where the
 * thing that destroys it lives.
 *
 * Failures are RETURNED, never thrown: `{ ok: false, status, code, message }`
 * carries the same HTTP status and error code the route has always sent, so
 * the client contract is unchanged and the tool gets a reason it can say out
 * loud.
 *
 * @module server/services/vault/vault-ingest.service
 */

import path from 'node:path';
import { promises as fs } from 'node:fs';
import { createHash } from 'node:crypto';
import { pool } from '../../db.js';
import { createScopedLogger } from '../../utils/logger.js';
import { assertUploadSafe, UploadSafetyError, type UploadOrigin } from '../../middleware/uploadSafety.js';
import { writeChainedAuditRow } from '../auditService.js';
import {
  classifyForFiling,
  resolveVaultView,
  isFolderInView,
  folderLabel,
} from './vault-filing.service.js';

const logger = createScopedLogger('vault-ingest');

function sha256Bytes(buf: Buffer): string {
  return createHash('sha256').update(buf).digest('hex');
}

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
  parentDocumentId?: string;
  supersedesId?: string;
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
        wordCount: number | null;
        createdAt: string;
        updatedAt: string;
      };
      filing: VaultIngestFiling;
    }
  | { ok: false; status: number; code: string; message: string };

/**
 * Admit a document into the governed vault. Must be called inside the acting
 * organization's tenant scope (see the module header).
 */
export async function ingestVaultDocument(args: VaultIngestArgs): Promise<VaultIngestResult> {
  // Tenant ownership guard. `vault.documents` now carries organization_id
  // (migrations/20260905_vault_documents_organization_id.sql), and the INSERT
  // below writes it — the retrieval path filters on it, so a row left NULL is
  // an orphan no tenant can retrieve. This check is what makes writing it
  // safe: the canonical org→program mapping is `regulatory_programs` (uuid
  // id, integer organization_id), and a caller who does not own the program
  // is refused here before any row is written.
  const rawOrg = args.organizationId;
  const orgId = Number(rawOrg);
  if (rawOrg === undefined || rawOrg === null || rawOrg === '' || Number.isNaN(orgId)) {
    return { ok: false, status: 403, code: 'NO_ORG_CONTEXT',
      message: 'An authenticated organization context is required to ingest documents.' };
  }
  try {
    const owns = await pool.query(
        `SELECT 1 FROM regulatory_programs WHERE id = $1 AND organization_id = $2 LIMIT 1`,
      [args.programId, orgId],
    );
    if (owns.rowCount === 0) {
      logger.warn('Vault ingest denied: program not owned by caller organization', {
        programId: args.programId,
        orgId,
      });
      return { ok: false, status: 403, code: 'PROGRAM_FORBIDDEN',
        message: 'Program not found or not owned by your organization.' };
    }
  } catch (ownErr: any) {
    logger.error('Vault ingest program-ownership check failed', { err: ownErr?.message });
    return { ok: false, status: 500, code: 'OWNERSHIP_CHECK_FAILED',
      message: 'Could not verify program ownership.' };
  }

  const fileName = args.fileName || 'document';
  const mimeType = args.mimeType || 'application/octet-stream';
  const fileSize = args.fileBuffer.length;
  const userId = args.userId ?? null;

  // Magic-byte signature + AV, via the shared helper.
  //
  // This route used to call verifyFileSignature and scanBuffer directly. The
  // signature half was equivalent; the AV half was not. scanBuffer fails OPEN
  // by design — with CLAMAV_HOST unset or clamd unreachable it returns
  // { scanned: false, clean: true } so dev and CI work without the infra — and
  // this handler only ever checked `clean`. A production deployment with no
  // reachable scanner therefore admitted every file while logging nothing.
  // assertUploadSafe is where the fail-closed policy lives: it rejects 503
  // when the scan did not actually run. Its two error codes are the same two
  // this handler returned by hand, so the client contract is unchanged apart
  // from that new 503.
  try {
    await assertUploadSafe(args.fileBuffer, mimeType, fileName, { origin: args.origin ?? 'upload' });
  } catch (err) {
    if (err instanceof UploadSafetyError) {
      return { ok: false, status: err.status, code: err.code, message: err.message };
    }
    throw err;
  }

  const contentHash = sha256Bytes(args.fileBuffer);

  // Tenant-scoped local storage path (mirrors chat upload pattern)
  const storagePath = `uploads/vault/${args.programId}/${contentHash}${path.extname(fileName)}`;
  const s3Key = storagePath; // local-mode: key == path
  const s3Bucket = 'local';  // no S3 configured; downstream can migrate later

  /* Writing the bytes is NOT best-effort, and treating it as such was the
     worst thing this route did.
     The failure was caught, logged at warn, and execution fell through to the
     INSERT below — so a `vault.documents` row was committed carrying a
     `content_hash` and an `s3_key` for bytes that are not on disk. The row
     looks indistinguishable from a good one: the hash is real, it is the
     correct SHA-256 of the file the user chose. It just refers to nothing.
     The user is told the upload succeeded, the document appears in the vault,
     and the absence surfaces whenever someone later tries to retrieve the
     artifact a submission depends on.
     A rejected upload is recoverable. A hash for bytes nobody has is a record
     that lies, so this fails the request instead. */
  try {
    const resolved = path.resolve(process.cwd(), storagePath);
    await fs.mkdir(path.dirname(resolved), { recursive: true });
    await fs.writeFile(resolved, args.fileBuffer);
  } catch (err) {
    logger.error('Vault file persistence failed — refusing to record the document', {
      reason: err instanceof Error ? err.message : 'unknown',
      contentHash,
    });
    return { ok: false, status: 500, code: 'STORAGE_WRITE_FAILED',
      message: 'The document could not be stored. Nothing was recorded — try again.' };
  }

  // Text extraction (best-effort for the upload itself — the document is
  // still admitted — but the OUTCOME is captured either way, so a failure
  // can be recorded in the catalog as a failure rather than surfacing later
  // as a document that merely looks empty).
  let extractedText: string | null = null;
  const pageCount: number | null = null;
  let wordCount: number | null = null;
  let extractionMethod = 'none';
  let extractionConfidence: number | undefined;
  let extractionError: string | null = null;
  try {
    const { extractDocumentText } = await import('../ocr/index.js');
    const extracted = await extractDocumentText(args.fileBuffer, mimeType, fileName);
    extractionMethod = extracted.method;
    extractionConfidence = extracted.confidence;
    if (extracted.text && extracted.text.trim().length > 0) {
      extractedText = extracted.text;
      wordCount = extracted.text.trim().split(/\s+/).length;
      logger.info('Vault ingest text extracted', { chars: extracted.text.length, wordCount });
    }
  } catch (extractErr: any) {
    extractionError = extractErr?.message ?? 'unknown extraction error';
    logger.warn('Vault ingest text extraction failed (non-fatal)', { err: extractErr?.message });
  }

  // Catalog participation is a tenant-scoped rollout; resolved before the
  // transaction (FeatureToggleService reads its own connection).
  const { isDocumentCatalogEnabled, recordExtractionOutcome, buildExtractionOutcome } =
    await import('./document-catalog.service.js');
  const catalogEnabled = await isDocumentCatalogEnabled(orgId);
  // Passage chunking rides on the catalog (its outcome ledger lives there).
  const { isVaultChunkingEnabled, chunkDocumentForIngest } =
    await import('./document-chunking.service.js');
  const chunkingEnabled =
    catalogEnabled && (await isVaultChunkingEnabled(orgId));

  /* ── Dossier filing ──────────────────────────────────────────────────────
     Every ingested document gets a PLACEMENT against the program's vault
     folder taxonomy (the auto-filing pipeline: capture → classify → file).
     When the uploader named an explicit folder it is validated against the
     program's view and recorded as 'confirmed' — a person chose it. When
     not, the deterministic classifier proposes ('suggested', with confidence
     and rationale), and a file the rules cannot place stays visibly
     'unfiled'. The proposal never overwrites documentType — a filename is
     not grounds to change a regulatory type field (see useVaultUpload). */
  const vaultView = await resolveVaultView(args.programId, orgId);
  let placement: {
    folderId: string | null;
    evidenceKind: string | null;
    ctdSection: string | null;
    status: 'unfiled' | 'suggested' | 'confirmed';
    confidence: string | null;
    rationale: string;
    placedBy: number | null;
    needsReview: boolean;
  };
  if (args.folderId) {
    if (!isFolderInView(vaultView, args.folderId)) {
      return { ok: false, status: 400, code: 'INVALID_FOLDER',
        message: `Folder '${args.folderId}' does not exist in this program's ${vaultView} vault taxonomy.` };
    }
    placement = {
      folderId: args.folderId,
      evidenceKind: args.evidenceKind ?? null,
      ctdSection: args.ctdSection ?? null,
      status: 'confirmed',
      confidence: null,
      rationale: 'Filed by the uploader at ingest.',
      placedBy: userId,
      needsReview: false,
    };
  } else {
    const classified = classifyForFiling({
      fileName,
      title: args.documentTitle,
      mimeType,
      extractedText,
      view: vaultView,
    });
    placement = {
      folderId: classified.folderId,
      evidenceKind: classified.evidenceKind,
      ctdSection: classified.ctdSection,
      status: classified.folderId ? 'suggested' : 'unfiled',
      confidence: classified.confidence,
      rationale: classified.rationale,
      placedBy: null,
      needsReview: classified.needsReview,
    };
  }

  /* INSERT into vault.documents, and the Part 11 audit row, in ONE transaction.
     The route previously ran a bare autocommit INSERT on this client and wrote
     no audit row at all — on the ingestion path for a vault whose own surface
     advertises "21 CFR Part 11 audit trail · SHA-256 chained". A document
     entered the regulated corpus leaving no record of who put it there.
     The transaction is what makes the pair atomic: `writeChainedAuditRow`
     takes `FOR UPDATE` on the chain tip and deliberately does not manage its
     own BEGIN/COMMIT, so the audit entry and the document it describes commit
     together or not at all. */
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    // tenant-isolation-safe: vault.documents is program-scoped (program_id, no
    // org_id column); the caller's ownership of args.programId was already
    // enforced above against regulatory_programs.organization_id (403 on
    // mismatch), so this write is confined to a program the acting org owns.
    const result = await client.query(
      `INSERT INTO vault.documents (
        program_id, document_code, document_title, document_type,
        version, s3_bucket, s3_key, file_name, file_size, mime_type,
        content_hash, classification, retention_policy,
        parent_document_id, supersedes_id,
        extracted_text, page_count, word_count,
        folder_id, evidence_kind, ctd_section,
        placement_status, placement_confidence, placement_rationale,
        placed_by, placed_at,
        processing_status, created_by, organization_id
      ) VALUES (
        $1, $2, $3, $4,
        $5, $6, $7, $8, $9, $10,
        $11, $12, $13,
        $14, $15,
        $16, $17, $18,
        $19, $20, $21,
        $22, $23, $24,
        $25, CASE WHEN $25::integer IS NULL THEN NULL ELSE NOW() END,
        'PENDING', $26, $27
      )
      ON CONFLICT (program_id, document_code, version) DO UPDATE SET
        document_title = EXCLUDED.document_title,
        document_type = EXCLUDED.document_type,
        s3_bucket = EXCLUDED.s3_bucket,
        s3_key = EXCLUDED.s3_key,
        file_name = EXCLUDED.file_name,
        file_size = EXCLUDED.file_size,
        mime_type = EXCLUDED.mime_type,
        content_hash = EXCLUDED.content_hash,
        classification = EXCLUDED.classification,
        retention_policy = EXCLUDED.retention_policy,
        parent_document_id = EXCLUDED.parent_document_id,
        supersedes_id = EXCLUDED.supersedes_id,
        extracted_text = EXCLUDED.extracted_text,
        page_count = EXCLUDED.page_count,
        word_count = EXCLUDED.word_count,
        -- A re-upload of the same (program, code, version) re-proposes ONLY
        -- when nobody has confirmed a placement: a person's filing decision
        -- is never overwritten by a machine suggestion.
        folder_id = CASE WHEN vault.documents.placement_status = 'confirmed'
                         THEN vault.documents.folder_id ELSE EXCLUDED.folder_id END,
        evidence_kind = CASE WHEN vault.documents.placement_status = 'confirmed'
                             THEN vault.documents.evidence_kind ELSE EXCLUDED.evidence_kind END,
        ctd_section = CASE WHEN vault.documents.placement_status = 'confirmed'
                           THEN vault.documents.ctd_section ELSE EXCLUDED.ctd_section END,
        placement_status = CASE WHEN vault.documents.placement_status = 'confirmed'
                                THEN 'confirmed' ELSE EXCLUDED.placement_status END,
        placement_confidence = CASE WHEN vault.documents.placement_status = 'confirmed'
                                    THEN vault.documents.placement_confidence ELSE EXCLUDED.placement_confidence END,
        placement_rationale = CASE WHEN vault.documents.placement_status = 'confirmed'
                                   THEN vault.documents.placement_rationale ELSE EXCLUDED.placement_rationale END,
        placed_by = CASE WHEN vault.documents.placement_status = 'confirmed'
                         THEN vault.documents.placed_by ELSE EXCLUDED.placed_by END,
        placed_at = CASE WHEN vault.documents.placement_status = 'confirmed'
                         THEN vault.documents.placed_at ELSE EXCLUDED.placed_at END,
        processing_status = 'PENDING',
        -- Repairs a row that predates the tenant key without ever moving one:
        -- the ownership guard above proved this program belongs to $27.
        organization_id = COALESCE(vault.documents.organization_id, EXCLUDED.organization_id),
        updated_at = NOW()
      -- REFUSE A DESTRUCTIVE OVERWRITE.
      -- Without this predicate the DO UPDATE replaced s3_key, content_hash,
      -- file_size, file_name and extracted_text on the existing row, so
      -- uploading DIFFERENT bytes under the same (program, code, version)
      -- destroyed the governed record of what was admitted. The version
      -- column is free text supplied by the client, defaulting to 1.0, and the
      -- Vault client sends the raw filename as document_code, so that was the
      -- DEFAULT path, not an edge case: uploading Protocol.pdf twice erased
      -- the first.
      -- Restricting the update to a matching hash keeps the idempotent retry
      -- (same bytes, same place — re-runs placement and returns the row) and
      -- turns a genuine conflict into zero RETURNING rows, which the caller
      -- converts to a 409 rather than a silent replacement.
      WHERE vault.documents.content_hash = EXCLUDED.content_hash
      RETURNING id, processing_status, created_at, updated_at,
                folder_id, evidence_kind, ctd_section, placement_status,
                placement_confidence, placement_rationale`,
      [
        args.programId,
        args.documentCode,
        args.documentTitle,
        args.documentType,
        args.version ?? '1.0',
        s3Bucket,
        s3Key,
        fileName,
        fileSize,
        mimeType,
        contentHash,
        args.classification ?? 'INTERNAL',
        args.retentionPolicy ?? null,
        args.parentDocumentId ?? null,
        args.supersedesId ?? null,
        extractedText,
        pageCount,
        wordCount,
        placement.folderId,
        placement.evidenceKind,
        placement.ctdSection,
        placement.status,
        placement.confidence,
        placement.rationale,
        placement.placedBy,
        userId,
        orgId,
      ],
    );

    const doc = result.rows[0];

    /* ON CONFLICT ... DO UPDATE ... WHERE that matches nothing yields no row.
       The record already exists at this (program, code, version) with
       different content, and replacing it would destroy the hash the audit
       trail says was admitted. Refuse, and say what to do: a new version is a
       new record, not an edit of the old one. */
    if (!doc) {
      await client.query('ROLLBACK');
      return {
        ok: false, status: 409, code: 'VERSION_CONTENT_CONFLICT',
        message:
          `A different document is already recorded at code "${args.documentCode}" ` +
          `version "${args.version ?? '1.0'}" for this program. Nothing was changed. ` +
          'Upload it under a new version rather than replacing the existing record.',
      };
    }

    /* The catalog's extraction tier, in the SAME transaction as the document
       row: when cataloging is on, a document cannot enter the corpus with
       its extraction outcome unrecorded. An extraction failure is written AS
       a failure with its reason — the state this catalog exists to make
       visible — and a re-upload with new bytes voids any prior comprehension
       (the service handles that in its upsert). */
    if (catalogEnabled) {
      await recordExtractionOutcome(client, {
        documentId: String(doc.id),
        contentHash,
        outcome: buildExtractionOutcome({
          text: extractedText,
          method: extractionMethod,
          confidence: extractionConfidence,
          error: extractionError,
        }),
        pageCount,
      });
    }

    /* The Part 11 record of the ingestion. `writeChainedAuditRow`, not
       `auditService.logAction` — logAction runs on its own connection and
       SWALLOWS persistence failures, which is the wrong policy for a governed
       event: it would let the document land with the audit entry silently
       missing, which is the state this route was already in.
       `details` carries the content hash, so the audit trail records WHICH
       bytes were admitted, not merely that an upload happened. That is the
       link that makes a later integrity check meaningful. */
    await writeChainedAuditRow(client, {
      tenantId: orgId,
      userId: userId ?? undefined,
      action: 'vault.document.ingest',
      resourceType: 'vault_document',
      resourceId: String(doc.id),
      ipAddress: args.ipAddress,
      userAgent: args.userAgent,
      details: {
        programId: args.programId,
        documentCode: args.documentCode,
        documentTitle: args.documentTitle,
        documentType: args.documentType,
        version: args.version ?? '1.0',
        fileName,
        fileSize,
        mimeType,
        contentHash,
        classification: args.classification ?? 'INTERNAL',
        storageKey: s3Key,
        /* WHERE the document was filed and WHO/WHAT decided — the audit
           trail records the placement decision, not merely that an upload
           happened. A 'suggested' placement is attributed to the classifier
           (with its confidence), a 'confirmed' one to the uploader. */
        filing: {
          view: vaultView,
          folderId: doc.folder_id ?? null,
          evidenceKind: doc.evidence_kind ?? null,
          ctdSection: doc.ctd_section ?? null,
          placementStatus: doc.placement_status,
          confidence: doc.placement_confidence ?? null,
          rationale: doc.placement_rationale ?? null,
        },
      },
    });

    await client.query('COMMIT');

    /* Passage index, post-commit: chunk + embed the extracted text into
       vault.document_chunks — the store the RAG vault corpus reads — and
       record the outcome on the catalog's chunking ledger. Deliberately
       OUTSIDE the transaction (embedding is network work; the document's
       admission must not hinge on it) and awaited (the ledger row must be
       truthful by the time the response reports the ingest). A failure is
       recorded as chunk_failed with its reason, never thrown. */
    if (chunkingEnabled && extractedText) {
      const textForChunks: string = extractedText;
      await chunkDocumentForIngest(String(doc.id), orgId, textForChunks);
    }

    logger.info('Vault document ingested', {
      id: doc.id,
      code: args.documentCode,
      type: args.documentType,
      size: fileSize,
      hasText: !!extractedText,
    });

    return {
      ok: true as const,
      document: {
        id: doc.id,
        programId: args.programId,
        documentCode: args.documentCode,
        documentTitle: args.documentTitle,
        documentType: args.documentType,
        version: args.version ?? '1.0',
        fileName,
        fileSize,
        mimeType,
        contentHash,
        processingStatus: doc.processing_status,
        hasExtractedText: !!extractedText,
        wordCount,
        createdAt: doc.created_at,
        updatedAt: doc.updated_at,
      },
      /* The filing outcome, as stored — the caller renders this so the
         uploader sees WHERE the file landed (or that it needs filing),
         not just that bytes arrived. */
      filing: {
        view: vaultView,
        folderId: doc.folder_id ?? null,
        folderLabel: folderLabel(vaultView, doc.folder_id ?? null),
        evidenceKind: doc.evidence_kind ?? null,
        ctdSection: doc.ctd_section ?? null,
        placementStatus: doc.placement_status,
        confidence: doc.placement_confidence ?? null,
        rationale: doc.placement_rationale ?? null,
        needsReview: doc.placement_status === 'unfiled',
      },
    };
  } catch (err: any) {
    /* Roll back BOTH halves. A failure in the audit write now aborts the
       document row with it — deliberately: an ungoverned document in a
       governed vault is the outcome this route is being fixed to stop
       producing, so it must not be the outcome of a partial failure either. */
    try {
      await client.query('ROLLBACK');
    } catch (rollbackErr: any) {
      logger.error('Vault ingest rollback failed', { err: rollbackErr?.message });
    }
    /* vault.documents carries a SECOND unique constraint that the ON CONFLICT
       clause does not target: idx_vault_documents_program_hash_unique on
       (program_id, content_hash), from db/migrations/044c_gcc_vault_schema.sql:106.
       Uploading the same bytes under a different document_code therefore
       raised an unhandled 23505 and 500'd — the case a user hits first, by
       filing one PDF under two names. It is a refusal, not a server error. */
    if (err?.code === '23505') {
      logger.info('Vault ingest refused: content already recorded in this program', {
        constraint: err?.constraint,
      });
      return {
        ok: false, status: 409, code: 'DUPLICATE_CONTENT',
        message:
          'These exact bytes are already recorded in this program under a different ' +
          'document code. Nothing was changed — file the existing document rather than ' +
          'admitting a second copy of it.',
      };
    }

    logger.error('Vault ingest failed — nothing recorded', { err: err?.message });
    return { ok: false, status: 500, code: 'INGEST_FAILED',
      message: 'The document could not be recorded in the vault. Nothing was saved.' };
  } finally {
    client.release();
  }
}
