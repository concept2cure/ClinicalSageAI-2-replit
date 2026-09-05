/**
 * Vault document ingestion — the write path into vault.documents.
 *
 * Accepts a multipart file upload plus regulatory metadata and:
 *   1. Validates the payload (Zod schema)
 *   2. Verifies file bytes (magic-byte signature + ClamAV)
 *   3. Persists the file to local storage (tenant-scoped path) — FATAL on
 *      failure, because a content hash for bytes nobody holds is a record that
 *      lies rather than a partial success
 *   4. INSERTs a vault.documents row and its hash-chained 21 CFR Part 11 audit
 *      entry in one transaction, so a document cannot enter the governed corpus
 *      without a record of who put it there
 *   5. Extracts text via the OCR service and stores it inline
 *   6. Returns the document record for the caller to track
 *
 * Mount: POST /api/vault/ingest
 *
 * Why this exists: prior to this route no production code path ever wrote
 * to vault.documents — documents could not enter the RAG corpus.
 * See DATA_KNOWLEDGE_MEMORY_LAYER_AUDIT.md §3 (GAP 1).
 *
 * NOTE FOR ANY ROUTE THAT PUTS MULTER IN FRONT OF TENANT-SCOPED WORK. Multer
 * parses off the request stream, and an EventEmitter listener runs in the
 * emitting context rather than the registering one, so the AsyncLocalStorage
 * tenant scope opened by `establishRequestTenantScope` is NOT active once the
 * upload middleware resolves. Under `RLS_ENFORCE=on` every subsequent
 * `pool.query` / `pool.connect` then fails closed. This handler re-enters the
 * scope from the identity the middleware published on the request; the other
 * multipart routes in this codebase have the same exposure.
 */

import { Router, type Request, type Response } from 'express';
import multer from 'multer';
import path from 'node:path';
import { promises as fs } from 'node:fs';
import { createHash } from 'node:crypto';
import { z } from 'zod';
import { VAULT_INGEST_DOCUMENT_TYPES } from '../../shared/constants/domain/vault-taxonomy';
import { pool } from '../db';
import { runWithTenantScope } from '../db/tenantStore';
import { createScopedLogger } from '../utils/logger';
import { assertUploadSafe, UploadSafetyError } from '../middleware/uploadSafety';
import { writeChainedAuditRow } from '../services/auditService';
import {
  classifyForFiling,
  resolveVaultView,
  isFolderInView,
  folderLabel,
} from '../services/vault/vault-filing.service';

const logger = createScopedLogger('vault-ingest');

const ALLOWED_EXTENSIONS = new Set([
  '.pdf', '.docx', '.doc', '.txt', '.rtf', '.xlsx', '.xls', '.csv', '.md',
]);
const MAX_FILE_SIZE = 50 * 1024 * 1024; // 50 MB

const upload = multer({
  storage: multer.memoryStorage(),
  fileFilter: (_req, file, cb) => {
    const ext = path.extname(file.originalname).toLowerCase();
    if (ALLOWED_EXTENSIONS.has(ext)) {
      cb(null, true);
    } else {
      cb(new Error(`File type ${ext} is not allowed`));
    }
  },
  limits: { fileSize: MAX_FILE_SIZE },
});

const IngestBodySchema = z.object({
  programId: z.string().uuid('programId must be a UUID'),
  documentCode: z.string().min(1, 'documentCode is required'),
  documentTitle: z.string().min(1, 'documentTitle is required'),
  documentType: z.enum(VAULT_INGEST_DOCUMENT_TYPES),
  version: z.string().optional(),
  classification: z.enum(['CONFIDENTIAL', 'INTERNAL', 'CONTROLLED', 'PUBLIC']).optional(),
  retentionPolicy: z.string().optional(),
  parentDocumentId: z.string().uuid().optional(),
  supersedesId: z.string().uuid().optional(),
  /* Explicit dossier target, when the uploader already knows where the file
     goes. Validated against the program's vault-view taxonomy — an invalid
     folder is a 400, never a silent unfile. Omitted → the filing classifier
     proposes a placement ('suggested') or the file lands visibly Unfiled. */
  folderId: z.string().min(1).optional(),
  evidenceKind: z.string().min(1).optional(),
  ctdSection: z.string().min(1).optional(),
});

function sha256Bytes(buf: Buffer): string {
  return createHash('sha256').update(buf).digest('hex');
}

