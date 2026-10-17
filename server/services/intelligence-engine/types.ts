/**
 * Intelligence Engine — Shared Types
 *
 * Core type definitions for all deterministic intelligence modules.
 * These types enforce structured, reproducible outputs across the engine.
 */

// ─── Module 1: Claim/Evidence Alignment ──────────────────────────────────────

export type ClaimStrength = 'weak' | 'moderate' | 'strong';
export type EvidenceStrength = 'none' | 'partial' | 'adequate';
export type AlignmentVerdict = 'aligned' | 'overstated' | 'unsupported';

export interface ClaimEvidenceAlignment {
  claimStrength: ClaimStrength;
  evidenceStrength: EvidenceStrength;
  alignment: AlignmentVerdict;
  claimText: string;
  evidenceText: string | null;
  signals: string[];
}

export interface ClaimEvidenceReport {
  alignments: ClaimEvidenceAlignment[];
  /** 'not_assessed' when no claim was analysed (alignments is empty). */
  overallRisk: 'low' | 'moderate' | 'high' | 'not_assessed';
  overstatedCount: number;
  unsupportedCount: number;
}

// ─── Module 2: Cross-Section Consistency ─────────────────────────────────────

export interface SectionAssertion {
  sectionId: string;
  sectionName: string;
  assertion: string;
  normalized: string;
}

export interface InconsistencyFlag {
  assertionA: SectionAssertion;
  assertionB: SectionAssertion;
  type: 'contradiction' | 'divergence' | 'missing_in_summary';
  severity: 'low' | 'medium' | 'high';
  description: string;
}

export interface ConsistencyReport {
  assertions: SectionAssertion[];
  inconsistencies: InconsistencyFlag[];
  /** Pairs of statements from two different sections that were compared. */
  comparisons: number;
  /**
   * 0–100; null when nothing was compared (one section, or no statements
   * from two different sections). 2026-10-15: that case scored 100.
   */
  consistencyScore: number | null;
}

// ─── Module 3: Defensibility Scoring ─────────────────────────────────────────

/** A defensibility dimension that can go unassessed. */
export type DefensibilityDimension = 'evidencePresence' | 'claimPrecision' | 'consistency';

export interface DefensibilityScore {
  /**
   * 0–100 over the dimensions that were measured; null when no claim was
   * analysed, since defensibility weighs claims against their evidence.
   */
  score: number | null;
  riskLevel: 'low' | 'moderate' | 'high' | 'not_assessed';
  /** True when a dimension was left out of the score. */
  partial: boolean;
  /** Dimensions with no score because their input was not assessed. */
  notAssessed: DefensibilityDimension[];
  drivers: DefensibilityDriver[];
  breakdown: {
    evidencePresence: number | null; // 0–25; null when no claim was analysed
    claimPrecision: number | null;   // 0–25; null when no claim was analysed
    consistency: number | null;      // 0–25; null when nothing was compared
    completeness: number;            // 0–25
  };
}

export interface DefensibilityDriver {
  factor: string;
  impact: 'positive' | 'negative';
  weight: number;
  detail: string;
}

// ─── Module 4: Reviewer Question Generator ───────────────────────────────────

export interface ReviewerQuestion {
  question: string;
  trigger: string;           // what deterministic signal caused this
  severity: 'info' | 'warning' | 'critical';
  category: 'evidence' | 'consistency' | 'completeness' | 'methodology' | 'safety';
  sectionRef?: string;
  // Persona attribution + regulatory citation. Added 2026-04-29 as part of the
  // reviewer red-team simulator. Optional so existing callers compile unchanged.
  persona?: ReviewerPersonaCode;
  citation?: string; // e.g. '21 CFR 807.92(a)(3)' or 'MDR Annex II §3.1'
  recommendedFix?: string;
}

/** Persona codes used by the reviewer-simulator service. */
export type ReviewerPersonaCode =
  | 'fda_510k_reviewer'
  | 'fda_pma_reviewer'
  | 'fda_software_reviewer'
  | 'fda_cyber_reviewer'
  | 'eu_notified_body_clinical'
  | 'ivdr_performance_evaluator'
  | 'biostat_reviewer'
  | 'labeling_reviewer'
  | 'quality_systems_reviewer'
  | 'preclinical_toxicologist'
  | 'glp_auditor';

// ─── Module 5: Risk Classification ───────────────────────────────────────────

export type DeficiencyCategory =
  | 'clinical_data_gap'
  | 'statistical_weakness'
  | 'safety_signal_gap'
  | 'regulatory_non_compliance'
  | 'documentation_deficiency'
  | 'manufacturing_concern'
  | 'labeling_issue';

export type DeficiencySeverity = 'minor' | 'major' | 'critical';

export interface RiskClassification {
  category: DeficiencyCategory;
  severity: DeficiencySeverity;
  finding: string;
  regulatoryBasis: string;
  remediationGuidance: string;
}

export interface RiskReport {
  classifications: RiskClassification[];
  criticalCount: number;
  majorCount: number;
  minorCount: number;
  overallRisk: 'low' | 'moderate' | 'high' | 'critical';
}

// ─── Module 6: Output Evaluation Gate ────────────────────────────────────────

export interface EvaluationResult {
  passed: boolean;
  checks: EvaluationCheck[];
  rejectionReasons: string[];
  qualityScore: number; // 0–100
}

export interface EvaluationCheck {
  criterion: string;
  passed: boolean;
  detail: string;
}

// ─── Composite Pipeline Output ───────────────────────────────────────────────

// 2026-10-15: this carried `evaluation`, the Module-6 gate run over the
// engine's own formatted report — a regex certifying text this engine wrote
// (qualityScore 100 on a two-sentence note). It was removed; the gate is for
// model output (evaluateOutput).
export interface IntelligenceAnalysis {
  claimEvidence: ClaimEvidenceReport;
  consistency: ConsistencyReport;
  defensibility: DefensibilityScore;
  reviewerQuestions: ReviewerQuestion[];
  riskClassifications: RiskReport;
  timestamp: string;
  inputHash: string;
}

// ─── RIM Signal ──────────────────────────────────────────────────────────────

export interface RIMSignal {
  type: 'claim_overstatement' | 'evidence_gap' | 'inconsistency' | 'defensibility_drop' | 'risk_escalation';
  severity: 'low' | 'medium' | 'high' | 'critical';
  source: string;
  detail: string;
  timestamp: string;
}
