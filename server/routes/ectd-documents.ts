/**
 * eCTD Documents Routes
 * Electronic Common Technical Document management
 *
 * Backed by coauthor_documents table with eCTD-specific filtering.
 */
import { Router, Request, Response } from 'express';
import { eq, desc, and, like, sql } from 'drizzle-orm';
import { db } from '../db';
import { coauthorDocuments } from '../../shared/schema';

import { createScopedLogger } from '../utils/logger.js';

const logger = createScopedLogger('ectd-documents');

const router = Router();

/**
 * Resolve organization from headers or query params.
 * Returns null when absent so callers can decide whether to 400 or allow open access.
 */
const resolveOrganizationId = (req: any): number | null => {
  const raw =
    req.tenantId ||
    req.tenantContext?.organizationId ||
    req.user?.organizationId;
  const parsed = Number(raw);
  return Number.isFinite(parsed) ? parsed : null;
};

// ── List ────────────────────────────────────────────────────────────────────

router.get('/', async (req: Request, res: Response) => {
  try {
    const organizationId = resolveOrganizationId(req);

    const { module, status, region } = req.query;
    const limit = Math.min(Number(req.query.limit) || 50, 200);
    const offset = Math.max(Number(req.query.offset) || 0, 0);

    // Build conditions array
    const conditions: any[] = [];
    if (organizationId) {
      conditions.push(eq(coauthorDocuments.organizationId, organizationId));
    }
    if (status && typeof status === 'string') {
      conditions.push(eq(coauthorDocuments.status, status));
    }
    if (module && typeof module === 'string') {
      conditions.push(like(coauthorDocuments.moduleNumber, `${module}%`));
    }

    const whereClause = conditions.length > 0 ? and(...conditions) : undefined;

    const documents = await db
      .select()
      .from(coauthorDocuments)
      .where(whereClause)
      .orderBy(desc(coauthorDocuments.updatedAt))
      .limit(limit)
      .offset(offset);

    // Map to eCTD-specific response format
    const ectdDocuments = documents.map(doc => ({
      id: doc.id,
      title: doc.title,
      module: doc.moduleNumber || null,
      moduleName: doc.moduleName || null,
      status: doc.status,
      region: (doc.metadata as any)?.region || 'US',
      version: (doc.metadata as any)?.version || '0001',
      content: doc.content || '',
      completionPercentage: doc.completionPercentage || 0,
      complianceScore: doc.regulatoryComplianceScore || null,
      createdAt: doc.createdAt,
      updatedAt: doc.updatedAt,
      createdBy: doc.createdBy,
    }));

    res.json({
      documents: ectdDocuments,
      total: ectdDocuments.length,
      filters: {
        module: module || null,
        status: status || null,
        region: region || null,
      },
    });
  } catch (error: any) {
    logger.error('List error', { err: error instanceof Error ? error.message : String(error) });
    res.status(500).json({ error: 'Failed to fetch eCTD documents', message: error.message });
  }
});

// ── Get by ID ───────────────────────────────────────────────────────────────

router.get('/:id', async (req: Request, res: Response) => {
  try {
    const docId = Number(req.params.id);
    if (!Number.isFinite(docId)) {
      return res.status(400).json({ error: 'Invalid document ID' });
    }

    const organizationId = resolveOrganizationId(req);

    const conditions: any[] = [eq(coauthorDocuments.id, docId)];
    if (organizationId) {
      conditions.push(eq(coauthorDocuments.organizationId, organizationId));
    }

    const [doc] = await db
      .select()
      .from(coauthorDocuments)
      .where(and(...conditions))
      .limit(1);

    if (!doc) {
      return res.status(404).json({ error: 'eCTD document not found' });
    }

    const metadata = (doc.metadata as any) || {};

    res.json({
      document: {
        id: doc.id,
        title: doc.title,
        module: doc.moduleNumber || null,
        moduleName: doc.moduleName || null,
        section: metadata.section || null,
        status: doc.status,
        region: metadata.region || 'US',
        version: metadata.version || '0001',
        content: doc.content || '',
        completionPercentage: doc.completionPercentage || 0,
        complianceScore: doc.regulatoryComplianceScore || null,
        sections: doc.sections || null,
        lifecycle: metadata.lifecycle || [],
        createdAt: doc.createdAt,
        updatedAt: doc.updatedAt,
        createdBy: doc.createdBy,
      },
    });
  } catch (error: any) {
    logger.error('Get error', { err: error instanceof Error ? error.message : String(error) });
    res.status(500).json({ error: 'Failed to fetch eCTD document', message: error.message });
  }
});

// ── Create ──────────────────────────────────────────────────────────────────

