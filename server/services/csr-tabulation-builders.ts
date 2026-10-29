/**
 * @fileoverview CSR Tabulation Builders — efficacy / safety / demographics / disposition
 * @module server/services/csr-tabulation-builders
 *
 * Adds the data-table builders that ICH E3 §10–12 require but that the
 * existing csr-builder.ts only stubs as "[DATA TO BE INSERTED]". Consumes
 * a typed StudyData input — typically derived from CDISC ADaM / SDTM datasets
 * or a vault-stored study database.
 *
 * Coverage:
 *   §10.1 Disposition table
 *   §11.1 Analysis populations table
 *   §11.2 Demographics & baseline characteristics
 *   §11.4 Primary efficacy results
 *   §12.1 Extent of exposure
 *   §12.2 AE incidence by SOC and PT
 *   §12.3 Deaths, SAEs, discontinuations due to AE
 *   §12.4 Clinical laboratory shifts
 *   §12.5 Vital signs and ECG, change from baseline (when supplied)
 *   §11.2 Concomitant medications (when supplied)
 *
 * §10.1 renders a disposition status the source never recorded as
 * "not recorded", never as 0 (2026-10-29, CSR slice 6).
 */

import type { GeneratedTable } from './module3Composer.js';
import { roundHalfUp } from './csr-figure-format.js';
export { roundHalfUp };

// ── Input shape (study database extract) ────────────────────────────────────

export interface StudyData {
  studyId: string;
  protocolNumber: string;
  treatmentArms: TreatmentArm[];
  /** Subject-level disposition records */
  disposition: DispositionRecord[];
  /** Subject-level demographics */
  demographics: DemographicRecord[];
  /** Efficacy endpoints (primary + secondary) */
  efficacy: EfficacyResult[];
  /** Adverse event records (one row per AE occurrence) */
  adverseEvents: AdverseEvent[];
  /** Treatment exposure summary per arm */
  exposure?: ExposureSummary[];
  /** Lab shifts (baseline → on-treatment) */
  labShifts?: LabShift[];
  /** The final-disposition categories the source classifies subjects into. A
   * declared category with no subject is a recorded zero; a category neither
   * declared nor used by any record is not recorded, never 0 (§10.1). */
  dispositionCategories?: DispositionRecord['status'][];
  /** What "completed" means in this source: study completion (ADSL EOSSTT) or
   * treatment completion (EOTSTT). Undeclared keeps the previous label. */
  dispositionBasis?: 'end-of-study' | 'end-of-treatment';
  /** Where AE discontinuation is recorded: per event (ledToDiscontinuation, the
   * default) or per subject (DispositionRecord.discontinuedForAdverseEvent),
   * when the study did not collect the action taken per event (2026-10-30). */
  aeDiscontinuationBasis?: 'event' | 'subject';
  /** §12.5 — one record per safety subject and vital-sign/ECG parameter */
  vitalSigns?: VitalSignRecord[];
  /** Concomitant medications, one record per subject and medication */
  concomitantMedications?: ConcomitantMedicationRecord[];
}

export interface TreatmentArm {
  armId: string;
  armName: string;
  /** Total subjects randomized */
  randomized: number;
  /** Total in safety / ITT / mITT / PP populations */
  populations: {
    safety: number;
    itt: number;
    mitt?: number;
    perProtocol?: number;
    completed: number;
  };
}

export interface DispositionRecord {
  /** Present for the validated supporting-source contract. */
  subjectId?: string;
  armId: string;
  /** Final status: completed | discontinued | screen-failed | other */
  status: 'completed' | 'discontinued' | 'screen-failed' | 'lost-to-followup' | 'death' | 'other';
  reason?: string;
  /** Subject-level withdrawal for an AE (aeDiscontinuationBasis 'subject'). */
  discontinuedForAdverseEvent?: boolean;
}

export interface DemographicRecord {
  /** Present for the validated supporting-source contract. */
  subjectId?: string;
  armId: string;
  age: number;
  sex: 'M' | 'F' | 'Other';
  race?: string;
  ethnicity?: string;
  weight?: number;
  bmi?: number;
}

