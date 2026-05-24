/**
 * Evidence Management API Routes
 * Enhanced routes for FDA 510(k) evidence file management with intelligent features
 */

import { Router, Request, Response } from 'express';
import multer from 'multer';
import fs from 'fs/promises';
import path from 'path';
import { db } from '../db';
import { sql } from 'drizzle-orm';
import EvidenceManagementService from '../services/EvidenceManagementService';
import { getSecureOrgId } from '../utils/tenantContext';
import { extractWithTika } from '../services/ingestion/tikaClient';
import { extractWithGrobid, looksScholarlyDocument } from '../services/literature/grobidClient';
import { indexGovernedDocument } from '../services/search/opensearchClient';

import { createScopedLogger } from '../utils/logger.js';

const logger = createScopedLogger('evidence-management');

const router = Router();
const evidenceService = new EvidenceManagementService();

// Configure multer for file uploads
const evidenceUploadDir = path.join(process.cwd(), 'uploads', 'evidence');
const storage = multer.diskStorage({
  destination: async (_req, _file, cb) => {
    try {
      await fs.mkdir(evidenceUploadDir, { recursive: true });
      cb(null, evidenceUploadDir);
    } catch (error) {
      cb(error as Error, evidenceUploadDir);
    }
  },
  filename: (_req, file, cb) => {
    const safeName = file.originalname.replace(/[^a-zA-Z0-9._-]/g, '_');
    cb(null, `${Date.now()}-${safeName}`);
  },
});
const ALLOWED_UPLOAD_MIME_TYPES = new Set([
  'application/pdf',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'application/msword',
  'text/plain',
  'text/csv',
]);
const upload = multer({
  storage: storage,
  limits: {
    fileSize: 10 * 1024 * 1024, // 10MB per file
    files: 5,
  },
  fileFilter: (_req, file, cb) => {
    if (!ALLOWED_UPLOAD_MIME_TYPES.has(file.mimetype)) {
      return cb(new Error(`Unsupported file type: ${file.mimetype}`));
    }
    cb(null, true);
  },
});

