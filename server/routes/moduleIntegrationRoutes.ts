/**
 * Module Integration Routes
 *
 * This file defines the API routes for the unified document workflow system
 * that integrates all module-specific documents into a centralized workflow.
 */

import { Router, type Request, type Response, type NextFunction } from 'express';
import multer from 'multer';
import { db } from '../db';
import { runWithTenantScope } from '../db/tenantStore';
import {
  ModuleIntegrationService,
  DocumentNotFoundException,
  AttachmentNotFoundException,
  AttachmentRejectedException,
  isModuleType,
} from '../services/ModuleIntegrationService';
import { WorkflowService } from '../services/WorkflowService';
import { DocumentAttachmentService } from '../services/module-integration/attachment-service';
import { getStorageProvider } from '../services/storage';
import { cacheResponse } from '../middleware/enterprise-performance';
import { asyncHandler } from '../middleware/errorHandler';
import { makeUploadFileFilter } from '../middleware/uploadAllowlist';
import { assertUploadSafe, UploadSafetyError } from '../middleware/uploadSafety';
import { getSecureOrgId } from '../utils/tenantContext';
import { createScopedLogger } from '../utils/logger';

const logger = createScopedLogger('module-integration');

const router = Router();
const moduleIntegrationService = new ModuleIntegrationService(db);
const workflowService = new WorkflowService(db);
// Attachments are their own service; the routes below use it directly rather
// than reaching through ModuleIntegrationService for it.
const attachmentService = new DocumentAttachmentService(db);

// Middleware to handle tenant context
const setTenantContext = (req: any, res: any, next: any) => {
  const organizationId = getSecureOrgId(req);
  if (!organizationId) {
    return res.status(401).json({ error: 'Organization context required' });
  }
  req.tenantContext = { organizationId };
  next();
};

// Apply tenant context middleware to all routes
router.use(setTenantContext);

/**
 * Register a document in the unified system
 * POST /api/module-integration/register-document
 */
router.post('/register-document', asyncHandler(async (req, res) => {
  const document = await moduleIntegrationService.registerDocument({
    ...req.body,
    organizationId: getSecureOrgId(req),
  });
  res.status(201).json(document);
}));

/**
 * Check if a document exists
 * GET /api/module-integration/document-exists
 */
router.get('/document-exists', asyncHandler(async (req, res) => {
  const { moduleType, originalId } = req.query;
  const organizationId = getSecureOrgId(req);
  if (!isModuleType(moduleType) || typeof originalId !== 'string' || !organizationId) {
    return res.status(400).json({
      error: 'moduleType (a valid module), originalId, and organization context are required',
    });
  }
  const exists = await moduleIntegrationService.documentExists(
    moduleType,
    originalId,
    Number(organizationId)
  );
  res.json({ exists });
}));

/**
 * Get documents by module type
 * GET /api/module-integration/documents/:moduleType
 */
router.get('/documents/:moduleType', asyncHandler(async (req, res) => {
  const { moduleType } = req.params;
  const organizationId = getSecureOrgId(req);
  const documents = await moduleIntegrationService.getDocumentsByModule(
    moduleType,
    organizationId as string
  );
  res.json(documents);
}));

/**
 * Get a specific document
 * GET /api/module-integration/documents/:id
 */
router.get('/document/:id', asyncHandler(async (req, res) => {
  try {
    const { id } = req.params;
    const document = await moduleIntegrationService.getDocument(
      parseInt(String(id), 10),
      Number(getSecureOrgId(req))
    );

    if (!document) {
      return res.status(404).json({ error: 'Document not found' });
    }

    res.json(document);
  } catch (error) {
    if (error instanceof DocumentNotFoundException) {
      return res.status(404).json({ error: error.message });
    }
    throw error;
  }
}));

/**
 * Update a document
 * PATCH /api/module-integration/documents/:id
 */
router.patch('/documents/:id', asyncHandler(async (req, res) => {
  try {
    const { id } = req.params;
    const document = await moduleIntegrationService.updateDocument(
      parseInt(String(id), 10),
      req.body,
      Number(getSecureOrgId(req))
    );
    res.json(document);
  } catch (error) {
    if (error instanceof DocumentNotFoundException) {
      return res.status(404).json({ error: error.message });
    }
    throw error;
  }
}));

/**
 * Get workflow templates for a module
 * GET /api/module-integration/templates/:moduleType
 */
router.get('/templates/:moduleType', cacheResponse({ ttl: 60_000 }), asyncHandler(async (req, res) => {
  const { moduleType } = req.params;
  const organizationId = getSecureOrgId(req);
  const templates = await workflowService.getWorkflowTemplatesByModule(
    moduleType,
    organizationId as string
  );
  res.json(templates);
}));

