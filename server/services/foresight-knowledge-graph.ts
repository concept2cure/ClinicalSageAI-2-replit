/**
 * AnA Predictions™ Knowledge Graph Assembler Service
 * 
 * Builds and manages the translational knowledge graph connecting:
 * - Preclinical biomarkers to clinical endpoints
 * - Animal models to human outcomes
 * - Phase-to-phase transition patterns
 * - Success/failure signatures
 */

import { db } from '../db';
import { eq, and, or, gte, sql, inArray, like, desc, asc } from 'drizzle-orm';
import {
  biomarkerEndpoints,
  clinicalOutcomes,
  foresightPredictions,
  clinicalFeedback,
  translationalPatterns,
  type BiomarkerEndpoint,
  type ClinicalOutcome,
  type TranslationalPattern,
  type ForesightPrediction,
  type InsertBiomarkerEndpoint,
  type InsertClinicalOutcome,
  type InsertTranslationalPattern,
} from '@shared/schema';

export class ForesightKnowledgeGraph {
  /**
   * Create biomarker-endpoint relationship
   */
  async createBiomarkerEndpointRelationship(data: InsertBiomarkerEndpoint): Promise<BiomarkerEndpoint> {
    const [relationship] = await db!.insert(biomarkerEndpoints).values(data).returning();
    
    // Update correlation patterns
    await this.updateCorrelationPatterns(relationship.biomarkerId, relationship.endpointId);
    
    return relationship;
  }

  /**
   * Record clinical outcome and update knowledge graph
   */
  async recordClinicalOutcome(data: InsertClinicalOutcome): Promise<ClinicalOutcome> {
    const [outcome] = await db!.insert(clinicalOutcomes).values(data).returning();
    
    // If linked to biomarker-endpoint, update correlation score
    if (outcome.biomarkerEndpointId) {
      await this.updateBiomarkerEndpointCorrelation(outcome.biomarkerEndpointId, outcome);
    }
    
    // Extract and store patterns
    await this.extractPatternsFromOutcome(outcome);
    
    return outcome;
  }

  /**
   * Get translational patterns for a given indication and phase
   */
  async getTranslationalPatterns(indication: string, phase: string): Promise<TranslationalPattern[]> {
    const patterns = await db!
      .select()
      .from(translationalPatterns)
      .where(
        and(
          eq(translationalPatterns.indication, indication),
          eq(translationalPatterns.phase, phase)
        )
      )
      .orderBy(desc(translationalPatterns.successRate));
    
    return patterns;
  }

  /**
   * Find biomarker-endpoint correlations
   */
  async findBiomarkerEndpointCorrelations(
    indication?: string,
    phase?: string,
    minCorrelation: number = 0.5
  ): Promise<BiomarkerEndpoint[]> {
    const conditions = [];
    
    if (indication) {
      conditions.push(eq(biomarkerEndpoints.indication, indication));
    }
    
    if (phase) {
      conditions.push(eq(biomarkerEndpoints.phase, phase));
    }
    
    conditions.push(gte(biomarkerEndpoints.correlationScore, minCorrelation));
    
    const correlations = await db!
      .select()
      .from(biomarkerEndpoints)
      .where(and(...conditions))
      .orderBy(desc(biomarkerEndpoints.correlationScore));
    
    return correlations;
  }

  /**
   * Build knowledge graph edges from CSR data
   */
  async buildFromCSRData(csrId: string): Promise<void> {
    // Get CSR details
    const csr = await db
      .select()
      .from(csrReports)
      .where(eq(csrReports.id, csrId))
      .limit(1);
    
    if (!csr.length) return;
    
    const csrData = csr[0];
    
    // Extract biomarkers and endpoints from CSR
    const biomarkers = await this.extractBiomarkers(csrData);
    const endpoints = await this.extractEndpoints(csrData);
    
    // Create relationships
    for (const biomarker of biomarkers) {
      for (const endpoint of endpoints) {
        await this.createBiomarkerEndpointRelationship({
          biomarkerId: biomarker.id,
          biomarkerName: biomarker.name,
          biomarkerType: biomarker.type,
          endpointId: endpoint.id,
          endpointName: endpoint.name,
          endpointType: endpoint.type,
          phase: csrData.phase || 'Unknown',
          indication: csrData.indication || 'Unknown',
          species: 'human',
          dataSource: 'csr',
          organizationId: csrData.organizationId,
        });
      }
    }
  }

