/**
 * Unified evidence provenance envelope.
 *
 * Every piece of evidence AnA surfaces — a curated-corpus entry, a ChEMBL
 * molecule, a PubMed article, a bioRxiv preprint, a deterministic computation —
 * should carry the SAME provenance shape so the answer can be cited and audited
 * uniformly. This module is that single shape plus a registry of the platform's
 * evidence sources and their intrinsic characteristics (type, peer-review
 * status, freshness, authority tier).
 *
 * It is the in-flight complement to two existing layers, and is deliberately
 * aligned with both so nothing has to be reconciled later:
 *  - `server/services/stats/computation-provenance.ts` — reproducibility for
 *    stochastic computation (engine/seed/inputs-hash).
 *  - `data_lineage_records` (shared/schema.ts) — the 21 CFR Part 11 / ICH E6(R3)
 *    persistence table. `lineageObjectType` and `confidenceBasis` here use that
 *    table's vocabulary, and `toLineageSource()` maps a record onto its SOURCE
 *    columns so persistence is a field copy, not a translation.
 *
 * This module is pure and dependency-free (a clock is injectable for tests).
 *
 * @module server/services/evidence/provenance
 */

/** Broad evidence category — drives how a result should be read and cited. */
export type EvidenceSourceType =
  | 'curated_corpus'
  | 'literature'
  | 'preprint'
  | 'clinical_trial_registry'
  | 'compound_database'
  | 'regulatory_database'
  | 'coverage_database'
  | 'terminology'
  | 'computation'
  | 'web'
  | 'connected_repository';

/** How the evidence was obtained. */
export type RetrievalMethod = 'api' | 'deterministic' | 'corpus_lookup' | 'web_scrape';

/** Basis for any confidence assertion — mirrors data_lineage_records.confidenceBasis. */
export type ConfidenceBasis = 'rules_based' | 'validation_based' | 'ai_inferred' | 'curated';

/** Authority tier for ranking competing evidence (primary outranks preliminary). */
export type AuthorityTier = 'primary' | 'secondary' | 'preliminary';

export type ConfidenceLevel = 'high' | 'moderate' | 'low';

/** Intrinsic, source-level characteristics (independent of any single result). */
export interface EvidenceSource {
  id: string;
  label: string;
  type: EvidenceSourceType;
  retrievalMethod: RetrievalMethod;
  /** true peer-reviewed, false not peer-reviewed, null = not applicable (registry/database/computation). */
  peerReviewed: boolean | null;
  freshness: 'live' | 'curated' | 'static';
  authority: AuthorityTier;
  confidenceBasis: ConfidenceBasis;
  /** Maps onto data_lineage_records.sourceObjectType for persistence. */
  lineageObjectType: string;
  /** Caveat always attached to evidence from this source. */
  defaultCaveat?: string;
}

export interface Citation {
  title: string;
  /** DOI / NCT / ChEMBL ID / corpus id / application number — the stable handle. */
  identifier: string | null;
  url: string | null;
}

/** The single provenance envelope carried by every evidence item AnA surfaces. */
export interface ProvenanceRecord {
  sourceId: string;
  sourceLabel: string;
  sourceType: EvidenceSourceType;
  retrievalMethod: RetrievalMethod;
  peerReviewed: boolean | null;
  authority: AuthorityTier;
  /** The query/input that produced this result, when applicable. */
  query: string | null;
  /** ISO timestamp the evidence was retrieved/produced. */
  retrievedAt: string;
  citation: Citation;
  confidence: ConfidenceLevel | null;
  confidenceBasis: ConfidenceBasis;
  caveats: string[];
  /** data_lineage_records.sourceObjectType value for this source. */
  lineageObjectType: string;
}

const PREPRINT_CAVEAT = 'Not peer-reviewed — preliminary; corroborate with peer-reviewed literature.';
const COMPUTATION_CAVEAT = 'Deterministic screen/estimate — confirm with a qualified method and expert review.';
const WEB_CAVEAT = 'Open-web source — verify against an authoritative primary source before relying on it.';

/**
 * The platform's evidence sources. Keys are the stable ids tools pass to
 * `buildProvenance`. Adding a source here is how a new connector becomes
 * citable/auditable through the unified envelope.
 */
