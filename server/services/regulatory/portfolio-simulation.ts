/**
 * Portfolio-level IVD simulation.
 *
 * Rolls several program submission profiles through the reviewer simulation and
 * aggregates them into a portfolio view: readiness distribution, verdict mix,
 * the attention-ranked worklist (lowest readiness first), aggregated deficiency
 * themes, and the critical (highest-risk / least-ready) program.
 *
 * Deterministic; composes the (deterministic) reviewer-simulation engine.
 */

import {
  simulateIvdReview,
  type ReviewProfile,
  type FindingSeverity,
} from './reviewer-simulation-ivd';

export interface PortfolioProgram {
  /** Caller's label for the program (device/assay name or id). */
  name: string;
  profile: ReviewProfile;
}

export interface PortfolioProgramResult {
  name: string;
  pathway: string;
  riskTier: string;
  readinessScore: number;
  verdict: string;
  majorCount: number;
  estimatedReviewCycles: number;
}

export interface PortfolioSimulationResult {
  programCount: number;
  /** Mean readiness across the portfolio (0–100). */
  meanReadiness: number;
  /** Lowest readiness in the portfolio (the binding constraint). */
  minReadiness: number;
  /** Verdict mix across programs. */
  verdictMix: Record<string, number>;
  /** Programs likely to be accepted as-is. */
  likelyAcceptances: number;
  /** Aggregate finding counts across all programs. */
  aggregateFindingCounts: Record<FindingSeverity, number>;
  /** Top recurring deficiency areas across the portfolio (most common first). */
  topDeficiencyThemes: { area: string; count: number }[];
  /** Programs ranked by readiness ascending — where to focus first. */
  worklist: PortfolioProgramResult[];
  /** The program most in need of attention (lowest readiness; ties → highest risk tier). */
  criticalProgram: PortfolioProgramResult | null;
}

const TIER_RANK: Record<string, number> = { highest: 3, elevated: 2, standard: 1 };

/** Simulate a portfolio of programs and aggregate the readiness picture. */
export function simulatePortfolio(programs: PortfolioProgram[]): PortfolioSimulationResult {
  if (programs.length === 0) {
    return {
      programCount: 0, meanReadiness: 0, minReadiness: 0, verdictMix: {}, likelyAcceptances: 0,
      aggregateFindingCounts: { major: 0, deficiency: 0, minor: 0, info: 0 },
      topDeficiencyThemes: [], worklist: [], criticalProgram: null,
    };
  }

  const verdictMix: Record<string, number> = {};
  const aggregateFindingCounts: Record<FindingSeverity, number> = { major: 0, deficiency: 0, minor: 0, info: 0 };
  const themeCounts = new Map<string, number>();
  const results: PortfolioProgramResult[] = [];

  for (const p of programs) {
    const r = simulateIvdReview(p.profile);
    verdictMix[r.verdict] = (verdictMix[r.verdict] ?? 0) + 1;
    (Object.keys(aggregateFindingCounts) as FindingSeverity[]).forEach(sev => {
      aggregateFindingCounts[sev] += r.counts[sev];
    });
    for (const f of r.findings) {
      if (f.severity === 'major' || f.severity === 'deficiency') {
        themeCounts.set(f.area, (themeCounts.get(f.area) ?? 0) + 1);
      }
    }
    results.push({
      name: p.name,
      pathway: r.pathway,
      riskTier: r.riskTier,
      readinessScore: r.readinessScore,
      verdict: r.verdict,
      majorCount: r.counts.major,
      estimatedReviewCycles: r.estimatedReviewCycles,
    });
  }

  const readinessValues = results.map(r => r.readinessScore);
  const meanReadiness = Math.round(readinessValues.reduce((s, v) => s + v, 0) / results.length);
  const minReadiness = Math.min(...readinessValues);

  // Attention-ranked worklist: lowest readiness first; ties broken by risk tier.
  const worklist = [...results].sort(
    (a, b) => a.readinessScore - b.readinessScore || (TIER_RANK[b.riskTier] ?? 0) - (TIER_RANK[a.riskTier] ?? 0)
  );

  const topDeficiencyThemes = [...themeCounts.entries()]
    .map(([area, count]) => ({ area, count }))
    .sort((a, b) => b.count - a.count || a.area.localeCompare(b.area))
    .slice(0, 8);

  return {
    programCount: results.length,
    meanReadiness,
    minReadiness,
    verdictMix,
    likelyAcceptances: verdictMix['likely_acceptance'] ?? 0,
    aggregateFindingCounts,
    topDeficiencyThemes,
    worklist,
    criticalProgram: worklist[0] ?? null,
  };
}
