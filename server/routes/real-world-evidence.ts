/**
 * =============================================================================
 * Real-World Evidence (RWE) Integration Service
 * =============================================================================
 * Pull from EHR systems, registries, and real-world data sources for
 * post-market submissions and label expansion studies:
 *
 * Data Sources:
 *   - FHIR R4 (EHR integration via HL7 FHIR endpoints)
 *   - ClinicalTrials.gov (trial metadata & results)
 *   - FDA FAERS (adverse event reports)
 *   - FDA Drug Labels (DailyMed)
 *   - Disease registries (SEER, CDC WONDER, NHANES)
 *   - Claims databases (Optum/Truven connector — catalogued, status 'pending';
 *     no claims data is served until a real connector is configured)
 *
 * Analytics IMPLEMENTED here:
 *   - Signal detection — PRR / ROR / EBGM disproportionality over a FAERS 2x2
 *     table, computed by pharmacovigilance-knowledge.ts::detectSafetySignal
 *   - Descriptive FAERS counts: reactions, indications, seriousness, age band,
 *     sex, report year — all over the page retrieved, never extrapolated
 *
 * Analytics NOT implemented (2026-09-10). These were listed above as though
 * they were features, and /health reported each as `true`. They exist in this
 * file only as optional REQUEST fields, so a caller could ask for them and be
 * answered as if they had run:
 *   - Propensity score matching for observational comparisons
 *   - Kaplan-Meier survival analysis
 *   - External control arms (vs. historical comparators)
 *   - Incidence/prevalence rate calculations
 *
 * Compliance:
 *   - HIPAA de-identification verification
 *   - Data use agreement tracking
 *   - Provenance chain for all RWE data
 * =============================================================================
 */

import { Router, Request, Response } from 'express';
import { z } from 'zod';
import { runRWEStudy, RWESourceNotConfiguredError } from '../services/rwe-study-service';
import {
  detectSafetySignal,
  type DisproportionalityMeasure,
} from '../services/pharmacovigilance/pharmacovigilance-knowledge';

// ---------------------------------------------------------------------------
// TYPES
// ---------------------------------------------------------------------------

export type RWESourceType =
  | 'ehr_fhir' // Electronic Health Records via FHIR
  | 'claims_database' // Insurance claims
  | 'disease_registry' // Disease-specific registries
  | 'clinical_trial' // ClinicalTrials.gov
  | 'adverse_event' // FDA FAERS / EudraVigilance
  | 'drug_label' // DailyMed / SmPC
  | 'mortality_data' // CDC WONDER / vital statistics
  | 'patient_survey' // PRO/ePRO data
  | 'biobank' // Genomic/biospecimen repositories
  | 'custom';

export interface RWEDataSource {
  id: string;
  name: string;
  sourceType: RWESourceType;
  endpoint?: string;
  description: string;
  coverage: {
    patientCount?: number;
    dateRange?: { start: string; end: string };
    geographicRegion?: string[];
    therapeuticAreas?: string[];
  };
  dataElements: string[];
  lastSync?: Date;
  status: 'active' | 'pending' | 'disconnected' | 'error';
  complianceStatus: {
    hipaaDeidentified: boolean;
    dataUseAgreement: boolean;
    irbApproved: boolean;
    gdprCompliant?: boolean;
  };
}

export interface FHIRPatient {
  resourceType: 'Patient';
  id: string;
  gender?: string;
  birthDate?: string;
  deceasedBoolean?: boolean;
  conditions: FHIRCondition[];
  medications: FHIRMedication[];
  observations: FHIRObservation[];
  encounters: FHIREncounter[];
}

export interface FHIRCondition {
  code: string;
  display: string;
  system: string; // SNOMED CT, ICD-10
  onsetDateTime?: string;
  abatementDateTime?: string;
  clinicalStatus: string;
}

export interface FHIRMedication {
  code: string;
  display: string;
  system: string; // RxNorm, NDC
  dosage?: string;
  startDate?: string;
  endDate?: string;
}

export interface FHIRObservation {
  code: string;
  display: string;
  value: string | number;
  unit?: string;
  effectiveDateTime: string;
  category: string;
}

export interface FHIREncounter {
  id: string;
  type: string;
  startDate: string;
  endDate?: string;
  reasonCode?: string;
}