export interface EfficacyResult {
  endpointName: string;
  endpointType: 'primary' | 'secondary' | 'exploratory';
  armId: string;
  /** Numerical result (mean, median, % responders, hazard ratio, etc.) */
  value: number;
  /** Result interpretation (string) */
  display: string;
  /** Confidence interval if applicable */
  ci?: { lower: number; upper: number; level: string };
  /** P-value vs comparator */
  pValue?: number;
  /** Comparator arm */
  comparatorArmId?: string;
  /** Bayesian credible interval, as the SAP reports it */
  credibleInterval?: { lower: number; upper: number; level: string };
  /** Posterior probability of the named hypothesis (for example "OR > 1") */
  posteriorProbability?: { value: number; hypothesis: string };
}

export interface AdverseEvent {
  armId: string;
  /** MedDRA Preferred Term */
  pt: string;
  /** MedDRA System Organ Class */
  soc: string;
  severity: 'mild' | 'moderate' | 'severe';
  serious: boolean;
  related: 'related' | 'unrelated' | 'unknown';
  outcome?: 'recovered' | 'recovering' | 'not-recovered' | 'fatal' | 'unknown';
  ledToDiscontinuation?: boolean;
  /** Subject ID (for unique-subject counting) */
  subjectId: string;
}

export interface ExposureSummary {
  armId: string;
  meanDailyDose?: string;
  meanExposureDays: number;
  totalPersonYears?: number;
}

export interface LabShift {
  armId: string;
  parameter: string;
  shiftFromNormal: number;
  shiftToHigh: number;
  shiftToLow: number;
  totalAssessed: number;
}

export interface VitalSignRecord {
  subjectId: string;
  armId: string;
  /** Parameter as the source names it, with its unit ("Systolic Blood Pressure (mmHg)") */
  parameter: string;
  /** Baseline value (ABLFL='Y') */
  baseline: number;
  /** The last on-treatment value */
  lastOnTreatment: number;
}

export interface ConcomitantMedicationRecord {
  subjectId: string;
  armId: string;
  /** Standardized medication name (CMDECOD) */
  medication: string;
  /** ATC class as coded (CMCLAS); absent when the source did not code it */
  atcClass?: string;
}

// ── Output ──────────────────────────────────────────────────────────────────

export interface CSRTables {
  /** §10.1 — Disposition */
  disposition: GeneratedTable;
  /** §11.1 — Analysis populations */
  analysisPopulations: GeneratedTable;
  /** §11.2 — Demographics & baseline */
  demographics: GeneratedTable;
  /** §11.4 — Primary efficacy results */
  primaryEfficacy: GeneratedTable;
  /** §11.4 — Secondary efficacy results (optional) */
  secondaryEfficacy?: GeneratedTable;
  /** §12.1 — Extent of exposure */
  exposure?: GeneratedTable;
  /** §12.2 — AE summary by arm */
  aeOverallSummary: GeneratedTable;
  /** §12.2 — AEs by SOC */
  aeBySOC: GeneratedTable;
  /** §12.2 — Top AEs by PT (≥5%) */
  aeTopPT: GeneratedTable;
  /** §12.3 — Deaths, SAEs, AE discontinuations */
  deathsSAEsDiscontinuations: GeneratedTable;
  /** §12.4 — Lab shifts (optional) */
  labShifts?: GeneratedTable;
  /** §12.5 — Vital signs and ECG, change from baseline (only when supplied) */
  vitalSigns?: GeneratedTable;
  /** §11.2 — Concomitant medications (only when supplied) */
  concomitantMedications?: GeneratedTable;
}

// ── Top-level builder ───────────────────────────────────────────────────────

