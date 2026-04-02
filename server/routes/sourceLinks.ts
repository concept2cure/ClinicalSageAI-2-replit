/**
 * Source Links API Routes
 *
 * Sentence-level source citation management for regulatory document traceability.
 * All endpoints enforce tenant isolation via authenticated server-side context.
 *
 * @module server/routes/sourceLinks
 */

import { Router, Request, Response } from 'express';
import { z } from 'zod';
import {
  linkSources,
  getSourcesForDocument,
  addSourceLink,
  removeSourceLink,
} from '../services/sourceLinkingService';
import { createScopedLogger } from '../utils/logger';

const logger = createScopedLogger('source-links-routes');
const router = Router();
const ORG_MISMATCH_ERROR = 'Organization header mismatch with authenticated organization context';

/**
 * Extract and validate organizationId from trusted authenticated context.
 */
function getOrganizationId(req: Request): number {
  const trustedOrgId =
    (req as any).user?.organizationId ??
    (req as any).user?.tenantId ??
    (req as any).tenantContext?.organizationId;
  const orgId = parseInt(String(trustedOrgId), 10);
  if (isNaN(orgId) || orgId <= 0) {
    throw new Error('Missing or invalid authenticated organization context');
  }
  const headerOrgId = Number((req as any).user?.organizationId || (req as any).tenantId || 0);
  if (!isNaN(headerOrgId) && headerOrgId !== orgId) {
    throw new Error(ORG_MISMATCH_ERROR);
  }
  return orgId;
}

// Validation schema for adding a source link
const addSourceLinkSchema = z.object({
  sectionId: z.number().int().nullable().optional().default(null),
  sentenceIndex: z.number().int().min(0),
  sentenceText: z.string().min(1).max(2000),
  sourceType: z.enum(['trial_data', 'literature', 'regulatory_guidance', 'internal_data']),
  sourceId: z.string().min(1).max(500),
  sourceTitle: z.string().min(1).max(500),
  sourceUrl: z.string().url().nullable().optional().default(null),
  confidence: z.number().min(0).max(1).optional().default(1.0),
  createdBy: z.number().int().optional().nullable().default(null),
});

// ═══════════════════════════════════════════════════════════════════════════════
// GET /api/documents/:id/sources — Retrieve all source links for a document
// ═══════════════════════════════════════════════════════════════════════════════
router.get('/:id/sources', async (req: Request, res: Response) => {
  try {
    const organizationId = getOrganizationId(req);
    const documentId = parseInt(req.params.id, 10);

    if (isNaN(documentId)) {
      return res.status(400).json({ error: 'Invalid document ID' });
    }

    const sources = await getSourcesForDocument(documentId, organizationId);
    return res.json({ sources, total: sources.length });
  } catch (error: any) {
    logger.error('Failed to get source links', { error: error.message });
    if (error.message === ORG_MISMATCH_ERROR) {
      return res.status(403).json({ error: error.message });
    }
    if (error.message.includes('Missing or invalid')) {
      return res.status(401).json({ error: error.message });
    }
    return res.status(500).json({ error: 'Failed to retrieve source links' });
  }
});

// ═══════════════════════════════════════════════════════════════════════════════
// POST /api/documents/:id/sources — Add a source link manually
// ═══════════════════════════════════════════════════════════════════════════════
router.post('/:id/sources', async (req: Request, res: Response) => {
  try {
    const organizationId = getOrganizationId(req);
    const documentId = parseInt(req.params.id, 10);

    if (isNaN(documentId)) {
      return res.status(400).json({ error: 'Invalid document ID' });
    }

    const parsed = addSourceLinkSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({
        error: 'Validation failed',
        details: parsed.error.flatten().fieldErrors,
      });
    }

    const source = await addSourceLink({
      ...parsed.data,
      documentId,
      organizationId,
    });

    return res.status(201).json({ source });
  } catch (error: any) {
    logger.error('Failed to add source link', { error: error.message });
    if (error.message === ORG_MISMATCH_ERROR) {
      return res.status(403).json({ error: error.message });
    }
    if (error.message.includes('Missing or invalid')) {
      return res.status(401).json({ error: error.message });
    }
    return res.status(500).json({ error: 'Failed to add source link' });
  }
});

// ═══════════════════════════════════════════════════════════════════════════════
// DELETE /api/documents/:id/sources/:linkId — Remove a source link
// ═══════════════════════════════════════════════════════════════════════════════
router.delete('/:id/sources/:linkId', async (req: Request, res: Response) => {
  try {
    const organizationId = getOrganizationId(req);
    const linkId = parseInt(req.params.linkId, 10);

    if (isNaN(linkId)) {
      return res.status(400).json({ error: 'Invalid link ID' });
    }

    await removeSourceLink(linkId, organizationId);
    return res.json({ success: true, message: 'Source link removed' });
  } catch (error: any) {
    logger.error('Failed to remove source link', { error: error.message });
    if (error.message.includes('not found')) {
      return res.status(404).json({ error: error.message });
    }
    if (error.message === ORG_MISMATCH_ERROR) {
      return res.status(403).json({ error: error.message });
    }
    if (error.message.includes('Missing or invalid')) {
      return res.status(401).json({ error: error.message });
    }
    return res.status(500).json({ error: 'Failed to remove source link' });
  }
});

// ═══════════════════════════════════════════════════════════════════════════════
// POST /api/documents/:id/sources/analyze — Trigger source analysis
// ═══════════════════════════════════════════════════════════════════════════════
router.post('/:id/sources/analyze', async (req: Request, res: Response) => {
  try {
    const organizationId = getOrganizationId(req);
    const documentId = parseInt(req.params.id, 10);

    if (isNaN(documentId)) {
      return res.status(400).json({ error: 'Invalid document ID' });
    }

    const autoSave = req.body?.autoSave === true;
    const createdBy = req.body?.createdBy ? parseInt(req.body.createdBy, 10) : null;

    const analysisResults = await linkSources(documentId, organizationId);

    // Optionally persist all discovered sources
    const savedSources = [];
    if (autoSave && analysisResults.length > 0) {
      for (const result of analysisResults) {
        const saved = await addSourceLink({
          ...result,
          createdBy,
        });
        savedSources.push(saved);
      }
    }

    return res.json({
      analyzed: true,
      claimsFound: analysisResults.length,
      sources: autoSave ? savedSources : analysisResults,
      saved: autoSave,
    });
  } catch (error: any) {
    logger.error('Failed to analyze document sources', { error: error.message });
    if (error.message.includes('not found')) {
      return res.status(404).json({ error: error.message });
    }
    if (error.message.includes('Missing or invalid')) {
      return res.status(401).json({ error: error.message });
    }
    return res.status(500).json({ error: 'Failed to analyze document sources' });
  }
});

export default router;
