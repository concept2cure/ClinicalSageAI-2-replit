/**
 * @fileoverview Clinical-Regulatory Intelligence Graph — shared evidence contracts.
 * @module server/services/clinical-regulatory-evidence/types
 *
 * Phase 1 of the Clinical-Regulatory Intelligence Graph work order: the typed
 * spine that CSR intelligence, FDA CRL intelligence, study design and AnA all
 * read. See docs/architecture/CLINICAL_REGULATORY_INTELLIGENCE_GRAPH_DISCOVERY.md.
 *
 * The architecture invariant these types encode:
 *
 *   proposed design → executed study → observed result → regulatory review
 *   finding → outcome → governed, traceable design lesson
 *
 * ── Why these shapes look the way they do ──────────────────────────────────
 *
 * Every unusual-looking decision below is a work-order requirement, not a
 * stylistic choice. The four that drive the most structure:
 *
 * 1. EPISTEMIC STATUS IS A COLUMN, NOT A FLAVOUR (§7.2). A source-explicit CTD
 *    section is a *fact*; a semantic mapping inferred from letter text is a
 *    *model output*. They are stored and rendered separately and the DTO is
 *    deliberately unable to represent a merged value — there is no code path
 *    that can display an inferred mapping as if FDA explicitly made it.
 *
 * 2. COUNTS CARRY DENOMINATORS (§8.1). {@link CoverageRecord} is reported, never
 *    inferred, and never collapses to a percentage. "18 of 31" survives to the
 *    UI intact.
 *
 * 3. NOT EVERY FINDING BELONGS TO A STUDY (§6.2). {@link Applicability} exists
 *    because many CRL findings are application-, facility-, CMC- or
 *    labeling-level. Forcing them onto a clinical study would be a fabrication.
 *
 * 4. NO CONFIDENCE WITHOUT A METHOD (§10.1). There is no bare `confidence:
 *    number` anywhere in this file. Where a derived value exists it carries the
 *    method that produced it ({@link CalculationRecord}).
 *
 * These types are the server DTO. The client view-model that mirrors them is
 * client/src/concept2cure/v2/fixtures/clinical-regulatory-evidence.ts — keep the
 * two in step; the nullability in particular is load-bearing on both sides.
 */

// ─── Epistemic and verification vocabulary ───────────────────────────────────

/**
 * Whether a mapping or link came from the source document itself or from a
 * model reading it. §7.2 — never merge these.
 */
export type EpistemicStatus = 'explicit' | 'inferred';

/**
 * The seven display states of work order §13.2. Every finding and observation
 * carries exactly one, and the UI renders it per-item — a verification state
 * that is not visible has not been communicated.
 */
export type VerificationState =
  | 'source_verified'
  | 'extracted_unreviewed'
  | 'inferred_mapping'
  | 'potential_study_link'
  | 'insufficient_evidence'
  | 'stale_recalculate';

/**
 * What a finding actually applies to (§6.2). `study` is the *narrowest* case,
 * not the default — defaulting to it is the specific error this type prevents.
 */
export type Applicability =
  | 'study'
  | 'application'
  | 'facility'
  | 'product'
  | 'cmc'
  | 'labeling'
  | 'unknown';

/** FDA review disciplines (§7.1). */
export type Discipline =
  | 'clinical'
  | 'statistical'
  | 'safety'
  | 'clinical_pharmacology'
  | 'cmc'
  | 'microbiology'
  | 'device'
  | 'labeling'
  | 'facility'
  | 'administrative';

/** Finding severity as recorded in the letter, not as scored by a model. */
export type FindingSeverity = 'critical' | 'high' | 'medium' | 'low';

/**
 * A verified regulatory outcome. §4.2 and §9 of the work order: this is NEVER
 * derived from trial status. A completed trial is not an approval, and the type
 * system should not let anyone pretend otherwise — see `statusToOutcome` in
 * corpus/precedent-benchmark-reader.ts for the conflation this replaces.
 */
export type RegulatoryOutcomeKind =
  | 'crl'
  | 'resubmission'
  | 'approval'
  | 'withdrawal'
  | 'unresolved';

/**
 * Visibility class (§14). Public FDA evidence is global; anything derived from
 * a tenant's private evidence inherits that tenant's privacy.
 */
