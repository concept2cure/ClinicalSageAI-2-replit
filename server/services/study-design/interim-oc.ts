/**
 * Interim-analysis operating characteristics — what the design's group-
 * sequential plan actually does to type I error, power and expected sample
 * size, computed exactly from the design object.
 *
 * ## The industry need
 * ICH E9 §4.5 and FDA's adaptive-design guidance (2019) expect a protocol with
 * interim analyses to show that the overall type I error is controlled and to
 * state the stopping boundaries and their operating characteristics; a DMC
 * charter is written against them. The spine records the interim plan
 * (information fractions, spending function, boundaries) and the design gates
 * check that it is named — but nothing computed what it does. This repository
 * has had an exact recursive-integration engine (Armitage–McPherson–Rowe;
 * `stats/group-sequential-oc.ts`) reachable only as a calculator. This module is
 * the spine's view of it; every boundary, probability and expected information
 * fraction here is that engine's.
 *
 * ## The honesty contract
 *  - Pure and total: no model, no clock, no RNG, no DB, no throw.
 *  - The RECORDED boundaries are what the protocol states, so they are what the
 *    operating characteristics are computed for. When a spending function is
 *    also named, the engine solves its boundaries and every look where the
 *    recorded boundary differs by more than {@link BOUNDARY_TOLERANCE} is a
 *    discrepancy finding — not silently replaced.
 *  - `lan_demets` names a FAMILY, not a function: nothing is solved for it and
 *    the gap says which choice is missing.
 *  - An unrecorded sidedness is not guessed silently: the upper boundary is
 *    solved at α/2 (the stricter, two-sided reading) and the assumption is a
 *    gap. No alpha → nothing is solved; no power → no power figure.
 *  - Futility boundaries are BINDING in the engine; the projection says so.
 *
 * @module server/services/study-design/interim-oc
 */

import {
  computeOperatingCharacteristic,
  expectedSampleSize,
  solveSpendingBoundaries,
  type SpendingFunction,
} from '../stats/group-sequential-oc';
import { normalQuantile } from '../stats/normal';
import type { InterimDesign, StudyDesign } from './study-design-types';

export const INTERIM_OC_BASIS =
  'ICH E9 §4.5 (interim analysis); FDA guidance: Adaptive Designs for Clinical Trials of Drugs and Biologics (2019); ' +
  'exact group-sequential computation (Armitage, McPherson & Rowe 1969; Jennison & Turnbull 2000, ch. 19); Lan & DeMets 1983 spending functions';

/** A recorded boundary within this of the solved one (z-scale) is a rounding of it, not a discrepancy. */
export const BOUNDARY_TOLERANCE = 0.01;

export type InterimOcStatus = 'rendered' | 'partial' | 'missing' | 'not_applicable';

export interface InterimLook {
  look: number;
  informationFraction: number;
  efficacyBoundary: number;
  futilityBoundary: number | null;
  /** Under H0 (drift 0). */
  efficacyStopUnderNull: number;
  /** Under the design alternative; null when no power is recorded. */
  efficacyStopUnderAlternative: number | null;
}

export interface InterimCharacteristics {
  /** Which boundaries these are the operating characteristics OF. */
  boundariesEvaluated: 'recorded' | 'solved';
  typeIError: number;
  /** Expected final z under the alternative the fixed design was powered for; null without alpha and power. */
  designDrift: number | null;
  power: number | null;
  expectedInformationFraction: { underNull: number; underAlternative: number | null };
  expectedSampleSize: { underNull: number; underAlternative: number | null } | null;
  perLook: InterimLook[];
}

export interface InterimOcProjection {
  status: InterimOcStatus;
  gaps: string[];
  notes: string[];
  schedule: number[] | null;
  oneSidedAlpha: number | null;
  spending: { recorded: InterimDesign['spendingFunction'] | null; engine: SpendingFunction | null };
  solvedEfficacyBoundaries: number[] | null;
  discrepancies: Array<{ look: number; recorded: number; solved: number; difference: number }>;
  characteristics: InterimCharacteristics | null;
  basis: string;
}

const ENGINE_SPENDING: Partial<Record<NonNullable<InterimDesign['spendingFunction']>, SpendingFunction>> = {
  obrien_fleming: 'obrien-fleming',
  pocock: 'pocock',
  linear: 'linear',
};

