/**
 * Intelligence Layer Routes
 *
 * API endpoints for the unified intelligence layer:
 *   - Recommendations
 *   - Readiness scoring
 *   - Project intelligence profiles
 *   - Next best actions
 *   - Learning loop feedback
 *   - Cross-module analysis
 *
 * @module server/routes/intelligence
 */

import { Router, Request, Response } from 'express';
import { z } from 'zod';

import { createScopedLogger } from '../utils/logger.js';

const logger = createScopedLogger('intelligence');

import {
  generateRecommendations,
  computeReadinessScore,
  getProjectIntelligence,
  enrichProjectIntelligence,
  getProjectMemory,
  generateNextActions,
  recordFeedback,
  getFeedbackSummary,
  analyzeCrossModuleRelationships,
  runRIMAssessment,
  getProjectSignals,
  enrichChangeImpact,
  analyzeCrossArtifactIntelligence,
} from '../services/intelligence/index.js';

const router = Router();

// ═══════════════════════════════════════════════════════════════════════════════
// MIDDLEWARE HELPERS
// ═══════════════════════════════════════════════════════════════════════════════

function getOrgId(req: Request): number {
  const user = (req as unknown as Record<string, Record<string, unknown>>).user;
  return Number(user?.organizationId ?? user?.orgId ?? 0);
}

function getUserId(req: Request): number {
  const user = (req as unknown as Record<string, Record<string, unknown>>).user;
  return Number(user?.id ?? user?.userId ?? 0);
}

// ═══════════════════════════════════════════════════════════════════════════════
// 1. RECOMMENDATIONS
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * GET /api/intelligence/projects/:projectId/recommendations
 *
 * Generate and return recommendations for a project.
 */
router.get('/projects/:projectId/recommendations', async (req: Request, res: Response) => {
  try {
    const projectId = Number(req.params.projectId);
    const organizationId = getOrgId(req);

    if (!projectId || !organizationId) {
      return res.status(400).json({ error: 'Missing projectId or organization context' });
    }

    const result = await generateRecommendations({
      organizationId,
      projectId,
      programType: req.query.programType as string | undefined,
      moduleScope: req.query.moduleScope as string | undefined,
      triggeredBy: 'api_request',
    });

    return res.json(result);
  } catch (error) {
    logger.error('Recommendation generation failed', { err: error instanceof Error ? error.message : String(error) });
    return res.status(500).json({ error: 'Failed to generate recommendations' });
  }
});

// ═══════════════════════════════════════════════════════════════════════════════
// 2. READINESS SCORING
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * GET /api/intelligence/projects/:projectId/readiness
 *
 * Compute unified readiness score for a project.
 */
router.get('/projects/:projectId/readiness', async (req: Request, res: Response) => {
  try {
    const projectId = Number(req.params.projectId);
    const organizationId = getOrgId(req);

    if (!projectId || !organizationId) {
      return res.status(400).json({ error: 'Missing projectId or organization context' });
    }

    const result = await computeReadinessScore({
      organizationId,
      projectId,
      programId: req.query.programId as string | undefined,
      submissionType: req.query.submissionType as string | undefined,
      targetAgency: req.query.targetAgency as string | undefined,
    });

    return res.json(result);
  } catch (error) {
    logger.error('Readiness scoring failed', { err: error instanceof Error ? error.message : String(error) });
    return res.status(500).json({ error: 'Failed to compute readiness score' });
  }
});

// ═══════════════════════════════════════════════════════════════════════════════
// 3. PROJECT INTELLIGENCE
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * GET /api/intelligence/projects/:projectId/profile
 *
 * Get the intelligence profile for a project.
 */
router.get('/projects/:projectId/profile', async (req: Request, res: Response) => {
  try {
    const projectId = Number(req.params.projectId);
    const organizationId = getOrgId(req);

    if (!projectId || !organizationId) {
      return res.status(400).json({ error: 'Missing projectId or organization context' });
    }

    const profile = await getProjectIntelligence(projectId, organizationId);

    if (!profile) {
      return res.status(404).json({ error: 'No intelligence profile found for this project' });
    }

    return res.json(profile);
  } catch (error) {
    logger.error('Profile fetch failed', { err: error instanceof Error ? error.message : String(error) });
    return res.status(500).json({ error: 'Failed to fetch project intelligence' });
  }
});

