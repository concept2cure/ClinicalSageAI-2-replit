/**
 * Co-Author Routes
 * eCTD collaborative authoring service
 */
import { Router, Request, Response } from 'express';
import { eq, desc, and } from 'drizzle-orm';
import { db, getPool } from '../db';
import { coauthorDocuments, coauthorSections } from '../../shared/schema';
import { authMiddleware } from '../auth';
import { logRegulatedDeletion } from '../services/audit/regulatedDeletion';

import { createScopedLogger } from '../utils/logger.js';

const logger = createScopedLogger('coauthor');

const router = Router();

const resolveOrganizationId = (req: any): number | null => {
  const tenantOrg = req.tenantContext?.organizationId;
  const userOrg = req.user?.organizationId || req.tenantId;
  const raw = tenantOrg || userOrg;
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
      message:
        sessions.length > 0 ? `Found ${sessions.length} session(s)` : 'No co-author sessions yet',
    });
  } catch (error: any) {
    logger.error('List sessions error', { err: error instanceof Error ? error.message : String(error) });
    return res.status(500).json({ error: 'Failed to fetch sessions', message: 'An unexpected error occurred' });
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
    logger.error('Create session error', { err: error instanceof Error ? error.message : String(error) });
    return res.status(500).json({ error: 'Failed to create session', message: 'An unexpected error occurred' });
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
      message:
        documents.length > 0
          ? `Found ${documents.length} document(s)`
          : 'No co-author documents yet',
    });
  } catch (error: any) {
    logger.error('List documents error', { err: error instanceof Error ? error.message : String(error) });
    return res.status(500).json({ error: 'Failed to fetch documents', message: 'An unexpected error occurred' });
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
        and(eq(coauthorDocuments.id, docId), eq(coauthorDocuments.organizationId, organizationId))
      )
      .limit(1);

    if (!document) {
      return res.status(404).json({ error: 'Document not found' });
    }

    return res.json({ document });
  } catch (error: any) {
    logger.error('Get document error', { err: error instanceof Error ? error.message : String(error) });
    return res.status(500).json({ error: 'Failed to fetch document', message: 'An unexpected error occurred' });
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
    logger.error('Create document error', { err: error instanceof Error ? error.message : String(error) });
    return res.status(500).json({ error: 'Failed to create document', message: 'An unexpected error occurred' });
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
        and(eq(coauthorDocuments.id, docId), eq(coauthorDocuments.organizationId, organizationId))
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
    logger.error('Update document error', { err: error instanceof Error ? error.message : String(error) });
    return res.status(500).json({ error: 'Failed to update document', message: 'An unexpected error occurred' });
  }
});

router.delete('/documents/:id', authMiddleware, async (req: any, res: Response) => {
  // 21 CFR Part 11 §11.10(e): coauthor_documents are regulated (eCTD) records.
  // Audit the deletion (with a full pre-image) BEFORE removing the row, in the
  // SAME transaction, so an audit failure rolls back the delete (fail-closed).
  const organizationId = resolveOrganizationId(req);
  if (!organizationId) {
    return res.status(400).json({ error: 'Organization ID required' });
  }

  const docId = Number(req.params.id);
  if (!Number.isFinite(docId)) {
    return res.status(400).json({ error: 'Invalid document ID' });
  }

  const actorId = Number(req.user?.id);
  const reason = (req.body?.reason as string) || 'Co-author document deleted';
  const client = await getPool().connect();
  try {
    await client.query('BEGIN');

    const pre = await client.query(
      'SELECT * FROM coauthor_documents WHERE id = $1 AND organization_id = $2 FOR UPDATE',
      [docId, organizationId]
    );
    if (!pre.rows.length) {
      await client.query('ROLLBACK');
      return res.status(404).json({ error: 'Document not found' });
    }

    await logRegulatedDeletion(client, {
      table: 'coauthor_documents',
      recordId: docId,
      tenantId: organizationId,
      actorId: Number.isFinite(actorId) ? actorId : null,
      reason,
      snapshot: pre.rows[0],
    });

    const del = await client.query(
      'DELETE FROM coauthor_documents WHERE id = $1 AND organization_id = $2 RETURNING id',
      [docId, organizationId]
    );
    await client.query('COMMIT');
    return res.json({ success: true, deletedId: del.rows[0].id });
  } catch (error: any) {
    try {
      await client.query('ROLLBACK');
    } catch {
      /* connection already broken */
    }
    logger.error('Delete document error', { err: error instanceof Error ? error.message : String(error) });
    return res.status(500).json({ error: 'Failed to delete document', message: 'An unexpected error occurred' });
  } finally {
    client.release();
  }
});

