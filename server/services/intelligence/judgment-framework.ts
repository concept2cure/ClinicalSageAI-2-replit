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
import type { Recommendation, RecommendationType } from './recommendation-engine.js';
import type { SignalReliability } from './learning-loop-service.js';

// ═══════════════════════════════════════════════════════════════════════════════
// VERSION — bumped when scoring logic changes (enables provenance tracking)
// ═══════════════════════════════════════════════════════════════════════════════

// 1.3.0 (2026-10-15): unmeasured factors omitted, 'not_assessed' verdict, no
// constant confidences, composite renormalised.
export const JUDGMENT_FRAMEWORK_VERSION = '1.3.0';

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
  /** 0-100 over the measured factors; null when the model is not assessed. */
  readonly score: number | null;
  /**
   * Null: these models are rules-based and compute no confidence (the
   * 'rules_based' convention). 2026-10-15: it was a constant picked by whether
   * readiness existed (80/40, 75/35, 70/30, 65, 75/30). measuredWeight says
   * how much of the model rests on measured inputs.
   */
  readonly confidence: number | null;
  readonly basis: ConfidenceBasis;
  readonly verdict: JudgmentVerdict;
  /** Share (0-1) of the model's authored factor weight that was measured. */
  readonly measuredWeight: number;
  /** Each factor left out, as "factor: what was missing". */
  readonly notAssessed: readonly string[];
  readonly factors: readonly JudgmentFactor[];
  readonly findings: readonly JudgmentFinding[];
  readonly scoredAt: string;
}

export type JudgmentVerdict =
  | 'pass'           // No concerns
  | 'acceptable'     // Minor concerns, not blocking
  | 'needs_attention' // Moderate concerns, should address
  | 'at_risk'        // Significant concerns, must address
  | 'fail'           // Critical issues, blocking
  | 'not_assessed';  // Too little of the model was measured for a verdict

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
  readonly overallRisk: number | null; // 0-100 composite; null when not assessed
  readonly overallVerdict: JudgmentVerdict;
  readonly topFindings: readonly JudgmentFinding[];
  readonly generatedAt: string;
}

// ═══════════════════════════════════════════════════════════════════════════════
// VERDICT THRESHOLDS
// ═══════════════════════════════════════════════════════════════════════════════

const VERDICT_THRESHOLDS: Record<Exclude<JudgmentVerdict, 'not_assessed'>, { min: number; max: number }> = {
  pass: { min: 85, max: 100 },
  acceptable: { min: 70, max: 84 },
  needs_attention: { min: 50, max: 69 },
  at_risk: { min: 25, max: 49 },
  fail: { min: 0, max: 24 },
};

/**
 * Sum weighted factor scores, rescaled by the weight actually present.
 *
 * A model's factor weights are authored to sum to 1. When a factor is omitted
 * because its input was never measured, a plain sum silently reports the
 * missing weight as zero score — so "we could not measure this" and "this
 * scored badly" produce the same number. Renormalising keeps the score on the
 * scale its verdict thresholds were written against, and the omitted factor is
 * visible in `factors` for anyone who needs to know what went into it.
 *
 * Returns 0 for an empty factor list rather than dividing by zero; closeModel
 * never uses it then — a model with too little measured is 'not_assessed'.
 */
function renormalisedScore(factors: readonly JudgmentFactor[]): number {
  const totalWeight = factors.reduce((sum, f) => sum + f.weight, 0);
  if (totalWeight <= 0) return 0;
  return Math.round(factors.reduce((sum, f) => sum + f.weightedScore, 0) / totalWeight);
}

function scoreToVerdict(score: number): JudgmentVerdict {
  if (score >= 85) return 'pass';
  if (score >= 70) return 'acceptable';
  if (score >= 50) return 'needs_attention';
  if (score >= 25) return 'at_risk';
  return 'fail';
}

/** A model gives a verdict only when measured factors carry at least this share of its weight. */
const MIN_MEASURED_WEIGHT = 0.5;

/** No recommendation type was checked unless the caller says so. */
const NOTHING_CHECKED: ReadonlySet<RecommendationType> = new Set();

