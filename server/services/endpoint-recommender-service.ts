import { eq, and, sql, desc, like, or } from 'drizzle-orm';
import { db } from '../db';
import { csrReports, csrDetails } from '../../shared/schema';
import { huggingFaceService } from '../huggingface-service';
import { academicDocumentProcessor } from './academic-document-processor';
import * as fs from 'fs';
import * as path from 'path';

import { createScopedLogger } from '../utils/logger';
const logger = createScopedLogger('endpoint-recommender');

// Define types for recommendation results
/** What an endpoint's evidence is grounded in — highest-authority basis present. */
export type EndpointEvidenceBasis =
  | 'regulatory_recommended'
  | 'corpus_outcomes'
  | 'corpus_frequency'
  | 'academic_literature'
  | 'ai_suggested';

export interface EndpointRecommendation {
  endpoint: string;
  occurrence_count: number;
  /**
   * Empirical trial-success rate (0–100) — set ONLY when derived from real recorded
   * trial outcomes. `null` when no outcome evidence exists: we do not fabricate a
   * success rate (Phase 8 confidence-hygiene). Rank/UI should use `evidence_strength`.
   */
  success_rate: number | null;
  /**
   * Honest strength-of-evidence score (0–100): how well the corpus frequency,
   * literature and regulatory guidance support proposing this endpoint. NOT a
   * prediction of trial success. Derived transparently (see deriveEvidenceStrength).
   */
  evidence_strength?: number;
  /** The highest-authority basis backing this endpoint. */
  evidence_basis?: EndpointEvidenceBasis;
  evidence: EndpointEvidence[];
  regulatory_guidance?: RegulatoryGuidance[];
  academic_references?: AcademicReference[];
  is_primary: boolean;
  similar_endpoints?: string[];
}

export interface EndpointEvidence {
  source_id: string;
  source_type: 'csr' | 'academic' | 'regulatory';
  title: string;
  reference_text: string;
  success_metric?: string;
  phase?: string;
  url?: string;
  confidence: number;
}

export interface RegulatoryGuidance {
  authority: string;
  document_name: string;
  guidance_text: string;
  date?: string;
  url?: string;
  /** Older shape carried by legacy guidance rows */
  endpoint_text?: string;
  phase?: string;
  document?: string;
  text?: string;
  description?: string;
  [key: string]: unknown;
}

/**
 * Raw regulatory-guidance item as stored in the on-disk JSON files under
 * regulatory_data/. These use a looser, source-specific shape that is then
 * normalized into RegulatoryGuidance for output. Fields are optional because
 * the JSON is authored externally and not all records populate every field.
 */
export interface RawRegulatoryGuidanceItem {
  endpoint_text?: string;
  phase?: string;
  authority?: string;
  document?: string;
  text?: string;
  description?: string;
  date?: string;
  url?: string;
}

export interface AcademicReference {
  title: string;
  authors: string[];
  publication: string;
  year: string;
  url?: string;
  excerpt: string;
}

// ─── Honest evidence scoring (Phase 8 confidence-hygiene) ─────────────────────────
// Replaces the former fabricated success_rate defaults/bumps: an endpoint is ranked
// and labeled by the strength of the evidence that actually supports it, never by a
// synthesized trial-success probability.

/** Highest-authority basis backing an endpoint, from the evidence actually present. */
export function classifyEndpointBasis(rec: EndpointRecommendation): EndpointEvidenceBasis {
  if (rec.regulatory_guidance && rec.regulatory_guidance.length > 0) return 'regulatory_recommended';
  const hasCsr = rec.evidence.some((e) => e.source_type === 'csr');
  if (hasCsr && rec.success_rate != null) return 'corpus_outcomes';   // real outcome data present
  if (hasCsr) return 'corpus_frequency';                              // seen in the corpus, no outcome data
  const hasAcademic = rec.evidence.some((e) => e.source_type === 'academic' && e.source_id !== 'ai-generated');
  if (hasAcademic) return 'academic_literature';
  return 'ai_suggested';
}

const BASIS_BASE_STRENGTH: Record<EndpointEvidenceBasis, number> = {
  regulatory_recommended: 80,
  corpus_outcomes: 65,
  corpus_frequency: 45,
  academic_literature: 30,
  ai_suggested: 10,
};

/**
 * Transparent strength-of-evidence score (0–100): the endpoint's evidentiary basis,
 * plus how often it recurs across the corpus and how many independent sources
 * corroborate it. Explicitly NOT a trial-success probability.
 */
export function deriveEvidenceStrength(rec: EndpointRecommendation, basis: EndpointEvidenceBasis): number {
  const base = BASIS_BASE_STRENGTH[basis];
  const frequency = Math.min(15, Math.max(0, rec.occurrence_count - 1) * 3);   // recurring corpus use
  const corroboration = Math.min(10, Math.max(0, rec.evidence.length - 1) * 2); // independent sources
  return Math.min(100, base + frequency + corroboration);
}

