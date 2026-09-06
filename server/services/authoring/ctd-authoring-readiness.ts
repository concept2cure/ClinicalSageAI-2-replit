/**
 * CTD authoring-readiness aggregator — cross-module rollup (ICH M4).
 *
 * The per-module QC passes answer "is Module 2 / Module 4 internally sound?".
 * This aggregator answers the RA lead's question — "is the IND assembly-ready
 * across modules?" — by composing those verdicts into a single rollup and
 * adding the one check neither module can make alone:
 *
 *   - The M2.4 Nonclinical Overview must trace to study reports that exist and
 *     passed the Module 4 assembly QC (FEED_FORWARD): every CTD 4.2.x section
 *     the M2.4 summary cites must correspond to a checked nonclinical report.
 *
 * The verdict is honest-by-construction: `ready` is true only when every
 * supplied module QC is ready AND there are no cross-module errors. Pure /
 * deterministic — it composes verdicts, it does not re-run the QCs.
 *
 * @module server/services/authoring/ctd-authoring-readiness
 */

import type { M2QcResult } from './m2-summary-qc';
import type { M4QcResult } from './m4-nonclinical-qc';
import type { M5QcResult } from './m5-clinical-qc';
import type { M1QcResult } from '../ind-forms/ind-form-qc';
import type { M2Summary } from '../m2-summary-builders';

export type CtdReadinessSeverity = 'error' | 'warning';

export interface CtdReadinessFinding {
  /** The module/area the finding concerns ('M2', 'M4', or 'M2.4←M4'). */
  area: string;
  severity: CtdReadinessSeverity;
  code: string;
  message: string;
}

export interface CtdModuleStatus {
  module: string;
  present: boolean;
  ready: boolean;
  errors: number;
  warnings: number;
}

export interface CtdAuthoringReadinessResult {
  ready: boolean;
  /**
   * Whether at least one module QC verdict was supplied. With none, `ready`
   * was true (absence is a warning and only errors gate readiness) and the
   * report printed "READY — no blocking findings" over nothing assessed.
   */
  assessed: boolean;
  modules: CtdModuleStatus[];
  findings: CtdReadinessFinding[];
  counts: { errors: number; warnings: number };
}

export interface CtdAuthoringReadinessInput {
  /** Module 1 forms cross-validation verdict (from runM1FormsQc). */
  m1?: M1QcResult;
  /** Module 2 cross-summary QC verdict (from runM2SummaryQc). */
  m2?: M2QcResult;
  /** Module 4 nonclinical assembly QC verdict (from runM4NonclinicalQc). */
  m4?: M4QcResult;
  /** Module 5 clinical assembly QC verdict (from runM5ClinicalQc). */
  m5?: M5QcResult;
  /**
   * The built M2.4 Nonclinical Overview — used only for the M2.4←M4 feed-forward
   * check. Its inputSectionKeys (CTD 4.2.x sections) must trace to the M4 program.
   */
  m24Summary?: M2Summary;
  /** The CTD 4.2.x sections actually present in the M4 program (for feed-forward). */
  m4ReportSections?: string[];
  /**
   * The built M2.5 Clinical Overview and/or M2.7 Clinical Summary — used only for
   * the M2.5/2.7←M5 feed-forward check. Their inputSectionKeys cite CSRs as
   * `m5.3.5/<studyId>`, each of which must trace to a study in the M5 program.
   */
  clinicalSummaries?: M2Summary[];
  /** The CSR study ids actually present in the M5 program (for feed-forward). */
  m5StudyIds?: string[];
}

/**
 * Aggregate the per-module authoring QC verdicts into a single CTD readiness
 * rollup. Pure / deterministic.
 */
