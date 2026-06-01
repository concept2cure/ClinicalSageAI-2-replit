/**
 * Win ratio and the Finkelstein–Schoenfeld test for hierarchical composite
 * endpoints.
 *
 * Each treatment subject is compared with each control subject through a
 * prioritized hierarchy of outcomes (e.g. time to death, then time to
 * heart-failure hospitalization, then a continuous biomarker). The most
 * important outcome decides the pair; if it ties, the next outcome is consulted,
 * and so on (Pocock et al. 2012; Finkelstein & Schoenfeld 1999). Each pair is a
 * win, loss, or tie for treatment.
 *
 * Reported:
 *   - win ratio  WR = wins / losses,
 *   - win odds   = (wins + ties/2) / (losses + ties/2),
 *   - net benefit Δ = (wins − losses) / pairs  (Buyse 2010),
 *   - the Finkelstein–Schoenfeld test of Δ via the two-sample U-statistic
 *     variance (a DeLong-style projection), with a two-sided p-value,
 *   - a win-ratio confidence interval via the delta method on log(WR).
 *
 * Time-to-event levels use the Pocock win rule with right-censoring; continuous
 * levels compare values directly. Pure and deterministic. No fabrication: an
 * indeterminate pair (censoring makes the comparison unknowable at a level) is a
 * tie at that level, never a guessed winner.
 */

import { normalCdf, normalQuantile } from './normal';
import { buildProvenance, type StatsProvenance } from './computation-provenance';

export interface LevelSpec {
  type: 'continuous' | 'tte';
  /** 'higher-better' (e.g. longer survival, higher biomarker) or 'lower-better'. */
  direction: 'higher-better' | 'lower-better';
}

export interface SubjectLevel {
  value: number;
  /** For 'tte': 1 = event observed, 0 = right-censored at `value`. */
  event?: boolean;
}

export interface Subject {
  levels: SubjectLevel[];
}

/** Compare two subjects at one level. Returns +1 (a better), −1 (b better), 0 (tie/indeterminate). */
function compareAtLevel(a: SubjectLevel, b: SubjectLevel, spec: LevelSpec): -1 | 0 | 1 {
  const sign = spec.direction === 'higher-better' ? 1 : -1;
  if (spec.type === 'continuous') {
    if (a.value === b.value) return 0;
    return (a.value > b.value ? 1 : -1) * sign as -1 | 0 | 1;
  }
  // Time-to-event with right censoring (value = time, event = had the event).
  // Interpret "better" on the event-free time scale, then apply direction
  // (higher-better ⇒ longer event-free time is better, the usual survival case).
  const ae = a.event === true;
  const be = b.event === true;
  let raw: -1 | 0 | 1;
  if (ae && be) {
    raw = a.value === b.value ? 0 : (a.value > b.value ? 1 : -1);
  } else if (ae && !be) {
    // a had the event at a.value; b censored at b.value. b is better iff b was
    // event-free at least as long as a survived; otherwise indeterminate.
    raw = b.value >= a.value ? -1 : 0;
  } else if (!ae && be) {
    raw = a.value >= b.value ? 1 : 0;
  } else {
    raw = 0; // both censored ⇒ indeterminate
  }
  return (raw * sign) as -1 | 0 | 1;
}

/** Compare two subjects across the hierarchy; first decisive level wins. */
export function compareSubjects(a: Subject, b: Subject, hierarchy: LevelSpec[]): -1 | 0 | 1 {
  for (let k = 0; k < hierarchy.length; k++) {
    const r = compareAtLevel(a.levels[k], b.levels[k], hierarchy[k]);
    if (r !== 0) return r;
  }
  return 0;
}

export interface WinRatioResult {
  wins: number;
  losses: number;
  ties: number;
  pairs: number;
  winRatio: number;
  winOdds: number;
  netBenefit: number;
  /** Finkelstein–Schoenfeld standardized statistic for the net benefit. */
  z: number;
  pValue: number;
  /** Win-ratio confidence interval (delta method on log WR). */
  ciLower: number;
  ciUpper: number;
  confLevel: number;
  n1: number;
  n2: number;
  provenance: StatsProvenance;
}

function mean(xs: number[]): number {
  return xs.reduce((s, v) => s + v, 0) / xs.length;
}
function variance(xs: number[]): number {
  if (xs.length < 2) return 0;
  const m = mean(xs);
  return xs.reduce((s, v) => s + (v - m) ** 2, 0) / (xs.length - 1);
}
function covariance(xs: number[], ys: number[]): number {
  if (xs.length < 2) return 0;
  const mx = mean(xs);
  const my = mean(ys);
  let s = 0;
  for (let i = 0; i < xs.length; i++) s += (xs[i] - mx) * (ys[i] - my);
  return s / (xs.length - 1);
}