/** Attach evidence_basis + evidence_strength to a recommendation (pure; returns a copy). */
export function normalizeEndpointEvidence(rec: EndpointRecommendation): EndpointRecommendation {
  const evidence_basis = classifyEndpointBasis(rec);
  return { ...rec, evidence_basis, evidence_strength: deriveEvidenceStrength(rec, evidence_basis) };
}

/**
 * EndpointRecommenderService
 *
 * Service for recommending clinical trial endpoints based on
 * indication, phase, and other trial characteristics.
 * Uses database analysis, academic knowledge, and regulatory guidance.
 * Provides evidence-based recommendations with justifications.
 */
export class EndpointRecommenderService {
  private hfService: typeof huggingFaceService;
  private academicProcessor: typeof academicDocumentProcessor;
  private regulatoryGuidanceCache: Map<string, RawRegulatoryGuidanceItem[]> = new Map();

  // Regulatory authorities and their typical guidelines
  private regulatoryAuthorities = [
    { name: 'FDA', country: 'US' },
    { name: 'EMA', country: 'EU' },
    { name: 'PMDA', country: 'Japan' },
    { name: 'Health Canada', country: 'Canada' },
    { name: 'MHRA', country: 'UK' },
    { name: 'TGA', country: 'Australia' },
  ];

  // Map of therapeutic areas to common keywords for searching academic literature
  private therapeuticAreaKeywords: Record<string, string[]> = {
    Oncology: ['cancer', 'tumor', 'oncology', 'carcinoma', 'neoplasm', 'metastasis'],
    Cardiovascular: ['heart', 'cardiac', 'cardiovascular', 'hypertension', 'stroke', 'myocardial'],
    Neurology: ['brain', 'neurological', 'cns', 'alzheimer', 'parkinsons', 'multiple sclerosis'],
    Endocrinology: ['diabetes', 'thyroid', 'hormone', 'endocrine', 'metabolic', 'insulin'],
    Psychiatry: [
      'depression',
      'anxiety',
      'psychiatric',
      'mental health',
      'bipolar',
      'schizophrenia',
    ],
    Immunology: ['immune', 'autoimmune', 'immunological', 'allergy', 'immunotherapy'],
    Respiratory: ['lung', 'pulmonary', 'respiratory', 'asthma', 'copd', 'bronchitis'],
    'Infectious Disease': [
      'infection',
      'virus',
      'bacterial',
      'antimicrobial',
      'antibiotic',
      'vaccine',
    ],
    Gastroenterology: ['digestive', 'gastrointestinal', 'liver', 'ibd', 'crohn', 'colitis'],
    Ophthalmology: ['eye', 'vision', 'optical', 'retina', 'glaucoma', 'macular'],
    Dermatology: ['skin', 'dermatological', 'psoriasis', 'eczema', 'dermatitis'],
  };

  constructor(hfService: typeof huggingFaceService) {
    this.hfService = hfService;
    this.academicProcessor = academicDocumentProcessor;
    this.loadRegulatoryGuidance();
  }

  /**
   * Load regulatory guidance from available resources
   */
  private loadRegulatoryGuidance() {
    try {
      const regulatoryPath = path.join(process.cwd(), 'regulatory_data');

      // Check if directory exists
      if (!fs.existsSync(regulatoryPath)) {
        logger.info('No regulatory data directory found, skipping guidance loading');
        return;
      }

      // Read available guidance files
      const files = fs.readdirSync(regulatoryPath).filter(file => file.endsWith('.json'));

      // Process each file
      for (const file of files) {
        try {
          const content = fs.readFileSync(path.join(regulatoryPath, file), 'utf8');
          const guidance = JSON.parse(content);

          if (guidance.indication && Array.isArray(guidance.guidance)) {
            this.regulatoryGuidanceCache.set(guidance.indication.toLowerCase(), guidance.guidance);
          }
        } catch (err) {
          logger.error(`Error processing regulatory file ${file}:`, { error: err });
        }
      }

      logger.info(`Loaded regulatory guidance for ${this.regulatoryGuidanceCache.size} indications`);
    } catch (err) {
      logger.error('Error loading regulatory guidance:', { error: err });
    }
  }

