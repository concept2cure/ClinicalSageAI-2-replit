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
 */

import type { GeneratedTable } from './module3Composer.js';

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
  armId: string;
  /** Final status: completed | discontinued | screen-failed | other */
  status: 'completed' | 'discontinued' | 'screen-failed' | 'lost-to-followup' | 'death' | 'other';
  reason?: string;
}

export interface DemographicRecord {
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
  };
}

// ── §10.1 Disposition ───────────────────────────────────────────────────────

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

  const statuses: DispositionRecord['status'][] = [
    'completed', 'discontinued', 'lost-to-followup', 'death', 'other',
  ];

  return {
    title: '§10.1 — Patient Disposition',
    headers: ['Status', ...arms.map(a => `${a.armName} (n=${a.randomized})`), 'Total'],
    rows: [
      ['Randomized', ...arms.map(a => String(a.randomized)), String(arms.reduce((s, a) => s + a.randomized, 0))],
      ...statuses.map(status => {
        const cells = arms.map(a => String(dispByArm.get(a.armId)?.get(status) || 0));
        const total = cells.reduce((sum, c) => sum + parseInt(c, 10), 0);
        return [statusLabel(status), ...cells, String(total)];
      }),
    ],
  };
}

function statusLabel(s: DispositionRecord['status']): string {
  switch (s) {
    case 'completed': return 'Completed treatment';
    case 'discontinued': return 'Discontinued (any reason)';
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
        String(arms.reduce((s, a) => s + (a.populations.mitt ?? 0), 0)),
      ]] : []),
      ...(arms.some(a => a.populations.perProtocol !== undefined) ? [[
        'Per-Protocol',
        ...arms.map(a => String(a.populations.perProtocol ?? '—')),
        String(arms.reduce((s, a) => s + (a.populations.perProtocol ?? 0), 0)),
      ]] : []),
      ['Completed', ...arms.map(a => String(a.populations.completed)), String(arms.reduce((s, a) => s + a.populations.completed, 0))],
    ],
  };
}

// ── §11.2 Demographics ──────────────────────────────────────────────────────

export function buildDemographicsTable(study: StudyData): GeneratedTable {
  const arms = study.treatmentArms;
  const byArm = new Map<string, DemographicRecord[]>();
  for (const arm of arms) byArm.set(arm.armId, []);
  for (const d of study.demographics) {
    byArm.get(d.armId)?.push(d);
  }

  const cellNumeric = (records: DemographicRecord[], key: 'age' | 'weight' | 'bmi'): string => {
    const values = records.map(r => r[key]).filter((v): v is number => typeof v === 'number');
    if (values.length === 0) return '—';
    const mean = values.reduce((a, b) => a + b, 0) / values.length;
    const sd = Math.sqrt(values.reduce((a, b) => a + (b - mean) ** 2, 0) / values.length);
    return `${mean.toFixed(1)} (${sd.toFixed(1)})`;
  };

  const cellSex = (records: DemographicRecord[]): string => {
    const m = records.filter(r => r.sex === 'M').length;
    const f = records.filter(r => r.sex === 'F').length;
    const total = records.length || 1;
    return `${m} (${((m / total) * 100).toFixed(0)}%) M / ${f} (${((f / total) * 100).toFixed(0)}%) F`;
  };

  const rows: string[][] = [
    ['n', ...arms.map(a => String(byArm.get(a.armId)?.length || 0))],
    ['Age, mean (SD) [yr]', ...arms.map(a => cellNumeric(byArm.get(a.armId) || [], 'age'))],
    ['Sex (M / F)', ...arms.map(a => cellSex(byArm.get(a.armId) || []))],
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

  const rows: string[][] = [];
  for (const [endpoint, armResults] of byEndpoint) {
    for (const r of armResults) {
      rows.push([
        endpoint,
        armIdToName.get(r.armId) || r.armId,
        r.display,
        r.ci ? `${r.ci.lower.toFixed(2)}–${r.ci.upper.toFixed(2)} (${r.ci.level})` : '—',
        r.pValue !== undefined ? r.pValue.toFixed(3) : '—',
        r.comparatorArmId ? armIdToName.get(r.comparatorArmId) || r.comparatorArmId : '—',
      ]);
    }
  }

  return {
    title: type === 'primary'
      ? '§11.4 — Primary Efficacy Endpoint Results'
      : '§11.4 — Secondary Efficacy Endpoint Results',
    headers: ['Endpoint', 'Arm', 'Result', 'CI', 'p-value', 'vs Comparator'],
    rows: rows.length > 0 ? rows : [['No data', '', '', '', '', '']],
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
        e?.meanExposureDays !== undefined ? e.meanExposureDays.toFixed(1) : '—',
        e?.totalPersonYears !== undefined ? e.totalPersonYears.toFixed(2) : '—',
      ];
    }),
  };
}

