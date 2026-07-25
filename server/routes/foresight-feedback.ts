/**
 * @deprecated RETIRED (Phase 8). No longer mounted (was /api/foresight-feedback, the
 * /api/foresight-ai/feedback alias, and Cortex /feedback); the Foresight path is past
 * its 2026-04-01 Sunset and surfaced fabricated dose confidence intervals. File retained
 * pending deletion — do NOT re-mount.
 * See docs/architecture/CLINICAL_REGULATORY_EVIDENCE_PHASE8_RETIREMENT.md.
 *
 * AnA Predictions™ Feedback API Routes
 * Handles bi-directional clinical feedback loop
 */

import { Router } from 'express';
import { feedbackOrchestrator } from '../services/foresight-feedback-orchestrator';
import { db } from '../db';
import { 
  clinicalFeedback, 
  clinicalOutcomes,
  foresightPredictions
} from '@shared/schema';
import { eq, desc, and, gte } from 'drizzle-orm';

import { createScopedLogger } from '../utils/logger.js';
import { requireAuthedOrgId } from '../utils/authedOrgId.js';

const logger = createScopedLogger('foresight-feedback');

const router = Router();

/**
 * Submit clinical feedback for a prediction
 */
router.post('/feedback/submit', async (req, res) => {
  try {
    const guard = requireAuthedOrgId(req, res);
    if (!guard.ok) return;
    const {
      predictionId,
      actualOutcome,
      observedBiomarkers,
      safetyEvents,
      efficacyMetrics,
      timeToEvent,
      confidenceInterval
    } = req.body;

    if (!predictionId || !actualOutcome) {
      return res.status(400).json({
        error: 'Missing required fields: predictionId, actualOutcome'
      });
    }

    const result = await feedbackOrchestrator.processClinicalFeedback(
      String(guard.orgId),
      {
        predictionId,
        actualOutcome,
        observedBiomarkers,
        safetyEvents,
        efficacyMetrics,
        timeToEvent: timeToEvent || 0,
        confidenceInterval: confidenceInterval || 0.95
      }
    );

    res.json({
      success: true,
      feedbackProcessed: true,
      learningOutcome: result.learningOutcome,
      modelUpdates: result.modelUpdates,
      improvedPredictions: result.improvedPredictions,
      recommendations: result.recommendations
    });
  } catch (error) {
    logger.error('Error submitting feedback', { err: error instanceof Error ? error.message : String(error) });
    res.status(500).json({
      error: 'Failed to process clinical feedback',
      message: error instanceof Error ? error.message : 'Unknown error'
    });
  }
});

/**
 * Get feedback history for an organization
 */
router.get('/feedback/history/:organizationId', async (req, res) => {
  try {
    // The :organizationId path segment is a legacy addressing artifact; tenant
    // scope comes from the verified JWT, never the URL. Prevents reading another
    // org's feedback history by editing the path.
    const guard = requireAuthedOrgId(req, res);
    if (!guard.ok) return;
    const { limit = 100, offset = 0 } = req.query;

    const feedbackHistory = await db!
      .select()
      .from(clinicalFeedback)
      .where(eq(clinicalFeedback.organizationId, guard.orgId))
      .orderBy(desc(clinicalFeedback.capturedAt))
      .limit(Number(limit))
      .offset(Number(offset));

    res.json({
      success: true,
      feedback: feedbackHistory,
      total: feedbackHistory.length
    });
  } catch (error) {
    logger.error('Error fetching feedback history', { err: error instanceof Error ? error.message : String(error) });
    res.status(500).json({
      error: 'Failed to fetch feedback history',
      message: error instanceof Error ? error.message : 'Unknown error'
    });
  }
});

/**
 * Trigger continuous monitoring
 */
router.post('/feedback/monitor', async (req, res) => {
  try {
    const guard = requireAuthedOrgId(req, res);
    if (!guard.ok) return;

    const monitoringResult = await feedbackOrchestrator.continuousMonitoring(String(guard.orgId));

    res.json({
      success: true,
      monitoring: monitoringResult
    });
  } catch (error) {
    logger.error('Error in continuous monitoring', { err: error instanceof Error ? error.message : String(error) });
    res.status(500).json({
      error: 'Failed to perform continuous monitoring',
      message: error instanceof Error ? error.message : 'Unknown error'
    });
  }
});

/**
 * Perform meta-learning across studies
 */
