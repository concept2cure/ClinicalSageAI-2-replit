/**
 * Judgment Framework — Central Regulatory Intelligence Scoring Layer
 *
 * Codified scoring and reasoning that sits on top of LLMs.
 * Not a neural net — a deterministic + heuristic + LLM-assisted hybrid.
 *
 * Judgment Models:
 *   1. Evidence Sufficiency — is the evidence base strong enough?
 *   2. Defensibility — can this withstand regulatory scrutiny?
 *   3. Reviewer Sensitivity — how likely to trigger reviewer questions?
 *   4. Claim Risk — is the claim supportable?
 *   5. Cross-Section Consistency — are sections internally consistent?
 *   6. Submission Risk — overall submission risk profile
 *
 * Each model produces a JudgmentScore (0-100) with:
 *   - score value
 *   - confidence in the score
 *   - contributing factors
 *   - actionable findings
 *
 * @module server/services/intelligence/judgment-framework
 */

import type {
  ReadinessScore,
  ReadinessGap,
} from './readiness-scoring-engine.js';
import type {
  EvidenceChain,
  ConfidenceBasis,
} from './evidence-confidence-model.js';
import type { Recommendation } from './recommendation-engine.js';
import type { SignalReliability } from './learning-loop-service.js';

// ═══════════════════════════════════════════════════════════════════════════════
// VERSION — bumped when scoring logic changes (enables provenance tracking)
// ═══════════════════════════════════════════════════════════════════════════════

export const JUDGMENT_FRAMEWORK_VERSION = '1.2.0';

// ═══════════════════════════════════════════════════════════════════════════════
// TYPES
// ═══════════════════════════════════════════════════════════════════════════════

export type JudgmentModel =
  | 'evidence_sufficiency'
  | 'defensibility'
  | 'reviewer_sensitivity'
  | 'claim_risk'
  | 'cross_section_consistency'
  | 'submission_risk';

export interface JudgmentScore {
  readonly model: JudgmentModel;
  readonly score: number; // 0-100
  readonly confidence: number; // 0-100 — how confident we are in this score
  readonly basis: ConfidenceBasis;
  readonly verdict: JudgmentVerdict;
  readonly factors: readonly JudgmentFactor[];
  readonly findings: readonly JudgmentFinding[];
  readonly scoredAt: string;
}

export type JudgmentVerdict =
  | 'pass'           // No concerns
  | 'acceptable'     // Minor concerns, not blocking
  | 'needs_attention' // Moderate concerns, should address
  | 'at_risk'        // Significant concerns, must address
  | 'fail';          // Critical issues, blocking

export interface JudgmentFactor {
  readonly name: string;
  readonly weight: number; // 0-1
  readonly rawScore: number; // 0-100
  readonly weightedScore: number; // rawScore * weight
  readonly detail: string;
}

export interface JudgmentFinding {
  readonly id: string;
  readonly severity: 'critical' | 'high' | 'medium' | 'low';
  readonly category: string;
  readonly description: string;
  readonly remediation: string;
  readonly reviewerImpact: 'likely_question' | 'possible_question' | 'unlikely_question';
}

export interface JudgmentContext {
  readonly organizationId: number;
  readonly projectId: number;
  readonly sectionCode?: string;
  readonly submissionType?: string;
  readonly targetAgency?: string;
}

export interface JudgmentReport {
  readonly frameworkVersion: string;
  readonly context: JudgmentContext;
  readonly scores: readonly JudgmentScore[];
  readonly overallRisk: number; // 0-100 composite
  readonly overallVerdict: JudgmentVerdict;
  readonly topFindings: readonly JudgmentFinding[];
  readonly generatedAt: string;
}

// ═══════════════════════════════════════════════════════════════════════════════
// VERDICT THRESHOLDS
// ═══════════════════════════════════════════════════════════════════════════════

const VERDICT_THRESHOLDS: Record<JudgmentVerdict, { min: number; max: number }> = {
  pass: { min: 85, max: 100 },
  acceptable: { min: 70, max: 84 },
  needs_attention: { min: 50, max: 69 },
  at_risk: { min: 25, max: 49 },
  fail: { min: 0, max: 24 },
};

