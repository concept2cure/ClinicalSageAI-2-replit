/**
 * CTD Onboarding Routes
 *
 * Endpoints for managing client CTD project onboarding, document upload,
 * section detection, and compliance validation.
 *
 * @module server/routes/ctd-onboarding
 */

import { Router, Request, Response } from 'express';
import multer from 'multer';
import path from 'path';
import fs from 'fs';
import { authMiddleware } from '../auth.js';
import {
  createCTDProject,
  listCTDProjects,
  getCTDProjectStatus,
  uploadCTDDocument,
  detectCTDSection,
  validateCTDCompleteness,
} from '../services/ctd-ingestion-service.js';

const router = Router();

// Multer config for CTD document uploads
const uploadDir = path.join(process.cwd(), 'uploads', 'ctd');
if (!fs.existsSync(uploadDir)) {
  fs.mkdirSync(uploadDir, { recursive: true });
}

const storage = multer.diskStorage({
  destination: (_req, _file, cb) => cb(null, uploadDir),
  filename: (_req, file, cb) => {
    const uniqueSuffix = `${Date.now()}-${Math.round(Math.random() * 1e9)}`;
    cb(null, `${uniqueSuffix}-${file.originalname}`);
  },
});

const upload = multer({
  storage,
  limits: { fileSize: 100 * 1024 * 1024 }, // 100MB for CTD documents
  fileFilter: (_req, file, cb) => {
    const allowed = ['.pdf', '.doc', '.docx', '.xml', '.txt', '.xlsx', '.xls'];
    const ext = path.extname(file.originalname).toLowerCase();
    if (allowed.includes(ext)) {
      cb(null, true);
    } else {
      cb(new Error(`Unsupported file type: ${ext}`));
    }
  },
});

// All routes require auth
router.use(authMiddleware);

// ============================================================================
// POST /api/ctd/projects — Create CTD project
// ============================================================================

router.post('/projects', async (req: Request, res: Response) => {
  try {
    const organizationId = Number(req.tenantId);
    if (!organizationId) {
      return res.status(401).json({ error: 'Organization context required' });
    }
    const userId = Number(req.userId);
    if (!userId) {
      return res.status(401).json({ error: 'User context required' });
    }
    const { name, regulatoryRegion, submissionType, productName, productType, therapeuticArea, indication } = req.body;

    if (!name || !regulatoryRegion || !submissionType || !productName || !productType) {
      return res.status(400).json({
        error: 'Missing required fields: name, regulatoryRegion, submissionType, productName, productType',
      });
    }

    const result = await createCTDProject(organizationId, {
      name,
      regulatoryRegion,
      submissionType,
      productName,
      productType,
      therapeuticArea,
      indication,
      createdBy: userId,
    });

    return res.status(201).json({
      message: 'CTD project created successfully',
      projectId: result.projectId,
      initialGaps: result.gaps.length,
    });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    console.error('[ctd-onboarding] Create project error:', message);
    return res.status(500).json({ error: 'Failed to create CTD project' });
  }
});

// ============================================================================
// GET /api/ctd/projects — List CTD projects
// ============================================================================

router.get('/projects', async (req: Request, res: Response) => {
  try {
    const organizationId = Number(req.tenantId);
    if (!organizationId) {
      return res.status(401).json({ error: 'Organization context required' });
    }
    const projects = await listCTDProjects(organizationId);
    return res.json({ projects, total: projects.length });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    console.error('[ctd-onboarding] List projects error:', message);
    return res.status(500).json({ error: 'Failed to list CTD projects' });
  }
});

// ============================================================================
// GET /api/ctd/projects/:id — Get project with documents and gaps
// ============================================================================

router.get('/projects/:id', async (req: Request, res: Response) => {
  try {
    const organizationId = Number(req.tenantId);
    if (!organizationId) {
      return res.status(401).json({ error: 'Organization context required' });
    }
    const projectId = parseInt(req.params.id, 10);

    if (isNaN(projectId)) {
      return res.status(400).json({ error: 'Invalid project ID' });
    }

    const result = await getCTDProjectStatus(projectId, organizationId);

    if (!result) {
      return res.status(404).json({ error: 'CTD project not found' });
    }

    return res.json(result);
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    console.error('[ctd-onboarding] Get project error:', message);
    return res.status(500).json({ error: 'Failed to get CTD project' });
  }
});

// ============================================================================
// POST /api/ctd/projects/:id/upload — Upload document to CTD project
// ============================================================================

router.post('/projects/:id/upload', upload.single('file'), async (req: Request, res: Response) => {
  try {
    const organizationId = Number(req.tenantId);
    if (!organizationId) {
      return res.status(401).json({ error: 'Organization context required' });
    }
    const projectId = parseInt(req.params.id, 10);

    if (isNaN(projectId)) {
      return res.status(400).json({ error: 'Invalid project ID' });
    }

    if (!req.file) {
      return res.status(400).json({ error: 'No file uploaded' });
    }

    const { ctdModule, ctdSection, sectionTitle, documentType } = req.body;

    if (!ctdModule || !ctdSection || !sectionTitle || !documentType) {
      return res.status(400).json({
        error: 'Missing required fields: ctdModule, ctdSection, sectionTitle, documentType',
      });
    }

    const result = await uploadCTDDocument(projectId, organizationId, {
      fileName: req.file.originalname,
      fileSize: req.file.size,
      mimeType: req.file.mimetype,
      storagePath: req.file.path,
      ctdModule: parseInt(ctdModule, 10),
      ctdSection,
      sectionTitle,
      documentType,
    });

    return res.status(201).json({
      message: 'Document uploaded successfully',
      documentId: result.id,
      uuid: result.uuid,
    });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    console.error('[ctd-onboarding] Upload error:', message);
    return res.status(500).json({ error: 'Failed to upload document' });
  }
});

// ============================================================================
// POST /api/ctd/projects/:id/validate — Run completeness validation
// ============================================================================

router.post('/projects/:id/validate', async (req: Request, res: Response) => {
  try {
    const organizationId = Number(req.tenantId);
    if (!organizationId) {
      return res.status(401).json({ error: 'Organization context required' });
    }
    const projectId = parseInt(req.params.id, 10);

    if (isNaN(projectId)) {
      return res.status(400).json({ error: 'Invalid project ID' });
    }

    const result = await validateCTDCompleteness(projectId, organizationId);

    if (!result) {
      return res.status(404).json({ error: 'CTD project not found' });
    }

    return res.json(result);
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    console.error('[ctd-onboarding] Validation error:', message);
    return res.status(500).json({ error: 'Failed to validate CTD completeness' });
  }
});

// ============================================================================
// POST /api/ctd/projects/:id/detect-section — Auto-detect section for filename
// ============================================================================

router.post('/projects/:id/detect-section', async (req: Request, res: Response) => {
  try {
    const { fileName } = req.body;

    if (!fileName) {
      return res.status(400).json({ error: 'fileName is required' });
    }

    const detected = detectCTDSection(fileName);

    if (!detected) {
      return res.json({
        detected: false,
        message: 'Could not auto-detect section. Please specify manually.',
      });
    }

    return res.json({
      detected: true,
      ...detected,
    });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    console.error('[ctd-onboarding] Section detection error:', message);
    return res.status(500).json({ error: 'Failed to detect section' });
  }
});

export default router;