/**
 * Win-ratio analysis of two arms over a hierarchical composite endpoint.
 * `treatment` and `control` are arrays of subjects; each subject's `levels`
 * align with `hierarchy`.
 */
export function winRatioAnalysis(
  treatment: Subject[],
  control: Subject[],
  hierarchy: LevelSpec[],
  confLevel = 0.95,
): WinRatioResult {
  const n1 = treatment.length;
  const n2 = control.length;
  if (n1 < 2 || n2 < 2) throw new Error('each arm needs at least 2 subjects');
  if (hierarchy.length === 0) throw new Error('hierarchy must have at least one level');
  for (const s of [...treatment, ...control]) {
    if (s.levels.length < hierarchy.length) throw new Error('every subject must have a value at each level');
  }

  // Per-subject win/loss fractions against the opposite arm.
  const trtWin = new Array(n1).fill(0);
  const trtLoss = new Array(n1).fill(0);
  const ctrWin = new Array(n2).fill(0); // control wins (= treatment losses from control's view)
  const ctrLoss = new Array(n2).fill(0);
  let wins = 0;
  let losses = 0;

  for (let i = 0; i < n1; i++) {
    for (let j = 0; j < n2; j++) {
      const h = compareSubjects(treatment[i], control[j], hierarchy);
      if (h === 1) { wins++; trtWin[i]++; ctrLoss[j]++; }
      else if (h === -1) { losses++; trtLoss[i]++; ctrWin[j]++; }
    }
  }
  const pairs = n1 * n2;
  const ties = pairs - wins - losses;

  // Net-benefit U-statistic (kernel h ∈ {+1,−1,0}); projections per subject.
  const Ri = trtWin.map((w, i) => (w - trtLoss[i]) / n2); // mean kernel over controls
  const Cj = ctrLoss.map((cl, j) => (cl - ctrWin[j]) / n1); // mean kernel over treatments (treatment-win view)
  const netBenefit = (wins - losses) / pairs;
  const varDelta = variance(Ri) / n1 + variance(Cj) / n2;
  const z = varDelta > 0 ? netBenefit / Math.sqrt(varDelta) : 0;
  const pValue = 2 * (1 - normalCdf(Math.abs(z)));

  const winRatio = losses > 0 ? wins / losses : Infinity;
  const winOdds = (wins + ties / 2) / (losses + ties / 2);

  // Win-ratio CI via delta method on log(WR), with U-statistic variances of the
  // win and loss proportions and their covariance.
  const pW = wins / pairs;
  const pL = losses / pairs;
  const wiT = trtWin.map(w => w / n2);
  const liT = trtLoss.map(l => l / n2);
  const wjC = ctrLoss.map(cl => cl / n1); // treatment-win fraction from control j
  const ljC = ctrWin.map(cw => cw / n1); // treatment-loss fraction from control j
  let ciLower = NaN;
  let ciUpper = NaN;
  if (pW > 0 && pL > 0) {
    const varPW = variance(wiT) / n1 + variance(wjC) / n2;
    const varPL = variance(liT) / n1 + variance(ljC) / n2;
    const covWL = covariance(wiT, liT) / n1 + covariance(wjC, ljC) / n2;
    const varLogWR = varPW / (pW * pW) + varPL / (pL * pL) - (2 * covWL) / (pW * pL);
    const se = Math.sqrt(Math.max(varLogWR, 0));
    const zc = normalQuantile(1 - (1 - confLevel) / 2);
    ciLower = winRatio * Math.exp(-zc * se);
    ciUpper = winRatio * Math.exp(zc * se);
  }

  const inputs = {
    n1, n2,
    hierarchy: hierarchy.map(h => `${h.type}:${h.direction}`),
    wins, losses, ties, confLevel,
  };
  return {
    wins, losses, ties, pairs,
    winRatio, winOdds, netBenefit,
    z, pValue,
    ciLower, ciUpper, confLevel,
    n1, n2,
    provenance: buildProvenance({
      method: 'winRatio:analysis',
      seed: 0,
      inputs,
      note: 'Hierarchical win ratio + Finkelstein–Schoenfeld test; deterministic for the same data and hierarchy.',
    }),
  };
}