function scoreToVerdict(score: number): JudgmentVerdict {
  if (score >= 85) return 'pass';
  if (score >= 70) return 'acceptable';
  if (score >= 50) return 'needs_attention';
  if (score >= 25) return 'at_risk';
  return 'fail';
}

// ═══════════════════════════════════════════════════════════════════════════════
// MODEL WEIGHTS — how each judgment model contributes to overall risk
// ═══════════════════════════════════════════════════════════════════════════════

const MODEL_WEIGHTS: Record<JudgmentModel, number> = {
  evidence_sufficiency: 0.25,
  defensibility: 0.20,
  reviewer_sensitivity: 0.15,
  claim_risk: 0.15,
  cross_section_consistency: 0.10,
  submission_risk: 0.15,
};

// ═══════════════════════════════════════════════════════════════════════════════
// EVIDENCE SUFFICIENCY MODEL
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Evaluate whether the evidence base is sufficient for regulatory submission.
 * Draws on readiness scoring and evidence chain data.
 */
export function evaluateEvidenceSufficiency(
  readiness: ReadinessScore | null,
  evidenceChains: readonly EvidenceChain[],
  recommendations: readonly Recommendation[],
): JudgmentScore {
  const factors: JudgmentFactor[] = [];
  const findings: JudgmentFinding[] = [];

  // Factor 1: Overall readiness completeness
  const completeness = readiness?.dimensions.completeness ?? 50;
  factors.push({
    name: 'document_completeness',
    weight: 0.30,
    rawScore: completeness,
    weightedScore: completeness * 0.30,
    detail: `Document completeness at ${completeness}%`,
  });

  // Factor 2: Evidence chain strength
  const strongChains = evidenceChains.filter(c => c.chainStrength === 'strong').length;
  const totalChains = evidenceChains.length || 1;
  const chainStrengthScore = Math.round((strongChains / totalChains) * 100);
  factors.push({
    name: 'evidence_chain_strength',
    weight: 0.25,
    rawScore: chainStrengthScore,
    weightedScore: chainStrengthScore * 0.25,
    detail: `${strongChains}/${totalChains} evidence chains are strong`,
  });

  // Factor 3: Evidence gap count
  const evidenceGaps = recommendations.filter(r => r.type === 'evidence_gap');
  const gapPenalty = Math.max(0, 100 - (evidenceGaps.length * 15));
  factors.push({
    name: 'evidence_gaps',
    weight: 0.25,
    rawScore: gapPenalty,
    weightedScore: gapPenalty * 0.25,
    detail: `${evidenceGaps.length} evidence gap(s) detected`,
  });

  // Factor 4: Quality dimension
  const quality = readiness?.dimensions.quality ?? 50;
  factors.push({
    name: 'quality_score',
    weight: 0.20,
    rawScore: quality,
    weightedScore: quality * 0.20,
    detail: `Quality dimension at ${quality}%`,
  });

  // Generate findings for evidence gaps
  for (const gap of evidenceGaps) {
    findings.push({
      id: `esf_${gap.recommendationId}`,
      severity: gap.severity,
      category: 'evidence_gap',
      description: gap.reason,
      remediation: gap.suggestedAction,
      reviewerImpact: gap.severity === 'critical' ? 'likely_question' : 'possible_question',
    });
  }

  // Weak evidence chains
  const weakChains = evidenceChains.filter(c => c.chainStrength === 'weak');
  for (const chain of weakChains) {
    findings.push({
      id: `esf_weak_${chain.primarySource.sourceId}`,
      severity: 'medium',
      category: 'weak_evidence',
      description: `Weak evidence chain from "${chain.primarySource.sourceTitle}"`,
      remediation: 'Strengthen evidence by adding supporting sources or regulatory references',
      reviewerImpact: 'possible_question',
    });
  }

  const totalScore = Math.round(factors.reduce((sum, f) => sum + f.weightedScore, 0));

  return {
    model: 'evidence_sufficiency',
    score: totalScore,
    confidence: readiness ? 80 : 40,
    basis: 'rules_based',
    verdict: scoreToVerdict(totalScore),
    factors,
    findings,
    scoredAt: new Date().toISOString(),
  };
}