/**
 * ── 2026-10-15: score what was measured; below half the weight, no verdict ──
 * Unmeasured inputs used to be scored — 50 for a null readiness dimension, 100
 * for a count of a recommendation type no generator produces — and every model
 * gave a verdict, at a constant confidence. Now each model leaves such factors
 * out (listing them in notAssessed), renormalises over the rest, and is
 * 'not_assessed', with no score, when the rest carries under half its weight.
 */
function closeModel(
  model: JudgmentModel,
  authoredWeight: number,
  parts: { factors: JudgmentFactor[]; notAssessed: string[]; findings: JudgmentFinding[] },
): JudgmentScore {
  const measured = parts.factors.reduce((sum, f) => sum + f.weight, 0);
  const measuredWeight = authoredWeight > 0 ? Math.round((measured / authoredWeight) * 1e4) / 1e4 : 0;
  const score = measuredWeight >= MIN_MEASURED_WEIGHT ? renormalisedScore(parts.factors) : null;
  return {
    model,
    score,
    confidence: null,
    basis: 'rules_based',
    verdict: score === null ? 'not_assessed' : scoreToVerdict(score),
    measuredWeight,
    notAssessed: parts.notAssessed,
    factors: parts.factors,
    findings: parts.findings,
    scoredAt: new Date().toISOString(),
  };
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
  assessedTypes: ReadonlySet<RecommendationType> = NOTHING_CHECKED,
): JudgmentScore {
  const factors: JudgmentFactor[] = [];
  const findings: JudgmentFinding[] = [];
  const notAssessed: string[] = [];

  // Factor 1: Overall readiness completeness (was 50 with no readiness read)
  if (readiness) {
    const completeness = readiness.dimensions.completeness;
    factors.push({
      name: 'document_completeness',
      weight: 0.30,
      rawScore: completeness,
      weightedScore: completeness * 0.30,
      detail: `Document completeness at ${completeness}%`,
    });
  } else {
    notAssessed.push('document_completeness: no readiness read');
  }

  // Factor 2: Evidence chain strength (was "0/1" with no chain at all)
  if (evidenceChains.length > 0) {
    const strongChains = evidenceChains.filter(c => c.chainStrength === 'strong').length;
    const chainStrengthScore = Math.round((strongChains / evidenceChains.length) * 100);
    factors.push({
      name: 'evidence_chain_strength',
      weight: 0.25,
      rawScore: chainStrengthScore,
      weightedScore: chainStrengthScore * 0.25,
      detail: `${strongChains}/${evidenceChains.length} evidence chains are strong`,
    });
  } else {
    notAssessed.push('evidence_chain_strength: no evidence chains');
  }

  // Factor 3: Evidence gap count — only if a generator looked for evidence gaps
  const evidenceGaps = recommendations.filter(r => r.type === 'evidence_gap');
  if (assessedTypes.has('evidence_gap')) {
    const gapPenalty = Math.max(0, 100 - (evidenceGaps.length * 15));
    factors.push({
      name: 'evidence_gaps',
      weight: 0.25,
      rawScore: gapPenalty,
      weightedScore: gapPenalty * 0.25,
      detail: `${evidenceGaps.length} evidence gap(s) recorded`,
    });
  } else {
    notAssessed.push('evidence_gaps: no generator checked for evidence gaps');
  }

  // Factor 4: Quality dimension (was 50 when not measured)
  const quality = readiness?.dimensions.quality ?? null;
  if (quality !== null) {
    factors.push({
      name: 'quality_score',
      weight: 0.20,
      rawScore: quality,
      weightedScore: quality * 0.20,
      detail: `Quality dimension at ${quality}%`,
    });
  } else {
    notAssessed.push(`quality_score: ${readiness ? 'quality not measured' : 'no readiness read'}`);
  }

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

  return closeModel('evidence_sufficiency', 1, { factors, notAssessed, findings });
}

// ═══════════════════════════════════════════════════════════════════════════════
// DEFENSIBILITY MODEL
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Evaluate how defensible the current submission state is under regulatory scrutiny.
 */