function validSchedule(f: number[]): boolean {
  return f.length > 0 && f.every((x, i) => x > 0 && x <= 1 && (i === 0 || x > f[i - 1])) && f[f.length - 1] === 1;
}

/** One-sided alpha for the upper boundary, and the gap when sidedness is assumed. */
function oneSidedAlphaOf(design: StudyDesign): { alpha: number | null; gaps: string[] } {
  const a = design.statisticalPlan?.alpha;
  if (!(typeof a === 'number' && a > 0 && a < 1)) return { alpha: null, gaps: ['the significance level (alpha) is not recorded: no boundary can be solved and no type I error target checked'] };
  const sided = design.statisticalPlan.oneSided;
  if (sided === true) return { alpha: a, gaps: [] };
  if (sided === false) return { alpha: a / 2, gaps: [] };
  return { alpha: a / 2, gaps: ['sidedness is not recorded: the upper boundary is solved at alpha/2, the stricter two-sided reading'] };
}

function empty(status: InterimOcStatus, gaps: string[], schedule: number[] | null = null): InterimOcProjection {
  return {
    status, gaps, notes: [], schedule, oneSidedAlpha: null, spending: { recorded: null, engine: null },
    solvedEfficacyBoundaries: null, discrepancies: [], characteristics: null, basis: INTERIM_OC_BASIS,
  };
}

/** Recorded efficacy (and usable futility) boundaries, or gaps saying why they cannot be used. */
function recordedBoundaries(interim: InterimDesign, k: number): { efficacy: number[] | null; futility: (number | null)[] | undefined; gaps: string[] } {
  const gaps: string[] = [];
  const e = interim.efficacyBoundaries;
  let efficacy: number[] | null = null;
  if (e?.length) {
    if (e.length === k && e.every((z) => Number.isFinite(z))) efficacy = e;
    else gaps.push(`${e.length} efficacy boundaries are recorded for ${k} analyses: they cannot be evaluated`);
  }
  const f = interim.futilityBoundaries;
  let futility: (number | null)[] | undefined;
  if (f?.length) {
    if (f.length === k) futility = f;
    else gaps.push(`${f.length} futility boundaries are recorded for ${k} analyses: futility is left out of the computation`);
  }
  return { efficacy, futility, gaps };
}

function solve(schedule: number[], alpha: number | null, engine: SpendingFunction | null): number[] | null {
  if (alpha === null || engine === null) return null;
  return solveSpendingBoundaries(schedule, alpha, engine).efficacyBoundaries;
}

interface EvaluationInput {
  schedule: number[];
  efficacy: number[];
  futility: (number | null)[] | undefined;
  which: 'recorded' | 'solved';
  oneSidedAlpha: number | null;
}

function characteristicsOf(design: StudyDesign, input: EvaluationInput): InterimCharacteristics {
  const { schedule, efficacy, futility, which, oneSidedAlpha } = input;
  const boundaries = { informationFractions: schedule, efficacyBoundaries: efficacy, futilityBoundaries: futility };
  const h0 = computeOperatingCharacteristic(boundaries, 0);
  const power = design.statisticalPlan?.power;
  const drift = oneSidedAlpha !== null && typeof power === 'number' && power > 0 && power < 1
    ? normalQuantile(1 - oneSidedAlpha) + normalQuantile(power)
    : null;
  const h1 = drift === null ? null : computeOperatingCharacteristic(boundaries, drift);
  const n = design.statisticalPlan?.plannedSampleSize;
  return {
    boundariesEvaluated: which,
    typeIError: h0.rejectProbability,
    designDrift: drift,
    power: h1 ? h1.rejectProbability : null,
    expectedInformationFraction: { underNull: h0.expectedInformationFraction, underAlternative: h1 ? h1.expectedInformationFraction : null },
    expectedSampleSize: typeof n === 'number' && n > 0
      ? { underNull: expectedSampleSize(h0.expectedInformationFraction, n), underAlternative: h1 ? expectedSampleSize(h1.expectedInformationFraction, n) : null }
      : null,
    perLook: h0.perLook.map((l, i) => ({
      look: l.look,
      informationFraction: l.informationFraction,
      efficacyBoundary: l.efficacyBoundary,
      futilityBoundary: l.futilityBoundary,
      efficacyStopUnderNull: l.efficacyStopProbability,
      efficacyStopUnderAlternative: h1 ? h1.perLook[i].efficacyStopProbability : null,
    })),
  };
}

