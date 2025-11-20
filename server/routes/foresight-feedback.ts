/**
 * ForesightAI™ Feedback API Routes
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

const router = Router();

/**
 * Submit clinical feedback for a prediction
 */
router.post('/feedback/submit', async (req, res) => {
  try {
    const {
      organizationId,
      predictionId,
      actualOutcome,
      observedBiomarkers,
      safetyEvents,
      efficacyMetrics,
      timeToEvent,
      confidenceInterval
    } = req.body;

    if (!organizationId || !predictionId || !actualOutcome) {
      return res.status(400).json({
        error: 'Missing required fields: organizationId, predictionId, actualOutcome'
      });
    }

    const result = await feedbackOrchestrator.processClinicalFeedback(
      organizationId,
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
    console.error('[FeedbackAPI] Error submitting feedback:', error);
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
    const { organizationId } = req.params;
    const { limit = 100, offset = 0 } = req.query;

    const feedbackHistory = await db!
      .select()
      .from(clinicalFeedback)
      .where(eq(clinicalFeedback.organizationId, parseInt(organizationId)))
      .orderBy(desc(clinicalFeedback.capturedAt))
      .limit(Number(limit))
      .offset(Number(offset));

    res.json({
      success: true,
      feedback: feedbackHistory,
      total: feedbackHistory.length
    });
  } catch (error) {
    console.error('[FeedbackAPI] Error fetching feedback history:', error);
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
    const { organizationId } = req.body;

    if (!organizationId) {
      return res.status(400).json({
        error: 'Missing required field: organizationId'
      });
    }

    const monitoringResult = await feedbackOrchestrator.continuousMonitoring(organizationId);

    res.json({
      success: true,
      monitoring: monitoringResult
    });
  } catch (error) {
    console.error('[FeedbackAPI] Error in continuous monitoring:', error);
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
    const { organizationId } = req.body;

    if (!organizationId) {
      return res.status(400).json({
        error: 'Missing required field: organizationId'
      });
    }

    const metaLearningResult = await feedbackOrchestrator.performMetaLearning(organizationId);

    res.json({
      success: true,
      metaLearning: metaLearningResult
    });
  } catch (error) {
    console.error('[FeedbackAPI] Error in meta-learning:', error);
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
    const { organizationId, context } = req.body;

    if (!organizationId) {
      return res.status(400).json({
        error: 'Missing required field: organizationId'
      });
    }

    const hypotheses = await feedbackOrchestrator.generateAdaptiveHypotheses(
      organizationId,
      context || {}
    );

    res.json({
      success: true,
      hypotheses
    });
  } catch (error) {
    console.error('[FeedbackAPI] Error generating hypotheses:', error);
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
    const { organizationId } = req.params;
    const { days = 30 } = req.query;

    const startDate = new Date();
    startDate.setDate(startDate.getDate() - Number(days));

    // Get predictions with feedback
    const predictionsWithFeedback = await db!
      .select()
      .from(foresightPredictions)
      .where(
        and(
          eq(foresightPredictions.organizationId, parseInt(organizationId)),
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
    console.error('[FeedbackAPI] Error fetching metrics:', error);
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
    const {
      organizationId,
      studyId,
      phase,
      primaryEndpointMet,
      secondaryEndpoints,
      safetyProfile,
      patientOutcomes,
      biomarkerData
    } = req.body;

    if (!organizationId || !studyId || !phase) {
      return res.status(400).json({
        error: 'Missing required fields: organizationId, studyId, phase'
      });
    }

    const [outcome] = await db!.insert(clinicalOutcomes).values({
      organizationId: parseInt(organizationId),
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
    console.error('[FeedbackAPI] Error storing outcome:', error);
    res.status(500).json({
      error: 'Failed to store clinical outcome',
      message: error instanceof Error ? error.message : 'Unknown error'
    });
  }
});

export default router;