export type EvidenceVisibility = 'public' | 'tenant_private' | 'project_private';

// ─── Source identity ─────────────────────────────────────────────────────────

/**
 * Where a fact came from, precisely enough to reopen it. Release gate: every
 * displayed finding resolves to an official source and a page/location.
 */
export interface SourceRef {
  sourceId: string;
  /** NDA | BLA | ANDA | 510(k) | … */
  applicationType: string;
  applicationNumber: string;
  letterDate: string | null;
  page: number | null;
  /** Sub-page locator, e.g. "¶2". */
  locator: string | null;
  /**
   * Minimal verbatim excerpt. NEVER a paraphrase — a paraphrase of a regulator's
   * words attributed to the regulator is a fabrication. Null when the span is
   * not cleanly extractable, which is an honest answer.
   */
  excerpt: string | null;
  officialUrl: string | null;
  checksum: string | null;
  version: number | null;
  visibility: EvidenceVisibility;
}

// ─── Coverage ────────────────────────────────────────────────────────────────

/**
 * §8.1 — corpus coverage, reported and never inferred. The narrowing is
 * monotonic: scanned ≥ eligible ≥ structured ≥ verified ≥ cited. Anything that
 * displays one of these numbers displays its denominator with it.
 */
export interface CoverageRecord {
  scanned: number;
  eligible: number;
  structured: number;
  verified: number;
  cited: number;
  /** Why the excluded ones are excluded, in plain words. Null when nothing was excluded. */
  exclusionNote: string | null;
  /** Corpus snapshot date — drives the `stale_recalculate` state. */
  freshness: string | null;
}

/**
 * The honest alternative to a softened answer (§10.1). A tool that cannot ground
 * a claim returns this instead of estimating. `usable` / `total` are mandatory:
 * "insufficient evidence" without a denominator is just a shrug.
 */
export interface InsufficientEvidence {
  reason: string;
  usable: number;
  total: number;
}

// ─── Mappings ────────────────────────────────────────────────────────────────

/**
 * A finding's location in platform semantics (§7.1). Findings map into the
 * EXISTING vocabularies — ana-ri/deficiency-taxonomy.ts, CTD modules, the ICH E3
 * sections in clinical-intelligence-service.ts, and StudyDesign node types.
 * There is deliberately no standalone CRL taxonomy.
 */
export interface EvidenceMapping {
  kind: 'ctd' | 'ich_e3' | 'design_node' | 'deficiency';
  /** "2.7.3" · "§11" · "endpoint" · "endpoint validity" */
  value: string;
  /** Drives solid vs italic rendering. Explicit is a fact; inferred is a model output. */
  status: EpistemicStatus;
}

// ─── Findings, outcomes, observations ────────────────────────────────────────

/**
 * One FDA finding, resolvable to source and page.
 *
 * NOTE: this is the resolved *domain contract* (the retrieval/facade view). The
 * evidence-graph persistence-row shape lives below as `RegulatoryFinding`; the
 * two workstreams landed independently and both are kept (nothing dropped).
 * This one is renamed `Resolved*` to end the duplicate-identifier collision.
 */
export interface ResolvedRegulatoryFinding {
  findingId: string;
  severity: FindingSeverity;
  discipline: Discipline;
  /** Normalized issue type: "endpoint validity", "multiplicity", … (§7.1). */
  category: string;
  finding: string;
  requestedAction: string | null;
  applicability: Applicability;
  epistemicStatus: EpistemicStatus;
  verification: VerificationState;
  reviewedAt: string | null;
  /**
   * True when the deterministic parse and the model extraction disagree (§6.1
   * step 8). A conflicted finding is blocked from retrieval, indexing AND
   * export until a human resolves it — enforced in the retrieval adapter, not
   * only in the UI, so it cannot be styled away.
   */
  conflict: boolean;
  mappings: EvidenceMapping[];
  source: SourceRef;
}

/** A verified application outcome. Only ever recorded, never inferred (§4.2).
 *  Resolved domain-contract view; the persistence-row `RegulatoryOutcome` is below. */
