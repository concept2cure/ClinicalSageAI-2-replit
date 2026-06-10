/**
 * ISO 14971:2019 risk-management engine.
 *
 * Pure and deterministic. Closes the Tier-1 audit gap "Risk Management File —
 * stub only": there was harm/severity banding for complaints but no risk
 * estimation, risk-control traceability, residual-risk evaluation, or
 * benefit-risk determination.
 *
 * Regulatory backbone:
 *   - ISO 14971:2019 §5  — risk analysis (hazard → hazardous situation → harm)
 *   - ISO 14971:2019 §6  — risk evaluation against the risk-acceptability matrix
 *   - ISO 14971:2019 §7  — risk control + verification of effectiveness
 *   - ISO 14971:2019 §8  — overall residual risk evaluation (benefit-risk)
 *   - ISO 14971:2019 §10 — production / post-production feedback loop
 *                          (links to the existing capa-mdr post-market engine)
 *   - ISO/TR 24971:2020  — guidance (default P1×P2 probability decomposition)
 *
 * The probability of harm is decomposed per ISO/TR 24971 into:
 *   P  = P1 × P2
 *   P1 = probability of the hazardous situation occurring
 *   P2 = probability that the hazardous situation leads to harm
 */

// ─────────────────────────────────────────────────────────────────────────────
// Scales
// ─────────────────────────────────────────────────────────────────────────────

/** Severity of harm, low → high. Index is used in the risk matrix. */
export const SEVERITY_SCALE = [
  'negligible',
  'minor',
  'serious',
  'critical',
  'catastrophic',
] as const;
export type Severity = (typeof SEVERITY_SCALE)[number];

/** Probability of occurrence of harm, low → high. */
export const PROBABILITY_SCALE = [
  'improbable',
  'remote',
  'occasional',
  'probable',
  'frequent',
] as const;
export type Probability = (typeof PROBABILITY_SCALE)[number];

/** Risk-acceptability regions per a 5×5 matrix. */
export const RISK_REGIONS = ['acceptable', 'investigate', 'unacceptable'] as const;
export type RiskRegion = (typeof RISK_REGIONS)[number];

export const RISK_CONTROL_OPTIONS = [
  'inherent_safety_by_design',
  'protective_measure',
  'information_for_safety',
] as const;
export type RiskControlOption = (typeof RISK_CONTROL_OPTIONS)[number];

// ─────────────────────────────────────────────────────────────────────────────
// Domain types
// ─────────────────────────────────────────────────────────────────────────────

export interface RiskControl {
  id: string;
  /** ISO 14971 §7.1 risk-control option (priority order matters). */
  option: RiskControlOption;
  description: string;
  /** Whether effectiveness of the control has been verified (§7.2). */
  verified: boolean;
  /** Optional pointer to the verification record / design-V&V activity. */
  verificationRef?: string | null;
}

export interface RiskItem {
  id: string;
  hazard: string;
  hazardousSituation: string;
  harm: string;
  /** Initial (pre-control) estimate. */
  initialSeverity: Severity;
  initialP1: Probability;
  initialP2: Probability;
  /** Risk controls applied to this item (may be empty). */
  controls?: RiskControl[];
  /**
   * Residual (post-control) estimate. Severity normally does not change.
   * If omitted, the residual estimate equals the initial estimate (i.e. no
   * effective control has been credited yet).
   */
  residualSeverity?: Severity;
  residualP1?: Probability;
  residualP2?: Probability;
  /** Optional traceability into the design / requirements spine. */
  designInputRef?: string | null;
}

export interface RiskEstimate {
  severity: Severity;
  probability: Probability;
  /** Combined ordinal severity index (0-based) for downstream sorting. */
  severityIndex: number;
  probabilityIndex: number;
  /** Numeric risk score on the configured matrix (higher = worse). */
  score: number;
  region: RiskRegion;
}

export interface RiskItemEvaluation {
  id: string;
  initial: RiskEstimate;
  residual: RiskEstimate;
  /** True once at least one verified control reduces the residual region. */
  riskReduced: boolean;
  /** Traceability completeness for this single item. */
  hasControl: boolean;
  hasVerifiedControl: boolean;
  controlOptionsRespectPriority: boolean;
  /** Reasons the item is not yet inspector-ready. */
  gaps: string[];
}