export interface RWEQuery {
  studyType:
    | 'retrospective_cohort'
    | 'case_control'
    | 'cross_sectional'
    | 'external_control_arm'
    | 'signal_detection';
  indication: string;
  drugOfInterest: string;
  comparator?: string;
  outcomes: string[];
  dataSources: string[]; // Source IDs to query
  cohortCriteria: {
    inclusionCriteria: string[];
    exclusionCriteria: string[];
    indexDateDefinition: string;
    followUpPeriod: string;
    minAge?: number;
    maxAge?: number;
    gender?: string;
  };
  analysisPlan: {
    primaryEndpoint: string;
    secondaryEndpoints?: string[];
    covariates?: string[];
    // NOT IMPLEMENTED (verified 2026-09-10). Nothing reads either field. They
    // are safe only because `rweStudySchema` — the Zod schema POST /query
    // actually validates against — does not accept them, so a caller asking for
    // propensity matching is rejected at the boundary rather than answered as
    // though it ran. Do not add them to that schema without implementing them.
    propensityScoreMethod?: 'matching' | 'stratification' | 'weighting' | 'none';
    survivalAnalysis?: boolean;
    subgroupAnalyses?: string[];
  };
}

export interface RWEResult {
  id: string;
  queryId: string;
  studyType: string;
  cohort: {
    totalPatients: number;
    treatmentGroup: number;
    controlGroup: number;
    demographics: {
      meanAge: number;
      genderDistribution: Record<string, number>;
      raceDistribution?: Record<string, number>;
    };
  };
  endpoints: EndpointResult[];
  safetySignals: SafetySignal[];
  propensityScore?: {
    method: string;
    covariatesBalanced: number;
    standardizedMeanDifference: number;
    cStatistic: number;
  };
  provenance: {
    dataSources: string[];
    queryTimestamp: Date;
    deidentificationMethod: string;
    dataLag: string;
  };
  regulatoryRelevance: {
    applicableSubmissionTypes: string[];
    levelOfEvidence: string;
    limitations: string[];
    fda_rwe_framework_alignment: boolean;
  };
}

export interface EndpointResult {
  name: string;
  type: 'efficacy' | 'safety' | 'utilization' | 'cost';
  value: number;
  confidence_interval: [number, number];
  p_value: number;
  hazard_ratio?: number;
  odds_ratio?: number;
  relative_risk?: number;
  number_needed_to_treat?: number;
  statistical_significance: boolean;
}

/**
 * A disproportionality result for ONE drug-event pair, carrying the 2x2 table
 * it was computed from.
 *
 * ── 2026-09-10: this type replaces an invented one ───────────────────────────
 * It previously declared `reportingOddsRatio`, `proportionalReportingRatio`,
 * `ic025` and `confidence`, and queryFAERS filled them in with
 *   reportingOddsRatio:        1.0 + percentage / 10
 *   proportionalReportingRatio: 1.0 + percentage / 15
 *   ic025:                      percentage > 5 ? 0.5 : -0.5
 *   confidence:                 0.7
 * where `percentage` was the term's share of the <=100 reports just retrieved.
 * Those are linear rescalings of a within-sample frequency. A ROR, a PRR and an
 * IC025 are all computed from a 2x2 contingency table against the whole FAERS
 * background, and none of the three background cells was ever fetched — so the
 * numbers could not have been those statistics under any input. The
 * /signal-detection route then labelled them 'Multi-item Gamma Poisson Shrinker
 * (MGPS)', which is the FDA's Bayesian data-mining algorithm and was not
 * implemented anywhere in this file.
 *
 * The measures now come from detectSafetySignal() in
 * server/services/pharmacovigilance/pharmacovigilance-knowledge.ts, which was
 * already in the repository, already carries the Evans 2001 / Rothman /
 * DuMouchel criteria with citations, and is already covered by
 * server/services/compliance/__tests__/pv-signal-detection.test.ts. This route
 * had grown a second, fabricated implementation of a capability the platform
 * already owned.
 */
export interface SafetySignal {
  adverseEvent: string;
  /** The 2x2 table the measures were computed from, so a reviewer can re-derive them. */
  contingencyTable: { a: number; b: number; c: number; d: number };
  /** PRR / ROR / EBGM as returned by the pharmacovigilance engine, each with its citation. */
  measures: DisproportionalityMeasure[];
  /** True only when a measure crossed its own published signalling threshold. */
  signalOfDisproportionateReporting: boolean;
  rationale: string[];
  /** Low-count and zero-cell caveats. Never suppressed — they qualify the estimate. */
  warnings: string[];
  citations: string[];
  caseCount: number;
}

export interface FAERSQuery {
  drugName: string;
  reactionTerm?: string;
  dateRange?: { start: string; end: string };
  seriousOnly?: boolean;
  ageRange?: { min: number; max: number };
  limit?: number;
}

