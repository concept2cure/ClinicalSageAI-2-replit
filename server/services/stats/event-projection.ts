/**
 * Event-time projection for event-driven (time-to-event) trials.
 *
 * A confirmatory survival trial reads out when a target number of events D is
 * reached — that calendar time drives every interim/DMC analysis and the final
 * analysis. This module forecasts it. Given uniform accrual, exponential
 * time-to-event (control median + hazard ratio) and exponential dropout, it
 * gives the exact expected cumulative-events curve E[D(t)] and inverts it for the
 * expected calendar time to D events, plus a seeded Monte Carlo prediction
 * interval.
 *
 * This complements the fixed-design survival sizing in `power-sample-size-service`
 * (which returns the required number of events) by answering the calendar-timing
 * question, and it can be driven by the accrual forecasts from
 * `enrollment-forecast.ts`.
 *
 * Pure and deterministic for the closed forms; the prediction interval is a
 * seeded, reproducible simulation. No fabrication: a target that cannot be
 * reached (e.g. heavy dropout) is reported as not reached.
 */

import { createRng, seedFromObject } from './rng';
import { buildProvenance, type StatsProvenance } from './computation-provenance';

export interface EventProjectionInput {
  /** Patients accrued per unit time (uniform accrual). */
  accrualRate: number;
  /** Duration of accrual. */
  accrualPeriod: number;
  /** Treatment:control allocation ratio (default 1 = balanced). */
  allocationRatio?: number;
  /** Median time-to-event in the control arm (> 0). */
  medianControl: number;
  /** Hazard ratio (treatment vs control). */
  hazardRatio: number;
  /** Exponential dropout hazard (per unit time). Default 0. */
  dropoutHazard?: number;
  /** Target number of events. */
  targetEvents: number;
}

const LN2 = Math.log(2);

interface Arm {
  fraction: number;
  /** Event hazard λ. */
  lambda: number;
}

function resolveArms(input: EventProjectionInput): Arm[] {
  if (input.medianControl <= 0) throw new Error('medianControl must be positive');
  if (input.hazardRatio <= 0) throw new Error('hazardRatio must be positive');
  const ratio = input.allocationRatio ?? 1;
  if (ratio <= 0) throw new Error('allocationRatio must be positive');
  const lambdaC = LN2 / input.medianControl;
  const pT = ratio / (1 + ratio);
  return [
    { fraction: 1 - pT, lambda: lambdaC }, // control
    { fraction: pT, lambda: input.hazardRatio * lambdaC }, // treatment
  ];
}

/**
 * Exact expected cumulative number of observed events by calendar time t.
 *
 * A patient entering at u (uniform on [0, A]) is observed to have an event by t
 * with probability (competing exponential event/dropout):
 *   h(t−u) = λ/(λ+λ_d)·(1 − e^{−(λ+λ_d)(t−u)})
 * Integrating the accrual intensity against h over u ∈ [0, min(t, A)] gives the
 * closed form below.
 */
export function expectedEventsByTime(input: EventProjectionInput, t: number): number {
  if (t < 0) throw new Error('t must be non-negative');
  const arms = resolveArms(input);
  const lambdaD = input.dropoutHazard ?? 0;
  if (lambdaD < 0) throw new Error('dropoutHazard must be non-negative');
  const A = input.accrualPeriod;
  const m = Math.min(t, A);
  let total = 0;
  for (const arm of arms) {
    const k = arm.lambda + lambdaD;
    const c = k > 0 ? arm.lambda / k : 0;
    // ∫_0^m (1 − e^{−k(t−u)}) du = m − (e^{−k(t−m)} − e^{−kt}) / k
    const integral = k > 0 ? m - (Math.exp(-k * (t - m)) - Math.exp(-k * t)) / k : 0;
    total += arm.fraction * input.accrualRate * c * integral;
  }
  return total;
}