/**
 * POST /api/intelligence/projects/:projectId/profile/enrich
 *
 * Append intelligence data to a project profile.
 */
router.post('/projects/:projectId/profile/enrich', async (req: Request, res: Response) => {
  try {
    const projectId = Number(req.params.projectId);
    const organizationId = getOrgId(req);
    const userId = getUserId(req);

    if (!projectId || !organizationId) {
      return res.status(400).json({ error: 'Missing projectId or organization context' });
    }

    const schema = z.object({
      risks: z.array(z.object({
        risk: z.string(),
        likelihood: z.string(),
        impact: z.string(),
        mitigation: z.string().optional(),
      })).optional(),
      openQuestions: z.array(z.object({
        question: z.string(),
        context: z.string().optional(),
        priority: z.string().optional(),
      })).optional(),
      keyDecisions: z.array(z.object({
        decision: z.string(),
        rationale: z.string(),
        date: z.string(),
        source: z.string().optional(),
      })).optional(),
      learnedInsights: z.array(z.object({
        insight: z.string(),
        source: z.string(),
        confidence: z.number(),
        extractedAt: z.string(),
      })).optional(),
      regulatoryStrategy: z.string().optional(),
      targetIndication: z.string().optional(),
      targetPopulation: z.string().optional(),
      customInstructions: z.string().optional(),
    });

    const payload = schema.parse(req.body);

    await enrichProjectIntelligence(projectId, organizationId, payload, userId);

    return res.json({ success: true });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return res.status(400).json({ error: 'Invalid payload', details: error.errors });
    }
    logger.error('Profile enrichment failed', { err: error instanceof Error ? error.message : String(error) });
    return res.status(500).json({ error: 'Failed to enrich project intelligence' });
  }
});

/**
 * GET /api/intelligence/projects/:projectId/memory
 *
 * Get recent memory entries for a project.
 */
router.get('/projects/:projectId/memory', async (req: Request, res: Response) => {
  try {
    const projectId = Number(req.params.projectId);
    const organizationId = getOrgId(req);

    if (!projectId || !organizationId) {
      return res.status(400).json({ error: 'Missing projectId or organization context' });
    }

    const memory = await getProjectMemory(projectId, organizationId, {
      category: req.query.category as string | undefined,
      limit: req.query.limit ? Number(req.query.limit) : undefined,
    });

    return res.json({ entries: memory, total: memory.length });
  } catch (error) {
    logger.error('Memory fetch failed', { err: error instanceof Error ? error.message : String(error) });
    return res.status(500).json({ error: 'Failed to fetch project memory' });
  }
});

// ═══════════════════════════════════════════════════════════════════════════════
// 4. NEXT BEST ACTIONS
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * GET /api/intelligence/projects/:projectId/next-actions
 *
 * Generate ranked next-best-action list.
 */
router.get('/projects/:projectId/next-actions', async (req: Request, res: Response) => {
  try {
    const projectId = Number(req.params.projectId);
    const organizationId = getOrgId(req);

    if (!projectId || !organizationId) {
      return res.status(400).json({ error: 'Missing projectId or organization context' });
    }

    const maxActions = req.query.limit ? Number(req.query.limit) : 10;

    const result = await generateNextActions(
      {
        organizationId,
        projectId,
        triggeredBy: 'api_request',
      },
      maxActions,
    );

    return res.json(result);
  } catch (error) {
    logger.error('Next actions generation failed', { err: error instanceof Error ? error.message : String(error) });
    return res.status(500).json({ error: 'Failed to generate next actions' });
  }
});

// ═══════════════════════════════════════════════════════════════════════════════
// 5. LEARNING LOOP / FEEDBACK
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * POST /api/intelligence/projects/:projectId/feedback
 *
 * Record feedback on a recommendation.
 */