  /**
   * Calculate cross-species translation success rate
   */
  async calculateCrossSpeciesTranslation(
    biomarkerId: string,
    fromSpecies: string,
    toSpecies: string
  ): Promise<number> {
    // Get outcomes for both species
    const fromOutcomes = await db
      .select()
      .from(clinicalOutcomes)
      .innerJoin(
        biomarkerEndpoints,
        eq(clinicalOutcomes.biomarkerEndpointId, biomarkerEndpoints.id)
      )
      .where(
        and(
          eq(biomarkerEndpoints.biomarkerId, biomarkerId),
          eq(biomarkerEndpoints.species, fromSpecies)
        )
      );
    
    const toOutcomes = await db
      .select()
      .from(clinicalOutcomes)
      .innerJoin(
        biomarkerEndpoints,
        eq(clinicalOutcomes.biomarkerEndpointId, biomarkerEndpoints.id)
      )
      .where(
        and(
          eq(biomarkerEndpoints.biomarkerId, biomarkerId),
          eq(biomarkerEndpoints.species, toSpecies)
        )
      );
    
    if (!fromOutcomes.length || !toOutcomes.length) {
      return 0;
    }
    
    // Calculate translation success rate
    const successfulTranslations = toOutcomes.filter(to => 
      to.clinical_outcomes.outcomeType === 'success'
    ).length;
    
    const totalTranslations = toOutcomes.length;
    
    return totalTranslations > 0 ? successfulTranslations / totalTranslations : 0;
  }

  /**
   * Identify failure patterns across trials
   */
  async identifyFailurePatterns(
    indication: string,
    phase: string
  ): Promise<Array<{ pattern: string; frequency: number; studies: string[] }>> {
    // Get failed outcomes for this indication/phase
    const failedOutcomes = await db
      .select()
      .from(clinicalOutcomes)
      .where(
        and(
          eq(clinicalOutcomes.phase, phase),
          eq(clinicalOutcomes.outcomeType, 'failure')
        )
      );
    
    // Analyze failure reasons
    const patternMap = new Map<string, Set<string>>();
    
    for (const outcome of failedOutcomes) {
      if (outcome.failureReasons) {
        for (const reason of outcome.failureReasons) {
          if (!patternMap.has(reason)) {
            patternMap.set(reason, new Set());
          }
          patternMap.get(reason)?.add(outcome.studyId);
        }
      }
    }
    
    // Convert to array and sort by frequency
    const patterns = Array.from(patternMap.entries())
      .map(([pattern, studies]) => ({
        pattern,
        frequency: studies.size,
        studies: Array.from(studies),
      }))
      .sort((a, b) => b.frequency - a.frequency);
    
    return patterns;
  }

  /**
   * Private helper methods
   */
  
  private async updateCorrelationPatterns(
    biomarkerId: string,
    endpointId: string
  ): Promise<void> {
    // Get all outcomes for this biomarker-endpoint pair
    const relationship = await db
      .select()
      .from(biomarkerEndpoints)
      .where(
        and(
          eq(biomarkerEndpoints.biomarkerId, biomarkerId),
          eq(biomarkerEndpoints.endpointId, endpointId)
        )
      )
      .limit(1);
    
    if (!relationship.length) return;
    
    const outcomes = await db
      .select()
      .from(clinicalOutcomes)
      .where(eq(clinicalOutcomes.biomarkerEndpointId, relationship[0].id));
    
    // Calculate correlation score
    const successfulOutcomes = outcomes.filter(o => o.outcomeType === 'success').length;
    const totalOutcomes = outcomes.length;
    
    const correlationScore = totalOutcomes > 0 ? successfulOutcomes / totalOutcomes : 0;
    
    // Update the relationship
    await db
      .update(biomarkerEndpoints)
      .set({
        correlationScore,
        evidenceCount: totalOutcomes,
        updatedAt: new Date(),
      })
      .where(eq(biomarkerEndpoints.id, relationship[0].id));
  }
  