router.post('/feedback/meta-learning', async (req, res) => {
  try {
    const guard = requireAuthedOrgId(req, res);
    if (!guard.ok) return;

    const metaLearningResult = await feedbackOrchestrator.performMetaLearning(String(guard.orgId));

    res.json({
      success: true,
      metaLearning: metaLearningResult
    });
  } catch (error) {
    logger.error('Error in meta-learning', { err: error instanceof Error ? error.message : String(error) });
    res.status(500).json({
      error: 'Failed to perform meta-learning',
      message: error instanceof Error ? error.message : 'Unknown error'
    });
  }
});

/**
 * Generate adaptive hypotheses
 */
router.post('/feedback/hypotheses', async (req, res) => {
  try {
    const guard = requireAuthedOrgId(req, res);
    if (!guard.ok) return;
    const { context } = req.body;

    const hypotheses = await feedbackOrchestrator.generateAdaptiveHypotheses(
      String(guard.orgId),
      context || {}
    );

    res.json({
      success: true,
      hypotheses
    });
  } catch (error) {
    logger.error('Error generating hypotheses', { err: error instanceof Error ? error.message : String(error) });
    res.status(500).json({
      error: 'Failed to generate adaptive hypotheses',
      message: error instanceof Error ? error.message : 'Unknown error'
    });
  }
});

/**
 * Get learning metrics and model performance
 */
router.get('/feedback/metrics/:organizationId', async (req, res) => {
  try {
    // Tenant scope from the verified JWT, not the :organizationId path segment.
    const guard = requireAuthedOrgId(req, res);
    if (!guard.ok) return;
    const { days = 30 } = req.query;

    const startDate = new Date();
    startDate.setDate(startDate.getDate() - Number(days));

    // Get predictions with feedback
    const predictionsWithFeedback = await db!
      .select()
      .from(foresightPredictions)
      .where(
        and(
          eq(foresightPredictions.organizationId, guard.orgId),
          gte(foresightPredictions.createdAt, startDate)
        )
      )
      .orderBy(desc(foresightPredictions.createdAt));

    // Calculate metrics
    const metrics = {
      totalPredictions: predictionsWithFeedback.length,
      averageConfidence: predictionsWithFeedback.reduce(
        (acc, p) => acc + (p.successScore || 0), 0
      ) / predictionsWithFeedback.length,
      predictionTypes: predictionsWithFeedback.reduce((acc, p) => {
        acc[p.predictionType] = (acc[p.predictionType] || 0) + 1;
        return acc;
      }, {} as Record<string, number>),
      phaseDistribution: predictionsWithFeedback.reduce((acc, p) => {
        acc[p.phase || 'unknown'] = (acc[p.phase || 'unknown'] || 0) + 1;
        return acc;
      }, {} as Record<string, number>)
    };

    res.json({
      success: true,
      metrics,
      period: `Last ${days} days`
    });
  } catch (error) {
    logger.error('Error fetching metrics', { err: error instanceof Error ? error.message : String(error) });
    res.status(500).json({
      error: 'Failed to fetch learning metrics',
      message: error instanceof Error ? error.message : 'Unknown error'
    });
  }
});

/**
 * Store clinical outcome data
 */
router.post('/feedback/outcome', async (req, res) => {
  try {
    const guard = requireAuthedOrgId(req, res);
    if (!guard.ok) return;
    const {
      studyId,
      phase,
      primaryEndpointMet,
      secondaryEndpoints,
      safetyProfile,
      patientOutcomes,
      biomarkerData
    } = req.body;

    if (!studyId || !phase) {
      return res.status(400).json({
        error: 'Missing required fields: studyId, phase'
      });
    }

    const [outcome] = await db!.insert(clinicalOutcomes).values({
      organizationId: guard.orgId,
      studyId: studyId,
      phase,
      outcomeType: primaryEndpointMet ? 'success' : 'failure',
      outcomeValue: {
        primaryEndpointMet,
        secondaryEndpoints,
        patientOutcomes
      },
      adverseEvents: safetyProfile || {},
      metadata: {
        biomarkerData: biomarkerData || {}
      },
      createdAt: new Date(),
      capturedAt: new Date()
    }).returning();

    res.json({
      success: true,
      outcome
    });
  } catch (error) {
    logger.error('Error storing outcome', { err: error instanceof Error ? error.message : String(error) });
    res.status(500).json({
      error: 'Failed to store clinical outcome',
      message: error instanceof Error ? error.message : 'Unknown error'
    });
  }
});

export default router;