router.post('/', async (req: Request, res: Response) => {
  try {
    const { title, module: ectdModule, section, content, region } = req.body || {};

    if (!title) {
      return res.status(400).json({ error: 'title is required' });
    }

    const organizationId = resolveOrganizationId(req);
    if (!organizationId) {
      return res.status(400).json({ error: 'Organization ID required (x-organization-id header)' });
    }

    const userId = (req as any).user?.id || (req as any).user?.userId;

    const lifecycle = [{ event: 'created', timestamp: new Date().toISOString() }];

    const [doc] = await db
      .insert(coauthorDocuments)
      .values({
        organizationId,
        title,
        moduleNumber: ectdModule || null,
        content: content || '',
        status: 'draft',
        createdBy: userId ? String(userId) : null,
        metadata: {
          region: region || 'US',
          section: section || null,
          version: '0001',
          lifecycle,
        },
      })
      .returning();

    res.status(201).json({
      success: true,
      document: {
        id: doc.id,
        title: doc.title,
        module: doc.moduleNumber || null,
        section: section || null,
        content: doc.content || '',
        region: region || 'US',
        status: doc.status,
        version: '0001',
        lifecycle,
        createdAt: doc.createdAt,
        updatedAt: doc.updatedAt,
      },
    });
  } catch (error: any) {
    logger.error('Create error', { err: error instanceof Error ? error.message : String(error) });
    res.status(500).json({ error: 'Failed to create eCTD document', message: error.message });
  }
});

// ── Update ──────────────────────────────────────────────────────────────────

router.put('/:id', async (req: Request, res: Response) => {
  try {
    const docId = Number(req.params.id);
    if (!Number.isFinite(docId)) {
      return res.status(400).json({ error: 'Invalid document ID' });
    }

    const organizationId = resolveOrganizationId(req);

    const conditions: any[] = [eq(coauthorDocuments.id, docId)];
    if (organizationId) {
      conditions.push(eq(coauthorDocuments.organizationId, organizationId));
    }

    // Fetch current doc to merge metadata
    const [existing] = await db
      .select()
      .from(coauthorDocuments)
      .where(and(...conditions))
      .limit(1);

    if (!existing) {
      return res.status(404).json({ error: 'eCTD document not found' });
    }

    const { title, content, status, module: ectdModule, section, region } = req.body || {};

    const currentMetadata = (existing.metadata as any) || {};
    const updatedMetadata = { ...currentMetadata };
    if (section !== undefined) updatedMetadata.section = section;
    if (region !== undefined) updatedMetadata.region = region;

    // Add lifecycle event
    const lifecycle = updatedMetadata.lifecycle || [];
    lifecycle.push({ event: 'updated', timestamp: new Date().toISOString() });
    updatedMetadata.lifecycle = lifecycle;

    // Increment version on status change to approved/finalized
    if (status && (status === 'approved' || status === 'finalized') && status !== existing.status) {
      const currentVersion = parseInt(updatedMetadata.version || '0001', 10);
      updatedMetadata.version = String(currentVersion + 1).padStart(4, '0');
    }

    const updateValues: Record<string, any> = {
      updatedAt: new Date(),
      metadata: updatedMetadata,
    };
    if (title !== undefined) updateValues.title = title;
    if (content !== undefined) updateValues.content = content;
    if (status !== undefined) updateValues.status = status;
    if (ectdModule !== undefined) updateValues.moduleNumber = ectdModule;

    const [doc] = await db
      .update(coauthorDocuments)
      .set(updateValues)
      .where(and(...conditions))
      .returning();

    if (!doc) {
      return res.status(404).json({ error: 'eCTD document not found' });
    }

    const meta = (doc.metadata as any) || {};

    res.json({
      success: true,
      document: {
        id: doc.id,
        title: doc.title,
        module: doc.moduleNumber || null,
        section: meta.section || null,
        content: doc.content || '',
        status: doc.status,
        version: meta.version || '0001',
        region: meta.region || 'US',
        updatedAt: doc.updatedAt,
      },
    });
  } catch (error: any) {
    logger.error('Update error', { err: error instanceof Error ? error.message : String(error) });
    res.status(500).json({ error: 'Failed to update eCTD document', message: error.message });
  }
});

// ── Delete ──────────────────────────────────────────────────────────────────

router.delete('/:id', async (req: Request, res: Response) => {
  try {
    const docId = Number(req.params.id);
    if (!Number.isFinite(docId)) {
      return res.status(400).json({ error: 'Invalid document ID' });
    }

    const organizationId = resolveOrganizationId(req);

    const conditions: any[] = [eq(coauthorDocuments.id, docId)];
    if (organizationId) {
      conditions.push(eq(coauthorDocuments.organizationId, organizationId));
    }

    const [deleted] = await db
      .delete(coauthorDocuments)
      .where(and(...conditions))
      .returning();

    if (!deleted) {
      return res.status(404).json({ error: 'eCTD document not found' });
    }

    res.json({ success: true, deletedId: deleted.id });
  } catch (error: any) {
    logger.error('Delete error', { err: error instanceof Error ? error.message : String(error) });
    res.status(500).json({ error: 'Failed to delete eCTD document', message: error.message });
  }
});

// ── eCTD Structure Metadata ─────────────────────────────────────────────────

router.get('/meta/structure', (_req: Request, res: Response) => {
  res.json({
    modules: [
      { number: '1', title: 'Administrative Information', region: 'all' },
      { number: '2', title: 'Common Technical Document Summaries', region: 'all' },
      { number: '3', title: 'Quality (CMC)', region: 'all' },
      { number: '4', title: 'Nonclinical Study Reports', region: 'all' },
      { number: '5', title: 'Clinical Study Reports', region: 'all' },
    ],
  });
});

export default router;