export interface ResolvedRegulatoryOutcome {
  applicationType: string;
  applicationNumber: string;
  letterDate: string | null;
  outcome: RegulatoryOutcomeKind;
  resubmissionState: string | null;
  /** Study linkage carries its own epistemic status — an inferred link is labelled. */
  studyLink: { nctId: string | null; status: EpistemicStatus } | null;
  verifiedAt: string | null;
}

/**
 * One structured endpoint result. Admitted to a prior only when it carries an
 * effect AND its uncertainty — the honesty contract already held by
 * study-design/csr-evidence-source.ts, generalized (§5.3).
 */
export interface ResolvedStudyResultObservation {
  observationId: string;
  endpoint: string;
  population: string;
  effectMeasure: string;
  value: number | null;
  se: number | null;
  ci: [number, number] | null;
  pValue: number | null;
  n: number | null;
  timepoint: string | null;
  /** Recorded, never silently applied. A transformation the reader can't see is a lie by omission. */
  transformations: string[];
  benefitDirectionNormalized: boolean;
  method: string | null;
  verification: VerificationState;
  source: SourceRef;
}

/** A comparable study considered for a prior. */
export interface ComparableStudy {
  nctId: string | null;
  sponsorStudyId: string | null;
  phase: string | null;
  indication: string | null;
  designSummary: string;
  /**
   * False ⇒ the study is LISTED but excluded from every prior. Listing it is the
   * point: a reader can see what was left out and why, rather than seeing a
   * smaller corpus with no explanation.
   */
  machineReadable: boolean;
  linkStatus: EpistemicStatus;
}

// ─── Stress testing ──────────────────────────────────────────────────────────

/**
 * One regulatory stress scenario (§9.1). The hard rule: a CRL may justify WHY a
 * scenario matters; it may not supply a NUMBER unless the letter or linked
 * evidence supports that number. `parameterSource` makes that visible per row —
 * `none` is a legitimate value and renders as "scenario only".
 */
export interface StressScenario {
  scenarioId: string;
  label: string;
  /** Which CRL pattern selected this scenario. */
  selectedBy: { findingId: string; label: string } | null;
  parameterSource: 'evidence' | 'user_assumption' | 'explicit_range' | 'none';
  /** e.g. "24% — upper bound of observed range" */
  parameterNote: string;
  result: string | null;
  resultTone: 'ok' | 'warn' | 'err' | 'neutral';
}

/** An explicit assumption, always attributed. */
export interface Assumption {
  label: string;
  value: string;
  source: 'user' | 'evidence' | 'range';
}

/** Evidence that weakens a recommendation. Retrieved separately, never averaged in (§8.1). */
export interface Contradiction {
  text: string;
  source: SourceRef | null;
}

// ─── Trace ───────────────────────────────────────────────────────────────────

/** A calculation, with the method that produced it. No method ⇒ no number (§10.1). */
export interface CalculationRecord {
  label: string;
  method: string;
  note: string | null;
}

/**
 * The evidence chain behind a recommendation (§9 traceDesignRecommendation).
 * This is what makes a recommendation auditable rather than merely plausible.
 */
export interface EvidenceTrace {
  traceId: string;
  corpusSnapshot: string;
  chain: { step: string; count: number | null }[];
  calculations: CalculationRecord[];
  assumptions: Assumption[];
  contradictions: Contradiction[];
  coverage: CoverageRecord;
  reviewState: 'draft' | 'extracted' | 'human_reviewed';
  /** True when the corpus snapshot advanced past this trace — the `stale_recalculate` state. */
  recalculateRequired: boolean;
}

// ─── Composite payload ───────────────────────────────────────────────────────

/**
 * The single payload the Study Design evidence panel consumes. §13 asks the
 * panel seven questions — comparable studies, observed results, FDA objections,
 * stress tests, assumptions, contradictory evidence, sources — and this answers
 * all seven from ONE fetch, so the panel cannot show a half-loaded picture in
 * which the supporting evidence has arrived and the contradictions have not.
 */
export interface DesignEvidencePanel {
  designNodeId: string;
  /** objective | estimand | endpoint | population | … */
  designNodeType: string;
  comparableStudies: ComparableStudy[];
  observations: ResolvedStudyResultObservation[];
  pooled: { measure: string; value: number; ci: [number, number]; n: number } | null;
  findings: ResolvedRegulatoryFinding[];
  stressScenarios: StressScenario[];
  assumptions: Assumption[];
  contradictions: Contradiction[];
  coverage: CoverageRecord;
  trace: EvidenceTrace | null;
}

