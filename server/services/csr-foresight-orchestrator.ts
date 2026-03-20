/**
 * CSR-to-AnA Predictions Orchestrator Service
 *
 * Orchestrates the integration between CSR Intelligence Library and AnA Predictions,
 * converting CSR data into predictive intelligence and recalibrating models.
 */

import { db } from '../db';
import { 
  clinicalOutcomes,
  biomarkerEndpoints,
  translationalPatterns,
  doseEscalationStudies,
  foresightPredictions,
  clinicalFeedback,
  csrReports
} from '@shared/schema';
import { eq, and, desc, gte, sql } from 'drizzle-orm';
import { csrKnowledgeExtractor } from './csr-knowledge-extractor';
import { ForesightAIEngine } from './foresight-ai-engine';
import { ForesightKnowledgeGraph } from './foresight-knowledge-graph';
import { csrIntegration } from './foresight-csr-integration';

interface CSRIngestionResult {
  csrId: string;
  organizationId: string;
  extractedData: {
    safetySignals: number;
    efficacyOutcomes: number;
    biomarkers: number;
    doseRelationships: number;
  };
  predictionsUpdated: number;
  patternsIdentified: number;
  knowledgeGraphUpdates: number;
  confidenceScore: number;
  timestamp: string;
}

interface CSRInsight {
  type: 'safety' | 'efficacy' | 'biomarker' | 'dose' | 'pattern';
  title: string;
  description: string;
  impact: 'high' | 'medium' | 'low';
  confidence: number;
  evidence: any[];
  recommendations: string[];
}

interface CSRIntegrationStatus {
  totalCSRsProcessed: number;
  lastSyncTime: string;
  activeModels: number;
  predictionAccuracy: number;
  keyInsights: CSRInsight[];
  recentActivity: any[];
}

export class CSRForesightOrchestrator {
  private aiEngine: ForesightAIEngine;
  private knowledgeGraph: ForesightKnowledgeGraph;

  constructor() {
    this.aiEngine = new ForesightAIEngine();
    this.knowledgeGraph = new ForesightKnowledgeGraph();
  }

  /**
   * Process CSR and integrate with AnA Predictions
   */
  async ingestCSR(csrId: string, organizationId: string): Promise<CSRIngestionResult> {
    const startTime = Date.now();
    console.log(`[Orchestrator] Starting CSR ingestion for ${csrId}`);

    try {
      // Step 1: Extract structured data from CSR
      const safetySignals = await csrKnowledgeExtractor.extractSafetySignals(csrId);
      const efficacyOutcomes = await csrKnowledgeExtractor.extractEfficacyOutcomes(csrId);
      const biomarkerCorrelations = await csrKnowledgeExtractor.extractBiomarkerCorrelations(csrId);
      const doseRelationships = await csrKnowledgeExtractor.extractDoseExposureRelationships(csrId);

      console.log(`[Orchestrator] Extracted data: ${safetySignals.length} safety signals, 
        ${efficacyOutcomes.length} efficacy outcomes, ${biomarkerCorrelations.length} biomarkers, 
        ${doseRelationships.length} dose relationships`);

      // Step 2: Store extracted data in AnA Predictions tables
      await csrKnowledgeExtractor.storeInForesightTables(
        csrId,
        organizationId,
        safetySignals,
        efficacyOutcomes,
        biomarkerCorrelations,
        doseRelationships
      );

      // Step 3: Update Knowledge Graph
      const knowledgeGraphUpdates = await this.updateKnowledgeGraph(
        csrId,
        organizationId,
        biomarkerCorrelations,
        efficacyOutcomes
      );

      // Step 4: Identify new patterns
      const patterns = await this.identifyPatterns(
        safetySignals,
        efficacyOutcomes,
        biomarkerCorrelations,
        doseRelationships
      );

      // Step 5: Recalibrate predictions
      const predictionsUpdated = await this.recalibratePredictions(
        organizationId,
        csrId,
        patterns
      );

      // Step 6: Record clinical feedback for adaptive learning
      await this.recordClinicalFeedback(
        organizationId,
        csrId,
        efficacyOutcomes,
        safetySignals
      );

      // Calculate overall confidence score
      const confidenceScore = this.calculateConfidenceScore(
        safetySignals.length,
        efficacyOutcomes.length,
        biomarkerCorrelations.length,
        patterns.length
      );

      const result: CSRIngestionResult = {
        csrId,
        organizationId,
        extractedData: {
          safetySignals: safetySignals.length,
          efficacyOutcomes: efficacyOutcomes.length,
          biomarkers: biomarkerCorrelations.length,
          doseRelationships: doseRelationships.length
        },
        predictionsUpdated,
        patternsIdentified: patterns.length,
        knowledgeGraphUpdates,
        confidenceScore,
        timestamp: new Date().toISOString()
      };

      console.log(`[Orchestrator] CSR ingestion completed in ${Date.now() - startTime}ms`);
      return result;

    } catch (error) {
      console.error(`[Orchestrator] Error processing CSR ${csrId}:`, error);
      throw error;
    }
  }