// Middleware to get organization ID
router.use((req: Request, res: Response, next) => {
  const orgId = getSecureOrgId(req);
  const parsedOrgId = orgId ? parseInt(orgId, 10) : NaN;
  if (!parsedOrgId || Number.isNaN(parsedOrgId)) {
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
    const projectId = String(req.params.projectId);
    // Router-level middleware (above) guarantees req.organizationId is a valid number.
    const organizationId = req.organizationId as number;

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

    // Process files by requirement (raw SQL rows are untyped)
    for (const file of files.rows as any[]) {
      if (!requirements[file.fda_requirement]) {
        requirements[file.fda_requirement] = {
          total: 0,
          approved: 0,
          sections: {},
        };
      }

      requirements[file.fda_requirement].total += parseInt(file.file_count);
      requirements[file.fda_requirement].approved += parseInt(file.approved_count);

      if (file.fda_section) {
        requirements[file.fda_requirement].sections[file.fda_section] = {
          count: file.file_count,
          approved: file.approved_count,
          status: file.regulatory_status,
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
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    logger.error('Error fetching requirements', { err: error instanceof Error ? error.message : String(error) });
    res.status(500).json({ error: 'Failed to fetch requirement status' });
  }
});

/**
 * POST /api/evidence-management/upload
 * Upload evidence files with requirement mapping
 */
router.post('/upload', upload.array('files', 5), async (req: Request, res: Response) => {
  try {
    const files = req.files as Express.Multer.File[];
    const { fda_requirement, fda_section, workflow_stage, project_id } = req.body;
    // Router-level middleware (above) guarantees req.organizationId is a valid number.
    const organizationId = req.organizationId as number;

    if (!files || files.length === 0) {
      return res.status(400).json({ error: 'No files provided' });
    }

    const uploadedFiles = [];

    for (const file of files) {
      try {
        // Read file buffer from disk (secure disk storage from PR #311)
        const rawContent = await fs.readFile(file.path);
        const fileContent = rawContent.toString('utf8').substring(0, 10000);

        // Tika extraction pipeline (non-blocking)
        const tikaResult = await extractWithTika({
          buffer: rawContent,
          filename: file.originalname,
          mimeType: file.mimetype,
        }).catch(() => null);

        // GROBID scholarly extraction for PDFs that look like papers/CSRs (non-blocking)
        const grobidResult = looksScholarlyDocument(
          file.originalname,
          tikaResult?.text || fileContent
        )
          ? await extractWithGrobid({ buffer: rawContent, filename: file.originalname }).catch(
              () => null
            )
          : null;

        const extractedData = await evidenceService.extractDataFromFile(
          tikaResult?.text || fileContent,
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
          ${JSON.stringify(extractedData)}::jsonb,
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

        // Index in OpenSearch for governed full-text search (non-blocking)
        indexGovernedDocument({
          id: fileId,
          organizationId,
          projectId: project_id ? Number(project_id) : null,
          docType: 'evidence',
          section: fda_section || null,
          title: file.originalname,
          source: 'evidence-upload',
          tags: [fda_requirement, file.mimetype].filter(Boolean) as string[],
          lifecycleState: 'draft',
          content: tikaResult?.text || fileContent,
          createdAt: new Date().toISOString(),
        }).catch(() => undefined);

        uploadedFiles.push({
          id: fileId,
          name: file.originalname,
          size: file.size,
          extractedData,
          tikaParser: tikaResult?.parser ?? null,
          grobidTitle: grobidResult?.title ?? null,
          fdaRequirement: fda_requirement || extractedData.test_type,
        });
      } finally {
        await fs.unlink(file.path).catch(() => {
          // Best effort temp-file cleanup
        });
      }
    }

    res.json({
      success: true,
      files: uploadedFiles,
      count: uploadedFiles.length,
      message: `Successfully uploaded ${uploadedFiles.length} file(s)`,
    });
  } catch (error) {
    logger.error('Upload error', { err: error instanceof Error ? error.message : String(error) });
    res.status(500).json({ error: 'Failed to upload files' });
  }
});

/**
 * GET /api/evidence-management/gap-analysis/:projectId
 * Perform gap analysis for a project
 */
router.get('/gap-analysis/:projectId', async (req: Request, res: Response) => {
  try {
    const projectId = String(req.params.projectId);
    // Router-level middleware (above) guarantees req.organizationId is a valid number.
    const organizationId = req.organizationId as number;

    const analysis = await evidenceService.performGapAnalysis(projectId, organizationId);

    res.json({
      success: true,
      projectId,
      analysis,
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    logger.error('Gap analysis error', { err: error instanceof Error ? error.message : String(error) });
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
      count: citations.length,
    });
  } catch (error) {
    logger.error('Citation generation error', { err: error instanceof Error ? error.message : String(error) });
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
      message: `File linked to workflow stage ${workflowStage}`,
    });
  } catch (error) {
    logger.error('Workflow linking error', { err: error instanceof Error ? error.message : String(error) });
    res.status(500).json({ error: 'Failed to link to workflow' });
  }
});

/**
 * GET /api/evidence-management/stage-evidence/:projectId/:stage
 * Get evidence for a specific workflow stage
 */
router.get('/stage-evidence/:projectId/:stage', async (req: Request, res: Response) => {
  try {
    const projectId = String(req.params.projectId);
    const stage = String(req.params.stage);

    const evidence = await evidenceService.getStageEvidence(projectId, parseInt(stage));

    res.json({
      success: true,
      projectId,
      stage: parseInt(stage),
      evidence,
      count: evidence.rows.length,
    });
  } catch (error) {
    logger.error('Stage evidence error', { err: error instanceof Error ? error.message : String(error) });
    res.status(500).json({ error: 'Failed to fetch stage evidence' });
  }
});

/**
 * POST /api/evidence-management/auto-populate/:formId
 * Auto-populate form from evidence
 */
router.post('/auto-populate/:formId', async (req: Request, res: Response) => {
  try {
    const formId = String(req.params.formId);
    const { projectId } = req.body;

    const formData = await evidenceService.autoPopulateForm(formId, projectId);

    res.json({
      success: true,
      formId,
      formData,
      fieldsPopulated: Object.keys(formData).length,
    });
  } catch (error) {
    logger.error('Auto-populate error', { err: error instanceof Error ? error.message : String(error) });
    res.status(500).json({ error: 'Failed to auto-populate form' });
  }
});

/**
 * POST /api/evidence-management/review/submit/:fileId
 * Submit evidence for review
 */
router.post('/review/submit/:fileId', async (req: Request, res: Response) => {
  try {
    const fileId = String(req.params.fileId);
    const { reviewerId } = req.body;

    await evidenceService.submitForReview(fileId, reviewerId || 'system');

    res.json({
      success: true,
      message: 'Evidence submitted for review',
    });
  } catch (error) {
    logger.error('Review submission error', { err: error instanceof Error ? error.message : String(error) });
    res.status(500).json({ error: 'Failed to submit for review' });
  }
});

/**
 * POST /api/evidence-management/review/approve/:fileId
 * Approve evidence
 */
router.post('/review/approve/:fileId', async (req: Request, res: Response) => {
  try {
    const fileId = String(req.params.fileId);
    const { reviewerId, comments } = req.body;

    await evidenceService.approveEvidence(fileId, reviewerId || 'system', comments);

    res.json({
      success: true,
      message: 'Evidence approved',
    });
  } catch (error) {
    logger.error('Approval error', { err: error instanceof Error ? error.message : String(error) });
    res.status(500).json({ error: 'Failed to approve evidence' });
  }
});

/**
 * POST /api/evidence-management/review/request-changes/:fileId
 * Request changes to evidence
 */
router.post('/review/request-changes/:fileId', async (req: Request, res: Response) => {
  try {
    const fileId = String(req.params.fileId);
    const { reviewerId, comments } = req.body;

    if (!comments) {
      return res.status(400).json({ error: 'Comments required for change request' });
    }

    await evidenceService.requestChanges(fileId, reviewerId || 'system', comments);

    res.json({
      success: true,
      message: 'Changes requested',
    });
  } catch (error) {
    logger.error('Change request error', { err: error instanceof Error ? error.message : String(error) });
    res.status(500).json({ error: 'Failed to request changes' });
  }
});

/**
 * GET /api/evidence-management/export/:projectId
 * Export evidence package for submission
 */
router.get('/export/:projectId', async (req: Request, res: Response) => {
  try {
    const projectId = String(req.params.projectId);
    // Router-level middleware (above) guarantees req.organizationId is a valid number.
    const organizationId = req.organizationId as number;

    const evidencePackage = await evidenceService.exportEvidencePackage(projectId, organizationId);

    res.json({
      success: true,
      package: evidencePackage,
    });
  } catch (error) {
    logger.error('Export error', { err: error instanceof Error ? error.message : String(error) });
    res.status(500).json({ error: 'Failed to export evidence package' });
  }
});

/**
 * GET /api/evidence-management/analytics/:projectId
 * Get evidence analytics for a project
 */
router.get('/analytics/:projectId', async (req: Request, res: Response) => {
  try {
    const projectId = String(req.params.projectId);
    // Router-level middleware (above) guarantees req.organizationId is a valid number.
    const organizationId = req.organizationId as number;

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

    // Raw SQL aggregate row is untyped.
    const analyticsRow = (analytics.rows[0] as any) || {};

    res.json({
      success: true,
      projectId,
      totalFiles: parseInt(analyticsRow.total_files || 0),
      approvedFiles: parseInt(analyticsRow.approved_files || 0),
      underReview: parseInt(analyticsRow.under_review || 0),
      draftFiles: parseInt(analyticsRow.draft_files || 0),
      requirementsCovered: parseInt(analyticsRow.requirements_covered || 0),
      unmappedFiles: parseInt(analyticsRow.unmapped_files || 0),
      gaps: gapAnalysis.gaps.length,
      completeness: gapAnalysis.completeness,
    });
  } catch (error) {
    logger.error('Analytics error', { err: error instanceof Error ? error.message : String(error) });
    res.status(500).json({ error: 'Failed to fetch analytics' });
  }
});

export default router;