  /**
   * Get comprehensive endpoint recommendations based on indication and phase
   * Returns detailed recommendations with evidence and references
   */
  async getComprehensiveEndpointRecommendations(
    indication: string,
    phase: string = '',
    count: number = 5,
    therapeuticArea: string = ''
  ): Promise<EndpointRecommendation[]> {
    try {
      logger.info(`Generating comprehensive recommendations for ${indication} (${phase || 'any phase'})`);

      // Step 1: Get CSR-based endpoints with statistics
      const csrEndpoints = await this.getEndpointsWithEvidence(indication, phase);

      // Step 2: Get academic knowledge references
      const academicEndpoints = await this.getAcademicEndpointGuidance(
        indication,
        phase,
        therapeuticArea
      );

      // Step 3: Get regulatory guidance
      const regulatoryGuidance = await this.getRegulatoryGuidance(indication, phase);

      // Step 4: Combine and rank all recommendations
      const combinedEndpoints = this.combineEndpointSources(
        csrEndpoints,
        academicEndpoints,
        regulatoryGuidance
      );

      // Step 5: If not enough recommendations, generate more with AI
      if (combinedEndpoints.length < count) {
        const aiRecommendations = await this.getAIGeneratedEndpoints(
          indication,
          phase,
          count - combinedEndpoints.length
        );

        // Add AI recommendations with lower confidence
        for (const endpoint of aiRecommendations) {
          if (!combinedEndpoints.some(e => e.endpoint.toLowerCase() === endpoint.toLowerCase())) {
            combinedEndpoints.push({
              endpoint: endpoint,
              occurrence_count: 1,
              success_rate: null, // No trial-outcome data for an AI-suggested endpoint — do not fabricate a rate
              evidence: [
                {
                  source_id: 'ai-generated',
                  source_type: 'academic',
                  title: 'AI-based recommendation',
                  reference_text: `Based on analysis of similar trial endpoints for ${indication}`,
                  confidence: 0.7,
                },
              ],
              is_primary: true,
              similar_endpoints: [],
            });
          }
        }
      }

      // Attach an honest evidence_basis + evidence_strength to each recommendation and
      // rank by that real signal (regulatory backing, corpus recurrence, corroboration)
      // instead of a fabricated success rate.
      const normalized = combinedEndpoints.map(normalizeEndpointEvidence);
      normalized.sort((a, b) => (b.evidence_strength ?? 0) - (a.evidence_strength ?? 0));
      return normalized.slice(0, count);
    } catch (error) {
      logger.error('Error generating comprehensive endpoint recommendations:', { error: error });
      return [];
    }
  }

  /**
   * Combine all endpoint sources and rank them
   */
  private combineEndpointSources(
    csrEndpoints: EndpointRecommendation[],
    academicEndpoints: EndpointRecommendation[],
    regulatoryGuidance: Record<string, RegulatoryGuidance[]>
  ): EndpointRecommendation[] {
    // Create a map to combine data for the same endpoints
    const endpointMap = new Map<string, EndpointRecommendation>();

    // Process CSR endpoints
    for (const endpoint of csrEndpoints) {
      endpointMap.set(endpoint.endpoint.toLowerCase(), endpoint);
    }

    // Process academic endpoints and merge with existing ones
    for (const endpoint of academicEndpoints) {
      const key = endpoint.endpoint.toLowerCase();

      if (endpointMap.has(key)) {
        // Merge with existing endpoint
        const existing = endpointMap.get(key)!;
        existing.evidence = [...existing.evidence, ...endpoint.evidence];
        existing.academic_references = endpoint.academic_references;

        // Corroborating academic evidence strengthens the evidence basis, but it is
        // NOT a trial-success signal — do not synthesize a success rate from it.
      } else {
        // Add new endpoint
        endpointMap.set(key, endpoint);
      }
    }

    // Add regulatory guidance to applicable endpoints
    for (const [endpoint, guidance] of Object.entries(regulatoryGuidance)) {
      const key = endpoint.toLowerCase();

      if (endpointMap.has(key)) {
        // Add regulatory guidance to existing endpoint. Regulatory backing raises the
        // endpoint's evidence_strength (computed in the normalization pass), not a
        // fabricated success rate.
        const existing = endpointMap.get(key)!;
        existing.regulatory_guidance = guidance;
      }
    }

    // Convert map back to array and sort by evidence quality and success rate
    return Array.from(endpointMap.values()).sort((a, b) => {
      // First prioritize regulatory guidance
      const aHasRegulatory = a.regulatory_guidance && a.regulatory_guidance.length > 0;
      const bHasRegulatory = b.regulatory_guidance && b.regulatory_guidance.length > 0;

      if (aHasRegulatory && !bHasRegulatory) return -1;
      if (!aHasRegulatory && bHasRegulatory) return 1;

      // Then prioritize evidence strength (combined CSR + academic)
      const aEvidenceStrength = a.evidence.reduce((sum, e) => sum + e.confidence, 0);
      const bEvidenceStrength = b.evidence.reduce((sum, e) => sum + e.confidence, 0);

      if (aEvidenceStrength !== bEvidenceStrength) {
        return bEvidenceStrength - aEvidenceStrength;
      }

      // Then prefer a higher EMPIRICAL success rate, only when one is known for both
      // (null = no outcome data; never treated as 0 or ranked).
      if (a.success_rate != null && b.success_rate != null && a.success_rate !== b.success_rate) {
        return b.success_rate - a.success_rate;
      }

      // Finally, prioritize occurrence count
      return b.occurrence_count - a.occurrence_count;
    });
  }

