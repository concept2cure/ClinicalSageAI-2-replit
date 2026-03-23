/**
 * Module 6 — Role-Aware Biostatistics Interpreter
 *
 * Adapts statistical guidance by stakeholder role. Does NOT just change tone —
 * changes consequence framing, action items, and risk language.
 *
 * @module server/services/biostatistics-judgment/role-aware-interpreter
 */

import type {
  StudyDesignInput,
  StakeholderRole,
  RoleAwareInterpretation,
  RoleAwareReport,
  PowerAdequacyJudgment,
  AssumptionFragility,
  EndpointMethodDefensibility,
  StatisticalRiskProfile,
  TradeoffAnalysis,
} from './types';

// ═══════════════════════════════════════════════════════════════════════════════
// INTERPRETATION ENGINE
// ═══════════════════════════════════════════════════════════════════════════════

interface JudgmentContext {
  input: StudyDesignInput;
  powerJudgment: PowerAdequacyJudgment;
  fragilityJudgment: AssumptionFragility;
  defensibilityJudgment: EndpointMethodDefensibility;
  riskProfile: StatisticalRiskProfile;
  tradeoffAnalysis: TradeoffAnalysis;
}

const ALL_ROLES: StakeholderRole[] = ['ceo', 'ra_lead', 'clinical_lead', 'medical_writer', 'biostatistician'];

export function generateRoleAwareReport(ctx: JudgmentContext): RoleAwareReport {
  const interpretations = new Map<StakeholderRole, RoleAwareInterpretation>();

  for (const role of ALL_ROLES) {
    interpretations.set(role, generateForRole(role, ctx));
  }

  const commonGround = buildCommonGround(ctx);

  return { interpretations, commonGround };
}

export function generateForRole(role: StakeholderRole, ctx: JudgmentContext): RoleAwareInterpretation {
  switch (role) {
    case 'ceo': return interpretForCEO(ctx);
    case 'ra_lead': return interpretForRA(ctx);
    case 'clinical_lead': return interpretForClinical(ctx);
    case 'medical_writer': return interpretForMedicalWriter(ctx);
    case 'biostatistician': return interpretForBiostatistician(ctx);
  }
}

// ═══════════════════════════════════════════════════════════════════════════════
// CEO / EXECUTIVE
// ═══════════════════════════════════════════════════════════════════════════════

function interpretForCEO(ctx: JudgmentContext): RoleAwareInterpretation {
  const { powerJudgment, fragilityJudgment, riskProfile, tradeoffAnalysis, input } = ctx;

  const headline = buildCEOHeadline(powerJudgment, riskProfile);
  const keyPoints: string[] = [];
  const implications: string[] = [];
  const actionItems: string[] = [];

  // Timeline and cost framing
  if (powerJudgment.classification === 'underpowered' || powerJudgment.classification === 'marginal') {
    keyPoints.push(`The study design has ${powerJudgment.classification} statistical power — there is a meaningful risk the trial will not produce a clear result.`);
    implications.push('A failed trial means lost time and investment with no registrational data to show for it.');
    actionItems.push('Request the biostatistics team to evaluate options for achieving adequate power.');
  } else {
    keyPoints.push('Statistical power is adequate — the design has a reasonable chance of detecting the treatment effect if it exists.');
  }

  if (fragilityJudgment.fragilityLevel === 'high') {
    keyPoints.push('The design relies on optimistic assumptions — small deviations could compromise the study.');
    implications.push('Budget and timeline should include contingency for potential sample size increases.');
    actionItems.push('Request sensitivity analysis showing trial outcomes under pessimistic scenarios.');
  }

  // Risk framing in business terms
  if (riskProfile.overallRiskLevel === 'critical' || riskProfile.overallRiskLevel === 'high') {
    implications.push(`Statistical risk is ${riskProfile.overallRiskLevel} — this is a go/no-go decision point.`);
    actionItems.push('Convene a design review before committing significant resources.');
  }

  // Sample size = cost
  keyPoints.push(`Planned enrollment: ${input.computedSampleSize} participants total.`);

  const riskFraming = riskProfile.overallRiskLevel === 'critical' || riskProfile.overallRiskLevel === 'high'
    ? 'This design carries significant statistical risk that directly impacts the probability of regulatory success and return on investment.'
    : 'Statistical risk is manageable. Standard monitoring and contingency planning should suffice.';

  const confidenceStatement = buildConfidenceStatement(powerJudgment, riskProfile);

  return { role: 'ceo', headline, keyPoints, implications, actionItems, riskFraming, confidenceStatement };
}

