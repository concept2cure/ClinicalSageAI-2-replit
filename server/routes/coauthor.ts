/**
 * Co-Author Routes
 * eCTD collaborative authoring service
 */
import { Router, Request, Response } from 'express';
import { eq, desc, and } from 'drizzle-orm';
import { db } from '../db';
import { coauthorDocuments, coauthorSections } from '../../shared/schema';
import { authMiddleware } from '../auth';

const router = Router();

const resolveOrganizationId = (req: any): number | null => {
  const headerOrg = req.header('x-organization-id') || req.header('x-org-id');
  const tenantOrg = req.tenantContext?.organizationId;
  const userOrg = req.user?.organizationId || req.tenantId;
  const raw = headerOrg || tenantOrg || userOrg;
  const parsed = Number(raw);
  return Number.isFinite(parsed) ? parsed : null;
};

// ── Sessions (backed by coauthor_sections table) ────────────────────────────

router.get('/sessions', authMiddleware, async (req: any, res: Response) => {
  try {
    const organizationId = resolveOrganizationId(req);
    if (!organizationId) {
      return res.status(400).json({ error: 'Organization ID required' });
    }

    const sessions = await db
      .select()
      .from(coauthorSections)
      .where(eq(coauthorSections.organizationId, organizationId))
      .orderBy(desc(coauthorSections.createdAt))
      .limit(100);

    return res.json({
      sessions,
      message: sessions.length > 0 ? `Found ${sessions.length} session(s)` : 'No co-author sessions yet',
    });
  } catch (error: any) {
    console.error('[Co-Author] List sessions error:', error);
    return res.status(500).json({ error: 'Failed to fetch sessions', message: error.message });
  }
});

router.post('/sessions', authMiddleware, async (req: any, res: Response) => {
  try {
    const organizationId = resolveOrganizationId(req);
    if (!organizationId) {
      return res.status(400).json({ error: 'Organization ID required' });
    }

    const { title, templateId, moduleNumber, sectionId } = req.body || {};

    const [session] = await db
      .insert(coauthorSections)
      .values({
        sectionId: sectionId || `session-${Date.now()}`,
        organizationId,
        title: title || 'Untitled Session',
        moduleNumber: moduleNumber || null,
        sectionType: templateId || null,
      })
      .returning();

    return res.status(201).json({
      success: true,
      session,
    });
  } catch (error: any) {
    console.error('[Co-Author] Create session error:', error);
    return res.status(500).json({ error: 'Failed to create session', message: error.message });
  }
});

// ── Documents ───────────────────────────────────────────────────────────────

router.get('/documents', authMiddleware, async (req: any, res: Response) => {
  try {
    const organizationId = resolveOrganizationId(req);
    if (!organizationId) {
      return res.status(400).json({ error: 'Organization ID required' });
    }

    const limit = Math.min(Number(req.query.limit) || 50, 200);

    const documents = await db
      .select()
      .from(coauthorDocuments)
      .where(eq(coauthorDocuments.organizationId, organizationId))
      .orderBy(desc(coauthorDocuments.updatedAt))
      .limit(limit);

    return res.json({
      documents,
      total: documents.length,
      message: documents.length > 0 ? `Found ${documents.length} document(s)` : 'No co-author documents yet',
    });
  } catch (error: any) {
    console.error('[Co-Author] List documents error:', error);
    return res.status(500).json({ error: 'Failed to fetch documents', message: error.message });
  }
});

router.get('/documents/:id', authMiddleware, async (req: any, res: Response) => {
  try {
    const organizationId = resolveOrganizationId(req);
    if (!organizationId) {
      return res.status(400).json({ error: 'Organization ID required' });
    }

    const docId = Number(req.params.id);
    if (!Number.isFinite(docId)) {
      return res.status(400).json({ error: 'Invalid document ID' });
    }

    const [document] = await db
      .select()
      .from(coauthorDocuments)
      .where(
        and(
          eq(coauthorDocuments.id, docId),
          eq(coauthorDocuments.organizationId, organizationId)
        )
      )
      .limit(1);

    if (!document) {
      return res.status(404).json({ error: 'Document not found' });
    }

    return res.json({ document });
  } catch (error: any) {
    console.error('[Co-Author] Get document error:', error);
    return res.status(500).json({ error: 'Failed to fetch document', message: error.message });
  }
});