export interface FAERSResult {
  /** Reports matching the search across all of FAERS, from openFDA's meta.results.total. */
  totalReports: number;
  /**
   * How many reports this response actually read. Every count below is over
   * THIS many reports, not over `totalReports` — openFDA returns at most a page
   * and the two differ by orders of magnitude on a common drug. The field
   * exists so a consumer cannot mistake a page for a census.
   */
  reportsAnalyzed: number;
  seriousReports: number;
  fatalReports: number;
  topReactions: Array<{ term: string; count: number; percentage: number }>;
  topIndications: Array<{ term: string; count: number }>;
  demographicDistribution: {
    ageGroups: Record<string, number>;
    genderDistribution: Record<string, number>;
  };
  reportsByYear: Record<string, number>;
}

/**
 * Raised when FAERS could not be consulted — transport failure, a non-OK
 * response from openFDA, or an unparseable body.
 *
 * It exists so that "openFDA was queried and matched nothing" and "openFDA was
 * not reached" stop being the same value. queryFAERS used to answer both with
 * `{ totalReports: 0, topReactions: [], signalDetection: [] }`, and
 * /signal-detection turned that into the sentence "No significant safety
 * signals detected" — an all-clear on a pharmacovigilance surface, produced by
 * an outage. Routes translate this to 503; they must never absorb it.
 */
export class FAERSUnavailableError extends Error {
  constructor(readonly detail: string) {
    super(`FAERS could not be consulted: ${detail}`);
    this.name = 'FAERSUnavailableError';
  }
}

// ---------------------------------------------------------------------------
// DATA SOURCE REGISTRY
// ---------------------------------------------------------------------------

const DATA_SOURCES: RWEDataSource[] = [
  {
    id: 'fhir-ehr-1',
    name: 'Enterprise FHIR EHR Connector',
    sourceType: 'ehr_fhir',
    endpoint: process.env.FHIR_BASE_URL || 'https://fhir.example.com/r4',
    description: 'HL7 FHIR R4 interface to hospital EHR system for longitudinal patient data',
    coverage: {
      patientCount: 2_500_000,
      dateRange: { start: '2015-01-01', end: '2026-02-01' },
      geographicRegion: ['US'],
      therapeuticAreas: ['oncology', 'cardiology', 'neurology'],
    },
    dataElements: [
      'Patient',
      'Condition',
      'MedicationRequest',
      'Observation',
      'Encounter',
      'Procedure',
      'DiagnosticReport',
    ],
    status: process.env.FHIR_BASE_URL ? 'active' : 'pending',
    complianceStatus: { hipaaDeidentified: true, dataUseAgreement: true, irbApproved: true },
  },
  {
    id: 'clinicaltrials-gov',
    name: 'ClinicalTrials.gov API',
    sourceType: 'clinical_trial',
    endpoint: 'https://clinicaltrials.gov/api/v2',
    description: 'U.S. NLM registry of clinical studies worldwide',
    coverage: {
      dateRange: { start: '2000-01-01', end: '2026-02-01' },
      geographicRegion: ['Global'],
    },
    dataElements: ['ProtocolSection', 'ResultsSection', 'DerivedSection', 'DocumentSection'],
    status: 'active',
    complianceStatus: { hipaaDeidentified: true, dataUseAgreement: false, irbApproved: false },
  },
  {
    id: 'fda-faers',
    name: 'FDA FAERS (Adverse Event Reporting)',
    sourceType: 'adverse_event',
    endpoint: 'https://api.fda.gov/drug/event.json',
    description: 'FDA Adverse Event Reporting System — spontaneous safety reports',
    coverage: {
      dateRange: { start: '2004-01-01', end: '2026-01-01' },
      geographicRegion: ['US', 'Global'],
    },
    dataElements: ['patient', 'reaction', 'drug', 'seriousness', 'outcome'],
    status: 'active',
    complianceStatus: { hipaaDeidentified: true, dataUseAgreement: false, irbApproved: false },
  },
  {
    id: 'fda-dailymed',
    name: 'DailyMed Drug Labels',
    sourceType: 'drug_label',
    endpoint: 'https://dailymed.nlm.nih.gov/dailymed/services/v2',
    description: 'FDA-approved drug labeling information (SPL format)',
    coverage: { geographicRegion: ['US'] },
    dataElements: [
      'label_sections',
      'indications_usage',
      'warnings',
      'adverse_reactions',
      'clinical_studies',
    ],
    status: 'active',
    complianceStatus: { hipaaDeidentified: true, dataUseAgreement: false, irbApproved: false },
  },
  {
    id: 'seer-registry',
    name: 'SEER Cancer Registry',
    sourceType: 'disease_registry',
    description:
      'NCI Surveillance, Epidemiology, and End Results program (cancer incidence & survival)',
    coverage: {
      patientCount: 12_000_000,
      dateRange: { start: '1975-01-01', end: '2025-12-31' },
      geographicRegion: ['US'],
      therapeuticAreas: ['oncology'],
    },
    dataElements: ['incidence', 'survival', 'mortality', 'staging', 'demographics'],
    status: 'active',
    complianceStatus: { hipaaDeidentified: true, dataUseAgreement: true, irbApproved: true },
  },
  {
    id: 'claims-optum',
    name: 'Claims Database Connector (Optum/Truven Interface)',
    sourceType: 'claims_database',
    description: 'Administrative claims data for healthcare utilization and cost analyses',
    coverage: {
      patientCount: 50_000_000,
      dateRange: { start: '2010-01-01', end: '2025-12-31' },
      geographicRegion: ['US'],
    },
    dataElements: [
      'enrollment',
      'medical_claims',
      'pharmacy_claims',
      'diagnosis_codes',
      'procedure_codes',
    ],
    status: 'pending',
    complianceStatus: { hipaaDeidentified: true, dataUseAgreement: false, irbApproved: false },
  },
];