function buildCEOHeadline(power: PowerAdequacyJudgment, risk: StatisticalRiskProfile): string {
  if (risk.overallRiskLevel === 'critical') return 'Critical statistical issues require executive attention before trial commitment.';
  if (power.classification === 'underpowered') return 'Study design is underpowered — high risk of inconclusive results.';
  if (power.classification === 'marginal') return 'Study design has marginal power — recommend review before launch.';
  if (risk.overallRiskLevel === 'high') return 'Statistical design has notable risks that should be addressed.';
  return 'Statistical design is sound — ready to proceed with standard oversight.';
}

// ═══════════════════════════════════════════════════════════════════════════════
// RA LEAD
// ═══════════════════════════════════════════════════════════════════════════════

function interpretForRA(ctx: JudgmentContext): RoleAwareInterpretation {
  const { powerJudgment, defensibilityJudgment, riskProfile, input } = ctx;

  const headline = buildRAHeadline(defensibilityJudgment, riskProfile);
  const keyPoints: string[] = [];
  const implications: string[] = [];
  const actionItems: string[] = [];

  // Defensibility framing
  keyPoints.push(`Endpoint-method defensibility: ${defensibilityJudgment.rating.replace(/_/g, ' ')}.`);

  if (defensibilityJudgment.rating === 'poorly_matched' || defensibilityJudgment.rating === 'vulnerable') {
    implications.push('Regulatory reviewers are likely to challenge the statistical approach.');
    implications.push('Prepare written justification for the endpoint-method pairing before submission.');
    actionItems.push('Document rationale for statistical method selection with regulatory precedents.');
  }

  // Regulatory considerations
  for (const consideration of defensibilityJudgment.regulatoryConsiderations) {
    keyPoints.push(consideration);
  }

  // Risk items relevant to RA
  for (const risk of riskProfile.risks) {
    if (risk.severity === 'critical' || risk.severity === 'major') {
      implications.push(`${risk.riskType.replace(/_/g, ' ')}: ${risk.regulatoryImplication}`);
    }
  }

  // Power framing for RA
  if (powerJudgment.classification !== 'adequate') {
    actionItems.push('Ensure sample size rationale document addresses power adequacy concerns.');
  }

  // Missing data handling
  if (!input.missingDataMethod || input.missingDataMethod === 'none') {
    actionItems.push('Define missing data handling strategy aligned with ICH E9(R1) estimand framework.');
  }

  const riskFraming = `From a regulatory perspective, ${riskProfile.criticalCount} critical and ${riskProfile.majorCount} major statistical issues would likely be raised during review.`;

  return {
    role: 'ra_lead', headline, keyPoints, implications, actionItems, riskFraming,
    confidenceStatement: buildConfidenceStatement(powerJudgment, riskProfile),
  };
}

function buildRAHeadline(def: EndpointMethodDefensibility, risk: StatisticalRiskProfile): string {
  if (def.rating === 'poorly_matched') return 'Statistical method is inappropriate for the endpoint — expect regulatory pushback.';
  if (def.rating === 'vulnerable') return 'Endpoint-method pairing is vulnerable to reviewer challenge.';
  if (risk.criticalCount > 0) return 'Critical statistical deficiencies need resolution before submission.';
  if (risk.majorCount > 0) return 'Major statistical issues should be addressed to strengthen submission.';
  return 'Statistical design appears defensible for regulatory submission.';
}

// ═══════════════════════════════════════════════════════════════════════════════
// CLINICAL LEAD
// ═══════════════════════════════════════════════════════════════════════════════