export const EVIDENCE_SOURCES: Record<string, EvidenceSource> = {
  ivd_corpus: {
    id: 'ivd_corpus',
    label: 'Concept2Cure curated knowledge corpus',
    type: 'curated_corpus',
    retrievalMethod: 'corpus_lookup',
    peerReviewed: null,
    freshness: 'curated',
    authority: 'secondary',
    confidenceBasis: 'curated',
    lineageObjectType: 'atom',
  },
  project_corpus: {
    id: 'project_corpus',
    label: 'Project knowledge corpus (RAG)',
    type: 'curated_corpus',
    retrievalMethod: 'corpus_lookup',
    peerReviewed: null,
    freshness: 'curated',
    authority: 'secondary',
    confidenceBasis: 'validation_based',
    lineageObjectType: 'retrieval_chunk',
  },
  c2c_cheminformatics: {
    id: 'c2c_cheminformatics',
    label: 'Concept2Cure cheminformatics (deterministic)',
    type: 'computation',
    retrievalMethod: 'deterministic',
    peerReviewed: null,
    freshness: 'live',
    authority: 'secondary',
    confidenceBasis: 'rules_based',
    lineageObjectType: 'computation',
    defaultCaveat: COMPUTATION_CAVEAT,
  },
  pubmed: {
    id: 'pubmed',
    label: 'PubMed / MEDLINE',
    type: 'literature',
    retrievalMethod: 'api',
    peerReviewed: true,
    freshness: 'live',
    authority: 'primary',
    confidenceBasis: 'validation_based',
    lineageObjectType: 'external_evidence',
  },
  biorxiv_medrxiv: {
    id: 'biorxiv_medrxiv',
    label: 'bioRxiv / medRxiv (preprints)',
    type: 'preprint',
    retrievalMethod: 'api',
    peerReviewed: false,
    freshness: 'live',
    authority: 'preliminary',
    confidenceBasis: 'ai_inferred',
    lineageObjectType: 'external_evidence',
    defaultCaveat: PREPRINT_CAVEAT,
  },
  chembl: {
    id: 'chembl',
    label: 'ChEMBL (EMBL-EBI)',
    type: 'compound_database',
    retrievalMethod: 'api',
    peerReviewed: null,
    freshness: 'curated',
    authority: 'primary',
    confidenceBasis: 'curated',
    lineageObjectType: 'external_evidence',
  },
  clinicaltrials: {
    id: 'clinicaltrials',
    label: 'ClinicalTrials.gov',
    type: 'clinical_trial_registry',
    retrievalMethod: 'api',
    peerReviewed: null,
    freshness: 'live',
    authority: 'primary',
    confidenceBasis: 'validation_based',
    lineageObjectType: 'external_evidence',
  },
  openfda: {
    id: 'openfda',
    label: 'FDA openFDA',
    type: 'regulatory_database',
    retrievalMethod: 'api',
    peerReviewed: null,
    freshness: 'live',
    authority: 'primary',
    confidenceBasis: 'validation_based',
    lineageObjectType: 'external_evidence',
  },
  cms_coverage: {
    id: 'cms_coverage',
    label: 'CMS Medicare Coverage Database',
    type: 'coverage_database',
    retrievalMethod: 'api',
    peerReviewed: null,
    freshness: 'live',
    authority: 'primary',
    confidenceBasis: 'validation_based',
    lineageObjectType: 'external_evidence',
  },
  icd10: {
    id: 'icd10',
    label: 'ICD-10-CM (NLM Clinical Tables)',
    type: 'terminology',
    retrievalMethod: 'api',
    peerReviewed: null,
    freshness: 'live',
    authority: 'primary',
    confidenceBasis: 'validation_based',
    lineageObjectType: 'external_evidence',
  },
  firecrawl: {
    id: 'firecrawl',
    label: 'Web (Firecrawl)',
    type: 'web',
    retrievalMethod: 'web_scrape',
    peerReviewed: false,
    freshness: 'live',
    authority: 'preliminary',
    confidenceBasis: 'ai_inferred',
    lineageObjectType: 'external_evidence',
    defaultCaveat: WEB_CAVEAT,
  },
  connected_repository: {
    id: 'connected_repository',
    label: 'Connected document repository',
    type: 'connected_repository',
    retrievalMethod: 'api',
    peerReviewed: null,
    freshness: 'live',
    authority: 'secondary',
    confidenceBasis: 'validation_based',
    lineageObjectType: 'document',
  },
};