export function buildCSRTables(study: StudyData): CSRTables {
  return {
    disposition: buildDispositionTable(study),
    analysisPopulations: buildAnalysisPopulationsTable(study),
    demographics: buildDemographicsTable(study),
    primaryEfficacy: buildEfficacyTable(study, 'primary'),
    secondaryEfficacy: study.efficacy.some(e => e.endpointType === 'secondary')
      ? buildEfficacyTable(study, 'secondary')
      : undefined,
    exposure: study.exposure && study.exposure.length > 0 ? buildExposureTable(study) : undefined,
    aeOverallSummary: buildAEOverallSummary(study),
    aeBySOC: buildAEBySOC(study),
    aeTopPT: buildAETopPT(study, 0.05),
    deathsSAEsDiscontinuations: buildDeathsSAEsTable(study),
    labShifts: study.labShifts && study.labShifts.length > 0 ? buildLabShiftsTable(study) : undefined,
    // Present only when supplied, so a source without them yields the same
    // table object, and the same retained-table digest, as before.
    ...(study.vitalSigns?.length ? { vitalSigns: buildVitalSignsTable(study) } : {}),
    ...(study.concomitantMedications?.length ? { concomitantMedications: buildConcomitantMedicationsTable(study) } : {}),
  };
}

// ── §10.1 Disposition ───────────────────────────────────────────────────────

const DISPOSITION_STATUSES: DispositionRecord['status'][] = [
  'completed', 'discontinued', 'screen-failed', 'lost-to-followup', 'death', 'other',
];
/** The cell for a status the source never recorded: distinguishable from a recorded 0. */
export const NOT_RECORDED = 'not recorded';

export function buildDispositionTable(study: StudyData): GeneratedTable {
  const arms = study.treatmentArms;
  const dispByArm = new Map<string, Map<string, number>>();
  for (const arm of arms) {
    dispByArm.set(arm.armId, new Map());
  }
  for (const d of study.disposition) {
    const arm = dispByArm.get(d.armId);
    if (arm) arm.set(d.status, (arm.get(d.status) || 0) + 1);
  }
  // A status is recorded when the source declares it or any record uses it;
  // a status used in one arm is a classification, so its absence elsewhere is 0.
  const recorded = new Set([...(study.dispositionCategories ?? []), ...study.disposition.map(d => d.status)]);

  return {
    title: '§10.1 — Patient Disposition',
    headers: ['Status', ...arms.map(a => `${a.armName} (n=${a.randomized})`), 'Total'],
    rows: [
      ['Randomized', ...arms.map(a => String(a.randomized)), String(arms.reduce((s, a) => s + a.randomized, 0))],
      ...DISPOSITION_STATUSES.map(status => {
        const label = statusLabel(status, study.dispositionBasis);
        if (!recorded.has(status)) return [label, ...arms.map(() => NOT_RECORDED), NOT_RECORDED];
        const cells = arms.map(a => String(dispByArm.get(a.armId)?.get(status) || 0));
        const total = cells.reduce((sum, c) => sum + parseInt(c, 10), 0);
        return [label, ...cells, String(total)];
      }),
    ],
  };
}

function statusLabel(s: DispositionRecord['status'], basis: StudyData['dispositionBasis']): string {
  switch (s) {
    case 'completed': return basis === 'end-of-study' ? 'Completed study' : 'Completed treatment';
    // A source that declares its basis (2026-10-29, adversarial review) classifies
    // death and loss to follow-up separately, so this row is not "any reason".
    case 'discontinued': return basis ? 'Discontinued (other reasons)' : 'Discontinued (any reason)';
    case 'lost-to-followup': return 'Lost to follow-up';
    case 'death': return 'Death';
    case 'screen-failed': return 'Screen failure';
    case 'other': return 'Other';
  }
}

// ── §11.1 Analysis populations ──────────────────────────────────────────────

