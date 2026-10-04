/**
 * Dose-escalation projection — the BOIN rules a dose-finding study follows,
 * computed from the design object.
 *
 * ## The industry need
 * FDA's Project Optimus and its final guidance "Optimizing the Dosage of Human
 * Prescription Drugs and Biological Products for the Treatment of Oncologic
 * Diseases" (2024) made dose optimisation a live expectation for oncology
 * development, and every first-in-human protocol states its escalation rules:
 * the target toxicity, the dose levels, the cohort size, the escalation and
 * de-escalation boundaries, the elimination rule and how the MTD is chosen.
 * BOIN (Liu & Yuan 2015) is the model-assisted design most sponsors now use.
 *
 * This repository has had a correct BOIN engine (`stats/dose-finding-boin.ts`)
 * reachable only as a free-standing calculator (`/api/biostat-design-stats`,
 * AnA's `design_dose_finding`). The design spine could not record an
 * escalation design, so a protocol's escalation rules were prose nobody
 * checked. This module is the spine's view of it: the boundaries and φ1/φ2 are
 * the engine's `boinBoundaries`, the escalate/de-escalate columns are the
 * engine's `boinDecisionTable`, and every elimination cell is the engine's
 * `boinDecision` — nothing here re-derives a BOIN formula (zero duplication).
 *
 * ## The honesty contract
 *  - Pure and total: no model, no clock, no RNG, no DB, and no throw — an
 *    invalid or malformed parameter is a gap, not an exception.
 *  - Bounded: the decision table is computed to n = {@link MAX_TABLE_N} at one
 *    dose; a per-dose limit beyond it is a gap, never a long computation.
 *  - Applicability is read, not assumed: a design is a dose-escalation study
 *    when its phase is FIH / 1 / 1b or it defines DLTs. Such a design with no
 *    escalation rules is `missing` with a gap; any other design without them
 *    is `not_applicable`, with the reason.
 *  - A default is labelled a default: when φ1/φ2 or the elimination threshold
 *    are not in the design, the engine's own defaults are what compute, and the
 *    parameter's `source` says `engine default`; the elimination rule's fixed
 *    minimum n and prior are shown the same way, read from the engine's
 *    exported `BOIN_DEFAULTS` (never restated here). A value that could not be
 *    computed is null with the reason as its source — never a number derived
 *    from an invalid input.
 *  - Escalation rules that count DLTs are flagged when the design does not
 *    define a DLT. A table is never `rendered` empty.
 *
 * @module server/services/study-design/dose-escalation
 */

import { BOIN_DEFAULTS, boinBoundaries, boinDecision, boinDecisionTable } from '../stats/dose-finding-boin';
import type { DoseEscalationDesign, StudyDesign } from './study-design-types';

export const DOSE_ESCALATION_BASIS =
  'Liu S, Yuan Y. Bayesian optimal interval designs for phase I clinical trials. J R Stat Soc C 2015;64:507–523 (BOIN); ' +
  'Yuan Y, Hess KR, Hilsenbeck SG, Gilbert MR. Bayesian optimal interval design: a simple and well-performing design for phase I oncology trials. Clin Cancer Res 2016;22:4291–4301; ' +
  'FDA guidance: Optimizing the Dosage of Human Prescription Drugs and Biological Products for the Treatment of Oncologic Diseases (2024)';

/**
 * The engine's defaults, re-exported under the name this module has always
 * exported: the projection prints `eliminationThreshold`, `minEliminationN` and
 * `prior` from the engine's own constant, the one `boinDecision` applies — not a
 * copy. The suite pins it to the engine's object and behaviour.
 */
export { BOIN_DEFAULTS };

/** The largest per-dose n the decision table is computed to. */
export const MAX_TABLE_N = 200;

export type DoseEscalationStatus = 'rendered' | 'partial' | 'missing' | 'not_applicable';
export type ParameterSource =
  | 'design'
  | 'engine default'
  | 'not computed: target invalid'
  | 'not computed: recorded value invalid'
  | 'not computed: neighbourhood invalid';

