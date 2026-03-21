/**
 * CERV2 Document Routes
 * Clinical Evaluation Report v2 document management
 */
import { Router } from 'express';
import { z } from 'zod';
import { and, desc, eq, sql } from 'drizzle-orm';
import { documents, documentVersions } from '../../shared/schema';
import { authMiddleware } from '../auth';
import { db } from '../db';
import { createScopedLogger } from '../utils/logger';

const router = Router();
const logger = createScopedLogger('cerv2-documents');

const resolveOrganizationId = (req: any) => {
  const headerOrg = req.header('x-organization-id') || req.header('x-org-id');
  const tenantOrg = req.tenantContext?.organizationId;
  const userOrg = req.user?.organizationId || req.tenantId;
  const raw = headerOrg || tenantOrg || userOrg;
  const parsed = Number(raw);
  return Number.isFinite(parsed) ? parsed : null;
};

const resolveClientWorkspaceId = (req: any) => {
  const headerClient =
    req.header('x-client-id') ||
    req.header('x-client-workspace-id') ||
    req.header('x-client-workspace');
  const queryClient = req.query?.client_workspace_id || req.query?.clientWorkspaceId;
  const raw = headerClient || queryClient;
  if (!raw) {
    throw new Error('Client workspace context required');
  }
  const parsed = Number(raw);
  if (!Number.isFinite(parsed) || parsed <= 0) {
    throw new Error('Invalid client workspace ID');
  }
  return parsed;
};

const resolveUserId = (req: any) => {
  const raw = req.userId || req.user?.id || req.user?.userId;
  if (!raw) {
    throw new Error('User context required');
  }
  const parsed = Number(raw);
  if (!Number.isFinite(parsed) || parsed <= 0) {
    throw new Error('Invalid user ID');
  }
  return parsed;
};

const tableExists = async (_req: any, tableName: string) => {
  try {
    const result = await db.execute(sql`
      SELECT EXISTS (
        SELECT FROM information_schema.tables
        WHERE table_schema = 'public'
        AND table_name = ${tableName}
      )
    `);
    const rows = (result as any).rows ?? result;
    return rows?.[0]?.exists === true;
  } catch (error) {
    logger.error('Failed to check table existence', { error, tableName });
    return false;
  }
};

const saveSchema = z.object({
  documentType: z.string().min(1).optional(),
  documentCode: z.string().optional(),
  title: z.string().optional(),
  sections: z.any().optional(),
  metadata: z.any().optional(),
});

router.get('/documents', authMiddleware, async (req, res) => {
  const organizationId = resolveOrganizationId(req);
  if (!organizationId) {
    return res.status(400).json({ error: 'Organization context required' });
  }

  const hasDocsTable = await tableExists(req, 'documents');
  if (!hasDocsTable) {
    return res.json({ documents: [] });
  }

  try {
    const docs = await db
      .select()
      .from(documents)
      .where(eq(documents.organizationId, organizationId))
      .orderBy(desc(documents.updatedAt))
      .limit(50);

    return res.json({ documents: docs });
  } catch (error) {
    logger.error('Failed to list documents', { error });
    return res.status(500).json({ error: 'Failed to list documents' });
  }
});

router.get('/documents/:documentId', authMiddleware, async (req, res) => {
  const organizationId = resolveOrganizationId(req);
  if (!organizationId) {
    return res.status(400).json({ error: 'Organization context required' });
  }

  const documentId = Number(req.params.documentId);
  if (!Number.isFinite(documentId)) {
    return res.status(400).json({ error: 'Invalid document id' });
  }

  try {
    const [doc] = await db
      .select()
      .from(documents)
      .where(and(eq(documents.organizationId, organizationId), eq(documents.id, documentId)))
      .limit(1);

    if (!doc) {
      return res.status(404).json({ error: 'Document not found' });
    }

    const [latestVersion] = await db
      .select()
      .from(documentVersions)
      .where(eq(documentVersions.documentId, documentId))
      .orderBy(desc(documentVersions.id))
      .limit(1);

    return res.json({ document: doc, latestVersion });
  } catch (error) {
    logger.error('Failed to fetch document', { error, documentId });
    return res.status(500).json({ error: 'Failed to fetch document' });
  }
});