// ── Document Sections CRUD ──────────────────────────────────────────────────

/**
 * GET /api/coauthor/documents/:docId/sections
 * List all sections belonging to a document
 */
router.get('/documents/:docId/sections', authMiddleware, async (req: any, res: Response) => {
  try {
    const organizationId = resolveOrganizationId(req);
    if (!organizationId) {
      return res.status(400).json({ error: 'Organization ID required' });
    }

    const docId = Number(req.params.docId);
    if (!Number.isFinite(docId)) {
      return res.status(400).json({ error: 'Invalid document ID' });
    }

    // Verify document belongs to organization
    const [document] = await db
      .select()
      .from(coauthorDocuments)
      .where(
        and(eq(coauthorDocuments.id, docId), eq(coauthorDocuments.organizationId, organizationId))
      )
      .limit(1);

    if (!document) {
      return res.status(404).json({ error: 'Document not found' });
    }

    // Get sections linked to this document via the sections JSON field or by submissionId
    const sections = await db
      .select()
      .from(coauthorSections)
      .where(
        and(
          eq(coauthorSections.organizationId, organizationId),
          eq(coauthorSections.submissionId, String(docId))
        )
      )
      .orderBy(coauthorSections.moduleNumber, coauthorSections.sectionId);

    return res.json({
      sections,
      total: sections.length,
    });
  } catch (error: any) {
    logger.error('List document sections error', { err: error instanceof Error ? error.message : String(error) });
    return res.status(500).json({ error: 'Failed to fetch sections', message: 'An unexpected error occurred' });
  }
});

/**
 * POST /api/coauthor/documents/:docId/sections
 * Create a new section for a document
 */
router.post('/documents/:docId/sections', authMiddleware, async (req: any, res: Response) => {
  try {
    const organizationId = resolveOrganizationId(req);
    if (!organizationId) {
      return res.status(400).json({ error: 'Organization ID required' });
    }

    const docId = Number(req.params.docId);
    if (!Number.isFinite(docId)) {
      return res.status(400).json({ error: 'Invalid document ID' });
    }

    // Verify document belongs to organization
    const [document] = await db
      .select()
      .from(coauthorDocuments)
      .where(
        and(eq(coauthorDocuments.id, docId), eq(coauthorDocuments.organizationId, organizationId))
      )
      .limit(1);

    if (!document) {
      return res.status(404).json({ error: 'Document not found' });
    }

    const { sectionId, title, moduleNumber, sectionType, x, y, status, connections } =
      req.body || {};

    if (!title) {
      return res.status(400).json({ error: 'title is required' });
    }

    const userId = req.user?.id || req.user?.userId;

    const [section] = await db
      .insert(coauthorSections)
      .values({
        sectionId: sectionId || `sec-${Date.now()}`,
        organizationId,
        submissionId: String(docId),
        title,
        moduleNumber: moduleNumber || null,
        sectionType: sectionType || null,
        x: x || 50,
        y: y || 50,
        status: status || 'pending',
        connections: connections || [],
        createdById: userId ? Number(userId) : null,
      })
      .returning();

    return res.status(201).json({
      success: true,
      section,
    });
  } catch (error: any) {
    logger.error('Create document section error', { err: error instanceof Error ? error.message : String(error) });
    return res.status(500).json({ error: 'Failed to create section', message: 'An unexpected error occurred' });
  }
});

/**
 * PUT /api/coauthor/documents/:docId/sections/:sectionId
 * Update a section's content/metadata
 */
router.put(
  '/documents/:docId/sections/:sectionId',
  authMiddleware,
  async (req: any, res: Response) => {
    try {
      const organizationId = resolveOrganizationId(req);
      if (!organizationId) {
        return res.status(400).json({ error: 'Organization ID required' });
      }

      const docId = Number(req.params.docId);
      const sectionPk = Number(req.params.sectionId);
      if (!Number.isFinite(docId) || !Number.isFinite(sectionPk)) {
        return res.status(400).json({ error: 'Invalid document or section ID' });
      }

      const { title, moduleNumber, sectionType, x, y, status, connections } = req.body || {};

      const updateValues: Record<string, any> = { updatedAt: new Date() };
      if (title !== undefined) updateValues.title = title;
      if (moduleNumber !== undefined) updateValues.moduleNumber = moduleNumber;
      if (sectionType !== undefined) updateValues.sectionType = sectionType;
      if (x !== undefined) updateValues.x = x;
      if (y !== undefined) updateValues.y = y;
      if (status !== undefined) updateValues.status = status;
      if (connections !== undefined) updateValues.connections = connections;

      const userId = req.user?.id || req.user?.userId;
      if (userId) updateValues.lastModifiedBy = Number(userId);

      const [section] = await db
        .update(coauthorSections)
        .set(updateValues)
        .where(
          and(
            eq(coauthorSections.id, sectionPk),
            eq(coauthorSections.organizationId, organizationId),
            eq(coauthorSections.submissionId, String(docId))
          )
        )
        .returning();

      if (!section) {
        return res.status(404).json({ error: 'Section not found' });
      }

      return res.json({
        success: true,
        section,
      });
    } catch (error: any) {
      logger.error('Update document section error', { err: error instanceof Error ? error.message : String(error) });
      return res.status(500).json({ error: 'Failed to update section', message: 'An unexpected error occurred' });
    }
  }
);

