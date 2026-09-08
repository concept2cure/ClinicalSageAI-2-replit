/**
 * Clinical-Regulatory Intelligence Graph — client view-model.
 *
 * ⚠️ THIS FILE CONTAINS NO FIXTURE DATA, AND THAT IS DELIBERATE.
 *
 * It lives in `fixtures/` because that is where the v2 surfaces' typed view
 * shapes live, but it is the one module here with no sample rows in it. The
 * design kit that specified these surfaces is full of illustrative values —
 * `NDA 212345`, `+14.2% (95% CI 3.1–25.3)`, `trace 7f2c-91ab`, quoted letter
 * text. Every one of them is a placeholder demonstrating the required SHAPE.
 *
 * None of them may be seeded here. A user who cannot tell a sample FDA finding
 * from a real one is a user being taught to trust fabricated regulatory
 * evidence, and unlike a stale metric that error is not self-correcting — they
 * would cite it. Surfaces in this workstream therefore use the fixture-free
 * `useLiveData` / `useLiveRows` helpers and render an honest empty state when
 * the corpus has nothing in it.
 *
 * Mirrors the server DTO in
 * server/services/clinical-regulatory-evidence/types.ts — keep the two in step.
 * The nullability is load-bearing on both sides: every nullable field here is a
 * question the corpus may genuinely be unable to answer, and rendering must stay
 * null-safe rather than substituting a default that reads as an answer.
 */

/** Source-explicit fact vs model-inferred mapping. Never merged (§7.2). */
export type EpistemicStatus = 'explicit' | 'inferred';

/** The seven display states of work order §13.2, shown per finding. */
export type VerificationState =
  | 'source_verified'
  | 'extracted_unreviewed'
  | 'inferred_mapping'
  | 'potential_study_link'
  | 'insufficient_evidence'
  | 'stale_recalculate';

/** What a finding applies to. `study` is the narrowest case, not the default. */
export type Applicability =
  | 'study'
  | 'application'
  | 'facility'
  | 'product'
  | 'cmc'
  | 'labeling'
  | 'unknown';

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

export type FindingSeverity = 'critical' | 'high' | 'medium' | 'low';

/** §8.1 — reported, never inferred. Renders as the coverage strip. */
export interface CoverageView {
  scanned: number;
  eligible: number;
  structured: number;
  verified: number;
  cited: number;
  /** Why the excluded ones are excluded, in plain words. */
  exclusionNote: string | null;
  /** Corpus snapshot date. */
  freshness: string | null;
}

export interface SourceRefView {
  sourceId: string;
  /** NDA | BLA | ANDA | 510(k) | … */
  applicationType: string;
  applicationNumber: string;
  letterDate: string | null;
  page: number | null;
  /** e.g. "¶2" */
  locator: string | null;
  /** Minimal verbatim excerpt. Never a paraphrase. Null when not extractable. */
  excerpt: string | null;
  officialUrl: string | null;
  checksum: string | null;
  version: number | null;
}

export interface MappingView {
  kind: 'ctd' | 'ich_e3' | 'design_node' | 'deficiency';
  /** "2.7.3" · "§11" · "endpoint" · "endpoint validity" */
  value: string;
  /** Drives solid chip vs italic "inferred" chip. */
  status: EpistemicStatus;
}

export interface RegulatoryFindingView {
  findingId: string;
  severity: FindingSeverity;
  discipline: Discipline;
  category: string;
  finding: string;
  requestedAction: string | null;
  applicability: Applicability;
  epistemicStatus: EpistemicStatus;
  verification: VerificationState;
  reviewedAt: string | null;
  /**
   * Deterministic parse and model extraction disagree. Blocks retrieval,
   * indexing and export until resolved — the UI shows it, it does not hide it.
   */
  conflict: boolean;
  mappings: MappingView[];
  source: SourceRefView;
}

export interface RegulatoryOutcomeView {
  applicationType: string;
  applicationNumber: string;
  letterDate: string | null;
  /** Only ever a verified value. Never derived from trial status. */
  outcome: 'crl' | 'resubmission' | 'approval' | 'withdrawal' | 'unresolved';
  resubmissionState: string | null;
  studyLink: { nctId: string | null; status: EpistemicStatus } | null;
  verifiedAt: string | null;
}

export interface ObservationView {
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
  /** Recorded, never silently applied. */
  transformations: string[];
  benefitDirectionNormalized: boolean;
  method: string | null;
  verification: VerificationState;
  source: SourceRefView;
}

export interface ComparableStudyView {
  nctId: string | null;
  sponsorStudyId: string | null;
  phase: string | null;
  indication: string | null;
  designSummary: string;
  /** false ⇒ listed, but excluded from every prior. */
  machineReadable: boolean;
  linkStatus: EpistemicStatus;
}

