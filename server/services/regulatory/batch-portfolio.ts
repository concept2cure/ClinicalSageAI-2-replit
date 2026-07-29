/**
 * Batch portfolio runner.
 *
 * Ingests a list of program profiles, builds a full program plan for each (via
 * the orchestrator), and rolls them into a portfolio dashboard: per-program
 * executive lines plus aggregates (mean readiness, total remaining spend,
 * parallel vs sequential timeline, verdict mix, attention-ranked worklist).
 *
 * Intended for a CSV/JSON import → portfolio view (no UI; pure data).
 */

import { buildProgramPlan, type ProgramPlanInput } from './program-plan';

export interface BatchProgram {
  name: string;
  input: ProgramPlanInput;
}

export interface BatchProgramLine {
  name: string;
  ivdrClass: string;
  fdaPathway: string;
  readinessScore: number;
  verdict: string;
  riskTier: string;
  estimatedCalendarWeeksP50: number;
  totalRemainingCostUsd: number;
  topNextAction: string | null;
}

export interface BatchPortfolioResult {
  programCount: number;
  meanReadiness: number;
  minReadiness: number;
  /** Total remaining evidence spend across the portfolio (USD). */
  totalRemainingCostUsd: number;
  /** If programs run in parallel, the portfolio finishes with the longest one. */
  parallelTimelineWeeksP50: number;
  /** If run sequentially (resource-constrained), the sum. */
  sequentialTimelineWeeksP50: number;
  verdictMix: Record<string, number>;
  likelyAcceptances: number;
  /** Programs ranked by readiness ascending (where to focus first). */
  worklist: BatchProgramLine[];
  programs: BatchProgramLine[];
}

/** Build plans for a batch of programs and aggregate them into a portfolio view. */
export function runPortfolioPlans(programs: BatchProgram[]): BatchPortfolioResult {
  if (!Array.isArray(programs) || programs.length === 0) {
    return {
      programCount: 0, meanReadiness: 0, minReadiness: 0, totalRemainingCostUsd: 0,
      parallelTimelineWeeksP50: 0, sequentialTimelineWeeksP50: 0, verdictMix: {},
      likelyAcceptances: 0, worklist: [], programs: [],
    };
  }

  const lines: BatchProgramLine[] = programs.map(p => {
    const plan = buildProgramPlan(p.input);
    const es = plan.executiveSummary;
    return {
      name: p.name,
      ivdrClass: es.ivdrClass,
      fdaPathway: es.fdaPathway,
      readinessScore: es.readinessScore,
      verdict: es.verdict,
      riskTier: es.riskTier,
      estimatedCalendarWeeksP50: es.estimatedCalendarWeeksP50,
      totalRemainingCostUsd: es.totalRemainingCostUsd,
      topNextAction: es.topNextActions[0]?.label ?? null,
    };
  });

  const verdictMix: Record<string, number> = {};
  for (const l of lines) verdictMix[l.verdict] = (verdictMix[l.verdict] ?? 0) + 1;

  const readiness = lines.map(l => l.readinessScore);
  const meanReadiness = Math.round(readiness.reduce((s, v) => s + v, 0) / lines.length);
  const minReadiness = Math.min(...readiness);
  const totalRemainingCostUsd = lines.reduce((s, l) => s + l.totalRemainingCostUsd, 0);
  const p50s = lines.map(l => l.estimatedCalendarWeeksP50);
  const parallelTimelineWeeksP50 = Math.max(...p50s);
  const sequentialTimelineWeeksP50 = Math.round(p50s.reduce((s, v) => s + v, 0) * 10) / 10;

  const worklist = [...lines].sort((a, b) => a.readinessScore - b.readinessScore);

  return {
    programCount: lines.length,
    meanReadiness,
    minReadiness,
    totalRemainingCostUsd,
    parallelTimelineWeeksP50,
    sequentialTimelineWeeksP50,
    verdictMix,
    likelyAcceptances: verdictMix['likely_acceptance'] ?? 0,
    worklist,
    programs: lines,
  };
}
