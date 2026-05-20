/**
 * AnA Predictions™ Advanced API Routes
 * Production endpoints for pharmaceutical companies using cutting-edge AI
 */

import { Router } from 'express';
import { z } from 'zod';
import { ForesightAIEngine } from '../services/foresight-ai-engine';
import { db } from '../db';
import { authedOrgId } from '../utils/authedOrgId';

// SECURITY: foresight-ai endpoints query dose-escalation, cross-species
// PKPD, and trial data — all per-org. Pre-fix the org filter was read
// from req.query.organizationId, sometimes with an `|| 'default'`
// fallback. Now sourced from the JWT.
import { 
  doseEscalationStudies,
  doseLevels,
  doseCohorts,
  dltEvents,
  crossSpeciesPkpd,
  speciesComparisons,
  indNarratives,
  indNarrativeSections 
} from '@shared/schema';
import { eq, and, desc, sql } from 'drizzle-orm';

const router = Router();
const aiEngine = new ForesightAIEngine();

// Advanced multi-modal prediction endpoint
const PredictionRequestSchema = z.object({
  organizationId: z.string(),
  studyPhase: z.string(),
  biomarkerData: z.array(z.any()),
  clinicalData: z.array(z.any()).optional(),
  imagingMetadata: z.array(z.any()).optional(),
  genomicMarkers: z.array(z.any()).optional(),
  patientDemographics: z.array(z.any()).optional()
});

router.post('/predictions/advanced', async (req, res) => {
  try {
    const params = PredictionRequestSchema.parse(req.body);
    const result = await aiEngine.generateAdvancedPrediction(params);
    res.json(result);
  } catch (error) {
    console.error('Advanced prediction error:', error);
    res.status(500).json({ error: 'Failed to generate advanced prediction' });
  }
});

// Dose escalation optimization endpoint
const DoseEscalationRequestSchema = z.object({
  studyId: z.string().optional(),
  organizationId: z.string(),
  compound: z.string(),
  indication: z.string(),
  method: z.enum(['modified_fibonacci', '3_plus_3', 'boin', 'crm']).optional(),
  startingDose: z.number().optional(),
  maxDose: z.number().optional(),
  targetDLTRate: z.number().optional().default(0.25),
  cohortSize: z.number().optional().default(3)
});

router.post('/dose-escalation/optimize', async (req, res) => {
  try {
    const params = DoseEscalationRequestSchema.parse(req.body);
    
    // Create or fetch study
    let studyId = params.studyId;
    if (!studyId) {
      const [study] = await db!.insert(doseEscalationStudies).values({
        organizationId: params.organizationId,
        studyName: `${params.compound} - ${params.indication}`,
        compoundName: params.compound,
        indication: params.indication,
        escalationMethod: params.method || '3_plus_3',
        startingDose: params.startingDose || 0.1,
        maxDose: params.maxDose || 1000,
        currentDoseLevel: params.startingDose || 0.1,
        status: 'planning',
        metadata: {
          targetDLTRate: params.targetDLTRate,
          cohortSize: params.cohortSize,
          createdAt: new Date().toISOString()
        }
      }).returning();
      studyId = study.id;
    }
    
    const result = await aiEngine.calculateOptimalDoseEscalation(studyId);
    res.json({ studyId, ...result });
  } catch (error) {
    console.error('Dose escalation error:', error);
    res.status(500).json({ error: 'Failed to optimize dose escalation' });
  }
});

// Report dose-limiting toxicity
const DLTReportSchema = z.object({
  cohortId: z.string(),
  patientId: z.string(),
  dltType: z.string(),
  grade: z.number().min(1).max(5),
  onsetDay: z.number(),
  description: z.string(),
  outcome: z.enum(['resolved', 'ongoing', 'fatal']),
  attribution: z.enum(['unrelated', 'unlikely', 'possible', 'probable', 'definite'])
});

