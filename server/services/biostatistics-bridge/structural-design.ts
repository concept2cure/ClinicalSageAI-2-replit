/**
 * The protocol's STRUCTURAL design, translated for the sizing engine.
 *
 * Split out of `design-adapter.ts` on 2026-10-11, in the change that made the
 * adapter read `framework.structuralDesign` at all. Until then `studyTypeFor`
 * mapped five `StructuralDesign` members — single_arm, adaptive, basket,
 * platform, dose_ranging — and the other five fell through to `superiority`
 * with nothing else in the adapter looking at the field. So a protocol that
 * declared a 2×2 CROSSOVER was adapted into a plain two-parallel-group input
 * and sized as one: for d = 0.5, ρ = 0.5 that is ~128 subjects where the
 * crossover needs 32. The caller got a number, the design had said it was a
 * crossover, and no gap mentioned it.
 *
 * It lives here rather than inline because the adapter is at its line budget
 * and this is a self-contained translation: design in, engine fields and gaps
 * out, no I/O.
 */
import type { Endpoint, StudyDesign } from '../study-design/study-design-types';
import type { DesignGap, EngineEndpointType } from './design-gap';

/** The crossover fields the engine takes, and what the translation cost. */
export interface StructuralDesignMapping {
  crossoverPeriods?: number;
  withinSubjectCorrelation?: number;
  /** Engine input keys this mapping supplied, for the adapter's `mapped` list. */
  mapped: string[];
  gaps: DesignGap[];
}

/**
 * Read `framework.structuralDesign` and say what the engine should be told.
 *
 * A crossover with a continuous endpoint maps `crossoverPeriods: 2`, and takes
 * ρ from the plan's MMRM assumptions — the one place the design schema records
 * a within-subject correlation — with that substitution disclosed. Without a
 * ρ it BLOCKS, because sizing it as parallel groups would overstate N
 * several-fold. A crossover on any other endpoint family blocks for the same
 * reason. Factorial, umbrella and MAMS still get the parallel two-group
 * figure, which is a defensible per-comparison starting point, with a
 * `defaulted` gap that says so.
 */
/** Structural designs that have no engine method and take the two-group figure. */
const PARALLEL_FALLBACK = new Set(['factorial', 'umbrella', 'mams']);

/**
 * The within-subject correlation a 2×2 crossover is sized on, or null.
 *
 * The design schema records one only in the plan's MMRM assumptions — a
 * different analysis, so taking it is disclosed rather than assumed, and it is
 * taken only when it names this design's primary endpoint (or names none).
 */
function crossoverRho(
  plan: StudyDesign['statisticalPlan'],
  primary: Endpoint | undefined,
): { rho: number; endpointName?: string } | null {
  const rho = plan.mmrmAssumptions?.rho;
  const endpointName = plan.mmrmAssumptions?.endpointName;
  if (typeof rho !== 'number' || !(rho >= 0 && rho < 1)) return null;
  if (primary && endpointName && endpointName !== primary.name) return null;
  return { rho, ...(endpointName ? { endpointName } : {}) };
}

/** The 2×2 crossover's own fields and gaps, written onto `out`. */
function mapCrossover(
  out: StructuralDesignMapping,
  plan: StudyDesign['statisticalPlan'],
  endpointType: EngineEndpointType,
  primary: Endpoint | undefined,
): void {
  if (endpointType !== 'continuous') {
    // Sizing it as parallel groups would overstate N several-fold, so this
    // blocks rather than quietly producing the parallel figure.
    out.gaps.push({
      field: 'endpointType',
      message: `This is a crossover design with a ${endpointType} primary endpoint. The engine's crossover method is the 2×2 within-subject comparison of two MEANS (Julious 2004); a binary crossover is McNemar-based and a time-to-event endpoint is not a crossover comparison at all. Sizing it as parallel groups would overstate the sample size several-fold, so no figure is produced.`,
      severity: 'blocking',
      designPath: 'framework.structuralDesign',
    });
    return;
  }

  out.crossoverPeriods = 2;
  out.mapped.push('crossoverPeriods');

  const found = crossoverRho(plan, primary);
  if (found) {
    out.withinSubjectCorrelation = found.rho;
    out.mapped.push('withinSubjectCorrelation');
    out.gaps.push({
      field: 'withinSubjectCorrelation',
      message: `The crossover is sized with the within-subject correlation of ${found.rho} the plan records for its MMRM assumptions${found.endpointName ? ` (endpoint "${found.endpointName}")` : ''}. That figure was recorded for a repeated-measures analysis, not for this crossover; confirm it is the right correlation for the two-period comparison, because N scales with (1 − ρ).`,
      severity: 'defaulted',
      designPath: 'statisticalPlan.mmrmAssumptions.rho',
    });
  } else {
    out.gaps.push({
      field: 'withinSubjectCorrelation',
      message: 'A 2×2 crossover is sized on the within-subject correlation (N scales with 1 − ρ) and the design records none — the statistical plan has no field for it outside its MMRM assumptions. The engine refuses to assume one, so no figure is produced. Record it in the plan\'s MMRM assumptions, or size the design in the biostatistics workbench where the correlation is an input.',
      severity: 'blocking',
      designPath: 'statisticalPlan.mmrmAssumptions.rho',
    });
  }

  out.gaps.push({
    field: 'carryover',
    message: 'The crossover sizing assumes no carryover between periods. A washout long enough to exclude it is a design obligation the sizing does not verify.',
    severity: 'note',
    designPath: 'framework.structuralDesign',
  });
}

export function mapStructuralDesign(
  design: StudyDesign,
  endpointType: EngineEndpointType,
  primary: Endpoint | undefined,
): StructuralDesignMapping {
  const out: StructuralDesignMapping = { mapped: [], gaps: [] };
  const structural = design.framework?.structuralDesign;

  if (structural === 'crossover') {
    mapCrossover(out, design.statisticalPlan, endpointType, primary);
  } else if (structural && PARALLEL_FALLBACK.has(structural)) {
    // Same class of silence, lower stakes: these three also fall through to
    // the parallel two-group sizing, which is a defensible starting figure for
    // a factorial or MAMS design but is not the design's own method.
    out.gaps.push({
      field: 'studyType',
      message: `This is a ${structural.replace(/_/g, ' ')} design. The engine has no method for it and sizes the primary comparison as two parallel groups; the figure ignores the factorial structure, the multi-arm multi-stage boundaries or the umbrella's sub-study allocation. Treat it as the per-comparison starting point, not the study's N.`,
      severity: 'defaulted',
      designPath: 'framework.structuralDesign',
    });
  }

  return out;
}