router.post('/documents/:documentId/save', authMiddleware, async (req, res) => {
  const organizationId = resolveOrganizationId(req);
  if (!organizationId) {
    return res.status(400).json({ error: 'Organization context required' });
  }

  const clientWorkspaceId = resolveClientWorkspaceId(req);
  const userId = resolveUserId(req);
  const parsed = saveSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: 'Invalid payload', details: parsed.error.flatten() });
  }

  const hasDocsTable = await tableExists(req, 'documents');
  const hasVersionsTable = await tableExists(req, 'document_versions');
  if (!hasDocsTable || !hasVersionsTable) {
    return res.status(503).json({ error: 'Document tables unavailable' });
  }

  try {
    const payload = parsed.data;
    const documentType = payload.documentType || 'cerv2_510k';
    const title = payload.title || payload.metadata?.title || 'CERV2 Document';
    const documentCode = payload.documentCode || `CERV2-${documentType}-${Date.now()}`;

    const paramId = req.params.documentId;
    const documentId = Number(paramId);
    let storedDocumentId = documentId;

    if (!Number.isFinite(documentId)) {
      storedDocumentId = NaN;
    }

    if (!Number.isFinite(storedDocumentId)) {
      const [createdDoc] = await db
        .insert(documents)
        .values({
          organizationId,
          clientWorkspaceId,
          documentCode,
          title,
          documentType,
          category: 'regulatory',
          status: 'draft',
          ownerId: userId,
          createdById: userId,
          metadata: payload.metadata ?? null,
          updatedAt: new Date(),
        })
        .returning();
      storedDocumentId = createdDoc.id;
    } else {
      const [existing] = await db
        .select()
        .from(documents)
        .where(
          and(eq(documents.organizationId, organizationId), eq(documents.id, storedDocumentId))
        )
        .limit(1);

      if (!existing) {
        const [createdDoc] = await db
          .insert(documents)
          .values({
            organizationId,
            clientWorkspaceId,
            documentCode,
            title,
            documentType,
            category: 'regulatory',
            status: 'draft',
            ownerId: userId,
            createdById: userId,
            metadata: payload.metadata ?? null,
            updatedAt: new Date(),
          })
          .returning();
        storedDocumentId = createdDoc.id;
      } else {
        await db
          .update(documents)
          .set({
            title,
            documentType,
            metadata: payload.metadata ?? existing.metadata,
            updatedAt: new Date(),
          })
          .where(
            and(eq(documents.organizationId, organizationId), eq(documents.id, storedDocumentId))
          );
      }
    }

    const [versionRow] = await db
      .select({ count: sql<number>`count(*)` })
      .from(documentVersions)
      .where(eq(documentVersions.documentId, storedDocumentId));

    const versionNumber = `${Number(versionRow?.count || 0) + 1}.0`;
    const content = JSON.stringify({
      documentType,
      sections: payload.sections ?? null,
      metadata: payload.metadata ?? null,
      savedAt: new Date().toISOString(),
    });

    const [version] = await db
      .insert(documentVersions)
      .values({
        documentId: storedDocumentId,
        versionNumber,
        content,
        changeDescription: 'Auto-save from CERV2 editor',
        changeType: 'auto_save',
        status: 'draft',
        createdById: userId,
      })
      .returning();

    return res.json({
      success: true,
      documentId: storedDocumentId,
      version: versionNumber,
      documentVersionId: version.id,
    });
  } catch (error) {
    logger.error('Failed to save document', { error });
    return res.status(500).json({ error: 'Failed to save document' });
  }
});

export default router;
