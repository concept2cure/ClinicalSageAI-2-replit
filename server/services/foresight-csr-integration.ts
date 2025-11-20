/**
 * ForesightAI™ CSR Integration Service
 * 
 * Bridges existing CSR intelligence services with ForesightAI
 * Integrates csr_api.py, csr_deep_learning.py, and csr_database.py
 */

import { exec } from 'child_process';
import { promisify } from 'util';
import { db } from '../db';
import { eq, and, or, desc, sql } from 'drizzle-orm';
import {
  biomarkerEndpoints,
  clinicalOutcomes,
  translationalPatterns,
  type InsertClinicalOutcome,
  type InsertBiomarkerEndpoint,
} from '@shared/schema';
import { knowledgeGraph } from './foresight-knowledge-graph';
import axios from 'axios';

const execAsync = promisify(exec);

export class ForesightCSRIntegration {
  private csrApiUrl = 'http://localhost:8000'; // CSR API Python service
  
  /**
   * Process CSR through deep learning pipeline and extract patterns
   */
  async processCSRForForesight(csrId: string): Promise<{
    biomarkers: Array<any>;
    endpoints: Array<any>;
    patterns: Array<any>;
    predictions: any;
  }> {
    try {
      // Call Python CSR deep learning service
      const response = await axios.post(`${this.csrApiUrl}/api/csrs/deep-analyze`, {
        csr_id: csrId,
        extract_biomarkers: true,
        extract_endpoints: true,
        generate_embeddings: true,
        identify_patterns: true,
      });
      
      const analysisResult = response.data;
      
      // Extract biomarkers from CSR analysis
      const biomarkers = analysisResult.biomarkers || [];
      const endpoints = analysisResult.endpoints || [];
      
      // Store biomarker-endpoint relationships in knowledge graph
      for (const biomarker of biomarkers) {
        for (const endpoint of endpoints) {
          await this.createBiomarkerEndpointFromCSR(
            biomarker,
            endpoint,
            analysisResult.metadata
          );
        }
      }
      
      // Extract clinical outcomes if available
      if (analysisResult.outcomes) {
        await this.recordClinicalOutcomesFromCSR(
          csrId,
          analysisResult.outcomes,
          biomarkers,
          endpoints
        );
      }
      
      // Extract patterns using deep learning
      const patterns = await this.extractPatternsFromCSR(analysisResult);
      
      // Generate ForesightAI predictions
      const predictions = await this.generatePredictionsFromCSR(
        csrId,
        biomarkers,
        endpoints,
        patterns
      );
      
      return {
        biomarkers,
        endpoints,
        patterns,
        predictions,
      };
    } catch (error) {
      console.error('Error processing CSR for ForesightAI:', error);
      
      // Fallback to basic extraction if Python service unavailable
      return await this.fallbackCSRProcessing(csrId);
    }
  }
  
  /**
   * Import historical CSR data into ForesightAI knowledge graph
   */
  async importHistoricalCSRData(): Promise<{
    imported: number;
    failed: number;
    patterns: number;
  }> {
    let imported = 0;
    let failed = 0;
    let patterns = 0;
    
    try {
      // Get all CSR reports from database
      const csrs = await db.select().from(csrReports).limit(100);
      
      for (const csr of csrs) {
        try {
          // Process each CSR through ForesightAI pipeline
          const result = await this.processCSRForForesight(csr.id);
          
          imported++;
          patterns += result.patterns.length;
          
          // Build knowledge graph from CSR
          await knowledgeGraph.buildFromCSRData(csr.id);
        } catch (error) {
          console.error(`Failed to import CSR ${csr.id}:`, error);
          failed++;
        }
      }
      
      return { imported, failed, patterns };
    } catch (error) {
      console.error('Error importing historical CSR data:', error);
      return { imported, failed, patterns };
    }
  }
  
