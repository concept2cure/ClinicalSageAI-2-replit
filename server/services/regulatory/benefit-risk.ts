/**
 * Structured benefit-risk assessment — a transparent, deterministic weighted
 * value model (BRAT / FDA structured-benefit-risk style).
 *
 * The caller supplies the benefits and risks, each with an importance WEIGHT and
 * a 0–100 magnitude SCORE. The engine normalizes weights within each category,
 * computes the weighted benefit and weighted risk, the net, and a favorability
 * classification — with every item's contribution itemized so the conclusion is
 * fully attributable. It invents nothing: no weights, scores, or evidence are
 * assumed.
 *
 * This is a structured DECISION AID, not a regulatory determination. Weights and
 * scores are value judgements the caller owns; the engine only makes the
 * arithmetic explicit and reproducible.
 *
 * @module server/services/regulatory/benefit-risk
 */

export interface BenefitRiskItem {
  name: string;
  /** Importance weight (any non-negative number; normalized within its category). */
  weight: number;
  /** Magnitude on a 0–100 favorability/severity scale the caller defines. */
  score: number;
  /** Optional evidence-quality label, surfaced for context (not used in the math). */
  evidenceQuality?: 'high' | 'moderate' | 'low' | 'very_low';
  note?: string;
}

export interface BenefitRiskInput {
  benefits: BenefitRiskItem[];
  risks: BenefitRiskItem[];
  /**
   * Net-score band (points) for the favorability call: net ≥ +threshold →
   * favorable; ≤ −threshold → unfavorable; otherwise borderline. Default 10.
   */
  favorabilityThreshold?: number;
}

export interface ItemContribution {
  name: string;
  weight: number;
  normalizedWeight: number;
  score: number;
  contribution: number; // normalizedWeight × score
  evidenceQuality?: string;
}

export interface BenefitRiskResult {
  weightedBenefit: number;
  weightedRisk: number;
  netBenefitScore: number;
  favorability: 'favorable' | 'unfavorable' | 'borderline';
  favorabilityThreshold: number;
  benefitContributions: ItemContribution[];
  riskContributions: ItemContribution[];
  disclaimer: string;
  notes: string[];
}

function round(n: number, dp = 4): number {
  const f = 10 ** dp;
  return Math.round((n + Number.EPSILON) * f) / f;
}

function validateItems(items: BenefitRiskItem[], label: string): void {
  if (!Array.isArray(items) || items.length === 0) throw new Error(`${label} must be a non-empty array`);
  for (const it of items) {
    if (!it || typeof it.name !== 'string' || !it.name.trim()) throw new Error(`each ${label} item needs a name`);
    if (!Number.isFinite(it.weight) || it.weight < 0) throw new Error(`${label} "${it.name}" weight must be a non-negative number`);
    if (!Number.isFinite(it.score) || it.score < 0 || it.score > 100) throw new Error(`${label} "${it.name}" score must be in [0,100]`);
  }
  if (items.reduce((s, it) => s + it.weight, 0) <= 0) throw new Error(`${label} weights cannot all be zero`);
}

function weighted(items: BenefitRiskItem[]): { total: number; contributions: ItemContribution[] } {
  const wsum = items.reduce((s, it) => s + it.weight, 0);
  const contributions = items.map((it) => {
    const nw = it.weight / wsum;
    return {
      name: it.name,
      weight: it.weight,
      normalizedWeight: round(nw),
      score: it.score,
      contribution: round(nw * it.score),
      ...(it.evidenceQuality ? { evidenceQuality: it.evidenceQuality } : {}),
    };
  });
  const total = contributions.reduce((s, c) => s + c.contribution, 0);
  return { total, contributions };
}

/** Compute a transparent structured benefit-risk assessment. */
export function assessBenefitRisk(input: BenefitRiskInput): BenefitRiskResult {
  validateItems(input.benefits, 'benefit');
  validateItems(input.risks, 'risk');
  const threshold = input.favorabilityThreshold ?? 10;
  if (!Number.isFinite(threshold) || threshold < 0) throw new Error('favorabilityThreshold must be a non-negative number');

  const b = weighted(input.benefits);
  const r = weighted(input.risks);
  const net = b.total - r.total;

  const favorability: BenefitRiskResult['favorability'] =
    net >= threshold ? 'favorable' : net <= -threshold ? 'unfavorable' : 'borderline';

  return {
    weightedBenefit: round(b.total),
    weightedRisk: round(r.total),
    netBenefitScore: round(net),
    favorability,
    favorabilityThreshold: threshold,
    benefitContributions: b.contributions,
    riskContributions: r.contributions,
    disclaimer:
      'Structured decision aid only — NOT a regulatory determination. Weights and 0–100 scores are caller-supplied value judgements; the engine only makes the weighting arithmetic explicit and reproducible. Evidence quality is shown for context but does not alter the score.',
    notes: [
      'Weights are normalized within benefits and within risks separately; each contribution = normalized weight × score.',
      `Favorability: net ≥ +${threshold} favorable, ≤ −${threshold} unfavorable, else borderline.`,
    ],
  };
}