export interface SourcedValue {
  value: number | null;
  source: ParameterSource;
}

export interface DoseEscalationRow {
  /** Patients treated at the current dose. */
  n: number;
  /** Escalate when the DLT count is at most this. */
  escalateIfAtMost: number;
  /** De-escalate when the DLT count is at least this. */
  deescalateIfAtLeast: number;
  /** Eliminate the dose and all higher ones at this DLT count or more; null when no count does at this n. */
  eliminateIfAtLeast: number | null;
  /** Why `eliminateIfAtLeast` is null; null when a count eliminates. */
  eliminationNote: string | null;
}

export interface DoseEscalationParameters {
  /** As recorded when it is a number (a gap says when it is not a rate); null otherwise. */
  targetToxicity: number | null;
  phi1: SourcedValue;
  phi2: SourcedValue;
  eliminationThreshold: SourcedValue;
  /** The engine eliminates no dose below this n; the design cannot set it. */
  minEliminationN: { value: number; source: 'engine default' };
  /** The prior of the elimination rule's posterior; the design cannot set it. */
  prior: { value: string; source: 'engine default' };
  cohortSize: number | null;
  maxSampleSize: number | null;
  stopWhenAtDoseN: number | null;
  doseLevels: Array<{ label: string | null; dose: string | null }>;
  startingDose: { index: number; label: string } | null;
}

export interface DoseEscalationProjection {
  status: DoseEscalationStatus;
  applicability: { applicable: boolean; reasons: string[] };
  gaps: string[];
  method: 'boin' | null;
  parameters: DoseEscalationParameters | null;
  boundaries: { lambdaE: number; lambdaD: number } | null;
  decisionTable: DoseEscalationRow[];
  /** The MTD-selection rule the engine implements, stated; null when nothing was computed. */
  mtdSelection: string | null;
  /** BOIN's trial-level safety stop, stated; null when nothing was computed. */
  safetyStopping: string | null;
  basis: string;
}

/** What `selectMtd` in stats/dose-finding-boin.ts does, in words — each tie clause is pinned to it by the suite. */
const MTD_RULE =
  'At the end of the trial, DLT rates are smoothed by isotonic (pool-adjacent-violators) regression, and the MTD is the tried dose ' +
  'whose smoothed rate is closest to the target, among the doses below the lowest eliminated one (eliminating a dose eliminates ' +
  'every higher dose); on a tie a dose below the target is preferred over one above it, ' +
  'between two below the target the higher dose is chosen, and between two above it the lower.';

/** The BOIN method's safety stop (Liu & Yuan 2015; Yuan et al. 2016). The engine computes decisions, not this rule; it is stated. */
const SAFETY_STOP_RULE =
  'If the lowest dose is eliminated, the trial is stopped for safety and no MTD is selected (the BOIN method\'s rule; ' +
  'the design object does not record it separately).';

const ESCALATION_PHASES = new Set<unknown>(['FIH', '1', '1b']);

const isText = (v: unknown): v is string => typeof v === 'string' && v.trim().length > 0;
const isPositiveInt = (v: unknown): v is number => typeof v === 'number' && Number.isInteger(v) && v >= 1;
const isOpenUnit = (v: unknown): v is number => typeof v === 'number' && v > 0 && v < 1;
const isObject = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v);

function applicabilityOf(design: StudyDesign): { applicable: boolean; reasons: string[] } {
  const reasons: string[] = [];
  if (ESCALATION_PHASES.has(design.phase)) reasons.push(`phase ${design.phase} is a dose-escalation phase`);
  if (isText(design.safety?.dltDefinition)) reasons.push('the design defines dose-limiting toxicities');
  return { applicable: reasons.length > 0, reasons };
}

