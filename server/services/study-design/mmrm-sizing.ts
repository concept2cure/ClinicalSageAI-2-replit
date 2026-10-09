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
 *    The output says what was sized: the allocation ratio and where it came
 *    from, and the target visit.
 *  - Every assumption is the sponsor's. The engine has defaults (alpha 0.05,
 *    power 0.90, complete data, 1:1); the projection never lets one stand in
 *    for a missing assumption — no alpha, power, retention or allocation: a
 *    gap, and nothing is sized. The allocation is read from the MMRM
 *    assumptions, else from the design's randomization ratio; a recorded 2:1
 *    is never sized as 1:1, and two recorded ratios that disagree are a gap.
 *  - What is sized is what the plan analyses. The engine sizes a two-sided
 *    superiority contrast: a non-inferiority or equivalence frame, or none, is
 *    not sized. Assumptions for an endpoint the plan analyses by another
 *    method are not sized; an endpoint the plan analyses by MMRM without
 *    assumptions is reported unsized.
 *  - A one-sided alpha is doubled only when the result is a two-sided alpha
 *    below 1; nothing is clamped.
 *  - The comparison with the planned N is arithmetic on two recorded numbers,
 *    reported both ways: covered, or short by how many — and not made when
 *    the design randomizes more arms than the engine's two-arm total counts.
 *  - The visit count is cross-checked against the Schedule of Activities when
 *    one is recorded; a mismatch is a gap, and so is a check that cannot run
 *    (malformed SoA, no baseline, no activity linked to the endpoint). A
 *    recorded dropout rate that the retention contradicts is a gap.
 *  - Pure and total: a malformed persisted node is a gap, not a throw; the
 *    provenance carries no clock reading.
 *
 * @module server/services/study-design/mmrm-sizing
 */

import { mmrmSampleSize, MMRM_COVARIANCES, type MmrmDesignResult } from '../stats/mmrm-design';
import { reproducibleProvenance, type ReproducibleProvenance } from '../stats/computation-provenance';
import type { MmrmAssumptions, StudyDesign } from './study-design-types';

export const MMRM_SIZING_BASIS =
  'ICH E9(R1) — MMRM under missing at random for longitudinal continuous endpoints; GLS information under monotone dropout ' +
  '(planning computation, stats/mmrm-design.ts)';

/** Largest gap between the plan's dropout rate and 1 − final-visit retention that is not reported. */
export const MMRM_DROPOUT_TOLERANCE = 0.02;

export type MmrmSizingStatus = 'rendered' | 'partial' | 'missing' | 'not_applicable';

export interface MmrmSizingResult {
  /** The engine's n₁: the first arm of the allocation (the first-listed arm of the randomization ratio). */
  nPerArm: number;
  /** n₂ = nTotal − n₁; equal to nPerArm at 1:1. */
  nSecondArm: number;
  nTotal: number;
  /** n₂/n₁ the engine sized at, and where it was read from. */
  allocationRatio: number;
  allocationSource: 'mmrm_assumptions' | 'randomization';
  /** 1-based visit the contrast was sized at (the engine's, from its inputs). */
  targetVisit: number;
  varianceFactor: number;
  efficiencyVsCompleters: number;
  achievedPower: number;
  /** Two-sided alpha the engine sized at. */
  alphaTwoSided: number;
  provenance: ReproducibleProvenance;
}

export interface MmrmSizingProjection {
  status: MmrmSizingStatus;
  gaps: string[];
  endpointName: string | null;
  sizing: MmrmSizingResult | null;
  /** Planned N against the requirement; null when either is unknown or they count different arms. */
  plannedVsRequired: { planned: number; required: number; covered: boolean; shortfall: number } | null;
  /** Post-baseline visits the SoA schedules for the endpoint; null when not countable. */
  soaVisitCount: number | null;
  basis: string;
}