export function evaluateDefensibility(
  readiness: ReadinessScore | null,
  gaps: readonly ReadinessGap[] | null,
  recommendations: readonly Recommendation[],
  assessedTypes: ReadonlySet<RecommendationType> = NOTHING_CHECKED,
): JudgmentScore {
  const factors: JudgmentFactor[] = [];
  const findings: JudgmentFinding[] = [];
  const notAssessed: string[] = [];
  const unread = readiness ? 'not measured' : 'no readiness read';

  // Factor 1: Compliance dimension (was 50 when not measured)
  const compliance = readiness?.dimensions.compliance ?? null;
  if (compliance !== null) {
    factors.push({
      name: 'compliance_alignment',
      weight: 0.30,
      rawScore: compliance,
      weightedScore: compliance * 0.30,
      detail: `Compliance alignment at ${compliance}%`,
    });
  } else {
    notAssessed.push(`compliance_alignment: compliance ${unread}`);
  }

  // Factor 2: Critical gap count — only from gaps that were read
  const criticalGaps = (gaps ?? []).filter(g => g.severity === 'critical');
  if (gaps !== null) {
    const criticalPenalty = Math.max(0, 100 - (criticalGaps.length * 25));
    factors.push({
      name: 'critical_gap_exposure',
      weight: 0.30,
      rawScore: criticalPenalty,
      weightedScore: criticalPenalty * 0.30,
      detail: `${criticalGaps.length} critical gap(s) — each significantly weakens defensibility`,
    });
  } else {
    notAssessed.push('critical_gap_exposure: gaps not read');
  }

  // Factor 3: Consistency dimension (was 50 when not measured)
  const consistency = readiness?.dimensions.consistency ?? null;
  if (consistency !== null) {
    factors.push({
      name: 'internal_consistency',
      weight: 0.20,
      rawScore: consistency,
      weightedScore: consistency * 0.20,
      detail: `Cross-section consistency at ${consistency}%`,
    });
  } else {
    notAssessed.push(`internal_consistency: consistency ${unread}`);
  }

  // Factor 4: Unresolved compliance recommendations — only if something checked
  if (assessedTypes.has('compliance_gap')) {
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
  } else {
    notAssessed.push('open_compliance_issues: no generator checked for compliance gaps');
  }

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

  return closeModel('defensibility', 1, { factors, notAssessed, findings });
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
  gaps: readonly ReadinessGap[] | null,
  recommendations: readonly Recommendation[],
  assessedTypes: ReadonlySet<RecommendationType> = NOTHING_CHECKED,
): JudgmentScore {
  const factors: JudgmentFactor[] = [];
  const findings: JudgmentFinding[] = [];
  const notAssessed: string[] = [];

  /* ── 2026-09-10: two factors here used to be defaulted, not measured ────────
     `?? 5` deficiencies and `?? 50` approval probability. Both fed the weighted
     sum at full weight, so 50% of a judgment's fourth factor was a number
     nobody computed, and the composite could not be distinguished from one
     built on real inputs. The readiness engine now returns null instead of
     deriving those figures from the readiness score, so the fix here is to
     OMIT the factor and renormalise the surviving weights — see
     renormalise() below. Defaulting at the point of use would just relocate
     the invention. */

  // Factor 1: criteria the readiness assessment scored unmet. Omitted entirely
  // when no assessment is on record.
  const predictedDeficiencies = readiness?.predictions.estimatedDeficiencies ?? null;
  if (predictedDeficiencies !== null) {
  const deficiencyScore = Math.max(0, 100 - (predictedDeficiencies * 10));
  factors.push({
    name: 'predicted_deficiencies',
    weight: 0.35,
    rawScore: deficiencyScore,
    weightedScore: deficiencyScore * 0.35,
    detail: `${predictedDeficiencies} criteria not met or partially met in the readiness assessment`,
  });
  } else {
    notAssessed.push('predicted_deficiencies: no readiness assessment on record');
  }

  // Factor 2: High-severity gap density — only from gaps that were read
  const highGaps = (gaps ?? []).filter(g => g.severity === 'critical' || g.severity === 'high');
  if (gaps !== null) {
    const highGapScore = Math.max(0, 100 - (highGaps.length * 15));
    factors.push({
      name: 'high_severity_gap_density',
      weight: 0.30,
      rawScore: highGapScore,
      weightedScore: highGapScore * 0.30,
      detail: `${highGaps.length} high/critical gap(s) that reviewers are likely to flag`,
    });
  } else {
    notAssessed.push('high_severity_gap_density: gaps not read');
  }

  // Factor 3: Cross-reference issues — only if something checked
  // cross-references (2026-10-15: "0 issues" scored 100 when nothing did)
  if (assessedTypes.has('cross_reference_issue')) {
    const crossRefIssues = recommendations.filter(r => r.type === 'cross_reference_issue');
    const crossRefScore = Math.max(0, 100 - (crossRefIssues.length * 20));
    factors.push({
      name: 'cross_reference_integrity',
      weight: 0.20,
      rawScore: crossRefScore,
      weightedScore: crossRefScore * 0.20,
      detail: `${crossRefIssues.length} cross-reference issue(s)`,
    });
  } else {
    notAssessed.push('cross_reference_integrity: no generator checked cross-references');
  }

  // Factor 4: approval probability. Null in every path today — no model
  // produces one — so this factor is normally absent.
  const approvalProb = readiness?.predictions.approvalProbability ?? null;
  if (approvalProb !== null) {
    factors.push({
      name: 'approval_probability',
      weight: 0.15,
      rawScore: approvalProb,
      weightedScore: approvalProb * 0.15,
      detail: `Modelled approval probability: ${approvalProb}%`,
    });
  } else {
    notAssessed.push('approval_probability: no model produced one');
  }

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

  // Renormalised, not summed: an OMITTED factor must not read as a
  // zero-scoring one. With nothing evaluated this used to score 100 'pass'.
  return closeModel('reviewer_sensitivity', 1, { factors, notAssessed, findings });
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
  assessedTypes: ReadonlySet<RecommendationType> = NOTHING_CHECKED,
): JudgmentScore {
  const factors: JudgmentFactor[] = [];
  const findings: JudgmentFinding[] = [];
  const notAssessed: string[] = [];

  // Factor 1: Quality gaps (often indicate unsupported claims) — only if checked
  const qualityGaps = recommendations.filter(r => r.type === 'quality_gap');
  if (assessedTypes.has('quality_gap')) {
    const qualityScore = Math.max(0, 100 - (qualityGaps.length * 12));
    factors.push({
      name: 'unsupported_claim_indicators',
      weight: 0.35,
      rawScore: qualityScore,
      weightedScore: qualityScore * 0.35,
      detail: `${qualityGaps.length} quality gap(s) that may indicate unsupported claims`,
    });
  } else {
    notAssessed.push('unsupported_claim_indicators: no generator checked for quality gaps');
  }

  // Factor 2: AI-inferred vs rules-based evidence ratio — only with chains
  if (evidenceChains.length > 0) {
    const aiInferred = evidenceChains.filter(c => c.confidenceBasis === 'ai_inferred').length;
    const aiRatio = aiInferred / evidenceChains.length;
    const aiRatioScore = Math.round((1 - aiRatio * 0.5) * 100); // Penalize high AI-inferred ratio
    factors.push({
      name: 'evidence_basis_quality',
      weight: 0.30,
      rawScore: aiRatioScore,
      weightedScore: aiRatioScore * 0.30,
      detail: `${Math.round(aiRatio * 100)}% of evidence chains are AI-inferred`,
    });
  } else {
    notAssessed.push('evidence_basis_quality: no evidence chains');
  }

  // Factor 3: Validation failures — only if checked
  if (assessedTypes.has('validation_failure')) {
    const validationFailures = recommendations.filter(r => r.type === 'validation_failure');
    const validationScore = Math.max(0, 100 - (validationFailures.length * 15));
    factors.push({
      name: 'validation_status',
      weight: 0.35,
      rawScore: validationScore,
      weightedScore: validationScore * 0.35,
      detail: `${validationFailures.length} validation failure(s)`,
    });
  } else {
    notAssessed.push('validation_status: no generator checked for validation failures');
  }

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

  // With nothing evaluated this used to score 100 'pass'.
  return closeModel('claim_risk', 1, { factors, notAssessed, findings });
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
  assessedTypes: ReadonlySet<RecommendationType> = NOTHING_CHECKED,
): JudgmentScore {
  const factors: JudgmentFactor[] = [];
  const findings: JudgmentFinding[] = [];
  const notAssessed: string[] = [];

  // Factor 1: Consistency dimension from readiness (was 50 when not measured)
  const consistency = readiness?.dimensions.consistency ?? null;
  if (consistency !== null) {
    factors.push({
      name: 'readiness_consistency',
      weight: 0.50,
      rawScore: consistency,
      weightedScore: consistency * 0.50,
      detail: `Cross-section consistency from readiness engine: ${consistency}%`,
    });
  } else {
    notAssessed.push(`readiness_consistency: consistency ${readiness ? 'not measured' : 'no readiness read'}`);
  }

  // Factor 2: Cross-reference issues — only if checked
  const crossRefIssues = recommendations.filter(r => r.type === 'cross_reference_issue');
  if (assessedTypes.has('cross_reference_issue')) {
    const crossRefScore = Math.max(0, 100 - (crossRefIssues.length * 20));
    factors.push({
      name: 'cross_reference_integrity',
      weight: 0.30,
      rawScore: crossRefScore,
      weightedScore: crossRefScore * 0.30,
      detail: `${crossRefIssues.length} cross-reference issue(s)`,
    });
  } else {
    notAssessed.push('cross_reference_integrity: no generator checked cross-references');
  }

  // Factor 3: Incomplete sections — only if checked
  if (assessedTypes.has('incomplete_section')) {
    const incompleteSections = recommendations.filter(r => r.type === 'incomplete_section');
    const incompleteScore = Math.max(0, 100 - (incompleteSections.length * 10));
    factors.push({
      name: 'section_completeness',
      weight: 0.20,
      rawScore: incompleteScore,
      weightedScore: incompleteScore * 0.20,
      detail: `${incompleteSections.length} incomplete section(s)`,
    });
  } else {
    notAssessed.push('section_completeness: no generator checked for incomplete sections');
  }

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

  return closeModel('cross_section_consistency', 1, { factors, notAssessed, findings });
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
  const notAssessed: string[] = [];
  let authoredWeight = 0;

  for (const score of componentScores) {
    const weight = MODEL_WEIGHTS[score.model] ?? 0.10;
    authoredWeight += weight;
    if (score.score === null) {
      notAssessed.push(`${score.model}: not assessed`);
    } else {
      factors.push({
        name: score.model,
        weight,
        rawScore: score.score,
        weightedScore: score.score * weight,
        detail: `${score.model}: ${score.score}/100 (${score.verdict})`,
      });
    }

    // Bubble up critical/high findings — a recorded gap is a fact whether or
    // not its model had enough measured weight for a verdict.
    for (const finding of score.findings) {
      if (finding.severity === 'critical' || finding.severity === 'high') {
        findings.push(finding);
      }
    }
  }

  // 2026-10-15: the weighted sum was never divided by the component weights
  // (0.85 in all), so perfect inputs scored 85; confidence averaged constants.
  return closeModel('submission_risk', authoredWeight, {
    factors,
    notAssessed,
    findings: findings.sort((a, b) => {
      const order = { critical: 0, high: 1, medium: 2, low: 3 };
      return order[a.severity] - order[b.severity];
    }),
  });
}