/** Calendar time at which E[D(t)] = targetEvents, or Infinity if never reached. */
export function expectedTimeToEvents(input: EventProjectionInput): number {
  const D = input.targetEvents;
  if (D <= 0) return 0;
  // Maximum attainable expected events (t → ∞): everyone who avoids dropout.
  const arms = resolveArms(input);
  const lambdaD = input.dropoutHazard ?? 0;
  const N = input.accrualRate * input.accrualPeriod;
  const maxEvents = arms.reduce((s, a) => {
    const k = a.lambda + lambdaD;
    return s + a.fraction * N * (k > 0 ? a.lambda / k : 0);
  }, 0);
  if (D > maxEvents) return Infinity;

  // Bisection on t (E[D(t)] is monotone increasing).
  let lo = 0;
  let hi = input.accrualPeriod + input.medianControl;
  while (expectedEventsByTime(input, hi) < D && hi < 1e9) hi *= 2;
  for (let i = 0; i < 200; i++) {
    const mid = (lo + hi) / 2;
    if (expectedEventsByTime(input, mid) < D) lo = mid;
    else hi = mid;
    if (hi - lo < 1e-9 * Math.max(1, hi)) break;
  }
  return (lo + hi) / 2;
}

export interface EventProjectionForecast {
  expectedTime: number;
  medianTime: number;
  p10: number;
  p90: number;
  probReached: number;
  expectedEventsAtExpectedTime: number;
  targetEvents: number;
  nSim: number;
  seed: number;
  provenance: StatsProvenance;
}

function percentile(sorted: number[], p: number): number {
  if (sorted.length === 0) return Infinity;
  const idx = Math.min(sorted.length - 1, Math.max(0, Math.round(p * (sorted.length - 1))));
  return sorted[idx];
}

/**
 * Forecast the calendar time to reach `targetEvents`, with an 80% prediction
 * interval, by seeded Monte Carlo: uniform accrual, arm assignment by the
 * allocation, exponential event and dropout times; the D-th observed event time
 * is recorded per simulation.
 */
export function projectEventTime(
  args: EventProjectionInput & { nSim?: number; seed?: number },
): EventProjectionForecast {
  if (!Number.isInteger(args.targetEvents) || args.targetEvents <= 0) {
    throw new Error('targetEvents must be a positive integer');
  }
  const arms = resolveArms(args);
  const lambdaD = args.dropoutHazard ?? 0;
  const N = Math.round(args.accrualRate * args.accrualPeriod);
  const nSim = args.nSim ?? 2000;
  const pT = arms[1].fraction;

  const inputs = {
    accrualRate: args.accrualRate, accrualPeriod: args.accrualPeriod,
    allocationRatio: args.allocationRatio ?? 1, medianControl: args.medianControl,
    hazardRatio: args.hazardRatio, dropoutHazard: lambdaD, targetEvents: args.targetEvents, nSim,
  };
  const seed = args.seed !== undefined && Number.isFinite(args.seed)
    ? Math.trunc(args.seed) : seedFromObject(inputs);
  const rng = createRng(seed);

  const times: number[] = [];
  let reached = 0;
  for (let s = 0; s < nSim; s++) {
    const eventTimes: number[] = [];
    for (let p = 0; p < N; p++) {
      const entry = rng.uniform() * args.accrualPeriod;
      const lambda = rng.uniform() < pT ? arms[1].lambda : arms[0].lambda;
      const tEvent = rng.exponential(lambda);
      const tDrop = lambdaD > 0 ? rng.exponential(lambdaD) : Infinity;
      if (tEvent < tDrop) eventTimes.push(entry + tEvent);
    }
    if (eventTimes.length >= args.targetEvents) {
      eventTimes.sort((a, b) => a - b);
      const tD = eventTimes[args.targetEvents - 1];
      times.push(tD); reached++;
    }
  }
  times.sort((a, b) => a - b);
  const expectedTime = expectedTimeToEvents(args);

  return {
    expectedTime,
    medianTime: percentile(times, 0.5),
    p10: percentile(times, 0.1),
    p90: percentile(times, 0.9),
    probReached: reached / nSim,
    expectedEventsAtExpectedTime: Number.isFinite(expectedTime)
      ? expectedEventsByTime(args, expectedTime) : NaN,
    targetEvents: args.targetEvents,
    nSim,
    seed,
    provenance: buildProvenance({
      method: 'eventProjection:projectEventTime',
      seed,
      inputs,
      note: 'Uniform accrual + exponential event/dropout; seeded Monte Carlo, reproducible for this seed.',
    }),
  };
}