  /**
   * Get academic guidance for endpoints
   */
  private async getAcademicEndpointGuidance(
    indication: string,
    phase: string = '',
    therapeuticArea: string = ''
  ): Promise<EndpointRecommendation[]> {
    try {
      // Generate search terms based on indication and therapeutic area
      const searchTerms = [
        `${indication} clinical trial endpoints`,
        `${indication} ${phase || ''} endpoints`,
        `${indication} outcome measures`,
      ];

      // Add therapeutic area specific terms if available
      if (therapeuticArea && this.therapeuticAreaKeywords[therapeuticArea]) {
        const keywords = this.therapeuticAreaKeywords[therapeuticArea];
        searchTerms.push(...keywords.map(kw => `${kw} ${indication} endpoints`));
      }

      // Collect academic knowledge results for all search terms
      const academicResults: any[] = [];

      for (const searchTerm of searchTerms) {
        try {
          // Search academic knowledge using the document processor
          const results = await this.academicProcessor.searchAcademicKnowledge(searchTerm, 5);

          if (results && results.length > 0) {
            academicResults.push(...results);
          }
        } catch (err) {
          logger.error(`Error searching academic knowledge for "${searchTerm}":`, { error: err });
          // If the standard search fails, try with local fallback
          logger.info(`Generating local response from CSR data...`);
        }
      }

      // Process and extract endpoints from academic results
      const academicEndpoints = new Map<string, EndpointRecommendation>();

      for (const result of academicResults) {
        try {
          // Extract potential endpoints from the context
          const endpoints = this.extractEndpointsFromAcademicText(
            result.context || result.summary || '',
            indication
          );

          // Process each extracted endpoint
          for (const endpoint of endpoints) {
            if (!academicEndpoints.has(endpoint.toLowerCase())) {
              academicEndpoints.set(endpoint.toLowerCase(), {
                endpoint: endpoint,
                occurrence_count: 1,
                success_rate: null, // Literature mention is not a trial-outcome rate — do not fabricate
                evidence: [
                  {
                    source_id: result.id || 'academic-source',
                    source_type: 'academic',
                    title: result.title || 'Academic source',
                    reference_text: result.context || result.summary || 'Academic reference',
                    confidence: result.relevance || 0.8,
                  },
                ],
                academic_references: [
                  {
                    title: result.title || 'Unknown title',
                    authors: result.authors || [],
                    publication: result.source || 'Academic publication',
                    year: result.year || 'Recent',
                    excerpt: result.context || result.summary || '',
                  },
                ],
                is_primary:
                  endpoint.toLowerCase().includes('primary') ||
                  !endpoint.toLowerCase().includes('secondary'),
              });
            } else {
              // Update existing endpoint with additional evidence
              const existing = academicEndpoints.get(endpoint.toLowerCase())!;
              existing.occurrence_count += 1;
              existing.evidence.push({
                source_id: result.id || 'academic-source',
                source_type: 'academic',
                title: result.title || 'Academic source',
                reference_text: result.context || result.summary || 'Academic reference',
                confidence: result.relevance || 0.8,
              });

              if (!existing.academic_references) {
                existing.academic_references = [];
              }

              existing.academic_references.push({
                title: result.title || 'Unknown title',
                authors: result.authors || [],
                publication: result.source || 'Academic publication',
                year: result.year || 'Recent',
                excerpt: result.context || result.summary || '',
              });
            }
          }
        } catch (err) {
          logger.error('Error processing academic result:', { error: err });
        }
      }

      return Array.from(academicEndpoints.values());
    } catch (error) {
      logger.error('Error getting academic endpoint guidance:', { error: error });
      return [];
    }
  }

  /**
   * Extract potential endpoints from academic text
   */
  private extractEndpointsFromAcademicText(text: string, indication: string): string[] {
    try {
      // This is a simplified extraction - in production, we would use NLP techniques
      const lines = text.split(/\n|\.\s+/);
      const potentialEndpoints = [];

      const endpointKeywords = [
        'endpoint',
        'outcome',
        'measure',
        'assessment',
        'evaluation',
        'primary endpoint',
        'secondary endpoint',
        'efficacy endpoint',
      ];

      for (const line of lines) {
        // Skip very short lines
        if (line.length < 15) continue;

        // Check if line contains endpoint keywords
        const hasEndpointKeyword = endpointKeywords.some(kw =>
          line.toLowerCase().includes(kw.toLowerCase())
        );

        if (hasEndpointKeyword) {
          // Extract the most likely endpoint phrase
          let endpoint = line.trim();

          // If it's very long, try to extract just the relevant part
          if (endpoint.length > 100) {
            // Find the part with the endpoint keyword
            for (const kw of endpointKeywords) {
              if (line.toLowerCase().includes(kw.toLowerCase())) {
                const index = line.toLowerCase().indexOf(kw.toLowerCase());

                // Extract a reasonable window around the keyword
                const start = Math.max(0, index - 30);
                const end = Math.min(line.length, index + kw.length + 70);
                endpoint = line.substring(start, end).trim();
                break;
              }
            }
          }

          // Clean up the endpoint
          endpoint = endpoint
            .replace(/^[^a-zA-Z]+/, '') // Remove leading non-alphabet chars
            .replace(/^(commonly|typically|often|usually|standard|recommended)\s+/i, '')
            .replace(/^(the|a|an)\s+/i, '')
            .replace(/^(use of|using|measure of|measurement of)\s+/i, '')
            .trim();

          // Only include if it's substantial and likely an endpoint
          if (endpoint.length > 10 && endpoint.length < 150) {
            potentialEndpoints.push(endpoint);
          }
        }
      }

      return potentialEndpoints;
    } catch (error) {
      logger.error('Error extracting endpoints from text:', { error: error });
      return [];
    }
  }