// ═══════════════════════════════════════════════════════════════════════════════
// FULL JUDGMENT REPORT
// ═══════════════════════════════════════════════════════════════════════════════

export interface JudgmentInput {
  readonly readiness: ReadinessScore | null;
  /** The readiness gaps; null when they were not read. */
  readonly gaps: readonly ReadinessGap[] | null;
  readonly recommendations: readonly Recommendation[];
  /**
   * Recommendation types a generator actually checked (RecommendationSet.
   * assessedTypes). A factor counting a type outside this list is left out:
   * zero of something nobody looked for is not a finding. Omitted = none.
   */
  readonly assessedRecommendationTypes?: readonly RecommendationType[];
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
  // Rules-based models compute no confidence; there is nothing to modulate.
  if (score.confidence === null) return score;
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
  const checked = new Set<RecommendationType>(input.assessedRecommendationTypes ?? []);

  const evidenceSufficiency = evaluateEvidenceSufficiency(readiness, evidenceChains, recommendations, checked);
  const defensibility = evaluateDefensibility(readiness, gaps, recommendations, checked);
  const reviewerSensitivity = evaluateReviewerSensitivity(readiness, gaps, recommendations, checked);
  const claimRisk = evaluateClaimRisk(recommendations, evidenceChains, checked);
  const crossSectionConsistency = evaluateCrossSectionConsistency(readiness, recommendations, checked);

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