  /**
   * Use CSR deep learning to enhance predictions
   */
  async enhancePredictionsWithCSR(
    studyId: string,
    indication: string,
    phase: string
  ): Promise<any> {
    try {
      // Call Python CSR search service to find similar studies
      const similarResponse = await axios.get(`${this.csrApiUrl}/api/csrs/query`, {
        params: {
          indication,
          phase,
          limit: 10,
        },
      });
      
      const similarCSRs = similarResponse.data.results || [];
      
      // Analyze patterns from similar CSRs
      const successfulCSRs = similarCSRs.filter((csr: any) => 
        csr.outcome === 'success' || csr.status === 'completed'
      );
      
      const failedCSRs = similarCSRs.filter((csr: any) => 
        csr.outcome === 'failure' || csr.status === 'terminated'
      );
      
      // Calculate enhanced success probability
      const totalSimilar = similarCSRs.length;
      const successRate = totalSimilar > 0 ? successfulCSRs.length / totalSimilar : 0.5;
      
      // Extract common success factors
      const successFactors = await this.extractSuccessFactors(successfulCSRs);
      
      // Extract common failure patterns
      const failurePatterns = await this.extractFailurePatterns(failedCSRs);
      
      return {
        enhancedSuccessScore: successRate,
        similarStudiesAnalyzed: totalSimilar,
        successFactors,
        failurePatterns,
        recommendations: this.generateRecommendationsFromPatterns(
          successFactors,
          failurePatterns
        ),
      };
    } catch (error) {
      console.error('Error enhancing predictions with CSR:', error);
      return {
        enhancedSuccessScore: 0.5,
        similarStudiesAnalyzed: 0,
        successFactors: [],
        failurePatterns: [],
        recommendations: [],
      };
    }
  }
  
  /**
   * Private helper methods
   */
  
  private async createBiomarkerEndpointFromCSR(
    biomarker: any,
    endpoint: any,
    metadata: any
  ): Promise<void> {
    const data: InsertBiomarkerEndpoint = {
      biomarkerId: biomarker.id || biomarker.name.toLowerCase().replace(/\s+/g, '_'),
      biomarkerName: biomarker.name,
      biomarkerType: biomarker.type || 'protein',
      endpointId: endpoint.id || endpoint.name.toLowerCase().replace(/\s+/g, '_'),
      endpointName: endpoint.name,
      endpointType: endpoint.type || 'efficacy',
      correlationScore: biomarker.correlation || 0.5,
      evidenceCount: 1,
      phase: metadata?.phase || 'Unknown',
      indication: metadata?.indication || 'Unknown',
      species: 'human',
      dataSource: 'csr',
      confidence: biomarker.confidence || 0.5,
      metadata: {
        source_csr: metadata?.csr_id,
        extraction_method: 'deep_learning',
      },
      organizationId: metadata?.organization_id,
    };
    
    await knowledgeGraph.createBiomarkerEndpointRelationship(data);
  }
  
  private async recordClinicalOutcomesFromCSR(
    csrId: string,
    outcomes: any[],
    biomarkers: any[],
    endpoints: any[]
  ): Promise<void> {
    for (const outcome of outcomes) {
      // Find matching biomarker-endpoint relationship
      const biomarkerEndpoint = await db
        .select()
        .from(biomarkerEndpoints)
        .where(
          and(
            eq(biomarkerEndpoints.biomarkerName, outcome.biomarker || biomarkers[0]?.name),
            eq(biomarkerEndpoints.endpointName, outcome.endpoint || endpoints[0]?.name)
          )
        )
        .limit(1);
      
      const data: InsertClinicalOutcome = {
        studyId: csrId,
        biomarkerEndpointId: biomarkerEndpoint[0]?.id,
        outcomeType: outcome.type || 'success',
        outcomeValue: outcome.value || {},
        phase: outcome.phase,
        patientCount: outcome.patient_count,
        timepoint: outcome.timepoint,
        statisticalSignificance: outcome.p_value,
        adverseEvents: outcome.adverse_events || [],
        failureReasons: outcome.failure_reasons || [],
        metadata: {
          source: 'csr_extraction',
          confidence: outcome.confidence,
        },
        organizationId: outcome.organization_id,
      };
      
      await knowledgeGraph.recordClinicalOutcome(data);
    }
  }
  
