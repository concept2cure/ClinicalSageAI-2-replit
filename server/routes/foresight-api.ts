/**
 * ForesightAI™ Core API Routes
 * 
 * Provides predictive scoring, pattern analysis, and recommendations
 * for clinical trial success across all phases (0/I through IV)
 */

import { Router } from 'express';
import { db } from '../db';
import { eq, and, or, gte, desc, asc, sql, like } from 'drizzle-orm';
import {
  biomarkerEndpoints,
  clinicalOutcomes,
  foresightPredictions,
  clinicalFeedback,
  translationalPatterns,
  type InsertForesightPrediction,
  type InsertClinicalFeedback,
} from '@shared/schema';
import { knowledgeGraph } from '../services/foresight-knowledge-graph';
import { z } from 'zod';

const router = Router();

// Validation schemas
const PredictionRequestSchema = z.object({
  studyId: z.string(),
  phase: z.string(),
  indication: z.string(),
  biomarkers: z.array(z.object({
    id: z.string(),
    name: z.string(),
    type: z.string(),
  })).optional(),
  endpoints: z.array(z.object({
    id: z.string(),
    name: z.string(),
    type: z.string(),
  })).optional(),
  sampleSize: z.number().optional(),
  organizationId: z.number().optional(),
});

const FeedbackSchema = z.object({
  studyId: z.string(),
  predictionId: z.string().optional(),
  phase: z.string(),
  feedbackType: z.string(),
  actualOutcome: z.string(),
  predictedOutcome: z.string().optional(),
  learningPoints: z.any().optional(),
  organizationId: z.number().optional(),
});

/**
 * GET /api/foresight/score
 * Calculate predictive success score for a study
 */
router.post('/score', async (req, res) => {
  try {
    const data = PredictionRequestSchema.parse(req.body);
    
    // Get historical patterns for this indication/phase
    const patterns = await db
      .select()
      .from(translationalPatterns)
      .where(
        and(
          eq(translationalPatterns.indication, data.indication),
          eq(translationalPatterns.phase, data.phase)
        )
      );
    
    // Get biomarker-endpoint correlations
    const correlations = await knowledgeGraph.findBiomarkerEndpointCorrelations(
      data.indication,
      data.phase
    );
    
    // Calculate base success score
    let successScore = 0.5; // Start with neutral score
    
    // Adjust based on historical patterns
    const successPatterns = patterns.filter(p => p.patternType === 'success');
    const failurePatterns = patterns.filter(p => p.patternType === 'failure');
    
    if (successPatterns.length > 0) {
      const avgSuccessRate = successPatterns.reduce((acc, p) => acc + (p.successRate || 0), 0) / successPatterns.length;
      successScore = avgSuccessRate;
    }
    
    // Adjust based on biomarker correlations
    if (correlations.length > 0) {
      const avgCorrelation = correlations.reduce((acc, c) => acc + (c.correlationScore || 0), 0) / correlations.length;
      successScore = (successScore + avgCorrelation) / 2;
    }
    
    // Risk factors analysis
    const riskFactors = [];
    
    if (data.sampleSize && data.sampleSize < 50) {
      riskFactors.push({
        factor: 'small_sample_size',
        impact: -0.15,
        description: 'Sample size below recommended threshold',
      });
      successScore -= 0.15;
    }
    
    if (failurePatterns.length > successPatterns.length) {
      riskFactors.push({
        factor: 'negative_historical_trend',
        impact: -0.20,
        description: 'More failure patterns than success patterns in historical data',
      });
      successScore -= 0.20;
    }
    
    // Generate recommendations
    const recommendations = [];
    
    if (successScore < 0.5) {
      recommendations.push({
        type: 'protocol',
        priority: 'high',
        action: 'Consider adaptive trial design to allow for mid-study modifications',
      });
    }
    
    if (data.sampleSize && data.sampleSize < 100) {
      recommendations.push({
        type: 'enrollment',
        priority: 'medium',
        action: 'Increase sample size or consider stratification to improve statistical power',
      });
    }
    
    if (correlations.length > 0) {
      const strongCorrelations = correlations.filter(c => (c.correlationScore || 0) > 0.7);
      if (strongCorrelations.length > 0) {
        recommendations.push({
          type: 'biomarker',
          priority: 'high',
          action: `Focus on biomarkers with strong correlation: ${strongCorrelations.map(c => c.biomarkerName).join(', ')}`,
        });
      }
    }
    
    // Find similar trials
    const similarTrials = await db
      .select()
      .from(csrReports)
      .where(
        and(
          eq(csrReports.indication, data.indication),
          eq(csrReports.phase, data.phase)
        )
      )
      .limit(5);
    
    // Save prediction to database
    const predictionData: InsertForesightPrediction = {
      studyId: data.studyId,
      phase: data.phase,
      predictionType: 'success_score',
      successScore: Math.max(0, Math.min(1, successScore)), // Clamp between 0 and 1
      confidenceInterval: {
        lower: Math.max(0, successScore - 0.1),
        upper: Math.min(1, successScore + 0.1),
      },
      riskFactors,
      recommendations,
      similarTrials: similarTrials.map(t => ({
        id: t.nctId || t.id,
        title: t.title,
        similarity: 0.85, // Simplified - would use real similarity calculation
      })),
      failurePatterns: failurePatterns.map(p => ({
        pattern: p.patternName,
        probability: 1 - (p.successRate || 0),
      })),
      modelVersion: '1.0.0',
      organizationId: data.organizationId,
      expiresAt: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000), // 30 days
    };
    
    const [savedPrediction] = await db
      .insert(foresightPredictions)
      .values(predictionData)
      .returning();
    
    res.json({
      success: true,
      prediction: {
        id: savedPrediction.id,
        studyId: data.studyId,
        phase: data.phase,
        successScore: savedPrediction.successScore,
        confidenceInterval: savedPrediction.confidenceInterval,
        riskFactors: savedPrediction.riskFactors,
        recommendations: savedPrediction.recommendations,
        similarTrials: savedPrediction.similarTrials,
        failurePatterns: savedPrediction.failurePatterns,
      },
    });
  } catch (error) {
    console.error('Error calculating prediction score:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to calculate prediction score',
    });
  }
});