function interpretForClinical(ctx: JudgmentContext): RoleAwareInterpretation {
  const { powerJudgment, fragilityJudgment, input, tradeoffAnalysis } = ctx;

  const keyPoints: string[] = [];
  const implications: string[] = [];
  const actionItems: string[] = [];

  // Endpoint interpretation
  keyPoints.push(`Primary endpoint: ${input.primaryEndpoint} (${input.endpointType}).`);
  keyPoints.push(`Study design: ${input.studyType} ${input.phase} trial in ${input.indication}.`);

  // Power in clinical terms
  if (powerJudgment.classification === 'underpowered') {
    implications.push('The study may fail to demonstrate a treatment effect even if the drug works — this is a design issue, not a drug issue.');
    actionItems.push('Discuss with biostatistics whether the expected treatment effect is realistic based on mechanism and prior data.');
  } else if (powerJudgment.classification === 'marginal') {
    implications.push('Power is marginal — the study has limited room for higher-than-expected patient variability or dropout.');
  }

  // Fragility in clinical terms
  if (fragilityJudgment.fragilityLevel === 'high') {
    implications.push('The design is sensitive to assumption changes — if the real treatment effect is smaller than planned, the study may fail.');
    actionItems.push('Review the assumed effect size against available clinical data (Phase II results, competitor data, natural history).');
  }

  // Attrition
  if (input.attritionAssumption > 0) {
    keyPoints.push(`Planned for ${(input.attritionAssumption * 100).toFixed(0)}% dropout. Retention strategies should target this rate or better.`);
  }

  // Safest path in clinical terms
  implications.push(`Statistical guidance: ${tradeoffAnalysis.safestPath}`);

  const headline = powerJudgment.classification === 'adequate'
    ? `${input.phase} design is statistically sound — focus on execution quality.`
    : `${input.phase} design has statistical concerns that affect clinical interpretation.`;

  return {
    role: 'clinical_lead', headline, keyPoints, implications, actionItems,
    riskFraming: `Clinical risk: if assumptions hold, the study is ${powerJudgment.classification}. Primary vulnerability: ${fragilityJudgment.likelyFailureModes[0] || 'none identified'}.`,
    confidenceStatement: buildConfidenceStatement(powerJudgment, ctx.riskProfile),
  };
}

// ═══════════════════════════════════════════════════════════════════════════════
// MEDICAL WRITER
// ═══════════════════════════════════════════════════════════════════════════════

function interpretForMedicalWriter(ctx: JudgmentContext): RoleAwareInterpretation {
  const { powerJudgment, defensibilityJudgment, input, riskProfile } = ctx;

  const keyPoints: string[] = [];
  const implications: string[] = [];
  const actionItems: string[] = [];

  // What to document
  keyPoints.push(`Sample size: ${input.computedSampleSize} (${input.allocationRatio}:1 allocation, ${(input.attritionAssumption * 100).toFixed(0)}% attrition buffer).`);
  keyPoints.push(`Power: ${(input.powerTarget * 100).toFixed(0)}% at alpha=${input.alpha} (two-sided).`);
  keyPoints.push(`Primary analysis: ${input.statisticalMethod} for ${input.endpointType} endpoint.`);

  // How to frame the rationale
  if (powerJudgment.classification === 'adequate') {
    implications.push('The sample size rationale section should present the design as well-powered with stated assumptions.');
  } else {
    implications.push(`The sample size rationale should acknowledge ${powerJudgment.classification} power and justify the approach.`);
  }

  // Caveats to include
  for (const caveat of defensibilityJudgment.caveats) {
    actionItems.push(`Include limitation/caveat: ${caveat}`);
  }

  // Key assumptions to document
  actionItems.push(`Document effect size assumption: ${input.effectSizeAssumption}${input.effectSizeUnit ? ' ' + input.effectSizeUnit : ''}.`);
  if (input.variance) actionItems.push(`Document variance/SD assumption: ${input.variance}.`);
  if (input.controlRate) actionItems.push(`Document control rate assumption: ${(input.controlRate * 100).toFixed(1)}%.`);

  const headline = 'Statistical design parameters and assumptions for protocol/CSR documentation.';

  return {
    role: 'medical_writer', headline, keyPoints, implications, actionItems,
    riskFraming: `Documentation should reflect ${riskProfile.risks.length} identified statistical consideration(s). Present assumptions transparently.`,
    confidenceStatement: buildConfidenceStatement(powerJudgment, riskProfile),
  };
}