/** Look up a registered evidence source by id. */
export function getEvidenceSource(id: string): EvidenceSource | undefined {
  return EVIDENCE_SOURCES[id];
}

export interface BuildProvenanceArgs {
  sourceId: string;
  citation: Citation;
  query?: string | null;
  confidence?: ConfidenceLevel | null;
  /** Caveats to add on top of the source's default caveat (deduped). */
  extraCaveats?: string[];
  /** Injectable clock for deterministic tests. */
  now?: () => Date;
}

/**
 * Build a provenance record for one evidence item from a registered source.
 * Source-level facts (type, peer-review, method, authority, lineage type,
 * default caveat) come from the registry; per-item facts (citation, query,
 * confidence, extra caveats) are supplied by the caller. Throws on an unknown
 * source id so a typo can't silently produce un-attributable evidence.
 */
export function buildProvenance(args: BuildProvenanceArgs): ProvenanceRecord {
  const source = EVIDENCE_SOURCES[args.sourceId];
  if (!source) {
    throw new Error(`Unknown evidence source "${args.sourceId}" — register it in EVIDENCE_SOURCES.`);
  }
  const caveats = dedupe([
    ...(source.defaultCaveat ? [source.defaultCaveat] : []),
    ...(args.extraCaveats ?? []),
  ]);
  const clock = args.now ?? (() => new Date());
  return {
    sourceId: source.id,
    sourceLabel: source.label,
    sourceType: source.type,
    retrievalMethod: source.retrievalMethod,
    peerReviewed: source.peerReviewed,
    authority: source.authority,
    query: args.query ?? null,
    retrievedAt: clock().toISOString(),
    citation: args.citation,
    confidence: args.confidence ?? null,
    confidenceBasis: source.confidenceBasis,
    caveats,
    lineageObjectType: source.lineageObjectType,
  };
}

const AUTHORITY_RANK: Record<AuthorityTier, number> = { primary: 0, secondary: 1, preliminary: 2 };

/**
 * Stable sort of provenance records by authority (primary first, preliminary
 * last). Order within a tier is preserved, so the caller's relevance ordering
 * survives inside each tier.
 */
export function rankByAuthority(records: ProvenanceRecord[]): ProvenanceRecord[] {
  return records
    .map((r, i) => ({ r, i }))
    .sort((a, b) => AUTHORITY_RANK[a.r.authority] - AUTHORITY_RANK[b.r.authority] || a.i - b.i)
    .map(({ r }) => r);
}

/** Shape consumed by the data_lineage_records SOURCE columns. */
export interface LineageSourceInput {
  sourceObjectType: string;
  sourceObjectId: string;
  sourceTitle: string;
  confidenceBasis: ConfidenceBasis;
  confidenceScore: number | null;
}

const CONFIDENCE_SCORE: Record<ConfidenceLevel, number> = { high: 90, moderate: 60, low: 30 };

/**
 * Project a provenance record onto the SOURCE columns of data_lineage_records,
 * so persisting a citation is a field copy. `sourceObjectId` falls back to the
 * citation url when no stable identifier is present.
 */
export function toLineageSource(record: ProvenanceRecord): LineageSourceInput {
  return {
    sourceObjectType: record.lineageObjectType,
    sourceObjectId: record.citation.identifier ?? record.citation.url ?? record.sourceId,
    sourceTitle: record.citation.title,
    confidenceBasis: record.confidenceBasis,
    confidenceScore: record.confidence ? CONFIDENCE_SCORE[record.confidence] : null,
  };
}

function dedupe(items: string[]): string[] {
  return [...new Set(items.filter(Boolean))];
}

/**
 * Map a 0..1 retrieval/relevance score to a confidence level for provenance.
 * Used by RAG-backed tools where the score is a relevance judgement, not a
 * validated probability. Returns null when no score is available.
 */
export function confidenceFromScore(score: number | null | undefined): ConfidenceLevel | null {
  if (score == null || !Number.isFinite(score)) return null;
  if (score >= 0.8) return 'high';
  if (score >= 0.6) return 'moderate';
  return 'low';
}
