/**
 * IND Annual Report / DSUR Service — 21 CFR 312.33 + ICH E2F
 *
 * Pure (no-DB) assembler for the FDA IND Annual Report (21 CFR 312.33) which, in
 * practice, is filed as the ICH E2F Development Safety Update Report (DSUR). This
 * module builds a structured section model from the data the caller supplies and
 * returns a gap list of sections that are still empty / incomplete so a reviewer
 * can see what is missing before submission.
 *
 * 21 CFR 312.33 requires, within 60 days of the IND anniversary:
 *   (a) Individual study information — status of each ongoing/completed study.
 *   (b) Summary information — most frequent/serious AEs, IND safety reports filed
 *       in the period, deaths, subjects dropped for AEs, etc.
 *   (c) A description of the general investigational plan for the coming year.
 *   (d) Investigator's Brochure (IB) revisions.
 *   (e) A description of any significant Phase 1 protocol modifications.
 *   (f) Foreign marketing developments.
 *   (g) A log of outstanding business with the FDA.
 *
 * ICH E2F DSUR section mapping is provided alongside each section for sponsors
 * who file the DSUR in lieu of the 312.33 narrative.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * INTEGRATION NOTES (human must wire):
 *   - PURE module: no persistence, no audit. To file the assembled report, route
 *     the section model into the submission-service as an ectd sequence of type
 *     'annual' (TODO(persistence)) — see ind-amendment-service for the leaf
 *     planning pattern, or build a dedicated annual-report intent.
 *   - The caller must pull the period inputs (study statuses, IND safety reports
 *     filed in the period, IB changes, line listings) from the relevant data
 *     stores; this assembler does not query them.
 *   - The 60-day anniversary due-date math is provided by `computeAnnualReportDue`.
 *
 * @module server/services/ind-lifecycle/ind-annual-report-service
 */

import type { SeriousnessCriteria } from '../compliance/pharmacovigilanceService';
import type { IndSafetyReportObligation } from './ind-safety-report-service';

// ---------------------------------------------------------------------------
// Input model (caller-supplied period data)
// ---------------------------------------------------------------------------

/** Status of an individual study during the reporting period (312.33(a)). */
export interface StudyStatusEntry {
  studyId: string;
  title: string;
  phase: '1' | '2' | '3' | '4' | 'other';
  status: 'ongoing' | 'completed' | 'suspended' | 'terminated' | 'not_yet_started';
  /** Subjects entered/planned in the period. */
  subjectsEnrolled?: number;
  subjectsPlanned?: number;
}

/** An IND Safety Report filed during the period (312.33(b)). */
export interface PeriodSafetyReportEntry {
  reportId: string;
  obligation: IndSafetyReportObligation;
  reactionPt: string | null;
  seriousnessCriteria: SeriousnessCriteria;
  /** Date the report was submitted to FDA. */
  submittedAt: Date;
}

/** An IB revision during the period (312.33(d)). */
export interface IbChangeEntry {
  ibVersion: string;
  effectiveDate: Date;
  summary: string;
}

/** All inputs needed to assemble the IND annual report / DSUR. */
export interface IndAnnualReportInput {
  organizationId: string;
  projectId: string;
  indNumber: string;
  productName: string;
  /** International Birth Date for DSUR periodicity (E2F) — IND effective date for 312.33. */
  reportingPeriodStart: Date;
  reportingPeriodEnd: Date;
  studyStatuses: StudyStatusEntry[];
  safetyReportsInPeriod: PeriodSafetyReportEntry[];
  ibChanges: IbChangeEntry[];
  /** Free-text summary of the safety information for the period (312.33(b)). */
  safetySummary?: string;
  /** General investigational plan for the coming year (312.33(c)). */
  investigationalPlan?: string;
  /** Significant Phase 1 protocol modifications (312.33(e)). */
  phase1ProtocolModifications?: string;
  /** Foreign marketing developments (312.33(f)). */
  foreignMarketingDevelopments?: string;
  /** Log of outstanding business with FDA (312.33(g)). */
  outstandingBusiness?: string;
}

// ---------------------------------------------------------------------------
// Output section model
// ---------------------------------------------------------------------------

