/**
 * Supplied-module QC rollup for CTD authoring (ICH M4).
 *
 * The per-module QC passes answer "is Module 2 / Module 4 internally sound?".
 * This report composes caller-supplied QC verdicts and checks references within
 * the supplied sets. It does not load current governed content or establish
 * application-specific requirements, scientific approval or dispatch readiness.
 *
 * Supplied M2.4 / M2.5 / M2.7 citations are compared with supplied report
 * references. This establishes consistency within those lists, not the
 * existence, approval or current version of the underlying reports.
 *
 * A clean partial QC remains useful. Its scoped result cannot establish full
 * dossier readiness, even when every supported module verdict is supplied.
 * Module 3 is explicitly not assessed by this aggregator.
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
  /** Assessment claimed by the supplied QC, not verified against stored content. */
  assessed: boolean;
  /** Caller-declared checked forms, summary sections or study ids; null if omitted. */
  checkedReferences: string[] | null;
  /** The supplied module's QC verdict only; never a module approval. */
  ready: boolean;
  errors: number;
  warnings: number;
}

export interface CtdAuthoringReadinessResult {
  /** Compatibility field: full dossier readiness is never established here. */
  ready: false;
  /** Whether any supplied module QC claims an assessment. */
  assessed: boolean;
  scope: {
    kind: 'SUPPLIED_MODULE_QC';
    basis: 'CALLER_SUPPLIED_UNVERIFIED';
    suppliedModules: string[];
    assessedModules: string[];
    omittedModules: string[];
    unassessedModules: string[];
    limitations: string[];
  };
  suppliedQc: { status: 'NOT_ASSESSED' | 'NO_BLOCKING_FINDINGS' | 'BLOCKING_FINDINGS' };
  fullDossier: { status: 'NOT_ASSESSED' };
  scientificApproval: { status: 'NOT_ASSESSED' };
  dispatchReadiness: { status: 'NOT_ASSESSED' };
  reportQualification: { status: 'NOT_ESTABLISHED' };
  feedForward: Array<{ area: string; checkedCitations: number; status: 'NOT_ASSESSED' | 'NO_BLOCKING_FINDINGS' | 'BLOCKING_FINDINGS' }>;
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
  /** Caller-declared CTD 4.2.x report references (for the supplied-set check). */
  m4ReportSections?: string[];
  /**
   * The built M2.5 Clinical Overview and/or M2.7 Clinical Summary — used only for
   * the M2.5/2.7←M5 feed-forward check. Their inputSectionKeys cite CSRs as
   * `m5.3.5/<studyId>`, each of which must trace to a study in the M5 program.
   */
  clinicalSummaries?: M2Summary[];
  /** Caller-declared CSR study ids (for the supplied-set check). */
  m5StudyIds?: string[];
}

/** Invalid supplied QC is a request error, not an empty or successful report. */
export class CtdQcInputError extends Error {
  readonly code = 'CTD_QC_INPUT_INVALID';
}

