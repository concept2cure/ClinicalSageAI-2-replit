/**
 * Biostatistics Judgment Layer — Shared Types
 *
 * Typed contracts for all judgment modules. These are deterministic
 * classification types — no LLM involvement in type definitions.
 *
 * @module server/services/biostatistics-judgment/types
 */

// ═══════════════════════════════════════════════════════════════════════════════
// STUDY INPUT CONTRACT
// ═══════════════════════════════════════════════════════════════════════════════

export interface StudyDesignInput {
  readonly projectId: string;
  readonly studyType: 'superiority' | 'non_inferiority' | 'equivalence' | 'single_arm';
  readonly phase: 'I' | 'I/II' | 'II' | 'II/III' | 'III' | 'IV';
  readonly indication: string;
  readonly endpointType: 'continuous' | 'binary' | 'time_to_event' | 'ordinal' | 'count' | 'composite';
  readonly primaryEndpoint: string;
  readonly statisticalMethod: string;
  readonly alpha: number;
  readonly powerTarget: number;
  readonly effectSizeAssumption: number;
  readonly effectSizeUnit?: string;
  readonly allocationRatio: number;
  readonly attritionAssumption: number;
  readonly computedSampleSize: number;
  readonly computedPower?: number;
  readonly variance?: number;
  readonly controlRate?: number;
  readonly treatmentRate?: number;
  readonly hazardRatio?: number;
  readonly medianSurvivalControl?: number;
  readonly nonInferiorityMargin?: number;
  readonly interimAnalyses?: number;
  readonly adaptiveDesign?: boolean;
  readonly multiplicityAdjustment?: string;
  readonly missingDataMethod?: string;
}

// ═══════════════════════════════════════════════════════════════════════════════
// MODULE 1 — POWER ADEQUACY JUDGMENT
// ═══════════════════════════════════════════════════════════════════════════════

export type PowerClassification = 'adequate' | 'marginal' | 'underpowered' | 'indeterminate';

export interface PowerAdequacyJudgment {
  readonly classification: PowerClassification;
  readonly rationale: readonly string[];
  readonly concerns: readonly string[];
  readonly effectivePower: number | null;
  readonly powerGap: number | null;
  readonly recommendedActions: readonly string[];
}

// ═══════════════════════════════════════════════════════════════════════════════
// MODULE 2 — ASSUMPTION FRAGILITY JUDGMENT
// ═══════════════════════════════════════════════════════════════════════════════

export type FragilityLevel = 'low' | 'moderate' | 'high';

export interface AssumptionFragility {
  readonly fragilityLevel: FragilityLevel;
  readonly fragilityScore: number; // 0-100
  readonly keyDependencies: readonly string[];
  readonly likelyFailureModes: readonly string[];
  readonly sensitivityFactors: readonly SensitivityFactor[];
  readonly overallAssessment: string;
}

export interface SensitivityFactor {
  readonly parameter: string;
  readonly currentValue: number | string;
  readonly breakingPoint: number | string | null;
  readonly impact: 'high' | 'moderate' | 'low';
  readonly description: string;
}

// ═══════════════════════════════════════════════════════════════════════════════
// MODULE 3 — ENDPOINT / METHOD DEFENSIBILITY
// ═══════════════════════════════════════════════════════════════════════════════

export type DefensibilityRating = 'appropriate' | 'acceptable_with_caveats' | 'vulnerable' | 'poorly_matched';

export interface EndpointMethodDefensibility {
  readonly rating: DefensibilityRating;
  readonly endpointAssessment: string;
  readonly methodAssessment: string;
  readonly pairingAssessment: string;
  readonly caveats: readonly string[];
  readonly limitations: readonly string[];
  readonly regulatoryConsiderations: readonly string[];
}

// ═══════════════════════════════════════════════════════════════════════════════
// MODULE 4 — STATISTICAL TRADEOFF INTERPRETER
// ═══════════════════════════════════════════════════════════════════════════════

export interface StatisticalTradeoff {
  readonly dimension: string;
  readonly currentChoice: string;
  readonly alternative: string;
  readonly whatImproves: readonly string[];
  readonly whatWorses: readonly string[];
  readonly netAssessment: 'favorable' | 'neutral' | 'unfavorable';
  readonly recommendation: string;
}

export interface TradeoffAnalysis {
  readonly tradeoffs: readonly StatisticalTradeoff[];
  readonly safestPath: string;
  readonly overallGuidance: string;
}