// ═══════════════════════════════════════════════════════════════════════════════
// DEFENSIBILITY MODEL
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Evaluate how defensible the current submission state is under regulatory scrutiny.
 */
export function evaluateDefensibility(
  readiness: ReadinessScore | null,
  gaps: readonly ReadinessGap[],
  recommendations: readonly Recommendation[],
): JudgmentScore {
  const factors: JudgmentFactor[] = [];
  const findings: JudgmentFinding[] = [];

  // Factor 1: Compliance dimension
  const compliance = readiness?.dimensions.compliance ?? 50;
  factors.push({
    name: 'compliance_alignment',
    weight: 0.30,
    rawScore: compliance,
    weightedScore: compliance * 0.30,
    detail: `Compliance alignment at ${compliance}%`,
  });

  // Factor 2: Critical gap count
  const criticalGaps = gaps.filter(g => g.severity === 'critical');
  const criticalPenalty = Math.max(0, 100 - (criticalGaps.length * 25));
  factors.push({
    name: 'critical_gap_exposure',
    weight: 0.30,
    rawScore: criticalPenalty,
    weightedScore: criticalPenalty * 0.30,
    detail: `${criticalGaps.length} critical gap(s) — each significantly weakens defensibility`,
  });

  // Factor 3: Consistency dimension
  const consistency = readiness?.dimensions.consistency ?? 50;
  factors.push({
    name: 'internal_consistency',
    weight: 0.20,
    rawScore: consistency,
    weightedScore: consistency * 0.20,
    detail: `Cross-section consistency at ${consistency}%`,
  });

  // Factor 4: Unresolved compliance recommendations
  const complianceRecs = recommendations.filter(
    r => r.type === 'compliance_gap' && r.status === 'active',
  );
  const compliancePenalty = Math.max(0, 100 - (complianceRecs.length * 12));
  factors.push({
    name: 'open_compliance_issues',
    weight: 0.20,
    rawScore: compliancePenalty,
    weightedScore: compliancePenalty * 0.20,
    detail: `${complianceRecs.length} unresolved compliance recommendation(s)`,
  });

  // Findings for critical gaps
  for (const gap of criticalGaps) {
    findings.push({
      id: `def_${gap.id}`,
      severity: 'critical',
      category: 'defensibility_gap',
      description: `Critical gap in ${gap.module}: ${gap.description}`,
      remediation: gap.remediation,
      reviewerImpact: 'likely_question',
    });
  }

  const totalScore = Math.round(factors.reduce((sum, f) => sum + f.weightedScore, 0));

  return {
    model: 'defensibility',
    score: totalScore,
    confidence: readiness ? 75 : 35,
    basis: 'rules_based',
    verdict: scoreToVerdict(totalScore),
    factors,
    findings,
    scoredAt: new Date().toISOString(),
  };
}

// ═══════════════════════════════════════════════════════════════════════════════
// REVIEWER SENSITIVITY MODEL
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Estimate how likely the submission is to trigger reviewer questions.
 * Higher score = lower sensitivity (fewer expected questions).
 */
