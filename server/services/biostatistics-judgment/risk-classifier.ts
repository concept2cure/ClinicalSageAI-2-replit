/**
 * Module 5 — Statistical Risk Classifier
 *
 * Maps issues to statistical risk types: underpower, assumption fragility,
 * endpoint-method mismatch, attrition sensitivity, overinterpretation,
 * precision instability, multiplicity, missing data.
 *
 * Deterministic mapping — no LLM involvement.
 *
 * @module server/services/biostatistics-judgment/risk-classifier
 */

import type {
  StudyDesignInput,
  StatisticalRisk,
  StatisticalRiskProfile,
  StatisticalRiskType,
  RiskSeverity,
  PowerAdequacyJudgment,
  AssumptionFragility,
  EndpointMethodDefensibility,
} from './types';

// ═══════════════════════════════════════════════════════════════════════════════
// RISK CLASSIFICATION ENGINE
// ═══════════════════════════════════════════════════════════════════════════════

export function classifyStatisticalRisks(
  input: StudyDesignInput,
  powerJudgment: PowerAdequacyJudgment,
  fragilityJudgment: AssumptionFragility,
  defensibilityJudgment: EndpointMethodDefensibility,
): StatisticalRiskProfile {
  const risks: StatisticalRisk[] = [];

  // 1. Underpower risk
  const underpowerRisk = assessUnderpowerRisk(input, powerJudgment);
  if (underpowerRisk) risks.push(underpowerRisk);

  // 2. Assumption fragility risk
  const fragilityRisk = assessFragilityRisk(fragilityJudgment);
  if (fragilityRisk) risks.push(fragilityRisk);

  // 3. Endpoint-method mismatch risk
  const mismatchRisk = assessMismatchRisk(defensibilityJudgment);
  if (mismatchRisk) risks.push(mismatchRisk);

  // 4. Attrition sensitivity risk
  const attritionRisk = assessAttritionRisk(input);
  if (attritionRisk) risks.push(attritionRisk);

  // 5. Overinterpretation risk
  const overinterpretationRisk = assessOverinterpretationRisk(input, powerJudgment);
  if (overinterpretationRisk) risks.push(overinterpretationRisk);

  // 6. Precision instability risk
  const precisionRisk = assessPrecisionInstabilityRisk(input);
  if (precisionRisk) risks.push(precisionRisk);

  // 7. Multiplicity risk
  const multiplicityRisk = assessMultiplicityRisk(input);
  if (multiplicityRisk) risks.push(multiplicityRisk);

  // 8. Missing data risk
  const missingDataRisk = assessMissingDataRisk(input);
  if (missingDataRisk) risks.push(missingDataRisk);

  // Sort by severity
  const severityOrder: Record<RiskSeverity, number> = { critical: 0, major: 1, minor: 2, informational: 3 };
  risks.sort((a, b) => severityOrder[a.severity] - severityOrder[b.severity]);

  const criticalCount = risks.filter(r => r.severity === 'critical').length;
  const majorCount = risks.filter(r => r.severity === 'major').length;

  const overallRiskLevel =
    criticalCount > 0 ? 'critical' as const :
    majorCount >= 2 ? 'high' as const :
    majorCount === 1 ? 'moderate' as const :
    'low' as const;

  return {
    risks,
    overallRiskLevel,
    criticalCount,
    majorCount,
    topRisk: risks[0] ?? null,
    summary: buildRiskSummary(risks, overallRiskLevel),
  };
}

// ═══════════════════════════════════════════════════════════════════════════════
// INDIVIDUAL RISK ASSESSORS
// ═══════════════════════════════════════════════════════════════════════════════

function assessUnderpowerRisk(
  input: StudyDesignInput,
  powerJudgment: PowerAdequacyJudgment,
): StatisticalRisk | null {
  if (powerJudgment.classification === 'underpowered') {
    return {
      riskType: 'underpower_risk',
      severity: input.phase === 'III' ? 'critical' : 'major',
      description: `Design is underpowered (${powerJudgment.effectivePower ? (powerJudgment.effectivePower * 100).toFixed(1) + '%' : 'unknown'} power). High probability of failing to detect a true treatment effect.`,
      evidence: powerJudgment.rationale.slice(),
      mitigation: 'Increase sample size, reconsider effect size assumptions, or simplify the design to reduce required power.',
      regulatoryImplication: 'Regulatory reviewers will likely request justification or reject the design as inadequate.',
    };
  }
  if (powerJudgment.classification === 'marginal') {
    return {
      riskType: 'underpower_risk',
      severity: 'major',
      description: `Design has marginal power (${powerJudgment.effectivePower ? (powerJudgment.effectivePower * 100).toFixed(1) + '%' : 'unknown'}). Limited margin for assumption deviations.`,
      evidence: powerJudgment.rationale.slice(),
      mitigation: 'Consider 10-20% sample size increase to provide adequate margin.',
      regulatoryImplication: 'May be acceptable if assumptions are well-justified, but provides limited buffer.',
    };
  }
  return null;
}