  private async extractPatternsFromCSR(analysisResult: any): Promise<Array<any>> {
    const patterns = [];
    
    // Extract success patterns
    if (analysisResult.success_indicators) {
      patterns.push({
        type: 'success',
        indicators: analysisResult.success_indicators,
        confidence: analysisResult.success_confidence || 0.7,
      });
    }
    
    // Extract failure patterns
    if (analysisResult.failure_indicators) {
      patterns.push({
        type: 'failure',
        indicators: analysisResult.failure_indicators,
        confidence: analysisResult.failure_confidence || 0.7,
      });
    }
    
    // Extract dosing patterns
    if (analysisResult.dosing_patterns) {
      patterns.push({
        type: 'dosing',
        patterns: analysisResult.dosing_patterns,
        optimal_dose: analysisResult.optimal_dose,
      });
    }
    
    return patterns;
  }
  
  private async generatePredictionsFromCSR(
    csrId: string,
    biomarkers: any[],
    endpoints: any[],
    patterns: any[]
  ): Promise<any> {
    // Calculate success probability based on patterns
    const successPatterns = patterns.filter(p => p.type === 'success');
    const failurePatterns = patterns.filter(p => p.type === 'failure');
    
    let successScore = 0.5; // Baseline
    
    if (successPatterns.length > failurePatterns.length) {
      successScore += 0.2;
    } else if (failurePatterns.length > successPatterns.length) {
      successScore -= 0.2;
    }
    
    // Adjust based on biomarker strength
    const strongBiomarkers = biomarkers.filter(b => b.correlation > 0.7);
    if (strongBiomarkers.length > 0) {
      successScore += 0.1 * Math.min(strongBiomarkers.length, 3);
    }
    
    // Ensure score is between 0 and 1
    successScore = Math.max(0, Math.min(1, successScore));
    
    return {
      csrId,
      successProbability: successScore,
      confidenceInterval: {
        lower: Math.max(0, successScore - 0.15),
        upper: Math.min(1, successScore + 0.15),
      },
      keyBiomarkers: biomarkers.slice(0, 3),
      keyEndpoints: endpoints.slice(0, 3),
      identifiedPatterns: patterns.length,
    };
  }
  
  private async fallbackCSRProcessing(csrId: string): Promise<any> {
    // Basic processing when Python service is unavailable
    const csr = await db.select().from(csrReports).where(eq(csrReports.id, csrId)).limit(1);
    
    if (!csr.length) {
      throw new Error('CSR not found');
    }
    
    const csrData = csr[0];
    
    // Basic biomarker extraction based on indication
    const biomarkers = this.getDefaultBiomarkers(csrData.indication || '');
    const endpoints = this.getDefaultEndpoints(csrData.phase || '');
    
    return {
      biomarkers,
      endpoints,
      patterns: [],
      predictions: {
        successProbability: 0.5,
        source: 'fallback',
      },
    };
  }
  
  private getDefaultBiomarkers(indication: string): Array<any> {
    const indicationLower = indication.toLowerCase();
    
    if (indicationLower.includes('diabetes')) {
      return [
        { id: 'hba1c', name: 'HbA1c', type: 'metabolite', correlation: 0.8 },
        { id: 'glucose', name: 'Blood Glucose', type: 'metabolite', correlation: 0.75 },
      ];
    }
    
    if (indicationLower.includes('cancer') || indicationLower.includes('oncology')) {
      return [
        { id: 'pd-l1', name: 'PD-L1', type: 'protein', correlation: 0.7 },
        { id: 'ctdna', name: 'ctDNA', type: 'gene', correlation: 0.65 },
      ];
    }
    
    return [
      { id: 'generic', name: 'Clinical Biomarker', type: 'unknown', correlation: 0.5 },
    ];
  }
  