  /**
   * Get regulatory guidance for endpoints
   */
  private async getRegulatoryGuidance(
    indication: string,
    phase: string = ''
  ): Promise<Record<string, RegulatoryGuidance[]>> {
    try {
      const result: Record<string, RegulatoryGuidance[]> = {};

      // Check cache for existing guidance
      let foundGuidance = false;

      for (const [cachedIndication, guidance] of this.regulatoryGuidanceCache.entries()) {
        if (
          indication.toLowerCase().includes(cachedIndication) ||
          cachedIndication.includes(indication.toLowerCase())
        ) {
          // Process each guidance item
          for (const item of guidance) {
            if (!item.endpoint_text) continue;

            // Extract endpoint text and clean it
            const endpoint = item.endpoint_text.trim();

            // Skip if it's not suitable for the phase
            if (phase && item.phase && !item.phase.toLowerCase().includes(phase.toLowerCase())) {
              continue;
            }

            // Add guidance to result
            if (!result[endpoint]) {
              result[endpoint] = [];
            }

            result[endpoint].push({
              authority: item.authority || 'Regulatory Authority',
              document_name: item.document || 'Regulatory Guidance',
              guidance_text:
                item.text || item.description || 'Recommended endpoint per regulatory guidance',
              date: item.date || '2023',
              url: item.url || undefined,
            });
          }

          foundGuidance = true;
        }
      }

      // If no guidance found in cache, try to generate some with AI
      if (!foundGuidance) {
        const aiGuidance = await this.getAIRegulatoryGuidance(indication, phase);

        // Add AI-generated guidance to result
        for (const [endpoint, guidance] of Object.entries(aiGuidance)) {
          result[endpoint] = guidance;
        }
      }

      return result;
    } catch (error) {
      logger.error('Error getting regulatory guidance:', { error: error });
      return {};
    }
  }

  /**
   * Generate regulatory guidance using AI when cached data is not available
   */
  private async getAIRegulatoryGuidance(
    indication: string,
    phase: string = ''
  ): Promise<Record<string, RegulatoryGuidance[]>> {
    try {
      const prompt = `
Generate regulatory guidance for ${phase || 'clinical'} trial endpoints for ${indication}.
Output a JSON object where keys are endpoint descriptions and values are arrays of regulatory guidance objects.

Example format:
{
  "Overall Survival": [
    {
      "authority": "FDA",
      "document_name": "Guidance for Industry: Clinical Trial Endpoints for the Approval of Cancer Drugs and Biologics",
      "guidance_text": "Overall survival is defined as the time from randomization to death from any cause, and is the most reliable cancer endpoint."
    }
  ],
  "Progression-Free Survival": [
    {
      "authority": "EMA",
      "document_name": "Guideline on the evaluation of anticancer medicinal products in man",
      "guidance_text": "PFS is defined as the time from randomization to objective tumor progression or death."
    }
  ]
}

Include only the most relevant endpoints for ${indication} ${phase || 'trials'} based on major regulatory authorities (FDA, EMA, PMDA, Health Canada, MHRA).
`;

      // Query Hugging Face API
      const response = await this.hfService.queryHuggingFace(prompt);

      // Parse response to extract JSON object
      try {
        const jsonMatch = response.match(/{[\s\S]*}/);
        if (jsonMatch) {
          const jsonStr = jsonMatch[0];
          const guidance = JSON.parse(jsonStr);

          // Validate the structure
          if (typeof guidance === 'object' && !Array.isArray(guidance)) {
            return guidance;
          }
        }
      } catch (parseError) {
        logger.error('Error parsing AI regulatory guidance:', { error: parseError });
      }

      // Return empty object if parsing failed
      return {};
    } catch (error) {
      logger.error('Error generating AI regulatory guidance:', { error: error });
      return {};
    }
  }