router.post('/projects/:projectId/feedback', async (req: Request, res: Response) => {
  try {
    const projectId = Number(req.params.projectId);
    const organizationId = getOrgId(req);
    const userId = getUserId(req);

    if (!projectId || !organizationId) {
      return res.status(400).json({ error: 'Missing projectId or organization context' });
    }

    const schema = z.object({
      recommendationId: z.string(),
      recommendationType: z.string(),
      action: z.enum(['accepted', 'dismissed', 'resolved', 'overridden']),
      userComment: z.string().optional(),
      alternativeChosen: z.string().optional(),
      timeToAction: z.number().optional(),
    });

    const payload = schema.parse(req.body);

    await recordFeedback({
      ...payload,
      userId,
      projectId,
      organizationId,
    });

    return res.json({ success: true });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return res.status(400).json({ error: 'Invalid payload', details: error.errors });
    }
    logger.error('Feedback recording failed', { err: error instanceof Error ? error.message : String(error) });
    return res.status(500).json({ error: 'Failed to record feedback' });
  }
});

/**
 * GET /api/intelligence/projects/:projectId/feedback/summary
 *
 * Get feedback summary for a project.
 */
router.get('/projects/:projectId/feedback/summary', async (req: Request, res: Response) => {
  try {
    const projectId = Number(req.params.projectId);
    const organizationId = getOrgId(req);

    if (!projectId || !organizationId) {
      return res.status(400).json({ error: 'Missing projectId or organization context' });
    }

    const summary = await getFeedbackSummary(projectId, organizationId);
    return res.json(summary);
  } catch (error) {
    logger.error('Feedback summary failed', { err: error instanceof Error ? error.message : String(error) });
    return res.status(500).json({ error: 'Failed to get feedback summary' });
  }
});

// ═══════════════════════════════════════════════════════════════════════════════
// 6. CROSS-MODULE INTELLIGENCE
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * GET /api/intelligence/projects/:projectId/cross-module
 *
 * Analyze cross-module relationships and inconsistencies.
 */
router.get('/projects/:projectId/cross-module', async (req: Request, res: Response) => {
  try {
    const projectId = Number(req.params.projectId);
    const organizationId = getOrgId(req);

    if (!projectId || !organizationId) {
      return res.status(400).json({ error: 'Missing projectId or organization context' });
    }

    const report = await analyzeCrossModuleRelationships({
      organizationId,
      projectId,
    });

    return res.json(report);
  } catch (error) {
    logger.error('Cross-module analysis failed', { err: error instanceof Error ? error.message : String(error) });
    return res.status(500).json({ error: 'Failed to analyze cross-module relationships' });
  }
});

// ═══════════════════════════════════════════════════════════════════════════════
// 7. UNIFIED DASHBOARD
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * GET /api/intelligence/projects/:projectId/dashboard
 *
 * Unified intelligence dashboard — combines readiness, recommendations,
 * next actions, and cross-module insights into one response.
 */
router.get('/projects/:projectId/dashboard', async (req: Request, res: Response) => {
  try {
    const projectId = Number(req.params.projectId);
    const organizationId = getOrgId(req);

    if (!projectId || !organizationId) {
      return res.status(400).json({ error: 'Missing projectId or organization context' });
    }

    const ctx = {
      organizationId,
      projectId,
      triggeredBy: 'dashboard_request',
    };

    // Run all intelligence queries concurrently
    const [readiness, recommendations, nextActions, crossModule, profile, feedbackSummary] =
      await Promise.allSettled([
        computeReadinessScore(ctx),
        generateRecommendations(ctx),
        generateNextActions(ctx, 5),
        analyzeCrossModuleRelationships(ctx),
        getProjectIntelligence(projectId, organizationId),
        getFeedbackSummary(projectId, organizationId),
      ]);

    return res.json({
      readiness: readiness.status === 'fulfilled' ? readiness.value : null,
      recommendations: recommendations.status === 'fulfilled' ? recommendations.value : null,
      nextActions: nextActions.status === 'fulfilled' ? nextActions.value : null,
      crossModule: crossModule.status === 'fulfilled' ? crossModule.value : null,
      profile: profile.status === 'fulfilled' ? profile.value : null,
      feedbackSummary: feedbackSummary.status === 'fulfilled' ? feedbackSummary.value : null,
      generatedAt: new Date().toISOString(),
    });
  } catch (error) {
    logger.error('Dashboard generation failed', { err: error instanceof Error ? error.message : String(error) });
    return res.status(500).json({ error: 'Failed to generate intelligence dashboard' });
  }
});

