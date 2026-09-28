/**
 * MMRM sizing — the sample size an MMRM-analysed continuous endpoint needs,
 * from the sponsor's planning assumptions, checked against the planned N.
 *
 * ## The industry need
 * The mixed model for repeated measures is the regulatory default primary
 * analysis for a longitudinal continuous endpoint under missing-at-random
 * (ICH E9(R1); the SAP projection already names it). A protocol's sample-size
 * section must show the planned N supports it under stated assumptions:
 * correlation structure, SD, effect, and the dropout pattern across visits.
 * `sample-size.ts` sizes a single final-visit comparison and cannot credit
 * MMRM for the information dropouts carry through earlier visits. This
 * repository has an exact planning engine for exactly that
 * (`stats/mmrm-design.ts`, GLS information under monotone MAR dropout),
 * reachable only as a calculator; this module is the spine's view of it.
 *
 * ## The honesty contract
 *  - Every figure is the engine's (`mmrmSampleSize`); nothing re-derives it.
 *  - Every assumption is the sponsor's. The engine has defaults (power 0.90,
 *    complete data); the projection never lets one stand in for a missing
 *    assumption — no power, no retention, no SD: a gap, and nothing is sized.
 *  - The comparison with the planned N is arithmetic on two recorded numbers,
 *    reported both ways: covered, or short by how many.
 *  - The visit count is cross-checked against the Schedule of Activities when
 *    one is recorded; a mismatch is a gap, not silently resolved.
 *  - Pure and total; the provenance carries no clock reading.
 *
 * @module server/services/study-design/mmrm-sizing
 */

import { mmrmSampleSize, MMRM_COVARIANCES, type MmrmDesignResult } from '../stats/mmrm-design';
import { reproducibleProvenance, type ReproducibleProvenance } from '../stats/computation-provenance';
import type { MmrmAssumptions, StudyDesign } from './study-design-types';

export const MMRM_SIZING_BASIS =
  'ICH E9(R1) — MMRM under missing at random for longitudinal continuous endpoints; GLS information under monotone dropout ' +
  '(planning computation, stats/mmrm-design.ts)';

export type MmrmSizingStatus = 'rendered' | 'partial' | 'missing' | 'not_applicable';

export interface MmrmSizingResult {
  nPerArm: number;
  nTotal: number;
  varianceFactor: number;
  efficiencyVsCompleters: number;
  achievedPower: number;
  /** Two-sided alpha the engine sized at, and how it was read from the design. */
  alphaTwoSided: number;
  provenance: ReproducibleProvenance;
}

export interface MmrmSizingProjection {
  status: MmrmSizingStatus;
  gaps: string[];
  endpointName: string | null;
  sizing: MmrmSizingResult | null;
  /** Planned N against the requirement; null when either is unknown. */
  plannedVsRequired: { planned: number; required: number; covered: boolean; shortfall: number } | null;
  /** Post-baseline visits the SoA schedules for the endpoint; null when not countable. */
  soaVisitCount: number | null;
  basis: string;
}

const MMRM_METHOD = /\bmmrm\b|mixed[- ]model (for )?repeated measures/i;

function empty(status: MmrmSizingStatus, gaps: string[], endpointName: string | null = null): MmrmSizingProjection {
  return { status, gaps, endpointName, sizing: null, plannedVsRequired: null, soaVisitCount: null, basis: MMRM_SIZING_BASIS };
}

/** Two-sided alpha for the engine, and the gap when sidedness is assumed. */
function alphaFor(design: StudyDesign): { alpha: number | null; gaps: string[] } {
  const a = design.statisticalPlan?.alpha;
  if (!(typeof a === 'number' && a > 0 && a < 1)) return { alpha: null, gaps: ['the significance level (alpha) is not recorded'] };
  if (design.statisticalPlan.oneSided === true) return { alpha: Math.min(2 * a, 0.999), gaps: [] };
  if (design.statisticalPlan.oneSided === false) return { alpha: a, gaps: [] };
  return { alpha: a, gaps: ['sidedness is not recorded: alpha is read as two-sided'] };
}

const inUnit = (v: unknown, lowInclusive: boolean): boolean =>
  typeof v === 'number' && (lowInclusive ? v >= 0 : v > 0) && v < 1;

/** Every defect in the recorded assumptions. Empty when the engine can run. */
function assumptionGaps(m: MmrmAssumptions, endpointOk: boolean): string[] {
  const gaps: string[] = [];
  if (!endpointOk) gaps.push(`endpoint "${m.endpointName}" is not a continuous endpoint of this design`);
  if (!(Number.isInteger(m.visits) && m.visits >= 1)) gaps.push('the number of post-baseline visits must be a whole number of at least 1');
  if (!MMRM_COVARIANCES.includes(m.covariance)) gaps.push(`covariance "${String(m.covariance)}" is not one the engine implements (compound_symmetry, ar1)`);
  if (!inUnit(m.rho, true)) gaps.push('the within-subject correlation must be at least 0 and below 1');
  if (!(typeof m.sigma === 'number' && m.sigma > 0)) gaps.push('the SD must be positive');
  if (!(typeof m.delta === 'number' && Number.isFinite(m.delta) && m.delta !== 0)) gaps.push('the effect (delta) must be a non-zero number');
  return [...gaps, ...retentionGaps(m)];
}