export function buildAnalysisPopulationsTable(study: StudyData): GeneratedTable {
  const arms = study.treatmentArms;
  return {
    title: '§11.1 — Analysis Populations',
    headers: ['Population', ...arms.map(a => a.armName), 'Total'],
    rows: [
      ['Randomized', ...arms.map(a => String(a.randomized)), String(arms.reduce((s, a) => s + a.randomized, 0))],
      ['Safety', ...arms.map(a => String(a.populations.safety)), String(arms.reduce((s, a) => s + a.populations.safety, 0))],
      ['ITT', ...arms.map(a => String(a.populations.itt)), String(arms.reduce((s, a) => s + a.populations.itt, 0))],
      ...(arms.some(a => a.populations.mitt !== undefined) ? [[
        'mITT',
        ...arms.map(a => String(a.populations.mitt ?? '—')),
        arms.some(a => a.populations.mitt === undefined) ? '—' : String(arms.reduce((s, a) => s + a.populations.mitt!, 0)),
      ]] : []),
      ...(arms.some(a => a.populations.perProtocol !== undefined) ? [[
        'Per-Protocol',
        ...arms.map(a => String(a.populations.perProtocol ?? '—')),
        arms.some(a => a.populations.perProtocol === undefined) ? '—' : String(arms.reduce((s, a) => s + a.populations.perProtocol!, 0)),
      ]] : []),
      ['Completed', ...arms.map(a => String(a.populations.completed)), String(arms.reduce((s, a) => s + a.populations.completed, 0))],
    ],
  };
}

// ── §11.2 Demographics ──────────────────────────────────────────────────────

/** "mean (SD)" to one place. Descriptive sample SD uses Bessel's correction;
 * one observation cannot establish its sample SD, so it is never printed as 0. */
function meanSd(values: number[]): string {
  if (values.length === 0) return '—';
  const mean = values.reduce((a, b) => a + b, 0) / values.length;
  const sd = values.length > 1 ? Math.sqrt(values.reduce((a, b) => a + (b - mean) ** 2, 0) / (values.length - 1)) : null;
  return `${roundHalfUp(mean, 1)} (${sd === null ? '—' : roundHalfUp(sd, 1)})`;
}

export function buildDemographicsTable(study: StudyData): GeneratedTable {
  const arms = study.treatmentArms;
  const byArm = new Map<string, DemographicRecord[]>();
  for (const arm of arms) byArm.set(arm.armId, []);
  for (const d of study.demographics) {
    byArm.get(d.armId)?.push(d);
  }

  const cellNumeric = (records: DemographicRecord[], key: 'age' | 'weight' | 'bmi'): string =>
    meanSd(records.map(r => r[key]).filter((v): v is number => typeof v === 'number'));

  const cellSex = (records: DemographicRecord[]): string => {
    if (records.length === 0) return '—';
    const m = records.filter(r => r.sex === 'M').length;
    const f = records.filter(r => r.sex === 'F').length;
    const other = records.filter(r => r.sex === 'Other').length;
    const total = records.length || 1;
    return `${m} (${roundHalfUp((m / total) * 100, 0)}%) M / ${f} (${roundHalfUp((f / total) * 100, 0)}%) F / ${other} (${roundHalfUp((other / total) * 100, 0)}%) Other`;
  };

  const rows: string[][] = [
    ['n', ...arms.map(a => String(byArm.get(a.armId)?.length || 0))],
    ['Age, mean (SD) [yr]', ...arms.map(a => cellNumeric(byArm.get(a.armId) || [], 'age'))],
    ['Sex (M / F / Other)', ...arms.map(a => cellSex(byArm.get(a.armId) || []))],
  ];

  if (study.demographics.some(d => d.weight !== undefined)) {
    rows.push(['Weight, mean (SD) [kg]', ...arms.map(a => cellNumeric(byArm.get(a.armId) || [], 'weight'))]);
  }
  if (study.demographics.some(d => d.bmi !== undefined)) {
    rows.push(['BMI, mean (SD)', ...arms.map(a => cellNumeric(byArm.get(a.armId) || [], 'bmi'))]);
  }

  return {
    title: '§11.2 — Demographics and Baseline Characteristics',
    headers: ['Characteristic', ...arms.map(a => a.armName)],
    rows,
  };
}

// ── §11.4 Efficacy ──────────────────────────────────────────────────────────

