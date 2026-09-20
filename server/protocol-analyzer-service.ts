import { db } from './db';
import { eq } from 'drizzle-orm';
import { protocols } from '../shared/schema';
import { classifyTherapeuticArea } from '../shared/utils/therapeutic-area-classifier';
import { getPool } from './db/runtime';
import { getEmbeddingService } from './services/enhancedEmbeddingService';

/**
 * What a protocol document was found to STATE. Absent means "the document did
 * not state it" — never a stand-in.
 *
 * ── 2026-09-10: the six fields below were required, and invented ─────────────
 * Every extraction was a `match ? real : invented` ternary, so a protocol that
 * did not state a value got one anyway, indistinguishable from one that did:
 *   phase             -> 'Phase 2'
 *   sample_size       -> 100
 *   duration_weeks    -> 24
 *   primary_endpoint  -> 'Overall Response Rate'
 *   secondary_endpoints -> ['Progression-Free Survival', 'Safety and Tolerability']
 *   design            -> 'Randomized, Double-Blind, Placebo-Controlled'
 *   arms              -> 2
 *   sponsor           -> 'Unknown Sponsor'
 * The whole object was then stamped `confidence_score: 0.85` and a `summary`
 * sentence was composed FROM the invented values, so the fabrication read as
 * prose. Optional now, and omitted when not found.
 */
export interface ProtocolData {
  phase?: string;
  indication?: string;
  sponsor?: string;
  sample_size?: number;
  duration_weeks?: number;
  primary_endpoint?: string;
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
  /**
   * Fraction of the target fields this document actually stated, 0..1.
   *
   * Replaces `confidence_score`, which was the constant 0.85 on every result
   * including ones where nothing matched. This is a coverage measure, not a
   * confidence in correctness: it says how much was found, never how right it
   * is. `fields_not_stated` names what is missing so a reader does not have to
   * infer it from absent keys.
   */
  extraction_coverage?: number;
  fields_not_stated?: string[];
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

      const phase = phaseMatch ? this.normalizePhase(phaseMatch[1]) : undefined;

