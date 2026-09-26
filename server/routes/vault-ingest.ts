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
 * REFUSALS ARE 4xx (VSR-001 F-4, 2026-09-21). The multer `fileFilter` refused
 * a disallowed extension with a bare Error, multer passed it to `next(err)`,
 * and nothing between here and the platform's generic handler knew what it
 * meant — so a `.exe` was answered 500 SERVER_ERROR "File type .exe is not
 * allowed". Nothing was stored, but a 500 says the server broke, clients retry
 * it, and URS-VAULT-003 ("refused with a 4xx") failed. `receiveUpload` below
 * owns every multer outcome: the allowlist refusal is 400
 * FILE_TYPE_NOT_ALLOWED with the accepted set named, an over-size file is 413
 * FILE_TOO_LARGE, any other multer complaint (wrong field name, too many
 * files) is 400 UPLOAD_INVALID, and only a genuinely unknown error still
 * reaches the generic handler.
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

import { Router, type NextFunction, type Request, type RequestHandler, type Response } from 'express';
import { requireEditorAccess } from '../middleware/orgMembership.js';
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

/** The allowlist refusal, typed so `receiveUpload` can recognise it. */
class FileTypeNotAllowedError extends Error {
  readonly code = 'FILE_TYPE_NOT_ALLOWED' as const;
  constructor(readonly extension: string) {
    super(
      `File type ${extension || '(none)'} is not allowed. Accepted: ` +
        `${[...ALLOWED_EXTENSIONS].join(', ')}.`,
    );
    this.name = 'FileTypeNotAllowedError';
  }
}

const upload = multer({
  storage: multer.memoryStorage(),
  fileFilter: (_req, file, cb) => {
    const ext = path.extname(file.originalname).toLowerCase();
    if (ALLOWED_EXTENSIONS.has(ext)) {
      cb(null, true);
    } else {
      cb(new FileTypeNotAllowedError(ext));
    }
  },
  limits: { fileSize: MAX_FILE_SIZE },
});

/**
 * Multer, with its outcomes answered HERE as the 4xx they are (see the module
 * header). Multer calls back with the fileFilter's error or a `MulterError`;
 * left to `next(err)` both became a 500 at the generic handler.
 */
const receiveUpload: RequestHandler = (req: Request, res: Response, next: NextFunction) => {
  upload.single('file')(req, res, (err: unknown) => {
    if (!err) return next();
    if (err instanceof FileTypeNotAllowedError) {
      return res.status(400).json({ error: { code: err.code, message: err.message } });
    }
    if (err instanceof multer.MulterError) {
      if (err.code === 'LIMIT_FILE_SIZE') {
        return res.status(413).json({
          error: {
            code: 'FILE_TOO_LARGE',
            message: `The file exceeds the ${MAX_FILE_SIZE / (1024 * 1024)} MB ingest limit.`,
          },
        });
      }
      return res.status(400).json({
        error: {
          code: 'UPLOAD_INVALID',
          message: `${err.message}. Send one file as multipart/form-data under the field name "file".`,
        },
      });
    }
    return next(err);
  });
};

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

  /* ROLE-GATED. This router is mounted with the auth middleware and nothing
     else (register-inline-routes.ts:860), so before this any member of the
     organisation could put bytes into the governed vault — including a
     `viewer`, the one organisation role that exists to not write. Ingest
     creates a vault.documents row and a Part 11 audit row attributing it to the
     caller, so a viewer could author an attributable governed record.

     The role was already being READ here — it is stamped into the ingest
     arguments below — and simply never decided anything. Recording who did
     something while not checking whether they may is the worst of both.

     Gate BEFORE multer: refusing after the upload has been parsed into memory
     means a caller who may not write can still make the server buffer a file
     for them. `requireEditorAccess` is the repo's one governed-write gate. */
  router.post('/', requireEditorAccess, receiveUpload, async (req: Request, res: Response) => {
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
    // 200, not 201, when the bytes were already recorded: nothing was created.
    return res.status(outcome.reupload ? 200 : 201).json({
      success: true,
      document: outcome.document,
      filing: outcome.filing,
      ...(outcome.reupload ? { reupload: outcome.reupload } : {}),
    });
  });

  return router;
}
