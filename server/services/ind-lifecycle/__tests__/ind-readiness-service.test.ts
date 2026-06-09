/**
 * IND readiness evaluator tests — deterministic verdict over the canonical
 * 108-section IND map + Module 1 forms + safety clock. No DB, no AI.
 */

import { describe, it, expect } from 'vitest';
import { evaluateIndReadiness, REQUIRED_FORMS_INITIAL } from '../ind-readiness-service';
import {
  getRequiredSections,
  type SectionStatus,
} from '../../../../services/regulatory/ind-ectd-sections';

// Build a status map marking every initial-required section as "signed".
function allRequiredSigned(filing: 'initial' | 'amendment'): Record<string, SectionStatus> {
  const map: Record<string, SectionStatus> = {};
  for (const s of getRequiredSections()) {
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