/**
 * Create a workflow template
 * POST /api/module-integration/templates
 */
router.post('/templates', asyncHandler(async (req, res) => {
  const { moduleType, ...templateData } = req.body;
  const template = await workflowService.createWorkflowTemplate(
    moduleType,
    getSecureOrgId(req),
    req.userId,
    templateData,
  );
  res.status(201).json(template);
}));

/**
 * Get a specific workflow template
 * GET /api/module-integration/templates/:id
 */
router.get('/templates/:id', asyncHandler(async (req, res) => {
  const { id } = req.params;
  // Scoped to the caller's organization: a template owned by another tenant
  // 404s exactly like one that does not exist, so the response cannot be used
  // to probe for foreign template ids.
  const template = await workflowService.getWorkflowTemplate(
    parseInt(String(id), 10),
    getSecureOrgId(req),
  );

  if (!template) {
    return res.status(404).json({ error: 'Workflow template not found' });
  }

  res.json(template);
}));

/**
 * Start a workflow
 * POST /api/module-integration/workflows
 */
router.post('/workflows', asyncHandler(async (req, res) => {
  const { documentId, templateId, metadata } = req.body;
  const startedByUserId = req.userId;
  if (!startedByUserId) {
    return res.status(401).json({ error: 'Authentication required' });
  }
  // The organization is passed as its own argument, not folded into metadata.
  // metadata is client-supplied and lands in a JSON column; the tenant a record
  // is filed under is not something a request body gets a say in.
  const workflow = await workflowService.startWorkflow(
    documentId,
    templateId,
    startedByUserId,
    getSecureOrgId(req),
    metadata || {},
  );
  res.status(201).json(workflow);
}));

/**
 * Approve a workflow step
 * POST /api/module-integration/approve-step
 */
router.post('/approve-step', asyncHandler(async (req, res) => {
  const { approvalId, comments } = req.body;
  const userId = req.userId;
  if (!userId) {
    return res.status(401).json({ error: 'Authentication required' });
  }
  const result = await workflowService.approveWorkflowStep(
    approvalId,
    userId,
    comments,
    getSecureOrgId(req),
  );
  res.json(result);
}));

/**
 * Reject a workflow step
 * POST /api/module-integration/reject-step
 */
router.post('/reject-step', asyncHandler(async (req, res) => {
  const { approvalId, comments } = req.body;
  const userId = req.userId;
  if (!userId) {
    return res.status(401).json({ error: 'Authentication required' });
  }
  const result = await workflowService.rejectWorkflowStep(
    approvalId,
    userId,
    comments,
    getSecureOrgId(req),
  );
  res.json(result);
}));

/**
 * Get documents with active workflows
 * GET /api/module-integration/documents-in-review
 */
router.get('/documents-in-review', asyncHandler(async (req, res) => {
  const organizationId = getSecureOrgId(req);
  const documents = await moduleIntegrationService.getDocumentsInReview(organizationId as string);
  res.json(documents);
}));

/**
 * Get active workflows
 * GET /api/module-integration/active-workflows
 */
router.get('/active-workflows', asyncHandler(async (req, res) => {
  const { page, pageSize } = req.query;
  const organizationId = getSecureOrgId(req);
  const workflows = await workflowService.getActiveWorkflows(
    organizationId as string,
    parseInt(page as string, 10) || 1,
    Math.min(parseInt(pageSize as string, 10) || 50, 200)
  );
  res.json(workflows);
}));

/**
 * Get completed workflows
 * GET /api/module-integration/completed-workflows
 */
router.get('/completed-workflows', asyncHandler(async (req, res) => {
  const { page, pageSize } = req.query;
  const organizationId = getSecureOrgId(req);
  const workflows = await workflowService.getCompletedWorkflows(
    organizationId as string,
    parseInt(page as string, 10) || 1,
    Math.min(parseInt(pageSize as string, 10) || 50, 200)
  );
  res.json(workflows);
}));

/**
 * Get workflows pending approval
 * GET /api/module-integration/pending-approvals
 */
router.get('/pending-approvals', asyncHandler(async (req, res) => {
  const userId = req.userId;
  if (!userId) {
    return res.status(401).json({ error: 'Authentication required' });
  }
  const organizationId = getSecureOrgId(req);
  const approvals = await workflowService.getPendingApprovals(
    organizationId as string,
    userId as string
  );
  res.json(approvals);
}));

/**
 * Get workflow history
 * GET /api/module-integration/workflow-history/:id
 */
router.get('/workflow-history/:id', asyncHandler(async (req, res) => {
  const { id } = req.params;
  // Scoped to the caller's organization: the history of another tenant's
  // workflow reads as empty, exactly like a workflow that does not exist.
  const history = await workflowService.getWorkflowHistory(
    parseInt(String(id), 10),
    getSecureOrgId(req),
  );
  res.json(history);
}));

