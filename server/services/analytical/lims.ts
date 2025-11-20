import pool from '../../db/database.js';

export type LinearityPoint = { level_no: number; nominal: number; response: number };
export type AccuracyPoint = {
  level_label: 'LOW' | 'MID' | 'HIGH';
  level_pct: number;
  recovery_pct: number;
};
export type PrecisionRun = { result: number };

export async function getLinearity(methodId: string) {
  const result = await pool.query(
    `
    select level_no, nominal::float, response::float
    from analytical_linearity_points
    where method_id=$1
    order by level_no asc, replicate asc`,
    [methodId]
  );
  return result.rows as LinearityPoint[];
}

export async function getAccuracy(methodId: string) {
  const result = await pool.query(
    `
    select level_label, level_pct::float, recovery_pct::float
    from analytical_accuracy_points
    where method_id=$1
    order by level_label asc, replicate asc`,
    [methodId]
  );
  return result.rows as AccuracyPoint[];
}

export async function getPrecision(methodId: string) {
  const result = await pool.query(
    `
    select result::float from analytical_precision_runs
    where method_id=$1 order by run_no asc`,
    [methodId]
  );
  return result.rows.map((r: any) => r.result);
}

export async function getSpecThreshold(methodId: string) {
  const result = await pool.query(
    `
    select spec_value::float, spec_unit from analytical_spec_thresholds
    where method_id=$1 limit 1`,
    [methodId]
  );
  return result.rows[0] || { spec_value: null, spec_unit: '' };
}

// ---------- Stats helpers ----------
export function mean(a: number[]) {
  return a.reduce((s, x) => s + x, 0) / a.length;
}
export function sd(a: number[]) {
  const m = mean(a);
  return Math.sqrt(a.reduce((s, x) => s + (x - m) * (x - m), 0) / (a.length - 1));
}
export function rsd(a: number[]) {
  const m = mean(a);
  return m === 0 ? 0 : (sd(a) / m) * 100;
}

// Simple linear regression y = a + b x (x=nominal, y=response)
export function regress(x: number[], y: number[]) {
  const n = x.length;
  const sx = x.reduce((s, v) => s + v, 0);
  const sy = y.reduce((s, v) => s + v, 0);
  const sxx = x.reduce((s, v) => s + v * v, 0);
  const sxy = x.reduce((s, v, i) => s + v * y[i], 0);
  const syy = y.reduce((s, v) => s + v * v, 0);
  const denom = n * sxx - sx * sx;
  const b = denom === 0 ? 0 : (n * sxy - sx * sy) / denom; // slope
  const a = (sy - b * sx) / n; // intercept
  const yhat = x.map(v => a + b * v);
  const ssr = yhat.reduce((s, v, i) => s + (v - mean(y)) ** 2, 0); // regression sum
  const sse = y.reduce((s, v, i) => s + (v - yhat[i]) ** 2, 0); // residual
  const r2 = ssr / (ssr + sse);
  return { a, b, r2, yhat, sse };
}

// Lack-of-fit (needs replicates per x). Uses pure error from replicate variance.
export function lackOfFitP(x: number[], y: number[], replicates: number[]) {
  // group by x value: assume x sorted with replicates grouped
  const groups: Record<string, number[]> = {};
  x.forEach((xi, i) => {
    const k = String(xi);
    (groups[k] ||= []).push(y[i]);
  });
  const k = Object.keys(groups).length;
  if (k < 3) return null;

  const all = regress(x, y);
  const yhat = x.map(v => all.a + all.b * v);
  const SSPE = Object.values(groups).reduce((s, vals) => {
    const m = mean(vals);
    return s + vals.reduce((ss, v) => ss + (v - m) * (v - m), 0);
  }, 0);
  const dfPE = y.length - k;

  const SSLOF = y.reduce((s, yi, i) => s + (yhat[i] - mean(groups[String(x[i])])) ** 2, 0);
  const dfLOF = k - 2;

  if (dfPE <= 0 || dfLOF <= 0) return null;

  const MSLOF = SSLOF / dfLOF;
  const MSPE = SSPE / dfPE;
  const F = MSLOF / MSPE;

  // p-value via F-dist CDF is complex; approximate using survival function for common ranges:
  const p = approxFpValue(F, dfLOF, dfPE);
  return { F, p, dfLOF, dfPE };
}

// quick-and-light approximation (ok for dashboard; not for final report)
function approxFpValue(F: number, d1: number, d2: number) {
  // From relation to Beta incomplete (very rough): p ≈ 1 / (1 + 0.5*F)^(d2/2)
  const p = Math.pow(1 + 0.5 * F, -d2 / 2);
  return Math.max(0, Math.min(1, p));
}