function assessFragilityRisk(fragilityJudgment: AssumptionFragility): StatisticalRisk | null {
  if (fragilityJudgment.fragilityLevel === 'high') {
    return {
      riskType: 'assumption_fragility',
      severity: 'major',
      description: `High assumption fragility (score: ${fragilityJudgment.fragilityScore}/100). Design is sensitive to assumption shifts.`,
      evidence: fragilityJudgment.likelyFailureModes.slice(),
      mitigation: 'Use more conservative assumptions, add sensitivity analyses to the SAP, or include adaptive elements.',
      regulatoryImplication: 'Reviewers may request sensitivity analyses demonstrating robustness to assumption deviations.',
    };
  }
  if (fragilityJudgment.fragilityLevel === 'moderate') {
    return {
      riskType: 'assumption_fragility',
      severity: 'minor',
      description: `Moderate assumption fragility (score: ${fragilityJudgment.fragilityScore}/100). Key assumptions should be monitored.`,
      evidence: fragilityJudgment.keyDependencies.slice(),
      mitigation: 'Document assumption basis and plan sensitivity analyses for key parameters.',
      regulatoryImplication: 'Standard — document rationale for key assumptions.',
    };
  }
  return null;
}

function assessMismatchRisk(defensibility: EndpointMethodDefensibility): StatisticalRisk | null {
  if (defensibility.rating === 'poorly_matched') {
    return {
      riskType: 'endpoint_method_mismatch',
      severity: 'critical',
      description: 'Statistical method is inappropriate for the chosen endpoint type.',
      evidence: [...defensibility.limitations, defensibility.methodAssessment],
      mitigation: 'Select a method appropriate for the endpoint type. ' + defensibility.pairingAssessment,
      regulatoryImplication: 'This mismatch will likely result in regulatory rejection or a request for re-analysis.',
    };
  }
  if (defensibility.rating === 'vulnerable') {
    return {
      riskType: 'endpoint_method_mismatch',
      severity: 'major',
      description: 'Endpoint-method pairing is vulnerable to regulatory challenge.',
      evidence: [...defensibility.caveats, defensibility.methodAssessment],
      mitigation: 'Consider alternative methods or provide strong justification for the current choice.',
      regulatoryImplication: 'Reviewers may question the method choice — prepare justification.',
    };
  }
  return null;
}

function assessAttritionRisk(input: StudyDesignInput): StatisticalRisk | null {
  if (input.attritionAssumption <= 0) {
    return {
      riskType: 'attrition_sensitivity',
      severity: 'major',
      description: 'No attrition is assumed — any dropout will directly reduce effective sample size and power.',
      evidence: ['Zero attrition assumption in study design input.'],
      mitigation: 'Include realistic attrition estimates (typically 10-25% depending on indication and duration).',
      regulatoryImplication: 'Reviewers expect sample size to account for anticipated dropout.',
    };
  }
  if (input.attritionAssumption >= 0.30) {
    return {
      riskType: 'attrition_sensitivity',
      severity: 'major',
      description: `High attrition assumption (${(input.attritionAssumption * 100).toFixed(0)}%) — indicates challenging study population or design.`,
      evidence: [`Attrition rate of ${(input.attritionAssumption * 100).toFixed(0)}% specified.`],
      mitigation: 'Consider strategies to reduce dropout: shorter study duration, fewer visits, better patient retention.',
      regulatoryImplication: 'High attrition raises concerns about data quality and generalizability of results.',
    };
  }
  return null;
}

function assessOverinterpretationRisk(
  input: StudyDesignInput,
  powerJudgment: PowerAdequacyJudgment,
): StatisticalRisk | null {
  // Small studies with high power claims
  if (input.computedSampleSize < 50 && input.powerTarget >= 0.80) {
    return {
      riskType: 'overinterpretation_risk',
      severity: 'minor',
      description: `Small sample (N=${input.computedSampleSize}) with ${(input.powerTarget * 100).toFixed(0)}% power target — results may be unstable and overinterpreted.`,
      evidence: ['Small total sample size', 'High power claim requires large assumed effect size'],
      mitigation: 'Consider whether the assumed effect size is realistic for such a small study. Present confidence intervals prominently.',
      regulatoryImplication: 'Small studies with large effect claims receive additional scrutiny.',
    };
  }
  // Single-arm with no comparator
  if (input.studyType === 'single_arm') {
    return {
      riskType: 'overinterpretation_risk',
      severity: 'minor',
      description: 'Single-arm design limits causal inference — results should not be overinterpreted.',
      evidence: ['No concurrent control group for comparison.'],
      mitigation: 'Use historical controls for context. Clearly state limitations in interpretation.',
      regulatoryImplication: 'Acceptable for accelerated approval in oncology; limited for confirmatory evidence.',
    };
  }
  return null;
}

