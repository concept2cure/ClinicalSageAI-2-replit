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
 *  - Pure and total: no model, no clock, no RNG, no DB, no throw — a malformed
 *    or out-of-range input is a gap. Bounded: at most {@link MAX_ANALYSES}
 *    analyses are computed; a longer schedule is a gap.
 *  - The RECORDED boundaries are what the protocol states, so they are what the
 *    operating characteristics are computed for. When a spending function is
 *    also named, the engine solves its boundaries and every look where the
 *    recorded boundary differs by more than {@link BOUNDARY_TOLERANCE} is a
 *    discrepancy finding — not silently replaced. Only the three functions the
 *    engine implements are solved; any other name is a gap.
 *  - `lan_demets` names a FAMILY, not a function: nothing is solved for it and
 *    the gap says which choice is missing.
 *  - The type I error is the one-sided, NON-BINDING one: futility is ignored
 *    (the engine's own conservative computation), so futility is never credited
 *    to alpha. A type I error above the one-sided alpha (beyond
 *    {@link TYPE_I_ERROR_TOLERANCE}) is a gap. Validated futility boundaries
 *    are applied to power and expected sample size, and the binding type I
 *    error is reported apart, labelled.
 *  - An unrecorded sidedness is not guessed silently: the upper boundary is
 *    solved at α/2 (the stricter, two-sided reading) and the assumption is a
 *    gap. A missing or invalid alpha, power or planned sample size is a gap and
 *    leaves the figure it feeds null. Power's no-inflation assumption is stated.
 *
 * @module server/services/study-design/interim-oc
 */

import {
  computeOperatingCharacteristic,
  expectedSampleSize,
  solveSpendingBoundaries,
  type OperatingCharacteristic,
  type SpendingFunction,
} from '../stats/group-sequential-oc';
import { normalQuantile } from '../stats/normal';
import type { StudyDesign } from './study-design-types';

export const INTERIM_OC_BASIS =
  'ICH E9 §4.5 (interim analysis); FDA guidance: Adaptive Designs for Clinical Trials of Drugs and Biologics (2019); ' +
  'exact group-sequential computation (Armitage, McPherson & Rowe 1969; Jennison & Turnbull 2000, ch. 19); Lan & DeMets 1983 spending functions';

/** A recorded boundary within this of the solved one (z-scale) is a rounding of it, not a discrepancy. */
export const BOUNDARY_TOLERANCE = 0.01;

/**
 * The exact engine's integration error on a crossing probability is below
 * 1e-5 at its default grid; a type I error above alpha by less than this is
 * grid noise, not inflation.
 */
export const TYPE_I_ERROR_TOLERANCE = 1e-4;

/**
 * The most analyses computed here. Each look is an O(M²) convolution over
 * about 1,200 grid points, run up to five times per projection; a longer
 * schedule is refused rather than blocking the request.
 */
export const MAX_ANALYSES = 10;

export type InterimOcStatus = 'rendered' | 'partial' | 'missing' | 'not_applicable';

export interface InterimLook {
  look: number;
  informationFraction: number;
  efficacyBoundary: number;
  /** The futility boundary APPLIED at this look, after validation; null when none is. */
  futilityBoundary: number | null;
  /** P(first efficacy crossing at this look) under H0 with futility ignored (non-binding); these sum to `typeIError`. */
  efficacyStopUnderNull: number;
  /** The same under the design alternative, with the applied futility followed; these sum to `power`. Null when no power is computed. */
  efficacyStopUnderAlternative: number | null;
}

export interface InterimCharacteristics {
  /** Which boundaries these are the operating characteristics OF. */
  boundariesEvaluated: 'recorded' | 'solved';
  /**
   * ONE-SIDED: P(crossing an efficacy (upper) boundary at any analysis | H0),
   * futility ignored (non-binding). It is compared with `oneSidedAlpha`, not
   * with a two-sided alpha.
   */
  typeIError: number;
  /** The same probability with the applied futility boundaries treated as binding; null when no futility is applied. */
  typeIErrorIfFutilityBinding: number | null;
  /** Expected final z under the alternative the fixed design was powered for; null without alpha and power. */
  designDrift: number | null;
  /** P(reject H0) at `designDrift`, applied futility followed; null without alpha and power. */
  power: number | null;
  /** E[information fraction at stop], applied futility followed. */
  expectedInformationFraction: { underNull: number; underAlternative: number | null };
  /** `expectedInformationFraction` × plannedSampleSize; null without a valid plannedSampleSize. */
  expectedSampleSize: { underNull: number; underAlternative: number | null } | null;
  perLook: InterimLook[];
}

export interface InterimOcProjection {
  status: InterimOcStatus;
  gaps: string[];
  notes: string[];
  schedule: number[] | null;
  oneSidedAlpha: number | null;
  /** The spending function as recorded (any value, as text), and the engine function solved for it — null when there is none. */
  spending: { recorded: string | null; engine: SpendingFunction | null };
  solvedEfficacyBoundaries: number[] | null;
  discrepancies: Array<{ look: number; recorded: number; solved: number; difference: number }>;
  characteristics: InterimCharacteristics | null;
  basis: string;
}

/** The recorded names the engine has a function for. A Map, so no prototype key ('constructor', 'toString') resolves. */
const ENGINE_SPENDING = new Map<unknown, SpendingFunction>([
  ['obrien_fleming', 'obrien-fleming'],
  ['pocock', 'pocock'],
  ['linear', 'linear'],
]);

/** The interim fields that, recorded without a schedule, make the plan incomplete rather than absent. */
const PLAN_FIELDS = ['spendingFunction', 'efficacyBoundaries', 'futilityBoundaries', 'dmcRole'] as const;

type Plan = Record<string, unknown>;

const isObject = (v: unknown): v is Plan => typeof v === 'object' && v !== null && !Array.isArray(v);
const isFiniteNumber = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v);
const isOpenUnit = (v: unknown): v is number => typeof v === 'number' && v > 0 && v < 1;
const isAbsent = (v: unknown): boolean => v == null || v === '' || (Array.isArray(v) && v.length === 0);
/** A z-value as printed in a gap: three decimals, trailing zeros dropped. */
const z3 = (z: number): string => String(Number(z.toFixed(3)));