/**
 * GET /api/foresight/patterns
 * Get failure/success patterns for a given indication and phase
 */
router.get('/patterns', async (req, res) => {
  try {
    const { indication, phase } = req.query;
    
    if (!indication || !phase) {
      return res.status(400).json({
        success: false,
        error: 'Indication and phase are required',
      });
    }
    
    // Get translational patterns
    const patterns = await knowledgeGraph.getTranslationalPatterns(
      indication as string,
      phase as string
    );
    
    // Get failure patterns
    const failurePatterns = await knowledgeGraph.identifyFailurePatterns(
      indication as string,
      phase as string
    );
    
    res.json({
      success: true,
      data: {
        translationalPatterns: patterns,
        failurePatterns,
        totalPatterns: patterns.length + failurePatterns.length,
      },
    });
  } catch (error) {
    console.error('Error fetching patterns:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to fetch patterns',
    });
  }
});

/**
 * GET /api/foresight/recommendations
 * Get study design recommendations based on patterns
 */
router.get('/recommendations', async (req, res) => {
  try {
    const { studyId, phase, indication } = req.query;
    
    if (!phase || !indication) {
      return res.status(400).json({
        success: false,
        error: 'Phase and indication are required',
      });
    }
    
    // Get existing predictions if available
    let predictions = [];
    if (studyId) {
      predictions = await db
        .select()
        .from(foresightPredictions)
        .where(eq(foresightPredictions.studyId, studyId as string))
        .orderBy(desc(foresightPredictions.createdAt))
        .limit(1);
    }
    
    // Get biomarker-endpoint correlations
    const correlations = await knowledgeGraph.findBiomarkerEndpointCorrelations(
      indication as string,
      phase as string,
      0.6 // Higher threshold for recommendations
    );
    
    // Build recommendations
    const recommendations = {
      protocol: [],
      enrollment: [],
      endpoints: [],
      biomarkers: [],
      safety: [],
    };
    
    // Protocol recommendations
    if (phase === 'Phase I') {
      recommendations.protocol.push({
        priority: 'high',
        action: 'Consider 3+3 dose escalation design for first-in-human studies',
        rationale: 'Standard approach for Phase I safety assessment',
      });
    }
    
    if (phase === 'Phase II') {
      recommendations.protocol.push({
        priority: 'medium',
        action: 'Consider adaptive design to optimize dose selection',
        rationale: 'Allows for mid-study adjustments based on interim results',
      });
    }
    
    // Biomarker recommendations
    if (correlations.length > 0) {
      const topBiomarkers = correlations.slice(0, 3);
      recommendations.biomarkers.push({
        priority: 'high',
        action: `Include biomarkers: ${topBiomarkers.map(c => c.biomarkerName).join(', ')}`,
        rationale: `Strong correlation with clinical endpoints (${topBiomarkers[0].correlationScore?.toFixed(2)} correlation)`,
      });
    }
    
    // Endpoint recommendations
    recommendations.endpoints.push({
      priority: 'high',
      action: `Use validated endpoints for ${indication}`,
      rationale: 'FDA-accepted endpoints increase approval likelihood',
    });
    
    res.json({
      success: true,
      recommendations,
      basedOn: {
        predictions: predictions.length,
        correlations: correlations.length,
        indication: indication as string,
        phase: phase as string,
      },
    });
  } catch (error) {
    console.error('Error generating recommendations:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to generate recommendations',
    });
  }
});