// ── §12.2 AE summary ────────────────────────────────────────────────────────

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
        const pct = a.populations.safety > 0 ? ((subjects / a.populations.safety) * 100).toFixed(1) : '0';
        return `${subjects} (${pct}%)`;
      })],
      ['Severe AE, n (%)', ...arms.map(a => {
        const aes = (aeByArm.get(a.armId) || []).filter(e => e.severity === 'severe');
        const subjects = subjectsWithAE(aes);
        const pct = a.populations.safety > 0 ? ((subjects / a.populations.safety) * 100).toFixed(1) : '0';
        return `${subjects} (${pct}%)`;
      })],
      ['Serious AE, n (%)', ...arms.map(a => {
        const aes = (aeByArm.get(a.armId) || []).filter(e => e.serious);
        const subjects = subjectsWithAE(aes);
        const pct = a.populations.safety > 0 ? ((subjects / a.populations.safety) * 100).toFixed(1) : '0';
        return `${subjects} (${pct}%)`;
      })],
      ['Treatment-Related AE, n (%)', ...arms.map(a => {
        const aes = (aeByArm.get(a.armId) || []).filter(e => e.related === 'related');
        const subjects = subjectsWithAE(aes);
        const pct = a.populations.safety > 0 ? ((subjects / a.populations.safety) * 100).toFixed(1) : '0';
        return `${subjects} (${pct}%)`;
      })],
      ['AE Leading to Discontinuation, n (%)', ...arms.map(a => {
        const aes = (aeByArm.get(a.armId) || []).filter(e => e.ledToDiscontinuation);
        const subjects = subjectsWithAE(aes);
        const pct = a.populations.safety > 0 ? ((subjects / a.populations.safety) * 100).toFixed(1) : '0';
        return `${subjects} (${pct}%)`;
      })],
      ['Fatal AE, n (%)', ...arms.map(a => {
        const aes = (aeByArm.get(a.armId) || []).filter(e => e.outcome === 'fatal');
        const subjects = subjectsWithAE(aes);
        const pct = a.populations.safety > 0 ? ((subjects / a.populations.safety) * 100).toFixed(1) : '0';
        return `${subjects} (${pct}%)`;
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
        const pct = a.populations.safety > 0 ? ((subjectsWithSOC / a.populations.safety) * 100).toFixed(1) : '0';
        return `${subjectsWithSOC} (${pct}%)`;
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
        const pct = a.populations.safety > 0 ? ((subjects / a.populations.safety) * 100).toFixed(1) : '0';
        return `${subjects} (${pct}%)`;
      });
      const overallSubjects = new Set(study.adverseEvents.filter(ae => ae.pt === pt).map(ae => ae.subjectId)).size;
      const overallPct = totalSafety > 0 ? ((overallSubjects / totalSafety) * 100).toFixed(1) : '0';
      return [pt, ...cells, `${overallSubjects} (${overallPct}%)`];
    }),
  };
}

// ── §12.3 Deaths, SAEs, discontinuations ────────────────────────────────────

export function buildDeathsSAEsTable(study: StudyData): GeneratedTable {
  const arms = study.treatmentArms;
  return {
    title: '§12.3 — Deaths, Serious Adverse Events, and Discontinuations Due to AEs',
    headers: ['Category', ...arms.map(a => `${a.armName} (n=${a.populations.safety})`)],
    rows: [
      ['Deaths, n', ...arms.map(a => {
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
      ['Discontinuations Due to AE, n', ...arms.map(a => {
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
    headers: ['Parameter', 'Arm', 'Total Assessed', 'Shift to High n (%)', 'Shift to Low n (%)', 'Stayed Normal n (%)'],
    rows: params.flatMap(param =>
      arms.map(a => {
        const shifts = (study.labShifts || []).filter(s => s.parameter === param && s.armId === a.armId);
        const total = shifts.reduce((sum, s) => sum + s.totalAssessed, 0);
        const high = shifts.reduce((sum, s) => sum + s.shiftToHigh, 0);
        const low = shifts.reduce((sum, s) => sum + s.shiftToLow, 0);
        const stayed = total - high - low;
        const pct = (n: number) => total > 0 ? `${n} (${((n / total) * 100).toFixed(1)}%)` : '0';
        return [param, a.armName, String(total), pct(high), pct(low), pct(stayed)];
      })
    ),
  };
}

// ── Convenience: render tables to ICH E3 markdown ───────────────────────────

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