function assessPrecisionInstabilityRisk(input: StudyDesignInput): StatisticalRisk | null {
  // Very small per-group sample
  const perGroup = input.allocationRatio === 1
    ? input.computedSampleSize / 2
    : input.computedSampleSize / (1 + input.allocationRatio);

  if (perGroup < 30 && input.endpointType === 'continuous') {
    return {
      riskType: 'precision_instability',
      severity: 'minor',
      description: `Small per-group sample (n≈${Math.round(perGroup)}) for continuous endpoint — parameter estimates may be imprecise.`,
      evidence: [`Per-group N ≈ ${Math.round(perGroup)}`, 'Continuous endpoint requires adequate N for stable variance estimation.'],
      mitigation: 'Consider non-parametric alternatives or exact methods for small samples.',
      regulatoryImplication: 'Small-sample results should include appropriate confidence intervals and stability assessments.',
    };
  }
  if (perGroup < 20 && input.endpointType === 'binary') {
    return {
      riskType: 'precision_instability',
      severity: 'minor',
      description: `Very small per-group sample (n≈${Math.round(perGroup)}) for binary endpoint — proportion estimates will be imprecise.`,
      evidence: [`Per-group N ≈ ${Math.round(perGroup)}`],
      mitigation: 'Use exact methods (Fisher exact test, exact confidence intervals).',
      regulatoryImplication: 'Exact methods preferred over asymptotic methods for small binary endpoint studies.',
    };
  }
  return null;
}

function assessMultiplicityRisk(input: StudyDesignInput): StatisticalRisk | null {
  const hasMultipleEndpoints = input.interimAnalyses && input.interimAnalyses > 0;
  const hasNoAdjustment = !input.multiplicityAdjustment || input.multiplicityAdjustment === 'none';

  if (hasMultipleEndpoints && hasNoAdjustment) {
    return {
      riskType: 'multiplicity_risk',
      severity: 'major',
      description: 'Interim analyses or multiple comparisons present without multiplicity adjustment.',
      evidence: [
        `${input.interimAnalyses} interim analysis/analyses planned`,
        'No multiplicity adjustment specified',
      ],
      mitigation: 'Implement alpha-spending function (O\'Brien-Fleming, Lan-DeMets) or fixed-sequence testing.',
      regulatoryImplication: 'Type I error inflation is a critical regulatory concern — multiplicity must be controlled.',
    };
  }
  return null;
}

function assessMissingDataRisk(input: StudyDesignInput): StatisticalRisk | null {
  if (!input.missingDataMethod || input.missingDataMethod === 'none' || input.missingDataMethod === 'complete_case') {
    if (input.attritionAssumption > 0.10) {
      return {
        riskType: 'missing_data_risk',
        severity: 'major',
        description: `Missing data method is "${input.missingDataMethod || 'not specified'}" with ${(input.attritionAssumption * 100).toFixed(0)}% expected attrition — results may be biased.`,
        evidence: [
          `Expected attrition: ${(input.attritionAssumption * 100).toFixed(0)}%`,
          `Missing data handling: ${input.missingDataMethod || 'not specified'}`,
        ],
        mitigation: 'Consider multiple imputation, mixed-effects models (MMRM), or pattern-mixture models for handling missing data.',
        regulatoryImplication: 'ICH E9(R1) recommends pre-specified strategies for handling missing data aligned with estimand framework.',
      };
    }
  }
  return null;
}

// ═══════════════════════════════════════════════════════════════════════════════
// SUMMARY
// ═══════════════════════════════════════════════════════════════════════════════

function buildRiskSummary(
  risks: readonly StatisticalRisk[],
  overallLevel: StatisticalRiskProfile['overallRiskLevel'],
): string {
  if (risks.length === 0) {
    return 'No significant statistical risks identified. Design appears well-constructed.';
  }

  const criticals = risks.filter(r => r.severity === 'critical');
  const majors = risks.filter(r => r.severity === 'major');

  if (criticals.length > 0) {
    return `CRITICAL: ${criticals.length} critical risk(s) identified — ${criticals.map(r => r.riskType.replace(/_/g, ' ')).join(', ')}. ` +
      `These must be addressed before proceeding. ${majors.length} additional major risk(s).`;
  }
  if (majors.length > 0) {
    return `${majors.length} major risk(s) identified — ${majors.map(r => r.riskType.replace(/_/g, ' ')).join(', ')}. ` +
      `Address these to strengthen the design.`;
  }
  return `${risks.length} minor/informational risk(s) identified. Design is generally sound with minor considerations.`;
}
