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
  overallRisk: 'low' | 'moderate' | 'high';
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
  consistencyScore: number; // 0–100
}

// ─── Module 3: Defensibility Scoring ─────────────────────────────────────────

export interface DefensibilityScore {
  score: number; // 0–100
  riskLevel: 'low' | 'moderate' | 'high';
  drivers: DefensibilityDriver[];
  breakdown: {
    evidencePresence: number;     // 0–25
    claimPrecision: number;       // 0–25
    consistency: number;          // 0–25
    completeness: number;         // 0–25
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
}

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

export interface IntelligenceAnalysis {
  claimEvidence: ClaimEvidenceReport;
  consistency: ConsistencyReport;
  defensibility: DefensibilityScore;
  reviewerQuestions: ReviewerQuestion[];
  riskClassifications: RiskReport;
  evaluation: EvaluationResult;
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
