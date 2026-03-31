/**
 * Evidence Management API Routes
 * Enhanced routes for FDA 510(k) evidence file management with intelligent features
 */

import { Router, Request, Response } from 'express';
import multer from 'multer';
import { db } from '../db';
import { sql } from 'drizzle-orm';
import EvidenceManagementService from '../services/EvidenceManagementService';

import { extractWithTika } from '../services/ingestion/tikaClient';
import { extractWithGrobid, looksScholarlyDocument } from '../services/literature/grobidClient';
import { indexGovernedDocument } from '../services/search/opensearchClient';

const router = Router();
const evidenceService = new EvidenceManagementService();

// Configure multer for file uploads
const storage = multer.memoryStorage();
const upload = multer({
  storage: storage,
  limits: {
    fileSize: 50 * 1024 * 1024 // 50MB limit
  }
});

// Middleware to get organization ID
router.use((req: Request, res: Response, next) => {
  const parsedOrgId = parseInt(req.headers['x-organization-id'] as string);
  if (!parsedOrgId) {
    return res.status(401).json({ error: 'Organization context required' });
  }
  req.organizationId = parsedOrgId;
  next();
});

/**
 * GET /api/evidence-management/requirements/:projectId
 * Get requirement status and mapping for a project
 */
router.get('/requirements/:projectId', async (req: Request, res: Response) => {
  try {
    const { projectId } = req.params;
    const organizationId = req.organizationId;

    // Get all files mapped to requirements
    const files = await db.execute(sql`
      SELECT 
        fda_requirement,
        fda_section,
        regulatory_status,
        COUNT(*) as file_count,
        COUNT(CASE WHEN regulatory_status = 'approved' THEN 1 END) as approved_count
      FROM device_data_center
      WHERE 
        project_id = ${projectId}
        AND organization_id = ${organizationId}
      GROUP BY fda_requirement, fda_section, regulatory_status
    `);

    // Calculate completion status
    const requirements: any = {};
    const totalRequired = 8; // Number of required FDA categories
    let completedCount = 0;

    // Process files by requirement
    for (const file of files) {
      if (!requirements[file.fda_requirement]) {
        requirements[file.fda_requirement] = {
          total: 0,
          approved: 0,
          sections: {}
        };
      }
      
      requirements[file.fda_requirement].total += parseInt(file.file_count);
      requirements[file.fda_requirement].approved += parseInt(file.approved_count);
      
      if (file.fda_section) {
        requirements[file.fda_requirement].sections[file.fda_section] = {
          count: file.file_count,
          approved: file.approved_count,
          status: file.regulatory_status
        };
      }
    }

    // Check which requirements are complete
    for (const req of Object.keys(requirements)) {
      if (requirements[req].approved > 0) {
        completedCount++;
      }
    }

    res.json({
      requirements,
      completed: completedCount,
      total: totalRequired,
      percentage: Math.round((completedCount / totalRequired) * 100),
      projectId,
      timestamp: new Date().toISOString()
    });

  } catch (error) {
    console.error('[Evidence Management] Error fetching requirements:', error);
    res.status(500).json({ error: 'Failed to fetch requirement status' });
  }
});

/**
 * POST /api/evidence-management/upload
 * Upload evidence files with requirement mapping
 */
