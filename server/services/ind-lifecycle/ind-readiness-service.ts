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
  getAllINDSections,
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
  kind: 'required_section' | 'required_form' | 'overdue_safety_report' | 'nothing_assessed';
  code: string;
  message: string;
}

export interface IndReadinessReport {
  filingType: IndFilingType;
  /** True only when there are zero blockers. */
  ready: boolean;
  /**
   * 0–100 weighted across required-section completion and required forms.
   * NULL when nothing is required for this filing type — there is then no
   * ratio and no assessment, and a `nothing_assessed` blocker says so.
   */
  overallPercentage: number | null;
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

  /* 1. Required sections for this filing type.
     ── The amendment set was two sections short ─────────────────────────────
     This read `getRequiredSections().filter(...)`, and getRequiredSections()
     ALREADY narrows to `s.required === true`. Filtering that by
     `requiredForAmendment` can therefore only ever return the intersection, so
     any section marked required-for-an-amendment but not for an initial IND was
     dropped before the predicate saw it.

     Two sections are exactly that, and deliberately so: m5.3.5.1 and m5.3.5.2,
     the ICH E3 clinical study reports for controlled and uncontrolled studies.
     An initial IND has no study results to file; an information amendment under
     21 CFR 312.31(a)(2) that reports new clinical data does. The readiness
     report never asked for either, so an amendment came back with two required
     sections silently unassessed and two blockers it should have raised.

     Sourcing from getAllINDSections() applies the intended predicate to the
     whole set. The initial-IND set is unchanged: filtering all sections by
     `required` is what getRequiredSections() returns. */
  const required = getAllINDSections().filter((s) =>
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

  /* 5. Weighted overall percentage: required sections + required forms, each
        item weighted equally.

     This ended `totalItems === 0 ? 100`, described in its own comment as
     "vacuously 100%". A filing whose required-artifact set came back empty was
     reported as 100% complete with an empty blocker list — and since
     `ready === blockers.length === 0`, as READY TO FILE. Nothing had been
     checked. The comment's example (an amendment requiring no fixed sections)
     was also wrong: an amendment requires sixteen.

     An empty required set is the absence of an assessment. The percentage is
     null and a blocker says so, which makes `ready` false through the same
     rule every other blocker uses.

     Defence in depth, and said plainly: no filing type produces an empty set
     today (initial requires 30, amendment 16), so this branch is not reachable
     through the public API and is NOT covered by a test that has been seen to
     fail. It exists so that a future filing type, or an artifact matrix that
     comes back empty, cannot be reported as a complete and ready package. */
  const totalItems = required.length + requiredForms.length;
  const doneItems = completed + completedForms.length;
  const overallPercentage: number | null =
    totalItems === 0 ? null : Math.round((doneItems / totalItems) * 100);
  if (totalItems === 0) {
    blockers.push({
      kind: 'nothing_assessed',
      code: 'required_set_empty',
      message:
        'No required sections or forms are defined for this filing type, so filing readiness has not been assessed. This is not a complete package.',
    });
  }

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
