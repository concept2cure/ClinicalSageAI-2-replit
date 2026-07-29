/**
 * Restricted mean survival time (RMST).
 *
 * RMST(τ) is the area under the survival curve up to a horizon τ — the expected
 * event-free time within [0, τ]. The difference in RMST between two arms is a
 * model-free treatment-effect measure that, unlike the hazard ratio, stays
 * interpretable when proportional hazards fails (Uno et al. 2014; Royston &
 * Parmar 2013) and is increasingly expected by regulators for such trials.
 *
 * This estimates the Kaplan–Meier curve per arm, integrates it to τ, and uses
 * the standard Greenwood-type RMST variance
 *
 *   Var(RMST) = Σ_{t_i ≤ τ}  A_i² · d_i / ( n_i (n_i − d_i) ),   A_i = ∫_{t_i}^{τ} Ŝ(u) du,
 *
 * then forms the two-arm difference, its standard error, a z test and a
 * confidence interval. Pure and deterministic.
 *
 * No fabrication: with no events before τ the variance is 0 and is reported as
 * such; τ beyond the largest observed time is handled by the last KM level.
 */

import { normalCdf, normalQuantile } from './normal';
import { buildProvenance, type StatsProvenance } from './computation-provenance';

export interface KaplanMeierStep {
  time: number;
  atRisk: number;
  events: number;
  survival: number;
}

/**
 * Kaplan–Meier survival steps from individual data. `times` are
 * event/censoring times; `events[i]` is 1 for an event, 0 for right-censoring.
 * Returns one step per distinct event time (censoring only reduces the risk set).
 */
export function kaplanMeier(times: number[], events: number[]): KaplanMeierStep[] {
  if (times.length !== events.length) throw new Error('times and events must have equal length');
  if (times.length === 0) throw new Error('at least one observation is required');

  const order = [...times.keys()].sort((a, b) => times[a] - times[b]);
  const distinct = Array.from(new Set(times)).sort((a, b) => a - b);
  const steps: KaplanMeierStep[] = [];
  let survival = 1;
  let pointer = 0;
  let atRisk = times.length;

  for (const t of distinct) {
    // Everyone with observed time ≥ t is at risk at t.
    let d = 0;
    let removed = 0;
    while (pointer < order.length && times[order[pointer]] === t) {
      if (events[order[pointer]] === 1) d++;
      removed++;
      pointer++;
    }
    if (d > 0) {
      survival *= 1 - d / atRisk;
      steps.push({ time: t, atRisk, events: d, survival });
    }
    atRisk -= removed;
  }
  return steps;
}

export interface RmstResult {
  rmst: number;
  variance: number;
  se: number;
  tau: number;
  /** True when τ exceeds the largest observed time (the tail is extrapolated flat). */
  tauBeyondData: boolean;
}

/**
 * RMST(τ) and its variance from individual survival data.
 */
export function restrictedMeanSurvival(times: number[], events: number[], tau: number): RmstResult {
  if (!(tau > 0)) throw new Error('tau must be positive');
  const steps = kaplanMeier(times, events);
  const maxTime = Math.max(...times);

  // Build the piecewise-constant survival on [0, τ]: S = 1 until the first event,
  // then S_i after event i. Integrate (area) and record each event level.
  let area = 0;
  let prevTime = 0;
  let prevS = 1;
  const eventLevels: Array<{ time: number; survival: number; atRisk: number; events: number }> = [];
  for (const s of steps) {
    if (s.time >= tau) break;
    area += prevS * (s.time - prevTime);
    eventLevels.push({ time: s.time, survival: s.survival, atRisk: s.atRisk, events: s.events });
    prevTime = s.time;
    prevS = s.survival;
  }
  area += prevS * (tau - prevTime); // tail up to τ at the last survival level

  // Greenwood-type variance: Σ A_i² d_i / (n_i (n_i − d_i)), A_i = ∫_{t_i}^{τ} S du.
  // Compute A_i as the area from each event time to τ using the post-drop levels.
  let variance = 0;
  for (let i = 0; i < eventLevels.length; i++) {
    const ni = eventLevels[i].atRisk;
    const di = eventLevels[i].events;
    if (ni - di <= 0) continue; // last subject(s) at this time — term is 0/undefined, skip
    // A_i = ∫_{t_i}^{τ} S(u) du, with S = level_j on [t_j, t_{j+1}) for j ≥ i.
    let ai = 0;
    for (let j = i; j < eventLevels.length; j++) {
      const upper = j + 1 < eventLevels.length ? eventLevels[j + 1].time : tau;
      ai += eventLevels[j].survival * (upper - eventLevels[j].time);
    }
    variance += (ai * ai * di) / (ni * (ni - di));
  }

  return {
    rmst: area,
    variance,
    se: Math.sqrt(variance),
    tau,
    tauBeyondData: tau > maxTime,
  };
}

export interface RmstDifferenceResult {
  rmstTreatment: number;
  rmstControl: number;
  difference: number;
  se: number;
  z: number;
  pValue: number;
  ciLower: number;
  ciUpper: number;
  tau: number;
  confLevel: number;
  treatment: RmstResult;
  control: RmstResult;
  provenance: StatsProvenance;
}

/**
 * Difference in RMST between a treatment and a control arm at horizon τ, with a
 * two-sided z test and confidence interval. The two arms are independent, so the
 * variances add.
 */
export function rmstDifference(
  treatment: { times: number[]; events: number[] },
  control: { times: number[]; events: number[] },
  tau: number,
  confLevel = 0.95,
): RmstDifferenceResult {
  const t = restrictedMeanSurvival(treatment.times, treatment.events, tau);
  const c = restrictedMeanSurvival(control.times, control.events, tau);
  const difference = t.rmst - c.rmst;
  const se = Math.sqrt(t.variance + c.variance);
  const z = se > 0 ? difference / se : 0;
  const pValue = 2 * (1 - normalCdf(Math.abs(z)));
  const zc = normalQuantile(1 - (1 - confLevel) / 2);

  const inputs = {
    nTreatment: treatment.times.length,
    nControl: control.times.length,
    tau, confLevel,
  };
  return {
    rmstTreatment: t.rmst,
    rmstControl: c.rmst,
    difference,
    se,
    z,
    pValue,
    ciLower: difference - zc * se,
    ciUpper: difference + zc * se,
    tau,
    confLevel,
    treatment: t,
    control: c,
    provenance: buildProvenance({
      method: 'rmst:difference',
      seed: 0,
      inputs,
      note: 'Kaplan–Meier RMST difference with Greenwood-type variance; deterministic for the same data and τ.',
    }),
  };
}
