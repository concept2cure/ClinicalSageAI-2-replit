/**
 * @fileoverview Real-World Evidence study-execution engine.
 *
 * Executes a comparative cohort study over a REAL connected data source and
 * computes endpoint statistics from real integer counts — never fabricated.
 *
 * Implemented source: FHIR R4 (the tenant's connected EHR via FHIR_BASE_URL).
 * Cohorts are counted with FHIR `_has` reverse-chaining and `_summary=count`
 * (Bundle.total), and comparative statistics (risk ratio, risk difference,
 * 95% CI, two-proportion z-test) are derived analytically from those counts.
 *
 * Licensed vendor sources (Aetion / Flatiron / TriNetX) are recognized but
 * return a "not configured" error until credentials/a license are wired — they
 * never return invented results.
 *
 * Fails loud: when no source is connected it throws RWESourceNotConfiguredError;
 * when cohorts are too small it returns status 'insufficient_data' with null
 * statistics rather than a fabricated effect estimate.
 */

import { createScopedLogger } from '../utils/logger.js';

const log = createScopedLogger('rwe-study');

export type RWEDataSource = 'fhir' | 'aetion' | 'flatiron' | 'trinetx';

export interface RWEStudyRequest {
  dataSource?: RWEDataSource;
  /** Exposure cohort definition: a medication code (e.g. RxNorm). */
  exposureCode: string;
  /** Optional comparator cohort: a medication code. Omit for single-arm. */
  comparatorCode?: string;
  /** Outcome event: a condition code (e.g. ICD-10 / SNOMED). */
  outcomeCode: string;
  demographics?: { gender?: string; ageMin?: number; ageMax?: number };
  /** Minimum patients per cohort to report statistics (default 1). */
  minCohortSize?: number;
  /**
   * Fixed follow-up window (days) per patient. When provided, an incidence
   * rate ratio (a constant-hazard approximation of the hazard ratio) is
   * computed from events and person-time.
   */
  observationDays?: number;
  /**
   * Request propensity-score adjustment. Requires patient-level covariates,
   * fetched from FHIR; when unavailable the adjusted effect is null.
   */
  adjustForCovariates?: boolean;
}

export interface PropensityAdjustedEffect {
  method: string;
  riskExposed: number;
  riskComparator: number;
  riskRatio: number | null;
  riskDifference: number;
  /** Patients with usable covariates that entered the model. */
  modeledPatients: number;
}

export interface TimeToEventEffect {
  method: string;
  incidenceRateRatio: number | null;
  incidenceRateRatioCI: [number, number] | null;
  personTimeExposedDays: number;
  personTimeComparatorDays: number;
}

export interface CohortCount {
  n: number;
  events: number;
  risk: number | null;
}

export interface RWEStatistics {
  method: string;
  riskRatio: number | null;
  riskRatioCI: [number, number] | null;
  riskDifference: number | null;
  pValue: number | null;
}

export interface RWEStudyResult {
  status: 'completed' | 'insufficient_data';
  dataSource: RWEDataSource;
  cohorts: { exposed: CohortCount; comparator?: CohortCount };
  statistics: RWEStatistics | null;
  /** IPTW propensity-adjusted effect; null when covariates are unavailable. */
  propensityAdjusted: PropensityAdjustedEffect | null;
  /** Incidence rate ratio; null unless observationDays was provided. */
  timeToEvent: TimeToEventEffect | null;
  notes: string[];
  provenance: {
    source: string;
    endpoint: string;
    query: RWEStudyRequest;
    executedAt: string;
  };
}

export class RWESourceNotConfiguredError extends Error {
  constructor(public dataSource: RWEDataSource) {
    super(
      dataSource === 'fhir'
        ? 'No FHIR data source is connected (FHIR_BASE_URL not set).'
        : `Real-world data source "${dataSource}" is not configured. It requires licensed credentials.`
    );
    this.name = 'RWESourceNotConfiguredError';
  }
}

const FHIR_TIMEOUT_MS = 15000;

// ─── Statistics (computed only from real counts; null where undefined) ──────

