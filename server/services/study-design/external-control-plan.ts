/**
 * External-control plan — how much a design leans on borrowed control data,
 * and which of the elements a regulator expects the plan to pre-specify it
 * carries.
 *
 * ## The industry need
 * Rare-disease, oncology and paediatric programmes increasingly augment or
 * replace a concurrent control with external (historical / real-world) data.
 * FDA's draft guidance "Considerations for the Design and Conduct of
 * Externally Controlled Trials for Drug and Biological Products" (2023) and
 * ICH E10 §2.5 expect the protocol to pre-specify, among other things, the
 * external source and its fitness, how time zero is aligned, that the outcome
 * is ascertained comparably, how missing data and confounding are handled, the
 * borrowing method and its strength, prior-data conflict, and sensitivity
 * (tipping-point) analyses. The spine admits an external or historical control
 * (`framework.controlType`) and recorded none of it. This repository has had the
 * borrowing engine (`stats/external-control.ts`: power prior, commensurate
 * prior, tipping points) reachable only as a calculator; this module is the
 * spine's design-stage view of it.
 *
 * ## What is computed, and what is not
 * At protocol stage there is no concurrent data, so no posterior mean and no
 * treatment effect are computed — those are analysis-stage results. What the
 * engine CAN say from the plan is how strong the borrowing is: the effective
 * historical sample size and the share of the control's precision that comes
 * from the external source at the planned concurrent-control size. Those
 * quantities do not depend on the concurrent mean; the engine is called with
 * the historical mean in its place and the posterior mean is not reported.
 *
 * ## The honesty contract
 *  - Every borrowing figure is the engine's (`powerPriorBorrow`,
 *    `commensurateBorrow`); nothing re-derives it. A figure the engine returns
 *    non-finite is withheld with a gap, never reported.
 *  - The checklist is ten elements the 2023 draft guidance discusses — not its
 *    full list. An element `ExternalControlPlan` has no field for is reported
 *    not stated, with `field: null`, so no plan reaches `rendered` until the
 *    spine can record it. A plan element the protocol does not pre-specify is a
 *    gap, never assumed.
 *  - Prior-data conflict: neither a fixed a0 nor a fixed τ² responds to it.
 *    With τ² fixed, the normal commensurate prior IS a power prior with
 *    a0 = seH²/(seH² + τ²) — the engine's borrowing does not move with the
 *    concurrent mean. Hobbs et al.'s adaptivity comes from estimating τ. The
 *    element is stated only by an adaptive mechanism or a pre-specified
 *    conflict assessment and its action, which the spine does not yet record.
 *  - `kind` (hybrid / fully external) is reported only from a valid
 *    concurrent-control size; a fully external control has no borrowing ratio
 *    to compute, and that is stated, not approximated.
 *  - An unrecorded control type is not_assessable — never read as "no external
 *    control".
 *  - Pure and total: no clock; malformed persisted input (the persist route
 *    validates designs with `.passthrough()`) is a gap, never a throw.
 *
 * @module server/services/study-design/external-control-plan
 */

import { commensurateBorrow, powerPriorBorrow, type BorrowResult } from '../stats/external-control';
import type { ControlType, ExternalControlPlan, StudyDesign } from './study-design-types';

export const EXTERNAL_CONTROL_BASIS =
  'FDA draft guidance: Considerations for the Design and Conduct of Externally Controlled Trials for Drug and Biological Products (2023); ' +
  'ICH E10 §2.5 (external control); Ibrahim & Chen 2000 (power prior); Hobbs et al. 2011 (commensurate prior)';

export type ExternalControlStatus = 'rendered' | 'partial' | 'missing' | 'not_applicable' | 'not_assessable';