export interface AnnualReportSection {
  key: string;
  heading: string;
  /** 21 CFR 312.33 sub-paragraph. */
  cfrRef: string;
  /** Corresponding ICH E2F DSUR section. */
  dsurRef: string;
  body: string;
  /** Whether the section currently has substantive content. */
  complete: boolean;
}

export interface IndAnnualReportModel {
  reportType: 'IND_ANNUAL_REPORT';
  indNumber: string;
  productName: string;
  organizationId: string;
  projectId: string;
  reportingPeriod: { start: Date; end: Date };
  sections: AnnualReportSection[];
  /** Keys of sections that are incomplete and must be addressed before filing. */
  gaps: AnnualReportGap[];
}

export interface AnnualReportGap {
  sectionKey: string;
  heading: string;
  cfrRef: string;
  message: string;
}

// ---------------------------------------------------------------------------
// Assembler (pure)
// ---------------------------------------------------------------------------

/**
 * Assemble the structured IND Annual Report / DSUR section model and gap list.
 * Pure / deterministic.
 */
export function assembleIndAnnualReport(input: IndAnnualReportInput): IndAnnualReportModel {
  const sections: AnnualReportSection[] = [];

  // (a) Individual study information.
  {
    const hasStudies = input.studyStatuses.length > 0;
    const body = hasStudies
      ? input.studyStatuses
          .map(
            (s) =>
              `${s.studyId} (Phase ${s.phase}) — ${s.title}: ${s.status}` +
              (typeof s.subjectsEnrolled === 'number'
                ? `; enrolled ${s.subjectsEnrolled}${typeof s.subjectsPlanned === 'number' ? `/${s.subjectsPlanned}` : ''}`
                : ''),
          )
          .join('\n')
      : '';
    sections.push({
      key: 'individual_study_status',
      heading: 'Individual Study Information',
      cfrRef: '312.33(a)',
      dsurRef: 'E2F §6 (Studies in the Period)',
      body,
      complete: hasStudies,
    });
  }

  // (b) Summary safety information + IND safety reports list.
  {
    const reportLines = input.safetyReportsInPeriod.map(
      (r) =>
        `${r.reportId} [${r.obligation}] ${r.reactionPt ?? 'unspecified reaction'} ` +
        `(${r.seriousnessCriteria}) — submitted ${toIsoDate(r.submittedAt)}`,
    );
    const counts = countByObligation(input.safetyReportsInPeriod);
    const summaryBody = [
      input.safetySummary ?? '',
      `IND Safety Reports filed in period: ${input.safetyReportsInPeriod.length} ` +
        `(7-day: ${counts.SEVEN_DAY}, 15-day: ${counts.FIFTEEN_DAY}).`,
      reportLines.length > 0 ? reportLines.join('\n') : '',
    ]
      .filter(Boolean)
      .join('\n');
    sections.push({
      key: 'summary_safety_information',
      heading: 'Summary of Safety Information',
      cfrRef: '312.33(b)',
      dsurRef: 'E2F §§7–16 (Safety Summary)',
      body: summaryBody,
      // Complete iff a narrative summary was supplied (the list alone is not a summary).
      complete: Boolean(input.safetySummary && input.safetySummary.trim().length > 0),
    });

    // Dedicated IND safety reports list section (cross-reference to 312.32 filings).
    sections.push({
      key: 'ind_safety_reports_list',
      heading: 'IND Safety Reports Submitted During the Period',
      cfrRef: '312.33(b)',
      dsurRef: 'E2F §15 / Appendix (Line Listings)',
      body: reportLines.length > 0 ? reportLines.join('\n') : 'No IND Safety Reports were submitted during the period.',
      // This section is always "complete" — an empty period is a valid, explicit state.
      complete: true,
    });
  }

  // (c) General investigational plan.
  sections.push({
    key: 'investigational_plan',
    heading: 'General Investigational Plan for the Coming Year',
    cfrRef: '312.33(c)',
    dsurRef: 'E2F §4 (Update on Actions Taken)',
    body: input.investigationalPlan ?? '',
    complete: nonEmpty(input.investigationalPlan),
  });

  // (d) IB changes.
  {
    const hasIb = input.ibChanges.length > 0;
    const body = hasIb
      ? input.ibChanges
          .map((c) => `IB ${c.ibVersion} (effective ${toIsoDate(c.effectiveDate)}): ${c.summary}`)
          .join('\n')
      : 'No revisions to the Investigator\'s Brochure were made during the period.';
    sections.push({
      key: 'ib_changes',
      heading: "Investigator's Brochure Revisions",
      cfrRef: '312.33(d)',
      dsurRef: 'E2F §3 (Changes to RSI)',
      body,
      // An explicit "no changes" is complete; if changes exist they are listed.
      complete: true,
    });
  }

  // (e) Significant Phase 1 protocol modifications.
  sections.push({
    key: 'phase1_protocol_modifications',
    heading: 'Significant Phase 1 Protocol Modifications',
    cfrRef: '312.33(e)',
    dsurRef: 'E2F §4 (Actions Taken for Safety)',
    body: input.phase1ProtocolModifications ?? '',
    complete: nonEmpty(input.phase1ProtocolModifications),
  });

  // (f) Foreign marketing developments.
  sections.push({
    key: 'foreign_marketing_developments',
    heading: 'Foreign Marketing Developments',
    cfrRef: '312.33(f)',
    dsurRef: 'E2F §5 (Changes to Ref. Safety / Marketing)',
    body: input.foreignMarketingDevelopments ?? '',
    complete: nonEmpty(input.foreignMarketingDevelopments),
  });

  // (g) Outstanding business log.
  sections.push({
    key: 'outstanding_business',
    heading: 'Log of Outstanding Business with FDA',
    cfrRef: '312.33(g)',
    dsurRef: 'E2F §2 (Worldwide Marketing Approval Status)',
    body: input.outstandingBusiness ?? '',
    complete: nonEmpty(input.outstandingBusiness),
  });

  const gaps: AnnualReportGap[] = sections
    .filter((s) => !s.complete)
    .map((s) => ({
      sectionKey: s.key,
      heading: s.heading,
      cfrRef: s.cfrRef,
      message: `Section "${s.heading}" (${s.cfrRef}) is incomplete and must be authored before filing.`,
    }));

  return {
    reportType: 'IND_ANNUAL_REPORT',
    indNumber: input.indNumber,
    productName: input.productName,
    organizationId: input.organizationId,
    projectId: input.projectId,
    reportingPeriod: { start: input.reportingPeriodStart, end: input.reportingPeriodEnd },
    sections,
    gaps,
  };
}

