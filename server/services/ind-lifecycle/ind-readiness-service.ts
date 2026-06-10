/**
 * IND submission readiness evaluator.
 *
 * The audit flagged that the platform had no requirement-checklist artifact: a
 * single, deterministic verdict on whether an IND (initial or amendment) is
 * ready to file. This service produces exactly that by evaluating a submission's
 * section/form/safety state against the canonical IND section map
 * (services/regulatory/ind-ectd-sections.ts — the 108-section blueprint, the
 * source of truth corrected in the module-model fix) plus the Module 1 forms and
 * the IND safety-reporting clock.
 *
 * Pure and deterministic: the same input yields the same report. No DB, no AI.
 *
 * INTEGRATION NOTES (human):
 *  - Exposed at POST /api/ind-lifecycle/readiness (see ind-lifecycle.routes.ts).
 *  - The caller assembles IndReadinessInput from the submission's section status
 *    (e.g. coauthor_documents / submission_leaves state), the generated/approved
 *    Module 1 forms, and the count of expedited IND safety reports past deadline
 *    (from pharmacovigilanceService / ind-safety-report-service).
 */

import {
  getRequiredSections,
  getModuleProgress,
  type SectionStatus,
  type CTDModule,
} from '../../../services/regulatory/ind-ectd-sections.js';

export type IndFilingType = 'initial' | 'amendment';

/** Section statuses that count as "done" for readiness. */
const COMPLETE_STATUSES: ReadonlySet<SectionStatus> = new Set<SectionStatus>([
  'approved',
  'signed',
  'locked',
]);

/** Module 1 forms required to file an initial IND (21 CFR 312.23). */
export const REQUIRED_FORMS_INITIAL = ['FDA_1571', 'FDA_1572', 'FDA_3674'] as const;

export interface IndReadinessInput {
  /** Initial IND filing vs an amendment (changes which sections are required). */
  filingType: IndFilingType;
  /** eCTD section code -> authoring status. Absent codes are treated not_started. */
  sectionStatus: Record<string, SectionStatus>;
  /** Completed Module 1 form ids (e.g. 'FDA_1571'). Only checked for initial filings. */
  completedForms?: string[];
  /** Count of expedited IND safety reports (312.32) past their reporting deadline. */
  overdueSafetyReports?: number;
}

export interface ModuleProgress {
  module: CTDModule;
  title: string;
  total: number;
  completed: number;
  inProgress: number;
  percentage: number;
}

export interface ReadinessGap {
  code: string;
  title: string;
  module: CTDModule;
  status: SectionStatus;
  regulatoryRef: string;
}

export interface ReadinessBlocker {
  kind: 'required_section' | 'required_form' | 'overdue_safety_report';
  code: string;
  message: string;
}

export interface IndReadinessReport {
  filingType: IndFilingType;
  /** True only when there are zero blockers. */
  ready: boolean;
  /** 0–100 weighted across required-section completion and required forms. */
  overallPercentage: number;
  moduleProgress: ModuleProgress[];
  requiredSections: {
    total: number;
    completed: number;
    /** Required sections that are not yet approved/signed/locked. */
    incomplete: ReadinessGap[];
  };
  forms: {
    required: string[];
    completed: string[];
    missing: string[];
  };
  blockers: ReadinessBlocker[];
  warnings: string[];
}

function statusOf(map: Record<string, SectionStatus>, code: string): SectionStatus {
  return map[code] ?? 'not_started';
}

/**
 * Evaluate IND filing readiness. Deterministic; the report's `ready` flag is the
 * authoritative gate (true ⇔ no blockers).
 */
export function evaluateIndReadiness(input: IndReadinessInput): IndReadinessReport {
  const sectionStatus = input.sectionStatus ?? {};
  const isAmendment = input.filingType === 'amendment';

  // 1. Required sections for this filing type.
  const required = getRequiredSections().filter((s) =>
    isAmendment ? s.requiredForAmendment : s.required,
  );

  const incomplete: ReadinessGap[] = [];
  let completed = 0;
  for (const s of required) {
    const status = statusOf(sectionStatus, s.code);
    if (COMPLETE_STATUSES.has(status)) {
      completed += 1;
    } else {
      incomplete.push({
        code: s.code,
        title: s.title,
        module: s.module,
        status,
        regulatoryRef: s.regulatoryRef,
      });
    }
  }

  // 2. Module 1 forms — only gating for an initial IND.
  const requiredForms: string[] = isAmendment ? [] : [...REQUIRED_FORMS_INITIAL];
  const completedForms = (input.completedForms ?? []).filter((f) => requiredForms.includes(f));
  const missingForms = requiredForms.filter((f) => !completedForms.includes(f));

  // 3. Module progress (reuse the canonical per-module roll-up).
  const statusMap = new Map<string, SectionStatus>(Object.entries(sectionStatus));
  const moduleProgress = getModuleProgress(statusMap) as ModuleProgress[];

  // 4. Blockers.
  const blockers: ReadinessBlocker[] = [];
  for (const gap of incomplete) {
    blockers.push({
      kind: 'required_section',
      code: gap.code,
      message: `Required section ${gap.code} (${gap.title}) is ${gap.status} — must be approved/signed before filing.`,
    });
  }
  for (const form of missingForms) {
    blockers.push({
      kind: 'required_form',
      code: form,
      message: `Required Module 1 form ${form} is not complete.`,
    });
  }
  const overdue = input.overdueSafetyReports ?? 0;
  if (overdue > 0) {
    blockers.push({
      kind: 'overdue_safety_report',
      code: 'safety',
      message: `${overdue} expedited IND safety report(s) past the 21 CFR 312.32 reporting deadline.`,
    });
  }

  // 5. Weighted overall percentage: required sections + required forms, each
  //    item weighted equally. With no required items the package is vacuously
  //    100% (e.g. an amendment that requires no fixed sections).
  const totalItems = required.length + requiredForms.length;
  const doneItems = completed + completedForms.length;
  const overallPercentage = totalItems === 0 ? 100 : Math.round((doneItems / totalItems) * 100);

  const warnings: string[] = [];
  if (Object.keys(sectionStatus).length === 0) {
    warnings.push('No section status was supplied; every required section is treated as not_started.');
  }

  return {
    filingType: input.filingType,
    ready: blockers.length === 0,
    overallPercentage,
    moduleProgress,
    requiredSections: { total: required.length, completed, incomplete },
    forms: { required: requiredForms, completed: completedForms, missing: missingForms },
    blockers,
    warnings,
  };
}