export interface BorrowingStrength {
  method: ExternalControlPlan['method'];
  /** The discount the engine was given: a0 for a power prior, τ² for a commensurate prior. */
  parameter: { name: 'a0' | 'tau2'; value: number };
  effectiveHistoricalN: number;
  /** Share of the control's posterior precision contributed by the external source. */
  borrowedPrecisionFraction: number;
  /** The planned concurrent control's standard error the fraction was computed at. */
  plannedConcurrentSe: number;
}

export interface PlanElement {
  element: string;
  stated: boolean;
  detail: string;
  /** The `ExternalControlPlan` field that records the element; null when the spine has none, so it cannot be stated yet. */
  field: string | null;
}

export interface ExternalControlProjection {
  status: ExternalControlStatus;
  gaps: string[];
  /** Ten elements the FDA 2023 draft guidance discusses for pre-specification, each stated or not. Not the guidance's full list. */
  elements: PlanElement[];
  kind: 'hybrid' | 'fully_external' | null;
  borrowing: BorrowingStrength | null;
  basis: string;
}

const EXTERNAL_CONTROL_TYPES: ReadonlySet<unknown> = new Set<ControlType>(['external', 'historical']);
const OTHER_CONTROL_TYPES: ReadonlySet<unknown> = new Set<ControlType>(['placebo', 'active', 'dose_response', 'none']);

type Rec = Record<string, unknown>;
const isRecord = (v: unknown): v is Rec => typeof v === 'object' && v !== null && !Array.isArray(v);
const finite = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v);
const positive = (v: unknown): v is number => finite(v) && v > 0;
/** A standard error whose precision 1/se² — and the sum of two such — is a finite positive number. */
const representable = (se: unknown): se is number => positive(se) && Number.isFinite(2 / (se * se)) && 1 / (se * se) > 0;
const text = (v: unknown): string => (typeof v === 'string' ? v.trim() : '');
const wholeCount = (v: unknown): v is number => Number.isInteger(v) && (v as number) >= 0;

function empty(status: ExternalControlStatus, gaps: string[]): ExternalControlProjection {
  return { status, gaps, elements: [], kind: null, borrowing: null, basis: EXTERNAL_CONTROL_BASIS };
}

// ─── The checklist ──────────────────────────────────────────────────────────

const NO_FIELD = 'the design spine has no field for it';

/** An element the guidance discusses that `ExternalControlPlan` cannot record yet. */
function unrecordable(element: string, what: string): PlanElement {
  return { element, stated: false, detail: `not recorded: ${what} — ${NO_FIELD}`, field: null };
}

const fitnessElement = () => unrecordable(
  'Fitness of the external data (relevance and reliability)',
  'why the source fits the question — its population, care and follow-up — and how reliably it captured the data',
);
const indexDateElement = () => unrecordable(
  'Index date (time zero) alignment',
  'how time zero is set for external patients so that follow-up starts at the same clinical point as in the trial',
);
const outcomeElement = () => unrecordable(
  'Comparable outcome ascertainment',
  'how the endpoint is defined, timed and assessed alike in both sources (e.g. blinded assessment or re-adjudication of external outcomes)',
);
const confoundingElement = () => unrecordable(
  'Confounding-adjustment method',
  'the analysis that adjusts for measured confounding (e.g. propensity-score weighting or matching, outcome regression); covariateBalancePlanned records balance diagnostics only',
);
const missingDataElement = () => unrecordable(
  'Missing data in the external source',
  'how missing covariates and outcomes in the external data are handled',
);

function sourceElement(plan: Rec): PlanElement {
  const source = text(plan.source);
  return { element: 'External data source', stated: source !== '', detail: source || 'not recorded', field: 'source' };
}

function methodElement(plan: Rec): PlanElement {
  const base = { element: 'Borrowing method and strength', field: 'method, a0 / tau2' };
  if (plan.method === 'power_prior' && finite(plan.a0)) return { ...base, stated: true, detail: `power prior, a0 = ${plan.a0}` };
  if (plan.method === 'commensurate' && finite(plan.tau2)) return { ...base, stated: true, detail: `commensurate prior, τ² = ${plan.tau2}` };
  return { ...base, stated: false, detail: 'not recorded' };
}