/**
 * GET /api/foresight/phase/{phase}/modules
 * Get phase-specific modules and tools
 */
router.get('/phase/:phase/modules', async (req, res) => {
  const { phase } = req.params;
  
  const phaseModules: Record<string, any> = {
    '0': {
      modules: [
        {
          id: 'dose-escalation',
          name: 'Dose Escalation Policy Engine',
          description: 'Bayesian reverse mapping with toxicity predictions',
          status: 'active',
        },
        {
          id: 'ind-narrative',
          name: 'IND Narrative Drafting',
          description: 'Regulatory-grade documentation from preclinical data',
          status: 'active',
        },
        {
          id: 'pk-pd-translation',
          name: 'Cross-Species PK/PD Translation',
          description: 'Animal-to-human predictive modeling',
          status: 'active',
        },
      ],
    },
    'I': {
      modules: [
        {
          id: 'dose-escalation',
          name: 'Dose Escalation Policy Engine',
          description: 'Bayesian reverse mapping with toxicity predictions',
          status: 'active',
        },
        {
          id: 'ind-narrative',
          name: 'IND Narrative Drafting',
          description: 'Regulatory-grade documentation from preclinical data',
          status: 'active',
        },
        {
          id: 'pk-pd-translation',
          name: 'Cross-Species PK/PD Translation',
          description: 'Animal-to-human predictive modeling',
          status: 'active',
        },
      ],
    },
    'II': {
      modules: [
        {
          id: 'enrollment-stratifier',
          name: 'Predictive Enrollment Stratifier',
          description: 'Site selection via ML patient matching',
          status: 'active',
        },
        {
          id: 'april',
          name: 'APRIL (Adaptive Protocol RL)',
          description: 'Real-time trial design optimization',
          status: 'active',
        },
        {
          id: 'saecin',
          name: 'SAECIN (Safety Anomaly Detector)',
          description: 'Early signal detection network',
          status: 'active',
        },
        {
          id: 'sca-generator',
          name: 'SCA Generator',
          description: 'Synthetic control arm creation',
          status: 'active',
        },
      ],
    },
    'III': {
      modules: [
        {
          id: 'ctd-builder',
          name: 'Regulatory CTD Builder',
          description: 'Automated Module 2 generation',
          status: 'active',
        },
        {
          id: 'patient-narrative',
          name: 'Patient Narrative Prioritization',
          description: 'QC-driven critical case selection',
          status: 'active',
        },
        {
          id: 'regulatory-benchmark',
          name: 'Regulatory Benchmarking',
          description: 'Gap analysis vs successful submissions',
          status: 'active',
        },
        {
          id: 'label-claims',
          name: 'Label Claim Evidence Scrutiny',
          description: 'Evidence strength scoring',
          status: 'active',
        },
      ],
    },
    'IV': {
      modules: [
        {
          id: 'rwe-bridging',
          name: 'RWE Bridging',
          description: 'Real-world evidence integration',
          status: 'active',
        },
        {
          id: 'indication-expansion',
          name: 'Indication Expansion Scoring',
          description: 'Next indication prioritization',
          status: 'active',
        },
      ],
    },
  };
  
  const modules = phaseModules[phase] || { modules: [] };
  
  res.json({
    success: true,
    phase,
    ...modules,
  });
});