/** Standard normal CDF via the Abramowitz-Stegun erf approximation. */
function normalCdf(z: number): number {
  const t = 1 / (1 + 0.2316419 * Math.abs(z));
  const d = 0.3989422804014327 * Math.exp(-(z * z) / 2);
  const p =
    d * t * (0.31938153 + t * (-0.356563782 + t * (1.781477937 + t * (-1.821255978 + t * 1.330274429))));
  return z > 0 ? 1 - p : p;
}

export function comparativeStatistics(
  e1: number,
  n1: number,
  e2: number,
  n2: number
): RWEStatistics {
  const risk1 = n1 > 0 ? e1 / n1 : null;
  const risk2 = n2 > 0 ? e2 / n2 : null;

  let riskRatio: number | null = null;
  let riskRatioCI: [number, number] | null = null;
  let riskDifference: number | null = null;
  let pValue: number | null = null;

  if (risk1 !== null && risk2 !== null) {
    riskDifference = risk1 - risk2;
    if (risk2 > 0) riskRatio = risk1 / risk2;

    // Risk-ratio CI requires non-zero event counts in both arms.
    if (riskRatio !== null && e1 > 0 && e2 > 0) {
      const seLnRR = Math.sqrt(1 / e1 - 1 / n1 + 1 / e2 - 1 / n2);
      const lnRR = Math.log(riskRatio);
      riskRatioCI = [Math.exp(lnRR - 1.96 * seLnRR), Math.exp(lnRR + 1.96 * seLnRR)];
    }

    // Two-proportion z-test for the risk difference.
    const pPool = (e1 + e2) / (n1 + n2);
    const seDiff = Math.sqrt(pPool * (1 - pPool) * (1 / n1 + 1 / n2));
    if (seDiff > 0) {
      const z = (risk1 - risk2) / seDiff;
      pValue = 2 * (1 - normalCdf(Math.abs(z)));
    }
  }

  return { method: 'two-proportion z-test', riskRatio, riskRatioCI, riskDifference, pValue };
}

function dot(a: number[], b: number[]): number {
  let s = 0;
  for (let i = 0; i < a.length; i++) s += a[i] * b[i];
  return s;
}

/** Solve Ax = b via Gaussian elimination with partial pivoting. null if singular. */
function solveLinearSystem(A: number[][], b: number[]): number[] | null {
  const n = b.length;
  const M = A.map((row, i) => [...row, b[i]]);
  for (let col = 0; col < n; col++) {
    let pivot = col;
    for (let r = col + 1; r < n; r++) if (Math.abs(M[r][col]) > Math.abs(M[pivot][col])) pivot = r;
    if (Math.abs(M[pivot][col]) < 1e-12) return null;
    [M[col], M[pivot]] = [M[pivot], M[col]];
    for (let r = 0; r < n; r++) {
      if (r === col) continue;
      const factor = M[r][col] / M[col][col];
      for (let c = col; c <= n; c++) M[r][c] -= factor * M[col][c];
    }
  }
  return M.map((row, i) => row[n] / row[i]);
}

/**
 * Logistic regression via IRLS (Newton-Raphson) with light ridge
 * regularization for numerical stability. X includes the intercept column.
 * Returns coefficients, or null when the system can't be solved.
 */
export function logisticRegression(X: number[][], y: number[], iterations = 25): number[] | null {
  const n = X.length;
  if (n === 0) return null;
  const p = X[0].length;
  const ridge = 1e-4;
  const beta = new Array(p).fill(0);

  for (let iter = 0; iter < iterations; iter++) {
    const grad = new Array(p).fill(0);
    const H = Array.from({ length: p }, () => new Array(p).fill(0));
    for (let i = 0; i < n; i++) {
      const mu = 1 / (1 + Math.exp(-dot(beta, X[i])));
      const w = Math.max(mu * (1 - mu), 1e-6);
      for (let j = 0; j < p; j++) {
        grad[j] += (y[i] - mu) * X[i][j];
        for (let k = 0; k < p; k++) H[j][k] += w * X[i][j] * X[i][k];
      }
    }
    for (let j = 0; j < p; j++) H[j][j] += ridge;
    const delta = solveLinearSystem(H, grad);
    if (!delta) return beta;
    let maxStep = 0;
    for (let j = 0; j < p; j++) {
      beta[j] += delta[j];
      maxStep = Math.max(maxStep, Math.abs(delta[j]));
    }
    if (maxStep < 1e-6) break;
  }
  return beta;
}

