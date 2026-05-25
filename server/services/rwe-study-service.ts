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
    notes,
    provenance: {
      source: 'FHIR R4',
      endpoint: process.env.FHIR_BASE_URL,
      query: request,
      executedAt: new Date().toISOString(),
    },
  };
}
