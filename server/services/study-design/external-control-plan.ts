/**
 * External-control plan — how much a design leans on borrowed control data,
 * and whether the plan carries what a regulator expects of it.
 *
 * ## The industry need
 * Rare-disease, oncology and paediatric programmes increasingly augment or
 * replace a concurrent control with external (historical / real-world) data.
 * FDA's draft guidance "Considerations for the Design and Conduct of
 * Externally Controlled Trials for Drug and Biological Products" (2023) and
 * ICH E10 §2.5 expect the protocol to pre-specify the external source, the
 * borrowing method and its strength, a plan for prior-data conflict, covariate
 * comparability, and sensitivity (tipping-point) analyses. The spine admits an
 * external or historical control (`framework.controlType`) and recorded none
 * of it. This repository has had the borrowing engine (`stats/external-control.ts`:
 * power prior, commensurate prior, tipping points) reachable only as a
 * calculator; this module is the spine's design-stage view of it.
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
 *    `commensurateBorrow`); nothing re-derives it.
 *  - A plan element the protocol does not pre-specify is a gap, never assumed.
 *  - A fixed power-prior discount does not respond to prior-data conflict; the
 *    projection says so rather than scoring it as a conflict plan.
 *  - A fully external control (no concurrent arm) has no borrowing ratio to
 *    compute; that is stated, not approximated.
 *  - Pure and total; no clock, no throw.
 *
 * @module server/services/study-design/external-control-plan
 */

import { commensurateBorrow, powerPriorBorrow, type BorrowResult } from '../stats/external-control';
import type { ExternalControlPlan, StudyDesign } from './study-design-types';

export const EXTERNAL_CONTROL_BASIS =
  'FDA draft guidance: Considerations for the Design and Conduct of Externally Controlled Trials for Drug and Biological Products (2023); ' +
  'ICH E10 §2.5 (external control); Ibrahim & Chen 2000 (power prior); Hobbs et al. 2011 (commensurate prior)';

export type ExternalControlStatus = 'rendered' | 'partial' | 'missing' | 'not_applicable';

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

export interface ExternalControlProjection {
  status: ExternalControlStatus;
  gaps: string[];
  /** One entry per element FDA's 2023 draft guidance expects the protocol to pre-specify. */
  elements: Array<{ element: string; stated: boolean; detail: string }>;
  kind: 'hybrid' | 'fully_external' | null;
  borrowing: BorrowingStrength | null;
  basis: string;
}

const EXTERNAL_CONTROL_TYPES = new Set(['external', 'historical']);

function empty(status: ExternalControlStatus, gaps: string[]): ExternalControlProjection {
  return { status, gaps, elements: [], kind: null, borrowing: null, basis: EXTERNAL_CONTROL_BASIS };
}

const positive = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v) && v > 0;

/** The pre-specification checklist, each element stated or not. */
function elementsOf(plan: ExternalControlPlan): ExternalControlProjection['elements'] {
  const conflictAware = plan.method === 'commensurate';
  return [
    { element: 'External data source', stated: Boolean(plan.source?.trim()), detail: plan.source?.trim() || 'not recorded' },
    { element: 'Borrowing method and strength', stated: plan.method === 'power_prior' ? typeof plan.a0 === 'number' : typeof plan.tau2 === 'number', detail: plan.method },
    {
      element: 'Prior-data conflict handling',
      stated: conflictAware,
      detail: conflictAware
        ? 'commensurate prior: borrowing attenuates when the concurrent and external controls disagree'
        : 'a fixed power-prior discount does not respond to prior-data conflict; a pre-specified conflict assessment is not recorded',
    },
    { element: 'Covariate comparability of the populations', stated: plan.covariateBalancePlanned === true, detail: plan.covariateBalancePlanned ? 'pre-specified' : 'not recorded' },
    { element: 'Tipping-point sensitivity analysis', stated: plan.tippingPointAnalysisPlanned === true, detail: plan.tippingPointAnalysisPlanned ? 'pre-specified' : 'not recorded' },
  ];
}