  /**
   * Get endpoints with evidence from CSR database
   */
  private async getEndpointsWithEvidence(
    indication: string,
    phase: string = ''
  ): Promise<EndpointRecommendation[]> {
    try {
      // Create query conditions
      const conditions = [];

      // Add indication filter (with fuzzy matching)
      conditions.push(like(csrReports.indication, `%${indication}%`));

      // Add phase filter if provided
      if (phase && phase !== 'any') {
        conditions.push(like(csrReports.phase, `%${phase}%`));
      }

      // Build full query condition
      const whereCondition = conditions.length > 0 ? and(...conditions) : undefined;

      // Query for reports matching criteria
      const matchingReports = await db
        .select({
          id: csrReports.id,
          title: csrReports.title,
          sponsor: csrReports.sponsor,
          phase: csrReports.phase,
          date: csrReports.reportDate,
        })
        .from(csrReports)
        .where(whereCondition)
        .limit(100);

      if (matchingReports.length === 0) {
        return [];
      }

      // Get report IDs
      const reportIds = matchingReports.map(report => report.id);

      // Extract report details with endpoints
      const reportsWithDetails = await db
        .select({
          reportId: csrDetails.reportId,
          endpoints: csrDetails.endpoints,
          results: csrDetails.results,
        })
        .from(csrDetails)
        .where(sql`${csrDetails.reportId} IN (${reportIds.join(',')})`);

      // Process endpoints and calculate statistics
      const endpointStats = new Map<
        string,
        {
          endpoint: string;
          occurrences: number;
          successfulTrials: number;
          totalTrials: number;
          isPrimary: boolean;
          reports: Array<{
            id: number;
            title: string;
            sponsor: string;
            phase: string;
            date: string;
            // The current csr_reports schema has no trial-outcome column, so
            // this is left blank until an outcome source is wired in. Success
            // classification below therefore counts no trials as successful.
            outcome: string;
          }>;
        }
      >();

      // Process each report's endpoints
      for (const detail of reportsWithDetails) {
        try {
          const report = matchingReports.find(r => r.id === detail.reportId);
          if (!report) continue;

          // No trial-outcome column exists on csr_reports in the current schema.
          const reportDateStr = report.date ?? '';
          const reportOutcome = '';

          const endpoints = (detail.endpoints as any) || {};
          const primaryEndpoints = endpoints.primary || [];
          const secondaryEndpoints = endpoints.secondary || [];

          // Process primary endpoints
          for (const endpoint of primaryEndpoints) {
            if (!endpoint) continue;

            const key = endpoint.toString().trim();
            if (!endpointStats.has(key)) {
              endpointStats.set(key, {
                endpoint: key,
                occurrences: 0,
                successfulTrials: 0,
                totalTrials: 0,
                isPrimary: true,
                reports: [],
              });
            }

            const stats = endpointStats.get(key)!;
            stats.occurrences += 1;
            stats.totalTrials += 1;

            // Check if trial was successful
            const successOutcomes = ['positive', 'success', 'met', 'achieved', 'favorable'];
            const isSuccessful = successOutcomes.some(term =>
              reportOutcome.toLowerCase().includes(term)
            );

            if (isSuccessful) {
              stats.successfulTrials += 1;
            }

            // Add report reference
            stats.reports.push({
              id: report.id,
              title: report.title || '',
              sponsor: report.sponsor || '',
              phase: report.phase || '',
              date: reportDateStr,
              outcome: reportOutcome,
            });
          }

          // Process secondary endpoints
          for (const endpoint of secondaryEndpoints) {
            if (!endpoint) continue;

            const key = endpoint.toString().trim();
            if (!endpointStats.has(key)) {
              endpointStats.set(key, {
                endpoint: key,
                occurrences: 0,
                successfulTrials: 0,
                totalTrials: 0,
                isPrimary: false,
                reports: [],
              });
            }

            const stats = endpointStats.get(key)!;
            stats.occurrences += 1;

            // Only count as a trial if not already counted as primary
            if (!primaryEndpoints.some((e: any) => e === key)) {
              stats.totalTrials += 1;

              // Check if trial was successful
              const successOutcomes = ['positive', 'success', 'met', 'achieved', 'favorable'];
              const isSuccessful = successOutcomes.some(term =>
                reportOutcome.toLowerCase().includes(term)
              );

              if (isSuccessful) {
                stats.successfulTrials += 1;
              }

              // Add report reference
              stats.reports.push({
                id: report.id,
                title: report.title || '',
                sponsor: report.sponsor || '',
                phase: report.phase || '',
                date: reportDateStr,
                outcome: reportOutcome,
              });
            }
          }
        } catch (error) {
          logger.error('Error processing CSR endpoints:', { error: error });
        }
      }

      // Convert to EndpointRecommendation format
      return (Array.from(endpointStats.values())
        .filter(stat => stat.totalTrials > 0)
        .map(stat => {
          // Emit an empirical rate ONLY when successful trials were actually recorded;
          // otherwise null (do not fabricate, and do not report a misleading 0 when
          // outcome status simply was not captured). Rank uses evidence_strength.
          const successRate =
            stat.totalTrials > 0 && stat.successfulTrials > 0
              ? Math.round((stat.successfulTrials / stat.totalTrials) * 100)
              : null;

          return {
            endpoint: stat.endpoint,
            occurrence_count: stat.occurrences,
            success_rate: successRate,
            evidence: stat.reports.slice(0, 3).map(
              (report): EndpointEvidence => ({
                source_id: report.id.toString(),
                source_type: 'csr',
                title: report.title,
                reference_text: `${report.sponsor} trial (${report.phase}): ${report.outcome || 'Completed'}`,
                success_metric: report.outcome || undefined,
                phase: report.phase,
                confidence: 0.9,
              })
            ),
            is_primary: stat.isPrimary,
            similar_endpoints: [] as string[],
          };
        })
        .sort((a, b) => {
          // Primary endpoints first
          if (a.is_primary && !b.is_primary) return -1;
          if (!a.is_primary && b.is_primary) return 1;

          // Then by EMPIRICAL success rate, only when known for both (null = no data)
          if (a.success_rate != null && b.success_rate != null && a.success_rate !== b.success_rate) {
            return b.success_rate - a.success_rate;
          }

          // Then by occurrence count
          return b.occurrence_count - a.occurrence_count;
        })) as unknown as EndpointRecommendation[];
    } catch (error) {
      logger.error('Error getting endpoints with evidence:', { error: error });
      return [];
    }
  }