export function aggregateCtdAuthoringReadiness(input: CtdAuthoringReadinessInput): CtdAuthoringReadinessResult {
  const findings: CtdReadinessFinding[] = [];
  const modules: CtdModuleStatus[] = [];

  if (input.m1) {
    modules.push({ module: 'M1', present: true, ready: input.m1.ready, errors: input.m1.counts.errors, warnings: input.m1.counts.warnings });
    if (!input.m1.ready) {
      findings.push({ area: 'M1', severity: 'error', code: 'MODULE_NOT_READY', message: `Module 1 forms are not assembly-ready (${input.m1.counts.errors} error(s)).` });
    }
  } else {
    modules.push({ module: 'M1', present: false, ready: false, errors: 0, warnings: 0 });
    findings.push({ area: 'M1', severity: 'warning', code: 'MODULE_ABSENT', message: 'No Module 1 QC verdict supplied.' });
  }

  if (input.m2) {
    modules.push({ module: 'M2', present: true, ready: input.m2.ready, errors: input.m2.counts.errors, warnings: input.m2.counts.warnings });
    if (!input.m2.ready) {
      findings.push({ area: 'M2', severity: 'error', code: 'MODULE_NOT_READY', message: `Module 2 summaries are not assembly-ready (${input.m2.counts.errors} error(s)).` });
    }
  } else {
    modules.push({ module: 'M2', present: false, ready: false, errors: 0, warnings: 0 });
    findings.push({ area: 'M2', severity: 'warning', code: 'MODULE_ABSENT', message: 'No Module 2 QC verdict supplied.' });
  }

  if (input.m4) {
    modules.push({ module: 'M4', present: true, ready: input.m4.ready, errors: input.m4.counts.errors, warnings: input.m4.counts.warnings });
    if (!input.m4.ready) {
      findings.push({ area: 'M4', severity: 'error', code: 'MODULE_NOT_READY', message: `Module 4 nonclinical program is not assembly-ready (${input.m4.counts.errors} error(s)).` });
    }
  } else {
    modules.push({ module: 'M4', present: false, ready: false, errors: 0, warnings: 0 });
    findings.push({ area: 'M4', severity: 'warning', code: 'MODULE_ABSENT', message: 'No Module 4 QC verdict supplied.' });
  }

  if (input.m5) {
    modules.push({ module: 'M5', present: true, ready: input.m5.ready, errors: input.m5.counts.errors, warnings: input.m5.counts.warnings });
    if (!input.m5.ready) {
      findings.push({ area: 'M5', severity: 'error', code: 'MODULE_NOT_READY', message: `Module 5 clinical program is not assembly-ready (${input.m5.counts.errors} error(s)).` });
    }
  } else {
    modules.push({ module: 'M5', present: false, ready: false, errors: 0, warnings: 0 });
    findings.push({ area: 'M5', severity: 'warning', code: 'MODULE_ABSENT', message: 'No Module 5 QC verdict supplied.' });
  }

  // FEED_FORWARD — the M2.4 overview must trace to study reports that exist.
  if (input.m24Summary && input.m4ReportSections) {
    const present = new Set(input.m4ReportSections);
    for (const cited of input.m24Summary.inputSectionKeys ?? []) {
      // M2.4 cites CTD 4.2.x sections; a cited section with no corresponding
      // (prefix-matching) report in the program is an orphan reference.
      const traced = input.m4ReportSections.some((s) => s === cited || s.startsWith(cited) || cited.startsWith(s));
      if (!present.has(cited) && !traced) {
        findings.push({
          area: 'M2.4←M4',
          severity: 'error',
          code: 'FEED_FORWARD',
          message: `M2.4 Nonclinical Overview cites ${cited}, which has no corresponding Module 4 study report.`,
        });
      }
    }
  }

  // FEED_FORWARD — the M2.5/2.7 clinical summaries must trace to CSRs that exist.
  if (input.clinicalSummaries && input.m5StudyIds) {
    const present = new Set(input.m5StudyIds);
    for (const summary of input.clinicalSummaries) {
      for (const cited of summary.inputSectionKeys ?? []) {
        // Clinical summaries cite CSRs as `m5.3.5/<studyId>` (or a bare studyId).
        const studyId = cited.includes('/') ? cited.slice(cited.lastIndexOf('/') + 1) : cited;
        if (!present.has(studyId)) {
          findings.push({
            area: `M2.${summary.sectionKey === '2.7' ? '7' : '5'}←M5`,
            severity: 'error',
            code: 'FEED_FORWARD',
            message: `M${summary.sectionKey} clinical summary cites CSR "${studyId}", which has no corresponding Module 5 clinical study report.`,
          });
        }
      }
    }
  }

  findings.sort((a, b) => (a.area === b.area ? severityRank(a.severity) - severityRank(b.severity) : a.area.localeCompare(b.area)));

  const errors = findings.filter((f) => f.severity === 'error').length;
  const warnings = findings.length - errors;

  const assessed = modules.some((m) => m.present);
  return { ready: errors === 0 && assessed, assessed, modules, findings, counts: { errors, warnings } };
}

function severityRank(s: CtdReadinessSeverity): number {
  return s === 'error' ? 0 : 1;
}