export function evaluateReviewerSensitivity(
  readiness: ReadinessScore | null,
  gaps: readonly ReadinessGap[],
  recommendations: readonly Recommendation[],
): JudgmentScore {
  const factors: JudgmentFactor[] = [];
  const findings: JudgmentFinding[] = [];

  // Factor 1: Predicted deficiency count
  const predictedDeficiencies = readiness?.predictions.estimatedDeficiencies ?? 5;
  const deficiencyScore = Math.max(0, 100 - (predictedDeficiencies * 10));
  factors.push({
    name: 'predicted_deficiencies',
    weight: 0.35,
    rawScore: deficiencyScore,
    weightedScore: deficiencyScore * 0.35,
    detail: `${predictedDeficiencies} deficiencies predicted`,
  });

  // Factor 2: High-severity gap density
  const highGaps = gaps.filter(g => g.severity === 'critical' || g.severity === 'high');
  const highGapScore = Math.max(0, 100 - (highGaps.length * 15));
  factors.push({
    name: 'high_severity_gap_density',
    weight: 0.30,
    rawScore: highGapScore,
    weightedScore: highGapScore * 0.30,
    detail: `${highGaps.length} high/critical gap(s) that reviewers are likely to flag`,
  });

  // Factor 3: Cross-reference issues
  const crossRefIssues = recommendations.filter(r => r.type === 'cross_reference_issue');
  const crossRefScore = Math.max(0, 100 - (crossRefIssues.length * 20));
  factors.push({
    name: 'cross_reference_integrity',
    weight: 0.20,
    rawScore: crossRefScore,
    weightedScore: crossRefScore * 0.20,
    detail: `${crossRefIssues.length} cross-reference issue(s)`,
  });

  // Factor 4: Approval probability
  const approvalProb = readiness?.predictions.approvalProbability ?? 50;
  factors.push({
    name: 'approval_probability',
    weight: 0.15,
    rawScore: approvalProb,
    weightedScore: approvalProb * 0.15,
    detail: `Predicted approval probability: ${approvalProb}%`,
  });

  // Findings for sensitive areas
  for (const gap of highGaps) {
    findings.push({
      id: `rsm_${gap.id}`,
      severity: gap.severity,
      category: 'reviewer_trigger',
      description: `${gap.module}: ${gap.description} — likely to trigger reviewer attention`,
      remediation: gap.remediation,
      reviewerImpact: 'likely_question',
    });
  }

  const totalScore = Math.round(factors.reduce((sum, f) => sum + f.weightedScore, 0));

  return {
    model: 'reviewer_sensitivity',
    score: totalScore,
    confidence: readiness ? 70 : 30,
    basis: 'rules_based',
    verdict: scoreToVerdict(totalScore),
    factors,
    findings,
    scoredAt: new Date().toISOString(),
  };
}

// ═══════════════════════════════════════════════════════════════════════════════
// CLAIM RISK MODEL
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Evaluate risk associated with claims made in the submission.
 * Higher score = lower claim risk.
 */
export function evaluateClaimRisk(
  recommendations: readonly Recommendation[],
  evidenceChains: readonly EvidenceChain[],
): JudgmentScore {
  const factors: JudgmentFactor[] = [];
  const findings: JudgmentFinding[] = [];

  // Factor 1: Quality gaps (often indicate unsupported claims)
  const qualityGaps = recommendations.filter(r => r.type === 'quality_gap');
  const qualityScore = Math.max(0, 100 - (qualityGaps.length * 12));
  factors.push({
    name: 'unsupported_claim_indicators',
    weight: 0.35,
    rawScore: qualityScore,
    weightedScore: qualityScore * 0.35,
    detail: `${qualityGaps.length} quality gap(s) that may indicate unsupported claims`,
  });

  // Factor 2: AI-inferred vs rules-based evidence ratio
  const aiInferred = evidenceChains.filter(c => c.confidenceBasis === 'ai_inferred').length;
  const total = evidenceChains.length || 1;
  const aiRatio = aiInferred / total;
  const aiRatioScore = Math.round((1 - aiRatio * 0.5) * 100); // Penalize high AI-inferred ratio
  factors.push({
    name: 'evidence_basis_quality',
    weight: 0.30,
    rawScore: aiRatioScore,
    weightedScore: aiRatioScore * 0.30,
    detail: `${Math.round(aiRatio * 100)}% of evidence chains are AI-inferred`,
  });

  // Factor 3: Validation failures
  const validationFailures = recommendations.filter(r => r.type === 'validation_failure');
  const validationScore = Math.max(0, 100 - (validationFailures.length * 15));
  factors.push({
    name: 'validation_status',
    weight: 0.35,
    rawScore: validationScore,
    weightedScore: validationScore * 0.35,
    detail: `${validationFailures.length} validation failure(s)`,
  });

  // Findings
  for (const gap of qualityGaps.filter(g => g.severity === 'critical' || g.severity === 'high')) {
    findings.push({
      id: `cr_${gap.recommendationId}`,
      severity: gap.severity,
      category: 'claim_risk',
      description: gap.reason,
      remediation: gap.suggestedAction,
      reviewerImpact: gap.severity === 'critical' ? 'likely_question' : 'possible_question',
    });
  }

  const totalScore = Math.round(factors.reduce((sum, f) => sum + f.weightedScore, 0));

  return {
    model: 'claim_risk',
    score: totalScore,
    confidence: 65,
    basis: 'rules_based',
    verdict: scoreToVerdict(totalScore),
    factors,
    findings,
    scoredAt: new Date().toISOString(),
  };
}