function record(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function stringList(value: unknown, label: string): asserts value is string[] {
  if (!Array.isArray(value) || value.some((item) => typeof item !== 'string' || !item.trim())) {
    throw new CtdQcInputError(`${label} must be an array of non-empty strings.`);
  }
}

function summaryReferences(value: unknown, label: string, sectionKeys: string[]): void {
  if (!record(value) || !sectionKeys.includes(String(value.sectionKey))) {
    throw new CtdQcInputError(`${label} must supply a sectionKey and inputSectionKeys.`);
  }
  stringList(value.inputSectionKeys, `${label}.inputSectionKeys`);
}

function suppliedFindings(values: unknown[], module: string): CtdReadinessFinding[] {
  return values.map((finding: unknown) => {
    if (!record(finding) || (finding.severity !== 'error' && finding.severity !== 'warning') || typeof finding.code !== 'string' || !finding.code.trim() || typeof finding.message !== 'string' || !finding.message.trim()) {
      throw new CtdQcInputError(`${module} findings must supply error/warning severity, code and message.`);
    }
    return { area: module, severity: finding.severity as CtdReadinessSeverity, code: finding.code, message: finding.message };
  });
}

function suppliedCounts(values: Record<string, unknown>, findings: CtdReadinessFinding[], module: string): { errors: number; warnings: number } {
  const errors = findings.filter((finding) => finding.severity === 'error').length;
  const warnings = findings.length - errors;
  for (const key of ['errors', 'warnings'] as const) {
    if (!Number.isSafeInteger(values[key]) || (values[key] as number) < 0) {
      throw new CtdQcInputError(`${module} counts must be non-negative safe integers.`);
    }
  }
  if (values.errors !== errors || values.warnings !== warnings) {
    throw new CtdQcInputError(`${module} counts must match the supplied findings.`);
  }
  return { errors, warnings };
}

function checkedModuleReferences(value: Record<string, unknown>, module: string): string[] | null {
  const references = module === 'M1' ? value.present : value.checked;
  if (references === undefined) return null;
  stringList(references, `${module}.checkedReferences`);
  return [...references];
}

function suppliedModule(value: unknown, module: string): { status: CtdModuleStatus; findings: CtdReadinessFinding[] } {
  if (!record(value) || typeof value.ready !== 'boolean' || !record(value.counts) || !Array.isArray(value.findings)) {
    throw new CtdQcInputError(`${module} must supply a boolean ready verdict, counts and findings[].`);
  }
  const findings = suppliedFindings(value.findings, module);
  const { errors, warnings } = suppliedCounts(value.counts, findings, module);
  if (value.assessed !== undefined && typeof value.assessed !== 'boolean') {
    throw new CtdQcInputError(`${module} assessed must be boolean when supplied.`);
  }
  if (value.ready && (errors !== 0 || value.assessed === false)) {
    throw new CtdQcInputError(`${module} cannot claim ready with blocking findings or no assessment.`);
  }
  // M4/M5 return ready:false with zero errors for an empty, unassessed set.
  // Preserve that genuine QC shape instead of manufacturing a missing-study
  // requirement for a program stage this endpoint cannot determine.
  const checkedReferences = checkedModuleReferences(value, module);
  const claimedAssessment = (value.assessed as boolean | undefined) ?? (value.ready || errors !== 0);
  const assessed = claimedAssessment && checkedReferences?.length !== 0;
  return { status: { module, present: true, assessed, checkedReferences, ready: value.ready, errors, warnings }, findings };
}

/** Preserve supplied module findings and identify omissions without stage assumptions. */
function moduleStatuses(input: CtdAuthoringReadinessInput, findings: CtdReadinessFinding[]): CtdModuleStatus[] {
  const modules: CtdModuleStatus[] = [];
  for (const [module, value] of [['M1', input.m1], ['M2', input.m2], ['M3', undefined], ['M4', input.m4], ['M5', input.m5]] as const) {
    if (value !== undefined) {
      const supplied = suppliedModule(value, module);
      modules.push(supplied.status);
      findings.push(...supplied.findings);
      if (!supplied.status.assessed) {
        findings.push({ area: module, severity: 'warning', code: 'MODULE_NOT_ASSESSED', message: `${module} supplied QC does not identify an assessed input set.` });
      }
    } else {
      modules.push({ module, present: false, assessed: false, checkedReferences: null, ready: false, errors: 0, warnings: 0 });
      findings.push({ area: module, severity: 'warning', code: module === 'M3' ? 'MODULE_NOT_ASSESSED' : 'MODULE_ABSENT', message: module === 'M3' ? 'Module 3 is not assessed by this supplied-module QC report.' : `No ${module} QC verdict supplied; applicability and content are not assessed.` });
    }
  }
  return modules;
}

function validateReferenceInputs(input: CtdAuthoringReadinessInput): void {
  if (input.m24Summary !== undefined) summaryReferences(input.m24Summary, 'm24Summary', ['2.4']);
  if (input.m4ReportSections !== undefined) stringList(input.m4ReportSections, 'm4ReportSections');
  if (input.clinicalSummaries !== undefined) {
    if (!Array.isArray(input.clinicalSummaries)) throw new CtdQcInputError('clinicalSummaries must be an array.');
    input.clinicalSummaries.forEach((summary, i) => summaryReferences(summary, `clinicalSummaries[${i}]`, ['2.5', '2.7']));
  }
  if (input.m5StudyIds !== undefined) stringList(input.m5StudyIds, 'm5StudyIds');
}

function nonclinicalReferenceCheck(input: CtdAuthoringReadinessInput, findings: CtdReadinessFinding[]): number {
  // FEED_FORWARD — compare the M2.4 citations with the supplied report references.
  if (input.m24Summary && input.m4ReportSections) {
    for (const cited of input.m24Summary.inputSectionKeys ?? []) {
      // A report reference at or below a cited section can answer it; a broader
      // ancestor cannot. Compare dotted boundaries: 4.2.30 cannot answer 4.2.3.
      const traced = input.m4ReportSections.some(
        (s) => s === cited || s.startsWith(`${cited}.`),
      );
      if (!traced) {
        findings.push({
          area: 'M2.4←M4',
          severity: 'error',
          code: 'FEED_FORWARD',
          message: `M2.4 Nonclinical Overview cites ${cited}, which has no corresponding Module 4 study report in the supplied reference set.`,
        });
      }
    }
    return input.m24Summary.inputSectionKeys.length;
  }
  return 0;
}

function clinicalReferenceCheck(input: CtdAuthoringReadinessInput, findings: CtdReadinessFinding[]): number {
  let checked = 0;
  // FEED_FORWARD — compare clinical citations with the supplied CSR study ids.
  if (input.clinicalSummaries && input.m5StudyIds) {
    const present = new Set(input.m5StudyIds);
    for (const summary of input.clinicalSummaries) {
      for (const cited of summary.inputSectionKeys ?? []) {
        checked += 1;
        // Clinical summaries cite CSRs as `m5.3.5/<studyId>` (or a bare studyId).
        const studyId = cited.includes('/') ? cited.slice(cited.lastIndexOf('/') + 1) : cited;
        if (!present.has(studyId)) {
          findings.push({
            area: `M2.${summary.sectionKey === '2.7' ? '7' : '5'}←M5`,
            severity: 'error',
            code: 'FEED_FORWARD',
            message: `M${summary.sectionKey} clinical summary cites CSR "${studyId}", which has no corresponding Module 5 clinical study report in the supplied reference set.`,
          });
        }
      }
    }
  }
  return checked;
}

function referenceStatus(area: string, checkedCitations: number, blocking: boolean): CtdAuthoringReadinessResult['feedForward'][number] {
  const status = checkedCitations === 0 ? 'NOT_ASSESSED' : blocking ? 'BLOCKING_FINDINGS' : 'NO_BLOCKING_FINDINGS';
  return { area, checkedCitations, status };
}

/** Compose supplied QC and reference findings; never certify a full dossier. */
export function aggregateCtdAuthoringReadiness(input: CtdAuthoringReadinessInput): CtdAuthoringReadinessResult {
  if (!record(input)) throw new CtdQcInputError('Supply a JSON object containing module QC verdicts.');
  const findings: CtdReadinessFinding[] = [];
  const modules = moduleStatuses(input, findings);
  validateReferenceInputs(input);
  const nonclinicalCitations = nonclinicalReferenceCheck(input, findings);
  const clinicalCitations = clinicalReferenceCheck(input, findings);
  findings.sort((a, b) => (a.area === b.area ? severityRank(a.severity) - severityRank(b.severity) : a.area.localeCompare(b.area)));

  const errors = findings.filter((f) => f.severity === 'error').length;
  const warnings = findings.length - errors;

  const assessed = modules.some((m) => m.assessed);
  const feedForward: CtdAuthoringReadinessResult['feedForward'] = [
    referenceStatus('M2.4←M4', nonclinicalCitations, findings.some((finding) => finding.area === 'M2.4←M4' && finding.severity === 'error')),
    referenceStatus('M2.5/2.7←M5', clinicalCitations, findings.some((finding) => /^M2\.[57]←M5$/.test(finding.area) && finding.severity === 'error')),
  ];
  return {
    ready: false,
    assessed,
    scope: {
      kind: 'SUPPLIED_MODULE_QC', basis: 'CALLER_SUPPLIED_UNVERIFIED',
      suppliedModules: modules.filter((module) => module.present).map((module) => module.module),
      assessedModules: modules.filter((module) => module.assessed).map((module) => module.module),
      omittedModules: modules.filter((module) => !module.present).map((module) => module.module),
      unassessedModules: modules.filter((module) => !module.assessed).map((module) => module.module),
      limitations: [
        'Caller-supplied QC verdicts and reference sets are unverified; current governed content and source versions were not loaded.',
        'Module 3, full dossier coverage and application-, market- and stage-specific applicability are not assessed.',
        'Omitted modules are not inferred to be required or inapplicable; partial QC may be useful for an early IND.',
        'Supplied QC and reference checks do not establish scientific approval, qualified report evidence, packaging conformance, agency acceptance or dispatch readiness.',
      ],
    },
    suppliedQc: { status: errors > 0 ? 'BLOCKING_FINDINGS' : assessed ? 'NO_BLOCKING_FINDINGS' : 'NOT_ASSESSED' },
    fullDossier: { status: 'NOT_ASSESSED' }, scientificApproval: { status: 'NOT_ASSESSED' },
    dispatchReadiness: { status: 'NOT_ASSESSED' }, reportQualification: { status: 'NOT_ESTABLISHED' },
    feedForward, modules, findings, counts: { errors, warnings },
  };
}

function severityRank(s: CtdReadinessSeverity): number {
  return s === 'error' ? 0 : 1;
}