// ─── Retrieval constraints ───────────────────────────────────────────────────

/**
 * §8.1 constraint set. These are applied BEFORE semantic ranking — metadata
 * first, similarity second. Ranking first and filtering after would let a
 * high-similarity finding from the wrong indication outrank a correct one.
 */
export interface FindingQuery {
  applicationType?: string;
  discipline?: Discipline;
  category?: string;
  ctdSection?: string;
  ichE3Section?: string;
  designNode?: string;
  verification?: VerificationState;
  indication?: string;
  phase?: string;
  modality?: string;
  endpointClass?: string;
  control?: string;
  /** Free-text finding search, ranked only after every constraint above. */
  text?: string;
  limit?: number;
}

/**
 * Tenant/project scope. Resolved from JWT-bound request context only, never from
 * a query parameter or header, and required — the facade fails closed without it
 * (§14). A missing scope is an error, not "search everything".
 */
export interface EvidenceScope {
  organizationId: number;
  projectId?: number;
}

/** Findings plus the coverage that contextualizes them. Never one without the other. */
export interface FindingSearchResult {
  findings: ResolvedRegulatoryFinding[];
  coverage: CoverageRecord;
  insufficientEvidence?: InsufficientEvidence;
}


/* ══════════════════════════════════════════════════════════════════════════
   Evidence-spine workstream — the persistence-row contract over the cre_* tables,
   the platform's single evidence store. The evidence-graph domain contract above
   (the `Resolved*` DTOs) is now SERVED from these rows: the facade in ./index.ts
   converged onto evidence-spine.service and the duplicate table lineage was retired
   (#1150). The three names both workstreams defined were disambiguated by the
   `Resolved*` rename above, so this file compiles with no duplicate identifiers.
   (The earlier "does not compile until reconciled" note is obsolete — that happened.)
   ══════════════════════════════════════════════════════════════════════════ */

/**
 * Clinical Regulatory Evidence — the shared, source-agnostic analytical contract.
 *
 * One evidence model spanning CSR, protocol/SAP, FDA CRL, review memos, approval
 * packages, trial registries, publications and client documents (§3). The tables
 * are cre_* (migration 20260724_clinical_regulatory_evidence_spine.sql); this
 * module is the typed interface every consumer — the CSR adapter (Phase 2), the
 * studyDesignEvidenceService (Phase 3), CRL ingestion (Phase 4) and the AnA tools
 * (Phase 5) — programs against, so nothing hard-codes a CRL-only worldview.
 *
 * Value sets are TEXT (not Postgres enums) so new source types drop in without a
 * migration; they are enumerated here and validated in the service.
 *
 * @module server/services/clinical-regulatory-evidence/types
 */

// ─── Value sets (documented, service-validated) ───────────────────────────────

/** Original source document / official record types (§3). CSR + FDA_CRL are the
 *  two required in the first work order; the rest are reserved, not hard-coded. */
export const SOURCE_TYPES = [
  'csr', 'protocol', 'sap', 'fda_crl', 'fda_review_memo',
  'fda_approval_package', 'trial_registry', 'publication', 'client_document',
] as const;
export type SourceType = (typeof SOURCE_TYPES)[number];

/** §13 evidence visibility. GLOBAL_PUBLIC = the shared FDA CRL corpus (org NULL);
 *  TENANT_PRIVATE = a client's own evidence; PROJECT_PRIVATE = scoped further to a
 *  client workspace. */
export const VISIBILITY_CLASSES = ['global_public', 'tenant_private', 'project_private'] as const;
export type VisibilityClass = (typeof VISIBILITY_CLASSES)[number];

export const INGESTION_STATUSES = ['pending', 'ingested', 'failed'] as const;
export type IngestionStatus = (typeof INGESTION_STATUSES)[number];

export const EXTRACTION_STATUSES = ['pending', 'extracted', 'reconciled', 'verified', 'failed'] as const;
export type ExtractionStatus = (typeof EXTRACTION_STATUSES)[number];