// ═══════════════════════════════════════════════════════════════════════════════
// CROSS-SECTION CONSISTENCY MODEL
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Evaluate consistency across document sections.
 * Reuses readiness consistency dimension + cross-reference recommendations.
 */
export function evaluateCrossSectionConsistency(
  readiness: ReadinessScore | null,
  recommendations: readonly Recommendation[],
): JudgmentScore {
  const factors: JudgmentFactor[] = [];
  const findings: JudgmentFinding[] = [];

  // Factor 1: Consistency dimension from readiness
  const consistency = readiness?.dimensions.consistency ?? 50;
  factors.push({
    name: 'readiness_consistency',
    weight: 0.50,
    rawScore: consistency,
    weightedScore: consistency * 0.50,
    detail: `Cross-section consistency from readiness engine: ${consistency}%`,
  });

  // Factor 2: Cross-reference issues
  const crossRefIssues = recommendations.filter(r => r.type === 'cross_reference_issue');
  const crossRefScore = Math.max(0, 100 - (crossRefIssues.length * 20));
  factors.push({
    name: 'cross_reference_integrity',
    weight: 0.30,
    rawScore: crossRefScore,
    weightedScore: crossRefScore * 0.30,
    detail: `${crossRefIssues.length} cross-reference issue(s)`,
  });

  // Factor 3: Incomplete sections
  const incompleteSections = recommendations.filter(r => r.type === 'incomplete_section');
  const incompleteScore = Math.max(0, 100 - (incompleteSections.length * 10));
  factors.push({
    name: 'section_completeness',
    weight: 0.20,
    rawScore: incompleteScore,
    weightedScore: incompleteScore * 0.20,
    detail: `${incompleteSections.length} incomplete section(s)`,
  });

  for (const issue of crossRefIssues) {
    findings.push({
      id: `csc_${issue.recommendationId}`,
      severity: issue.severity,
      category: 'consistency',
      description: issue.reason,
      remediation: issue.suggestedAction,
      reviewerImpact: 'likely_question',
    });
  }

  const totalScore = Math.round(factors.reduce((sum, f) => sum + f.weightedScore, 0));

  return {
    model: 'cross_section_consistency',
    score: totalScore,
    confidence: readiness ? 75 : 30,
    basis: 'rules_based',
    verdict: scoreToVerdict(totalScore),
    factors,
    findings,
    scoredAt: new Date().toISOString(),
  };
}

// ═══════════════════════════════════════════════════════════════════════════════
// SUBMISSION RISK MODEL — COMPOSITE
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Compute overall submission risk from all other judgment models.
 */
export function evaluateSubmissionRisk(
  componentScores: readonly JudgmentScore[],
): JudgmentScore {
  const factors: JudgmentFactor[] = [];
  const findings: JudgmentFinding[] = [];

  for (const score of componentScores) {
    const weight = MODEL_WEIGHTS[score.model] ?? 0.10;
    factors.push({
      name: score.model,
      weight,
      rawScore: score.score,
      weightedScore: score.score * weight,
      detail: `${score.model}: ${score.score}/100 (${score.verdict})`,
    });

    // Bubble up critical/high findings
    for (const finding of score.findings) {
      if (finding.severity === 'critical' || finding.severity === 'high') {
        findings.push(finding);
      }
    }
  }

  const totalScore = Math.round(factors.reduce((sum, f) => sum + f.weightedScore, 0));

  // Confidence is weighted average of component confidences
  const avgConfidence = componentScores.length > 0
    ? Math.round(componentScores.reduce((s, c) => s + c.confidence, 0) / componentScores.length)
    : 30;

  return {
    model: 'submission_risk',
    score: totalScore,
    confidence: avgConfidence,
    basis: 'rules_based',
    verdict: scoreToVerdict(totalScore),
    factors,
    findings: findings.sort((a, b) => {
      const order = { critical: 0, high: 1, medium: 2, low: 3 };
      return order[a.severity] - order[b.severity];
    }),
    scoredAt: new Date().toISOString(),
  };
}

