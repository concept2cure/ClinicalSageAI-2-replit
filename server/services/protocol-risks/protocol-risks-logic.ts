/**
 * Protocol Risk Register deterministic logic (Capability C2C-19)
 *
 * Pure, DB-free, LLM-free: the likelihood × impact scoring matrix, the qualitative
 * risk level, and the register summary (counts by level, residual exposure). The
 * 5×5 matrix follows standard quality-risk-management practice (ICH E6(R2) §5.0,
 * ISO 14971): score = likelihood-rank × impact-rank (1–25), mapped to
 * low / medium / high / extreme bands.
 *
 * @module server/services/protocol-risks/protocol-risks-logic
 */

export const ICH_E6_QRM = 'ICH E6(R2) §5.0 — quality risk management';

export type RiskLikelihood = 'rare' | 'unlikely' | 'possible' | 'likely' | 'almost_certain';
export type RiskImpact = 'negligible' | 'minor' | 'moderate' | 'major' | 'severe';
export type RiskLevel = 'low' | 'medium' | 'high' | 'extreme';

const LIKELIHOOD_RANK: Record<RiskLikelihood, number> = { rare: 1, unlikely: 2, possible: 3, likely: 4, almost_certain: 5 };
const IMPACT_RANK: Record<RiskImpact, number> = { negligible: 1, minor: 2, moderate: 3, major: 4, severe: 5 };

/** Numeric risk score 1–25 (likelihood-rank × impact-rank). Pure. */
export function riskScore(likelihood: RiskLikelihood, impact: RiskImpact): number {
  return (LIKELIHOOD_RANK[likelihood] ?? 3) * (IMPACT_RANK[impact] ?? 3);
}

/** Qualitative band for a numeric score. Pure. */
export function riskLevel(score: number): RiskLevel {
  if (score >= 15) return 'extreme';
  if (score >= 8) return 'high';
  if (score >= 4) return 'medium';
  return 'low';
}

export interface RiskView {
  category?: string;
  likelihood: RiskLikelihood;
  impact: RiskImpact;
  residualLikelihood?: RiskLikelihood | null;
  residualImpact?: RiskImpact | null;
  status?: string;
}

export interface ScoredRisk {
  inherentScore: number;
  inherentLevel: RiskLevel;
  residualScore: number | null;
  residualLevel: RiskLevel | null;
}

/** Score a single risk (inherent + residual when mitigation targets are set). Pure. */
export function scoreRisk(r: RiskView): ScoredRisk {
  const inherentScore = riskScore(r.likelihood, r.impact);
  const hasResidual = r.residualLikelihood != null && r.residualImpact != null;
  const residualScore = hasResidual ? riskScore(r.residualLikelihood as RiskLikelihood, r.residualImpact as RiskImpact) : null;
  return {
    inherentScore,
    inherentLevel: riskLevel(inherentScore),
    residualScore,
    residualLevel: residualScore == null ? null : riskLevel(residualScore),
  };
}

export interface RiskRegisterSummary {
  total: number;
  byLevel: Record<RiskLevel, number>;
  openHighOrExtreme: number;
  /** Sum of residual scores where set, else inherent — a rough exposure index. */
  residualExposure: number;
  basis: string;
}

/** Summarize a register: counts by (residual-or-inherent) level + open high/extreme + exposure. Pure. */
export function summarizeRiskRegister(risks: RiskView[]): RiskRegisterSummary {
  const byLevel: Record<RiskLevel, number> = { low: 0, medium: 0, high: 0, extreme: 0 };
  let residualExposure = 0;
  let openHighOrExtreme = 0;
  for (const r of risks) {
    const s = scoreRisk(r);
    const effectiveLevel = s.residualLevel ?? s.inherentLevel;
    byLevel[effectiveLevel] += 1;
    residualExposure += s.residualScore ?? s.inherentScore;
    if ((effectiveLevel === 'high' || effectiveLevel === 'extreme') && r.status !== 'closed' && r.status !== 'accepted') {
      openHighOrExtreme += 1;
    }
  }
  return { total: risks.length, byLevel, openHighOrExtreme, residualExposure, basis: ICH_E6_QRM };
}