// ─── Document attachments: bytes in, bytes out ─────────────────────────────
//
// The attachment RECORD lives in document_attachments (ModuleIntegrationService,
// tenant-scoped and audited). The BYTES live in the storage provider, which is
// the only tenant boundary object storage has: `get(vaultVersionId, orgId)`
// requires the organization and reports a foreign file as missing. So an
// attachment's `filePath` is the provider's version id, never a disk path, and
// these two routes are the only way bytes get in or out.

/** Same ceiling as vault-ingest, the sibling upload surface. */
const MAX_ATTACHMENT_BYTES = 50 * 1024 * 1024;

const attachmentUpload = multer({
  storage: multer.memoryStorage(),
  // The shared extension + MIME allowlist. Rejecting here, before the bytes
  // are buffered, is cheaper than rejecting in the record validator later —
  // but the record validator still runs, so the two cannot drift apart
  // without a test noticing.
  fileFilter: makeUploadFileFilter(),
  limits: { fileSize: MAX_ATTACHMENT_BYTES, files: 1 },
});

/**
 * multer reports its own refusals (over the size limit, filtered type) to
 * `next(err)`, which would reach the generic error handler as a 500. They are
 * client errors and are answered as such.
 */
function acceptAttachmentFile(req: Request, res: Response, next: NextFunction): void {
  attachmentUpload.single('file')(req, res, (err: unknown) => {
    if (!err) return next();
    if (err instanceof multer.MulterError && err.code === 'LIMIT_FILE_SIZE') {
      res.status(413).json({ error: 'File exceeds the attachment size limit' });
      return;
    }
    res.status(400).json({ error: err instanceof Error ? err.message : 'Invalid upload' });
  });
}

/**
 * Re-open the request's tenant scope for work that runs after multer.
 *
 * multer's body parsing breaks the AsyncLocalStorage continuation the auth
 * middleware opened, so under RLS enforcement every tenant-scoped query after
 * it would fail closed. This restores the exact scope the request was granted
 * — nothing wider — for the span that needs it. Same shape as vault-ingest;
 * any route that puts multer in front of tenant-scoped work has this problem.
 */
function tenantScopeRunner(req: Request) {
  const tenantScopeId =
    (req as any).tenantId ?? (req as any).tenantContext?.organizationId ?? null;
  return <T>(fn: () => Promise<T>): Promise<T> =>
    tenantScopeId == null
      ? fn()
      : runWithTenantScope(
          {
            tenantId: String(tenantScopeId),
            orgUuid: (req as any).tenantContext?.organizationUuid ?? null,
            role: (req as any).userRole ?? (req as any).user?.role ?? null,
            source: 'request',
            caller: 'server/routes/moduleIntegrationRoutes.ts',
          },
          fn,
        );
}

function positiveInt(value: unknown): number | null {
  const n = Number(String(value));
  return Number.isSafeInteger(n) && n > 0 ? n : null;
}

/**
 * RFC 6266 attachment disposition: an ASCII fallback that cannot break the
 * header (quotes, backslashes, separators and non-ASCII stripped) plus the
 * RFC 5987 UTF-8 form carrying the real name. No canonical helper exists in
 * the repo for this; the one sanitiser (universal-packager) is private.
 */
