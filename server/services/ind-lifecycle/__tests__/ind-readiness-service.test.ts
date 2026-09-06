/**
 * IND readiness evaluator tests — deterministic verdict over the canonical
 * 108-section IND map + Module 1 forms + safety clock. No DB, no AI.
 */

import { describe, it, expect } from 'vitest';
import { evaluateIndReadiness, REQUIRED_FORMS_INITIAL } from '../ind-readiness-service';
import {
  getAllINDSections,
  type SectionStatus,
} from '../../../../services/regulatory/ind-ectd-sections';

// Build a status map marking every initial-required section as "signed".
/* Sources from getAllINDSections, not getRequiredSections. The latter has
   already narrowed to `required === true`, so filtering IT by
   requiredForAmendment yields only the intersection — the same mistake the
   service made, which would have let this helper hide the fix. */
function allRequiredSigned(filing: 'initial' | 'amendment'): Record<string, SectionStatus> {
  const map: Record<string, SectionStatus> = {};
  for (const s of getAllINDSections()) {
    if (filing === 'amendment' ? s.requiredForAmendment : s.required) {
      map[s.code] = 'signed';
    }
  }
  return map;
}

describe('evaluateIndReadiness', () => {
  it('an empty initial filing is NOT ready: every required section + form is a blocker', () => {
    const report = evaluateIndReadiness({ filingType: 'initial', sectionStatus: {} });
    expect(report.ready).toBe(false);
    expect(report.requiredSections.completed).toBe(0);
    expect(report.requiredSections.incomplete.length).toBe(report.requiredSections.total);
    // All three Module 1 forms missing.
    expect(report.forms.missing).toEqual([...REQUIRED_FORMS_INITIAL]);
    expect(report.blockers.some((b) => b.kind === 'required_form')).toBe(true);
    expect(report.overallPercentage).toBe(0);
    expect(report.warnings.length).toBeGreaterThan(0);
  });

  it('a fully-complete initial filing is ready at 100%', () => {
    const report = evaluateIndReadiness({
      filingType: 'initial',
      sectionStatus: allRequiredSigned('initial'),
      completedForms: [...REQUIRED_FORMS_INITIAL],
    });
    expect(report.ready).toBe(true);
    expect(report.blockers).toHaveLength(0);
    expect(report.overallPercentage).toBe(100);
    expect(report.requiredSections.incomplete).toHaveLength(0);
    expect(report.forms.missing).toHaveLength(0);
  });

  it('a non-complete section status (e.g. drafting) does not count as complete', () => {
    const map = allRequiredSigned('initial');
    const firstCode = Object.keys(map)[0];
    map[firstCode] = 'drafting';
    const report = evaluateIndReadiness({
      filingType: 'initial',
      sectionStatus: map,
      completedForms: [...REQUIRED_FORMS_INITIAL],
    });
    expect(report.ready).toBe(false);
    expect(report.requiredSections.incomplete.some((g) => g.code === firstCode)).toBe(true);
  });

  it('amendments do not gate on the Module 1 initial-filing forms', () => {
    const report = evaluateIndReadiness({
      filingType: 'amendment',
      sectionStatus: allRequiredSigned('amendment'),
    });
    expect(report.forms.required).toHaveLength(0);
    expect(report.blockers.some((b) => b.kind === 'required_form')).toBe(false);
    expect(report.ready).toBe(true);
  });

  it('an overdue expedited safety report blocks filing even when sections are complete', () => {
    const report = evaluateIndReadiness({
      filingType: 'initial',
      sectionStatus: allRequiredSigned('initial'),
      completedForms: [...REQUIRED_FORMS_INITIAL],
      overdueSafetyReports: 2,
    });
    expect(report.ready).toBe(false);
    expect(report.blockers.some((b) => b.kind === 'overdue_safety_report')).toBe(true);
  });

  it('reports per-module progress', () => {
    const report = evaluateIndReadiness({
      filingType: 'initial',
      sectionStatus: allRequiredSigned('initial'),
      completedForms: [...REQUIRED_FORMS_INITIAL],
    });
    expect(report.moduleProgress.length).toBeGreaterThan(0);
    expect(report.moduleProgress.every((m) => m.percentage >= 0 && m.percentage <= 100)).toBe(true);
  });
});

/**
 * The amendment required-set was two sections short.
 *
 * `getRequiredSections()` already narrows to `required === true`, so filtering
 * ITS result by `requiredForAmendment` could only ever return the intersection.
 * m5.3.5.1 and m5.3.5.2 — the ICH E3 clinical study reports for controlled and
 * uncontrolled studies — are marked `required: false, requiredForAmendment:
 * true` on purpose: an initial IND has no study results to file, an information
 * amendment under 21 CFR 312.31(a)(2) reporting new clinical data does. Both
 * were dropped before the predicate saw them, so an amendment came back with
 * two required sections silently unassessed.
 */
describe('evaluateIndReadiness — the amendment required set', () => {
  it('requires the ICH E3 clinical study reports on an amendment', () => {
    const report = evaluateIndReadiness({ filingType: 'amendment', sectionStatus: {} });
    const codes = report.requiredSections.incomplete.map((g) => g.code);

    expect(codes).toContain('m5.3.5.1');
    expect(codes).toContain('m5.3.5.2');
    expect(report.ready).toBe(false);
  });

  it('does not add them to an initial IND, which has no study results to file', () => {
    const report = evaluateIndReadiness({ filingType: 'initial', sectionStatus: {} });
    const codes = report.requiredSections.incomplete.map((g) => g.code);

    expect(codes).not.toContain('m5.3.5.1');
    expect(codes).not.toContain('m5.3.5.2');
  });
});