/** Never stated from a fixed discount: see the honesty contract. */
function conflictElement(plan: Rec): PlanElement {
  const why = plan.method === 'commensurate'
    ? 'a fixed τ² is a fixed discount — with τ² fixed the normal commensurate prior equals a power prior with a0 = seH²/(seH² + τ²) — ' +
      'so borrowing does not attenuate when the concurrent and external controls disagree'
    : plan.method === 'power_prior' ? 'a fixed power-prior discount does not respond to prior-data conflict' : 'no borrowing method is recorded';
  return {
    element: 'Prior-data conflict handling',
    stated: false,
    detail: `${why}; an adaptive mechanism (τ estimated under a hyperprior or by empirical Bayes, a robust mixture prior) ` +
      `or a pre-specified conflict assessment and its action is not recorded — ${NO_FIELD}`,
    field: null,
  };
}

function flagElement(plan: Rec, field: 'covariateBalancePlanned' | 'tippingPointAnalysisPlanned', element: string, whenStated: string): PlanElement {
  const stated = plan[field] === true;
  return { element, stated, detail: stated ? whenStated : 'not recorded', field };
}

/** The pre-specification checklist, each element stated or not. */
function elementsOf(plan: Rec): PlanElement[] {
  return [
    sourceElement(plan),
    fitnessElement(),
    indexDateElement(),
    outcomeElement(),
    methodElement(plan),
    conflictElement(plan),
    flagElement(plan, 'covariateBalancePlanned', 'Covariate comparability of the populations', 'balance diagnostics pre-specified'),
    confoundingElement(),
    missingDataElement(),
    flagElement(plan, 'tippingPointAnalysisPlanned', 'Tipping-point sensitivity analysis', 'pre-specified'),
  ];
}

function unstated(elements: PlanElement[]): string[] {
  return elements.filter((e) => !e.stated).map((e) => `${e.element}: ${e.detail}`);
}

// ─── The plan's inputs ──────────────────────────────────────────────────────

function endpointGaps(design: StudyDesign, plan: Rec): string[] {
  if (!text(plan.endpointName)) return ['the endpoint the borrowing is for is not recorded'];
  const endpoints: unknown = design.endpoints;
  const names = Array.isArray(endpoints) ? endpoints.filter(isRecord).map((e) => e.name) : [];
  return names.includes(plan.endpointName) ? [] : [`endpoint "${String(plan.endpointName)}" is not an endpoint of this design`];
}

function historicalGaps(h: unknown): string[] {
  if (!(isRecord(h) && positive(h.n) && positive(h.se) && finite(h.mean))) return ['the external control summary (n, mean, standard error) is incomplete'];
  return representable(h.se) ? [] : [`the external control's standard error (${h.se}) has no finite positive precision 1/se², so no borrowing can be computed from it`];
}

/** The borrowing method's own parameter, checked; one gap or none. */
function methodGaps(plan: Rec): string[] {
  if (plan.method === 'power_prior') {
    return finite(plan.a0) && plan.a0 >= 0 && plan.a0 <= 1 ? [] : ['the power-prior discount a0 must be recorded, between 0 and 1'];
  }
  if (plan.method === 'commensurate') {
    return finite(plan.tau2) && plan.tau2 >= 0 ? [] : ['the commensurability variance τ² must be recorded as a finite, non-negative number'];
  }
  return [`borrowing method "${String(plan.method)}" has no engine here`];
}

/** Every defect in the recorded plan that stops the engine from running. */
function inputGaps(design: StudyDesign, plan: Rec): string[] {
  return [
    ...endpointGaps(design, plan),
    ...historicalGaps(plan.historical),
    ...methodGaps(plan),
    ...(wholeCount(plan.plannedConcurrentControlN) ? [] : ['the planned concurrent control size must be a whole number (0 for a fully external control)']),
  ];
}

