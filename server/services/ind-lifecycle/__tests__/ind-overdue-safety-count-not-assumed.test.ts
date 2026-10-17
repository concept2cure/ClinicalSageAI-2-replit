/**
 * IND readiness and next actions — an omitted overdue-safety-report count is
 * not a count of zero.
 *
 * What the code used to do (until 2026-10-15): evaluateIndReadiness and
 * deriveIndActionItems both read `overdueSafetyReports ?? 0`. An amendment with
 * every required section approved and no count supplied came back ready: true,
 * 100%, zero blockers and no warning, and the action list carried no safety
 * item — "no expedited IND safety report is overdue" was stated for an IND in
 * effect whose safety-report register nobody had read.
 *
 * An initial IND is different on the facts: 21 CFR 312.32 reports are filed
 * under an IND in effect, so before the first filing there are none to be
 * overdue, and the served checklist (initial, no count) is unchanged.
 */
import { describe, it, expect } from 'vitest';
import { evaluateIndReadiness } from '../ind-readiness-service';
import { deriveIndActionItems } from '../ind-action-items';
import { getAllINDSections, type SectionStatus } from '../../../../services/regulatory/ind-ectd-sections';

function allRequiredSigned(filing: 'initial' | 'amendment'): Record<string, SectionStatus> {
  const map: Record<string, SectionStatus> = {};
  for (const s of getAllINDSections()) {
    if (filing === 'amendment' ? s.requiredForAmendment : s.required) map[s.code] = 'signed';
  }
  return map;
}

describe('evaluateIndReadiness — the overdue safety-report count', () => {
  it('an amendment with no count supplied is not stated ready; a blocker names what was not assessed', () => {
    const r = evaluateIndReadiness({ filingType: 'amendment', sectionStatus: allRequiredSigned('amendment') });
    expect(r.ready).toBe(false);
    const b = r.blockers.find((x) => x.kind === 'nothing_assessed');
    expect(b?.code).toBe('overdue_safety_reports');
    expect(b?.message).toMatch(/not supplied/);
    expect(b?.message).toMatch(/21 CFR 312\.32/);
  });

  it('a null count from a JSON body is not a count either', () => {
    const r = evaluateIndReadiness({
      filingType: 'amendment',
      sectionStatus: allRequiredSigned('amendment'),
      overdueSafetyReports: null as unknown as number,
    });
    expect(r.ready).toBe(false);
    expect(r.blockers.some((x) => x.code === 'overdue_safety_reports')).toBe(true);
  });

  it('an amendment with a stated count of zero is ready', () => {
    const r = evaluateIndReadiness({ filingType: 'amendment', sectionStatus: allRequiredSigned('amendment'), overdueSafetyReports: 0 });
    expect(r.ready).toBe(true);
  });

  it('an initial IND needs no count — there are no IND safety reports before the IND is in effect', () => {
    const r = evaluateIndReadiness({
      filingType: 'initial',
      sectionStatus: allRequiredSigned('initial'),
      completedForms: ['FDA_1571', 'FDA_1572', 'FDA_3674'],
    });
    expect(r.ready).toBe(true);
    expect(r.blockers).toEqual([]);
  });
});

describe('deriveIndActionItems — the overdue safety-report count', () => {
  it('no count supplied: an action says it was not assessed (not silence)', () => {
    const r = deriveIndActionItems({});
    const item = r.items.find((i) => i.id === 'safety_not_assessed');
    expect(item?.category).toBe('safety');
    expect(item?.detail).toMatch(/none is assumed/);
  });

  it('a stated zero needs no action', () => {
    expect(deriveIndActionItems({ overdueSafetyReports: 0 }).items).toEqual([]);
  });

  it('for an initial filing the count is not applicable, so no action is raised for it', () => {
    const readiness = evaluateIndReadiness({ filingType: 'initial', sectionStatus: {} });
    const r = deriveIndActionItems({ readiness });
    expect(r.items.some((i) => i.category === 'safety')).toBe(false);
  });

  it('a readiness "not assessed" blocker is titled as what it is, once', () => {
    const readiness = evaluateIndReadiness({ filingType: 'amendment', sectionStatus: allRequiredSigned('amendment') });
    const r = deriveIndActionItems({ readiness });
    const safety = r.items.filter((i) => /safety/i.test(i.title) || i.id.includes('overdue_safety_reports'));
    expect(safety).toHaveLength(1);
    expect(r.items.some((i) => i.title === 'Complete required section overdue_safety_reports')).toBe(false);
  });
});
