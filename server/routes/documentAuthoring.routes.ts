/**
 * Document Authoring API Routes — 21 CFR Part 11 document creation.
 *
 * Mounted at /api/document-authoring (auth-gated by authenticateToken in
 * bootstrap/register-document-routes.ts). This is a focused restoration of the
 * document-creation endpoint the client depends on
 * (client/src/concept2cure/hooks/useDocumentActions.ts → POST .../documents):
 * the prior 2,000-line authoring file was deleted in an omnibus commit and its
 * mount left failing closed, so this endpoint was a live 404. See
 * FORENSIC_CODE_AUDIT_2026-05-29.md (broken Part 11 endpoint).
 *
 * Scope is deliberately minimal and fully type-checked (no @ts-nocheck):
 * document create (with an initial version) + fetch-by-id. Signatures, locks,
 * MFA, and review workflows live in authoring.router.ts (/api/authoring).
 */
import { Router, type Request, type Response } from 'express';
import { eq } from 'drizzle-orm';
import { db } from '../db';
import { documents, documentVersions } from '../../shared/schema';
import auditService from '../services/auditService';
import { createScopedLogger } from '../utils/logger';

const router = Router();
const logger = createScopedLogger('document-authoring-routes');

interface CreateDocumentBody {
  title?: string;
  content?: string;
  documentType?: string;
  documentCode?: string;
  category?: string;
}

/**
 * POST /documents — create a document (plus an initial version when content is
 * supplied) and emit a Part 11 audit entry. Auth is enforced at the mount.
 */
router.post('/documents', async (req: Request, res: Response) => {
  if (!db) {
    return res.status(503).json({ success: false, error: 'Database unavailable' });
  }

  const userId = Number(req.user?.id ?? req.user?.userId ?? req.userId);
  const organizationId = Number(
    req.user?.organizationId ?? req.tenantContext?.organizationId
  );
  const clientWorkspaceId = Number(req.tenantContext?.clientWorkspaceId);

  if (!Number.isFinite(userId) || !Number.isFinite(organizationId)) {
    return res
      .status(401)
      .json({ success: false, error: 'Authenticated user and organization context required' });
  }
  if (!Number.isFinite(clientWorkspaceId)) {
    return res
      .status(400)
      .json({ success: false, error: 'Client workspace context required' });
  }

  const body = (req.body ?? {}) as CreateDocumentBody;
  if (!body.title || body.title.trim().length === 0) {
    return res.status(400).json({ success: false, error: 'title is required' });
  }

  try {
    const inserted = await db
      .insert(documents)
      .values({
        organizationId,
        clientWorkspaceId,
        documentCode: body.documentCode || `DOC-${Date.now()}`,
        title: body.title,
        documentType: body.documentType || 'regulatory',
        category: body.category,
        ownerId: userId,
        createdById: userId,
      })
      .returning();

    const newDocument = inserted[0];

    // Create the initial version when content is provided, then point the
    // document at it.
    if (body.content) {
      const versions = await db
        .insert(documentVersions)
        .values({
          documentId: newDocument.id,
          versionNumber: '1.0',
          versionLabel: 'Initial Draft',
          content: body.content,
          changeDescription: 'Initial document creation',
          changeType: 'major',
          status: 'draft',
          createdById: userId,
        })
        .returning();

      await db
        .update(documents)
        .set({ currentVersionId: versions[0].id })
        .where(eq(documents.id, newDocument.id));
    }

    // 21 CFR Part 11 audit trail.
    await auditService.logAction({
      organizationId,
      userId,
      action: 'document.create',
      resourceType: 'document',
      resourceId: newDocument.id,
      details: {
        title: newDocument.title,
        documentType: newDocument.documentType,
        ipAddress: req.ip,
        userAgent: req.headers['user-agent'],
      },
    });

    return res.status(201).json({ success: true, data: newDocument });
  } catch (error) {
    logger.error('Error creating document', { error });
    return res.status(500).json({ success: false, error: 'Failed to create document' });
  }
});

/**
 * GET /documents/:id — fetch a document, scoped to the caller's organization.
 */
router.get('/documents/:id', async (req: Request, res: Response) => {
  if (!db) {
    return res.status(503).json({ success: false, error: 'Database unavailable' });
  }

  const organizationId = Number(
    req.user?.organizationId ?? req.tenantContext?.organizationId
  );
  const documentId = Number(req.params.id);

  if (!Number.isFinite(organizationId)) {
    return res
      .status(401)
      .json({ success: false, error: 'Organization context required' });
  }
  if (!Number.isFinite(documentId)) {
    return res.status(400).json({ success: false, error: 'Invalid document id' });
  }

  try {
    const rows = await db
      .select()
      .from(documents)
      .where(eq(documents.id, documentId))
      .limit(1);

    const doc = rows[0];
    // Enforce tenant isolation: never disclose another org's document.
    if (!doc || doc.organizationId !== organizationId) {
      return res.status(404).json({ success: false, error: 'Document not found' });
    }

    return res.json({ success: true, data: doc });
  } catch (error) {
    logger.error('Error fetching document', { error });
    return res.status(500).json({ success: false, error: 'Failed to fetch document' });
  }
});

export default router;
