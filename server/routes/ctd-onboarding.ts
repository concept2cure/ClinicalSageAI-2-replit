/**
 * CTD Onboarding Routes
 *
 * Reads of existing CTD onboarding projects, section detection, and compliance
 * validation.
 *
 * 2026-11-09 (P-108 3(b), item 5): `POST /projects/:id/upload` is removed. It
 * wrote into `ctd_onboarding_documents`, the store P-108 retired as a source of
 * placeable leaves, and no client ever called it. An uploaded file goes into the
 * project's Vault, is approved there, and that Vault version is placed:
 * client/src/concept2cure/v2/surfaces/VaultPlaceIntoSubmission.tsx. The rows it
 * wrote stay, as history (RULE 1: no DROP).
 *
 * @module server/routes/ctd-onboarding
 */

import { Router, Request, Response } from 'express';
import { authMiddleware } from '../auth.js';
import { createScopedLogger } from '../utils/logger.js';

const logger = createScopedLogger('ctd-onboarding');

import {
  listCTDProjects,
  getCTDProjectStatus,
  detectCTDSection,
  validateCTDCompleteness,
} from '../services/ctd-ingestion-service.js';

const router = Router();

// All routes require auth
router.use(authMiddleware);

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
    logger.error('List projects error', { err: message });
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
    const projectId = parseInt(String(req.params.id), 10);

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
    logger.error('Get project error', { err: message });
    return res.status(500).json({ error: 'Failed to get CTD project' });
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
    const projectId = parseInt(String(req.params.id), 10);

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
    logger.error('Validation error', { err: message });
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
    logger.error('Section detection error', { err: message });
    return res.status(500).json({ error: 'Failed to detect section' });
  }
});

export default router;