/**
 * POST /api/foresight/feedback
 * Capture trial outcomes for continuous learning
 */
router.post('/feedback', async (req, res) => {
  try {
    const data = FeedbackSchema.parse(req.body);
    
    // Save feedback
    const feedbackData: InsertClinicalFeedback = {
      studyId: data.studyId,
      predictionId: data.predictionId,
      phase: data.phase,
      feedbackType: data.feedbackType,
      actualOutcome: data.actualOutcome,
      predictedOutcome: data.predictedOutcome,
      accuracyScore: data.actualOutcome === data.predictedOutcome ? 1.0 : 0.0,
      learningPoints: data.learningPoints,
      verified: false,
      organizationId: data.organizationId,
    };
    
    const [savedFeedback] = await db
      .insert(clinicalFeedback)
      .values(feedbackData)
      .returning();
    
    // Update patterns based on feedback
    if (data.actualOutcome === 'success' || data.actualOutcome === 'failure') {
      // This would trigger pattern learning in production
      console.log('Updating patterns based on feedback:', data.actualOutcome);
    }
    
    res.json({
      success: true,
      feedback: {
        id: savedFeedback.id,
        studyId: savedFeedback.studyId,
        feedbackType: savedFeedback.feedbackType,
        captured: true,
      },
    });
  } catch (error) {
    console.error('Error capturing feedback:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to capture feedback',
    });
  }
});

/**
 * GET /api/foresight/knowledge-graph
 * Get knowledge graph data for visualization
 */
router.get('/knowledge-graph', async (req, res) => {
  try {
    const { indication, phase, limit = 100 } = req.query;
    
    const conditions = [];
    if (indication) {
      conditions.push(eq(biomarkerEndpoints.indication, indication as string));
    }
    if (phase) {
      conditions.push(eq(biomarkerEndpoints.phase, phase as string));
    }
    
    // Get biomarker-endpoint relationships
    const relationships = await db
      .select()
      .from(biomarkerEndpoints)
      .where(conditions.length > 0 ? and(...conditions) : undefined)
      .limit(Number(limit));
    
    // Format for visualization
    const nodes = new Map();
    const edges = [];
    
    relationships.forEach(rel => {
      // Add biomarker node
      if (!nodes.has(`bio_${rel.biomarkerId}`)) {
        nodes.set(`bio_${rel.biomarkerId}`, {
          id: `bio_${rel.biomarkerId}`,
          label: rel.biomarkerName,
          type: 'biomarker',
          group: rel.biomarkerType,
        });
      }
      
      // Add endpoint node
      if (!nodes.has(`end_${rel.endpointId}`)) {
        nodes.set(`end_${rel.endpointId}`, {
          id: `end_${rel.endpointId}`,
          label: rel.endpointName,
          type: 'endpoint',
          group: rel.endpointType,
        });
      }
      
      // Add edge
      edges.push({
        source: `bio_${rel.biomarkerId}`,
        target: `end_${rel.endpointId}`,
        weight: rel.correlationScore || 0.5,
        evidence: rel.evidenceCount || 0,
      });
    });
    
    res.json({
      success: true,
      graph: {
        nodes: Array.from(nodes.values()),
        edges,
        statistics: {
          totalNodes: nodes.size,
          totalEdges: edges.length,
          biomarkers: Array.from(nodes.values()).filter(n => n.type === 'biomarker').length,
          endpoints: Array.from(nodes.values()).filter(n => n.type === 'endpoint').length,
        },
      },
    });
  } catch (error) {
    console.error('Error fetching knowledge graph:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to fetch knowledge graph',
    });
  }
});

export default router;