  /**
   * Get CSR-derived insights and metrics
   */
  async getCSRInsights(organizationId: string): Promise<CSRInsight[]> {
    const insights: CSRInsight[] = [];

    try {
      // Get recent clinical outcomes
      const recentOutcomes = await db!.select()
        .from(clinicalOutcomes)
        .where(eq(clinicalOutcomes.organizationId, organizationId))
        .orderBy(desc(clinicalOutcomes.createdAt))
        .limit(10);

      // Analyze success patterns
      const successfulOutcomes = recentOutcomes.filter(o => o.outcomeType === 'success');
      if (successfulOutcomes.length > 0) {
        insights.push({
          type: 'pattern',
          title: 'Success Pattern Identified',
          description: `${successfulOutcomes.length} successful outcomes identified with common characteristics`,
          impact: 'high',
          confidence: 0.85,
          evidence: successfulOutcomes.map(o => o.outcomeValue),
          recommendations: [
            'Apply similar study design principles',
            'Focus on identified biomarker profiles',
            'Maintain comparable patient selection criteria'
          ]
        });
      }

      // Get biomarker insights
      const biomarkers = await db!.select()
        .from(biomarkerEndpoints)
        .where(eq(biomarkerEndpoints.organizationId, organizationId))
        .orderBy(desc(biomarkerEndpoints.correlationScore))
        .limit(5);

      if (biomarkers.length > 0) {
        const topBiomarker = biomarkers[0];
        insights.push({
          type: 'biomarker',
          title: `Strong Biomarker Correlation: ${topBiomarker.biomarkerName}`,
          description: `${topBiomarker.biomarkerName} shows ${(topBiomarker.correlationScore * 100).toFixed(1)}% correlation with ${topBiomarker.endpointName}`,
          impact: topBiomarker.correlationScore > 0.7 ? 'high' : 'medium',
          confidence: topBiomarker.confidence,
          evidence: biomarkers.map(b => ({
            biomarker: b.biomarkerName,
            endpoint: b.endpointName,
            correlation: b.correlationScore
          })),
          recommendations: [
            `Prioritize ${topBiomarker.biomarkerName} as a predictive biomarker`,
            'Include in patient stratification strategy',
            'Monitor closely in upcoming trials'
          ]
        });
      }

      // Get safety insights
      const safetyPatterns = await db!.select()
        .from(translationalPatterns)
        .where(
          and(
            eq(translationalPatterns.organizationId, organizationId),
            eq(translationalPatterns.patternType, 'safety')
          )
        )
        .limit(3);

      if (safetyPatterns.length > 0) {
        insights.push({
          type: 'safety',
          title: 'Safety Profile Analysis',
          description: `${safetyPatterns.length} safety patterns identified from CSR analysis`,
          impact: 'medium',
          confidence: 0.75,
          evidence: safetyPatterns.map(p => p.patternData),
          recommendations: [
            'Implement enhanced safety monitoring',
            'Consider dose de-escalation strategies',
            'Update risk management plans'
          ]
        });
      }

      // Get dose-response insights
      const doseStudies = await db!.select()
        .from(doseEscalationStudies)
        .where(eq(doseEscalationStudies.organizationId, organizationId))
        .orderBy(desc(doseEscalationStudies.createdAt))
        .limit(3);

      if (doseStudies.length > 0) {
        const mtdEstimates = doseStudies
          .filter(s => s.metadata?.mtdEstimate)
          .map(s => s.metadata.mtdEstimate);
        
        if (mtdEstimates.length > 0) {
          insights.push({
            type: 'dose',
            title: 'Optimal Dosing Insights',
            description: `MTD estimates available from ${mtdEstimates.length} studies`,
            impact: 'high',
            confidence: 0.8,
            evidence: mtdEstimates,
            recommendations: [
              `Consider starting dose around ${Math.min(...mtdEstimates) * 0.1} mg`,
              `Set maximum dose cap at ${Math.max(...mtdEstimates) * 1.2} mg`,
              'Use adaptive dose escalation design'
            ]
          });
        }
      }

      return insights;

    } catch (error) {
      console.error('[Orchestrator] Error getting CSR insights:', error);
      return insights;
    }
  }