// ---------------------------------------------------------------------------
// FHIR CLIENT
// ---------------------------------------------------------------------------

/** Raised when the FHIR EHR connector is unreachable or not configured. */
class FHIRUnavailableError extends Error {
  constructor(
    message: string,
    readonly reason: 'not_configured' | 'request_failed',
  ) {
    super(message);
    this.name = 'FHIRUnavailableError';
  }
}

/**
 * Query the configured FHIR R4 endpoint.
 *
 * THROWS on "not configured" and on request failure — it does NOT return `[]`.
 * The empty array is a real-world-evidence ANSWER ("no patients in the EHR
 * match this cohort definition"), and a study author sizes a cohort, an
 * external control arm, or a feasibility assessment off exactly that number.
 * Returning it because `FHIR_BASE_URL` was unset, or because the request blew
 * up, reported a cohort of zero that the EHR never denied — a fabricated
 * epidemiological finding. Callers surface the distinction to the client.
 */
async function queryFHIR(resourceType: string, params: Record<string, string>): Promise<any[]> {
  const baseUrl = process.env.FHIR_BASE_URL;
  if (!baseUrl) {
    throw new FHIRUnavailableError(
      'FHIR_BASE_URL is not configured; no EHR endpoint to query.',
      'not_configured',
    );
  }

  try {
    const queryString = new URLSearchParams(params).toString();
    const response = await fetch(`${baseUrl}/${resourceType}?${queryString}`, {
      headers: {
        Accept: 'application/fhir+json',
        Authorization: `Bearer ${process.env.FHIR_ACCESS_TOKEN || ''}`,
      },
    });
    if (!response.ok) {
      throw new Error(`FHIR endpoint returned ${response.status}`);
    }
    const bundle = (await response.json()) as any;
    return bundle.entry?.map((e: any) => e.resource) || [];
  } catch (err) {
    console.error(`[RWE] FHIR query failed for ${resourceType}:`, err);
    throw new FHIRUnavailableError(
      `FHIR query for ${resourceType} failed: ${err instanceof Error ? err.message : String(err)}`,
      'request_failed',
    );
  }
}

// ---------------------------------------------------------------------------
// FAERS CLIENT
// ---------------------------------------------------------------------------

const FAERS_ENDPOINT = 'https://api.fda.gov/drug/event.json';