const interval = (i: { lower: number; upper: number; level: string }) => `${i.lower.toFixed(2)}–${i.upper.toFixed(2)} (${i.level})`;
/** Three places, as p-values are; never rounded up to certainty or down to impossibility. */
const probability = (p: number) => (p > 0.999 && p < 1 ? '>0.999' : p > 0 && p < 0.001 ? '<0.001' : p.toFixed(3));

function efficacyRow(endpoint: string, r: EfficacyResult, armIdToName: Map<string, string>, bayesian: boolean): string[] {
  return [
    endpoint,
    armIdToName.get(r.armId) || r.armId,
    r.display,
    r.ci ? interval(r.ci) : '—',
    r.pValue !== undefined ? r.pValue.toFixed(3) : '—',
    ...(bayesian ? [
      r.credibleInterval ? interval(r.credibleInterval) : '—',
      r.posteriorProbability ? probability(r.posteriorProbability.value) : '—',
      r.posteriorProbability ? r.posteriorProbability.hypothesis : '—',
    ] : []),
    r.comparatorArmId ? armIdToName.get(r.comparatorArmId) || r.comparatorArmId : '—',
  ];
}

export function buildEfficacyTable(
  study: StudyData,
  type: 'primary' | 'secondary'
): GeneratedTable {
  const results = study.efficacy.filter(e => e.endpointType === type);
  const byEndpoint = new Map<string, EfficacyResult[]>();
  for (const r of results) {
    const list = byEndpoint.get(r.endpointName) || [];
    list.push(r);
    byEndpoint.set(r.endpointName, list);
  }

  const armIdToName = new Map(study.treatmentArms.map(a => [a.armId, a.armName]));

  // The Bayesian columns appear only when a result carries them, so a table
  // built from a source without them is byte-identical to before (its
  // scientific-review receipts hash these cells).
  const bayesian = results.some(r => r.credibleInterval || r.posteriorProbability);
  const rows: string[][] = [];
  for (const [endpoint, armResults] of byEndpoint) {
    for (const r of armResults) rows.push(efficacyRow(endpoint, r, armIdToName, bayesian));
  }

  const headers = ['Endpoint', 'Arm', 'Result', 'CI', 'p-value',
    ...(bayesian ? ['Credible interval', 'Posterior probability', 'Posterior hypothesis'] : []), 'vs Comparator'];
  return {
    title: type === 'primary'
      ? '§11.4 — Primary Efficacy Endpoint Results'
      : '§11.4 — Secondary Efficacy Endpoint Results',
    headers,
    rows: rows.length > 0 ? rows : [['No data', ...headers.slice(1).map(() => '')]],
  };
}


// ── §12.1 Extent of exposure ────────────────────────────────────────────────

export function buildExposureTable(study: StudyData): GeneratedTable {
  const arms = study.treatmentArms;
  const expByArm = new Map(study.exposure?.map(e => [e.armId, e]) || []);
  return {
    title: '§12.1 — Extent of Exposure',
    headers: ['Arm', 'N (Safety)', 'Mean Daily Dose', 'Mean Exposure (days)', 'Total Person-Years'],
    rows: arms.map(a => {
      const e = expByArm.get(a.armId);
      return [
        a.armName,
        String(a.populations.safety),
        e?.meanDailyDose || '—',
        e?.meanExposureDays !== undefined ? roundHalfUp(e.meanExposureDays, 1) : '—',
        e?.totalPersonYears !== undefined ? roundHalfUp(e.totalPersonYears, 2) : '—',
      ];
    }),
  };
}

// ── §12.2 AE summary ────────────────────────────────────────────────────────

/** A recorded zero event count does not establish a percentage when no
 * subjects belong to that arm's denominator. */
function incidence(subjects: number, denominator: number): string {
  return `${subjects} (${denominator > 0 ? `${roundHalfUp((subjects / denominator) * 100, 1)}%` : '—'})`;
}