router.post('/dose-escalation/report-dlt', async (req, res) => {
  try {
    const params = DLTReportSchema.parse(req.body);
    
    // Record DLT event
    const [dlt] = await db!.insert(dltEvents).values({
      cohortId: params.cohortId,
      patientIdentifier: params.patientId,
      dltType: params.dltType,
      grade: params.grade,
      onsetDay: params.onsetDay,
      resolved: params.outcome === 'resolved',
      description: params.description,
      attribution: params.attribution,
      reportedDate: new Date(),
      metadata: {
        reportedBy: (req as any).user?.id || 'system',
        timestamp: new Date().toISOString()
      }
    }).returning();
    
    // Update cohort DLT count
    const [cohort] = await db!.select()
      .from(doseCohorts)
      .where(eq(doseCohorts.id, params.cohortId));
    
    if (cohort) {
      await db!.update(doseCohorts)
        .set({ 
          dltsObserved: cohort.dltsObserved + 1,
          status: cohort.dltsObserved + 1 >= 2 ? 'completed_with_dlts' : cohort.status
        })
        .where(eq(doseCohorts.id, params.cohortId));
      
      // Get AI recommendation for next steps
      const studyId = cohort.studyId;
      const recommendation = await aiEngine.calculateOptimalDoseEscalation(studyId);
      
      res.json({ 
        dlt, 
        recommendation,
        alert: cohort.dltsObserved + 1 >= 2 
          ? 'DLT threshold reached for this cohort. Review dose escalation plan.'
          : null
      });
    } else {
      res.json({ dlt });
    }
  } catch (error) {
    console.error('DLT reporting error:', error);
    res.status(500).json({ error: 'Failed to report DLT' });
  }
});

// Clinical protocol generation endpoint
const ProtocolGenerationSchema = z.object({
  organizationId: z.string(),
  indication: z.string(),
  phase: z.enum(['0', 'I', 'I/II', 'II', 'IIa', 'IIb', 'III', 'IIIa', 'IIIb', 'IV']),
  primaryEndpoint: z.string(),
  targetPopulation: z.string(),
  designPreferences: z.array(z.string()).optional(),
  regulatoryRegion: z.enum(['FDA', 'EMA', 'both']).optional().default('FDA'),
  adaptiveDesign: z.boolean().optional(),
  biomarkerStratification: z.boolean().optional()
});

router.post('/protocol/generate', async (req, res) => {
  try {
    const params = ProtocolGenerationSchema.parse(req.body);
    const protocol = await aiEngine.generateClinicalProtocol(params);
    
    // Fetch the complete protocol with sections
    const sections = await db!.select()
      .from(indNarrativeSections)
      .where(eq(indNarrativeSections.narrativeId, protocol.id))
      .orderBy(indNarrativeSections.sectionNumber);
    
    res.json({ 
      protocol,
      sections,
      downloadUrl: `/api/foresight/protocol/download/${protocol.id}`
    });
  } catch (error) {
    console.error('Protocol generation error:', error);
    res.status(500).json({ error: 'Failed to generate protocol' });
  }
});

// Cross-species PK/PD analysis endpoint
const CrossSpeciesAnalysisSchema = z.object({
  organizationId: z.string(),
  compoundId: z.string(),
  compoundName: z.string(),
  speciesData: z.array(z.object({
    species: z.enum(['mouse', 'rat', 'rabbit', 'dog', 'monkey', 'minipig']),
    dose: z.number(),
    doseUnit: z.enum(['mg/kg', 'mg/m2']),
    cmax: z.number(),
    auc: z.number(),
    halfLife: z.number(),
    clearance: z.number(),
    volume: z.number(),
    bodyWeight: z.number().optional()
  }))
});

router.post('/pkpd/cross-species-analysis', async (req, res) => {
  try {
    const params = CrossSpeciesAnalysisSchema.parse(req.body);
    const analysis = await aiEngine.performCrossSpeciesAnalysis(params);
    res.json(analysis);
  } catch (error) {
    console.error('Cross-species analysis error:', error);
    res.status(500).json({ error: 'Failed to perform cross-species analysis' });
  }
});