/** openFDA rejects these inside a quoted term; strip rather than escape. */
function faersQuote(value: string): string {
  return value.replace(/["\\+&]/g, '');
}

/**
 * Fetch one openFDA page, distinguishing the three outcomes that matter.
 *
 * openFDA answers a search with no matches as **HTTP 404 with
 * `error.code === 'NOT_FOUND'`**, which is a legitimate zero, not a failure.
 * Any other non-OK status, and any unparseable body, is an outage: it becomes a
 * FAERSUnavailableError rather than an empty result set. The previous code
 * checked neither `response.ok` nor the error envelope, so a 404, a 429 rate
 * limit and a 500 all landed on `data.results || []` and were reported as
 * "0 reports" on the SUCCESS path — without even reaching the catch.
 */
async function faersFetch(search: string, limit: number): Promise<any> {
  const url = `${FAERS_ENDPOINT}?search=${encodeURIComponent(search)}&limit=${limit}`;
  // NB: `Response` in this module is express's, not the fetch one — the import
  // at the top shadows the global. Derive the fetch type instead of naming it.
  let response: Awaited<ReturnType<typeof fetch>>;
  try {
    response = await fetch(url);
  } catch (err) {
    throw new FAERSUnavailableError(
      `openFDA request failed: ${err instanceof Error ? err.message : 'unknown transport error'}`
    );
  }

  let data: any;
  try {
    data = await response.json();
  } catch {
    throw new FAERSUnavailableError(
      `openFDA returned a body that is not JSON (HTTP ${response.status})`
    );
  }

  if (!response.ok) {
    if (response.status === 404 && data?.error?.code === 'NOT_FOUND') {
      return { results: [], meta: { results: { total: 0 } } };
    }
    throw new FAERSUnavailableError(
      `openFDA returned HTTP ${response.status}${data?.error?.code ? ` (${data.error.code})` : ''}`
    );
  }
  return data;
}

/** Total reports matching a search, across all of FAERS. Used for the 2x2 table. */
async function faersTotal(search: string): Promise<number> {
  const data = await faersFetch(search, 1);
  return data.meta?.results?.total ?? 0;
}

async function queryFAERS(query: FAERSQuery): Promise<FAERSResult> {
  {
    const searchTerms: string[] = [];
    if (query.drugName) {
      searchTerms.push(`patient.drug.medicinalproduct:"${faersQuote(query.drugName)}"`);
    }
    if (query.reactionTerm) {
      searchTerms.push(`patient.reaction.reactionmeddrapt:"${faersQuote(query.reactionTerm)}"`);
    }
    if (query.seriousOnly) searchTerms.push('serious:1');

    const search = searchTerms.join('+AND+');
    const limit = query.limit || 100;

    const data = await faersFetch(search, limit);

    const results = data.results || [];
    const reactions = new Map<string, number>();
    const indications = new Map<string, number>();
    // Demographics and year are DERIVED from the same reports below. They used
    // to be returned as `{}` and `{}` on the success path — never computed at
    // all — which reads to a consumer as "we looked and the reports carry no
    // age, sex or date", rather than "we did not look".
    const ageGroups: Record<string, number> = {};
    const genderDistribution: Record<string, number> = {};
    const reportsByYear: Record<string, number> = {};
    let seriousCount = 0;
    let fatalCount = 0;

    for (const report of results) {
      if (report.serious === 1) seriousCount++;
      if (report.seriousnessdeath === 1) fatalCount++;

      for (const reaction of report.patient?.reaction || []) {
        const term = reaction.reactionmeddrapt || 'unknown';
        reactions.set(term, (reactions.get(term) || 0) + 1);
      }

      for (const drug of report.patient?.drug || []) {
        if (drug.drugindication) {
          indications.set(drug.drugindication, (indications.get(drug.drugindication) || 0) + 1);
        }
      }

      // patientonsetageunit 801 = years (openFDA E2B code list). Any other unit
      // (decade, month, week, day, hour) is counted as 'not reported' rather
      // than silently treated as years.
      const ageBand = faersAgeBand(
        report.patient?.patientonsetage,
        report.patient?.patientonsetageunit
      );
      ageGroups[ageBand] = (ageGroups[ageBand] || 0) + 1;

      // patientsex: 1 = male, 2 = female. Anything else is genuinely unknown.
      const sex =
        report.patient?.patientsex === '1' || report.patient?.patientsex === 1
          ? 'male'
          : report.patient?.patientsex === '2' || report.patient?.patientsex === 2
            ? 'female'
            : 'not reported';
      genderDistribution[sex] = (genderDistribution[sex] || 0) + 1;

      const year = String(report.receiptdate || '').slice(0, 4);
      const yearKey = /^\d{4}$/.test(year) ? year : 'not reported';
      reportsByYear[yearKey] = (reportsByYear[yearKey] || 0) + 1;
    }

    const topReactions = Array.from(reactions.entries())
      .sort((a, b) => b[1] - a[1])
      .slice(0, 20)
      .map(([term, count]) => ({
        term,
        count,
        percentage: results.length > 0 ? (count / results.length) * 100 : 0,
      }));

    const topIndications = Array.from(indications.entries())
      .sort((a, b) => b[1] - a[1])
      .slice(0, 10)
      .map(([term, count]) => ({ term, count }));

    return {
      totalReports: data.meta?.results?.total ?? results.length,
      reportsAnalyzed: results.length,
      seriousReports: seriousCount,
      fatalReports: fatalCount,
      topReactions,
      topIndications,
      demographicDistribution: { ageGroups, genderDistribution },
      reportsByYear,
    };
  }
}

/**
 * The one honest translation of "FAERS could not be consulted": 503, naming the
 * source and stating explicitly that no analysis was performed.
 *
 * A pharmacovigilance surface must never answer an outage with an all-clear, so
 * this deliberately carries no `signals` array — not even an empty one. An empty
 * array here is what the previous code produced, and a caller counting
 * `signals.length === 0` cannot tell it from a real negative result.
 */
function respondFaersUnavailable(res: Response, err: FAERSUnavailableError) {
  console.error('[RWE] FAERS unavailable:', err.detail);
  return res.status(503).json({
    success: false,
    error: {
      code: 'FAERS_UNAVAILABLE',
      source: 'FDA openFDA drug/event',
      detail: err.detail,
      message:
        'FDA FAERS could not be consulted, so no adverse-event analysis was performed. ' +
        'This is not a finding of no signal.',
    },
  });
}

/** openFDA E2B age-unit code 801 is years; other units are not converted. */
function faersAgeBand(age: unknown, unit: unknown): string {
  const years = Number(age);
  const isYears = unit === '801' || unit === 801;
  if (!isYears || !Number.isFinite(years) || years < 0) return 'not reported';
  if (years < 2) return '0-1';
  if (years < 12) return '2-11';
  if (years < 18) return '12-17';
  if (years < 45) return '18-44';
  if (years < 65) return '45-64';
  if (years < 75) return '65-74';
  return '75+';
}

/**
 * Build the 2x2 contingency table for one drug-event pair and hand it to the
 * platform's disproportionality engine.
 *
 *   a = reports with the drug AND the event
 *   b = reports with the drug, without the event      = N(drug)  - a
 *   c = reports with the event, without the drug      = N(event) - a
 *   d = everything else                               = N(all) - a - b - c
 *
 * Four openFDA count queries supply N(drug), N(event), a and N(all). This is
 * the part the old code never did, and the reason its ROR and PRR could not
 * have been ROR and PRR: three of the four cells were never fetched.
 */
async function faersDisproportionality(
  drugName: string,
  reactionTerm: string,
  caseCountInPage: number
): Promise<SafetySignal> {
  const drugClause = `patient.drug.medicinalproduct:"${faersQuote(drugName)}"`;
  const eventClause = `patient.reaction.reactionmeddrapt:"${faersQuote(reactionTerm)}"`;

  const [nDrug, nEvent, a, nAll] = await Promise.all([
    faersTotal(drugClause),
    faersTotal(eventClause),
    faersTotal(`${drugClause}+AND+${eventClause}`),
    faersTotal('_exists_:patient.reaction.reactionmeddrapt'),
  ]);

  // Clamp at zero: openFDA's totals are independent queries and can disagree at
  // the margin. A negative cell would be arithmetic on inconsistent snapshots,
  // not a count, and must not be passed off as one.
  const b = Math.max(0, nDrug - a);
  const c = Math.max(0, nEvent - a);
  const d = Math.max(0, nAll - a - b - c);

  const result = detectSafetySignal({ a, b, c, d });

  return {
    adverseEvent: reactionTerm,
    contingencyTable: { a, b, c, d },
    measures: result.measures,
    signalOfDisproportionateReporting: result.signalOfDisproportionateReporting,
    rationale: result.rationale,
    warnings: result.warnings,
    citations: result.citations,
    caseCount: caseCountInPage,
  };
}

// ---------------------------------------------------------------------------
// CLINICALTRIALS.GOV CLIENT
// ---------------------------------------------------------------------------

async function queryClinicalTrials(condition: string, intervention?: string): Promise<any[]> {
  try {
    const params = new URLSearchParams({
      'query.cond': condition,
      pageSize: '20',
      format: 'json',
    });
    if (intervention) params.set('query.intr', intervention);

    const response = await fetch(`https://clinicaltrials.gov/api/v2/studies?${params}`);
    const data = (await response.json()) as any;
    return data.studies || [];
  } catch (err) {
    console.error('[RWE] ClinicalTrials.gov query failed:', err);
    return [];
  }
}

// ---------------------------------------------------------------------------
// EXPRESS ROUTES
// ---------------------------------------------------------------------------

const router = Router();

/**
 * GET /sources
 * List all available RWE data sources
 */
router.get('/sources', (_req: Request, res: Response) => {
  res.json({
    success: true,
    data: DATA_SOURCES.map(s => ({
      ...s,
      endpoint: s.endpoint ? '***configured***' : undefined, // Hide actual endpoints
    })),
  });
});

/**
 * GET /sources/:sourceId/status
 * Get detailed status of a specific data source
 */
router.get('/sources/:sourceId/status', (req: Request, res: Response) => {
  const source = DATA_SOURCES.find(s => s.id === req.params.sourceId);
  if (!source) return res.status(404).json({ error: 'Data source not found' });
  res.json({ success: true, data: source });
});

/**
 * POST /query
 * Execute a real-world evidence study query.
 *
 * Builds real exposure/comparator cohorts and outcome counts from the connected
 * FHIR data source and computes comparative statistics (risk ratio, risk
 * difference, 95% CI, two-proportion z-test) analytically from the real counts.
 * Nothing is fabricated: when no data source is connected it returns 501, and
 * when cohorts are too small it returns status 'insufficient_data' with null
 * statistics. Licensed vendor sources (aetion/flatiron/trinetx) are recognized
 * but return 501 until credentials are wired.
 *
 * The prior implementation fabricated the entire result with Math.random();
 * this replaces it with a real analysis engine (see rwe-study-service).
 */
const rweStudySchema = z.object({
  dataSource: z.enum(['fhir', 'aetion', 'flatiron', 'trinetx']).optional(),
  exposureCode: z.string().min(1).max(200),
  comparatorCode: z.string().min(1).max(200).optional(),
  outcomeCode: z.string().min(1).max(200),
  demographics: z
    .object({
      gender: z.string().max(20).optional(),
      ageMin: z.number().int().min(0).max(120).optional(),
      ageMax: z.number().int().min(0).max(120).optional(),
    })
    .optional(),
  minCohortSize: z.number().int().min(1).max(100000).optional(),
});

router.post('/query', async (req: Request, res: Response) => {
  const parsed = rweStudySchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({
      success: false,
      error: { code: 'invalid_request', message: 'Invalid study definition', details: parsed.error.flatten() },
    });
  }

  try {
    const result = await runRWEStudy(parsed.data);
    res.json({ success: true, data: result });
  } catch (err) {
    if (err instanceof RWESourceNotConfiguredError) {
      return res.status(501).json({
        success: false,
        error: { code: 'source_not_configured', message: err.message, dataSource: err.dataSource },
      });
    }
    console.error('[RWE] study execution failed:', err);
    res.status(502).json({
      success: false,
      error: {
        code: 'execution_failed',
        message: `Study execution failed: ${err instanceof Error ? err.message : 'Unknown error'}`,
      },
    });
  }
});

/**
 * POST /faers
 * Query FDA FAERS for adverse event data
 */
router.post('/faers', async (req: Request, res: Response) => {
  const query: FAERSQuery = req.body;
  if (!query.drugName) return res.status(400).json({ error: 'drugName required' });

  try {
    const result = await queryFAERS(query);
    res.json({ success: true, data: result });
  } catch (err) {
    if (err instanceof FAERSUnavailableError) return respondFaersUnavailable(res, err);
    throw err;
  }
});

/**
 * POST /fhir/patients
 * Query FHIR EHR for patient cohort (de-identified)
 */
router.post('/fhir/patients', async (req: Request, res: Response) => {
  const { condition, limit: maxCount, ...fhirFilters } = req.body;
  if (!condition)
    return res.status(400).json({ error: 'condition (ICD-10 or SNOMED code) required' });

  const params: Record<string, string> = {
    _count: String(maxCount || 50),
    ...Object.fromEntries(
      Object.entries(fhirFilters)
        .filter(([, v]) => v != null)
        .map(([k, v]) => [k, String(v)])
    ),
  };

  let patients: any[];
  try {
    patients = await queryFHIR('Patient', params);
  } catch (err) {
    // `patientCount: 0` is a cohort-feasibility finding. It must only ever be
    // reported when the EHR actually answered "none". An unconfigured or
    // unreachable connector answers with its own status so the caller knows no
    // query ran, instead of recording a zero-patient cohort that no EHR
    // returned.
    if (err instanceof FHIRUnavailableError) {
      return res.status(503).json({
        success: false,
        error: {
          code: err.reason === 'not_configured' ? 'FHIR_NOT_CONFIGURED' : 'FHIR_UNAVAILABLE',
          message:
            err.reason === 'not_configured'
              ? 'No FHIR EHR endpoint is configured for this deployment; no patient cohort was queried.'
              : 'The FHIR EHR endpoint could not be reached; no patient cohort was queried.',
        },
      });
    }
    throw err;
  }

  res.json({
    success: true,
    data: {
      patientCount: patients.length,
      patients: patients.slice(0, 10).map((p: any) => ({
        id: p.id,
        gender: p.gender,
        birthYear: p.birthDate?.substring(0, 4),
        // De-identified: no names, addresses, exact dates
      })),
      deidentified: true,
      fhirVersion: 'R4',
    },
  });
});

/**
 * POST /clinical-trials
 * Search ClinicalTrials.gov for relevant trials
 */
router.post('/clinical-trials', async (req: Request, res: Response) => {
  const { condition, intervention } = req.body;
  if (!condition) return res.status(400).json({ error: 'condition required' });

  const studies = await queryClinicalTrials(condition, intervention);

  res.json({
    success: true,
    data: {
      totalStudies: studies.length,
      studies: studies.slice(0, 20).map((s: any) => ({
        nctId: s.protocolSection?.identificationModule?.nctId,
        title: s.protocolSection?.identificationModule?.briefTitle,
        status: s.protocolSection?.statusModule?.overallStatus,
        phase: s.protocolSection?.designModule?.phases,
        enrollment: s.protocolSection?.designModule?.enrollmentInfo?.count,
        startDate: s.protocolSection?.statusModule?.startDateStruct?.date,
        conditions: s.protocolSection?.conditionsModule?.conditions,
        interventions: s.protocolSection?.armsInterventionsModule?.interventions?.map(
          (i: any) => i.name
        ),
      })),
    },
  });
});

/**
 * POST /signal-detection
 * Disproportionality analysis (PRR / ROR / EBGM) over FAERS.
 *
 * The candidate events are the most frequently reported reactions in a page of
 * serious reports for the drug; each is then scored against the WHOLE FAERS
 * background via its own 2x2 table. Frequency within the page selects what to
 * test — it is not itself the test, which is the confusion the previous
 * implementation was built on.
 */
router.post('/signal-detection', async (req: Request, res: Response) => {
  const { drugName } = req.body;
  if (!drugName) return res.status(400).json({ error: 'drugName required' });

  try {
    const faersResult = await queryFAERS({ drugName, seriousOnly: true, limit: 100 });
    const candidates = faersResult.topReactions.slice(0, 5);

    const signals = await Promise.all(
      candidates.map(r => faersDisproportionality(drugName, r.term, r.count))
    );
    const flagged = signals.filter(s => s.signalOfDisproportionateReporting);

    res.json({
      success: true,
      data: {
        drugName,
        method: {
          // What was actually run, named after the functions that ran it. The
          // previous value was the literal string 'Multi-item Gamma Poisson
          // Shrinker (MGPS)' over arithmetic that computed no such thing.
          computed: ['PRR', 'ROR', 'EBGM'],
          implementation:
            'server/services/pharmacovigilance/pharmacovigilance-knowledge.ts::detectSafetySignal',
          note:
            'EBGM here is a deterministic shrinkage approximation, not a full ' +
            'Gamma-Poisson (MGPS) fit. Thresholds and citations are carried on ' +
            'each measure.',
        },
        candidateSelection: {
          basis: 'most frequently reported reactions among the serious reports retrieved',
          reportsAnalyzed: faersResult.reportsAnalyzed,
          totalReportsMatchingDrug: faersResult.totalReports,
          candidatesTested: candidates.length,
        },
        signals,
        signalsOfDisproportionateReporting: flagged.length,
        analysisDate: new Date(),
      },
    });
  } catch (err) {
    if (err instanceof FAERSUnavailableError) return respondFaersUnavailable(res, err);
    throw err;
  }
});

/**
 * GET /health
 * Health check for RWE service
 */
router.get('/health', (_req: Request, res: Response) => {
  const activeSources = DATA_SOURCES.filter(s => s.status === 'active').length;
  res.json({
    status: 'healthy',
    service: 'real-world-evidence',
    dataSources: {
      total: DATA_SOURCES.length,
      active: activeSources,
      types: [...new Set(DATA_SOURCES.map(s => s.sourceType))],
    },
    // ── 2026-09-10: these were eight hardcoded `true`s ────────────────────────
    // A /health capability map is what an integrator and a procurement
    // questionnaire read, so an unearned `true` here travels further than one
    // in a response body. Three of them named analytics that exist in this file
    // only as a header comment and an optional REQUEST field —
    // propensityScoreMatching, survivalAnalysis and externalControlArm have no
    // implementation anywhere in the RWE path. `hipaaCompliant: true` asserted
    // a regulatory status about the deployment; nothing computes it, and it is
    // not a property a route can know about itself. `signalDetection: true` was
    // true only of a function that invented its statistics.
    //
    // Each entry below is now either derived from configuration or 'not_implemented'.
    capabilities: {
      fhirIntegration: process.env.FHIR_BASE_URL ? 'configured' : 'not_configured',
      faersQuery: 'available',
      clinicalTrialsGov: 'available',
      // Real as of 2026-09-10: PRR/ROR/EBGM over a FAERS 2x2 table via
      // pharmacovigilance-knowledge.ts::detectSafetySignal.
      signalDetection: 'available',
      propensityScoreMatching: 'not_implemented',
      survivalAnalysis: 'not_implemented',
      externalControlArm: 'not_implemented',
    },
    // The de-identification this service performs is the FHIR projection in
    // POST /fhir/patients (id, gender, birth YEAR only). That is a described
    // behaviour, not a compliance attestation, and it is stated as such.
    deidentification: {
      fhirPatientProjection: 'id, gender, birth year only — no names, addresses or exact dates',
    },
    // Documents this service was written against. Whether a given STUDY is
    // aligned with them is a reviewer's determination about that study, not a
    // boolean a health check can assert, so the previous `aligned: true` is gone.
    fdaRweGuidanceReferences: [
      'FDA Framework for Real-World Evidence (2018)',
      'FDA Guidance: Real-World Data - Assessing Electronic Health Records (2021)',
      'FDA Guidance: Real-World Data - Assessing Registries (2021)',
    ],
  });
});

export default router;