// ═══════════════════════════════════════════════════════════════════════════════
// BIOSTATISTICIAN
// ═══════════════════════════════════════════════════════════════════════════════

function interpretForBiostatistician(ctx: JudgmentContext): RoleAwareInterpretation {
  const { powerJudgment, fragilityJudgment, defensibilityJudgment, riskProfile, input, tradeoffAnalysis } = ctx;

  const keyPoints: string[] = [];
  const implications: string[] = [];
  const actionItems: string[] = [];

  // Technical detail
  keyPoints.push(`Power: ${powerJudgment.effectivePower ? (powerJudgment.effectivePower * 100).toFixed(1) + '%' : 'indeterminate'} — classification: ${powerJudgment.classification}.`);
  keyPoints.push(`Fragility score: ${fragilityJudgment.fragilityScore}/100 (${fragilityJudgment.fragilityLevel}).`);
  keyPoints.push(`Endpoint-method fit: ${defensibilityJudgment.rating.replace(/_/g, ' ')}.`);
  keyPoints.push(`Overall risk: ${riskProfile.overallRiskLevel} (${riskProfile.criticalCount} critical, ${riskProfile.majorCount} major).`);

  // Assumptions doing the heavy lifting
  for (const dep of fragilityJudgment.keyDependencies) {
    implications.push(`Key assumption: ${dep}`);
  }

  // Sensitivity factors
  for (const factor of fragilityJudgment.sensitivityFactors) {
    if (factor.impact === 'high') {
      actionItems.push(`High-impact sensitivity: ${factor.parameter} — ${factor.description}`);
    }
  }

  // Failure modes
  for (const mode of fragilityJudgment.likelyFailureModes) {
    implications.push(`Failure mode: ${mode}`);
  }

  // Method-specific notes
  if (defensibilityJudgment.caveats.length > 0) {
    for (const caveat of defensibilityJudgment.caveats) {
      actionItems.push(`Address: ${caveat}`);
    }
  }

  // Tradeoff recommendations
  const favorableTradeoffs = tradeoffAnalysis.tradeoffs.filter(t => t.netAssessment === 'favorable');
  for (const t of favorableTradeoffs) {
    actionItems.push(`Consider: ${t.recommendation}`);
  }

  const headline = `${input.studyType} ${input.phase}: power=${powerJudgment.classification}, fragility=${fragilityJudgment.fragilityLevel}, risk=${riskProfile.overallRiskLevel}.`;

  return {
    role: 'biostatistician', headline, keyPoints, implications, actionItems,
    riskFraming: riskProfile.summary,
    confidenceStatement: `Assessment based on deterministic analysis of provided parameters. ${fragilityJudgment.sensitivityFactors.length} sensitivity factor(s) evaluated.`,
  };
}

// ═══════════════════════════════════════════════════════════════════════════════
// COMMON HELPERS
// ═══════════════════════════════════════════════════════════════════════════════

function buildConfidenceStatement(
  powerJudgment: PowerAdequacyJudgment,
  riskProfile: StatisticalRiskProfile,
): string {
  if (riskProfile.criticalCount > 0) {
    return 'Low confidence in current design — critical issues must be resolved.';
  }
  if (powerJudgment.classification === 'underpowered') {
    return 'Low confidence — design is underpowered.';
  }
  if (powerJudgment.classification === 'marginal') {
    return 'Moderate confidence — design has marginal power with limited safety margin.';
  }
  if (riskProfile.overallRiskLevel === 'low') {
    return 'High confidence — design is well-powered with manageable risks.';
  }
  return 'Moderate confidence — design is adequate but has identified risks to monitor.';
}

function buildCommonGround(ctx: JudgmentContext): string {
  const { powerJudgment, riskProfile, input } = ctx;
  return `${input.studyType} ${input.phase} trial in ${input.indication}: ` +
    `N=${input.computedSampleSize}, power=${powerJudgment.classification}, ` +
    `overall risk=${riskProfile.overallRiskLevel}. ` +
    `${riskProfile.risks.length} statistical consideration(s) identified.`;
}