/**
 * DELETE /api/coauthor/documents/:docId/sections/:sectionId
 * Delete a section from a document
 */
router.delete(
  '/documents/:docId/sections/:sectionId',
  authMiddleware,
  async (req: any, res: Response) => {
    try {
      const organizationId = resolveOrganizationId(req);
      if (!organizationId) {
        return res.status(400).json({ error: 'Organization ID required' });
      }

      const docId = Number(req.params.docId);
      const sectionPk = Number(req.params.sectionId);
      if (!Number.isFinite(docId) || !Number.isFinite(sectionPk)) {
        return res.status(400).json({ error: 'Invalid document or section ID' });
      }

      const [deleted] = await db
        .delete(coauthorSections)
        .where(
          and(
            eq(coauthorSections.id, sectionPk),
            eq(coauthorSections.organizationId, organizationId),
            eq(coauthorSections.submissionId, String(docId))
          )
        )
        .returning();

      if (!deleted) {
        return res.status(404).json({ error: 'Section not found' });
      }

      return res.json({ success: true, deletedId: deleted.id });
    } catch (error: any) {
      logger.error('Delete document section error', { err: error instanceof Error ? error.message : String(error) });
      return res.status(500).json({ error: 'Failed to delete section', message: 'An unexpected error occurred' });
    }
  }
);

// ── Document Validation, Compilation & Compliance ───────────────────────────

// ICH M4 eCTD module structure definition
const ECTD_MODULE_STRUCTURE: Record<string, { title: string; requiredSections: string[] }> = {
  '1': {
    title: 'Administrative Information and Prescribing Information',
    requiredSections: ['1.1', '1.2', '1.3'],
  },
  '2': {
    title: 'Common Technical Document Summaries',
    requiredSections: ['2.1', '2.2', '2.3', '2.4', '2.5', '2.6', '2.7'],
  },
  '3': {
    title: 'Quality',
    requiredSections: ['3.2.S', '3.2.P'],
  },
  '4': {
    title: 'Nonclinical Study Reports',
    requiredSections: ['4.2.1', '4.2.2', '4.2.3'],
  },
  '5': {
    title: 'Clinical Study Reports',
    requiredSections: ['5.2', '5.3'],
  },
};

/**
 * POST /api/coauthor/documents/:docId/validate
 * Validate document against eCTD structural rules
 */
