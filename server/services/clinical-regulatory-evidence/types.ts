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

/** One FDA finding, resolvable to source and page. */
export interface RegulatoryFinding {
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

/** A verified application outcome. Only ever recorded, never inferred (§4.2). */
export interface RegulatoryOutcome {
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
export interface StudyResultObservation {
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
  observations: StudyResultObservation[];
  pooled: { measure: string; value: number; ci: [number, number]; n: number } | null;
  findings: RegulatoryFinding[];
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
  findings: RegulatoryFinding[];
  coverage: CoverageRecord;
  insufficientEvidence?: InsufficientEvidence;
}
