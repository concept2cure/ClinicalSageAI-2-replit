import { db } from './db';
import { eq } from 'drizzle-orm';
import { protocols } from '../shared/schema';
import {
  classifyTherapeuticArea,
  getTherapeuticArea,
} from '../shared/utils/therapeutic-area-classifier';

export interface ProtocolData {
  phase: string;
  indication: string;
  sponsor: string;
  sample_size: number;
  duration_weeks: number;
  primary_endpoint: string;
  endpoint_primary?: string;
  secondary_endpoints?: string[];
  inclusion_criteria?: string;
  exclusion_criteria?: string;
  population?: string;
  design?: string;
  summary?: string;
  arms?: number;

  // Global regulatory intelligence fields
  regulatory_notes?: string;
  global_compliance?: { [region: string]: boolean };
  regional_requirements?: { [region: string]: string[] };
  ethical_considerations?: string[];
  safety_monitoring?: string;
  data_standards?: string;

  // Additional multicultural/global fields
  geographic_regions?: string[];
  ethnic_considerations?: string[];
  translation_requirements?: string[];
  site_distribution?: { [region: string]: number };

  // Intelligence metadata
  intelligence_source?: string;
  confidence_score?: number;
  last_updated?: Date;
}

export class ProtocolAnalyzerService {
  /**
   * Analyzes protocol text and extracts structured information
   */
  async analyzeProtocol(protocolText: string): Promise<ProtocolData> {
    try {
      if (!protocolText || typeof protocolText !== 'string') {
        throw new Error('Protocol text is required');
      }

      // Real implementation would use NLP/AI for text analysis
      // This is a simple implementation that extracts basic information

      // Create a normalized version of the text for searching
      const normalizedText = protocolText.toLowerCase();

      // Extract phase (simple pattern matching)
      const phaseMatch =
        normalizedText.match(/phase\s+([1-4i]+)/i) ||
        normalizedText.match(/phase\s+(one|two|three|four|i{1,3}v?)/i);

      const phase = phaseMatch ? this.normalizePhase(phaseMatch[1]) : 'Phase 2';

      // Extract indication using the centralized therapeutic area classifier
      // This provides consistent, accurate classification across the entire platform
      let indication: string;

      // First, try to extract from explicit indication statements if present
      const indicationMatch =
        normalizedText.match(/(?:indication|condition|disease):\s*([^\n\.]+)/i) ||
        normalizedText.match(/(?:investigating|studying|trial for|treatment of)\s+([^\n\.]+)/i);

      if (indicationMatch) {
        // Extract the explicit statement and classify it
        const explicitIndication = indicationMatch[1].trim();
        const classificationResult = classifyTherapeuticArea(explicitIndication, {
          confidenceThreshold: 0.4,
          enableLogging: true,
        });

        // If we got a high-confidence match, use the therapeutic area name
        if (classificationResult.confidence >= 0.7) {
          indication = classificationResult.area;
        } else {
          // Otherwise use the explicit text but also run full-text classification
          const fullTextResult = classifyTherapeuticArea(protocolText, {
            confidenceThreshold: 0.3,
            enableLogging: true,
          });

          // If full-text classification has higher confidence, use that
          if (fullTextResult.confidence > classificationResult.confidence) {
            indication = fullTextResult.area;
            console.log(
              `Protocol analysis: Overriding explicit indication "${explicitIndication}" with higher confidence classification "${fullTextResult.area}" (${fullTextResult.confidence.toFixed(2)})`
            );
          } else {
            // Use the explicit text but clean it up
            indication = explicitIndication;
          }
        }
      } else {
        // No explicit indication found, use full text classification
        const classificationResult = classifyTherapeuticArea(protocolText, {
          confidenceThreshold: 0.3,
          enableLogging: true,
        });

        indication = classificationResult.area;

        // Log classification details for audit purposes
        console.log(
          `Protocol analysis: Classified as "${indication}" with ${classificationResult.confidence.toFixed(2)} confidence`
        );
        if (classificationResult.matchedKeywords.length > 0) {
          console.log(
            `Protocol analysis: Matched keywords: ${classificationResult.matchedKeywords.join(', ')}`
          );
        }
      }

      // Extract sample size
      const sampleSizeMatch =
        normalizedText.match(/(?:sample size|n\s*=|participants|subjects|patients):\s*(\d+)/i) ||
        normalizedText.match(/(\d+)\s+(?:participants|subjects|patients)/i);

      const sample_size = sampleSizeMatch ? parseInt(sampleSizeMatch[1]) : 100;

      // Extract duration
      const durationMatch =
        normalizedText.match(/(?:duration|length|period):\s*(\d+)\s*(?:weeks|wks)/i) ||
        normalizedText.match(/(\d+)\s*(?:weeks|wks)/i);

      const duration_weeks = durationMatch ? parseInt(durationMatch[1]) : 24;

      // Extract primary endpoint
      const endpointMatch =
        normalizedText.match(/(?:primary endpoint|primary outcome):\s*([^\n\.]+)/i) ||
        normalizedText.match(
          /(?:primary endpoint|primary outcome)[^:]*?(?:is|will be)\s+([^\n\.]+)/i
        );

      const primary_endpoint = endpointMatch ? endpointMatch[1].trim() : 'Overall Response Rate';

      // Extract secondary endpoints
      const secondaryEndpointsMatch = normalizedText.match(
        /(?:secondary endpoints|secondary outcomes):\s*([^\n]+)/i
      );

      const secondary_endpoints = secondaryEndpointsMatch
        ? secondaryEndpointsMatch[1].split(/[;,]/).map(e => e.trim())
        : ['Progression-Free Survival', 'Safety and Tolerability'];

      // Extract inclusion criteria
      const inclusionMatch = normalizedText.match(
        /(?:inclusion criteria|eligibility):\s*([^\n]+)/i
      );

      const inclusion_criteria = inclusionMatch ? inclusionMatch[1].trim() : undefined;

      // Extract exclusion criteria
      const exclusionMatch = normalizedText.match(/(?:exclusion criteria):\s*([^\n]+)/i);

      const exclusion_criteria = exclusionMatch ? exclusionMatch[1].trim() : undefined;

      // Extract population information
      const populationMatch = normalizedText.match(/(?:population|subjects|patients):\s*([^\n]+)/i);

      const population = populationMatch ? populationMatch[1].trim() : undefined;

      // Extract study design
      const designMatch = normalizedText.match(/(?:study design|trial design|design):\s*([^\n]+)/i);

      const design = designMatch
        ? designMatch[1].trim()
        : 'Randomized, Double-Blind, Placebo-Controlled';

      // Extract number of arms
      const armsMatch = normalizedText.match(/(\d+)\s*(?:arms|groups)/i);

      const arms = armsMatch ? parseInt(armsMatch[1]) : 2;

      // Extract sponsor information
      const sponsorMatch =
        normalizedText.match(/(?:sponsor|conducted by|developed by):\s*([^\n\.]+)/i) ||
        normalizedText.match(
          /(?:sponsor|conducted by|developed by)[^:]*?(?:is|will be)\s+([^\n\.]+)/i
        );

      const sponsor = sponsorMatch ? sponsorMatch[1].trim() : 'Unknown Sponsor';

      // Generate a summary (in a real implementation, this would use an AI summarizer)
      const summary = `Protocol for a ${phase} clinical trial investigating ${indication} with ${sample_size} participants over ${duration_weeks} weeks. The primary endpoint is ${primary_endpoint}.`;

      return {
        phase,
        indication,
        sponsor,
        sample_size,
        duration_weeks,
        primary_endpoint,
        endpoint_primary: primary_endpoint,
        secondary_endpoints,
        inclusion_criteria,
        exclusion_criteria,
        population,
        design,
        summary,
        arms,

        // Add default global intelligence fields
        regulatory_notes:
          'Protocol should comply with ICH E6(R2) Good Clinical Practice guidelines.',
        global_compliance: {
          FDA: true,
          EMA: true,
          PMDA: indication === 'Oncology', // Fixed: replaced vulnerable substring matching with exact comparison
          NMPA: indication === 'Oncology', // Fixed: replaced vulnerable substring matching with exact comparison
        },
        regional_requirements: {
          FDA: ['Diversity requirements per FDORA 2022', 'IRB/informed consent documentation'],
          EMA: ['GDPR data protection implementation', 'EudraCT registration'],
          PMDA: ['Japanese GCP Ordinance compliance', 'Ethnic factors considerations'],
          NMPA: [
            'China Human Genetic Resources approval if applicable',
            'Local ethics committee approval',
          ],
        },
        ethical_considerations: [
          'IRB/EC approval required before study initiation',
          'Informed consent must meet all ICH and local requirements',
          'Data privacy protections must be implemented',
        ],
        safety_monitoring: 'Independent Data Monitoring Committee required for this study design',

        geographic_regions: ['North America', 'Europe', 'Asia-Pacific'],
        ethnic_considerations: [
          'Study should include diverse population',
          'Consider ethnic factors in PK/PD analysis',
        ],

        intelligence_source: 'Concept2Cure Protocol Analyzer',
        confidence_score: 0.85,
        last_updated: new Date(),
      };
    } catch (error: any) {
      console.error('Error analyzing protocol text:', error);
      throw new Error(`Protocol analysis failed: ${error.message}`);
    }
  }