export interface StressScenarioView {
  scenarioId: string;
  label: string;
  /** Which CRL pattern selected it. */
  selectedBy: { findingId: string; label: string } | null;
  parameterSource: 'evidence' | 'user_assumption' | 'explicit_range' | 'none';
  /** e.g. "24% — upper bound of observed range" */
  parameterNote: string;
  result: string | null;
  resultTone: 'ok' | 'warn' | 'err' | 'neutral';
}

export interface AssumptionView {
  label: string;
  value: string;
  source: 'user' | 'evidence' | 'range';
}

export interface ContradictionView {
  text: string;
  source: SourceRefView | null;
}

export interface TraceView {
  traceId: string;
  corpusSnapshot: string;
  chain: { step: string; count: number | null }[];
  calculations: { label: string; method: string; note: string | null }[];
  assumptions: AssumptionView[];
  contradictions: ContradictionView[];
  coverage: CoverageView;
  reviewState: 'draft' | 'extracted' | 'human_reviewed';
  recalculateRequired: boolean;
}

/** The one payload the Study Design evidence panel consumes. */
export interface DesignEvidencePanelView {
  designNodeId: string;
  /** objective | estimand | endpoint | population | … */
  designNodeType: string;
  comparableStudies: ComparableStudyView[];
  observations: ObservationView[];
  pooled: { measure: string; value: number; ci: [number, number]; n: number } | null;
  findings: RegulatoryFindingView[];
  stressScenarios: StressScenarioView[];
  assumptions: AssumptionView[];
  contradictions: ContradictionView[];
  coverage: CoverageView;
  trace: TraceView | null;
}

/** `GET /findings` payload — findings never travel without their coverage. */
export interface FindingSearchView {
  findings: RegulatoryFindingView[];
  coverage: CoverageView;
  insufficientEvidence?: { reason: string; usable: number; total: number };
}

/* ── Display helpers ────────────────────────────────────────────────────────
   The §13.2 display states and the §10.1 language rules, in one place so every
   surface phrases them identically. A verification state worded three different
   ways across three surfaces is three different states as far as a user is
   concerned. */

/** Human label for each of the seven display states. */
export const VERIFICATION_LABEL: Record<VerificationState, string> = {
  source_verified: 'Source verified',
  extracted_unreviewed: 'Extracted · not human reviewed',
  inferred_mapping: 'Inferred mapping',
  potential_study_link: 'Potential study link',
  insufficient_evidence: 'Insufficient structured evidence',
  stale_recalculate: 'Stale — recalculate',
};

/**
 * Chip tone per verification state, on the existing `rd-chip tone-*` vocabulary.
 * Only tones that actually exist in the stylesheets are used — `ok`, `warn`,
 * `err`, `idle`, `ai`.
 *
 * This note used to end "`tone-dim` appears in PrecedentEngine.tsx but has no
 * CSS rule behind it … don't copy it." It was then copied twice more, into
 * DocumentAuthoring.tsx, so all three rendered as unstyled chips — measured in
 * Chromium as transparent background with near-black body text, beside
 * `tone-idle`'s muted `#e8e6dc`. All three now use `tone-idle`, and
 * `ci:check-chip-tones` fails the build on any literal tone with no rule,
 * because a comment asking people not to repeat a mistake demonstrably is not
 * an enforcement mechanism.
 */
export const VERIFICATION_TONE: Record<VerificationState, 'ok' | 'warn' | 'err' | 'idle'> = {
  source_verified: 'ok',
  extracted_unreviewed: 'warn',
  inferred_mapping: 'idle',
  potential_study_link: 'idle',
  insufficient_evidence: 'warn',
  stale_recalculate: 'warn',
};

export const SEVERITY_TONE: Record<FindingSeverity, 'err' | 'warn' | 'idle'> = {
  critical: 'err',
  high: 'warn',
  medium: 'warn',
  low: 'idle',
};

export const APPLICABILITY_LABEL: Record<Applicability, string> = {
  study: 'Study-level',
  application: 'Application-level',
  facility: 'Facility-level',
  product: 'Product-level',
  cmc: 'CMC-level',
  labeling: 'Labeling-level',
  unknown: 'Applicability unknown',
};

export const OUTCOME_LABEL: Record<RegulatoryOutcomeView['outcome'], string> = {
  crl: 'Complete response letter',
  resubmission: 'Resubmission',
  approval: 'Approval',
  withdrawal: 'Withdrawal',
  unresolved: 'Unresolved',
};

/**
 * Is this finding attributable to a clinical study? Application-, facility-,
 * CMC- and labeling-level findings are NOT (§6.2) — surfaces use this to say so
 * out loud rather than quietly listing them under a study.
 */
export function isStudyAttributable(f: RegulatoryFindingView): boolean {
  return f.applicability === 'study';
}

/**
 * Format a count with its denominator. §8.1: never a bare percentage.
 * `count(18, 31)` → "18 of 31".
 */
export function withDenominator(n: number, total: number): string {
  return `${n} of ${total}`;
}

