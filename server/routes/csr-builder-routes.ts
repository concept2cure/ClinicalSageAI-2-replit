/**
 * @fileoverview CSR Builder API Routes
 * @module server/routes/csr-builder-routes
 *
 * Endpoints for CSR generation, cross-study comparison and ICH E3 section
 * drafting, mounted at /api/csr-builder only.
 *
 * Retired 2026-10-29 (CSR slice 9, RULE 2), none with a client caller:
 *   POST /safety-signals       asked a model for AE frequencies; replaced by the
 *                              engine AE tables of a retained run, read through
 *                              AnA's get_csr_section_evidence.
 *   POST /generate-narrative   a model-written patient narrative; replaced by the
 *                              build's narrative job, POST /api/csr/jobs/:jobId/narratives.
 *   POST /analyze-benefit-risk a model-written benefit-risk verdict; the
 *                              deterministic engines are regulatory/benefit-risk.ts
 *                              (AnA assess_benefit_risk) and benefit-risk-knowledge.ts.
 * The second mount of this router at /api/csr (beside /api/csr/jobs) is removed.
 * Proved by server/routes/__tests__/csr-builder-retired-endpoints.test.ts.
 */

import { Router, Request, Response } from 'express';
import { z } from 'zod';
import { createScopedLogger } from '../utils/logger.js';
import { CsrScopeError } from '../services/csr/project-scope';

const logger = createScopedLogger('csr-builder-routes');

import {
  launchCSRBuild,
  getICHE3Structure,
  draftCSRSection,
  flattenICHE3Sections,
  csrSectionSelectionRefusal,
  isDraftableE3Heading,
  compareWithExistingCSRs,
} from '../services/csr-builder.js';

const router = Router();

// ─────────────────────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────────────────────

/** Extract auth context from request (populated by auth middleware). */
function getAuthContext(req: Request) {
  const reqRecord = req as unknown as Record<string, unknown>;
  const authUser = reqRecord.user as Record<string, unknown> | undefined;
  const tenantCtx = reqRecord.tenantContext as Record<string, unknown> | undefined;
  const organizationId = Number(tenantCtx?.organizationId || authUser?.organizationId);
  if (!organizationId) {
    throw new Error('Organization context required');
  }
  const userId = Number(authUser?.id || authUser?.userId);
  if (!userId) {
    throw new Error('User context required');
  }
  return { organizationId, userId };
}

/** Safe error message for client — never leak stack traces or internal details. */
function safeErrorMessage(err: unknown, fallback: string): string {
  if (err instanceof Error && err.message && !err.message.includes('at ') && err.message.length < 200) {
    return err.message;
  }
  return fallback;
}

// ─────────────────────────────────────────────────────────────────────────────
// Validation schemas
// ─────────────────────────────────────────────────────────────────────────────

// Section numbers are ICH_E3_GUIDANCE's, checked by the builder's one
// selection rule (csrSectionSelectionRefusal). 2026-10-29: a hand-kept
// VALID_SECTION_NUMBERS list (the builder's invented §2.1–2.10 and §8.x, no
// §9.8 or §12.6) was deleted with the duplicate outline it mirrored.

const studyInfoSchema = z.object({
  title: z.string().min(1).max(500),
  protocolNumber: z.string().min(1).max(100),
  phase: z.string().min(1).max(50),
  indication: z.string().min(1).max(500),
  sponsor: z.string().min(1).max(300),
  investigationalProduct: z.string().min(1).max(300),
  comparator: z.string().max(300).optional(),
  studyDesign: z.string().min(1).max(500),
  primaryEndpoint: z.string().min(1).max(500),
  secondaryEndpoints: z.array(z.string().max(500)).max(20).optional(),
  sampleSize: z.number().int().positive().max(1000000).optional(),
  treatmentDuration: z.string().max(200).optional(),
  targetAgencies: z.array(z.string().max(50)).max(10).optional(),
});

const buildRequestSchema = z.object({
  projectId: z.number().int().positive().optional(),
  studyInfo: studyInfoSchema,
  sectionsToGenerate: z.array(z.string().max(16)).max(150).optional().refine(
    (sections) => !csrSectionSelectionRefusal(sections),
    { message: 'sectionsToGenerate must be unique ICH E3 section numbers that are drafted, not prepared from source (§3, §14–16)' }
  ),
});