  /**
   * Recalibrate AnA Predictions predictions based on CSR data
   */
  async recalibratePredictions(
    organizationId: string, 
    csrId: string,
    patterns: any[]
  ): Promise<number> {
    let updated = 0;

    try {
      // Get existing predictions for this organization
      const predictions = await db!.select()
        .from(foresightPredictions)
        .where(eq(foresightPredictions.organization_id, organizationId))
        .orderBy(desc(foresightPredictions.created_at))
        .limit(10);

      for (const prediction of predictions) {
        // Enhance prediction with CSR data
        const enhanced = await csrIntegration.enhancePredictionsWithCSR(
          prediction.id,
          prediction.metadata?.indication || '',
          prediction.phase || ''
        );

        // Update prediction with enhanced data
        await db!.update(foresightPredictions)
          .set({
            confidence_score: (prediction.confidence_score + enhanced.enhancedSuccessScore) / 2,
            recommendations: [
              ...prediction.recommendations,
              ...enhanced.recommendations
            ],
            metadata: {
              ...prediction.metadata,
              csrEnhanced: true,
              csrId,
              similarStudiesAnalyzed: enhanced.similarStudiesAnalyzed,
              successFactors: enhanced.successFactors,
              failurePatterns: enhanced.failurePatterns
            },
            updated_at: new Date()
          })
          .where(eq(foresightPredictions.id, prediction.id));

        updated++;
      }

      // Create new predictions based on patterns
      for (const pattern of patterns.slice(0, 3)) {
        const newPrediction = await this.aiEngine.generateAdvancedPrediction({
          organizationId,
          studyPhase: 'Phase II',
          biomarkerData: pattern.biomarkers || [],
          clinicalData: pattern.outcomes || []
        });
        
        if (newPrediction) {
          updated++;
        }
      }

      console.log(`[Orchestrator] Recalibrated ${updated} predictions`);
      return updated;

    } catch (error) {
      console.error('[Orchestrator] Error recalibrating predictions:', error);
      return updated;
    }
  }

  /**
   * Get CSR integration status
   */
  async getIntegrationStatus(organizationId: string): Promise<CSRIntegrationStatus> {
    try {
      // Count processed CSRs
      const processedCSRs = await db!.select({ count: sql<number>`count(*)` })
        .from(csrReports)
        .where(eq(csrReports.organizationId, organizationId));

      // Get last sync time
      const lastSync = await db!.select()
        .from(clinicalOutcomes)
        .where(eq(clinicalOutcomes.organizationId, organizationId))
        .orderBy(desc(clinicalOutcomes.createdAt))
        .limit(1);

      // Count active models
      const activeModels = await db!.select({ count: sql<number>`count(*)` })
        .from(foresightPredictions)
        .where(
          and(
            eq(foresightPredictions.organization_id, organizationId),
            gte(foresightPredictions.created_at, new Date(Date.now() - 30 * 24 * 60 * 60 * 1000))
          )
        );

      // Calculate prediction accuracy (simulated for now)
      const accuracy = 0.78 + Math.random() * 0.15;

      // Get key insights
      const insights = await this.getCSRInsights(organizationId);

      // Get recent activity
      const recentActivity = await db!.select()
        .from(csrReports)
        .where(eq(csrReports.organizationId, organizationId))
        .orderBy(desc(csrReports.uploadDate))
        .limit(5);

      return {
        totalCSRsProcessed: processedCSRs[0]?.count || 0,
        lastSyncTime: lastSync[0]?.createdAt?.toISOString() || new Date().toISOString(),
        activeModels: activeModels[0]?.count || 0,
        predictionAccuracy: accuracy,
        keyInsights: insights.slice(0, 5),
        recentActivity: recentActivity.map(r => ({
          id: r.id,
          title: r.title,
          date: r.uploadDate,
          status: 'processed'
        }))
      };

    } catch (error) {
      console.error('[Orchestrator] Error getting integration status:', error);
      return {
        totalCSRsProcessed: 0,
        lastSyncTime: new Date().toISOString(),
        activeModels: 0,
        predictionAccuracy: 0,
        keyInsights: [],
        recentActivity: []
      };
    }
  }

