import { eq, and, inArray, like } from 'drizzle-orm';
import { db } from '../db';
import { csrReports, csrDetails } from '../../shared/schema';
import { huggingFaceService } from '../huggingface-service';
import { academicDocumentProcessor } from './academic-document-processor';
import { endpointsFromDetail } from './corpus/precedent-benchmark-reader';
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
  /** CSR reports (for a literature-only endpoint: literature results) recording it; 0 if model-proposed. */
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
  /** Where the item came from; a model suggestion is 'language_model', not literature. */
  source_type: 'csr' | 'academic' | 'regulatory' | 'language_model';
  title: string;
  reference_text: string;
  success_metric?: string;
  phase?: string;
  url?: string;
  /** Not assessed: no evidence item carries a calibrated confidence, so this is null. */
  confidence: number | null;
  /** The literature search's similarity score for this item, as the search returned it (literature only). */
  retrieval_score?: number | null;
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
  /** null: the literature search records no authors (which is not "no authors"). */
  authors: string[] | null;
  /** null when the source records none. */
  publication: string | null;
  /** null: the literature search records no year. */
  year: string | null;
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

// ─── What each source returned ────────────────────────────────────────────────────
// 2026-10-15: every source caught its own failure and returned an empty answer, so a
// source that could not be read looked the same as one that found nothing. Each answer
// now says, per source, which of the two it was.

/** The sources a recommendation consults. */
export type EndpointSourceName =
  | 'csr_corpus'
  | 'academic_literature'
  | 'regulatory_guidance'
  | 'language_model';

export interface EndpointSourceStatus {
  /**
   * read: consulted, and it returned candidates (for the model: it answered).
   * no_matches: consulted, and nothing matched.
   * unavailable: the read failed, or no such source is loaded.
   * not_queried: not consulted.
   */
  status: 'read' | 'no_matches' | 'unavailable' | 'not_queried';
  /** Why a source was unavailable or not queried, or what a read covered; null otherwise. */
  detail: string | null;
}

export interface EndpointRecommendationResult {
  recommendations: EndpointRecommendation[];
  sources: Record<EndpointSourceName, EndpointSourceStatus>;
}

export interface EndpointEvaluation {
  /** Always null: no deterministic endpoint-quality rubric exists, and a number a model types is not one. */
  score: null;
  /** The language model's commentary on the endpoint: narration, not a score or verdict. */
  feedback: string;
  /**
   * Primary endpoints recorded in CSRs for the indication that share a word with this one;
   * null when the endpoint has no word to match on, so nothing was compared.
   */
  similarEndpoints: string[] | null;
}

/** The answer to a recommendation refused because the CSR corpus could not be read. */
export const ENDPOINT_CORPUS_UNAVAILABLE = {
  error: 'ENDPOINT_CORPUS_UNAVAILABLE',
  message: 'The CSR endpoint corpus could not be read; no endpoint recommendations were produced.',
  unavailable: ['csr_corpus'],
} as const;

/**
 * The CSR corpus is the recommender's primary evidence. When it cannot be read the
 * recommendation is refused: an answer from the literature and the model alone would
 * present a gap nobody measured as a lack of precedent.
 */
export class EndpointCorpusUnavailableError extends Error {
  readonly unavailable: EndpointSourceName[] = ['csr_corpus'];

  constructor(options?: { cause?: unknown }) {
    super(ENDPOINT_CORPUS_UNAVAILABLE.message, options);
    this.name = 'EndpointCorpusUnavailableError';
  }
}

/** Reports read per request; the read says when more matched. */
const CORPUS_REPORT_LIMIT = 100;

/** What the CSR corpus read returned. */
interface CorpusRead {
  endpoints: EndpointRecommendation[];
  status: EndpointSourceStatus;
}

type SourceRead<T> = { ok: true; value: T } | { ok: false };

type AcademicSearchResult = Awaited<
  ReturnType<typeof academicDocumentProcessor.searchAcademicKnowledge>
>[number];

/** Read one supplementary source. A failure is logged and reported, never returned as an empty answer. */
async function readSource<T>(what: string, read: () => Promise<T>): Promise<SourceRead<T>> {
  try {
    return { ok: true, value: await read() };
  } catch (error) {
    logger.error(`Endpoint recommender: ${what} failed`, { error });
    return { ok: false };
  }
}