/** Target, cohort and sample-size defects. */
function sizeGaps(e: DoseEscalationDesign): string[] {
  const gaps: string[] = [];
  if (!isOpenUnit(e.targetToxicity)) gaps.push('target toxicity must be a rate strictly between 0 and 1: no boundary can be computed');
  if (!isPositiveInt(e.cohortSize)) gaps.push('cohort size must be a whole number of at least 1');
  if (!isPositiveInt(e.maxSampleSize)) gaps.push('maximum sample size must be a whole number of at least 1');
  else if (isPositiveInt(e.cohortSize) && e.maxSampleSize < e.cohortSize) gaps.push('maximum sample size is smaller than one cohort');
  return gaps;
}

/** Each dose level must be an entry with a text label, and a dose (when given) as text. */
function levelGaps(levels: unknown): string[] {
  if (!Array.isArray(levels)) return [];
  return levels.flatMap((l: unknown, i) => {
    const gaps: string[] = [];
    if (!isObject(l) || !isText(l.label)) gaps.push(`dose level ${i + 1} has no text label`);
    if (isObject(l) && l.dose != null && typeof l.dose !== 'string') gaps.push(`dose level ${i + 1} records its dose as something other than text`);
    return gaps;
  });
}

/** Stopping, elimination and neighbourhood defects. */
function ruleGaps(e: DoseEscalationDesign): string[] {
  const gaps: string[] = [];
  const stop: unknown = e.stopWhenAtDoseN;
  if (stop != null && !isPositiveInt(stop)) gaps.push('the per-dose stopping count must be a whole number of at least 1');
  else if (isPositiveInt(stop) && isPositiveInt(e.cohortSize) && stop < e.cohortSize) {
    gaps.push('the per-dose stopping count is smaller than one cohort: no cohort completes at a dose');
  }
  if (e.eliminationThreshold != null && !isOpenUnit(e.eliminationThreshold)) {
    gaps.push('the elimination threshold must be a probability strictly between 0 and 1');
  }
  if (e.phi1 != null && !isOpenUnit(e.phi1)) gaps.push('the recorded φ1 must be a rate strictly between 0 and 1');
  if (e.phi2 != null && !isOpenUnit(e.phi2)) gaps.push('the recorded φ2 must be a rate strictly between 0 and 1');
  return gaps;
}

/** Dose-level and starting-dose defects. */
function doseGaps(e: DoseEscalationDesign): string[] {
  const levels = Array.isArray(e.doseLevels) ? e.doseLevels.length : 0;
  const gaps: string[] = levels < 2 ? ['at least two dose levels are needed to escalate'] : [];
  gaps.push(...levelGaps(e.doseLevels));
  const start: unknown = e.startingDoseIndex;
  if (start != null && !(typeof start === 'number' && Number.isInteger(start) && start >= 0 && start < levels)) {
    gaps.push('the starting dose does not name one of the recorded dose levels');
  }
  return gaps;
}

/** Every defect in the recorded parameters, as a sentence. Empty when the engine can run. */
function parameterGaps(e: DoseEscalationDesign): string[] {
  return [...sizeGaps(e), ...doseGaps(e), ...ruleGaps(e)];
}

/** A recorded rate the engine may use, or undefined (absent or invalid — an invalid one is a gap). */
const usable = (v: unknown): number | undefined => (isOpenUnit(v) ? v : undefined);

interface Neighbourhood {
  phi1: SourcedValue;
  phi2: SourcedValue;
  boundaries: { lambdaE: number; lambdaD: number } | null;
}

/** φ1, φ2 and λe/λd, from the engine: a recorded value is the design's, an absent one is what the engine defaulted to. */
function neighbourhoodOf(e: DoseEscalationDesign): Neighbourhood {
  let computed: ReturnType<typeof boinBoundaries> | null = null;
  let failure: ParameterSource = 'not computed: target invalid';
  if (isOpenUnit(e.targetToxicity)) {
    try {
      computed = boinBoundaries(e.targetToxicity, usable(e.phi1), usable(e.phi2));
    } catch {
      // φ1 < φ < φ2 < 1 does not hold for the recorded or default neighbourhood.
      failure = 'not computed: neighbourhood invalid';
    }
  }
  const one = (recorded: unknown, fromEngine: number | undefined): SourcedValue => {
    if (recorded != null) return isOpenUnit(recorded) ? { value: recorded, source: 'design' } : { value: null, source: 'not computed: recorded value invalid' };
    return fromEngine !== undefined ? { value: fromEngine, source: 'engine default' } : { value: null, source: failure };
  };
  return {
    phi1: one(e.phi1, computed?.phi1),
    phi2: one(e.phi2, computed?.phi2),
    boundaries: computed ? { lambdaE: computed.lambdaE, lambdaD: computed.lambdaD } : null,
  };
}