  private async updateBiomarkerEndpointCorrelation(
    biomarkerEndpointId: string,
    outcome: ClinicalOutcome
  ): Promise<void> {
    await this.updateCorrelationPatterns(
      (await db!.select().from(biomarkerEndpoints).where(eq(biomarkerEndpoints.id, biomarkerEndpointId)).limit(1))[0].biomarkerId,
      (await db!.select().from(biomarkerEndpoints).where(eq(biomarkerEndpoints.id, biomarkerEndpointId)).limit(1))[0].endpointId
    );
  }
  
  private async extractPatternsFromOutcome(outcome: ClinicalOutcome): Promise<void> {
    // Get the biomarker-endpoint relationship
    if (!outcome.biomarkerEndpointId) return;
    
    const [relationship] = await db
      .select()
      .from(biomarkerEndpoints)
      .where(eq(biomarkerEndpoints.id, outcome.biomarkerEndpointId));
    
    if (!relationship) return;
    
    // Check if pattern exists
    const existingPattern = await db
      .select()
      .from(translationalPatterns)
      .where(
        and(
          eq(translationalPatterns.patternType, outcome.outcomeType),
          eq(translationalPatterns.indication, relationship.indication || 'Unknown'),
          eq(translationalPatterns.phase, outcome.phase || 'Unknown')
        )
      )
      .limit(1);
    
    if (existingPattern.length > 0) {
      // Update existing pattern
      await db
        .update(translationalPatterns)
        .set({
          occurrenceCount: sql`${translationalPatterns.occurrenceCount} + 1`,
          lastObserved: new Date(),
          updatedAt: new Date(),
        })
        .where(eq(translationalPatterns.id, existingPattern[0].id));
    } else {
      // Create new pattern
      await db!.insert(translationalPatterns).values({
        patternName: `${relationship.indication}_${outcome.phase}_${outcome.outcomeType}`,
        patternType: outcome.outcomeType,
        preclinicalMarkers: [{ id: relationship.biomarkerId, name: relationship.biomarkerName }],
        clinicalEndpoints: [{ id: relationship.endpointId, name: relationship.endpointName }],
        successRate: outcome.outcomeType === 'success' ? 1 : 0,
        occurrenceCount: 1,
        indication: relationship.indication,
        phase: outcome.phase,
        species: [relationship.species || 'human'],
        confidence: 0.5,
        lastObserved: new Date(),
      });
    }
  }
  
  private async extractBiomarkers(csrData: any): Promise<Array<{ id: string; name: string; type: string }>> {
    // Extract biomarkers from CSR data
    // This would parse the CSR content for biomarker mentions
    const biomarkers: Array<{ id: string; name: string; type: string }> = [];
    
    // Simplified extraction - in production this would use NLP
    if (csrData.metadata?.biomarkers) {
      return csrData.metadata.biomarkers;
    }
    
    // Default biomarkers based on indication
    if (csrData.indication?.toLowerCase().includes('diabetes')) {
      biomarkers.push(
        { id: 'hba1c', name: 'HbA1c', type: 'metabolite' },
        { id: 'glucose', name: 'Blood Glucose', type: 'metabolite' }
      );
    }
    
    if (csrData.indication?.toLowerCase().includes('oncology')) {
      biomarkers.push(
        { id: 'pd-l1', name: 'PD-L1', type: 'protein' },
        { id: 'ctdna', name: 'Circulating Tumor DNA', type: 'gene' }
      );
    }
    
    return biomarkers;
  }
  
  private async extractEndpoints(csrData: any): Promise<Array<{ id: string; name: string; type: string }>> {
    // Extract endpoints from CSR data
    const endpoints: Array<{ id: string; name: string; type: string }> = [];
    
    // Simplified extraction - in production this would use NLP
    if (csrData.metadata?.endpoints) {
      return csrData.metadata.endpoints;
    }
    
    // Default endpoints based on phase
    if (csrData.phase === 'Phase I') {
      endpoints.push(
        { id: 'safety', name: 'Safety and Tolerability', type: 'safety' },
        { id: 'pk', name: 'Pharmacokinetics', type: 'exploratory' }
      );
    }
    
    if (csrData.phase === 'Phase II' || csrData.phase === 'Phase III') {
      endpoints.push(
        { id: 'efficacy', name: 'Primary Efficacy', type: 'primary' },
        { id: 'qol', name: 'Quality of Life', type: 'secondary' }
      );
    }
    
    return endpoints;
  }
}

// Export singleton instance
export const knowledgeGraph = new ForesightKnowledgeGraph();