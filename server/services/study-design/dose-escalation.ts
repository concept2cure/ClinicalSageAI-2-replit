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
 * checked. This module is the spine's view of it: every boundary and every
 * decision-table cell comes from the engine's own `boinBoundaries` and
 * `boinDecision` — nothing here re-derives a BOIN formula (zero duplication).
 *
 * ## The honesty contract
 *  - Pure and total: no model, no clock, no RNG, no DB, and no throw — an
 *    invalid parameter is a gap, not an exception.
 *  - Applicability is read, not assumed: a design is a dose-escalation study
 *    when its phase is FIH / 1 / 1b or it defines DLTs. Such a design with no
 *    escalation rules is `missing` with a gap; any other design without them
 *    is `not_applicable`, with the reason.
 *  - A default is labelled a default: when φ1/φ2 or the elimination threshold
 *    are not in the design, the engine's defaults are used and the parameter's
 *    `source` says `engine default` — so a reader never mistakes an engine
 *    default for a sponsor decision.
 *  - Escalation rules that count DLTs are flagged when the design does not
 *    define a DLT.
 *
 * @module server/services/study-design/dose-escalation
 */

import { boinBoundaries, boinDecision } from '../stats/dose-finding-boin';
import type { DoseEscalationDesign, StudyDesign } from './study-design-types';

export const DOSE_ESCALATION_BASIS =
  'Liu S, Yuan Y. Bayesian optimal interval designs for phase I clinical trials. J R Stat Soc C 2015;64:507–523 (BOIN); ' +
  'FDA guidance: Optimizing the Dosage of Human Prescription Drugs and Biological Products for the Treatment of Oncologic Diseases (2024)';

/** The engine's defaults, named so the projection can say where a value came from. */
export const BOIN_DEFAULTS = { phi1Factor: 0.6, phi2Factor: 1.4, eliminationThreshold: 0.95, minEliminationN: 3 } as const;

export type DoseEscalationStatus = 'rendered' | 'partial' | 'missing' | 'not_applicable';
export type ParameterSource = 'design' | 'engine default';

export interface DoseEscalationRow {
  /** Patients treated at the current dose. */
  n: number;
  /** Escalate when the DLT count is at most this. */
  escalateIfAtMost: number;
  /** De-escalate when the DLT count is at least this. */
  deescalateIfAtLeast: number;
  /** Eliminate the dose and all higher ones at this DLT count or more; null when no count does at this n. */
  eliminateIfAtLeast: number | null;
}

export interface DoseEscalationParameters {
  targetToxicity: number;
  phi1: { value: number; source: ParameterSource };
  phi2: { value: number; source: ParameterSource };
  eliminationThreshold: { value: number; source: ParameterSource };
  cohortSize: number;
  maxSampleSize: number;
  stopWhenAtDoseN: number | null;
  doseLevels: Array<{ label: string; dose: string | null }>;
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
  basis: string;
}

/** What `selectMtd` in stats/dose-finding-boin.ts does, in words — kept in step with that function. */
const MTD_RULE =
  'At the end of the trial, DLT rates are smoothed by isotonic (pool-adjacent-violators) regression, and the MTD is the tried, ' +
  'non-eliminated dose whose smoothed rate is closest to the target; on a tie a dose below the target is preferred over one above it, ' +
  'between two below the target the higher dose is chosen, and between two above it the lower.';

const ESCALATION_PHASES = new Set<StudyDesign['phase']>(['FIH', '1', '1b']);

function applicabilityOf(design: StudyDesign): { applicable: boolean; reasons: string[] } {
  const reasons: string[] = [];
  if (ESCALATION_PHASES.has(design.phase)) reasons.push(`phase ${design.phase} is a dose-escalation phase`);
  if (design.safety?.dltDefinition?.trim()) reasons.push('the design defines dose-limiting toxicities');
  return { applicable: reasons.length > 0, reasons };
}

const isPositiveInt = (v: unknown): v is number => typeof v === 'number' && Number.isInteger(v) && v >= 1;

const isOpenUnit = (v: unknown): boolean => typeof v === 'number' && v > 0 && v < 1;

/** Target, cohort and sample-size defects. */
function sizeGaps(e: DoseEscalationDesign): string[] {
  const gaps: string[] = [];
  if (!isOpenUnit(e.targetToxicity)) gaps.push('target toxicity must be a rate strictly between 0 and 1: no boundary can be computed');
  if (!isPositiveInt(e.cohortSize)) gaps.push('cohort size must be a whole number of at least 1');
  if (!isPositiveInt(e.maxSampleSize)) gaps.push('maximum sample size must be a whole number of at least 1');
  else if (isPositiveInt(e.cohortSize) && e.maxSampleSize < e.cohortSize) gaps.push('maximum sample size is smaller than one cohort');
  return gaps;
}

/** Dose-level, stopping and elimination defects. */
function ruleGaps(e: DoseEscalationDesign): string[] {
  const gaps: string[] = [];
  const levels = Array.isArray(e.doseLevels) ? e.doseLevels.length : 0;
  if (levels < 2) gaps.push('at least two dose levels are needed to escalate');
  if (e.stopWhenAtDoseN !== undefined && !isPositiveInt(e.stopWhenAtDoseN)) gaps.push('the per-dose stopping count must be a whole number of at least 1');
  if (e.eliminationThreshold !== undefined && !isOpenUnit(e.eliminationThreshold)) {
    gaps.push('the elimination threshold must be a probability strictly between 0 and 1');
  }
  const start = e.startingDoseIndex;
  if (start !== undefined && !(Number.isInteger(start) && start >= 0 && start < levels)) {
    gaps.push('the starting dose does not name one of the recorded dose levels');
  }
  return gaps;
}