      // Extract indication using the centralized therapeutic area classifier
      // This provides consistent, accurate classification across the entire platform
      // Undefined when neither an explicit statement nor the classifier finds
      // anything. The classifier returns a catch-all bucket ('Other'/'Unknown')
      // for text that names no disease at all, and assigning that was the same
      // defect as the defaults below: "This document states: in Other." reads as
      // a classification when it means nothing was found.
      let indication: string | undefined;

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
        // No explicit indication found, use full text classification — but a
        // catch-all bucket is not a classification.
        const classified = classifyTherapeuticArea(protocolText);
        indication =
          classified && classified !== UNKNOWN_AREA && classified !== 'Other'
            ? classified
            : undefined;
        console.log(
          indication
            ? `Protocol analysis: Classified as "${indication}"`
            : 'Protocol analysis: no therapeutic area could be determined'
        );
      }

      // Extract sample size
      const sampleSizeMatch =
        normalizedText.match(/(?:sample size|n\s*=|participants|subjects|patients):\s*(\d+)/i) ||
        normalizedText.match(/(\d+)\s+(?:participants|subjects|patients)/i);

      const sample_size = sampleSizeMatch ? parseInt(sampleSizeMatch[1]) : undefined;

      // Extract duration
      const durationMatch =
        normalizedText.match(/(?:duration|length|period):\s*(\d+)\s*(?:weeks|wks)/i) ||
        normalizedText.match(/(\d+)\s*(?:weeks|wks)/i);

      const duration_weeks = durationMatch ? parseInt(durationMatch[1]) : undefined;

      // Extract primary endpoint
      const endpointMatch =
        normalizedText.match(/(?:primary endpoint|primary outcome):\s*([^\n\.]+)/i) ||
        normalizedText.match(
          /(?:primary endpoint|primary outcome)[^:]*?(?:is|will be)\s+([^\n\.]+)/i
        );

      const primary_endpoint = endpointMatch ? endpointMatch[1].trim() : undefined;

      // Extract secondary endpoints
      const secondaryEndpointsMatch = normalizedText.match(
        /(?:secondary endpoints|secondary outcomes):\s*([^\n]+)/i
      );

      const secondary_endpoints = secondaryEndpointsMatch
        ? secondaryEndpointsMatch[1].split(/[;,]/).map(e => e.trim())
        : undefined;

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

      const design = designMatch ? designMatch[1].trim() : undefined;

      // Extract number of arms
      const armsMatch = normalizedText.match(/(\d+)\s*(?:arms|groups)/i);

      const arms = armsMatch ? parseInt(armsMatch[1]) : undefined;

      // Extract sponsor information
      const sponsorMatch =
        normalizedText.match(/(?:sponsor|conducted by|developed by):\s*([^\n\.]+)/i) ||
        normalizedText.match(
          /(?:sponsor|conducted by|developed by)[^:]*?(?:is|will be)\s+([^\n\.]+)/i
        );

      const sponsor = sponsorMatch ? sponsorMatch[1].trim() : undefined;

      /* The summary used to read, unconditionally:
           "Protocol for a ${phase} clinical trial investigating ${indication}
            with ${sample_size} participants over ${duration_weeks} weeks. The
            primary endpoint is ${primary_endpoint}."
         With every one of those defaulted, an upload stating none of them still
         produced: "Protocol for a Phase 2 clinical trial investigating Oncology
         with 100 participants over 24 weeks. The primary endpoint is Overall
         Response Rate." — a fluent, entirely invented paragraph. It is now
         assembled only from clauses whose value was actually found. */
      const stated: string[] = [];
      if (phase) stated.push(`a ${phase} trial`);
      if (indication) stated.push(`in ${indication}`);
      if (sample_size !== undefined) stated.push(`with ${sample_size} participants`);
      if (duration_weeks !== undefined) stated.push(`over ${duration_weeks} weeks`);
      const summary =
        stated.length > 0
          ? `This document states: ${stated.join(', ')}.` +
            (primary_endpoint ? ` Primary endpoint: ${primary_endpoint}.` : '')
          : 'No protocol parameters could be read from this document.';

      // Coverage, not confidence. Which of the target fields the document
      // actually stated — replacing the constant 0.85 that was stamped on every
      // result, including one where nothing matched at all.
      const targetFields: Array<[string, unknown]> = [
        ['phase', phase],
        ['indication', indication],
        ['sponsor', sponsor],
        ['sample_size', sample_size],
        ['duration_weeks', duration_weeks],
        ['primary_endpoint', primary_endpoint],
        ['secondary_endpoints', secondary_endpoints],
        ['design', design],
        ['arms', arms],
        ['inclusion_criteria', inclusion_criteria],
        ['exclusion_criteria', exclusion_criteria],
        ['population', population],
      ];
      const fields_not_stated = targetFields.filter(([, v]) => v === undefined).map(([k]) => k);
      const extraction_coverage =
        (targetFields.length - fields_not_stated.length) / targetFields.length;

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

        /* GENERIC REFERENCE TEXT, not findings about this protocol. These are
           the same strings for every document; they are kept because a
           requirements checklist is useful, and labelled so nobody reads them
           as an assessment. */
        regulatory_notes:
          'GENERIC GUIDANCE (not derived from this document): protocols should comply ' +
          'with ICH E6(R2) Good Clinical Practice guidelines.',

        /* `global_compliance: { FDA: true, EMA: true, ... }` was REMOVED on
           2026-09-10. It asserted that the uploaded document complies with FDA
           and EMA requirements — unconditionally, for any text, from a handful
           of regex matches — and made PMDA and NMPA compliance turn on whether
           a therapeutic-area classifier said "Oncology". A compliance verdict
           is the output of a review against a requirements set. Nothing here
           performed one, and there is no narrower true version to keep, so the
           field is gone rather than softened. The requirements list below
           stands in its place: what each region asks for, with no claim about
           whether this protocol meets it. */
        regional_requirements: {
          FDA: ['Diversity requirements per FDORA 2022', 'IRB/informed consent documentation'],
          EMA: ['GDPR data protection implementation', 'EudraCT registration'],
          PMDA: ['Japanese GCP Ordinance compliance', 'Ethnic factors considerations'],
          NMPA: [
            'China Human Genetic Resources approval if applicable',
            'Local ethics committee approval',
          ],
        },
        // Same strings on every result — a checklist, not an assessment of this
        // document. Labelled so, like regulatory_notes above.
        ethical_considerations: [
          'GENERIC GUIDANCE (not derived from this document): IRB/EC approval required before study initiation',
          'GENERIC GUIDANCE (not derived from this document): informed consent must meet all ICH and local requirements',
          'GENERIC GUIDANCE (not derived from this document): data privacy protections must be implemented',
        ],
        /* REMOVED 2026-09-10:
           safety_monitoring: 'Independent Data Monitoring Committee required
                               for this study design'
             — a determination about THIS study's design, on every document,
               including ones where the design was never read.
           geographic_regions: ['North America', 'Europe', 'Asia-Pacific']
             — invented facts about where the trial runs. Nothing in the text
               was consulted. */
        ethnic_considerations: [
          'GENERIC GUIDANCE (not derived from this document): studies should include a diverse population',
          'GENERIC GUIDANCE (not derived from this document): consider ethnic factors in PK/PD analysis',
        ],

        intelligence_source: 'Concept2Cure Protocol Analyzer (regex extraction)',
        extraction_coverage,
        fields_not_stated,
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

  /** Assemble a protocol's comparable text for semantic embedding. */
  private buildProtocolText(p: {
    title?: string | null;
    indication?: string | null;
    phase?: string | null;
    summary?: string;
    design?: string;
    primary_endpoint?: string;
  }): string {
    return [p.title, p.indication, p.phase, p.summary, p.design, p.primary_endpoint]
      .filter(Boolean)
      .join('. ')
      .trim();
  }

  /** Cosine similarity between two equal-length vectors (0 when undefined). */
  private cosine(a: number[], b: number[]): number {
    let dot = 0;
    let normA = 0;
    let normB = 0;
    const len = Math.min(a.length, b.length);
    for (let i = 0; i < len; i++) {
      dot += a[i] * b[i];
      normA += a[i] * a[i];
      normB += b[i] * b[i];
    }
    if (normA === 0 || normB === 0) return 0;
    return dot / (Math.sqrt(normA) * Math.sqrt(normB));
  }

  /**
   * Find similar protocols to the given protocol data.
   *
   * Similarity is computed semantically via embeddings when the embedding
   * service is available, and falls back to a deterministic attribute-based
   * score otherwise. Both are real measures — neither is fabricated — and each
   * result is tagged with the `similarityMethod` used.
   */
  async findSimilarProtocols(protocolData: ProtocolData, limit: number = 5): Promise<any[]> {
    try {
      // The search key is the indication, which is optional now — the analyser
      // no longer defaults it. With no indication stated there is no key to
      // match on, so there is nothing to compare against. Returning [] here is
      // correct rather than fail-open, because the ONE caller
      // (analytics-routes.ts) distinguishes all three cases in the text it
      // renders: not stated, stated-but-unmatched, and matched.
      if (!protocolData.indication) return [];

      // Find similar reports by indication and phase
      const similar = await db
        .select()
        .from(protocols)
        .where(eq(protocols.indication, protocolData.indication))
        .limit(limit);

      // Attempt semantic embeddings; degrade gracefully to attribute scoring.
      let embeddingService: ReturnType<typeof getEmbeddingService> | null = null;
      let inputVector: number[] | null = null;
      let inputModel = '';
      try {
        embeddingService = getEmbeddingService(getPool());
        const inputText = this.buildProtocolText({
          indication: protocolData.indication,
          phase: protocolData.phase,
          summary: protocolData.summary,
          design: protocolData.design,
          primary_endpoint: protocolData.primary_endpoint,
        });
        if (inputText) {
          const result = await embeddingService.embed(inputText);
          inputVector = result.embedding;
          inputModel = result.model;
        }
      } catch {
        embeddingService = null;
        inputVector = null;
      }

      return await Promise.all(
        similar.map(async protocol => {
          // The protocols table stores sponsor / sample size / duration inside
          // the JSON `metadata` column rather than as dedicated columns.
          const meta = (protocol.metadata ?? {}) as {
            sponsor?: string;
            sampleSize?: number;
            sample_size?: number;
            durationWeeks?: number;
            duration?: number;
            outcome?: string;
            embedding?: number[];
            embeddingModel?: string;
          };
          const sampleSize = meta.sampleSize ?? meta.sample_size;
          const durationWeeks = meta.durationWeeks ?? meta.duration;

          let similarity: number | null = this.computeSimilarity(protocolData, {
            phase: protocol.phase,
            indication: protocol.indication,
            sampleSize,
            durationWeeks,
          });
          let similarityMethod: 'semantic' | 'attribute' = 'attribute';

          if (embeddingService && inputVector) {
            try {
              // Reuse the protocol's persisted embedding when present (same
              // model); otherwise embed once and persist it to avoid recomputing
              // on every request.
              let candidateVector: number[] | null = null;
              if (
                Array.isArray(meta.embedding) &&
                meta.embedding.length === inputVector.length &&
                meta.embeddingModel === inputModel
              ) {
                candidateVector = meta.embedding;
              } else {
                const candidateText = this.buildProtocolText({
                  title: protocol.title,
                  indication: protocol.indication,
                  phase: protocol.phase,
                });
                if (candidateText) {
                  const result = await embeddingService.embed(candidateText);
                  candidateVector = result.embedding;
                  await db
                    .update(protocols)
                    .set({ metadata: { ...meta, embedding: result.embedding, embeddingModel: result.model } })
                    .where(eq(protocols.id, protocol.id));
                }
              }
              if (candidateVector) {
                similarity = Math.round(this.cosine(inputVector, candidateVector) * 100);
                similarityMethod = 'semantic';
              }
            } catch {
              // keep the attribute-based score
            }
          }

          return {
            id: protocol.id,
            title: protocol.title,
            sponsor: meta.sponsor ?? null,
            phase: protocol.phase,
            indication: protocol.indication,
            similarity,
            similarityMethod,
            sampleSize: sampleSize ?? null,
            duration: durationWeeks ?? null,
            outcome: this.deriveOutcome(protocol.status, meta.outcome),
          };
        })
      );
    } catch (error) {
      console.error('Error finding similar protocols:', error);
      return [];
    }
  }
}

export const protocolAnalyzerService = new ProtocolAnalyzerService();
