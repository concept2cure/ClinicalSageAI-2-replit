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
import { z } from 'zod';
import { VAULT_INGEST_DOCUMENT_TYPES } from '../../shared/constants/domain/vault-taxonomy';
import { runWithTenantScope } from '../db/tenantStore';
import { ingestVaultDocument } from '../services/vault/vault-ingest.service';

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

    /* The governed ingest itself lives in the vault service — ONE
       implementation, so the AnA tool that files an already-uploaded file into
       the vault performs the same admission (ownership, safety, storage, the
       catalog tier, the Part 11 audit row, the passage index) rather than a
       second, drifting one. This handler owns the HTTP: multipart in, status
       codes and response shape out.

       The whole call runs inside the tenant scope re-entered above, because
       `pool` fails closed without one under RLS_ENFORCE=on (see the module
       header for why multer destroyed it). */
    const outcome = await runScoped(() =>
      ingestVaultDocument({
        organizationId: (req as any).user?.organizationId ?? (req as any).user?.tenantId,
        userId: (req as any).user?.id ?? null,
        programId: data.programId,
        documentCode: data.documentCode,
        documentTitle: data.documentTitle,
        documentType: data.documentType,
        version: data.version,
        classification: data.classification,
        retentionPolicy: data.retentionPolicy,
        parentDocumentId: data.parentDocumentId,
        supersedesId: data.supersedesId,
        folderId: data.folderId,
        evidenceKind: data.evidenceKind,
        ctdSection: data.ctdSection,
        fileBuffer,
        fileName: (req as any).file?.originalname || 'document',
        mimeType: (req as any).file?.mimetype || 'application/octet-stream',
        ipAddress: req.ip,
        userAgent: req.headers['user-agent'],
      }),
    );

    if (!outcome.ok) {
      return res
        .status(outcome.status)
        .json({ error: { code: outcome.code, message: outcome.message } });
    }
    return res.status(201).json({
      success: true,
      document: outcome.document,
      filing: outcome.filing,
    });
  });

  return router;
}