// Clinical risk analysis endpoint
const RiskAnalysisSchema = z.object({
  organizationId: z.string(),
  phase: z.string(),
  indication: z.string(),
  targetPopulation: z.string(),
  competitiveLandscape: z.array(z.string()).optional(),
  historicalData: z.array(z.any()).optional(),
  regulatoryPrecedents: z.array(z.string()).optional()
});

router.post('/risk-analysis/clinical', async (req, res) => {
  try {
    const params = RiskAnalysisSchema.parse(req.body);
    const risks = await aiEngine.analyzeClinicalRisks(params);
    
    // Generate risk mitigation plan
    const mitigationPlan = {
      highRisks: risks.risks?.filter((r: any) => r.score >= 7) || [],
      mediumRisks: risks.risks?.filter((r: any) => r.score >= 4 && r.score < 7) || [],
      lowRisks: risks.risks?.filter((r: any) => r.score < 4) || [],
      overallRiskScore: risks.overallScore || 0,
      goNoGoRecommendation: risks.overallScore < 7 ? 'proceed_with_caution' : 'review_required',
      criticalSuccessFactors: risks.criticalFactors || []
    };
    
    res.json({ risks, mitigationPlan });
  } catch (error) {
    console.error('Risk analysis error:', error);
    res.status(500).json({ error: 'Failed to analyze clinical risks' });
  }
});

// Adaptive learning endpoint
const AdaptiveLearningSchema = z.object({
  feedbackId: z.string(),
  actualOutcome: z.any(),
  lessonLearned: z.string().optional()
});

router.post('/learning/adaptive', async (req, res) => {
  try {
    const params = AdaptiveLearningSchema.parse(req.body);
    const learnings = await aiEngine.adaptiveLearning(params.feedbackId);
    res.json(learnings);
  } catch (error) {
    console.error('Adaptive learning error:', error);
    res.status(500).json({ error: 'Failed to process adaptive learning' });
  }
});

// Real-time study monitoring
router.get('/monitor/study/:studyId', async (req, res) => {
  try {
    const { studyId } = req.params;
    const intelligence = await aiEngine.monitorStudyIntelligence(studyId);
    res.json(intelligence);
  } catch (error) {
    console.error('Study monitoring error:', error);
    res.status(500).json({ error: 'Failed to monitor study intelligence' });
  }
});

// Hypothesis generation endpoint
const HypothesisGenerationSchema = z.object({
  indication: z.string(),
  mechanism: z.string(),
  targetProfile: z.string(),
  competitorData: z.array(z.any()).optional(),
  preclinicalEvidence: z.array(z.any()).optional()
});

router.post('/hypothesis/generate', async (req, res) => {
  try {
    const params = HypothesisGenerationSchema.parse(req.body);
    
    // Use AI to generate testable hypotheses
    const context = {
      indication: params.indication,
      mechanism: params.mechanism,
      targetProfile: params.targetProfile,
      competitors: params.competitorData || [],
      evidence: params.preclinicalEvidence || []
    };
    
    const prediction = {
      confidence: 0.75,
      rationale: 'Based on mechanism and competitor analysis'
    };
    
    const hypothesis = await aiEngine.generateClinicalHypothesis(prediction, context);
    res.json(hypothesis);
  } catch (error) {
    console.error('Hypothesis generation error:', error);
    res.status(500).json({ error: 'Failed to generate hypothesis' });
  }
});

