/**
 * Multiplicity check — does the design's named procedure hold the family-wise
 * error rate at alpha over its confirmatory family, and does its allocation
 * cover that family?
 *
 * ## The industry need
 * ICH E9 §5.6 and FDA's guidance "Multiple Endpoints in Clinical Trials" (2022)
 * require that a trial testing more than one confirmatory hypothesis control
 * the family-wise type I error and pre-specify how. The design gate MUL-001
 * (`design-gates.ts`) already refuses a hierarchy with NO strategy; nothing
 * checked that the strategy named is one that controls the error for this
 * family, or that the recorded alpha allocation names the family's endpoints.
 * This repository has the procedures and a seeded FWER estimator
 * (`stats/multiplicity.ts`) reachable only as a calculator; this is the
 * spine's view of them.
 *
 * ## The honesty contract
 *  - The family is the design's confirmatory endpoints — the roles
 *    `ESTIMAND_REQUIRED_ROLES` names (primary, key secondary).
 *  - Every rate is the engine's `estimateFWER`: the named procedure and, for
 *    contrast, testing each hypothesis at the full alpha, under the global null
 *    with independent p-values, from one fixed seed. The Monte Carlo standard
 *    error is reported beside each rate, and "controlled" is decided against a
 *    stated tolerance, not eyeballed.
 *  - Independence is the simulation's assumption, and it is said: Hochberg's
 *    guarantee needs independence or positive dependence, which a simulation
 *    under independence cannot establish for the trial's actual endpoints.
 *  - A procedure the engine does not implement from what the spine records
 *    (graphical without weights and a transition matrix, gatekeeping) is a gap,
 *    never approximated by a different procedure. Alpha spending is an interim
 *    device, not an endpoint-family procedure, and is said to be.
 *  - Pure and total; provenance carries no clock reading.
 *
 * @module server/services/study-design/multiplicity-check
 */

import { estimateFWER, fixedSequenceReject, hochbergReject, holmReject } from '../stats/multiplicity';
import { reproducibleProvenance, type ReproducibleProvenance } from '../stats/computation-provenance';
import { ESTIMAND_REQUIRED_ROLES, type MultiplicityStrategy, type StudyDesign } from './study-design-types';

export const MULTIPLICITY_CHECK_BASIS =
  'ICH E9 §5.6 (multiplicity); FDA guidance: Multiple Endpoints in Clinical Trials (2022); ' +
  'family-wise error estimated under the global null by seeded simulation (stats/multiplicity.ts)';

/** Simulations per rate, and the fixed seed every rate is drawn from. */
export const FWER_SIMULATIONS = 20000;
export const FWER_SEED = 20260928;
/** A procedure "controls" the FWER when the estimate is within this many Monte Carlo SEs above alpha. */
export const FWER_TOLERANCE_SE = 3;

export type MultiplicityCheckStatus = 'rendered' | 'partial' | 'missing' | 'not_applicable';

export interface FwerRate {
  fwer: number;
  monteCarloSe: number;
  provenance: ReproducibleProvenance;
}

export interface MultiplicityCheck {
  status: MultiplicityCheckStatus;
  gaps: string[];
  notes: string[];
  family: string[];
  method: MultiplicityStrategy['method'] | null;
  alpha: number | null;
  /** The named procedure's FWER under the global null; null when it could not be simulated. */
  procedure: (FwerRate & { controlled: boolean }) | null;
  /** Each hypothesis tested at the full alpha — the inflation the procedure exists to prevent. */
  unadjusted: FwerRate | null;
  allocation: { unallocated: string[]; outsideFamily: string[]; aboveAlpha: string[] } | null;
  basis: string;
}

type RejectFn = (p: number[], alpha: number) => boolean[];

const ENGINE_PROCEDURES: Partial<Record<MultiplicityStrategy['method'], RejectFn>> = {
  fixed_sequence: fixedSequenceReject,
  holm: holmReject,
  hochberg: hochbergReject,
};

const UNSUPPORTED: Partial<Record<MultiplicityStrategy['method'], string>> = {
  graphical: 'a graphical procedure needs its initial weights and transition matrix, which the design does not record: its error control cannot be checked',
  gatekeeping: 'gatekeeping families and their truncation are not recorded in a form the engine can test: its error control cannot be checked',
  alpha_spending: 'alpha spending allocates error across interim looks, not across endpoints: it is not a multiplicity procedure for this family',
};