  /**
   * Get endpoint recommendations based on indication and phase
   * This method is maintained for backwards compatibility.
   */
  async getEndpointRecommendations(
    indication: string,
    phase: string = '',
    count: number = 5
  ): Promise<string[]> {
    try {
      // Use the new comprehensive method but extract just the endpoint strings
      const recommendations = await this.getComprehensiveEndpointRecommendations(
        indication,
        phase,
        count
      );

      // Extract just the endpoint strings
      return recommendations.map(rec => rec.endpoint);
    } catch (error) {
      logger.error('Error getting endpoint recommendations:', { error: error });
      return [];
    }
  }

  /**
   * Get common endpoints directly from the database
   */
  private async getCommonEndpointsFromDatabase(
    indication: string,
    phase: string = ''
  ): Promise<string[]> {
    try {
      // Create query conditions
      const conditions = [];

      // Add indication filter (with fuzzy matching)
      conditions.push(like(csrReports.indication, `%${indication}%`));

      // Add phase filter if provided
      if (phase && phase !== 'any') {
        conditions.push(like(csrReports.phase, `%${phase}%`));
      }

      // Build full query condition
      const whereCondition = conditions.length > 0 ? and(...conditions) : undefined;

      // Query for reports matching criteria
      const matchingReports = await db
        .select({
          id: csrReports.id,
        })
        .from(csrReports)
        .where(whereCondition)
        .limit(100);

      if (matchingReports.length === 0) {
        return [];
      }

      // Get report IDs
      const reportIds = matchingReports.map(report => report.id);

      // Extract unique endpoints from matching reports
      const detailsResults = await db
        .select({
          endpoint: sql<string>`jsonb_array_elements_text(${csrDetails.endpoints}->>'primary')`,
        })
        .from(csrDetails)
        .where(sql`${csrDetails.reportId} IN (${reportIds.join(',')})`)
        .groupBy(sql`jsonb_array_elements_text(${csrDetails.endpoints}->>'primary')`)
        .orderBy(desc(sql`COUNT(*)`));

      // Extract endpoints and filter out null/empty values
      const endpoints = detailsResults.map(result => result.endpoint).filter(Boolean) as string[];

      return endpoints;
    } catch (error) {
      logger.error('Error getting endpoints from database:', { error: error });
      return [];
    }
  }