// Get all dose escalation studies for an organization
router.get('/dose-escalation/studies', async (req, res) => {
  try {
    const organizationId = String(authedOrgId(req) ?? '');
    if (!organizationId) {
      return res.status(403).json({ error: 'Tenant context required' });
    }
    
    if (!organizationId) {
      return res.status(400).json({ error: 'organizationId is required' });
    }
    
    // Fetch studies with related cohorts and DLT events
    const studies = await db!.select()
      .from(doseEscalationStudies)
      .where(eq(doseEscalationStudies.organizationId, organizationId))
      .orderBy(desc(doseEscalationStudies.createdAt));
    
    // For each study, try to fetch related cohorts and their DLT events
    // Using raw SQL queries for more flexibility with our table structure
    const studiesWithDetails = await Promise.all(
      studies.map(async (study) => {
        try {
          // Fetch cohorts using raw SQL to avoid schema mismatch
          const cohortsResult = await db!.execute(sql`
            SELECT id, study_id, dose_level_id, cohort_number, patient_id,
                   enrollment_date, first_dose_date, last_dose_date,
                   dlt_evaluation_start_date, dlt_evaluation_end_date,
                   evaluable_for_dlt, dlt_occurred, dlt_details,
                   discontinuation_date, discontinuation_reason, best_response,
                   adverse_events, concomitant_medications, pk_samples,
                   biomarker_results, metadata, created_at, updated_at
            FROM dose_cohorts
            WHERE study_id = ${study.id}
            ORDER BY cohort_number
          `);
          
          const cohorts = cohortsResult.rows || [];
          
          // For each cohort, fetch DLT events
          const cohortsWithDlts = await Promise.all(
            cohorts.map(async (cohort: any) => {
              const dltResult = await db!.execute(sql`
                SELECT id, study_id, cohort_id, patient_id, event_date,
                       ctcae_grade, system_organ_class, preferred_term,
                       description, relatedness, seriousness, outcome,
                       action_taken, dose_modification, rechallenge,
                       rechallenge_outcome, reported_to_fda, reported_to_irb,
                       metadata, created_at, updated_at
                FROM dlt_events
                WHERE cohort_id = ${cohort.id}
                ORDER BY reported_date DESC
              `);
              
              return {
                ...cohort,
                dltEvents: dltResult.rows || []
              };
            })
          );
          
          return {
            ...study,
            cohorts: cohortsWithDlts,
            totalCohorts: cohorts.length,
            totalDlts: cohortsWithDlts.reduce((sum, c) => sum + (c.dltEvents?.length || 0), 0)
          };
        } catch (error) {
          // If there's an error fetching related data, return the study without it
          console.error('Error fetching cohort data:', error);
          return {
            ...study,
            cohorts: [],
            totalCohorts: 0,
            totalDlts: 0
          };
        }
      })
    );
    
    res.json(studiesWithDetails);
  } catch (error) {
    console.error('Error fetching dose escalation studies:', error);
    res.status(500).json({ error: 'Failed to fetch studies' });
  }
});

// Get all IND narratives for an organization
router.get('/ind-narratives', async (req, res) => {
  try {
    const organizationId = String(authedOrgId(req) ?? '');
    if (!organizationId) {
      return res.status(403).json({ error: 'Tenant context required' });
    }
    
    if (!organizationId) {
      return res.status(400).json({ error: 'organizationId is required' });
    }
    
    // Fetch narratives
    const narratives = await db!.select()
      .from(indNarratives)
      .where(eq(indNarratives.organizationId, organizationId))
      .orderBy(desc(indNarratives.createdAt));
    
    // For each narrative, try to fetch related sections
    // Using raw SQL queries for more flexibility with our table structure
    const narrativesWithSections = await Promise.all(
      narratives.map(async (narrative) => {
        try {
          const sectionsResult = await db!.execute(sql`
            SELECT id, narrative_id, section_number, section_title, section_type,
                   template_id, content, html_content, word_count, data_source,
                   citations, tables, figures, review_status, review_comments,
                   compliance_flags, version, previous_version_id,
                   created_by, last_modified_by, created_at, updated_at
            FROM ind_narrative_sections
            WHERE narrative_id = ${narrative.id}
            ORDER BY section_number
          `);
          
          const sections = sectionsResult.rows || [];
          
          return {
            ...narrative,
            sections,
            totalSections: sections.length
          };
        } catch (error) {
          console.error('Error fetching narrative sections:', error);
          return {
            ...narrative,
            sections: [],
            totalSections: 0
          };
        }
      })
    );
    
    res.json(narrativesWithSections);
  } catch (error) {
    console.error('Error fetching IND narratives:', error);
    res.status(500).json({ error: 'Failed to fetch narratives' });
  }
});