function empty(status: InterimOcStatus, gaps: string[], schedule: number[] | null = null): InterimOcProjection {
  return {
    status, gaps, notes: [], schedule, oneSidedAlpha: null, spending: { recorded: null, engine: null },
    solvedEfficacyBoundaries: null, discrepancies: [], characteristics: null, basis: INTERIM_OC_BASIS,
  };
}

/** No interim plan: not applicable, unless the design declares a group-sequential feature. */
function noInterim(design: StudyDesign): InterimOcProjection {
  const features: unknown = design.framework?.adaptiveFeatures;
  return Array.isArray(features) && features.includes('group_sequential')
    ? empty('missing', ['the design declares a group-sequential feature but records no interim schedule'])
    : empty('not_applicable', ['no interim analysis is planned']);
}

/** A schedule that is a list of numbers but cannot be evaluated here, and why; null when it can. */
function scheduleDefect(f: unknown[]): InterimOcProjection | null {
  const numeric = f.every(isFiniteNumber);
  const schedule = numeric ? (f as number[]) : null;
  const valid = numeric && schedule!.every((x, i) => x > 0 && x <= 1 && (i === 0 || x > schedule![i - 1])) && schedule!.at(-1) === 1;
  if (!valid) {
    return empty('partial', [`the information fractions [${f.map(String).join(', ')}] are not a valid schedule: strictly increasing within (0, 1] and ending at 1`], schedule);
  }
  if (f.length === 1) return empty('partial', ['the schedule [1] contains no interim look: a single final analysis is not an interim plan'], schedule);
  if (f.length > MAX_ANALYSES) {
    return empty('partial', [`${f.length} analyses are recorded; the exact computation here runs for at most ${MAX_ANALYSES}: nothing is computed`], schedule);
  }
  return null;
}

/** No plan, or a plan whose schedule cannot be evaluated: the projection that computes nothing, and why. Null when there is a schedule to evaluate. */
function unschedulable(design: StudyDesign, interim: unknown): InterimOcProjection | null {
  if (interim == null) return noInterim(design);
  if (!isObject(interim)) return empty('partial', ['the interim plan is recorded in an unreadable form: nothing can be computed']);
  const f = interim.informationFractions;
  if (isAbsent(f)) {
    return PLAN_FIELDS.some((k) => !isAbsent(interim[k]))
      ? empty('missing', ['an interim plan is recorded but its information fractions are not'])
      : noInterim(design);
  }
  if (!Array.isArray(f)) return empty('partial', ['the information fractions are not recorded as a list of numbers: no schedule can be read']);
  return scheduleDefect(f);
}