  /**
   * Normalize phase information to standard format
   */
  private normalizePhase(phase: string): string {
    phase = phase.toLowerCase();

    if (phase.match(/^i{1,3}v?$/i) || phase.match(/^[1-4]$/)) {
      return `Phase ${phase.toUpperCase()}`;
    }

    if (phase === 'one') return 'Phase I';
    if (phase === 'two') return 'Phase II';
    if (phase === 'three') return 'Phase III';
    if (phase === 'four') return 'Phase IV';

    return `Phase ${phase}`;
  }

  /**
   * Find similar protocols to the given protocol data
   */
  async findSimilarProtocols(protocolData: ProtocolData, limit: number = 5): Promise<any[]> {
    try {
      // Find similar reports by indication and phase
      const similar = await db
        .select()
        .from(protocols)
        .where(eq(protocols.indication, protocolData.indication))
        .limit(limit);

      return similar.map(protocol => {
        // The protocols table stores sponsor / sample size / duration inside the
        // JSON `metadata` column rather than as dedicated columns.
        const meta = (protocol.metadata ?? {}) as {
          sponsor?: string;
          sampleSize?: number;
          sample_size?: number;
          durationWeeks?: number;
          duration?: number;
        };
        return {
          id: protocol.id,
          title: protocol.title,
          sponsor: meta.sponsor || 'Lumen Biosciences', // Include sponsor in similar protocols
          phase: protocol.phase,
          indication: protocol.indication,
          similarity: Math.floor(Math.random() * 40) + 60, // Random similarity score for demo
          sampleSize: meta.sampleSize ?? meta.sample_size ?? 100,
          duration: meta.durationWeeks ?? meta.duration ?? 24,
          outcome: Math.random() > 0.3 ? 'success' : 'failed', // Random outcome for demo
        };
      });
    } catch (error) {
      console.error('Error finding similar protocols:', error);
      return [];
    }
  }
}

export const protocolAnalyzerService = new ProtocolAnalyzerService();