  private getDefaultEndpoints(phase: string): Array<any> {
    if (phase === 'Phase I') {
      return [
        { id: 'safety', name: 'Safety and Tolerability', type: 'safety' },
        { id: 'pk', name: 'Pharmacokinetics', type: 'exploratory' },
      ];
    }
    
    if (phase === 'Phase II' || phase === 'Phase III') {
      return [
        { id: 'efficacy', name: 'Primary Efficacy', type: 'primary' },
        { id: 'safety', name: 'Safety', type: 'secondary' },
      ];
    }
    
    return [
      { id: 'clinical', name: 'Clinical Endpoint', type: 'primary' },
    ];
  }
  
  private async extractSuccessFactors(successfulCSRs: any[]): Promise<Array<any>> {
    const factors = [];
    
    // Analyze common characteristics of successful studies
    const sampleSizes = successfulCSRs.map(csr => csr.sample_size).filter(Boolean);
    if (sampleSizes.length > 0) {
      const avgSampleSize = sampleSizes.reduce((a, b) => a + b, 0) / sampleSizes.length;
      factors.push({
        factor: 'sample_size',
        value: avgSampleSize,
        importance: 'high',
      });
    }
    
    // Common endpoints
    const endpoints = successfulCSRs.flatMap(csr => csr.endpoints || []);
    const endpointFrequency = this.calculateFrequency(endpoints);
    
    if (endpointFrequency.length > 0) {
      factors.push({
        factor: 'common_endpoints',
        value: endpointFrequency.slice(0, 3),
        importance: 'medium',
      });
    }
    
    return factors;
  }
  
  private async extractFailurePatterns(failedCSRs: any[]): Promise<Array<any>> {
    const patterns = [];
    
    // Analyze common failure reasons
    const failureReasons = failedCSRs.flatMap(csr => csr.failure_reasons || []);
    const reasonFrequency = this.calculateFrequency(failureReasons);
    
    if (reasonFrequency.length > 0) {
      patterns.push({
        pattern: 'common_failure_reasons',
        reasons: reasonFrequency.slice(0, 3),
        frequency: reasonFrequency[0].count / failedCSRs.length,
      });
    }
    
    return patterns;
  }
  
  private generateRecommendationsFromPatterns(
    successFactors: any[],
    failurePatterns: any[]
  ): Array<any> {
    const recommendations = [];
    
    // Recommendations based on success factors
    successFactors.forEach(factor => {
      if (factor.factor === 'sample_size' && factor.value > 100) {
        recommendations.push({
          type: 'enrollment',
          action: `Target sample size of at least ${Math.round(factor.value)} based on successful studies`,
          priority: 'high',
        });
      }
    });
    
    // Recommendations to avoid failure patterns
    failurePatterns.forEach(pattern => {
      if (pattern.pattern === 'common_failure_reasons') {
        recommendations.push({
          type: 'risk_mitigation',
          action: `Implement mitigation strategies for: ${pattern.reasons.map((r: any) => r.item).join(', ')}`,
          priority: 'high',
        });
      }
    });
    
    return recommendations;
  }
  
  private calculateFrequency(items: any[]): Array<{ item: any; count: number }> {
    const frequency = new Map();
    
    items.forEach(item => {
      const key = JSON.stringify(item);
      frequency.set(key, (frequency.get(key) || 0) + 1);
    });
    
    return Array.from(frequency.entries())
      .map(([key, count]) => ({ item: JSON.parse(key), count: count as number }))
      .sort((a, b) => b.count - a.count);
  }
}

// Export singleton instance
export const csrIntegration = new ForesightCSRIntegration();