function retentionGaps(m: MmrmAssumptions): string[] {
  const r = m.retention;
  if (!Array.isArray(r) || r.length === 0) return ['per-visit retention is not recorded: the dropout pattern MMRM is sized under is unknown, and complete data is not assumed'];
  const gaps: string[] = [];
  if (r.length !== m.visits) gaps.push(`${r.length} retention values are recorded for ${m.visits} visits`);
  if (!r.every((x, i) => typeof x === 'number' && x > 0 && x <= 1 && (i === 0 || x <= r[i - 1]))) {
    gaps.push('retention must be in (0, 1] and never increase from one visit to the next');
  }
  if (m.targetVisit !== undefined && !(Number.isInteger(m.targetVisit) && m.targetVisit >= 1 && m.targetVisit <= m.visits)) {
    gaps.push('the target visit is not one of the modelled visits');
  }
  return gaps;
}

/** Post-baseline visits at which the endpoint's activities are scheduled, or null when not countable. */
function soaVisitCount(design: StudyDesign, endpointName: string): number | null {
  const soa = design.scheduleOfActivities;
  if (!soa) return null;
  const baseline = soa.visits.find((v) => v.isBaseline);
  if (!baseline) return null;
  const activityIds = new Set(soa.activities.filter((a) => a.endpointNames?.includes(endpointName)).map((a) => a.id));
  if (activityIds.size === 0) return null;
  const later = new Set(soa.visits.filter((v) => v.order > baseline.order).map((v) => v.id));
  return new Set(soa.cells.filter((c) => activityIds.has(c.activityId) && later.has(c.visitId)).map((c) => c.visitId)).size;
}

function toResult(r: MmrmDesignResult, alpha: number): MmrmSizingResult {
  return {
    nPerArm: r.nPerArm,
    nTotal: r.nTotal,
    varianceFactor: r.varianceFactor,
    efficiencyVsCompleters: r.efficiencyVsCompleters,
    achievedPower: r.achievedPower,
    alphaTwoSided: alpha,
    provenance: reproducibleProvenance(r.provenance),
  };
}

/** Which endpoint MMRM applies to, or null when no MMRM is planned or assumed. */
function mmrmEndpoint(design: StudyDesign): string | null {
  const m = design.statisticalPlan?.mmrmAssumptions;
  if (m) return m.endpointName;
  const planned = (design.statisticalPlan?.plannedAnalyses ?? []).find((a) => MMRM_METHOD.test(a.method ?? ''));
  return planned ? planned.endpointName : null;
}

function inputGaps(design: StudyDesign, m: MmrmAssumptions): { gaps: string[]; alpha: number | null; power: number | null } {
  const endpointOk = (design.endpoints ?? []).some((e) => e.name === m.endpointName && e.type === 'continuous');
  const { alpha, gaps: alphaGaps } = alphaFor(design);
  const p = design.statisticalPlan?.power;
  const power = typeof p === 'number' && p > 0 && p < 1 ? p : null;
  const gaps = [...assumptionGaps(m, endpointOk), ...alphaGaps];
  if (power === null) gaps.push('the target power is not recorded: no sample size is computed rather than assume one');
  return { gaps, alpha, power };
}

/** The gaps that follow from comparing the sized N with the plan and the SoA. */
function consistencyGaps(design: StudyDesign, m: MmrmAssumptions, sizing: MmrmSizingResult, soaCount: number | null) {
  const gaps: string[] = [];
  const planned = design.statisticalPlan?.plannedSampleSize;
  const plannedVsRequired = typeof planned === 'number' && planned > 0
    ? { planned, required: sizing.nTotal, covered: planned >= sizing.nTotal, shortfall: Math.max(0, sizing.nTotal - planned) }
    : null;
  if (!plannedVsRequired) gaps.push('the planned sample size is not recorded, so it cannot be checked against the MMRM requirement');
  else if (!plannedVsRequired.covered) gaps.push(`the planned sample size (${planned}) is ${plannedVsRequired.shortfall} below the MMRM requirement (${sizing.nTotal})`);
  if (soaCount !== null && soaCount !== m.visits) {
    gaps.push(`the assumptions model ${m.visits} post-baseline visits; the Schedule of Activities schedules the endpoint at ${soaCount}`);
  }
  if (!m.source?.trim()) gaps.push('the source of the MMRM assumptions is not recorded');
  return { gaps, plannedVsRequired };
}

/** Size the MMRM-analysed endpoint from the design's assumptions. Every figure is the engine's. */
export function projectMmrmSizing(design: StudyDesign): MmrmSizingProjection {
  const endpointName = mmrmEndpoint(design);
  if (endpointName === null) return empty('not_applicable', ['no MMRM analysis is planned and no MMRM assumptions are recorded']);
  const m = design.statisticalPlan?.mmrmAssumptions;
  if (!m) {
    return empty('missing', [`the plan analyses "${endpointName}" by MMRM but records no covariance, correlation, SD, effect or retention assumptions: the MMRM sample size cannot be computed`], endpointName);
  }
  const { gaps, alpha, power } = inputGaps(design, m);
  if (gaps.some((g) => !g.startsWith('sidedness')) || alpha === null || power === null) return empty('partial', gaps, endpointName);
  let sizing: MmrmSizingResult;
  try {
    sizing = toResult(mmrmSampleSize({ ...m, alpha, power }), alpha);
  } catch (err) {
    return empty('partial', [...gaps, `the engine refused the assumptions: ${(err as Error).message}`], endpointName);
  }
  const soaCount = soaVisitCount(design, endpointName);
  const consistency = consistencyGaps(design, m, sizing, soaCount);
  const all = [...gaps, ...consistency.gaps];
  return {
    status: all.length ? 'partial' : 'rendered',
    gaps: all,
    endpointName,
    sizing,
    plannedVsRequired: consistency.plannedVsRequired,
    soaVisitCount: soaCount,
    basis: MMRM_SIZING_BASIS,
  };
}