/** Subjects recorded as withdrawn for an AE when the source records it per subject (the contract holds them to the safety population). */
const aeDiscontinuedSubjects = (study: StudyData, armId: string) =>
  new Set(study.disposition.filter(d => d.armId === armId && d.discontinuedForAdverseEvent).map(d => d.subjectId)).size;

export function buildAEOverallSummary(study: StudyData): GeneratedTable {
  const arms = study.treatmentArms;
  const aeByArm = new Map<string, AdverseEvent[]>();
  for (const arm of arms) aeByArm.set(arm.armId, []);
  for (const ae of study.adverseEvents) aeByArm.get(ae.armId)?.push(ae);

  const subjectsWithAE = (aes: AdverseEvent[]): number => new Set(aes.map(a => a.subjectId)).size;

  return {
    title: '§12.2 — Overall Adverse Event Summary',
    headers: ['Category', ...arms.map(a => `${a.armName} (n=${a.populations.safety})`)],
    rows: [
      ['Any AE, n (%)', ...arms.map(a => {
        const aes = aeByArm.get(a.armId) || [];
        const subjects = subjectsWithAE(aes);
        return incidence(subjects, a.populations.safety);
      })],
      ['Severe AE, n (%)', ...arms.map(a => {
        const aes = (aeByArm.get(a.armId) || []).filter(e => e.severity === 'severe');
        const subjects = subjectsWithAE(aes);
        return incidence(subjects, a.populations.safety);
      })],
      ['Serious AE, n (%)', ...arms.map(a => {
        const aes = (aeByArm.get(a.armId) || []).filter(e => e.serious);
        const subjects = subjectsWithAE(aes);
        return incidence(subjects, a.populations.safety);
      })],
      ['Treatment-Related AE, n (%)', ...arms.map(a => {
        const aes = (aeByArm.get(a.armId) || []).filter(e => e.related === 'related');
        const subjects = subjectsWithAE(aes);
        return incidence(subjects, a.populations.safety);
      })],
      study.aeDiscontinuationBasis === 'subject'
        ? ['Discontinued for an AE (subject-level), n (%)', ...arms.map(a => incidence(aeDiscontinuedSubjects(study, a.armId), a.populations.safety))]
        : ['AE Leading to Discontinuation, n (%)', ...arms.map(a =>
          incidence(subjectsWithAE((aeByArm.get(a.armId) || []).filter(e => e.ledToDiscontinuation)), a.populations.safety))],
      ['Fatal AE, n (%)', ...arms.map(a => {
        const aes = (aeByArm.get(a.armId) || []).filter(e => e.outcome === 'fatal');
        const subjects = subjectsWithAE(aes);
        return incidence(subjects, a.populations.safety);
      })],
    ],
  };
}

export function buildAEBySOC(study: StudyData): GeneratedTable {
  const arms = study.treatmentArms;
  const socs = [...new Set(study.adverseEvents.map(ae => ae.soc))].sort();

  return {
    title: '§12.2 — Adverse Events by System Organ Class',
    headers: ['System Organ Class', ...arms.map(a => `${a.armName} n (%)`)],
    rows: socs.map(soc => [
      soc,
      ...arms.map(a => {
        const subjectsWithSOC = new Set(
          study.adverseEvents.filter(ae => ae.armId === a.armId && ae.soc === soc).map(ae => ae.subjectId)
        ).size;
        return incidence(subjectsWithSOC, a.populations.safety);
      }),
    ]),
  };
}