function eliminationThresholdOf(e: DoseEscalationDesign): SourcedValue {
  if (e.eliminationThreshold == null) return { value: BOIN_DEFAULTS.eliminationThreshold, source: 'engine default' };
  return isOpenUnit(e.eliminationThreshold)
    ? { value: e.eliminationThreshold, source: 'design' }
    : { value: null, source: 'not computed: recorded value invalid' };
}

function levelsOf(levels: unknown): DoseEscalationParameters['doseLevels'] {
  return (Array.isArray(levels) ? levels : []).map((l: unknown) => ({
    label: isObject(l) && isText(l.label) ? l.label : null,
    dose: isObject(l) && typeof l.dose === 'string' ? l.dose : null,
  }));
}

const numberOrNull = (v: unknown): number | null => (typeof v === 'number' ? v : null);

function parametersOf(e: DoseEscalationDesign, n: Neighbourhood): DoseEscalationParameters {
  const levels = levelsOf(e.doseLevels);
  const start: unknown = e.startingDoseIndex;
  const startLabel = typeof start === 'number' ? levels[start]?.label : null;
  return {
    targetToxicity: numberOrNull(e.targetToxicity),
    phi1: n.phi1,
    phi2: n.phi2,
    eliminationThreshold: eliminationThresholdOf(e),
    minEliminationN: { value: BOIN_DEFAULTS.minEliminationN, source: 'engine default' },
    prior: { value: BOIN_DEFAULTS.prior, source: 'engine default' },
    cohortSize: numberOrNull(e.cohortSize),
    maxSampleSize: numberOrNull(e.maxSampleSize),
    stopWhenAtDoseN: numberOrNull(e.stopWhenAtDoseN),
    doseLevels: levels,
    startingDose: typeof start === 'number' && typeof startLabel === 'string' ? { index: start, label: startLabel } : null,
  };
}

/** The engine inputs a validated design passes: recorded values, or undefined so the engine's own defaults apply. */
interface EngineArgs {
  target: number;
  phi1: number | undefined;
  phi2: number | undefined;
  eliminationThreshold: number | undefined;
}

/**
 * The smallest DLT count at which the engine eliminates the dose at n, and why
 * there is none. The engine's posterior P(p > φ) rises with the DLT count, so
 * its elimination decision is monotone in x: bisection, O(log n) engine calls.
 */
function eliminationAt(n: number, args: EngineArgs): { at: number | null; note: string | null } {
  const eliminated = (x: number): boolean => boinDecision({ nPatients: n, nDlt: x, ...args }).eliminated;
  if (!eliminated(n)) {
    return {
      at: null,
      note: n < BOIN_DEFAULTS.minEliminationN
        ? `the engine eliminates a dose only once at least ${BOIN_DEFAULTS.minEliminationN} patients have been treated at it`
        : `even ${n} DLTs in ${n} patients do not take the posterior probability of exceeding the target above the elimination threshold`,
    };
  }
  let lo = 0;
  let hi = n;
  while (lo < hi) {
    const mid = Math.floor((lo + hi) / 2);
    if (eliminated(mid)) hi = mid;
    else lo = mid + 1;
  }
  return { at: lo, note: null };
}