function foundStatus(found: number): EndpointSourceStatus {
  return { status: found > 0 ? 'read' : 'no_matches', detail: null };
}

function literatureStatus(loaded: boolean, read: SourceRead<EndpointRecommendation[]>): EndpointSourceStatus {
  if (!loaded) return { status: 'unavailable', detail: 'no literature is loaded' };
  if (!read.ok) return { status: 'unavailable', detail: 'the literature search failed' };
  return foundStatus(read.value.length);
}

/** One group of a csr_details.endpoints record, read by the corpus reader's own rule. */
function endpointGroup(endpoints: unknown, group: 'primary' | 'secondary'): string[] {
  if (!endpoints || typeof endpoints !== 'object') return [];
  return endpointsFromDetail({ [group]: (endpoints as Record<string, unknown>)[group] });
}

/**
 * One CSR report as evidence. 2026-10-15: the line read "<sponsor> trial (<phase>):
 * Completed" and carried confidence 0.9. csr_reports has no outcome column, so
 * "Completed" was a trial status nobody recorded; no computation produced the 0.9.
 */
function csrEvidence(report: {
  id: number;
  title: string | null;
  sponsor: string | null;
  phase: string | null;
}): EndpointEvidence {
  const sponsor = report.sponsor || 'Sponsor not recorded';
  return {
    source_id: report.id.toString(),
    source_type: 'csr',
    title: report.title || '',
    reference_text: `${sponsor} trial (${report.phase || 'phase not recorded'}): outcome not recorded`,
    phase: report.phase || undefined,
    confidence: null,
  };
}

/**
 * A literature item as the search returned it. 2026-10-15: confidence was
 * `relevance || 0.8`, so a real relevance of 0 became 0.8. The reference read year
 * 'Recent', authors [] and publication 'Academic publication'. The search records
 * no year and no authors, and the publication was a placeholder.
 */
function literatureEvidence(result: AcademicSearchResult): EndpointEvidence {
  return {
    source_id: result.id || 'academic-source',
    source_type: 'academic',
    title: result.title || 'Academic source',
    reference_text: result.context || result.summary || 'Academic reference',
    confidence: null,
    retrieval_score: typeof result.relevance === 'number' ? result.relevance : null,
  };
}

function literatureReference(result: AcademicSearchResult): AcademicReference {
  return {
    title: result.title || 'Unknown title',
    authors: null,
    publication: result.source || null,
    year: null,
    excerpt: result.context || result.summary || '',
  };
}

/**
 * A model-proposed endpoint, labelled as exactly that. 2026-10-15: it was filed as
 * source_type 'academic', said "Based on analysis of similar trial endpoints for <X>",
 * and carried confidence 0.7 and occurrence_count 1. No analysis happened, the source
 * is not literature, no computation produced the 0.7, and no report recorded it.
 */
function modelSuggestion(endpoint: string): EndpointRecommendation {
  return {
    endpoint,
    occurrence_count: 0,
    success_rate: null, // No trial-outcome data for an AI-suggested endpoint — do not fabricate a rate
    evidence: [
      {
        source_id: 'ai-generated',
        source_type: 'language_model',
        title: 'AI-based recommendation',
        reference_text: 'Proposed by a language model; not matched to any CSR, literature or guidance evidence',
        confidence: null,
      },
    ],
    is_primary: true,
    similar_endpoints: [],
  };
}

const SOURCE_LABEL: Record<EndpointSourceName, string> = {
  csr_corpus: 'CSR corpus',
  academic_literature: 'literature search',
  regulatory_guidance: 'regulatory guidance',
  language_model: 'language model',
};

const STATUS_LABEL: Record<EndpointSourceStatus['status'], string> = {
  read: 'read',
  no_matches: 'no matches',
  unavailable: 'unavailable',
  not_queried: 'not queried',
};

const BASIS_LABEL: Record<EndpointEvidenceBasis, string> = {
  regulatory_recommended: 'backed by regulatory guidance',
  corpus_outcomes: 'backed by CSR outcome data',
  corpus_frequency: 'seen in the CSR corpus',
  academic_literature: 'drawn from the literature',
  ai_suggested: 'proposed by a language model with no corpus evidence',
};