router.post('/upload', upload.array('files', 10), async (req: Request, res: Response) => {
  try {
    const files = req.files as Express.Multer.File[];
    const { fda_requirement, fda_section, workflow_stage, project_id } = req.body;
    const organizationId = req.organizationId;

    if (!files || files.length === 0) {
      return res.status(400).json({ error: 'No files provided' });
    }

    const uploadedFiles = [];

    for (const file of files) {
      const tikaResult = await extractWithTika({
        buffer: file.buffer,
        filename: file.originalname,
        mimeType: file.mimetype,
      }).catch(() => null);

      const fallbackContent = file.buffer.toString('utf8').substring(0, 10000);
      const fileContent = (tikaResult?.text || fallbackContent).substring(0, 10000);

      const grobidResult = looksScholarlyDocument(file.originalname, fileContent)
        ? await extractWithGrobid({ buffer: file.buffer, filename: file.originalname }).catch(() => null)
        : null;

      const extractedData = await evidenceService.extractDataFromFile(
        fileContent,
        file.originalname,
        file.mimetype
      );

      // Create file record
      const fileId = `file_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
      
      await db.execute(sql`
        INSERT INTO device_data_center (
          id,
          file_name,
          file_size,
          file_type,
          file_path,
          organization_id,
          project_id,
          fda_requirement,
          fda_section,
          workflow_stage,
          extracted_data,
          searchable_content,
          regulatory_status,
          created_at,
          updated_at
        ) VALUES (
          ${fileId},
          ${file.originalname},
          ${file.size},
          ${file.mimetype},
          ${`/uploads/${fileId}`},
          ${organizationId},
          ${project_id || null},
          ${fda_requirement || extractedData.test_type},
          ${fda_section || null},
          ${workflow_stage || null},
          ${JSON.stringify({ ...extractedData, tika: tikaResult?.metadata || null, grobid: grobidResult || null, parser: tikaResult ? 'tika' : 'legacy_fallback' })}::jsonb,
          ${fileContent.substring(0, 5000)},
          'draft',
          NOW(),
          NOW()
        )
      `);

      // If no requirement was specified, try to auto-map
      if (!fda_requirement) {
        await evidenceService.mapToFDARequirements(fileId, extractedData);
      }

      await indexGovernedDocument({
        id: fileId,
        organizationId,
        projectId: project_id ? Number(project_id) : null,
        artifactId: null,
        docType: 'evidence_document',
        title: file.originalname,
        source: 'evidence-management-upload',
        provenance: 'device_data_center',
        tags: [fda_requirement || extractedData.test_type || 'evidence'],
        lifecycleState: 'draft',
        content: fileContent,
      }).catch(() => undefined);

      uploadedFiles.push({
        id: fileId,
        name: file.originalname,
        size: file.size,
        extractedData: {
          ...extractedData,
          parser: tikaResult ? 'tika' : 'legacy_fallback',
          scholarly: Boolean(grobidResult),
          references: grobidResult?.references?.length || 0,
        },
        fdaRequirement: fda_requirement || extractedData.test_type
      });
    }

    res.json({
      success: true,
      files: uploadedFiles,
      count: uploadedFiles.length,
      message: `Successfully uploaded ${uploadedFiles.length} file(s)`
    });

  } catch (error) {
    console.error('[Evidence Management] Upload error:', error);
    res.status(500).json({ error: 'Failed to upload files' });
  }
});

/**
 * GET /api/evidence-management/gap-analysis/:projectId
 * Perform gap analysis for a project
 */
router.get('/gap-analysis/:projectId', async (req: Request, res: Response) => {
  try {
    const { projectId } = req.params;
    const organizationId = req.organizationId;

    const analysis = await evidenceService.performGapAnalysis(projectId, organizationId);

    res.json({
      success: true,
      projectId,
      analysis,
      timestamp: new Date().toISOString()
    });

  } catch (error) {
    console.error('[Evidence Management] Gap analysis error:', error);
    res.status(500).json({ error: 'Failed to perform gap analysis' });
  }
});

/**
 * POST /api/evidence-management/generate-citations
 * Generate citations for selected files
 */
router.post('/generate-citations', async (req: Request, res: Response) => {
  try {
    const { fileIds, format = 'custom' } = req.body;

    if (!fileIds || !Array.isArray(fileIds)) {
      return res.status(400).json({ error: 'File IDs required' });
    }

    const citations = await evidenceService.generateCitations(fileIds, format);

    res.json({
      success: true,
      citations,
      count: citations.length
    });

  } catch (error) {
    console.error('[Evidence Management] Citation generation error:', error);
    res.status(500).json({ error: 'Failed to generate citations' });
  }
});

/**
 * POST /api/evidence-management/link-workflow
 * Link evidence to workflow stage
 */
router.post('/link-workflow', async (req: Request, res: Response) => {
  try {
    const { fileId, workflowStage, stageData } = req.body;

    await evidenceService.linkToWorkflowStage(fileId, workflowStage, stageData || {});

    res.json({
      success: true,
      message: `File linked to workflow stage ${workflowStage}`
    });

  } catch (error) {
    console.error('[Evidence Management] Workflow linking error:', error);
    res.status(500).json({ error: 'Failed to link to workflow' });
  }
});

/**
 * GET /api/evidence-management/stage-evidence/:projectId/:stage
 * Get evidence for a specific workflow stage
 */
router.get('/stage-evidence/:projectId/:stage', async (req: Request, res: Response) => {
  try {
    const { projectId, stage } = req.params;

    const evidence = await evidenceService.getStageEvidence(projectId, parseInt(stage));

    res.json({
      success: true,
      projectId,
      stage: parseInt(stage),
      evidence,
      count: evidence.length
    });

  } catch (error) {
    console.error('[Evidence Management] Stage evidence error:', error);
    res.status(500).json({ error: 'Failed to fetch stage evidence' });
  }
});

/**
 * POST /api/evidence-management/auto-populate/:formId
 * Auto-populate form from evidence
 */
router.post('/auto-populate/:formId', async (req: Request, res: Response) => {
  try {
    const { formId } = req.params;
    const { projectId } = req.body;

    const formData = await evidenceService.autoPopulateForm(formId, projectId);

    res.json({
      success: true,
      formId,
      formData,
      fieldsPopulated: Object.keys(formData).length
    });

  } catch (error) {
    console.error('[Evidence Management] Auto-populate error:', error);
    res.status(500).json({ error: 'Failed to auto-populate form' });
  }
});

/**
 * POST /api/evidence-management/review/submit/:fileId
 * Submit evidence for review
 */
router.post('/review/submit/:fileId', async (req: Request, res: Response) => {
  try {
    const { fileId } = req.params;
    const { reviewerId } = req.body;

    await evidenceService.submitForReview(fileId, reviewerId || 'system');

    res.json({
      success: true,
      message: 'Evidence submitted for review'
    });

  } catch (error) {
    console.error('[Evidence Management] Review submission error:', error);
    res.status(500).json({ error: 'Failed to submit for review' });
  }
});

/**
 * POST /api/evidence-management/review/approve/:fileId
 * Approve evidence
 */
router.post('/review/approve/:fileId', async (req: Request, res: Response) => {
  try {
    const { fileId } = req.params;
    const { reviewerId, comments } = req.body;

    await evidenceService.approveEvidence(fileId, reviewerId || 'system', comments);

    res.json({
      success: true,
      message: 'Evidence approved'
    });

  } catch (error) {
    console.error('[Evidence Management] Approval error:', error);
    res.status(500).json({ error: 'Failed to approve evidence' });
  }
});

/**
 * POST /api/evidence-management/review/request-changes/:fileId
 * Request changes to evidence
 */
router.post('/review/request-changes/:fileId', async (req: Request, res: Response) => {
  try {
    const { fileId } = req.params;
    const { reviewerId, comments } = req.body;

    if (!comments) {
      return res.status(400).json({ error: 'Comments required for change request' });
    }

    await evidenceService.requestChanges(fileId, reviewerId || 'system', comments);

    res.json({
      success: true,
      message: 'Changes requested'
    });

  } catch (error) {
    console.error('[Evidence Management] Change request error:', error);
    res.status(500).json({ error: 'Failed to request changes' });
  }
});

/**
 * GET /api/evidence-management/export/:projectId
 * Export evidence package for submission
 */
router.get('/export/:projectId', async (req: Request, res: Response) => {
  try {
    const { projectId } = req.params;
    const organizationId = req.organizationId;

    const evidencePackage = await evidenceService.exportEvidencePackage(projectId, organizationId);

    res.json({
      success: true,
      package: evidencePackage
    });

  } catch (error) {
    console.error('[Evidence Management] Export error:', error);
    res.status(500).json({ error: 'Failed to export evidence package' });
  }
});

/**
 * GET /api/evidence-management/analytics/:projectId
 * Get evidence analytics for a project
 */
router.get('/analytics/:projectId', async (req: Request, res: Response) => {
  try {
    const { projectId } = req.params;
    const organizationId = req.organizationId;

    const analytics = await db.execute(sql`
      SELECT 
        COUNT(*) as total_files,
        COUNT(CASE WHEN regulatory_status = 'approved' THEN 1 END) as approved_files,
        COUNT(CASE WHEN regulatory_status = 'under_review' THEN 1 END) as under_review,
        COUNT(CASE WHEN regulatory_status = 'draft' THEN 1 END) as draft_files,
        COUNT(DISTINCT fda_requirement) as requirements_covered,
        COUNT(CASE WHEN fda_requirement IS NULL THEN 1 END) as unmapped_files
      FROM device_data_center
      WHERE 
        project_id = ${projectId}
        AND organization_id = ${organizationId}
    `);

    // Get gap analysis
    const gapAnalysis = await evidenceService.performGapAnalysis(projectId, organizationId);

    res.json({
      success: true,
      projectId,
      totalFiles: parseInt(analytics[0]?.total_files || 0),
      approvedFiles: parseInt(analytics[0]?.approved_files || 0),
      underReview: parseInt(analytics[0]?.under_review || 0),
      draftFiles: parseInt(analytics[0]?.draft_files || 0),
      requirementsCovered: parseInt(analytics[0]?.requirements_covered || 0),
      unmappedFiles: parseInt(analytics[0]?.unmapped_files || 0),
      gaps: gapAnalysis.gaps.length,
      completeness: gapAnalysis.completeness
    });

  } catch (error) {
    console.error('[Evidence Management] Analytics error:', error);
    res.status(500).json({ error: 'Failed to fetch analytics' });
  }
});

export default router;