/** One-sided alpha for the upper boundary, and the gap when it is missing, invalid, or its sidedness assumed. */
function oneSidedAlphaOf(plan: Plan): { alpha: number | null; gaps: string[] } {
  const a = plan.alpha;
  const unsolvable = 'no boundary can be solved and no type I error target checked';
  if (a == null) return { alpha: null, gaps: [`the significance level (alpha) is not recorded: ${unsolvable}`] };
  if (!isOpenUnit(a)) return { alpha: null, gaps: [`the recorded alpha ${String(a)} is not a probability strictly between 0 and 1: ${unsolvable}`] };
  if (plan.oneSided === true) {
    return a < 0.5 ? { alpha: a, gaps: [] } : { alpha: null, gaps: [`a one-sided alpha of ${a} is not below 0.5: ${unsolvable}`] };
  }
  if (plan.oneSided === false) return { alpha: a / 2, gaps: [] };
  return { alpha: a / 2, gaps: ['sidedness is not recorded: the upper boundary is solved at alpha/2, the stricter two-sided reading'] };
}

/** The engine function for the recorded name — only an own entry of the map — and the gap when there is none. */
function spendingOf(recorded: unknown): { recorded: string | null; engine: SpendingFunction | null; gaps: string[] } {
  if (isAbsent(recorded)) {
    return { recorded: null, engine: null, gaps: ['no alpha-spending function is named, so no boundary can be derived to check the recorded ones against'] };
  }
  const name = String(recorded);
  const engine = ENGINE_SPENDING.get(recorded) ?? null;
  if (engine) return { recorded: name, engine, gaps: [] };
  const gap = recorded === 'lan_demets'
    ? '"lan_demets" names the spending-function family, not a function: record O\'Brien–Fleming-type or Pocock-type so the boundaries can be solved'
    : `spending function "${name}" has no engine here: nothing is solved and the recorded boundaries are not checked against it`;
  return { recorded: name, engine: null, gaps: [gap] };
}

/** Recorded efficacy boundaries, or the gap saying why they cannot be used. */
function recordedEfficacy(raw: unknown, k: number): { efficacy: number[] | null; gaps: string[] } {
  if (isAbsent(raw)) return { efficacy: null, gaps: [] };
  if (!Array.isArray(raw)) return { efficacy: null, gaps: ['the efficacy boundaries are not recorded as a list of z-values: they cannot be evaluated'] };
  if (raw.length !== k) return { efficacy: null, gaps: [`${raw.length} efficacy boundaries are recorded for ${k} analyses: they cannot be evaluated`] };
  const bad = raw.findIndex((z) => !isFiniteNumber(z));
  if (bad >= 0) return { efficacy: null, gaps: [`the efficacy boundary at look ${bad + 1} is not a finite z-value: the recorded boundaries cannot be evaluated`] };
  return { efficacy: raw as number[], gaps: [] };
}

/** One look's futility value as applied (null when none is), and the gap when the recorded one is not applied. */
function futilityAt(v: unknown, efficacy: number, i: number, k: number): { value: number | null; gap: string | null } {
  if (v == null) return { value: null, gap: null };
  if (!isFiniteNumber(v)) return { value: null, gap: `the futility boundary at look ${i + 1} is not a finite z-value: it is left out of the computation` };
  if (i === k - 1) {
    // The engine concludes at the final analysis on the efficacy boundary alone.
    return Math.abs(v - efficacy) <= BOUNDARY_TOLERANCE
      ? { value: null, gap: null }
      : { value: null, gap: `the futility boundary at the final analysis (${z3(v)}) differs from its efficacy boundary (${z3(efficacy)}): the efficacy boundary alone decides there, so it is not applied` };
  }
  if (v >= efficacy) {
    return { value: null, gap: `the futility boundary at look ${i + 1} (${z3(v)}) is not below its efficacy boundary (${z3(efficacy)}): it is left out of the computation` };
  }
  return { value: v, gap: null };
}

/** The futility boundaries to apply, validated per look against the evaluated efficacy boundaries; undefined when none is applied. */
function appliedFutility(raw: unknown, efficacy: number[] | null, k: number): { futility: (number | null)[] | undefined; gaps: string[] } {
  if (isAbsent(raw)) return { futility: undefined, gaps: [] };
  if (!Array.isArray(raw)) return { futility: undefined, gaps: ['the futility boundaries are not recorded as a list: futility is left out of the computation'] };
  if (raw.length !== k) return { futility: undefined, gaps: [`${raw.length} futility boundaries are recorded for ${k} analyses: futility is left out of the computation`] };
  if (!efficacy) return { futility: undefined, gaps: [] };
  const gaps: string[] = [];
  const applied = raw.map((v: unknown, i) => {
    const look = futilityAt(v, efficacy[i], i, k);
    if (look.gap) gaps.push(look.gap);
    return look.value;
  });
  return { futility: applied.some((v) => v !== null) ? applied : undefined, gaps };
}