/** Gaps split by consequence: a blocking gap stops sizing; a note is reported beside a size. */
interface Checked { blocking: string[]; notes: string[] }

const MMRM_METHOD =
  /\bmmrm\b|mixed[- ](?:effects?[- ])?models?[- ](?:(?:for|with|of)[- ])?repeated[- ]measures?|repeated[- ]measures?[- ](?:linear[- ])?mixed[- ](?:effects?[- ])?models?/i;

/** True when a free-text analysis method names a mixed model for repeated measures. */
export function isMmrmMethod(method: unknown): boolean {
  return typeof method === 'string' && MMRM_METHOD.test(method);
}

const isRecord = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v);

const round6 = (x: number): number => Math.round(x * 1e6) / 1e6;

function empty(status: MmrmSizingStatus, gaps: string[], endpointName: string | null = null): MmrmSizingProjection {
  return { status, gaps, endpointName, sizing: null, plannedVsRequired: null, soaVisitCount: null, basis: MMRM_SIZING_BASIS };
}

/** Two-sided alpha for the engine. A missing alpha blocks; an assumed sidedness is a note. */
function alphaFor(design: StudyDesign): Checked & { alpha: number | null } {
  const a = design.statisticalPlan?.alpha;
  if (!(typeof a === 'number' && a > 0 && a < 1)) return { alpha: null, blocking: ['the significance level (alpha) is not recorded'], notes: [] };
  const sided = design.statisticalPlan.oneSided;
  if (sided === true && a >= 0.5) {
    return { alpha: null, blocking: [`a one-sided alpha of ${a} has no two-sided equivalent below 1: nothing is sized`], notes: [] };
  }
  if (sided === true) return { alpha: 2 * a, blocking: [], notes: [] };
  if (sided === false) return { alpha: a, blocking: [], notes: [] };
  return { alpha: a, blocking: [], notes: ['sidedness is not recorded: alpha is read as two-sided'] };
}

const inUnit = (v: unknown, lowInclusive: boolean): boolean =>
  typeof v === 'number' && (lowInclusive ? v >= 0 : v > 0) && v < 1;