export interface PatientRecord {
  exposed: boolean;
  outcome: boolean;
  /** numeric covariates (e.g. [ageYears, genderMale]) */
  covariates: number[];
}

/**
 * Propensity-score adjusted effect via IPTW: a logistic propensity model over
 * the covariates weights each patient by the inverse probability of their
 * observed treatment, then risks are compared on the weighted pseudo-population.
 * Returns null when the model can't be fit or an arm has no weight.
 */
export function propensityAdjustedEffect(patients: PatientRecord[]): PropensityAdjustedEffect | null {
  const usable = patients.filter(p => p.covariates.every(c => Number.isFinite(c)));
  if (usable.length < 2) return null;
  const X = usable.map(p => [1, ...p.covariates]);
  const y = usable.map(p => (p.exposed ? 1 : 0));
  const beta = logisticRegression(X, y);
  if (!beta) return null;

  let wOutExp = 0;
  let wExp = 0;
  let wOutComp = 0;
  let wComp = 0;
  for (let i = 0; i < usable.length; i++) {
    const ps = 1 / (1 + Math.exp(-dot(beta, X[i])));
    const psClamped = Math.min(0.99, Math.max(0.01, ps));
    if (usable[i].exposed) {
      const w = 1 / psClamped;
      wExp += w;
      if (usable[i].outcome) wOutExp += w;
    } else {
      const w = 1 / (1 - psClamped);
      wComp += w;
      if (usable[i].outcome) wOutComp += w;
    }
  }
  if (wExp === 0 || wComp === 0) return null;
  const riskExposed = wOutExp / wExp;
  const riskComparator = wOutComp / wComp;
  return {
    method: 'IPTW (logistic propensity)',
    riskExposed,
    riskComparator,
    riskRatio: riskComparator > 0 ? riskExposed / riskComparator : null,
    riskDifference: riskExposed - riskComparator,
    modeledPatients: usable.length,
  };
}

/**
 * Incidence rate ratio (events per person-time) with a 95% CI from the
 * log-IRR standard error. Approximates the hazard ratio under a constant-hazard
 * assumption. Returns nulls when person-time or events don't support it.
 */
export function incidenceRateRatio(
  eExp: number,
  personTimeExp: number,
  eComp: number,
  personTimeComp: number
): TimeToEventEffect {
  let irr: number | null = null;
  let ci: [number, number] | null = null;
  if (personTimeExp > 0 && personTimeComp > 0) {
    const rateExp = eExp / personTimeExp;
    const rateComp = eComp / personTimeComp;
    if (rateComp > 0) irr = rateExp / rateComp;
    if (irr !== null && eExp > 0 && eComp > 0) {
      const seLog = Math.sqrt(1 / eExp + 1 / eComp);
      const lnIRR = Math.log(irr);
      ci = [Math.exp(lnIRR - 1.96 * seLog), Math.exp(lnIRR + 1.96 * seLog)];
    }
  }
  return {
    method: 'incidence rate ratio (constant-hazard approximation of hazard ratio)',
    incidenceRateRatio: irr,
    incidenceRateRatioCI: ci,
    personTimeExposedDays: personTimeExp,
    personTimeComparatorDays: personTimeComp,
  };
}

// ─── FHIR cohort counting ───────────────────────────────────────────────────

function demographicParams(demographics?: RWEStudyRequest['demographics']): Record<string, string> {
  const params: Record<string, string> = {};
  if (!demographics) return params;
  if (demographics.gender) params.gender = demographics.gender;
  const now = new Date();
  if (typeof demographics.ageMin === 'number') {
    const d = new Date(now.getFullYear() - demographics.ageMin, now.getMonth(), now.getDate());
    params.birthdate = `le${d.toISOString().slice(0, 10)}`;
  }
  if (typeof demographics.ageMax === 'number') {
    const d = new Date(now.getFullYear() - demographics.ageMax - 1, now.getMonth(), now.getDate());
    // Combine with any existing birthdate filter by using a second key form.
    params['birthdate:ge'] = `${d.toISOString().slice(0, 10)}`;
  }
  return params;
}