/** How many recommendations rest on which basis, and what each source returned. Deterministic. */
export function summarizeEndpointRecommendations(
  result: EndpointRecommendationResult,
  subject: string
): string {
  const byBasis = new Map<EndpointEvidenceBasis, number>();
  for (const rec of result.recommendations) {
    const basis = rec.evidence_basis ?? classifyEndpointBasis(rec);
    byBasis.set(basis, (byBasis.get(basis) ?? 0) + 1);
  }
  const breakdown = [...byBasis].map(([basis, n]) => `${n} ${BASIS_LABEL[basis]}`).join(', ');
  const sources = (Object.keys(SOURCE_LABEL) as EndpointSourceName[])
    .map((name) => {
      const { status, detail } = result.sources[name];
      return `${SOURCE_LABEL[name]} ${STATUS_LABEL[status]}${detail ? ` (${detail})` : ''}`;
    })
    .join('; ');
  const count = result.recommendations.length;
  const head =
    count > 0
      ? `${count} endpoint recommendation(s) for ${subject}: ${breakdown}`
      : `No endpoint recommendations for ${subject}`;
  return `${head}. Sources: ${sources}.`;
}

/** An evaluation in words: no score, the model's commentary marked as such, and the CSR precedent. */
export function describeEndpointEvaluation(evaluation: EndpointEvaluation, indication: string): string {
  let precedent: string;
  if (evaluation.similarEndpoints === null) {
    precedent =
      'CSR precedent was not compared: the endpoint has no word longer than three letters to match on.';
  } else if (evaluation.similarEndpoints.length === 0) {
    precedent = `No primary endpoint recorded in CSRs for ${indication} shares a word with it.`;
  } else {
    const listed = evaluation.similarEndpoints.join('; ');
    precedent = `Primary endpoints recorded in CSRs for ${indication} that share a word with it: ${listed}.`;
  }
  return (
    'Not scored: no deterministic endpoint-quality rubric exists, ' +
    'and a number from a language model would not be one. ' +
    `Language-model commentary: ${evaluation.feedback} ${precedent}`
  );
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
   * Get comprehensive endpoint recommendations based on indication and phase:
   * the recommendations with their evidence, and what each source returned.
   * The CSR corpus read is the calling organization's.
   * Throws EndpointCorpusUnavailableError when the CSR corpus cannot be read.
   */
  async getComprehensiveEndpointRecommendations(
    organizationId: number,
    indication: string,
    phase: string = '',
    count: number = 5,
    therapeuticArea: string = ''
  ): Promise<EndpointRecommendationResult> {
    logger.info(`Generating comprehensive recommendations for ${indication} (${phase || 'any phase'})`);

    // Step 1: the CSR corpus. 2026-10-15: this step and each one below caught its own
    // failure and returned an empty list. An unreadable corpus read as "no CSR precedent",
    // the model filled the gap, and the caller got HTTP 200 (an empty list if every step
    // failed). A failed corpus read now refuses the answer; the other sources report
    // their failures in `sources`.
    let corpus: CorpusRead;
    try {
      corpus = await this.getEndpointsWithEvidence(organizationId, indication, phase);
    } catch (error) {
      logger.error('CSR endpoint corpus read failed', { error });
      throw new EndpointCorpusUnavailableError({ cause: error });
    }

    // Step 2: academic literature (an empty store is no source, not "no literature").
    // Step 3: regulatory guidance.
    const literatureLoaded = this.academicProcessor.getRecentlyProcessedDocuments(1).length > 0;
    const academic: SourceRead<EndpointRecommendation[]> = literatureLoaded
      ? await readSource('literature search', () =>
          this.getAcademicEndpointGuidance(indication, phase, therapeuticArea)
        )
      : { ok: false };
    const regulatory = await readSource('regulatory guidance lookup', () =>
      this.getRegulatoryGuidance(indication, phase)
    );

    // Step 4: Combine and rank all recommendations
    const combinedEndpoints = this.combineEndpointSources(
      corpus.endpoints,
      academic.ok ? academic.value : [],
      regulatory.ok ? regulatory.value : {}
    );

    // Step 5: If not enough recommendations, ask the model for more
    const languageModel = await this.addModelSuggestions(combinedEndpoints, indication, phase, count);

    // Attach an honest evidence_basis + evidence_strength to each recommendation and
    // rank by that real signal (regulatory backing, corpus recurrence, corroboration)
    // instead of a fabricated success rate.
    const normalized = combinedEndpoints.map(normalizeEndpointEvidence);
    normalized.sort((a, b) => (b.evidence_strength ?? 0) - (a.evidence_strength ?? 0));
    return {
      recommendations: normalized.slice(0, count),
      sources: {
        csr_corpus: corpus.status,
        academic_literature: literatureStatus(literatureLoaded, academic),
        regulatory_guidance: this.regulatoryGuidanceStatus(regulatory),
        language_model: languageModel,
      },
    };
  }

  /** Fill up to `count` with endpoints a language model proposes; returns what the model source did. */
  private async addModelSuggestions(
    combined: EndpointRecommendation[],
    indication: string,
    phase: string,
    count: number
  ): Promise<EndpointSourceStatus> {
    if (combined.length >= count) {
      return { status: 'not_queried', detail: 'the other sources supplied the recommendations requested' };
    }
    const suggested = await readSource('language model request', () =>
      this.getAIGeneratedEndpoints(indication, phase, count - combined.length)
    );
    if (!suggested.ok) {
      return {
        status: 'unavailable',
        detail: 'the language model request failed, or its reply was not a list of endpoints',
      };
    }
    for (const endpoint of suggested.value) {
      if (!combined.some(e => e.endpoint.toLowerCase() === endpoint.toLowerCase())) {
        combined.push(modelSuggestion(endpoint));
      }
    }
    return { status: 'read', detail: null };
  }

  /** What the regulatory guidance source returned. An empty cache is no source, not "no guidance". */
  private regulatoryGuidanceStatus(
    read: SourceRead<Record<string, RegulatoryGuidance[]>>
  ): EndpointSourceStatus {
    if (!read.ok) {
      return { status: 'unavailable', detail: 'the regulatory guidance lookup failed' };
    }
    if (this.regulatoryGuidanceCache.size === 0) {
      return { status: 'unavailable', detail: 'no regulatory guidance source is loaded' };
    }
    return foundStatus(Object.keys(read.value).length);
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

      // Then prefer more evidence items (combined CSR + academic). 2026-10-15: this summed
      // each item's `confidence`, a constant per source type that no computation produced.
      if (a.evidence.length !== b.evidence.length) {
        return b.evidence.length - a.evidence.length;
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

    // Collect academic knowledge results for all search terms. 2026-10-15: a failed
    // search was logged ("Generating local response from CSR data...", which generated
    // nothing) and skipped, and any other error returned [], so a literature outage read
    // as "no literature". A failure now throws; the caller reports the source unavailable.
    const academicResults: AcademicSearchResult[] = [];
    for (const searchTerm of searchTerms) {
      academicResults.push(...(await this.academicProcessor.searchAcademicKnowledge(searchTerm, 5)));
    }

    // Process and extract endpoints from academic results
    const academicEndpoints = new Map<string, EndpointRecommendation>();

    for (const result of academicResults) {
      const endpoints = this.extractEndpointsFromAcademicText(
        result.context || result.summary || '',
        indication
      );

      for (const endpoint of endpoints) {
        const key = endpoint.toLowerCase();
        const existing = academicEndpoints.get(key);
        if (!existing) {
          academicEndpoints.set(key, {
            endpoint: endpoint,
            occurrence_count: 1,
            success_rate: null, // Literature mention is not a trial-outcome rate — do not fabricate
            evidence: [literatureEvidence(result)],
            academic_references: [literatureReference(result)],
            is_primary: key.includes('primary') || !key.includes('secondary'),
          });
          continue;
        }
        // Update existing endpoint with additional evidence
        existing.occurrence_count += 1;
        existing.evidence.push(literatureEvidence(result));
        existing.academic_references = [...(existing.academic_references ?? []), literatureReference(result)];
      }
    }

    return Array.from(academicEndpoints.values());
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
              date: item.date ?? undefined, // WO-16C 48: no date rather than a stamped '2023'
              url: item.url || undefined,
            });
          }

          foundGuidance = true;
        }
      }

      // WO-16C finding 48. What stood here asked a language model to write the
      // regulatory guidance — `{authority, document_name, guidance_text}`,
      // primed with two real FDA and EMA titles as the example format — and
      // returned whatever came back, unverified, as this service's
      // `regulatory_guidance`. Two things made that worse than an unlucky
      // fallback:
      //
      //   - it was not a fallback. `loadRegulatoryGuidance` (line 219) caches a
      //     file only if its parsed content has `.indication` and an array
      //     `.guidance`; both files under `regulatory_data/` are top-level
      //     arrays, so the cache is never written, `foundGuidance` is always
      //     false, and the generated branch was the only source this service
      //     had;
      //   - the array is load-bearing. `classifyEndpointBasis` (line 104)
      //     returns 'regulatory_recommended' — the highest basis, base strength
      //     80 — for any endpoint with a non-empty `regulatory_guidance`, so an
      //     invented citation outranked endpoints backed by the real corpus.
      //
      // No guidance retrieved now means no guidance returned. An endpoint then
      // falls to the basis its real evidence earns. Wiring this to a retrieval
      // source that can actually be cited is separate work; inventing one is
      // not a substitute for it.
      if (!foundGuidance) {
        logger.info(
          `No regulatory guidance retrieved for ${indication}${phase ? ` (${phase})` : ''}; returning none`,
        );
      }

      return result;
    } catch (error) {
      // 2026-10-15: returned {} here, so a failed lookup read as "no guidance issued".
      logger.error('Error getting regulatory guidance:', { error: error });
      throw error;
    }
  }

  /**
   * Read the organization's CSR corpus: the endpoints recorded for the reports that
   * match the indication (and phase), with how many reports record each. Throws when
   * the read fails; the caller refuses the recommendation rather than answer without it.
   */
  private async getEndpointsWithEvidence(
    organizationId: number,
    indication: string,
    phase: string = ''
  ): Promise<CorpusRead> {
    // 2026-10-15: no organization predicate; the read relied on RLS alone, so where
    // RLS was not enforcing, another organization's reports counted as precedent.
    const conditions = [
      eq(csrReports.organizationId, organizationId),
      like(csrReports.indication, `%${indication}%`),
    ];
    if (phase && phase !== 'any') {
      conditions.push(like(csrReports.phase, `%${phase}%`));
    }

    // One row past the limit tells a bounded read from a complete one; ordered by id
    // so the same request reads the same reports.
    const matched = await db
      .select({
        id: csrReports.id,
        title: csrReports.title,
        sponsor: csrReports.sponsor,
        phase: csrReports.phase,
      })
      .from(csrReports)
      .where(and(...conditions))
      .orderBy(csrReports.id)
      .limit(CORPUS_REPORT_LIMIT + 1);

    if (matched.length === 0) {
      return { endpoints: [], status: { status: 'no_matches', detail: null } };
    }
    const reports = matched.slice(0, CORPUS_REPORT_LIMIT);
    const reportById = new Map(reports.map(report => [report.id, report]));

    // 2026-10-15: this was sql`report_id IN (${ids.join(',')})`, one bound text parameter
    // ('1,2,3') against an integer column. Postgres refuses that ("invalid input syntax
    // for type integer") whenever two or more reports match, and the catch returned [].
    const details = await db
      .select({ reportId: csrDetails.reportId, endpoints: csrDetails.endpoints })
      .from(csrDetails)
      .where(inArray(csrDetails.reportId, [...reportById.keys()]))
      .orderBy(csrDetails.reportId, csrDetails.id);

    // Each endpoint counted once per report that records it, primary if any report
    // records it as primary. (csr_reports has no outcome column, so no success rate.)
    const tallies = new Map<string, { isPrimary: boolean; reports: typeof reports }>();
    const recording = new Set<number>();
    for (const detail of details) {
      const report = reportById.get(detail.reportId);
      if (!report) continue;
      const primary = endpointGroup(detail.endpoints, 'primary');
      const secondary = endpointGroup(detail.endpoints, 'secondary').filter(e => !primary.includes(e));
      for (const endpoint of [...primary, ...secondary]) {
        const tally = tallies.get(endpoint) ?? { isPrimary: false, reports: [] };
        tally.isPrimary = tally.isPrimary || primary.includes(endpoint);
        if (!tally.reports.includes(report)) tally.reports.push(report);
        tallies.set(endpoint, tally);
        recording.add(report.id);
      }
    }

    const endpoints = Array.from(tallies, ([endpoint, tally]): EndpointRecommendation => ({
      endpoint,
      occurrence_count: tally.reports.length,
      success_rate: null,
      evidence: tally.reports.slice(0, 3).map(csrEvidence),
      is_primary: tally.isPrimary,
      similar_endpoints: [],
    })).sort(
      (a, b) => Number(b.is_primary) - Number(a.is_primary) || b.occurrence_count - a.occurrence_count
    );

    const covered =
      matched.length > CORPUS_REPORT_LIMIT
        ? `the first ${CORPUS_REPORT_LIMIT} by id of more than ${CORPUS_REPORT_LIMIT} matching CSR reports`
        : `${reports.length} matching CSR report(s)`;
    return {
      endpoints,
      status: { status: 'read', detail: `${covered}, ${recording.size} with endpoints recorded` },
    };
  }

  /**
   * Endpoints a language model proposes. Throws when the request fails or the reply is
   * not a JSON array of endpoint names. 2026-10-15: a failed request returned [], which
   * read as "the model proposed nothing"; a reply that was not a JSON array was split
   * into lines, then quotes, and each fragment came back as a suggested endpoint.
   */
  private async getAIGeneratedEndpoints(
    indication: string,
    phase: string = '',
    count: number = 5
  ): Promise<string[]> {
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

    const response = await this.hfService.queryHuggingFace(prompt);
    const jsonMatch = response.match(/\[.*\]/s);
    const endpoints: unknown = jsonMatch ? JSON.parse(jsonMatch[0]) : null;
    if (!Array.isArray(endpoints)) {
      throw new Error('The language model reply was not a JSON array of endpoint names');
    }
    return endpoints
      .filter((endpoint): endpoint is string => typeof endpoint === 'string')
      .map(endpoint => endpoint.trim())
      .filter(Boolean)
      .slice(0, count);
  }

  /**
   * Comment on an endpoint: a language model narrates, and the CSR corpus supplies
   * precedent. 2026-10-15: the model was asked for "score: A number from 0-100
   * representing quality", with no rubric and no range check, and the AnA command
   * reported it as "scored N/100" (CLAUDE.md Rule 2: a tool that asks a model for a
   * figure is a defect). No deterministic endpoint-quality rubric exists, so `score` is
   * null. A failed model request or corpus read now throws; before, each came back as
   * a successful evaluation with error text as its feedback.
   */
  async evaluateEndpoint(
    organizationId: number,
    endpoint: string,
    indication: string,
    phase: string = ''
  ): Promise<EndpointEvaluation> {
    const prompt = `
Comment on this clinical trial endpoint for a ${phase || 'clinical'} trial in ${indication}:
"${endpoint}"

Address:
1. Specificity and measurability
2. Clinical relevance
3. Appropriateness for ${phase || 'clinical'} trials
4. Standard practices for ${indication}
5. Statistical considerations

Answer in plain prose. Do not give a score, rating, grade, probability or overall verdict.
`;

    const feedback = (await this.hfService.queryHuggingFace(prompt)).trim();
    const similarEndpoints = await this.getSimilarEndpoints(organizationId, endpoint, indication, 3);
    return { score: null, feedback, similarEndpoints };
  }

  /**
   * Primary endpoints recorded in the organization's CSRs for the indication that share
   * a word longer than three letters with this endpoint. null when it has no such word:
   * nothing was compared. Throws when the corpus read fails.
   */
  private async getSimilarEndpoints(
    organizationId: number,
    endpoint: string,
    indication: string,
    limit: number = 3
  ): Promise<string[] | null> {
    const keywords = endpoint
      .toLowerCase()
      .replace(/[^\w\s]/g, '')
      .split(/\s+/)
      .filter(word => word.length > 3);

    if (keywords.length === 0) {
      return null;
    }

    // 2026-10-15: this selected jsonb_array_elements_text(endpoints->>'primary'), a jsonb
    // function over the text that ->> reads from a json column. Postgres refuses it, and
    // the catch returned [], so every evaluation reported no similar CSR endpoint without
    // reading one. It also matched only the first limit*3 rows.
    const rows = await db
      .select({ endpoints: csrDetails.endpoints })
      .from(csrDetails)
      .innerJoin(csrReports, eq(csrDetails.reportId, csrReports.id))
      // 2026-10-15: no organization predicate (RLS alone); see getEndpointsWithEvidence.
      .where(and(eq(csrReports.organizationId, organizationId), like(csrReports.indication, `%${indication}%`)))
      .orderBy(csrDetails.id);

    const similar: string[] = [];
    for (const row of rows) {
      for (const text of endpointGroup(row.endpoints, 'primary')) {
        const lower = text.toLowerCase();
        const isNew = !similar.some(s => s.toLowerCase() === lower);
        if (similar.length < limit && isNew && keywords.some(keyword => lower.includes(keyword))) {
          similar.push(text);
        }
      }
    }
    return similar;
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