/** Every defect in the recorded model assumptions. Empty when the engine can run. */
function assumptionGaps(m: MmrmAssumptions): string[] {
  const gaps: string[] = [];
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

/** The engine sizes a two-sided superiority contrast; any other frame, or none, is not sized. */
function frameGaps(design: StudyDesign): string[] {
  const frame = isRecord(design.framework) ? design.framework.inferentialFrame : undefined;
  if (frame === 'superiority') return [];
  if (frame === 'non_inferiority' || frame === 'equivalence') {
    return [`the design's inferential frame is ${frame.replace('_', '-')}: the MMRM engine sizes a two-sided superiority contrast only, so no sample size is computed for this frame`];
  }
  return ['the inferential frame is not recorded: the MMRM engine sizes a superiority contrast only, and superiority is not assumed'];
}

type Planned = Array<{ endpointName: string; method: string }>;

/** The plan's analyses, as far as they are well-formed records. */
function plannedAnalyses(design: StudyDesign): Planned {
  const list = design.statisticalPlan?.plannedAnalyses;
  if (!Array.isArray(list)) return [];
  return list
    .filter((a) => isRecord(a) && typeof a.endpointName === 'string')
    .map((a) => ({ endpointName: a.endpointName, method: typeof a.method === 'string' ? a.method : '' }));
}

/** Endpoints the plan analyses by MMRM, in plan order, once each. */
function mmrmPlannedEndpoints(planned: Planned): string[] {
  return [...new Set(planned.filter((a) => isMmrmMethod(a.method)).map((a) => a.endpointName))];
}

/** Is the assumptions' endpoint one the plan analyses by MMRM, and is every MMRM-analysed endpoint sized? */
function endpointGaps(design: StudyDesign, endpointName: string | null, planned: Planned): Checked {
  if (endpointName === null) return { blocking: ['the MMRM assumptions name no endpoint: it is not known which endpoint they size'], notes: [] };
  const blocking: string[] = [];
  const notes: string[] = [];
  const endpoints = Array.isArray(design.endpoints) ? design.endpoints : [];
  if (!endpoints.some((e) => isRecord(e) && e.name === endpointName && e.type === 'continuous')) {
    blocking.push(`endpoint "${endpointName}" is not a continuous endpoint of this design`);
  }
  const ofEndpoint = planned.filter((a) => a.endpointName === endpointName);
  if (ofEndpoint.length === 0) {
    notes.push(`no planned analysis of "${endpointName}" is recorded, so it is not confirmed that the plan analyses it by MMRM`);
  } else if (!ofEndpoint.some((a) => isMmrmMethod(a.method))) {
    const methods = [...new Set(ofEndpoint.map((a) => a.method.trim() || 'an unnamed method'))].join(', ');
    blocking.push(`the plan analyses "${endpointName}" by ${methods}, not by MMRM: an MMRM sample size does not apply to it`);
  }
  for (const other of mmrmPlannedEndpoints(planned).filter((n) => n !== endpointName)) {
    notes.push(`the plan also analyses "${other}" by MMRM, and no MMRM assumptions are recorded for it: it is not sized`);
  }
  return { blocking, notes };
}

/** The randomization ratio as recorded: absent, not a list of positive numbers, or the list. */
function randomizationRatio(design: StudyDesign): number[] | 'absent' | 'invalid' {
  const r = isRecord(design.randomization) ? design.randomization.ratio : undefined;
  if (r === undefined || r === null) return 'absent';
  if (!Array.isArray(r) || r.length < 2 || !r.every((x) => typeof x === 'number' && Number.isFinite(x) && x > 0)) return 'invalid';
  return r;
}

type Allocation = Checked & { ratio: number | null; source: MmrmSizingResult['allocationSource'] };

/** n₂/n₁ from the MMRM assumptions, else from a two-arm randomization ratio; never the engine's 1:1. */
function allocationOf(design: StudyDesign, m: MmrmAssumptions): Allocation {
  const rr = randomizationRatio(design);
  const k = m.allocationRatio;
  if (k !== undefined && k !== null) {
    if (!(typeof k === 'number' && Number.isFinite(k) && k > 0)) {
      return { ratio: null, source: 'mmrm_assumptions', blocking: ['the allocation ratio in the MMRM assumptions must be a positive number'], notes: [] };
    }
    const agrees = !Array.isArray(rr) || rr.length !== 2 || [rr[1] / rr[0], rr[0] / rr[1]].some((x) => Math.abs(x - k) < 1e-9);
    const notes = agrees ? [] : [`the MMRM assumptions allocate n₂/n₁ = ${k}; the randomization records ${rr.join(':')}`];
    return { ratio: k, source: 'mmrm_assumptions', blocking: [], notes };
  }
  if (Array.isArray(rr) && rr.length === 2) return { ratio: rr[1] / rr[0], source: 'randomization', blocking: [], notes: [] };
  const blocking = Array.isArray(rr)
    ? [`the allocation ratio is not recorded in the MMRM assumptions, and the randomization (${rr.join(':')}) has ${rr.length} arms: which two the MMRM contrast compares is not recorded`]
    : rr === 'invalid'
      ? ['the allocation ratio is not recorded in the MMRM assumptions, and the randomization ratio is not a list of positive numbers']
      : ['the allocation ratio is not recorded (neither in the MMRM assumptions nor as the randomization ratio): the engine\'s 1:1 is not assumed'];
  return { ratio: null, source: 'randomization', blocking, notes: [] };
}

/** Post-baseline visits at which the endpoint is scheduled; when the check cannot run, the reason. */
function soaVisitCount(design: StudyDesign, endpointName: string): { count: number | null; gap: string | null } {
  const soa: unknown = design.scheduleOfActivities;
  if (soa === undefined || soa === null) return { count: null, gap: null };
  if (!isRecord(soa) || !Array.isArray(soa.visits) || !Array.isArray(soa.activities) || !Array.isArray(soa.cells)) {
    return { count: null, gap: 'the Schedule of Activities is malformed (it lacks a visits, activities or cells list): the modelled visit count is not cross-checked against it' };
  }
  const visits = soa.visits.filter(isRecord);
  const baseline = visits.find((v) => v.isBaseline === true);
  if (!baseline || typeof baseline.order !== 'number') {
    return { count: null, gap: 'the Schedule of Activities flags no baseline visit: the modelled post-baseline visit count is not cross-checked against it' };
  }
  const linked = soa.activities.filter((a) => isRecord(a) && Array.isArray(a.endpointNames) && a.endpointNames.includes(endpointName));
  if (linked.length === 0) {
    return { count: null, gap: `no Schedule of Activities activity is linked to "${endpointName}": the modelled visit count is not cross-checked against it` };
  }
  const activityIds = new Set(linked.map((a) => (a as Record<string, unknown>).id));
  const baseOrder = baseline.order;
  const later = new Set(visits.filter((v) => typeof v.order === 'number' && v.order > baseOrder && v.unscheduled !== true).map((v) => v.id));
  const scheduled = soa.cells.filter((c) => isRecord(c) && activityIds.has(c.activityId) && later.has(c.visitId));
  return { count: new Set(scheduled.map((c) => (c as Record<string, unknown>).visitId)).size, gap: null };
}

function toResult(r: MmrmDesignResult, alpha: number, source: MmrmSizingResult['allocationSource']): MmrmSizingResult {
  return {
    nPerArm: r.nPerArm,
    nSecondArm: r.nTotal - r.nPerArm,
    nTotal: r.nTotal,
    allocationRatio: r.inputs.allocationRatio,
    allocationSource: source,
    targetVisit: r.inputs.targetVisit,
    varianceFactor: r.varianceFactor,
    efficiencyVsCompleters: r.efficiencyVsCompleters,
    achievedPower: r.achievedPower,
    alphaTwoSided: alpha,
    provenance: reproducibleProvenance(r.provenance),
  };
}

/** Arms the design randomizes: the randomization ratio's length, else the arm list's. */
function armCount(design: StudyDesign): number {
  const rr = randomizationRatio(design);
  if (Array.isArray(rr)) return rr.length;
  return Array.isArray(design.arms) ? design.arms.length : 0;
}

/** The planned N against the requirement; not compared when the design randomizes more than two arms. */
function plannedComparison(design: StudyDesign, sizing: MmrmSizingResult) {
  const planned = design.statisticalPlan?.plannedSampleSize;
  if (!(typeof planned === 'number' && planned > 0)) {
    return { gaps: ['the planned sample size is not recorded, so it cannot be checked against the MMRM requirement'], plannedVsRequired: null };
  }
  const arms = armCount(design);
  if (arms > 2) {
    return { gaps: [`the design randomizes ${arms} arms; the engine's total is for one two-arm contrast, so the planned total is not compared with it`], plannedVsRequired: null };
  }
  const plannedVsRequired = { planned, required: sizing.nTotal, covered: planned >= sizing.nTotal, shortfall: Math.max(0, sizing.nTotal - planned) };
  const gaps = plannedVsRequired.covered ? [] : [`the planned sample size (${planned}) is ${plannedVsRequired.shortfall} below the MMRM requirement (${sizing.nTotal})`];
  return { gaps, plannedVsRequired };
}

/** The gaps that follow from comparing the sized N with the plan and the SoA. */
function consistencyGaps(design: StudyDesign, m: MmrmAssumptions, sizing: MmrmSizingResult, endpointName: string) {
  const { gaps, plannedVsRequired } = plannedComparison(design, sizing);
  const soa = soaVisitCount(design, endpointName);
  if (soa.gap) gaps.push(soa.gap);
  else if (soa.count !== null && soa.count !== m.visits) {
    gaps.push(`the assumptions model ${m.visits} post-baseline visits; the Schedule of Activities schedules the endpoint at ${soa.count}`);
  }
  const dropout = design.statisticalPlan?.dropoutRate;
  const implied = 1 - m.retention[m.retention.length - 1];
  if (typeof dropout === 'number' && Number.isFinite(dropout) && Math.abs(dropout - implied) > MMRM_DROPOUT_TOLERANCE) {
    gaps.push(`the plan's dropout rate (${dropout}) and the dropout the MMRM retention implies by the final visit (${round6(implied)}) differ by more than ${MMRM_DROPOUT_TOLERANCE}`);
  }
  if (!(typeof m.source === 'string' && m.source.trim())) gaps.push('the source of the MMRM assumptions is not recorded');
  return { gaps, plannedVsRequired, soaCount: soa.count };
}

/** Every input check; the size runs only when nothing blocks. */
function inputChecks(design: StudyDesign, m: MmrmAssumptions, endpointName: string | null) {
  const endpoint = endpointGaps(design, endpointName, plannedAnalyses(design));
  const alpha = alphaFor(design);
  const p = design.statisticalPlan?.power;
  const power = typeof p === 'number' && p > 0 && p < 1 ? p : null;
  const allocation = allocationOf(design, m);
  const blocking = [...endpoint.blocking, ...assumptionGaps(m), ...frameGaps(design), ...alpha.blocking];
  if (power === null) blocking.push('the target power is not recorded: no sample size is computed rather than assume one');
  blocking.push(...allocation.blocking);
  return { blocking, notes: [...endpoint.notes, ...alpha.notes, ...allocation.notes], alpha: alpha.alpha, power, allocation };
}

/** Size the MMRM-analysed endpoint from the design's assumptions. Every figure is the engine's. */
export function projectMmrmSizing(design: StudyDesign): MmrmSizingProjection {
  const m: unknown = design.statisticalPlan?.mmrmAssumptions;
  if (!isRecord(m)) {
    const planned = mmrmPlannedEndpoints(plannedAnalyses(design));
    if (planned.length === 0) return empty('not_applicable', ['no MMRM analysis is planned and no MMRM assumptions are recorded']);
    const gaps = planned.map((n) => `the plan analyses "${n}" by MMRM but records no covariance, correlation, SD, effect or retention assumptions: the MMRM sample size cannot be computed`);
    return empty('missing', gaps, planned[0]);
  }
  const a = m as unknown as MmrmAssumptions;
  const endpointName = typeof a.endpointName === 'string' && a.endpointName.trim() ? a.endpointName : null;
  const checks = inputChecks(design, a, endpointName);
  const { alpha, power, allocation } = checks;
  if (checks.blocking.length > 0 || endpointName === null || alpha === null || power === null || allocation.ratio === null) {
    return empty('partial', [...checks.blocking, ...checks.notes], endpointName);
  }
  let sizing: MmrmSizingResult;
  try {
    sizing = toResult(mmrmSampleSize({ ...a, alpha, power, allocationRatio: allocation.ratio }), alpha, allocation.source);
  } catch (err) {
    return empty('partial', [...checks.notes, `the engine refused the assumptions: ${(err as Error).message}`], endpointName);
  }
  const consistency = consistencyGaps(design, a, sizing, endpointName);
  const all = [...checks.notes, ...consistency.gaps];
  return {
    status: all.length ? 'partial' : 'rendered',
    gaps: all,
    endpointName,
    sizing,
    plannedVsRequired: consistency.plannedVsRequired,
    soaVisitCount: consistency.soaCount,
    basis: MMRM_SIZING_BASIS,
  };
}