// ═══════════════════════════════════════════════════════════════════════════════
// 8. RIM — REGULATORY INTELLIGENCE MODEL
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * POST /api/intelligence/projects/:projectId/rim/assess
 *
 * Run a full RIM assessment for a project. Returns judgment scores,
 * pattern matches, signal summary, and unified RIM score.
 */
router.post('/projects/:projectId/rim/assess', async (req: Request, res: Response) => {
  try {
    const projectId = Number(req.params.projectId);
    const organizationId = getOrgId(req);

    if (!projectId || !organizationId) {
      return res.status(400).json({ error: 'Missing projectId or organization context' });
    }

    const { sectionCode, submissionType, targetAgency, textToScan, artifactId, artifactVersionId } = req.body;

    const assessment = await runRIMAssessment({
      organizationId,
      projectId,
      userId: (req as any).user?.id,
      sectionCode,
      submissionType,
      targetAgency,
      textToScan,
      artifactId,
      artifactVersionId,
    });

    return res.json(assessment);
  } catch (error) {
    logger.error('RIM assessment failed', { err: error instanceof Error ? error.message : String(error) });
    return res.status(500).json({ error: 'Failed to run RIM assessment' });
  }
});

/**
 * GET /api/intelligence/projects/:projectId/rim/signals
 *
 * Get the current signal summary for a project.
 */
router.get('/projects/:projectId/rim/signals', async (req: Request, res: Response) => {
  try {
    const projectId = Number(req.params.projectId);
    const organizationId = getOrgId(req);

    if (!projectId || !organizationId) {
      return res.status(400).json({ error: 'Missing projectId or organization context' });
    }

    const summary = await getProjectSignals(organizationId, projectId);
    return res.json(summary);
  } catch (error) {
    logger.error('Signal summary failed', { err: error instanceof Error ? error.message : String(error) });
    return res.status(500).json({ error: 'Failed to get signal summary' });
  }
});

/**
 * GET /api/intelligence/projects/:projectId/rim/cross-artifact
 *
 * Analyze cross-artifact patterns from accumulated RIM signals.
 */
router.get('/projects/:projectId/rim/cross-artifact', async (req: Request, res: Response) => {
  try {
    const projectId = Number(req.params.projectId);
    const organizationId = getOrgId(req);

    if (!projectId || !organizationId) {
      return res.status(400).json({ error: 'Missing projectId or organization context' });
    }

    const report = await analyzeCrossArtifactIntelligence(organizationId, projectId);
    return res.json(report);
  } catch (error) {
    logger.error('Cross-artifact analysis failed', { err: error instanceof Error ? error.message : String(error) });
    return res.status(500).json({ error: 'Failed to analyze cross-artifact intelligence' });
  }
});

/**
 * GET /api/intelligence/projects/:projectId/rim/section/:sectionCode
 *
 * Get RIM enrichment for a specific section (trends, recurring patterns, persisting issues).
 */
router.get('/projects/:projectId/rim/section/:sectionCode', async (req: Request, res: Response) => {
  try {
    const projectId = Number(req.params.projectId);
    const organizationId = getOrgId(req);
    const sectionCode = req.params.sectionCode;

    if (!projectId || !organizationId || !sectionCode) {
      return res.status(400).json({ error: 'Missing required parameters' });
    }

    const enrichment = await enrichChangeImpact(organizationId, projectId, sectionCode);
    return res.json(enrichment);
  } catch (error) {
    logger.error('Section enrichment failed', { err: error instanceof Error ? error.message : String(error) });
    return res.status(500).json({ error: 'Failed to get section intelligence' });
  }
});

export default router;