/** The recorded target power, or the gap. */
function powerOf(plan: Plan): { power: number | null; gaps: string[] } {
  const p = plan.power;
  if (p == null) return { power: null, gaps: ['the target power is not recorded: no power and no expected sample size under the alternative are computed'] };
  if (!isOpenUnit(p)) return { power: null, gaps: [`the recorded power ${String(p)} is not a probability strictly between 0 and 1: no power is computed`] };
  return { power: p, gaps: [] };
}

/** The recorded planned (maximum) sample size, or the gap. */
function sampleSizeOf(plan: Plan): { n: number | null; gaps: string[] } {
  const n = plan.plannedSampleSize;
  if (n == null) return { n: null, gaps: ['the planned sample size is not recorded: no expected sample size is computed'] };
  if (!(typeof n === 'number' && Number.isInteger(n) && n >= 1)) {
    return { n: null, gaps: [`the planned sample size ${String(n)} is not a whole number of at least 1: no expected sample size is computed`] };
  }
  return { n, gaps: [] };
}

/** The drift a fixed design with this one-sided alpha and power is sized for: z(1−α) + z(power). */
function driftOf(alpha: number | null, power: number | null): { drift: number | null; gaps: string[] } {
  if (alpha === null || power === null) return { drift: null, gaps: [] };
  const drift = normalQuantile(1 - alpha) + normalQuantile(power);
  return Number.isFinite(drift)
    ? { drift, gaps: [] }
    : { drift: null, gaps: [`the design alternative cannot be formed from one-sided alpha ${alpha} and power ${power}: no power is computed`] };
}

/** Every look where the recorded boundary departs from the solved one by more than the tolerance. */
function discrepanciesOf(recorded: number[] | null, solved: number[] | null): InterimOcProjection['discrepancies'] {
  if (!recorded || !solved) return [];
  return recorded.flatMap((z, i) =>
    Math.abs(z - solved[i]) > BOUNDARY_TOLERANCE ? [{ look: i + 1, recorded: z, solved: solved[i], difference: z - solved[i] }] : []);
}

interface Evaluation {
  schedule: number[];
  efficacy: number[];
  futility: (number | null)[] | undefined;
  which: 'recorded' | 'solved';
  drift: number | null;
  n: number | null;
}

function characteristicsOf(ev: Evaluation): InterimCharacteristics {
  const efficacyOnly = { informationFractions: ev.schedule, efficacyBoundaries: ev.efficacy };
  const planned = { ...efficacyOnly, futilityBoundaries: ev.futility };
  // Non-binding type I error: the engine's conservative computation, efficacy boundaries only.
  const h0 = computeOperatingCharacteristic(efficacyOnly, 0);
  const h0Planned: OperatingCharacteristic = ev.futility ? computeOperatingCharacteristic(planned, 0) : h0;
  const h1 = ev.drift === null ? null : computeOperatingCharacteristic(planned, ev.drift);
  const n = ev.n;
  return {
    boundariesEvaluated: ev.which,
    typeIError: h0.rejectProbability,
    typeIErrorIfFutilityBinding: ev.futility ? h0Planned.rejectProbability : null,
    designDrift: ev.drift,
    power: h1 ? h1.rejectProbability : null,
    expectedInformationFraction: { underNull: h0Planned.expectedInformationFraction, underAlternative: h1 ? h1.expectedInformationFraction : null },
    expectedSampleSize: n === null
      ? null
      : { underNull: expectedSampleSize(h0Planned.expectedInformationFraction, n), underAlternative: h1 ? expectedSampleSize(h1.expectedInformationFraction, n) : null },
    perLook: h0.perLook.map((l, i) => ({
      look: l.look,
      informationFraction: l.informationFraction,
      efficacyBoundary: l.efficacyBoundary,
      futilityBoundary: ev.futility?.[i] ?? null,
      efficacyStopUnderNull: l.efficacyStopProbability,
      efficacyStopUnderAlternative: h1 ? h1.perLook[i].efficacyStopProbability : null,
    })),
  };
}

