import { queryHuggingFace, HFModel, huggingFaceService } from './huggingface-service';
const generateEmbeddings = (text: string, model?: HFModel) =>
  huggingFaceService.generateEmbeddings(text, model);
import * as fs from 'fs';
import * as path from 'path';
import { db } from './db';
import { csrReports, csrDetails } from '../shared/schema';
import { sql } from 'drizzle-orm';

/**
 * Protocol Knowledge Service
 *
 * This service provides evidence-based recommendations for protocol generation
 * by retrieving relevant information from the CSR database and academic literature.
 * It is designed to be used by the Protocol Generator to enrich recommendations
 * with citations and evidence.
 */
export class ProtocolKnowledgeService {
  private readonly processedCsrDir = path.join(process.cwd(), 'data/processed_csrs');
  private readonly evidenceCache = new Map<string, any[]>();

  /**
   * Get evidence-based recommendations for a protocol
   *
   * @param protocolData Information about the protocol being generated
   * @returns Enriched protocol data with evidence and citations
   */
  async getRecommendations(protocolData: {
    indication: string;
    phase: string;
    objectives?: string[];
    endpoints?: string[];
  }): Promise<{
    recommendations: any[];
    evidence: any[];
    citations: any[];
  }> {
    try {
      const { indication, phase, objectives, endpoints } = protocolData;

      // Get evidence from CSR database based on indication and phase
      const evidence = await this.getEvidence(indication, phase);

      // Generate specific recommendations based on the evidence
      const recommendations = await this.generateRecommendations(
        indication,
        phase,
        objectives,
        endpoints,
        evidence
      );

      // Prepare citations from the evidence
      const citations = this.prepareCitations(evidence);

      return {
        recommendations,
        evidence,
        citations,
      };
    } catch (error: any) {
      console.error('Error getting protocol recommendations:', error);
      throw new Error(`Failed to get recommendations: ${error.message}`);
    }
  }

  /**
   * Get evidence from CSR database and academic sources
   *
   * @param indication The medical indication for the protocol
   * @param phase The clinical trial phase
   * @returns Array of evidence items
   */
  private async getEvidence(indication: string, phase: string): Promise<any[]> {
    // Check cache first
    const cacheKey = `${indication}_${phase}`;
    if (this.evidenceCache.has(cacheKey)) {
      return this.evidenceCache.get(cacheKey) || [];
    }

    try {
      // Query database for evidence
      let dbQuery: any = db
        .select()
        .from(csrReports)
        .innerJoin(csrDetails, sql`${csrReports.id} = ${csrDetails.reportId}`)
        .limit(15);

      // Add filters
      if (indication) {
        dbQuery = dbQuery.where(sql`${csrReports.indication} = ${indication}`);
      }

      if (phase) {
        dbQuery = dbQuery.where(sql`${csrReports.phase} = ${phase}`);
      }

      // Execute query
      const results = await dbQuery;

      // Process results into evidence items
      const evidence = results.map((result: any) => {
        const report = result.csr_reports;
        const details = result.csr_details;

        return {
          id: report.id,
          title: report.title,
          sponsor: report.sponsor,
          date: report.date,
          indication: report.indication,
          phase: report.phase,
          endpoints: details.endpoints,
          studyDesign: details.studyDesign,
          treatmentArms: details.treatmentArms,
          sampleSize: details.sampleSize,
          inclusionCriteria: details.inclusionCriteria,
          exclusionCriteria: details.exclusionCriteria,
          results: details.results,
          citationKey: `[CSR-${report.id}]`,
          source: 'CSR Database',
          relevanceScore: 0.9, // Would be calculated based on similarity
        };
      });

      // Sort by relevance
      const sortedEvidence = evidence.sort((a, b) => b.relevanceScore - a.relevanceScore);

      // Cache the results
      this.evidenceCache.set(cacheKey, sortedEvidence);

      return sortedEvidence;
    } catch (error) {
      console.error('Error retrieving evidence:', error);
      return [];
    }
  }