/**
 * Compute the IND annual report due date: within 60 days of the IND anniversary
 * (the anniversary of the date the IND went into effect). 312.33. Pure.
 *
 * @param indEffectiveDate the date the IND went into effect
 * @param asOf reference date used to pick the relevant anniversary year
 */
export function computeAnnualReportDue(indEffectiveDate: Date, asOf: Date = new Date()): Date {
  // Find the next anniversary on/after `asOf`'s year, based on the effective date.
  const anniversary = new Date(indEffectiveDate);
  anniversary.setFullYear(asOf.getFullYear());
  if (anniversary.getTime() < asOf.getTime()) {
    anniversary.setFullYear(asOf.getFullYear() + 1);
  }
  const due = new Date(anniversary);
  due.setDate(due.getDate() + 60);
  return due;
}

// ---------------------------------------------------------------------------
// Local helpers (pure)
// ---------------------------------------------------------------------------

function countByObligation(
  reports: PeriodSafetyReportEntry[],
): Record<IndSafetyReportObligation, number> {
  const counts: Record<IndSafetyReportObligation, number> = {
    SEVEN_DAY: 0,
    FIFTEEN_DAY: 0,
    NOT_REPORTABLE: 0,
  };
  for (const r of reports) {
    counts[r.obligation] += 1;
  }
  return counts;
}

function nonEmpty(s: string | undefined | null): boolean {
  return typeof s === 'string' && s.trim().length > 0;
}

function toIsoDate(d: Date): string {
  return d.toISOString().slice(0, 10);
}