// Predictive success scoring endpoint
const PredictiveSuccessSchema = z.object({
  organizationId: z.string(),
  studyId: z.string(),
  phase: z.enum(['0', 'I', 'I/II', 'II', 'IIa', 'IIb', 'III', 'IIIa', 'IIIb', 'IV']),
  indication: z.string(),
  biomarkerData: z.array(z.object({
    name: z.string(),
    value: z.number(),
    unit: z.string(),
    correlation: z.number()
  })).optional(),
  preclinicalData: z.object({
    efficacyScore: z.number().min(0).max(1),
    safetyScore: z.number().min(0).max(1),
    pkProfile: z.number().min(0).max(1),
    mechanismValidation: z.number().min(0).max(1)
  }).optional(),
  competitorData: z.array(z.object({
    drug: z.string(),
    phase: z.string(),
    successStatus: z.enum(['approved', 'failed', 'ongoing'])
  })).optional()
});

router.post('/predictive-success/calculate', async (req, res) => {
  try {
    const params = PredictiveSuccessSchema.parse(req.body);
    const result = await aiEngine.calculatePredictiveSuccessScore(params);
    res.json(result);
  } catch (error) {
    console.error('Predictive success scoring error:', error);
    res.status(500).json({ error: 'Failed to calculate predictive success score' });
  }
});

// IND narrative generation endpoint
const INDNarrativeSchema = z.object({
  organizationId: z.string(),
  studyId: z.string(),
  drugName: z.string(),
  indication: z.string(),
  narrativeType: z.string(),
  regulatoryBody: z.enum(['FDA', 'EMA', 'both']),
  additionalContext: z.any().optional()
});

router.post('/ind-narrative/generate', async (req, res) => {
  try {
    const params = INDNarrativeSchema.parse(req.body);
    const result = await aiEngine.generateINDNarrative(params);
    res.json(result);
  } catch (error) {
    console.error('IND narrative generation error:', error);
    res.status(500).json({ error: 'Failed to generate IND narrative' });
  }
});

// Get all cross-species analyses for an organization
router.get('/cross-species/analyses', async (req, res) => {
  try {
    const organizationId = String(authedOrgId(req) ?? '');
    if (!organizationId) {
      return res.status(403).json({ error: 'Tenant context required' });
    }
    
    if (!organizationId) {
      return res.status(400).json({ error: 'organizationId is required' });
    }
    
    // Fetch cross-species PK/PD analyses
    const analyses = await db!.select()
      .from(crossSpeciesPkpd)
      .where(eq(crossSpeciesPkpd.organizationId, organizationId))
      .orderBy(desc(crossSpeciesPkpd.createdAt));
    
    // For each analysis, try to fetch related species comparisons
    // Using raw SQL queries for more flexibility with our table structure
    const analysesWithComparisons = await Promise.all(
      analyses.map(async (analysis) => {
        try {
          const comparisonsResult = await db!.execute(sql`
            SELECT id, analysis_id, species, body_weight, dose_administered,
                   dose_unit, route, cmax_value, tmax, auc0_inf, auc0_last,
                   t12, clearance, volume_distribution, bioavailability,
                   protein_binding, metabolites, tissue_distribution,
                   toxicology_findings, efficacy_endpoints, data_source,
                   study_references, created_at, updated_at
            FROM species_comparisons
            WHERE analysis_id = ${analysis.id}
            ORDER BY species
          `);
          
          const comparisons = comparisonsResult.rows || [];
          
          return {
            ...analysis,
            speciesComparisons: comparisons,
            totalSpecies: comparisons.length
          };
        } catch (error) {
          console.error('Error fetching species comparisons:', error);
          return {
            ...analysis,
            speciesComparisons: [],
            totalSpecies: 0
          };
        }
      })
    );
    
    res.json(analysesWithComparisons);
  } catch (error) {
    console.error('Error fetching cross-species analyses:', error);
    res.status(500).json({ error: 'Failed to fetch analyses' });
  }
});

