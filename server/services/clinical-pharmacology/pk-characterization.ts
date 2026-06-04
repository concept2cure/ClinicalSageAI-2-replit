/**
 * @fileoverview PK characterization — dose-proportionality and accumulation.
 * @module server/services/clinical-pharmacology/pk-characterization
 *
 * Two deterministic PK assessments used in clinical pharmacology summaries:
 *
 *   1. Dose proportionality by the power model: fit ln(exposure) = a + b·ln(dose)
 *      and judge proportionality from whether the 90% CI of the slope b falls
 *      within the critical region [1 + ln(0.8)/ln(r), 1 + ln(1.25)/ln(r)],
 *      r = dose ratio (Smith et al., Pharm Res 2000). b ≈ 1 ⇒ dose-proportional.
 *
 *   2. Accumulation and time to steady state from the elimination half-life and
 *      dosing interval: ke = ln2/t½, Rac = 1/(1 − e^(−ke·τ)), t_ss ≈ 5·t½.
 *
 * Pure module — no database, no network. Callable by ANA and the M2.7 builder.
 *
 * @compliance ICH E4; FDA population-PK and clinical-pharmacology guidances.
 */

// t critical values for the 95th percentile (one-sided) → two-sided 90% CI.
const T_95: Record<number, number> = {
  1: 6.314, 2: 2.92, 3: 2.353, 4: 2.132, 5: 2.015,
  6: 1.943, 7: 1.895, 8: 1.86, 9: 1.833, 10: 1.812,
};

function tCritical(df: number): number {
  if (df <= 0) return T_95[1];
  if (df <= 10) return T_95[df];
  if (df <= 20) return 1.725;
  if (df <= 30) return 1.697;
  return 1.645;
}

export interface DoseExposurePoint {
  dose: number;
  /** Exposure metric (AUC or Cmax) at this dose. */
  exposure: number;
}

export type ProportionalityVerdict = 'proportional' | 'not_proportional' | 'inconclusive';

export interface DoseProportionalityResult {
  slope: number;
  slopeSE: number;
  ci90: [number, number];
  doseRatio: number;
  /** Acceptance region for the slope per the power model. */
  criticalRegion: [number, number];
  verdict: ProportionalityVerdict;
  rationale: string;
  n: number;
}

export interface DoseProportionalityInput {
  dataPoints: DoseExposurePoint[];
  /** Bioequivalence-style bounds for the critical region. Default (0.8, 1.25). */
  theta?: { low: number; high: number };
}

function round(value: number, dp = 4): number {
  const f = 10 ** dp;
  return Math.round(value * f) / f;
}

/**
 * Assess dose proportionality with the power model.
 *
 * @throws if fewer than two distinct dose levels are supplied.
 */
export function assessDoseProportionality(input: DoseProportionalityInput): DoseProportionalityResult {
  const pts = input.dataPoints.filter(p => p.dose > 0 && p.exposure > 0);
  const doses = [...new Set(pts.map(p => p.dose))];
  if (doses.length < 2) {
    throw new Error('assessDoseProportionality: at least two distinct dose levels are required');
  }

  const xs = pts.map(p => Math.log(p.dose));
  const ys = pts.map(p => Math.log(p.exposure));
  const n = pts.length;
  const xbar = xs.reduce((s, v) => s + v, 0) / n;
  const ybar = ys.reduce((s, v) => s + v, 0) / n;

  let sxx = 0;
  let sxy = 0;
  for (let i = 0; i < n; i++) {
    sxx += (xs[i] - xbar) ** 2;
    sxy += (xs[i] - xbar) * (ys[i] - ybar);
  }
  const slope = sxy / sxx;
  const intercept = ybar - slope * xbar;

  // Residual variance and slope SE.
  let sse = 0;
  for (let i = 0; i < n; i++) {
    const pred = intercept + slope * xs[i];
    sse += (ys[i] - pred) ** 2;
  }
  const df = n - 2;
  const slopeSE = df > 0 ? Math.sqrt(sse / df / sxx) : 0;
  const t = tCritical(df);
  const ci90: [number, number] = [round(slope - t * slopeSE), round(slope + t * slopeSE)];

  const theta = input.theta ?? { low: 0.8, high: 1.25 };
  const doseRatio = Math.max(...doses) / Math.min(...doses);
  const lnR = Math.log(doseRatio);
  const criticalRegion: [number, number] = [
    round(1 + Math.log(theta.low) / lnR),
    round(1 + Math.log(theta.high) / lnR),
  ];

  let verdict: ProportionalityVerdict;
  if (ci90[0] >= criticalRegion[0] && ci90[1] <= criticalRegion[1]) {
    verdict = 'proportional';
  } else if (ci90[1] < criticalRegion[0] || ci90[0] > criticalRegion[1]) {
    verdict = 'not_proportional';
  } else {
    verdict = 'inconclusive';
  }

  const rationale =
    verdict === 'proportional'
      ? `Dose-proportional: the 90% CI of the power-model slope [${ci90[0]}, ${ci90[1]}] lies within the acceptance region [${criticalRegion[0]}, ${criticalRegion[1]}] over the ${round(doseRatio, 2)}-fold dose range.`
      : verdict === 'not_proportional'
        ? `Not dose-proportional: the 90% CI of the slope [${ci90[0]}, ${ci90[1]}] falls outside the acceptance region [${criticalRegion[0]}, ${criticalRegion[1]}]; exposure is ${slope > 1 ? 'more' : 'less'} than proportional.`
        : `Inconclusive: the 90% CI of the slope [${ci90[0]}, ${ci90[1]}] overlaps but is not contained by the acceptance region [${criticalRegion[0]}, ${criticalRegion[1]}]; more data or a wider dose range may be needed.`;

  return {
    slope: round(slope),
    slopeSE: round(slopeSE),
    ci90,
    doseRatio: round(doseRatio, 3),
    criticalRegion,
    verdict,
    rationale,
    n,
  };
}

export interface AccumulationResult {
  ke: number;
  accumulationRatio: number;
  timeToSteadyStateHours: number;
  halfLifeHours: number;
  dosingIntervalHours: number;
}

/**
 * Accumulation ratio and time to steady state from half-life and interval.
 *
 * @throws if half-life or interval is non-positive.
 */
export function accumulation(halfLifeHours: number, dosingIntervalHours: number): AccumulationResult {
  if (!(halfLifeHours > 0)) throw new Error('accumulation: halfLifeHours must be > 0');
  if (!(dosingIntervalHours > 0)) throw new Error('accumulation: dosingIntervalHours must be > 0');
  const ke = Math.LN2 / halfLifeHours;
  const accumulationRatio = 1 / (1 - Math.exp(-ke * dosingIntervalHours));
  return {
    ke: round(ke, 5),
    accumulationRatio: round(accumulationRatio, 3),
    timeToSteadyStateHours: round(5 * halfLifeHours, 2),
    halfLifeHours,
    dosingIntervalHours,
  };
}
