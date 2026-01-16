
import express from 'express';
import { db } from '../db/index.js';
import { fda510kDocuments, fda510kProjects, projects } from '../../shared/schema.ts';
import { eq, and } from 'drizzle-orm';
import { requireTenant } from '../middleware/tenant.js';

const router = express.Router();

// Tenant enforcement (JWT in production; header fallback only in dev/demo)
router.use(requireTenant());

// Save document sections
router.post('/documents/:projectId/save', async (req, res) => {
  try {
    const { projectId } = req.params;
    const { documentType, sections, metadata } = req.body;
    const organizationId = req.organizationId;
    const userId = req.user?.id ?? null;

    if (!documentType) {
      return res.status(400).json({ error: 'documentType is required' });
    }

    const normalizedProjectId = parseInt(projectId);
    if (!Number.isFinite(normalizedProjectId)) {
      return res.status(400).json({ error: 'Invalid projectId' });
    }

    // fda_510k_documents.project_id references fda_510k_projects.id (not projects.id)
    // Map the base project (projects.id) to the corresponding 510(k) project row.
    const existing510kRows = await db
      .select({ id: fda510kProjects.id })
      .from(fda510kProjects)
      .where(
        and(
          eq(fda510kProjects.organizationId, organizationId),
          eq(fda510kProjects.projectId, normalizedProjectId)
        )
      )
      .limit(1);

    let fda510kProjectId = existing510kRows?.[0]?.id;
    if (!fda510kProjectId) {
      // Ensure the base project exists for this tenant
      const baseRows = await db
        .select({ id: projects.id, name: projects.name })
        .from(projects)
        .where(and(eq(projects.id, normalizedProjectId), eq(projects.organizationId, organizationId)))
        .limit(1);

      if (!baseRows?.length) {
        return res.status(404).json({ error: 'Project not found' });
      }

      const baseProjectName = baseRows[0].name ?? 'Untitled Device';

      // Create the 510(k) project row
      const createdRows = await db
        .insert(fda510kProjects)
        .values({
          organizationId,
          projectId: normalizedProjectId,
          deviceName: baseProjectName,
          currentStage: 1,
          currentStageProgress: 0,
          overallProgress: 0,
          status: 'active',
          hasSoftware: false,
          hasBiocompatibility: true,
          hasClinicalData: false,
          metadata: { autoCreated: true, source: 'cerv2-documents:save' },
        })
        .returning({ id: fda510kProjects.id });

      fda510kProjectId = createdRows?.[0]?.id;
    }

    const documentId = `${normalizedProjectId}:${documentType}`;
    const documentName = documentType === 'cerv2_510k'
      ? 'FDA 510(k) Submission'
      : documentType === 'cerv2_pma'
        ? 'FDA PMA Application'
        : documentType === 'cer'
          ? 'Clinical Evaluation Report'
          : `Document: ${documentType}`;

    const [document] = await db
      .insert(fda510kDocuments)
      .values({
        organizationId,
        projectId: fda510kProjectId,
        documentId,
        documentType,
        documentName,
        // Store the editor state as structured JSON for future traceability
        formData: { sections: sections || {}, metadata: metadata || {} },
        status: 'draft',
        version: 1,
        createdBy: userId,
        updatedBy: userId,
        updatedAt: new Date(),
      })
      .onConflictDoUpdate({
        target: [fda510kDocuments.documentId],
        set: {
          formData: { sections: sections || {}, metadata: metadata || {} },
          updatedBy: userId,
          updatedAt: new Date(),
        }
      })
      .returning();

    res.json({ 
      success: true, 
      documentId: document.documentId,
      message: 'Document saved successfully' 
    });
  } catch (error) {
    console.error('Error saving document:', error);
    res.status(500).json({ error: error.message });
  }
});

// Load document sections
router.get('/documents/:projectId/:documentType', async (req, res) => {
  try {
    const { projectId, documentType } = req.params;
    const organizationId = req.organizationId;

    const normalizedProjectId = parseInt(projectId);
    if (!Number.isFinite(normalizedProjectId)) {
      return res.status(400).json({ error: 'Invalid projectId' });
    }

    const existing510kRows = await db
      .select({ id: fda510kProjects.id })
      .from(fda510kProjects)
      .where(
        and(
          eq(fda510kProjects.organizationId, organizationId),
          eq(fda510kProjects.projectId, normalizedProjectId)
        )
      )
      .limit(1);

    const fda510kProjectId = existing510kRows?.[0]?.id;
    if (!fda510kProjectId) {
      return res.status(404).json({ error: 'Document not found' });
    }

    const rows = await db
      .select()
      .from(fda510kDocuments)
      .where(
        and(
          eq(fda510kDocuments.projectId, fda510kProjectId),
          eq(fda510kDocuments.documentType, documentType),
          eq(fda510kDocuments.organizationId, organizationId)
        )
      )
      .limit(1);

    const document = rows?.[0];

    if (!document) {
      return res.status(404).json({ error: 'Document not found' });
    }

    res.json({
      success: true,
      documentId: document.documentId,
      documentType: document.documentType,
      documentName: document.documentName,
      status: document.status,
      sections: document.formData?.sections || {},
      metadata: document.formData?.metadata || {},
      updatedAt: document.updatedAt,
    });
  } catch (error) {
    console.error('Error loading document:', error);
    res.status(500).json({ error: error.message });
  }
});

export default router;