  /**
   * Generate endpoint recommendations using Hugging Face
   */
  private async getAIGeneratedEndpoints(
    indication: string,
    phase: string = '',
    count: number = 5
  ): Promise<string[]> {
    try {
      const prompt = `
Generate ${count} evidence-based primary endpoints appropriate for a ${phase || 'clinical'} trial 
targeting ${indication}. Format the response as a JSON array of strings containing only the endpoints.

For example:
["Reduction in tumor size measured by CT scan at 6 months", "Progression-free survival at 12 months"]

Guidelines:
- Each endpoint should be specific and measurable
- Include timeframes where applicable 
- Focus on clinically relevant outcomes
- Follow standard endpoint structures for ${indication}
- Provide clear metrics (e.g., percentage reduction, absolute change)
`;

      // Query Hugging Face API
      const response = await this.hfService.queryHuggingFace(prompt);

      // Parse response to extract JSON array
      try {
        // Find JSON array in the response
        const jsonMatch = response.match(/\[.*\]/s);
        if (jsonMatch) {
          const jsonStr = jsonMatch[0];
          const endpoints = JSON.parse(jsonStr);

          if (Array.isArray(endpoints)) {
            return endpoints
              .slice(0, count)
              .map(endpoint => endpoint.trim())
              .filter(Boolean);
          }
        }

        // Fallback: Parse line by line if JSON parsing fails
        return response
          .split('\n')
          .map(line => line.replace(/^["'\d\s-]+/, '').trim())
          .filter(Boolean)
          .slice(0, count);
      } catch (parseError) {
        logger.error('Error parsing AI response:', { error: parseError });

        // Last resort fallback: Split by quotes or line breaks
        return response
          .split(/["'\n]/)
          .map(line => line.trim())
          .filter(line => line.length > 10 && !line.includes('{') && !line.includes('}'))
          .slice(0, count);
      }
    } catch (error) {
      logger.error('Error generating AI endpoints:', { error: error });
      return [];
    }
  }

  /**
   * Evaluate an endpoint's quality and applicability
   */
  async evaluateEndpoint(
    endpoint: string,
    indication: string,
    phase: string = ''
  ): Promise<{
    score: number | null;   // null when the model returns no usable score — never fabricated
    feedback: string;
    similarEndpoints: string[];
  }> {
    try {
      const prompt = `
Evaluate this clinical trial endpoint for a ${phase || 'clinical'} trial in ${indication}:
"${endpoint}"

Consider:
1. Specificity and measurability
2. Clinical relevance
3. Appropriateness for ${phase || 'clinical'} trials
4. Standard practices for ${indication}
5. Statistical considerations

Provide a JSON response with:
- score: A number from 0-100 representing quality
- feedback: Constructive feedback explaining the score
- suggestedImprovement: How to improve this endpoint (if score < 90)
`;

      // Query Hugging Face API
      const response = await this.hfService.queryHuggingFace(prompt);

      // Parse response
      try {
        // Try to extract JSON
        const jsonMatch = response.match(/{.*}/s);
        if (jsonMatch) {
          const jsonStr = jsonMatch[0];
          const evaluation = JSON.parse(jsonStr);

          // Get similar endpoints from the database
          const similarEndpoints = await this.getSimilarEndpoints(endpoint, indication, 3);

          return {
            // Use the model's score only when it is a real number (0 is valid); never
            // fabricate a fallback score when it is missing.
            score: typeof evaluation.score === 'number' ? evaluation.score : null,
            feedback: evaluation.feedback || 'No specific feedback available',
            similarEndpoints,
          };
        }

        // Fallback if JSON parsing fails — no score is honest, not a made-up 70.
        return {
          score: null,
          feedback:
            'Unable to parse structured feedback. Please review the endpoint for clarity and measurability.',
          similarEndpoints: await this.getSimilarEndpoints(endpoint, indication, 3),
        };
      } catch (parseError) {
        logger.error('Error parsing endpoint evaluation:', { error: parseError });
        return {
          score: null,
          feedback:
            'Endpoint evaluation failed. Please ensure the endpoint is clear, specific, and measurable.',
          similarEndpoints: [],
        };
      }
    } catch (error) {
      logger.error('Error evaluating endpoint:', { error: error });
      return {
        score: null,
        feedback: 'An error occurred during evaluation. Please try again.',
        similarEndpoints: [],
      };
    }
  }

  /**
   * Find similar endpoints from the database
   */
  private async getSimilarEndpoints(
    endpoint: string,
    indication: string,
    limit: number = 3
  ): Promise<string[]> {
    try {
      // Get keywords from endpoint
      const keywords = endpoint
        .toLowerCase()
        .replace(/[^\w\s]/g, '')
        .split(/\s+/)
        .filter(word => word.length > 3);

      if (keywords.length === 0) {
        return [];
      }

      // Query for similar endpoints using JSON search
      const results = await db
        .select({
          endpoint: sql<string>`jsonb_array_elements_text(${csrDetails.endpoints}->>'primary')`,
        })
        .from(csrDetails)
        .innerJoin(csrReports, eq(csrDetails.reportId, csrReports.id))
        .where(like(csrReports.indication, `%${indication}%`))
        .limit(limit * 3); // Get more, then filter for relevance

      // Filter results for relevance (contains at least one keyword)
      const filteredEndpoints = results
        .map(result => result.endpoint)
        .filter(Boolean)
        .filter(endpointText => {
          const endpointLower = endpointText.toLowerCase();
          return keywords.some(keyword => endpointLower.includes(keyword));
        })
        .slice(0, limit);

      return filteredEndpoints;
    } catch (error) {
      logger.error('Error finding similar endpoints:', { error: error });
      return [];
    }
  }
}

// Singleton instance to be used by routes
let endpointRecommenderService: EndpointRecommenderService | null = null;

export function getEndpointRecommenderService(): EndpointRecommenderService {
  if (!endpointRecommenderService) {
    endpointRecommenderService = new EndpointRecommenderService(huggingFaceService);
  }
  return endpointRecommenderService;
}