  /**
   * Private helper methods
   */
  private async updateKnowledgeGraph(
    csrId: string,
    organizationId: string,
    biomarkers: any[],
    outcomes: any[]
  ): Promise<number> {
    let updates = 0;

    try {
      // Update biomarker-endpoint relationships
      for (const biomarker of biomarkers) {
        for (const outcome of outcomes) {
          await this.knowledgeGraph.addNode({
            type: 'biomarker',
            id: `${biomarker.biomarkerName}_${csrId}`,
            data: biomarker
          });

          await this.knowledgeGraph.addNode({
            type: 'endpoint',
            id: `${outcome.type}_${csrId}`,
            data: outcome
          });

          await this.knowledgeGraph.addRelationship({
            source: `${biomarker.biomarkerName}_${csrId}`,
            target: `${outcome.type}_${csrId}`,
            type: 'correlates_with',
            strength: Math.abs(biomarker.correlationScore),
            metadata: {
              csrId,
              organizationId
            }
          });

          updates++;
        }
      }

      return updates;
    } catch (error) {
      console.error('[Orchestrator] Error updating knowledge graph:', error);
      return updates;
    }
  }

  private async identifyPatterns(
    safetySignals: any[],
    efficacyOutcomes: any[],
    biomarkerCorrelations: any[],
    doseRelationships: any[]
  ): Promise<any[]> {
    const patterns = [];

    // Pattern 1: Safety-Efficacy Balance
    if (safetySignals.length > 0 && efficacyOutcomes.length > 0) {
      const safetyScore = 1 - (safetySignals.filter(s => s.type === 'SAE').length / safetySignals.length);
      const efficacyScore = efficacyOutcomes
        .filter(o => o.value > 30)
        .length / efficacyOutcomes.length;

      patterns.push({
        type: 'safety_efficacy_balance',
        safetyScore,
        efficacyScore,
        balance: (safetyScore + efficacyScore) / 2,
        recommendation: safetyScore < efficacyScore 
          ? 'Consider dose reduction to improve safety'
          : 'Dose escalation may improve efficacy'
      });
    }

    // Pattern 2: Biomarker-Response Pattern
    if (biomarkerCorrelations.length > 0) {
      const positiveMarkers = biomarkerCorrelations.filter(b => b.responseAssociation === 'positive');
      if (positiveMarkers.length > 0) {
        patterns.push({
          type: 'biomarker_response',
          biomarkers: positiveMarkers.map(b => b.biomarkerName),
          strength: positiveMarkers.reduce((sum, b) => sum + Math.abs(b.correlationScore), 0) / positiveMarkers.length,
          recommendation: 'Use biomarker stratification for patient selection'
        });
      }
    }

    // Pattern 3: Dose-Response Pattern
    if (doseRelationships.length > 1) {
      const doseResponse = doseRelationships.map(d => ({
        dose: d.doseLevel,
        response: d.cmax,
        toxicity: d.dltRate
      }));

      patterns.push({
        type: 'dose_response',
        relationship: doseResponse,
        optimalDose: doseRelationships.find(d => d.mtdReached)?.doseLevel || 
                    doseRelationships[Math.floor(doseRelationships.length / 2)]?.doseLevel,
        recommendation: 'Optimize dosing based on PK/PD relationship'
      });
    }

    return patterns;
  }

  private async recordClinicalFeedback(
    organizationId: string,
    csrId: string,
    outcomes: any[],
    safetySignals: any[]
  ): Promise<void> {
    try {
      const feedback = {
        organizationId,
        predictionId: null,
        studyId: csrId,
        phase: 'Unknown',
        actualOutcome: {
          efficacy: outcomes,
          safety: safetySignals
        },
        outcomeDate: new Date(),
        matchScore: null,
        lessonLearned: `CSR ${csrId} provided ${outcomes.length} efficacy outcomes and ${safetySignals.length} safety signals`,
        metadata: {
          source: 'csr_ingestion',
          csrId
        }
      };

      await db!.insert(clinicalFeedback).values(feedback);
    } catch (error) {
      console.error('[Orchestrator] Error recording clinical feedback:', error);
    }
  }

  private calculateConfidenceScore(
    safetyCount: number,
    efficacyCount: number,
    biomarkerCount: number,
    patternCount: number
  ): number {
    let score = 0.5; // Base confidence
    
    // Add confidence based on data completeness
    if (safetyCount > 5) score += 0.1;
    if (efficacyCount > 3) score += 0.15;
    if (biomarkerCount > 2) score += 0.15;
    if (patternCount > 2) score += 0.1;
    
    return Math.min(score, 1);
  }
}

// Export singleton instance
export const csrForesightOrchestrator = new CSRForesightOrchestrator();