function empty(status: MultiplicityCheckStatus, gaps: string[], family: string[] = []): MultiplicityCheck {
  return { status, gaps, notes: [], family, method: null, alpha: null, procedure: null, unadjusted: null, allocation: null, basis: MULTIPLICITY_CHECK_BASIS };
}

function rate(reject: (p: number[]) => boolean[], m: number, alpha: number): FwerRate {
  const e = estimateFWER(reject, m, alpha, FWER_SIMULATIONS, FWER_SEED);
  return { fwer: e.fwer, monteCarloSe: Math.sqrt((e.fwer * (1 - e.fwer)) / e.nSim), provenance: reproducibleProvenance(e.provenance) };
}

function allocationOf(strategy: MultiplicityStrategy, family: string[], alpha: number): MultiplicityCheck['allocation'] {
  const entries = strategy.alphaAllocation ?? [];
  if (entries.length === 0) return null;
  const named = new Set(entries.map((a) => a.endpointName));
  return {
    unallocated: family.filter((f) => !named.has(f)),
    outsideFamily: entries.filter((a) => !family.includes(a.endpointName)).map((a) => a.endpointName),
    aboveAlpha: entries.filter((a) => !(a.alpha > 0 && a.alpha <= alpha)).map((a) => a.endpointName),
  };
}

function allocationGaps(a: MultiplicityCheck['allocation']): string[] {
  if (!a) return ['no alpha allocation is recorded for the family'];
  return [
    ...a.unallocated.map((e) => `confirmatory endpoint "${e}" has no alpha allocation`),
    ...a.outsideFamily.map((e) => `the allocation names "${e}", which is not a confirmatory endpoint of this design`),
    ...a.aboveAlpha.map((e) => `the allocation for "${e}" is not a level between 0 and the overall alpha`),
  ];
}

/** Check the design's multiplicity procedure over its confirmatory family. */
export function checkMultiplicity(design: StudyDesign): MultiplicityCheck {
  const family = (design.endpoints ?? []).filter((e) => (ESTIMAND_REQUIRED_ROLES as readonly string[]).includes(e.role)).map((e) => e.name);
  if (family.length <= 1) return empty('not_applicable', [`${family.length} confirmatory hypothesis: there is no family to control`], family);
  const strategy = design.statisticalPlan?.multiplicity;
  if (!strategy || strategy.method === 'none') {
    return empty('missing', [`${family.length} confirmatory hypotheses and no multiplicity procedure (design gate MUL-001)`], family);
  }
  const a = design.statisticalPlan.alpha;
  if (!(typeof a === 'number' && a > 0 && a < 1)) return { ...empty('partial', ['the significance level (alpha) is not recorded'], family), method: strategy.method };
  const allocation = allocationOf(strategy, family, a);
  const gaps = allocationGaps(allocation);
  const notes = strategy.method === 'hochberg'
    ? ['Hochberg controls the FWER under independence or positive dependence; the simulation assumes independence and cannot establish it for these endpoints']
    : [];
  const reject = ENGINE_PROCEDURES[strategy.method];
  const unadjusted = rate((p) => p.map((x) => x <= a), family.length, a);
  if (!reject) {
    return { status: 'partial', gaps: [UNSUPPORTED[strategy.method] ?? `procedure "${strategy.method}" has no engine here`, ...gaps], notes, family, method: strategy.method, alpha: a, procedure: null, unadjusted, allocation, basis: MULTIPLICITY_CHECK_BASIS };
  }
  const r = rate((p) => reject(p, a), family.length, a);
  const controlled = r.fwer <= a + FWER_TOLERANCE_SE * r.monteCarloSe;
  if (!controlled) gaps.unshift(`the procedure's simulated family-wise error (${r.fwer}) exceeds alpha (${a}) by more than ${FWER_TOLERANCE_SE} Monte Carlo SEs`);
  return {
    status: gaps.length ? 'partial' : 'rendered',
    gaps, notes, family, method: strategy.method, alpha: a,
    procedure: { ...r, controlled }, unadjusted, allocation, basis: MULTIPLICITY_CHECK_BASIS,
  };
}