/** The gaps that depend on what could be evaluated. */
function outcomeGaps(c: InterimCharacteristics | null, discrepancyCount: number, alpha: number | null): string[] {
  const gaps: string[] = [];
  if (!c) gaps.push('neither usable recorded boundaries nor a solvable spending function: no operating characteristic can be computed');
  if (discrepancyCount) {
    gaps.push(`${discrepancyCount} recorded efficacy boundar${discrepancyCount === 1 ? 'y differs' : 'ies differ'} from the named spending function's by more than ${BOUNDARY_TOLERANCE}`);
  }
  if (c && alpha !== null && c.typeIError > alpha + TYPE_I_ERROR_TOLERANCE) {
    gaps.push(`the evaluated boundaries give a one-sided type I error of ${c.typeIError.toFixed(4)}, above the design's one-sided alpha ${alpha}`);
  }
  return gaps;
}

/** What the computed figures assume, stated beside them. */
function notesOf(c: InterimCharacteristics | null, alpha: number | null, power: number | null, n: number | null): string[] {
  if (!c) return [];
  const notes = [
    'the type I error is one-sided: the probability under H0 of crossing an efficacy (upper) boundary at any analysis' +
      (alpha === null ? '' : `, compared with the one-sided alpha ${alpha}`),
  ];
  if (c.typeIErrorIfFutilityBinding !== null) {
    notes.push(
      'futility boundaries are applied to power, expected information and expected sample size (they assume futility stopping is followed); ' +
      'the type I error ignores them — the non-binding reading, which holds whether or not futility is followed (FDA 2019) — ' +
      'and the type I error if futility were binding is reported separately',
    );
  }
  if (c.designDrift !== null) {
    notes.push(
      `power is computed at drift ${c.designDrift.toFixed(4)} — the alternative a fixed design with one-sided alpha ${alpha} and power ${power} is sized for — ` +
      'assuming the maximum sample size equals that fixed design\'s, with no group-sequential inflation; ' +
      'if the planned sample size already includes an inflation factor, the power shown understates the design\'s',
    );
  }
  if (c.expectedSampleSize !== null) {
    notes.push(`expected sample size is the expected information fraction times plannedSampleSize (${n}), read as the maximum sample size`);
  }
  return notes;
}

/** A valid schedule, evaluated: solve, compare, validate futility, compute. */
function evaluateInterim(plan: Plan, interim: Plan, schedule: number[]): InterimOcProjection {
  const k = schedule.length;
  const { alpha, gaps: alphaGaps } = oneSidedAlphaOf(plan);
  const spending = spendingOf(interim.spendingFunction);
  const rec = recordedEfficacy(interim.efficacyBoundaries, k);
  const solved = alpha !== null && spending.engine !== null ? solveSpendingBoundaries(schedule, alpha, spending.engine).efficacyBoundaries : null;
  const discrepancies = discrepanciesOf(rec.efficacy, solved);
  const efficacy = rec.efficacy ?? solved;
  const fut = appliedFutility(interim.futilityBoundaries, efficacy, k);
  const power = powerOf(plan);
  const drift = driftOf(alpha, power.power);
  const size = sampleSizeOf(plan);
  const characteristics = efficacy
    ? characteristicsOf({ schedule, efficacy, futility: fut.futility, which: rec.efficacy ? 'recorded' : 'solved', drift: drift.drift, n: size.n })
    : null;
  const gaps = [
    ...alphaGaps, ...spending.gaps, ...rec.gaps, ...fut.gaps, ...power.gaps, ...drift.gaps, ...size.gaps,
    ...outcomeGaps(characteristics, discrepancies.length, alpha),
  ];
  return {
    status: gaps.length ? 'partial' : 'rendered',
    gaps,
    notes: notesOf(characteristics, alpha, power.power, size.n),
    schedule,
    oneSidedAlpha: alpha,
    spending: { recorded: spending.recorded, engine: spending.engine },
    solvedEfficacyBoundaries: solved,
    discrepancies,
    characteristics,
    basis: INTERIM_OC_BASIS,
  };
}

/** Project the interim plan's operating characteristics. Every figure is the exact engine's. */
export function projectInterimOperatingCharacteristics(design: StudyDesign): InterimOcProjection {
  const plan: Plan = isObject(design.statisticalPlan) ? design.statisticalPlan : {};
  const early = unschedulable(design, plan.interim);
  if (early) return early;
  const interim = plan.interim as Plan;
  return evaluateInterim(plan, interim, interim.informationFractions as number[]);
}