function attachmentDisposition(fileName: string): string {
  const ascii =
    fileName.replace(/[^\x20-\x7e]/g, '').replace(/[";]/g, '_').trim() || 'attachment';
  const encoded = encodeURIComponent(fileName).replace(
    /['()*]/g,
    c => `%${c.charCodeAt(0).toString(16).toUpperCase()}`,
  );
  return `attachment; filename="${ascii}"; filename*=UTF-8''${encoded}`;
}

/**
 * Attach a file to a document.
 * POST /api/module-integration/documents/:id/attachments   (multipart, field "file")
 *
 * Order is the point:
 *   1. ownership — a document the caller cannot see fails here, before any
 *      byte is written, so a rejected upload never leaves orphaned storage;
 *   2. safety — magic-byte signature + AV scan against the DECLARED type,
 *      which is what makes the recorded fileType trustworthy at download;
 *   3. bytes into the provider, org-scoped;
 *   4. the record and its audit entry, in one transaction. If that fails the
 *      stored version is deleted again: the vault must not hold bytes no
 *      record references, any more than the ledger may claim bytes that were
 *      never stored.
 */
router.post(
  '/documents/:id/attachments',
  acceptAttachmentFile,
  asyncHandler(async (req, res) => {
    const userId = req.userId;
    if (!userId) {
      return res.status(401).json({ error: 'Authentication required' });
    }
    const organizationId = getSecureOrgId(req);
    const documentId = positiveInt(req.params.id);
    if (documentId === null) {
      return res.status(400).json({ error: 'documentId must be a positive integer' });
    }
    const file = req.file;
    if (!file) {
      return res.status(400).json({ error: 'file is required (multipart field "file")' });
    }

    const runScoped = tenantScopeRunner(req);

    try {
      await runScoped(() => attachmentService.assertDocumentOwned(documentId, organizationId));
    } catch (error) {
      if (error instanceof DocumentNotFoundException) {
        return res.status(404).json({ error: error.message });
      }
      throw error;
    }

    try {
      await assertUploadSafe(file.buffer, file.mimetype, file.originalname);
    } catch (error) {
      if (error instanceof UploadSafetyError) {
        return res.status(error.status).json({ error: { code: error.code, message: error.message } });
      }
      throw error;
    }

    const storage = getStorageProvider();
    const orgId = Number(organizationId);
    const put = await storage.put({
      orgId,
      projectId: `document-${documentId}`,
      filename: file.originalname,
      bytes: file.buffer,
      mime: file.mimetype,
      metadata: { documentId: String(documentId), uploadedBy: String(userId) },
    });

    try {
      const stored = await runScoped(() =>
        attachmentService.add(
          documentId,
          {
            fileName: file.originalname,
            fileType: file.mimetype,
            fileSize: put.sizeBytes,
            filePath: put.vaultVersionId,
            metadata: { sha256: put.sha256, vaultFileId: put.vaultFileId, provider: put.provider },
          },
          String(userId),
          organizationId,
        ),
      );
      return res.status(201).json(stored);
    } catch (error) {
      // Compensate: the record was not written, so the bytes must not stay.
      await storage.delete(put.vaultVersionId, orgId).catch((cleanupError: unknown) => {
        logger.error('Attachment record failed and the stored bytes could not be removed', {
          documentId,
          vaultVersionId: put.vaultVersionId,
          error: cleanupError instanceof Error ? cleanupError.message : String(cleanupError),
        });
      });
      if (error instanceof DocumentNotFoundException) {
        return res.status(404).json({ error: error.message });
      }
      if (error instanceof AttachmentRejectedException) {
        return res.status(400).json({ error: error.message });
      }
      throw error;
    }
  }),
);

/**
 * Download an attachment's bytes.
 * GET /api/module-integration/documents/:id/attachments/:attachmentId
 *
 * The record is resolved through the document (tenant walk), then the bytes
 * through the provider with the organization — two independent boundaries,
 * and a foreign file fails both as "not found". A record whose bytes no longer
 * match its recorded digest is an integrity failure, not a 404: the caller
 * must not be handed a file that is not what the ledger says it is.
 */
router.get(
  '/documents/:id/attachments/:attachmentId',
  asyncHandler(async (req, res) => {
    const organizationId = getSecureOrgId(req);
    const documentId = positiveInt(req.params.id);
    const attachmentId = positiveInt(req.params.attachmentId);
    if (documentId === null || attachmentId === null) {
      return res.status(400).json({ error: 'documentId and attachmentId must be positive integers' });
    }

    let attachment: Awaited<ReturnType<DocumentAttachmentService['get']>>;
    try {
      attachment = await attachmentService.get(documentId, attachmentId, organizationId);
    } catch (error) {
      if (error instanceof DocumentNotFoundException || error instanceof AttachmentNotFoundException) {
        return res.status(404).json({ error: 'Attachment not found' });
      }
      throw error;
    }

    const got = await getStorageProvider().get(attachment.filePath, Number(organizationId));
    if (!got) {
      // The provider reports a foreign tenant's file as missing by contract;
      // a record with no retrievable bytes is answered the same way.
      logger.warn('Attachment record has no retrievable bytes', { documentId, attachmentId });
      return res.status(404).json({ error: 'Attachment not found' });
    }

    const recordedSha256 = (attachment.metadata as Record<string, unknown> | null)?.sha256;
    if (typeof recordedSha256 === 'string' && recordedSha256 !== got.sha256) {
      logger.error('Attachment bytes do not match the recorded digest', {
        documentId,
        attachmentId,
      });
      return res.status(500).json({ error: 'ATTACHMENT_INTEGRITY_FAILED' });
    }

    // fileType was verified against the bytes' magic signature at upload
    // (assertUploadSafe), so it is a safe Content-Type to serve them under.
    res.setHeader('Content-Type', attachment.fileType);
    res.setHeader('Content-Length', String(got.bytes.length));
    res.setHeader('Content-Disposition', attachmentDisposition(attachment.fileName));
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('Cache-Control', 'private, no-store');
    return res.send(got.bytes);
  }),
);

export default router;