/** One row per completed cohort at a dose, up to the per-dose cap, the maximum sample size and {@link MAX_TABLE_N}. */
function decisionTableOf(e: DoseEscalationDesign, args: EngineArgs): { rows: DoseEscalationRow[]; gaps: string[] } {
  const cohort = e.cohortSize;
  const perDose = Math.min(e.maxSampleSize, e.stopWhenAtDoseN ?? e.maxSampleSize);
  const gaps: string[] = [];
  if (perDose > MAX_TABLE_N) {
    gaps.push(`the per-dose limit of ${perDose} patients is beyond the ${MAX_TABLE_N} this table is computed to: rows above n = ${MAX_TABLE_N} are not shown`);
  }
  const sizes: number[] = [];
  for (let n = cohort; n <= Math.min(perDose, MAX_TABLE_N); n += cohort) sizes.push(n);
  if (sizes.length === 0) gaps.push('no cohort completes within the rows computed: the decision table is empty');
  const rows = boinDecisionTable(args.target, sizes, args.phi1, args.phi2).map((r) => {
    const elimination = eliminationAt(r.n, args);
    return { ...r, eliminateIfAtLeast: elimination.at, eliminationNote: elimination.note };
  });
  return { rows, gaps };
}

function empty(status: DoseEscalationStatus, applicability: DoseEscalationProjection['applicability'], gaps: string[]): DoseEscalationProjection {
  return {
    status, applicability, gaps, method: null, parameters: null, boundaries: null, decisionTable: [],
    mtdSelection: null, safetyStopping: null, basis: DOSE_ESCALATION_BASIS,
  };
}

/** The design-level gaps of a computed projection. */
function designGaps(design: StudyDesign, parameters: DoseEscalationParameters): string[] {
  const gaps: string[] = [];
  if (!isText(design.safety?.dltDefinition)) gaps.push('the escalation counts DLTs, but the design does not define a dose-limiting toxicity');
  if (parameters.startingDose === null) gaps.push('the starting dose is not recorded');
  return gaps;
}

/**
 * Project the design's dose-escalation rules. Every number is the BOIN
 * engine's; every default is labelled; every defect is a gap.
 */
export function projectDoseEscalation(design: StudyDesign): DoseEscalationProjection {
  const applicability = applicabilityOf(design);
  const e: unknown = design.safety?.doseEscalation;
  if (e == null) {
    return applicability.applicable
      ? empty('missing', applicability, ['the design states no dose-escalation rules: target toxicity, dose levels, cohort size and boundaries cannot be projected'])
      : empty('not_applicable', { applicable: false, reasons: ['not a dose-escalation phase, and the design defines no dose-limiting toxicities'] }, []);
  }
  if (!isObject(e) || e.method !== 'boin') {
    const method = isObject(e) ? String(e.method) : 'unreadable';
    return empty('partial', applicability, [`escalation method "${method}" has no engine here; only BOIN is computed`]);
  }
  const rules = e as unknown as DoseEscalationDesign;
  const neighbourhood = neighbourhoodOf(rules);
  const parameters = parametersOf(rules, neighbourhood);
  const gaps = parameterGaps(rules);
  if (gaps.length === 0 && neighbourhood.boundaries === null) {
    gaps.push('the BOIN neighbourhood is invalid: φ1 < target < φ2 < 1 does not hold, so no boundary can be computed');
  }
  if (gaps.length > 0 || neighbourhood.boundaries === null) return { ...empty('partial', applicability, gaps), method: 'boin', parameters };
  const args: EngineArgs = {
    target: rules.targetToxicity, phi1: usable(rules.phi1), phi2: usable(rules.phi2), eliminationThreshold: usable(rules.eliminationThreshold),
  };
  const table = decisionTableOf(rules, args);
  const all = [...table.gaps, ...designGaps(design, parameters)];
  return {
    status: all.length ? 'partial' : 'rendered',
    applicability,
    gaps: all,
    method: 'boin',
    parameters,
    boundaries: neighbourhood.boundaries,
    decisionTable: table.rows,
    mtdSelection: MTD_RULE,
    safetyStopping: SAFETY_STOP_RULE,
    basis: DOSE_ESCALATION_BASIS,
  };
}