async function fhirPatientCount(params: Record<string, string>): Promise<number> {
  const baseUrl = process.env.FHIR_BASE_URL;
  if (!baseUrl) throw new RWESourceNotConfiguredError('fhir');

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), FHIR_TIMEOUT_MS);
  try {
    const qs = new URLSearchParams({ ...params, _summary: 'count' }).toString();
    const res = await fetch(`${baseUrl}/Patient?${qs}`, {
      signal: controller.signal,
      headers: {
        Accept: 'application/fhir+json',
        Authorization: `Bearer ${process.env.FHIR_ACCESS_TOKEN || ''}`,
      },
    });
    if (!res.ok) throw new Error(`FHIR responded ${res.status}`);
    const bundle = (await res.json()) as any;
    if (typeof bundle.total !== 'number') {
      throw new Error('FHIR Bundle did not include an accurate total');
    }
    return bundle.total;
  } finally {
    clearTimeout(timer);
  }
}

/** Count a cohort (exposure) and its outcome events via FHIR reverse-chaining. */
async function countCohort(
  exposureCode: string,
  outcomeCode: string,
  demographics?: RWEStudyRequest['demographics']
): Promise<{ n: number; events: number }> {
  const base = { '_has:MedicationRequest:subject:code': exposureCode, ...demographicParams(demographics) };
  const n = await fhirPatientCount(base);
  const events = await fhirPatientCount({ ...base, '_has:Condition:subject:code': outcomeCode });
  return { n, events };
}

function toCohortCount(c: { n: number; events: number }): CohortCount {
  return { n: c.n, events: c.events, risk: c.n > 0 ? c.events / c.n : null };
}

/** Fetch Patient resources matching the params (id, birthDate, gender). */
async function fhirFetchPatients(params: Record<string, string>, limit = 500): Promise<any[]> {
  const baseUrl = process.env.FHIR_BASE_URL;
  if (!baseUrl) return [];
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), FHIR_TIMEOUT_MS);
  try {
    const qs = new URLSearchParams({ ...params, _elements: 'birthDate,gender', _count: String(limit) }).toString();
    const res = await fetch(`${baseUrl}/Patient?${qs}`, {
      signal: controller.signal,
      headers: {
        Accept: 'application/fhir+json',
        Authorization: `Bearer ${process.env.FHIR_ACCESS_TOKEN || ''}`,
      },
    });
    if (!res.ok) throw new Error(`FHIR responded ${res.status}`);
    const bundle = (await res.json()) as any;
    return (bundle.entry || []).map((e: any) => e.resource).filter(Boolean);
  } finally {
    clearTimeout(timer);
  }
}

function ageFromBirthDate(birthDate?: string): number {
  if (!birthDate) return NaN;
  const born = new Date(birthDate);
  if (Number.isNaN(born.getTime())) return NaN;
  return (Date.now() - born.getTime()) / (365.25 * 24 * 3600 * 1000);
}

/**
 * Build patient-level records (covariates + outcome) for the two cohorts, for
 * propensity adjustment. Fail-soft: returns null when patient-level data can't
 * be assembled, so the caller reports a null adjusted effect rather than guess.
 */
async function buildPatientRecords(
  exposureCode: string,
  comparatorCode: string,
  outcomeCode: string,
  demographics?: RWEStudyRequest['demographics']
): Promise<PatientRecord[] | null> {
  try {
    const demo = demographicParams(demographics);
    const expBase = { '_has:MedicationRequest:subject:code': exposureCode, ...demo };
    const cmpBase = { '_has:MedicationRequest:subject:code': comparatorCode, ...demo };

    const [exposed, exposedOutcome, comparator, comparatorOutcome] = await Promise.all([
      fhirFetchPatients(expBase),
      fhirFetchPatients({ ...expBase, '_has:Condition:subject:code': outcomeCode }),
      fhirFetchPatients(cmpBase),
      fhirFetchPatients({ ...cmpBase, '_has:Condition:subject:code': outcomeCode }),
    ]);
    if (exposed.length === 0 || comparator.length === 0) return null;

    const expOutcomeIds = new Set(exposedOutcome.map((p: any) => p.id));
    const cmpOutcomeIds = new Set(comparatorOutcome.map((p: any) => p.id));

    const toRecord = (p: any, exposedArm: boolean, outcomeIds: Set<string>): PatientRecord => ({
      exposed: exposedArm,
      outcome: outcomeIds.has(p.id),
      covariates: [ageFromBirthDate(p.birthDate), p.gender === 'male' ? 1 : 0],
    });

    return [
      ...exposed.map((p: any) => toRecord(p, true, expOutcomeIds)),
      ...comparator.map((p: any) => toRecord(p, false, cmpOutcomeIds)),
    ];
  } catch {
    return null;
  }
}