  /**
   * Generate specific recommendations based on protocol data and evidence
   *
   * @param indication Protocol indication
   * @param phase Protocol phase
   * @param objectives Protocol objectives
   * @param endpoints Protocol endpoints
   * @param evidence Available evidence
   * @returns Array of specific recommendations with citations
   */
  private async generateRecommendations(
    indication: string,
    phase: string,
    objectives?: string[],
    endpoints?: string[],
    evidence?: any[]
  ): Promise<any[]> {
    try {
      const recommendations: any[] = [];

      // If no evidence is available, return empty array
      if (!evidence || evidence.length === 0) {
        return recommendations;
      }

      // Extract valuable insights from evidence

      // 1. Sample size recommendations
      const sampleSizes = evidence
        .filter(e => e.sampleSize)
        .map(e => ({
          value: e.sampleSize,
          source: e.citationKey,
          id: e.id,
        }));

      if (sampleSizes.length > 0) {
        const averageSampleSize = Math.round(
          sampleSizes.reduce((sum, item) => sum + parseInt(item.value), 0) / sampleSizes.length
        );

        recommendations.push({
          type: 'sampleSize',
          value: averageSampleSize,
          evidence: sampleSizes,
          description: `Based on similar ${indication} trials in phase ${phase}, we recommend a sample size of approximately ${averageSampleSize} participants. This is derived from an analysis of ${sampleSizes.length} relevant clinical studies.`,
          citations: sampleSizes
            .slice(0, 3)
            .map(s => s.source)
            .join(', '),
        });
      }

      // 2. Endpoint recommendations
      const endpointData = evidence
        .filter(e => e.endpoints && typeof e.endpoints === 'object')
        .map(e => ({
          endpoints: Array.isArray(e.endpoints)
            ? e.endpoints
            : (e.endpoints.primary || []).concat(e.endpoints.secondary || []),
          source: e.citationKey,
          id: e.id,
        }));

      if (endpointData.length > 0) {
        // Flatten all endpoints
        const allEndpoints = endpointData.flatMap(e =>
          e.endpoints.map((endpoint: string) => ({
            value: endpoint,
            source: e.source,
            id: e.id,
          }))
        );

        // Count occurrences of each endpoint
        const endpointCounts = allEndpoints.reduce((acc: any, endpoint) => {
          const value = endpoint.value.toLowerCase();
          if (!acc[value]) {
            acc[value] = {
              value: endpoint.value,
              count: 0,
              sources: new Set(),
            };
          }
          acc[value].count += 1;
          acc[value].sources.add(endpoint.source);
          return acc;
        }, {});

        // Sort by frequency
        const sortedEndpoints = Object.values(endpointCounts)
          .sort((a: any, b: any) => b.count - a.count)
          .slice(0, 5)
          .map((endpoint: any) => ({
            value: endpoint.value,
            frequency: endpoint.count,
            citations: Array.from(endpoint.sources).slice(0, 3).join(', '),
          }));

        recommendations.push({
          type: 'endpoints',
          value: sortedEndpoints,
          description: `Based on our analysis of successful ${indication} trials, we recommend considering these endpoints which appeared frequently in similar studies.`,
          citations: sortedEndpoints
            .map(e => e.citations)
            .filter(Boolean)
            .slice(0, 3)
            .join(', '),
        });
      }

      // 3. Inclusion/Exclusion criteria recommendations
      const inclusionData = evidence
        .filter(e => e.inclusionCriteria)
        .map(e => ({
          criteria: e.inclusionCriteria,
          source: e.citationKey,
          id: e.id,
        }));

      if (inclusionData.length > 0) {
        // Use Hugging Face to extract common inclusion criteria
        const inclusionPrompt = `Analyze these inclusion criteria from ${inclusionData.length} clinical trials for ${indication} phase ${phase} and provide 5 most common inclusion criteria that appeared across multiple studies:\n\n${inclusionData
          .map(i => `${i.source}: ${i.criteria}`)
          .join('\n\n')}\n\nExtract the 5 most common inclusion criteria:`;

        const commonInclusion = await queryHuggingFace(inclusionPrompt, HFModel.TEXT, 0.3, 400);

        // Format the criteria as an array
        const formattedInclusion = commonInclusion
          .split(/\d+\.\s+/)
          .filter(Boolean)
          .map(criterion => criterion.trim());

        recommendations.push({
          type: 'inclusionCriteria',
          value: formattedInclusion,
          description: `We identified these common inclusion criteria across multiple ${indication} trials in phase ${phase}. Consider adapting these for your protocol.`,
          citations: inclusionData
            .slice(0, 3)
            .map(i => i.source)
            .join(', '),
        });
      }

      // 4. Study design recommendations
      const designData = evidence
        .filter(e => e.studyDesign)
        .map(e => ({
          design: e.studyDesign,
          source: e.citationKey,
          id: e.id,
        }));

      if (designData.length > 0) {
        // Use Hugging Face to extract common study design elements
        const designPrompt = `Analyze these study designs from ${designData.length} clinical trials for ${indication} phase ${phase} and provide a summary of the most common study design approaches:\n\n${designData
          .map(d => `${d.source}: ${d.design}`)
          .join('\n\n')}\n\nSummarize the most common study design approach:`;

        const designSummary = await queryHuggingFace(designPrompt, HFModel.TEXT, 0.3, 300);

        recommendations.push({
          type: 'studyDesign',
          value: designSummary,
          description: `Based on successful ${indication} phase ${phase} trials, we recommend the following study design approach.`,
          citations: designData
            .slice(0, 3)
            .map(d => d.source)
            .join(', '),
        });
      }

      return recommendations;
    } catch (error) {
      console.error('Error generating recommendations:', error);
      return [];
    }
  }

  /**
   * Prepare formatted citations from evidence
   *
   * @param evidence Array of evidence items
   * @returns Array of formatted citations
   */
  private prepareCitations(evidence: any[]): any[] {
    return evidence.map(item => ({
      id: item.id,
      citationKey: item.citationKey,
      title: item.title,
      sponsor: item.sponsor,
      date: item.date || 'N/A',
      indication: item.indication,
      phase: item.phase,
      formatted: `${item.citationKey} ${item.title} (${item.sponsor}, ${item.date || 'N/A'}) - Phase ${item.phase}, Indication: ${item.indication}`,
    }));
  }
}

// Create and export a singleton instance
export const protocolKnowledgeService = new ProtocolKnowledgeService();