/** FDA review disciplines / finding domains (§4.5). */
export const FINDING_DOMAINS = [
  'clinical', 'cmc', 'nonclinical', 'biostatistics', 'clinical_pharmacology',
  'labeling', 'safety', 'facility', 'other',
] as const;
export type FindingDomain = (typeof FINDING_DOMAINS)[number];

export const EXPLICIT_OR_INFERRED = ['explicit', 'inferred'] as const;
export type ExplicitOrInferred = (typeof EXPLICIT_OR_INFERRED)[number];

export const VERIFICATION_STATUSES = ['unverified', 'verified', 'disputed'] as const;
export type VerificationStatus = (typeof VERIFICATION_STATUSES)[number];

/** Normalized regulatory outcome types (§4.6). Never derived from trial completion. */
export const OUTCOME_TYPES = [
  'application_submitted', 'refuse_to_file', 'information_request', 'major_amendment',
  'crl', 'resubmission', 'approval', 'withdrawal', 'discontinuation', 'unresolved',
] as const;
export type OutcomeType = (typeof OUTCOME_TYPES)[number];

/** Typed evidence relationships (§4.7). potentially_related MUST be inferred. */
export const RELATIONSHIP_TYPES = [
  'describes_study', 'reports_result', 'supports_application', 'reviewed_in_application',
  'deficiency_applies_to_study', 'deficiency_applies_to_design_feature',
  'deficiency_applies_to_endpoint', 'deficiency_applies_to_analysis',
  'requests_additional_study', 'requests_reanalysis', 'requests_safety_data',
  'requests_cmc_remediation', 'resolved_by_evidence', 'potentially_related',
] as const;
export type RelationshipType = (typeof RELATIONSHIP_TYPES)[number];

export const ENTITY_TYPES = [
  'source', 'study', 'finding', 'outcome', 'design_feature',
  'result_observation', 'design_lesson', 'atom',
] as const;
export type EntityType = (typeof ENTITY_TYPES)[number];

export const HUMAN_REVIEW_STATUSES = ['pending', 'approved', 'rejected'] as const;
export type HumanReviewStatus = (typeof HUMAN_REVIEW_STATUSES)[number];

// ─── Entity row shapes (camelCase; adapters map from snake_case) ───────────────

export interface EvidenceSource {
  id: number;
  organizationId: number | null;          // null = GLOBAL_PUBLIC
  visibilityClass: VisibilityClass;
  clientWorkspaceId: number | null;
  /** regulatory_programs.id (UUID) — the project-management id-space. Null when
   *  the source is scoped by clientWorkspaceId instead, or not project-scoped. */
  clientProgramId: string | null;
  sourceType: SourceType;
  agency: string | null;
  sourceRecordIdentifier: string | null;
  title: string | null;
  sponsor: string | null;
  product: string | null;
  indication: string | null;
  therapeuticArea: string | null;
  phase: string | null;
  applicationType: string | null;
  applicationNumber: string | null;
  trialRegistryIdentifier: string | null;
  documentDate: string | null;
  officialUrl: string | null;
  storedArtifactRef: string | null;
  checksum: string | null;
  version: string | null;
  provenance: Record<string, unknown>;
  ingestionStatus: IngestionStatus;
  extractionStatus: ExtractionStatus;
  linkedCsrReportId: number | null;
  linkedPrecedentId: string | null;
  metadata: Record<string, unknown>;
  createdAt: string;
  updatedAt: string;
}

export interface ClinicalStudy {
  id: number;
  organizationId: number | null;
  visibilityClass: VisibilityClass;
  clientWorkspaceId: number | null;
  canonicalStudyKey: string;
  nctId: string | null;
  registryIds: unknown[];
  sponsorStudyId: string | null;
  protocolNumber: string | null;
  indication: string | null;
  phase: string | null;
  product: string | null;
  modality: string | null;
  sponsor: string | null;
  studyStatus: string | null;
  provenanceConfidence: number | null;
  linkedCsrStudyId: number | null;
  metadata: Record<string, unknown>;
  createdAt: string;
  updatedAt: string;
}