// ─── The engine ─────────────────────────────────────────────────────────────

const FULLY_EXTERNAL = 'there is no concurrent control: the comparison rests entirely on the external control, so there is no borrowing ratio to compute';

/** The engine's borrowing strength at the planned concurrent-control size; a gap when it cannot be computed. */
function strengthOf(plan: ExternalControlPlan): BorrowingStrength | string {
  if (!positive(plan.assumedSd)) {
    return 'the assumed SD is not recorded as a positive number, so the planned concurrent control\'s precision — and the borrowed share — cannot be computed';
  }
  const nC = plan.plannedConcurrentControlN;
  const seC = plan.assumedSd / Math.sqrt(nC);
  if (!representable(seC)) {
    return `the planned concurrent control's standard error (assumed SD / √${nC} = ${seC}) has no finite positive precision 1/se², so the borrowed share cannot be computed`;
  }
  const common = { meanC: plan.historical.mean, seC, nC, meanH: plan.historical.mean, seH: plan.historical.se, nH: plan.historical.n };
  const r: BorrowResult = plan.method === 'power_prior'
    ? powerPriorBorrow({ ...common, a0: plan.a0 as number })
    : commensurateBorrow({ ...common, tau2: plan.tau2 as number });
  if (!(Number.isFinite(r.effectiveHistoricalN) && Number.isFinite(r.borrowedPrecisionFraction))) {
    return 'the engine returned a non-finite borrowing figure for these inputs, so none is reported';
  }
  return {
    method: plan.method,
    parameter: plan.method === 'power_prior' ? { name: 'a0', value: plan.a0 as number } : { name: 'tau2', value: plan.tau2 as number },
    effectiveHistoricalN: r.effectiveHistoricalN,
    borrowedPrecisionFraction: r.borrowedPrecisionFraction,
    plannedConcurrentSe: seC,
  };
}

/** No plan: whether one is required follows from the RECORDED control type only. */
function noPlan(controlType: unknown): ExternalControlProjection {
  if (EXTERNAL_CONTROL_TYPES.has(controlType)) {
    return empty('missing', [`the design uses a${controlType === 'external' ? 'n external' : ' historical'} control but records no borrowing plan: source, method, strength and sensitivity analyses are not pre-specified`]);
  }
  if (OTHER_CONTROL_TYPES.has(controlType)) return empty('not_applicable', [`the control type is "${String(controlType)}": the design uses no external or historical control`]);
  const why = controlType === undefined || controlType === null ? 'the control type is not recorded' : `the control type "${String(controlType)}" is not one the design spine records`;
  return empty('not_assessable', [`${why}, so whether an external-control plan is required cannot be assessed`]);
}

/** Project the design's external-control plan. Every borrowing figure is the engine's. */
export function projectExternalControlPlan(design: StudyDesign): ExternalControlProjection {
  const plan: unknown = design.externalControlPlan;
  if (plan === undefined || plan === null) return noPlan(isRecord(design.framework) ? design.framework.controlType : undefined);
  if (!isRecord(plan)) return empty('partial', ['the external-control plan is not a structured record, so none of it can be read']);
  const elements = elementsOf(plan);
  const n = plan.plannedConcurrentControlN;
  const kind = wholeCount(n) ? (n > 0 ? 'hybrid' : 'fully_external') : null;
  const gaps = inputGaps(design, plan);
  let borrowing: BorrowingStrength | null = null;
  if (gaps.length === 0) {
    const s = kind === 'fully_external' ? FULLY_EXTERNAL : strengthOf(plan as unknown as ExternalControlPlan);
    if (typeof s === 'string') gaps.push(s);
    else borrowing = s;
  }
  const all = [...gaps, ...unstated(elements)];
  return { status: all.length ? 'partial' : 'rendered', gaps: all, elements, kind, borrowing, basis: EXTERNAL_CONTROL_BASIS };
}