// ============================================================================
// CSR Integration Endpoints
// ============================================================================

/**
 * CSR Ingestion Endpoint
 * Process CSR and extract insights for AnA Predictions
 */
const CSRIngestSchema = z.object({
  csrId: z.string(),
  organizationId: z.string(),
  processType: z.enum(['full', 'quick', 'metadata_only']).optional().default('full')
});

router.post('/csr/ingest', async (req, res) => {
  try {
    const { csrForesightOrchestrator } = await import('../services/csr-foresight-orchestrator');
    const params = CSRIngestSchema.parse(req.body);
    
    console.log('[AnA Predictions] Processing CSR ingestion:', params);
    
    const result = await csrForesightOrchestrator.ingestCSR(
      params.csrId,
      params.organizationId
    );
    
    res.json({
      success: true,
      message: 'CSR successfully ingested and integrated with AnA Predictions',
      data: result
    });
  } catch (error) {
    console.error('CSR ingestion error:', error);
    res.status(500).json({ 
      success: false,
      error: 'Failed to ingest CSR',
      details: error instanceof Error ? error.message : 'Unknown error'
    });
  }
});

/**
 * CSR Insights Endpoint
 * Get CSR-derived insights and metrics
 */
router.get('/csr/insights', async (req, res) => {
  try {
    const { csrForesightOrchestrator } = await import('../services/csr-foresight-orchestrator');
    const organizationId = String(authedOrgId(req) ?? '');
    if (!organizationId) {
      return res.status(403).json({ error: 'Tenant context required' });
    }
    
    const insights = await csrForesightOrchestrator.getCSRInsights(organizationId);
    
    res.json({
      success: true,
      organizationId,
      insights,
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    console.error('Error fetching CSR insights:', error);
    res.status(500).json({ 
      success: false,
      error: 'Failed to fetch CSR insights'
    });
  }
});

/**
 * Predictions Recalibration Endpoint
 * Recalculate predictions with CSR data
 */
const RecalibrateSchema = z.object({
  organizationId: z.string(),
  studyId: z.string().optional(),
  includeHistorical: z.boolean().optional().default(true),
  recalibrationDepth: z.enum(['shallow', 'moderate', 'deep']).optional().default('moderate')
});

router.post('/predictions/recalibrate', async (req, res) => {
  try {
    const { csrForesightOrchestrator } = await import('../services/csr-foresight-orchestrator');
    const params = RecalibrateSchema.parse(req.body);
    
    // Get CSR insights first
    const insights = await csrForesightOrchestrator.getCSRInsights(params.organizationId);
    
    // Recalibrate predictions
    const predictionsUpdated = await csrForesightOrchestrator.recalibratePredictions(
      params.organizationId,
      params.studyId || 'all',
      insights.map(i => i.evidence).flat()
    );
    
    res.json({
      success: true,
      predictionsUpdated,
      calibrationDepth: params.recalibrationDepth,
      message: `Successfully recalibrated ${predictionsUpdated} predictions with CSR data`
    });
  } catch (error) {
    console.error('Prediction recalibration error:', error);
    res.status(500).json({ 
      success: false,
      error: 'Failed to recalibrate predictions'
    });
  }
});

/**
 * CSR Integration Status Endpoint
 * Get CSR integration status and metrics
 */
router.get('/csr/status', async (req, res) => {
  try {
    const { csrForesightOrchestrator } = await import('../services/csr-foresight-orchestrator');
    const organizationId = String(authedOrgId(req) ?? '');
    if (!organizationId) {
      return res.status(403).json({ error: 'Tenant context required' });
    }
    
    const status = await csrForesightOrchestrator.getIntegrationStatus(organizationId);
    
    res.json({
      success: true,
      organizationId,
      status,
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    console.error('Error fetching CSR integration status:', error);
    res.status(500).json({ 
      success: false,
      error: 'Failed to fetch CSR integration status'
    });
  }
});

export default router;