export interface RiskFileSummary {
  itemCount: number;
  byInitialRegion: Record<RiskRegion, number>;
  byResidualRegion: Record<RiskRegion, number>;
  /** Items whose residual region is still `unacceptable`. */
  unacceptableResidualCount: number;
  /** Items missing a control or verification of effectiveness. */
  itemsMissingControl: number;
  itemsMissingVerification: number;
  /** Share of items with an acceptable residual risk (0–1). */
  residualAcceptableShare: number;
  /** Overall residual risk is acceptable only if no item is unacceptable. */
  overallResidualAcceptable: boolean;
  evaluations: RiskItemEvaluation[];
}

export interface BenefitRiskInput {
  /** Documented clinical/medical benefit narrative present. */
  benefitDocumented: boolean;
  /** Quantified or qualified benefit magnitude. */
  benefitMagnitude?: 'low' | 'moderate' | 'high';
  /** Overall residual risk acceptability from the risk file. */
  overallResidualAcceptable: boolean;
  /** Count of residual risks still in the `investigate` region. */
  investigateResidualCount: number;
}

export interface BenefitRiskResult {
  /** ISO 14971 §8 conclusion. */
  favorable: boolean;
  rationale: string;
  /** Residual risks that must be disclosed in accompanying information (§8). */
  requiresDisclosure: boolean;
}

// ─────────────────────────────────────────────────────────────────────────────
// Risk matrix
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Default 5×5 acceptability matrix indexed as matrix[severityIndex][probIndex].
 * This is a conventional, conservative scheme; a manufacturer may justify a
 * different matrix in its risk-management plan.
 */
const DEFAULT_MATRIX: RiskRegion[][] = [
  // improbable   remote        occasional    probable      frequent
  ['acceptable', 'acceptable', 'acceptable', 'acceptable', 'investigate'], // negligible
  ['acceptable', 'acceptable', 'investigate', 'investigate', 'investigate'], // minor
  ['acceptable', 'investigate', 'investigate', 'unacceptable', 'unacceptable'], // serious
  ['investigate', 'investigate', 'unacceptable', 'unacceptable', 'unacceptable'], // critical
  ['investigate', 'unacceptable', 'unacceptable', 'unacceptable', 'unacceptable'], // catastrophic
];

const REGION_RANK: Record<RiskRegion, number> = {
  acceptable: 0,
  investigate: 1,
  unacceptable: 2,
};

const CONTROL_PRIORITY: Record<RiskControlOption, number> = {
  inherent_safety_by_design: 0,
  protective_measure: 1,
  information_for_safety: 2,
};

function sevIndex(s: Severity): number {
  return SEVERITY_SCALE.indexOf(s);
}
function probIndex(p: Probability): number {
  return PROBABILITY_SCALE.indexOf(p);
}

/**
 * Combine P1 and P2 (each on the 5-level scale) into a single probability of
 * harm. ISO/TR 24971 decomposes P = P1 × P2; on an ordinal log-probability
 * scale, multiplication of probabilities is addition of "rarity" (distance from
 * the top band). With rarity_i = max − index_i, the combined index is
 * index1 + index2 − max, clamped into the scale — a deterministic, monotonic
 * realization of multiplying two probability bands.
 */
function combineProbability(p1: Probability, p2: Probability): Probability {
  const max = PROBABILITY_SCALE.length - 1;
  const combined = Math.max(0, Math.min(max, probIndex(p1) + probIndex(p2) - max));
  return PROBABILITY_SCALE[combined];
}