// ─── Orchestration ───────────────────────────────────────────────────────────

export async function runRWEStudy(request: RWEStudyRequest): Promise<RWEStudyResult> {
  const dataSource: RWEDataSource = request.dataSource || 'fhir';
  if (dataSource !== 'fhir') {
    // Vendor source recognized but not licensed/wired — fail loud, never invent.
    throw new RWESourceNotConfiguredError(dataSource);
  }
  if (!process.env.FHIR_BASE_URL) {
    throw new RWESourceNotConfiguredError('fhir');
  }

  const minCohortSize = request.minCohortSize ?? 1;
  const notes: string[] = [];

  const exposedRaw = await countCohort(request.exposureCode, request.outcomeCode, request.demographics);
  const exposed = toCohortCount(exposedRaw);

  let comparator: CohortCount | undefined;
  let statistics: RWEStatistics | null = null;
  let propensityAdjusted: PropensityAdjustedEffect | null = null;
  let timeToEvent: TimeToEventEffect | null = null;

  if (request.comparatorCode) {
    const comparatorRaw = await countCohort(
      request.comparatorCode,
      request.outcomeCode,
      request.demographics
    );
    comparator = toCohortCount(comparatorRaw);

    if (exposed.n >= minCohortSize && comparator.n >= minCohortSize) {
      statistics = comparativeStatistics(
        exposedRaw.events,
        exposedRaw.n,
        comparatorRaw.events,
        comparatorRaw.n
      );

      // Time-to-event: incidence rate ratio over a fixed follow-up window.
      if (typeof request.observationDays === 'number' && request.observationDays > 0) {
        timeToEvent = incidenceRateRatio(
          exposedRaw.events,
          exposedRaw.n * request.observationDays,
          comparatorRaw.events,
          comparatorRaw.n * request.observationDays
        );
      }

      // Propensity adjustment: requires patient-level covariates (fail-soft).
      if (request.adjustForCovariates) {
        const records = await buildPatientRecords(
          request.exposureCode,
          request.comparatorCode,
          request.outcomeCode,
          request.demographics
        );
        if (records) {
          propensityAdjusted = propensityAdjustedEffect(records);
          if (!propensityAdjusted) {
            notes.push('Propensity model could not be fit; adjusted effect omitted.');
          }
        } else {
          notes.push('Patient-level covariates unavailable; propensity adjustment omitted.');
        }
      }
    } else {
      notes.push(
        `Cohort smaller than the minimum of ${minCohortSize} (exposed n=${exposed.n}, comparator n=${comparator.n}); comparative statistics suppressed.`
      );
    }
  } else {
    notes.push('No comparator cohort supplied; reporting single-arm event rate only.');
  }

  const status: RWEStudyResult['status'] =
    exposed.n >= minCohortSize ? 'completed' : 'insufficient_data';
  if (status === 'insufficient_data') {
    notes.push(`Exposed cohort (n=${exposed.n}) is below the minimum of ${minCohortSize}.`);
  }

  log.info('RWE study executed', {
    dataSource,
    exposedN: exposed.n,
    comparatorN: comparator?.n,
    status,
  });

  return {
    status,
    dataSource,
    cohorts: { exposed, comparator },
    statistics,
    propensityAdjusted,
    timeToEvent,
    notes,
    provenance: {
      source: 'FHIR R4',
      endpoint: process.env.FHIR_BASE_URL,
      query: request,
      executedAt: new Date().toISOString(),
    },
  };
}