router.post('/documents/:docId/validate', authMiddleware, async (req: any, res: Response) => {
  try {
    const organizationId = resolveOrganizationId(req);
    if (!organizationId) {
      return res.status(400).json({ error: 'Organization ID required' });
    }

    const docId = Number(req.params.docId);
    if (!Number.isFinite(docId)) {
      return res.status(400).json({ error: 'Invalid document ID' });
    }

    // Fetch the document
    const [document] = await db
      .select()
      .from(coauthorDocuments)
      .where(
        and(eq(coauthorDocuments.id, docId), eq(coauthorDocuments.organizationId, organizationId))
      )
      .limit(1);

    if (!document) {
      return res.status(404).json({ error: 'Document not found' });
    }

    // Fetch all sections for this document
    const sections = await db
      .select()
      .from(coauthorSections)
      .where(
        and(
          eq(coauthorSections.organizationId, organizationId),
          eq(coauthorSections.submissionId, String(docId))
        )
      );

    const sectionModules = sections.map(s => s.moduleNumber).filter(Boolean);
    const sectionIds = sections.map(s => s.sectionId);

    const findings: any[] = [];

    // 1. Check module structure — which eCTD modules are covered
    const documentModule = document.moduleNumber?.split('.')[0] || null;
    const relevantModules = documentModule
      ? { [documentModule]: ECTD_MODULE_STRUCTURE[documentModule] }
      : ECTD_MODULE_STRUCTURE;

    for (const [modNum, modDef] of Object.entries(relevantModules)) {
      if (!modDef) continue;
      for (const reqSection of modDef.requiredSections) {
        const found =
          sectionIds.some(sid => sid.startsWith(reqSection)) ||
          sectionModules.some(mn => mn && mn.startsWith(reqSection));
        if (!found) {
          findings.push({
            type: 'missing-section',
            severity: 'error',
            module: modNum,
            sectionId: reqSection,
            message: `Required eCTD section ${reqSection} is missing from Module ${modNum} (${modDef.title}).`,
          });
        }
      }
    }

    // 2. Check cross-references — validate that connections point to existing sections
    for (const section of sections) {
      const connections: string[] = (section.connections as string[]) || [];
      for (const connId of connections) {
        const targetExists =
          sectionIds.includes(connId) || sections.some(s => String(s.id) === connId);
        if (!targetExists) {
          findings.push({
            type: 'broken-reference',
            severity: 'warning',
            sectionId: section.sectionId,
            message: `Section "${section.title}" (${section.sectionId}) references "${connId}" which does not exist.`,
          });
        }
      }
    }

    // 3. Check section statuses
    const incompleteSections = sections.filter(
      s => s.status === 'pending' || s.status === 'critical'
    );
    for (const sec of incompleteSections) {
      findings.push({
        type: 'incomplete-section',
        severity: sec.status === 'critical' ? 'error' : 'warning',
        sectionId: sec.sectionId,
        message: `Section "${sec.title}" (${sec.sectionId}) has status "${sec.status}".`,
      });
    }

    // 4. Check document-level content
    const docContent = document.content || '';
    if (docContent.trim().length === 0 && sections.length === 0) {
      findings.push({
        type: 'empty-document',
        severity: 'error',
        message: 'Document has no content and no sections.',
      });
    }

    const errorCount = findings.filter(f => f.severity === 'error').length;
    const warningCount = findings.filter(f => f.severity === 'warning').length;
    const isValid = errorCount === 0;

    return res.json({
      success: true,
      validation: {
        documentId: docId,
        isValid,
        errorCount,
        warningCount,
        totalSections: sections.length,
        findings,
        validatedAt: new Date().toISOString(),
      },
    });
  } catch (error: any) {
    logger.error('Validate document error', { err: error instanceof Error ? error.message : String(error) });
    return res.status(500).json({ error: 'Failed to validate document', message: 'An unexpected error occurred' });
  }
});

/**
 * POST /api/coauthor/documents/:docId/compile
 * Compile a document into eCTD module structure
 */
router.post('/documents/:docId/compile', authMiddleware, async (req: any, res: Response) => {
  try {
    const organizationId = resolveOrganizationId(req);
    if (!organizationId) {
      return res.status(400).json({ error: 'Organization ID required' });
    }

    const docId = Number(req.params.docId);
    if (!Number.isFinite(docId)) {
      return res.status(400).json({ error: 'Invalid document ID' });
    }

    // Fetch the document
    const [document] = await db
      .select()
      .from(coauthorDocuments)
      .where(
        and(eq(coauthorDocuments.id, docId), eq(coauthorDocuments.organizationId, organizationId))
      )
      .limit(1);

    if (!document) {
      return res.status(404).json({ error: 'Document not found' });
    }

    // Fetch all sections for this document
    const sections = await db
      .select()
      .from(coauthorSections)
      .where(
        and(
          eq(coauthorSections.organizationId, organizationId),
          eq(coauthorSections.submissionId, String(docId))
        )
      )
      .orderBy(coauthorSections.moduleNumber, coauthorSections.sectionId);

    // Organize sections into eCTD module tree
    const moduleTree: Record<string, any> = {};

    for (const section of sections) {
      const modNum = section.moduleNumber?.split('.')[0] || 'unassigned';
      if (!moduleTree[modNum]) {
        const modDef = ECTD_MODULE_STRUCTURE[modNum];
        moduleTree[modNum] = {
          moduleNumber: modNum,
          title: modDef?.title || `Module ${modNum}`,
          sections: [],
        };
      }
      moduleTree[modNum].sections.push({
        id: section.id,
        sectionId: section.sectionId,
        title: section.title,
        moduleNumber: section.moduleNumber,
        sectionType: section.sectionType,
        status: section.status,
        connections: section.connections,
      });
    }

    // Build compiled output
    const compiledStructure = {
      documentId: docId,
      title: document.title,
      ectdVersion: '3.2.2',
      region: 'US',
      modules: Object.values(moduleTree),
      documentContent: document.content || '',
      metadata: {
        compiledAt: new Date().toISOString(),
        totalSections: sections.length,
        completedSections: sections.filter(s => s.status === 'complete').length,
        documentStatus: document.status,
      },
    };

    // Update document status to indicate compilation
    await db
      .update(coauthorDocuments)
      .set({
        updatedAt: new Date(),
        metadata: {
          ...((document.metadata as any) || {}),
          lastCompiledAt: new Date().toISOString(),
        },
      })
      .where(eq(coauthorDocuments.id, docId));

    return res.json({
      success: true,
      compiled: compiledStructure,
    });
  } catch (error: any) {
    logger.error('Compile document error', { err: error instanceof Error ? error.message : String(error) });
    return res.status(500).json({ error: 'Failed to compile document', message: 'An unexpected error occurred' });
  }
});