/** Estimate a single risk from severity + decomposed probability. */
export function estimateRisk(
  severity: Severity,
  p1: Probability,
  p2: Probability,
  matrix: RiskRegion[][] = DEFAULT_MATRIX
): RiskEstimate {
  const probability = combineProbability(p1, p2);
  const si = sevIndex(severity);
  const pi = probIndex(probability);
  const region = matrix[si][pi];
  return {
    severity,
    probability,
    severityIndex: si,
    probabilityIndex: pi,
    // Score: severity-weighted to surface high-severity items even when rare.
    score: (si + 1) * (pi + 1),
    region,
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// Evaluation
// ─────────────────────────────────────────────────────────────────────────────

/** Evaluate a single risk item: initial vs residual + traceability gaps. */
export function evaluateRiskItem(
  item: RiskItem,
  matrix: RiskRegion[][] = DEFAULT_MATRIX
): RiskItemEvaluation {
  const initial = estimateRisk(item.initialSeverity, item.initialP1, item.initialP2, matrix);
  const residual = estimateRisk(
    item.residualSeverity ?? item.initialSeverity,
    item.residualP1 ?? item.initialP1,
    item.residualP2 ?? item.initialP2,
    matrix
  );

  const controls = item.controls ?? [];
  const hasControl = controls.length > 0;
  const hasVerifiedControl = controls.some(c => c.verified);

  // Control priority: information-for-safety must not be relied on before
  // design / protective measures have been considered (§7.1).
  let controlOptionsRespectPriority = true;
  if (controls.length > 0) {
    const onlyInformation = controls.every(
      c => CONTROL_PRIORITY[c.option] === CONTROL_PRIORITY.information_for_safety
    );
    const reducesRisk = REGION_RANK[residual.region] < REGION_RANK[initial.region];
    // Relying solely on information-for-safety while claiming a reduction is a flag.
    if (onlyInformation && reducesRisk) controlOptionsRespectPriority = false;
  }

  const riskReduced =
    hasVerifiedControl && REGION_RANK[residual.region] < REGION_RANK[initial.region];

  const gaps: string[] = [];
  if (residual.region !== 'acceptable' && !hasControl) {
    gaps.push('Residual risk is not acceptable and no risk control is defined.');
  }
  if (hasControl && !hasVerifiedControl) {
    gaps.push('Risk control(s) defined but effectiveness is not verified (ISO 14971 §7.2).');
  }
  if (
    REGION_RANK[residual.region] < REGION_RANK[initial.region] &&
    !hasVerifiedControl
  ) {
    gaps.push('Residual risk claims a reduction without a verified control.');
  }
  if (!controlOptionsRespectPriority) {
    gaps.push('Risk reduction relies solely on information-for-safety (violates §7.1 priority).');
  }
  if (residual.region === 'unacceptable') {
    gaps.push('Residual risk remains UNACCEPTABLE — further risk control required.');
  }

  return {
    id: item.id,
    initial,
    residual,
    riskReduced,
    hasControl,
    hasVerifiedControl,
    controlOptionsRespectPriority,
    gaps,
  };
}

function emptyRegionCounts(): Record<RiskRegion, number> {
  return { acceptable: 0, investigate: 0, unacceptable: 0 };
}

/** Summarize an entire risk-management file. */
export function summarizeRiskFile(
  items: RiskItem[],
  matrix: RiskRegion[][] = DEFAULT_MATRIX
): RiskFileSummary {
  const evaluations = items.map(i => evaluateRiskItem(i, matrix));
  const byInitialRegion = emptyRegionCounts();
  const byResidualRegion = emptyRegionCounts();
  let itemsMissingControl = 0;
  let itemsMissingVerification = 0;
  let acceptableResidual = 0;

  for (const ev of evaluations) {
    byInitialRegion[ev.initial.region] += 1;
    byResidualRegion[ev.residual.region] += 1;
    if (!ev.hasControl && ev.residual.region !== 'acceptable') itemsMissingControl += 1;
    if (ev.hasControl && !ev.hasVerifiedControl) itemsMissingVerification += 1;
    if (ev.residual.region === 'acceptable') acceptableResidual += 1;
  }

  const itemCount = evaluations.length;
  const unacceptableResidualCount = byResidualRegion.unacceptable;

  return {
    itemCount,
    byInitialRegion,
    byResidualRegion,
    unacceptableResidualCount,
    itemsMissingControl,
    itemsMissingVerification,
    residualAcceptableShare: itemCount === 0 ? 1 : acceptableResidual / itemCount,
    overallResidualAcceptable: unacceptableResidualCount === 0,
    evaluations,
  };
}

/** ISO 14971 §8 overall benefit-risk determination. */
export function determineBenefitRisk(input: BenefitRiskInput): BenefitRiskResult {
  if (!input.benefitDocumented) {
    return {
      favorable: false,
      rationale: 'No documented medical benefit; benefit-risk cannot be judged favorable.',
      requiresDisclosure: true,
    };
  }
  if (!input.overallResidualAcceptable) {
    return {
      favorable: false,
      rationale:
        'One or more residual risks remain unacceptable; benefit cannot outweigh an unacceptable risk.',
      requiresDisclosure: true,
    };
  }
  const favorable = true;
  return {
    favorable,
    rationale:
      input.investigateResidualCount > 0
        ? `Benefit outweighs residual risk; ${input.investigateResidualCount} residual risk(s) in the investigate region must be disclosed in accompanying information.`
        : 'Benefit outweighs residual risk; all residual risks are acceptable.',
    requiresDisclosure: input.investigateResidualCount > 0,
  };
}

export const DEFAULT_RISK_MATRIX = DEFAULT_MATRIX;