// Build token map for {{…}} placeholders
export function buildTokenMapFromData(params: {
  linearity: LinearityPoint[];
  accuracy: AccuracyPoint[];
  precision: number[];
  specValue: number | null;
  slope: number;
  intercept: number;
  r2: number;
  lof?: { p: number } | null;
}) {
  const map: Record<string, string> = {};

  // ----- linearity (take first 5 levels sorted) -----
  const lvls = Array.from(new Set(params.linearity.map(p => p.level_no))).sort((a, b) => a - b);
  const byLvl = lvls.map(lv => params.linearity.filter(p => p.level_no === lv));

  byLvl.slice(0, 5).forEach((points, i) => {
    const L = i + 1;
    const nominal = mean(points.map(p => p.nominal));
    const respMean = mean(points.map(p => p.response));
    const backcalc = (respMean - params.intercept) / params.slope;
    const bias = ((backcalc - nominal) / nominal) * 100;
    map[`LIN.L${L}.NOM`] = nominal.toFixed(4);
    map[`LIN.L${L}.RESP`] = respMean.toFixed(2);
    map[`LIN.L${L}.BIAS`] = bias.toFixed(2);
  });

  map[`LIN.SLOPE`] = params.slope.toPrecision(6);
  map[`LIN.INTERCEPT`] = params.intercept.toPrecision(6);
  map[`LIN.R2`] = params.r2.toFixed(5);
  map[`LIN.LOF_P`] = params.lof ? params.lof.p.toExponential(2) : 'N/A';

  // ----- accuracy (3x3) -----
  const accGroup = (lbl: 'LOW' | 'MID' | 'HIGH') =>
    params.accuracy.filter(a => a.level_label === lbl).map(a => a.recovery_pct);
  const fillAcc = (lbl: 'LOW' | 'MID' | 'HIGH') => {
    const arr = accGroup(lbl);
    const m = arr.length ? mean(arr) : NaN;
    const bias = isFinite(m) ? m - 100 : NaN;
    map[`ACC.${lbl}.LVL`] = (
      params.accuracy.find(a => a.level_label === lbl)?.level_pct ??
      (lbl === 'LOW' ? 80 : lbl === 'MID' ? 100 : 120)
    ).toString();
    arr.forEach((v, idx) => (map[`ACC.${lbl}.R${idx + 1}`] = v.toFixed(2)));
    map[`ACC.${lbl}.MEAN`] = isFinite(m) ? m.toFixed(2) : '';
    map[`ACC.${lbl}.BIAS`] = isFinite(bias) ? bias.toFixed(2) : '';
    map[`ACC.${lbl}.PASS`] = isFinite(m) && m >= 98 && m <= 102 ? 'Yes' : 'No/Justify';
  };
  fillAcc('LOW');
  fillAcc('MID');
  fillAcc('HIGH');

  // ----- precision repeatability (n=6) -----
  const pr = params.precision;
  if (pr.length) {
    map[`PREC.REP1`] = (pr[0] ?? '').toString();
    map[`PREC.REP2`] = (pr[1] ?? '').toString();
    map[`PREC.REP3`] = (pr[2] ?? '').toString();
    map[`PREC.REP4`] = (pr[3] ?? '').toString();
    map[`PREC.REP5`] = (pr[4] ?? '').toString();
    map[`PREC.REP6`] = (pr[5] ?? '').toString();
    const m = mean(pr),
      s = sd(pr),
      r = rsd(pr);
    map[`PREC.MEAN`] = m.toFixed(2);
    map[`PREC.SD`] = s.toFixed(3);
    map[`PREC.RSD`] = r.toFixed(2);
  }

  // ----- LOD/LOQ via σ/slope from lowest level replicates -----
  const lowest = byLvl[0] || [];
  const sigma = lowest.length > 1 ? sd(lowest.map(p => p.response)) : NaN;
  if (isFinite(sigma) && isFinite(params.slope) && params.slope !== 0) {
    const LOD = (3.3 * sigma) / params.slope;
    const LOQ = (10 * sigma) / params.slope;
    map[`LOD.APPROACH`] = 'σ/slope';
    map[`LOD.VALUE`] = LOD.toPrecision(4);
    map[`LOD.UNIT`] = 'same as nominal';
    map[`LOD.PASS`] = 'TBD';

    map[`LOQ.APPROACH`] = 'σ/slope';
    map[`LOQ.VALUE`] = LOQ.toPrecision(4);
    map[`LOQ.UNIT`] = 'same as nominal';
    map[`LOQ.PASS`] = 'TBD';
    if (params.specValue != null) {
      const pass = LOQ <= 0.5 * params.specValue;
      map[`LOQ.VS_SPEC`] = pass ? '≤ 50% of spec: Yes' : 'Exceeds 50% of spec: No/Justify';
    }
  }

  return map;
}

// Replace {{TOKEN}} with values from map
export function fillTokens(md: string, map: Record<string, string>) {
  return md.replace(/{{([A-Z0-9._]+)}}/g, (_, key) => map[key] ?? `{{${key}}}`);
}