export interface RegulatoryFinding {
  id: number;
  organizationId: number | null;
  visibilityClass: VisibilityClass;
  sourceId: number;
  applicationIdentifier: string | null;
  relatedStudyIds: number[];
  findingDomain: FindingDomain | null;
  findingCategory: string | null;
  findingSubcategory: string | null;
  fdaReviewDiscipline: string | null;
  findingText: string | null;
  normalizedSummary: string | null;
  requestedAction: string | null;
  severity: string | null;
  affectedCtdSection: string | null;
  affectedIchE3Section: string | null;
  affectedProtocolElement: string | null;
  affectedSapElement: string | null;
  affectedStudyDesignFeature: string | null;
  sourcePage: number | null;
  sourceExcerpt: string | null;
  explicitOrInferred: ExplicitOrInferred;
  extractionConfidence: number | null;
  verificationStatus: VerificationStatus;
  metadata: Record<string, unknown>;
  createdAt: string;
  updatedAt: string;
}

export interface RegulatoryOutcome {
  id: number;
  organizationId: number | null;
  visibilityClass: VisibilityClass;
  sourceId: number | null;
  applicationIdentifier: string | null;
  outcomeType: OutcomeType;
  outcomeDate: string | null;
  approvalDate: string | null;
  timeToResolutionDays: number | null;
  evidenceNote: string | null;
  verificationStatus: VerificationStatus;
  linkedSubmissionOutcomeId: string | null;
  linkedPrecedentId: string | null;
  metadata: Record<string, unknown>;
  createdAt: string;
  updatedAt: string;
}

export interface EvidenceRelationship {
  id: number;
  organizationId: number | null;
  fromEntityType: EntityType;
  fromEntityId: string;
  toEntityType: EntityType;
  toEntityId: string;
  relationshipType: RelationshipType;
  isInferred: boolean;
  confidence: number | null;
  provenance: Record<string, unknown>;
  createdAt: string;
}

export interface DesignLesson {
  id: number;
  organizationId: number | null;
  visibilityClass: VisibilityClass;
  lessonStatement: string;
  applicablePopulation: string | null;
  applicablePhase: string | null;
  modality: string | null;
  endpointType: string | null;
  supportingSourceIds: number[];
  contradictingSourceIds: number[];
  minimumEvidenceCount: number | null;
  evidenceQualityScore: number | null;
  confidenceInterval: unknown | null;
  derivationMethod: string | null;
  modelVersion: string | null;
  humanReviewStatus: HumanReviewStatus;
  lastRecalculatedAt: string | null;
  metadata: Record<string, unknown>;
  createdAt: string;
  updatedAt: string;
}

// ─── Read-adapter shapes (§4.3/§4.4) — NOT tables; Phase 2 maps these from the
//     existing csr_* corpus so we never duplicate it. ───────────────────────────

/** A normalized study-design feature with mandatory provenance (§4.3). */
export interface StudyDesignFeature {
  studyId: number | null;
  featureKey: string;                     // e.g. 'primary_endpoint', 'randomization_ratio'
  value: string | number | null;
  sourceId: number | null;
  sourceLocation: string | null;
  extractionMethod: string | null;
  extractionConfidence: number | null;
  explicitOrInferred: ExplicitOrInferred;
  verificationStatus: VerificationStatus;
}

/** A normalized quantitative/qualitative result observation (§4.4). Effect is
 *  never collapsed to one generic number without its measure + scale. */
export interface StudyResultObservation {
  studyId: number | null;
  endpoint: string;
  endpointRole: string | null;            // primary | secondary | exploratory | safety
  estimand: string | null;
  analysisPopulation: string | null;      // ITT | mITT | PP | safety
  effectMeasure: string | null;           // mean_difference | odds_ratio | hazard_ratio | ...
  effectValue: number | null;
  standardError: number | null;
  ciLower: number | null;
  ciUpper: number | null;
  pValue: number | null;
  directionOfBenefit: string | null;
  timepoint: string | null;
  sampleSize: number | null;
  missingness: number | null;
  subgroup: string | null;
  multiplicityStatus: string | null;
  sourceLocation: string | null;
}

/** The §14 evidentiary envelope every reported metric must carry. */
export interface MetricProvenance {
  numerator: number | null;
  denominator: number | null;
  missingCount: number | null;
  inclusionCriteria: string | null;
  filters: Record<string, unknown>;
  extractionMethod: string | null;
  verificationStatus: VerificationStatus;
  dateRange: { from: string | null; to: string | null } | null;
}