/**
 * GET /api/coauthor/documents/:docId/compliance
 * Check ICH M4 compliance for a document
 */
router.get('/documents/:docId/compliance', authMiddleware, async (req: any, res: Response) => {
  try {
    const organizationId = resolveOrganizationId(req);
    if (!organizationId) {
      return res.status(400).json({ error: 'Organization ID required' });
    }

    const docId = Number(req.params.docId);
    if (!Number.isFinite(docId)) {
      return res.status(400).json({ error: 'Invalid document ID' });
    }

    // Fetch the document
    const [document] = await db
      .select()
      .from(coauthorDocuments)
      .where(
        and(eq(coauthorDocuments.id, docId), eq(coauthorDocuments.organizationId, organizationId))
      )
      .limit(1);

    if (!document) {
      return res.status(404).json({ error: 'Document not found' });
    }

    // Fetch all sections
    const sections = await db
      .select()
      .from(coauthorSections)
      .where(
        and(
          eq(coauthorSections.organizationId, organizationId),
          eq(coauthorSections.submissionId, String(docId))
        )
      );

    const sectionIds = sections.map(s => s.sectionId);
    const sectionModules = sections.map(s => s.moduleNumber).filter(Boolean);

    // ICH M4 compliance checks
    const checks: any[] = [];

    // M4 Organisation of the CTD checks
    const m4Rules = [
      {
        rule: 'M4-001',
        description: 'Module 1 regional administrative information present',
        module: '1',
      },
      { rule: 'M4-002', description: 'Module 2 CTD summaries present', module: '2' },
      { rule: 'M4-003', description: 'Module 3 quality data present', module: '3' },
      {
        rule: 'M4-004',
        description: 'Module 2.5 Clinical Overview or Module 2.7 Clinical Summary present',
        module: '2.5',
      },
      { rule: 'M4-005', description: 'Module 3.2.S Drug Substance present', module: '3.2.S' },
      { rule: 'M4-006', description: 'Module 3.2.P Drug Product present', module: '3.2.P' },
    ];

    for (const rule of m4Rules) {
      const covered =
        sectionIds.some(sid => sid.startsWith(rule.module)) ||
        sectionModules.some(mn => mn && mn.startsWith(rule.module));

      checks.push({
        ruleId: rule.rule,
        description: rule.description,
        status: covered ? 'compliant' : 'non-compliant',
        module: rule.module,
      });
    }

    // Document-level checks
    checks.push({
      ruleId: 'M4-DOC-001',
      description: 'Document has a title',
      status: document.title ? 'compliant' : 'non-compliant',
    });

    checks.push({
      ruleId: 'M4-DOC-002',
      description: 'Document has content or sections',
      status:
        (document.content && document.content.trim().length > 0) || sections.length > 0
          ? 'compliant'
          : 'non-compliant',
    });

    checks.push({
      ruleId: 'M4-DOC-003',
      description: 'All sections have assigned module numbers',
      status: sections.every(s => s.moduleNumber) ? 'compliant' : 'non-compliant',
    });

    const compliantCount = checks.filter(c => c.status === 'compliant').length;
    const totalChecks = checks.length;
    const complianceScore = totalChecks > 0 ? Math.round((compliantCount / totalChecks) * 100) : 0;

    return res.json({
      success: true,
      compliance: {
        documentId: docId,
        standard: 'ICH M4',
        complianceScore,
        totalChecks,
        compliantCount,
        nonCompliantCount: totalChecks - compliantCount,
        checks,
        checkedAt: new Date().toISOString(),
      },
    });
  } catch (error: any) {
    logger.error('Compliance check error', { err: error instanceof Error ? error.message : String(error) });
    return res.status(500).json({ error: 'Failed to check compliance', message: 'An unexpected error occurred' });
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