const draftSectionSchema = z.object({
  sectionNumber: z.string().max(16).refine(isDraftableE3Heading,
    { message: 'sectionNumber must be an ICH E3 heading the model drafts (a narrative heading with content of its own)' }),
  studyInfo: studyInfoSchema,
});

const compareSchema = z.object({
  indication: z.string().min(1).max(500),
  phase: z.string().min(1).max(50),
  endpoint: z.string().min(1).max(500),
});

// ─────────────────────────────────────────────────────────────────────────────
// Routes
// ─────────────────────────────────────────────────────────────────────────────

/**
 * GET /api/csr-builder
 * Lightweight status endpoint for namespace discovery.
 */
router.get('/', (_req: Request, res: Response) => {
  res.json({
    success: true,
    message: 'CSR Builder API available',
    timestamp: new Date().toISOString(),
  });
});

/**
 * GET /api/csr-builder/structure
 * Returns the full ICH E3 section hierarchy.
 */
router.get('/structure', (_req: Request, res: Response) => {
  const structure = getICHE3Structure();
  res.json({
    success: true,
    structure,
    totalSections: flattenICHE3Sections(structure).length,
  });
});

/**
 * POST /api/csr-builder/build
 * Launch a full CSR build job with AI-powered drafting.
 */
router.post('/build', async (req: Request, res: Response) => {
  try {
    const validation = buildRequestSchema.safeParse(req.body);
    if (!validation.success) {
      return res.status(400).json({ error: 'Invalid request', details: validation.error.issues });
    }

    const { organizationId, userId } = getAuthContext(req);

    const job = await launchCSRBuild({
      organizationId,
      userId,
      ...validation.data,
    });

    res.json({
      success: true,
      job: {
        id: job.id,
        status: job.status,
        progress: job.progress,
        sectionCount: job.sections.length,
        draftedSections: job.sections.filter(s => s.status === 'drafted').length,
        createdAt: job.createdAt,
      },
      sections: job.sections,
    });
  } catch (err) {
    if (err instanceof CsrScopeError) return res.status(err.status).json({ error: err.message, code: err.code });
    logger.error('Build failed', { err: err instanceof Error ? err.message : String(err) });
    res.status(500).json({ error: safeErrorMessage(err, 'CSR build failed') });
  }
});

/**
 * POST /api/csr-builder/draft-section
 * Draft a single CSR section with AI.
 */
router.post('/draft-section', async (req: Request, res: Response) => {
  try {
    const validation = draftSectionSchema.safeParse(req.body);
    if (!validation.success) {
      return res.status(400).json({ error: 'Invalid request', details: validation.error.issues });
    }

    const { sectionNumber, studyInfo } = validation.data;
    const result = await draftCSRSection(sectionNumber, studyInfo, getAuthContext(req));

    res.json({
      success: true,
      sectionNumber,
      content: result.content,
      isAI: result.isAI,
      provider: result.isAI ? 'ai-gateway' : 'template',
    });
  } catch (err) {
    logger.error('Section draft failed', { err: err instanceof Error ? err.message : String(err) });
    res.status(500).json({ error: safeErrorMessage(err, 'Section draft failed') });
  }
});

/**
 * POST /api/csr-builder/compare
 * Cross-study comparison — find similar CSRs and compare key metrics.
 */
router.post('/compare', async (req: Request, res: Response) => {
  try {
    const validation = compareSchema.safeParse(req.body);
    if (!validation.success) {
      return res.status(400).json({ error: 'Invalid request', details: validation.error.issues });
    }

    const { organizationId } = getAuthContext(req);
    const { indication, phase, endpoint } = validation.data;
    const comparisons = await compareWithExistingCSRs(indication, phase, endpoint, organizationId);

    res.json({
      success: true,
      query: { indication, phase, endpoint },
      matchCount: comparisons.length,
      comparisons,
    });
  } catch (err) {
    logger.error('Comparison failed', { err: err instanceof Error ? err.message : String(err) });
    res.status(500).json({ error: safeErrorMessage(err, 'Comparison failed') });
  }
});

export default router;