// ═══════════════════════════════════════════════════════════════════════════════
// MODULE 5 — STATISTICAL RISK CLASSIFIER
// ═══════════════════════════════════════════════════════════════════════════════

export type StatisticalRiskType =
  | 'underpower_risk'
  | 'assumption_fragility'
  | 'endpoint_method_mismatch'
  | 'attrition_sensitivity'
  | 'overinterpretation_risk'
  | 'precision_instability'
  | 'multiplicity_risk'
  | 'missing_data_risk';

export type RiskSeverity = 'critical' | 'major' | 'minor' | 'informational';

export interface StatisticalRisk {
  readonly riskType: StatisticalRiskType;
  readonly severity: RiskSeverity;
  readonly description: string;
  readonly evidence: readonly string[];
  readonly mitigation: string;
  readonly regulatoryImplication: string;
}

export interface StatisticalRiskProfile {
  readonly risks: readonly StatisticalRisk[];
  readonly overallRiskLevel: 'low' | 'moderate' | 'high' | 'critical';
  readonly criticalCount: number;
  readonly majorCount: number;
  readonly topRisk: StatisticalRisk | null;
  readonly summary: string;
}

// ═══════════════════════════════════════════════════════════════════════════════
// MODULE 6 — ROLE-AWARE INTERPRETATION
// ═══════════════════════════════════════════════════════════════════════════════

export type StakeholderRole = 'ceo' | 'ra_lead' | 'clinical_lead' | 'medical_writer' | 'biostatistician';

export interface RoleAwareInterpretation {
  readonly role: StakeholderRole;
  readonly headline: string;
  readonly keyPoints: readonly string[];
  readonly implications: readonly string[];
  readonly actionItems: readonly string[];
  readonly riskFraming: string;
  readonly confidenceStatement: string;
}

export interface RoleAwareReport {
  readonly interpretations: ReadonlyMap<StakeholderRole, RoleAwareInterpretation>;
  readonly commonGround: string;
}

// ═══════════════════════════════════════════════════════════════════════════════
// MODULE 7 — GOVERNED STATISTICAL OUTPUTS
// ═══════════════════════════════════════════════════════════════════════════════

export type StatisticalArtifactType =
  | 'statistical_risk_memo'
  | 'design_assumption_note'
  | 'sample_size_rationale'
  | 'sap_section_draft'
  | 'scenario_comparison_brief';

export interface StatisticalArtifactInput {
  readonly projectId: string;
  readonly artifactType: StatisticalArtifactType;
  readonly studyInput: StudyDesignInput;
  readonly powerJudgment: PowerAdequacyJudgment;
  readonly fragilityJudgment: AssumptionFragility;
  readonly defensibilityJudgment: EndpointMethodDefensibility;
  readonly riskProfile: StatisticalRiskProfile;
  readonly tradeoffAnalysis?: TradeoffAnalysis;
  readonly roleInterpretation?: RoleAwareInterpretation;
  readonly generatedBy: string;
  readonly generatedAt: string;
}

export interface GeneratedStatisticalArtifact {
  readonly artifactType: StatisticalArtifactType;
  readonly title: string;
  readonly sections: readonly ArtifactSection[];
  readonly metadata: {
    readonly projectId: string;
    readonly generatedAt: string;
    readonly generatedBy: string;
    readonly provenance: 'ana_biostatistics_judgment';
    readonly version: string;
  };
}

export interface ArtifactSection {
  readonly heading: string;
  readonly content: string;
  readonly isStructured: boolean;
  readonly structuredData?: Record<string, unknown>;
}

// ═══════════════════════════════════════════════════════════════════════════════
// COMPOSITE — FULL JUDGMENT REPORT
// ═══════════════════════════════════════════════════════════════════════════════

export interface BiostatisticsJudgmentReport {
  readonly input: StudyDesignInput;
  readonly powerJudgment: PowerAdequacyJudgment;
  readonly fragilityJudgment: AssumptionFragility;
  readonly defensibilityJudgment: EndpointMethodDefensibility;
  readonly riskProfile: StatisticalRiskProfile;
  readonly tradeoffAnalysis: TradeoffAnalysis;
  readonly roleInterpretations: Record<StakeholderRole, RoleAwareInterpretation>;
  readonly overallAssessment: string;
  readonly generatedAt: string;
  readonly provenance: 'ana_biostatistics_judgment';
}