/** Every defect in the recorded parameters, as a sentence. Empty when the engine can run. */
function parameterGaps(e: DoseEscalationDesign): string[] {
  return [...sizeGaps(e), ...ruleGaps(e)];
}

function parametersOf(e: DoseEscalationDesign): DoseEscalationParameters {
  const levels = (Array.isArray(e.doseLevels) ? e.doseLevels : []).map((l) => ({ label: String(l.label), dose: l.dose ?? null }));
  const start = e.startingDoseIndex;
  return {
    targetToxicity: e.targetToxicity,
    phi1: e.phi1 !== undefined ? { value: e.phi1, source: 'design' } : { value: BOIN_DEFAULTS.phi1Factor * e.targetToxicity, source: 'engine default' },
    phi2: e.phi2 !== undefined ? { value: e.phi2, source: 'design' } : { value: BOIN_DEFAULTS.phi2Factor * e.targetToxicity, source: 'engine default' },
    eliminationThreshold: e.eliminationThreshold !== undefined
      ? { value: e.eliminationThreshold, source: 'design' }
      : { value: BOIN_DEFAULTS.eliminationThreshold, source: 'engine default' },
    cohortSize: e.cohortSize,
    maxSampleSize: e.maxSampleSize,
    stopWhenAtDoseN: e.stopWhenAtDoseN ?? null,
    doseLevels: levels,
    startingDose: start !== undefined && levels[start] ? { index: start, label: levels[start].label } : null,
  };
}

/** The smallest DLT count at which the engine eliminates the dose, or null. */
function eliminationAt(n: number, p: DoseEscalationParameters): number | null {
  if (n < BOIN_DEFAULTS.minEliminationN) return null;
  for (let x = 0; x <= n; x += 1) {
    const d = boinDecision({
      nPatients: n,
      nDlt: x,
      target: p.targetToxicity,
      phi1: p.phi1.value,
      phi2: p.phi2.value,
      eliminationThreshold: p.eliminationThreshold.value,
    });
    if (d.eliminated) return x;
  }
  return null;
}

/** One row per completed cohort at a dose, up to the per-dose cap or the maximum sample size. */
function decisionTable(p: DoseEscalationParameters, lambdaE: number, lambdaD: number): DoseEscalationRow[] {
  const cap = Math.min(p.maxSampleSize, p.stopWhenAtDoseN ?? p.maxSampleSize);
  const rows: DoseEscalationRow[] = [];
  for (let n = p.cohortSize; n <= cap; n += p.cohortSize) {
    rows.push({
      n,
      escalateIfAtMost: Math.floor(lambdaE * n),
      deescalateIfAtLeast: Math.ceil(lambdaD * n),
      eliminateIfAtLeast: eliminationAt(n, p),
    });
  }
  return rows;
}

function empty(status: DoseEscalationStatus, applicability: DoseEscalationProjection['applicability'], gaps: string[]): DoseEscalationProjection {
  return { status, applicability, gaps, method: null, parameters: null, boundaries: null, decisionTable: [], mtdSelection: null, basis: DOSE_ESCALATION_BASIS };
}

/**
 * Project the design's dose-escalation rules. Every number is the BOIN
 * engine's; every default is labelled; every defect is a gap.
 */
export function projectDoseEscalation(design: StudyDesign): DoseEscalationProjection {
  const applicability = applicabilityOf(design);
  const e = design.safety?.doseEscalation;
  if (!e) {
    return applicability.applicable
      ? empty('missing', applicability, ['the design states no dose-escalation rules: target toxicity, dose levels, cohort size and boundaries cannot be projected'])
      : empty('not_applicable', { applicable: false, reasons: ['not a dose-escalation phase, and the design defines no dose-limiting toxicities'] }, []);
  }
  const gaps = parameterGaps(e);
  if (e.method !== 'boin') gaps.unshift(`escalation method "${String(e.method)}" has no engine here; only BOIN is computed`);
  if (gaps.length > 0) {
    return { ...empty('partial', applicability, gaps), method: e.method === 'boin' ? 'boin' : null, parameters: e.method === 'boin' ? parametersOf(e) : null };
  }
  const parameters = parametersOf(e);
  let bounds: { lambdaE: number; lambdaD: number };
  try {
    const b = boinBoundaries(parameters.targetToxicity, parameters.phi1.value, parameters.phi2.value);
    bounds = { lambdaE: b.lambdaE, lambdaD: b.lambdaD };
  } catch (err) {
    // φ1 < φ < φ2 < 1 violated by design-recorded neighbourhood values.
    return { ...empty('partial', applicability, [`the BOIN neighbourhood is invalid (${(err as Error).message}): no boundary can be computed`]), method: 'boin', parameters };
  }
  const extra: string[] = [];
  if (!design.safety?.dltDefinition?.trim()) extra.push('the escalation counts DLTs, but the design does not define a dose-limiting toxicity');
  if (parameters.startingDose === null) extra.push('the starting dose is not recorded');
  return {
    status: extra.length ? 'partial' : 'rendered',
    applicability,
    gaps: extra,
    method: 'boin',
    parameters,
    boundaries: bounds,
    decisionTable: decisionTable(parameters, bounds.lambdaE, bounds.lambdaD),
    mtdSelection: MTD_RULE,
    basis: DOSE_ESCALATION_BASIS,
  };
}