export function buildAETopPT(study: StudyData, threshold: number): GeneratedTable {
  const arms = study.treatmentArms;
  const totalSafety = arms.reduce((s, a) => s + a.populations.safety, 0);

  // Tally per PT — keep PTs that hit the threshold in at least one arm
  const pts = [...new Set(study.adverseEvents.map(ae => ae.pt))];
  const overThreshold = pts.filter(pt => {
    return arms.some(a => {
      if (a.populations.safety === 0) return false;
      const subjects = new Set(
        study.adverseEvents.filter(ae => ae.armId === a.armId && ae.pt === pt).map(ae => ae.subjectId)
      ).size;
      return subjects / a.populations.safety >= threshold;
    });
  });

  // Sort by overall frequency descending
  overThreshold.sort((a, b) => {
    const countA = new Set(study.adverseEvents.filter(ae => ae.pt === a).map(ae => ae.subjectId)).size;
    const countB = new Set(study.adverseEvents.filter(ae => ae.pt === b).map(ae => ae.subjectId)).size;
    return countB - countA;
  });

  return {
    title: `§12.2 — Adverse Events by Preferred Term (≥${(threshold * 100).toFixed(0)}% in any arm)`,
    headers: ['Preferred Term', ...arms.map(a => `${a.armName} n (%)`), `Overall (n=${totalSafety})`],
    rows: overThreshold.map(pt => {
      const cells = arms.map(a => {
        const subjects = new Set(
          study.adverseEvents.filter(ae => ae.armId === a.armId && ae.pt === pt).map(ae => ae.subjectId)
        ).size;
        return incidence(subjects, a.populations.safety);
      });
      const overallSubjects = new Set(study.adverseEvents.filter(ae => ae.pt === pt).map(ae => ae.subjectId)).size;
      return [pt, ...cells, incidence(overallSubjects, totalSafety)];
    }),
  };
}

// ── §12.3 Deaths, SAEs, discontinuations ────────────────────────────────────

export function buildDeathsSAEsTable(study: StudyData): GeneratedTable {
  const arms = study.treatmentArms;
  return {
    title: '§12.3 — Fatal Adverse Events, Serious Adverse Events, and Discontinuations Due to AEs',
    headers: ['Category', ...arms.map(a => `${a.armName} (n=${a.populations.safety})`)],
    rows: [
      ['Subjects with fatal AEs, n', ...arms.map(a => {
        const deaths = study.adverseEvents.filter(ae => ae.armId === a.armId && ae.outcome === 'fatal');
        return String(new Set(deaths.map(d => d.subjectId)).size);
      })],
      ['SAEs (any), n', ...arms.map(a => {
        const saes = study.adverseEvents.filter(ae => ae.armId === a.armId && ae.serious);
        return String(new Set(saes.map(s => s.subjectId)).size);
      })],
      ['Treatment-Related SAEs, n', ...arms.map(a => {
        const rsaes = study.adverseEvents.filter(ae => ae.armId === a.armId && ae.serious && ae.related === 'related');
        return String(new Set(rsaes.map(s => s.subjectId)).size);
      })],
      study.aeDiscontinuationBasis === 'subject'
        ? ['Discontinuations Due to AE (subject-level), n', ...arms.map(a => String(aeDiscontinuedSubjects(study, a.armId)))]
        : ['Discontinuations Due to AE, n', ...arms.map(a => {
          const dcs = study.adverseEvents.filter(ae => ae.armId === a.armId && ae.ledToDiscontinuation);
          return String(new Set(dcs.map(d => d.subjectId)).size);
        })],
    ],
  };
}

// ── §12.4 Lab shifts ────────────────────────────────────────────────────────

export function buildLabShiftsTable(study: StudyData): GeneratedTable {
  const arms = study.treatmentArms;
  const params = [...new Set((study.labShifts || []).map(s => s.parameter))];

  return {
    title: '§12.4 — Clinical Laboratory Shifts (Baseline → On-Treatment)',
    headers: ['Parameter', 'Arm', 'Total Assessed', 'Baseline Normal', 'Shift to High n (% baseline normal)', 'Shift to Low n (% baseline normal)', 'Stayed Normal n (% baseline normal)'],
    rows: params.flatMap(param =>
      arms.map(a => {
        const shifts = (study.labShifts || []).filter(s => s.parameter === param && s.armId === a.armId);
        const total = shifts.reduce((sum, s) => sum + s.totalAssessed, 0);
        const high = shifts.reduce((sum, s) => sum + s.shiftToHigh, 0);
        const low = shifts.reduce((sum, s) => sum + s.shiftToLow, 0);
        const baselineNormal = shifts.reduce((sum, s) => sum + s.shiftFromNormal, 0);
        const stayed = baselineNormal - high - low;
        const pct = (n: number) => baselineNormal > 0 ? `${n} (${roundHalfUp((n / baselineNormal) * 100, 1)}%)` : `${n} (—)`;
        return [param, a.armName, String(total), String(baselineNormal), pct(high), pct(low), pct(stayed)];
      })
    ),
  };
}

