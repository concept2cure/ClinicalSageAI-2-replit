/**
 * Biostatistics Judgment Layer — Orchestrator & Public API
 *
 * Single entry point for the complete judgment pipeline:
 *   structured input → deterministic computation → judgment modules
 *   → role-aware interpretation → governed artifact
 *
 * @module server/services/biostatistics-judgment
 */

export type {
  StudyDesignInput,
  PowerAdequacyJudgment,
  PowerClassification,
  AssumptionFragility,
  FragilityLevel,
  SensitivityFactor,
  EndpointMethodDefensibility,
  DefensibilityRating,
  StatisticalTradeoff,
  TradeoffAnalysis,
  StatisticalRisk,
  StatisticalRiskProfile,
  StatisticalRiskType,
  RiskSeverity,
  StakeholderRole,
  RoleAwareInterpretation,
  RoleAwareReport,
  StatisticalArtifactType,
  StatisticalArtifactInput,
  GeneratedStatisticalArtifact,
  ArtifactSection,
  BiostatisticsJudgmentReport,
} from './types';

import type {
  StudyDesignInput,
  BiostatisticsJudgmentReport,
  StakeholderRole,
  RoleAwareInterpretation,
  StatisticalArtifactType,
  GeneratedStatisticalArtifact,
  StatisticalArtifactInput,
} from './types';

import { judgePowerAdequacy } from './power-adequacy';
import { judgeAssumptionFragility } from './assumption-fragility';
import { judgeEndpointMethodDefensibility } from './endpoint-method-defensibility';
import { analyzeTradeoffs } from './tradeoff-interpreter';
import { classifyStatisticalRisks } from './risk-classifier';
import { generateRoleAwareReport, generateForRole } from './role-aware-interpreter';
import { generateStatisticalArtifact } from './statistical-artifact-generator';

// Re-export individual modules for direct use
export { judgePowerAdequacy } from './power-adequacy';
export { judgeAssumptionFragility } from './assumption-fragility';
export { judgeEndpointMethodDefensibility } from './endpoint-method-defensibility';
export { analyzeTradeoffs } from './tradeoff-interpreter';
export { classifyStatisticalRisks } from './risk-classifier';
export { generateRoleAwareReport, generateForRole } from './role-aware-interpreter';
export { generateStatisticalArtifact } from './statistical-artifact-generator';

// ═══════════════════════════════════════════════════════════════════════════════
// FULL JUDGMENT PIPELINE
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Run the complete biostatistics judgment pipeline.
 *
 * structured input → power judgment → fragility judgment → defensibility
 * → risk classification → tradeoff analysis → role-aware interpretation
 */
export function runJudgmentPipeline(input: StudyDesignInput): BiostatisticsJudgmentReport {
  // 1. Power adequacy
  const powerJudgment = judgePowerAdequacy(input);

  // 2. Assumption fragility
  const fragilityJudgment = judgeAssumptionFragility(input);

  // 3. Endpoint-method defensibility
  const defensibilityJudgment = judgeEndpointMethodDefensibility(input);

  // 4. Statistical risk classification
  const riskProfile = classifyStatisticalRisks(input, powerJudgment, fragilityJudgment, defensibilityJudgment);

  // 5. Tradeoff analysis
  const tradeoffAnalysis = analyzeTradeoffs(input, powerJudgment, fragilityJudgment);

  // 6. Role-aware interpretations
  const roleReport = generateRoleAwareReport({
    input, powerJudgment, fragilityJudgment, defensibilityJudgment, riskProfile, tradeoffAnalysis,
  });

  const roleInterpretations: Record<StakeholderRole, RoleAwareInterpretation> = {} as any;
  for (const [role, interp] of roleReport.interpretations) {
    roleInterpretations[role] = interp;
  }

  // Overall assessment
  const overallAssessment = buildOverallAssessment(powerJudgment.classification, riskProfile.overallRiskLevel, fragilityJudgment.fragilityLevel);

  return {
    input,
    powerJudgment,
    fragilityJudgment,
    defensibilityJudgment,
    riskProfile,
    tradeoffAnalysis,
    roleInterpretations,
    overallAssessment,
    generatedAt: new Date().toISOString(),
    provenance: 'ana_biostatistics_judgment',
  };
}

// ═══════════════════════════════════════════════════════════════════════════════
// ARTIFACT GENERATION FROM PIPELINE
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Run the full pipeline and generate a governed statistical artifact.
 */
export function runPipelineAndGenerateArtifact(
  input: StudyDesignInput,
  artifactType: StatisticalArtifactType,
  generatedBy: string = 'ana_biostatistics',
): { report: BiostatisticsJudgmentReport; artifact: GeneratedStatisticalArtifact } {
  const report = runJudgmentPipeline(input);

  const artifactInput: StatisticalArtifactInput = {
    projectId: input.projectId,
    artifactType,
    studyInput: input,
    powerJudgment: report.powerJudgment,
    fragilityJudgment: report.fragilityJudgment,
    defensibilityJudgment: report.defensibilityJudgment,
    riskProfile: report.riskProfile,
    tradeoffAnalysis: report.tradeoffAnalysis,
    generatedBy,
    generatedAt: report.generatedAt,
  };

  const artifact = generateStatisticalArtifact(artifactInput);

  return { report, artifact };
}

// ═══════════════════════════════════════════════════════════════════════════════
// SINGLE-ROLE INTERPRETATION
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Run the pipeline and return interpretation for a single role.
 */
export function runPipelineForRole(
  input: StudyDesignInput,
  role: StakeholderRole,
): { report: BiostatisticsJudgmentReport; interpretation: RoleAwareInterpretation } {
  const report = runJudgmentPipeline(input);
  const interpretation = generateForRole(role, {
    ...report,
    input,
  });
  return { report, interpretation };
}

// ═══════════════════════════════════════════════════════════════════════════════
// HELPERS
// ═══════════════════════════════════════════════════════════════════════════════

function buildOverallAssessment(
  powerClass: string,
  riskLevel: string,
  fragilityLevel: string,
): string {
  if (riskLevel === 'critical') {
    return 'CRITICAL: This design has critical statistical issues that must be resolved before proceeding. ' +
      'Do not commit resources until the identified risks are addressed.';
  }
  if (powerClass === 'underpowered') {
    return 'WARNING: This design is underpowered. There is a high probability that the trial will fail ' +
      'to demonstrate a treatment effect even if one exists. Design revision is strongly recommended.';
  }
  if (riskLevel === 'high') {
    return 'CAUTION: This design has high statistical risk. While not critically flawed, multiple major ' +
      'issues should be addressed to improve the probability of success.';
  }
  if (powerClass === 'marginal' && fragilityLevel === 'high') {
    return 'CONCERN: Marginal power combined with high assumption fragility creates meaningful risk. ' +
      'Consider strengthening the design through sample size increase or more conservative assumptions.';
  }
  if (powerClass === 'adequate' && riskLevel === 'low') {
    return 'ACCEPTABLE: This design is adequately powered with low overall statistical risk. ' +
      'Standard monitoring and execution quality will be the primary determinants of success.';
  }
  return 'MODERATE: This design has adequate basic parameters but identified areas that warrant attention. ' +
    'Address recommended actions to strengthen the statistical foundation.';
}