export default function createVaultIngestRoutes(): Router {
  const router = Router();

  router.post('/', upload.single('file'), async (req: Request, res: Response) => {
    const fileBuffer: Buffer | undefined = (req as any).file?.buffer;
    if (!fileBuffer || fileBuffer.length === 0) {
      return res.status(400).json({
        error: {
          code: 'NO_FILE_RECEIVED',
          message: 'Send the file as multipart/form-data under the field name "file".',
        },
      });
    }

    const parsed = IngestBodySchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({
        error: { code: 'VALIDATION_ERROR', details: parsed.error.format() },
      });
    }
    const data = parsed.data;

    /* RE-ENTER THE TENANT SCOPE MULTER DROPPED.
     *
     * `establishRequestTenantScope` opens an AsyncLocalStorage scope around the
     * rest of the request, and `pool` fails closed without it while
     * `RLS_ENFORCE=on`. Multer breaks that scope: its busboy parse runs off
     * `req`'s stream events, and a plain EventEmitter listener executes in the
     * context of whoever calls `emit` — the socket read — not the context the
     * listener was registered in. So this handler resumes OUTSIDE the scope,
     * and every query from here on fails:
     *
     *   [tenant-rls] FAIL-CLOSED: pool.query requires an active tenant scope
     *
     * which the route reported as a 500 OWNERSHIP_CHECK_FAILED, on every
     * upload, in any environment with enforcement on. Its own comment claimed
     * it "runs on the owner pool connection (RLS-bypassing)" — true when
     * written, untrue since the fail-closed wrapper landed.
     *
     * `req.dbClient` is not the way out either: it is lazy, so its first query
     * calls `pool.connect()`, which fails closed for the same reason.
     *
     * The scope is re-opened here from the identity the middleware already
     * published on the request. This does not widen anything — it restores the
     * exact scope the request was granted, for the span that needs it. Any
     * route that puts multer in front of tenant-scoped work has this problem;
     * see the note in the module header. */
    const tenantScopeId =
      (req as any).tenantId ?? (req as any).tenantContext?.organizationId ?? null;
    const runScoped = <T>(fn: () => Promise<T>): Promise<T> =>
      tenantScopeId == null
        ? fn()
        : runWithTenantScope(
            {
              tenantId: String(tenantScopeId),
              orgUuid: (req as any).tenantContext?.organizationUuid ?? null,
              role: (req as any).userRole ?? (req as any).user?.role ?? null,
              source: 'request',
              caller: 'server/routes/vault-ingest.ts',
            },
            fn,
          );

    // Tenant ownership guard: `vault.documents` has no organization_id column,
    // so nothing at the database layer confines this write to the caller's
    // tenant. The canonical org→program mapping is `regulatory_programs`
    // (uuid id, integer organization_id), and this check is the only thing
    // standing between two tenants until that column exists.
    const authedUser = (req as any).user;
    const rawOrg = authedUser?.organizationId ?? authedUser?.tenantId;
    const orgId = Number(rawOrg);
    if (rawOrg === undefined || rawOrg === null || rawOrg === '' || Number.isNaN(orgId)) {
      return res.status(403).json({
        error: {
          code: 'NO_ORG_CONTEXT',
          message: 'An authenticated organization context is required to ingest documents.',
        },
      });
    }
    try {
      const owns = await runScoped(() =>
        pool.query(
          `SELECT 1 FROM regulatory_programs WHERE id = $1 AND organization_id = $2 LIMIT 1`,
          [data.programId, orgId],
        ),
      );
      if (owns.rowCount === 0) {
        logger.warn('Vault ingest denied: program not owned by caller organization', {
          programId: data.programId,
          orgId,
        });
        return res.status(403).json({
          error: {
            code: 'PROGRAM_FORBIDDEN',
            message: 'Program not found or not owned by your organization.',
          },
        });
      }
    } catch (ownErr: any) {
      logger.error('Vault ingest program-ownership check failed', { err: ownErr?.message });
      return res.status(500).json({
        error: { code: 'OWNERSHIP_CHECK_FAILED', message: 'Could not verify program ownership.' },
      });
    }

    const fileName = (req as any).file?.originalname || 'document';
    const mimeType = (req as any).file?.mimetype || 'application/octet-stream';
    const fileSize = fileBuffer.length;
    const userId = (req as any).user?.id ?? null;

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
      await assertUploadSafe(fileBuffer, mimeType, fileName);
    } catch (err) {
      if (err instanceof UploadSafetyError) {
        return res.status(err.status).json({ error: { code: err.code, message: err.message } });
      }
      throw err;
    }

    const contentHash = sha256Bytes(fileBuffer);

    // Tenant-scoped local storage path (mirrors chat upload pattern)
    const storagePath = `uploads/vault/${data.programId}/${contentHash}${path.extname(fileName)}`;
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
      await fs.writeFile(resolved, fileBuffer);
    } catch (err) {
      logger.error('Vault file persistence failed — refusing to record the document', {
        reason: err instanceof Error ? err.message : 'unknown',
        contentHash,
      });
      return res.status(500).json({
        error: {
          code: 'STORAGE_WRITE_FAILED',
          message: 'The document could not be stored. Nothing was recorded — try again.',
        },
      });
    }

    // Text extraction (best-effort for the upload itself — the document is
    // still admitted — but the OUTCOME is captured either way, so a failure
    // can be recorded in the catalog as a failure rather than surfacing later
    // as a document that merely looks empty).
    let extractedText: string | null = null;
    let pageCount: number | null = null;
    let wordCount: number | null = null;
    let extractionMethod = 'none';
    let extractionConfidence: number | undefined;
    let extractionError: string | null = null;
    try {
      const { extractDocumentText } = await import('../services/ocr/index.js');
      const extracted = await extractDocumentText(fileBuffer, mimeType, fileName);
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
      await import('../services/vault/document-catalog.service.js');
    const catalogEnabled = await runScoped(() => isDocumentCatalogEnabled(orgId));

    /* ── Dossier filing ──────────────────────────────────────────────────────
       Every ingested document gets a PLACEMENT against the program's vault
       folder taxonomy (the auto-filing pipeline: capture → classify → file).
       When the uploader named an explicit folder it is validated against the
       program's view and recorded as 'confirmed' — a person chose it. When
       not, the deterministic classifier proposes ('suggested', with confidence
       and rationale), and a file the rules cannot place stays visibly
       'unfiled'. The proposal never overwrites documentType — a filename is
       not grounds to change a regulatory type field (see useVaultUpload). */
    // runScoped: this read runs after multer destroyed the tenant scope (see
    // the module header) — same re-entry the ownership check above uses.
    const vaultView = await runScoped(() => resolveVaultView(data.programId, orgId));
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
    if (data.folderId) {
      if (!isFolderInView(vaultView, data.folderId)) {
        return res.status(400).json({
          error: {
            code: 'INVALID_FOLDER',
            message: `Folder '${data.folderId}' does not exist in this program's ${vaultView} vault taxonomy.`,
          },
        });
      }
      placement = {
        folderId: data.folderId,
        evidenceKind: data.evidenceKind ?? null,
        ctdSection: data.ctdSection ?? null,
        status: 'confirmed',
        confidence: null,
        rationale: 'Filed by the uploader at ingest.',
        placedBy: userId,
        needsReview: false,
      };
    } else {
      const classified = classifyForFiling({
        fileName,
        title: data.documentTitle,
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
    const client = await runScoped(() => pool.connect());
    try {
      await client.query('BEGIN');
      // tenant-isolation-safe: vault.documents is program-scoped (program_id, no
      // org_id column); the caller's ownership of data.programId was already
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
          processing_status, created_by
        ) VALUES (
          $1, $2, $3, $4,
          $5, $6, $7, $8, $9, $10,
          $11, $12, $13,
          $14, $15,
          $16, $17, $18,
          $19, $20, $21,
          $22, $23, $24,
          $25, CASE WHEN $25::integer IS NULL THEN NULL ELSE NOW() END,
          'PENDING', $26
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
          updated_at = NOW()
        RETURNING id, processing_status, created_at, updated_at,
                  folder_id, evidence_kind, ctd_section, placement_status,
                  placement_confidence, placement_rationale`,
        [
          data.programId,
          data.documentCode,
          data.documentTitle,
          data.documentType,
          data.version ?? '1.0',
          s3Bucket,
          s3Key,
          fileName,
          fileSize,
          mimeType,
          contentHash,
          data.classification ?? 'INTERNAL',
          data.retentionPolicy ?? null,
          data.parentDocumentId ?? null,
          data.supersedesId ?? null,
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
        ],
      );

      const doc = result.rows[0];

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
        ipAddress: req.ip,
        userAgent: req.headers['user-agent'],
        details: {
          programId: data.programId,
          documentCode: data.documentCode,
          documentTitle: data.documentTitle,
          documentType: data.documentType,
          version: data.version ?? '1.0',
          fileName,
          fileSize,
          mimeType,
          contentHash,
          classification: data.classification ?? 'INTERNAL',
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

      logger.info('Vault document ingested', {
        id: doc.id,
        code: data.documentCode,
        type: data.documentType,
        size: fileSize,
        hasText: !!extractedText,
      });

      res.status(201).json({
        success: true,
        document: {
          id: doc.id,
          programId: data.programId,
          documentCode: data.documentCode,
          documentTitle: data.documentTitle,
          documentType: data.documentType,
          version: data.version ?? '1.0',
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
      });
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
      logger.error('Vault ingest failed — nothing recorded', { err: err?.message });
      res.status(500).json({
        error: {
          code: 'INGEST_FAILED',
          message: 'The document could not be recorded in the vault. Nothing was saved.',
        },
      });
    } finally {
      client.release();
    }
  });

  return router;
}