// ── §12.5 Vital signs and ECG ───────────────────────────────────────────────

/** Change from baseline to the last on-treatment value, per parameter and arm.
 * Descriptive only: no test, no p-value, no clinical-significance judgement. */
export function buildVitalSignsTable(study: StudyData): GeneratedTable {
  const records = study.vitalSigns ?? [];
  const params = [...new Set(records.map(r => r.parameter))].sort();
  return {
    title: '§12.5 — Vital Signs and ECG: Change from Baseline to Last On-Treatment Value',
    headers: ['Parameter', 'Arm', 'n', 'Baseline, mean (SD)', 'Last on-treatment, mean (SD)', 'Change from baseline, mean (SD)'],
    rows: params.flatMap(param => study.treatmentArms.map(a => {
      const own = records.filter(r => r.parameter === param && r.armId === a.armId);
      return [param, a.armName, String(own.length), meanSd(own.map(r => r.baseline)),
        meanSd(own.map(r => r.lastOnTreatment)), meanSd(own.map(r => r.lastOnTreatment - r.baseline))];
    })),
  };
}

// ── §11.2 Concomitant medications ───────────────────────────────────────────

/** An ATC class the source did not code is said so, not merged into another. */
const NOT_CODED = 'ATC class not coded';

/** Subjects taking each medication, by ATC class, n (%) of the safety population. */
export function buildConcomitantMedicationsTable(study: StudyData): GeneratedTable {
  const arms = study.treatmentArms;
  const records = study.concomitantMedications ?? [];
  const subjects = (armId: string, match: (r: ConcomitantMedicationRecord) => boolean) =>
    new Set(records.filter(r => r.armId === armId && match(r)).map(r => r.subjectId)).size;
  const keyOf = (r: ConcomitantMedicationRecord) => JSON.stringify([r.atcClass ?? NOT_CODED, r.medication]);
  const keys = [...new Set(records.map(keyOf))].sort();
  return {
    title: '§11.2 — Concomitant Medications by ATC Class and Medication',
    headers: ['ATC class', 'Medication', ...arms.map(a => `${a.armName} (n=${a.populations.safety}) n (%)`)],
    rows: [
      ['Any concomitant medication', '', ...arms.map(a => incidence(subjects(a.armId, () => true), a.populations.safety))],
      ...keys.map(key => {
        const [atcClass, medication] = JSON.parse(key) as [string, string];
        return [atcClass, medication, ...arms.map(a => incidence(subjects(a.armId, r => keyOf(r) === key), a.populations.safety))];
      }),
    ],
  };
}

// ── Convenience: render tables to ICH E3 markdown ─────────────────────────────

export function renderTablesAsMarkdown(tables: CSRTables): string {
  const sections = [
    tables.disposition,
    tables.analysisPopulations,
    tables.demographics,
    tables.primaryEfficacy,
    tables.secondaryEfficacy,
    tables.exposure,
    tables.aeOverallSummary,
    tables.aeBySOC,
    tables.aeTopPT,
    tables.deathsSAEsDiscontinuations,
    tables.labShifts,
    tables.vitalSigns,
    tables.concomitantMedications,
  ].filter((t): t is GeneratedTable => t !== undefined);

  return sections
    .map(t => {
      const headerLine = `| ${t.headers.join(' | ')} |`;
      const sep = `| ${t.headers.map(() => '---').join(' | ')} |`;
      const rowLines = t.rows.map(r => `| ${r.join(' | ')} |`).join('\n');
      return `### ${t.title}\n\n${headerLine}\n${sep}\n${rowLines}`;
    })
    .join('\n\n');
}