router.post('/documents', authMiddleware, async (req: any, res: Response) => {
  try {
    const organizationId = resolveOrganizationId(req);
    if (!organizationId) {
      return res.status(400).json({ error: 'Organization ID required' });
    }

    const { title, moduleNumber, content, templateId } = req.body || {};

    if (!title) {
      return res.status(400).json({ error: 'title is required' });
    }

    const userId = req.user?.id || req.user?.userId;

    const [document] = await db
      .insert(coauthorDocuments)
      .values({
        organizationId,
        title,
        content: content || '',
        moduleNumber: moduleNumber || null,
        templateId: templateId ? Number(templateId) : null,
        status: 'draft',
        createdBy: userId ? String(userId) : null,
      })
      .returning();

    return res.status(201).json({
      success: true,
      document,
    });
  } catch (error: any) {
    console.error('[Co-Author] Create document error:', error);
    return res.status(500).json({ error: 'Failed to create document', message: error.message });
  }
});

router.put('/documents/:id', authMiddleware, async (req: any, res: Response) => {
  try {
    const organizationId = resolveOrganizationId(req);
    if (!organizationId) {
      return res.status(400).json({ error: 'Organization ID required' });
    }

    const docId = Number(req.params.id);
    if (!Number.isFinite(docId)) {
      return res.status(400).json({ error: 'Invalid document ID' });
    }

    const { title, content, status } = req.body || {};

    const updateValues: Record<string, any> = { updatedAt: new Date() };
    if (title !== undefined) updateValues.title = title;
    if (content !== undefined) updateValues.content = content;
    if (status !== undefined) updateValues.status = status;

    const [document] = await db
      .update(coauthorDocuments)
      .set(updateValues)
      .where(
        and(
          eq(coauthorDocuments.id, docId),
          eq(coauthorDocuments.organizationId, organizationId)
        )
      )
      .returning();

    if (!document) {
      return res.status(404).json({ error: 'Document not found' });
    }

    return res.json({
      success: true,
      document,
    });
  } catch (error: any) {
    console.error('[Co-Author] Update document error:', error);
    return res.status(500).json({ error: 'Failed to update document', message: error.message });
  }
});

router.delete('/documents/:id', authMiddleware, async (req: any, res: Response) => {
  try {
    const organizationId = resolveOrganizationId(req);
    if (!organizationId) {
      return res.status(400).json({ error: 'Organization ID required' });
    }

    const docId = Number(req.params.id);
    if (!Number.isFinite(docId)) {
      return res.status(400).json({ error: 'Invalid document ID' });
    }

    const [deleted] = await db
      .delete(coauthorDocuments)
      .where(
        and(
          eq(coauthorDocuments.id, docId),
          eq(coauthorDocuments.organizationId, organizationId)
        )
      )
      .returning();

    if (!deleted) {
      return res.status(404).json({ error: 'Document not found' });
    }

    return res.json({ success: true, deletedId: deleted.id });
  } catch (error: any) {
    console.error('[Co-Author] Delete document error:', error);
    return res.status(500).json({ error: 'Failed to delete document', message: error.message });
  }
});

// ── Templates ───────────────────────────────────────────────────────────────

router.get('/templates', (_req: Request, res: Response) => {
  res.json({
    templates: [
      { id: 'module-2-5', name: 'Module 2.5 – Clinical Overview', moduleNumber: '2.5' },
      { id: 'module-2-7', name: 'Module 2.7 – Clinical Summary', moduleNumber: '2.7' },
      { id: 'module-3-2-s', name: 'Module 3.2.S – Drug Substance', moduleNumber: '3.2.S' },
      { id: 'module-3-2-p', name: 'Module 3.2.P – Drug Product', moduleNumber: '3.2.P' },
      { id: 'module-5-3', name: 'Module 5.3 – Clinical Study Reports', moduleNumber: '5.3' },
    ],
  });
});

export default router;