/** Every defect in the recorded plan that stops the engine from running. */
function inputGaps(design: StudyDesign, plan: ExternalControlPlan): string[] {
  const gaps: string[] = [];
  if (!(design.endpoints ?? []).some((e) => e.name === plan.endpointName)) gaps.push(`endpoint "${plan.endpointName}" is not an endpoint of this design`);
  const h = plan.historical;
  if (!(h && positive(h.n) && positive(h.se) && Number.isFinite(h.mean))) gaps.push('the external control summary (n, mean, standard error) is incomplete');
  if (plan.method === 'power_prior' && !(typeof plan.a0 === 'number' && plan.a0 >= 0 && plan.a0 <= 1)) gaps.push('the power-prior discount a0 must be recorded, between 0 and 1');
  if (plan.method === 'commensurate' && !(typeof plan.tau2 === 'number' && plan.tau2 >= 0)) gaps.push('the commensurability variance τ² must be recorded and non-negative');
  if (plan.method !== 'power_prior' && plan.method !== 'commensurate') gaps.push(`borrowing method "${String(plan.method)}" has no engine here`);
  if (!(Number.isInteger(plan.plannedConcurrentControlN) && plan.plannedConcurrentControlN >= 0)) gaps.push('the planned concurrent control size must be a whole number (0 for a fully external control)');
  return gaps;
}

/** The engine's borrowing strength at the planned concurrent-control size. */
function strengthOf(plan: ExternalControlPlan): BorrowingStrength | string {
  if (!positive(plan.assumedSd)) return 'the assumed SD is not recorded, so the planned concurrent control\'s precision — and the borrowed share — cannot be computed';
  const nC = plan.plannedConcurrentControlN;
  const seC = plan.assumedSd / Math.sqrt(nC);
  const common = { meanC: plan.historical.mean, seC, nC, meanH: plan.historical.mean, seH: plan.historical.se, nH: plan.historical.n };
  const r: BorrowResult = plan.method === 'power_prior'
    ? powerPriorBorrow({ ...common, a0: plan.a0 as number })
    : commensurateBorrow({ ...common, tau2: plan.tau2 as number });
  return {
    method: plan.method,
    parameter: plan.method === 'power_prior' ? { name: 'a0', value: plan.a0 as number } : { name: 'tau2', value: plan.tau2 as number },
    effectiveHistoricalN: r.effectiveHistoricalN,
    borrowedPrecisionFraction: r.borrowedPrecisionFraction,
    plannedConcurrentSe: seC,
  };
}

/** Project the design's external-control plan. Every borrowing figure is the engine's. */
export function projectExternalControlPlan(design: StudyDesign): ExternalControlProjection {
  const plan = design.externalControlPlan;
  const usesExternal = EXTERNAL_CONTROL_TYPES.has(String(design.framework?.controlType));
  if (!plan) {
    return usesExternal
      ? empty('missing', [`the design uses a${design.framework.controlType === 'external' ? 'n external' : ' historical'} control but records no borrowing plan: source, method, strength and sensitivity analyses are not pre-specified`])
      : empty('not_applicable', ['the design uses no external or historical control']);
  }
  const gaps = inputGaps(design, plan);
  const elements = elementsOf(plan);
  const kind = plan.plannedConcurrentControlN > 0 ? 'hybrid' : 'fully_external';
  if (gaps.length) return { status: 'partial', gaps: [...gaps, ...unstated(elements)], elements, kind, borrowing: null, basis: EXTERNAL_CONTROL_BASIS };
  let borrowing: BorrowingStrength | null = null;
  if (kind === 'fully_external') {
    gaps.push('there is no concurrent control: the comparison rests entirely on the external control, so there is no borrowing ratio to compute');
  } else {
    const s = strengthOf(plan);
    if (typeof s === 'string') gaps.push(s);
    else borrowing = s;
  }
  const all = [...gaps, ...unstated(elements)];
  return { status: all.length ? 'partial' : 'rendered', gaps: all, elements, kind, borrowing, basis: EXTERNAL_CONTROL_BASIS };
}

function unstated(elements: ExternalControlProjection['elements']): string[] {
  return elements.filter((e) => !e.stated).map((e) => `${e.element}: ${e.detail}`);
}