function spendingGaps(recorded: InterimDesign['spendingFunction']): string[] {
  if (!recorded) return ['no alpha-spending function is named, so no boundary can be derived to check the recorded ones against'];
  if (recorded === 'lan_demets') return ['"lan_demets" names the spending-function family, not a function: record O\'Brien–Fleming-type or Pocock-type so the boundaries can be solved'];
  return [];
}

/** Every look where the recorded boundary departs from the solved one by more than the tolerance. */
function discrepanciesOf(recorded: number[] | null, solved: number[] | null): InterimOcProjection['discrepancies'] {
  if (!recorded || !solved) return [];
  return recorded.flatMap((z, i) =>
    Math.abs(z - solved[i]) > BOUNDARY_TOLERANCE ? [{ look: i + 1, recorded: z, solved: solved[i], difference: z - solved[i] }] : []);
}

/** No schedule, or an invalid one: the projection that computes nothing, and why. */
function unschedulable(design: StudyDesign, schedule: number[]): InterimOcProjection | null {
  if (schedule.length === 0) {
    return design.framework?.adaptiveFeatures?.includes('group_sequential')
      ? empty('missing', ['the design declares a group-sequential feature but records no interim schedule'])
      : empty('not_applicable', ['no interim analysis is planned']);
  }
  if (!validSchedule(schedule)) {
    return empty('partial', [`the information fractions [${schedule.join(', ')}] are not a valid schedule: strictly increasing within (0, 1] and ending at 1`], schedule);
  }
  return null;
}

/** The gaps that depend on what could be evaluated. */
function outcomeGaps(evaluable: boolean, discrepancyCount: number): string[] {
  const gaps: string[] = [];
  if (!evaluable) gaps.push('neither usable recorded boundaries nor a solvable spending function: no operating characteristic can be computed');
  if (discrepancyCount) {
    gaps.push(`${discrepancyCount} recorded efficacy boundar${discrepancyCount === 1 ? 'y differs' : 'ies differ'} from the named spending function's by more than ${BOUNDARY_TOLERANCE}`);
  }
  return gaps;
}

/** A valid schedule, evaluated: solve, compare, compute. */
function evaluateInterim(design: StudyDesign, interim: InterimDesign, schedule: number[]): InterimOcProjection {
  const { alpha, gaps: alphaGaps } = oneSidedAlphaOf(design);
  const engine = interim.spendingFunction ? ENGINE_SPENDING[interim.spendingFunction] ?? null : null;
  const rec = recordedBoundaries(interim, schedule.length);
  const solved = solve(schedule, alpha, engine);
  const discrepancies = discrepanciesOf(rec.efficacy, solved);
  const efficacy = rec.efficacy ?? solved;
  const gaps = [...alphaGaps, ...spendingGaps(interim.spendingFunction), ...rec.gaps, ...outcomeGaps(efficacy !== null, discrepancies.length)];
  const evaluation: EvaluationInput | null = efficacy
    ? { schedule, efficacy, futility: rec.futility, which: rec.efficacy ? 'recorded' : 'solved', oneSidedAlpha: alpha }
    : null;
  return {
    status: gaps.length ? 'partial' : 'rendered',
    gaps,
    notes: rec.futility ? ['futility boundaries are treated as binding: the continuation region is truncated at them'] : [],
    schedule,
    oneSidedAlpha: alpha,
    spending: { recorded: interim.spendingFunction ?? null, engine },
    solvedEfficacyBoundaries: solved,
    discrepancies,
    characteristics: evaluation ? characteristicsOf(design, evaluation) : null,
    basis: INTERIM_OC_BASIS,
  };
}

/** Project the interim plan's operating characteristics. Every figure is the exact engine's. */
export function projectInterimOperatingCharacteristics(design: StudyDesign): InterimOcProjection {
  const interim = design.statisticalPlan?.interim;
  const schedule = interim?.informationFractions ?? [];
  const early = unschedulable(design, schedule);
  if (early || !interim) return early ?? empty('not_applicable', ['no interim analysis is planned']);
  return evaluateInterim(design, interim, schedule);
}
