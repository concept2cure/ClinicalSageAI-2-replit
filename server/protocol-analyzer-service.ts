import { db } from './db';
import { eq } from 'drizzle-orm';
import { protocols } from '../shared/schema';
import { classifyTherapeuticArea } from '../shared/utils/therapeutic-area-classifier';

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

      // classifyTherapeuticArea returns the best-guess therapeutic-area name
      // (string); the previous confidence/keyword-rich API no longer exists.
      const UNKNOWN_AREA = 'Unknown';
      if (indicationMatch) {
        // Extract the explicit statement and classify it.
        const explicitIndication = indicationMatch[1].trim();
        const explicitArea = classifyTherapeuticArea(explicitIndication);

        if (explicitArea && explicitArea !== UNKNOWN_AREA) {
          indication = explicitArea;
        } else {
          // Fall back to full-text classification, else the explicit text.
          const fullTextArea = classifyTherapeuticArea(protocolText);
          if (fullTextArea && fullTextArea !== UNKNOWN_AREA) {
            indication = fullTextArea;
            console.log(
              `Protocol analysis: Overriding explicit indication "${explicitIndication}" with classification "${fullTextArea}"`
            );
          } else {
            indication = explicitIndication;
          }
        }
      } else {
        // No explicit indication found, use full text classification.
        indication = classifyTherapeuticArea(protocolText);
        console.log(`Protocol analysis: Classified as "${indication}"`);
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
   * Compute a deterministic similarity score (0-100) between the input protocol
   * and a candidate, derived from real shared attributes. Returns null when no
   * attribute can be compared, so callers never receive a fabricated score.
   */
  private computeSimilarity(
    input: ProtocolData,
    candidate: { phase?: string | null; indication?: string | null; sampleSize?: number; durationWeeks?: number }
  ): number | null {
    const components: { weight: number; score: number }[] = [];

    if (input.phase && candidate.phase) {
      const a = this.normalizePhase(input.phase);
      const b = this.normalizePhase(candidate.phase);
      components.push({ weight: 0.35, score: a === b ? 1 : 0 });
    }

    if (input.indication && candidate.indication) {
      const a = classifyTherapeuticArea(input.indication);
      const b = classifyTherapeuticArea(candidate.indication);
      if (a && b) components.push({ weight: 0.2, score: a === b ? 1 : 0 });
    }

    const proximity = (a?: number, b?: number): number | null => {
      if (typeof a !== 'number' || typeof b !== 'number' || a <= 0 || b <= 0) return null;
      return 1 - Math.min(1, Math.abs(a - b) / Math.max(a, b));
    };

    const sizeScore = proximity(input.sample_size, candidate.sampleSize);
    if (sizeScore !== null) components.push({ weight: 0.25, score: sizeScore });

    const durationScore = proximity(input.duration_weeks, candidate.durationWeeks);
    if (durationScore !== null) components.push({ weight: 0.2, score: durationScore });

    if (components.length === 0) return null;

    const totalWeight = components.reduce((sum, c) => sum + c.weight, 0);
    const weighted = components.reduce((sum, c) => sum + c.weight * c.score, 0);
    return Math.round((weighted / totalWeight) * 100);
  }

  /**
   * Derive a trial outcome from real stored fields. Returns null when the data
   * does not state an outcome — never a coined success/failed value.
   */
  private deriveOutcome(status?: string | null, outcome?: string | null): 'success' | 'failed' | null {
    const value = (outcome ?? status ?? '').toString().toLowerCase();
    if (!value) return null;
    if (/\b(success|successful|approved|positive|met)\b/.test(value)) return 'success';
    if (/\b(fail|failed|terminated|withdrawn|halted|negative|not met)\b/.test(value)) return 'failed';
    return null;
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
          outcome?: string;
        };
        const sampleSize = meta.sampleSize ?? meta.sample_size;
        const durationWeeks = meta.durationWeeks ?? meta.duration;
        return {
          id: protocol.id,
          title: protocol.title,
          sponsor: meta.sponsor ?? null,
          phase: protocol.phase,
          indication: protocol.indication,
          similarity: this.computeSimilarity(protocolData, {
            phase: protocol.phase,
            indication: protocol.indication,
            sampleSize,
            durationWeeks,
          }),
          sampleSize: sampleSize ?? null,
          duration: durationWeeks ?? null,
          outcome: this.deriveOutcome(protocol.status, meta.outcome),
        };
      });
    } catch (error) {
      console.error('Error finding similar protocols:', error);
      return [];
    }
  }
}

export const protocolAnalyzerService = new ProtocolAnalyzerService();