// ═══════════════════════════════════════════════════════════════════════════════
// FULL JUDGMENT REPORT
// ═══════════════════════════════════════════════════════════════════════════════

export interface JudgmentInput {
  readonly readiness: ReadinessScore | null;
  readonly gaps: readonly ReadinessGap[];
  readonly recommendations: readonly Recommendation[];
  readonly evidenceChains: readonly EvidenceChain[];
  /**
   * Optional historical reliability of prior signals for this project,
   * derived from the closed learning loop. When present with a non-null
   * `reliabilityIndex`, it modulates per-model confidence so judgment
   * outputs reflect how accurate our readings have been for this project
   * in the past. Leaving it undefined preserves the pre-1.1 behavior —
   * tests and callers that don't plumb feedback through see no change.
   */
  readonly signalReliability?: SignalReliability;
}

/**
 * Compute the multiplier applied to model confidence based on historical
 * signal reliability. Conservative floor of 0.7× ensures that a handful of
 * disputed signals can't nullify confidence — reliability is informative,
 * not determinative.
 *
 *   reliabilityIndex=0.0 → 0.70× confidence
 *   reliabilityIndex=0.5 → 0.85× confidence
 *   reliabilityIndex=1.0 → 1.00× confidence
 */
function reliabilityConfidenceMultiplier(reliabilityIndex: number): number {
  const clamped = Math.max(0, Math.min(1, reliabilityIndex));
  return 0.7 + 0.3 * clamped;
}

function adjustScoreConfidence(
  score: JudgmentScore,
  multiplier: number,
): JudgmentScore {
  const adjusted = Math.round(score.confidence * multiplier);
  return {
    ...score,
    confidence: Math.max(0, Math.min(100, adjusted)),
  };
}

/**
 * Generate a full judgment report across all models.
 */
export function generateJudgmentReport(
  ctx: JudgmentContext,
  input: JudgmentInput,
): JudgmentReport {
  const { readiness, gaps, recommendations, evidenceChains, signalReliability } = input;

  const evidenceSufficiency = evaluateEvidenceSufficiency(readiness, evidenceChains, recommendations);
  const defensibility = evaluateDefensibility(readiness, gaps, recommendations);
  const reviewerSensitivity = evaluateReviewerSensitivity(readiness, gaps, recommendations);
  const claimRisk = evaluateClaimRisk(recommendations, evidenceChains);
  const crossSectionConsistency = evaluateCrossSectionConsistency(readiness, recommendations);

  const componentScores = [
    evidenceSufficiency,
    defensibility,
    reviewerSensitivity,
    claimRisk,
    crossSectionConsistency,
  ];

  const submissionRisk = evaluateSubmissionRisk(componentScores);

  // Apply reliability adjustment uniformly across all scores when historical
  // signal accuracy is known. Scores themselves reflect the data; only our
  // confidence in those readings is modulated.
  let allScores: JudgmentScore[] = [...componentScores, submissionRisk];
  if (
    signalReliability &&
    signalReliability.reliabilityIndex !== null &&
    signalReliability.totalValidations > 0
  ) {
    const multiplier = reliabilityConfidenceMultiplier(signalReliability.reliabilityIndex);
    allScores = allScores.map(s => adjustScoreConfidence(s, multiplier));
  }

  // Collect top findings (critical first, then high)
  const allFindings = allScores.flatMap(s => s.findings);
  const topFindings = allFindings
    .sort((a, b) => {
      const order = { critical: 0, high: 1, medium: 2, low: 3 };
      return order[a.severity] - order[b.severity];
    })
    .slice(0, 10);

  return {
    frameworkVersion: JUDGMENT_FRAMEWORK_VERSION,
    context: ctx,
    scores: allScores,
    overallRisk: submissionRisk.score,
    overallVerdict: submissionRisk.verdict,
    topFindings,
    generatedAt: new Date().toISOString(),
  };
}
