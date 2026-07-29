/**
 * IND Safety Report classification tests — 21 CFR 312.32.
 *
 * The classification logic is the regulatory crux: getting 7-day vs 15-day vs
 * not-reportable wrong is a compliance failure. These worked cases pin the four
 * determinations (serious / suspected / unexpected / fatal-or-life-threatening)
 * and the resulting obligation + calendar-day deadline against the rule:
 *
 *   - 7-day  : unexpected fatal OR life-threatening suspected adverse reaction  (312.32(c)(2))
 *   - 15-day : serious AND unexpected AND suspected (reasonable possibility)    (312.32(c)(1)(i))
 *   - not    : expected, OR non-serious, OR not suspected                       (312.32(a))
 */

import { describe, it, expect } from 'vitest';
import {
  classifyIndSafetyReport,
  buildIndSafetyReportDocument,
  buildAmendmentIntent,
  assembleIndSafetyReport,
  isSuspected,
  isUnexpected,
} from '../ind-safety-report-service';
import type {
  AdverseEvent,
  Causality,
  EventType,
  Outcome,
  SeriousnessCriteria,
} from '../../compliance/pharmacovigilanceService';

/** Fixed clock so calendar-day deadlines are deterministic. */
const REPORT_DATE = new Date('2026-01-01T00:00:00.000Z');

function makeEvent(overrides: Partial<AdverseEvent> = {}): AdverseEvent {
  return {
    id: 'ae-1',
    organizationId: 'org-1',
    projectId: 'proj-1',
    eventType: 'SAE' as EventType,
    patientId: 'subj-001',
    eventDescription: 'Acute hepatic failure following dosing.',
    onsetDate: REPORT_DATE,
    reportDate: REPORT_DATE,
    seriousnessCriteria: 'life_threatening' as SeriousnessCriteria,
    causality: 'probable' as Causality,
    outcome: 'not_recovered' as Outcome,
    reporterType: 'investigator',
    countryOfOccurrence: 'US',
    regulatoryReportingDeadline: REPORT_DATE,
    reportedToAuthorities: false,
    expeditedReportRequired: true,
    expectedness: 'unexpected',
    createdAt: REPORT_DATE,
    ...overrides,
  };
}

/** Days between reportDate and the computed deadline. */
function deadlineDays(deadline: Date | null): number | null {
  if (!deadline) return null;
  return Math.round((deadline.getTime() - REPORT_DATE.getTime()) / (24 * 60 * 60 * 1000));
}

describe('classifyIndSafetyReport — 21 CFR 312.32', () => {
  it('7-day: unexpected LIFE-THREATENING suspected adverse reaction', () => {
    const c = classifyIndSafetyReport(
      makeEvent({ seriousnessCriteria: 'life_threatening', causality: 'probable', expectedness: 'unexpected' }),
    );
    expect(c.obligation).toBe('SEVEN_DAY');
    expect(c.reportingWindowDays).toBe(7);
    expect(deadlineDays(c.deadline)).toBe(7);
    expect(c.regulatoryBasis).toBe('21 CFR 312.32(c)(2)');
    expect(c.determinations).toEqual({
      serious: true,
      suspected: true,
      unexpected: true,
      fatalOrLifeThreatening: true,
    });
  });

  it('7-day: unexpected FATAL suspected adverse reaction', () => {
    const c = classifyIndSafetyReport(
      makeEvent({ seriousnessCriteria: 'death', causality: 'possible', outcome: 'fatal', expectedness: 'unexpected' }),
    );
    expect(c.obligation).toBe('SEVEN_DAY');
    expect(deadlineDays(c.deadline)).toBe(7);
  });

  it('15-day: serious + unexpected + suspected but NOT fatal/life-threatening (hospitalization)', () => {
    const c = classifyIndSafetyReport(
      makeEvent({ seriousnessCriteria: 'hospitalization', causality: 'possible', expectedness: 'unexpected' }),
    );
    expect(c.obligation).toBe('FIFTEEN_DAY');
    expect(c.reportingWindowDays).toBe(15);
    expect(deadlineDays(c.deadline)).toBe(15);
    expect(c.regulatoryBasis).toBe('21 CFR 312.32(c)(1)(i)');
    expect(c.determinations.fatalOrLifeThreatening).toBe(false);
  });

  it('15-day: medically important serious unexpected suspected reaction', () => {
    const c = classifyIndSafetyReport(
      makeEvent({ seriousnessCriteria: 'medically_important', causality: 'definite', expectedness: 'unexpected' }),
    );
    expect(c.obligation).toBe('FIFTEEN_DAY');
    expect(deadlineDays(c.deadline)).toBe(15);
  });

  it('NOT reportable: EXPECTED reaction (listed in the IB), even if serious/fatal', () => {
    const c = classifyIndSafetyReport(
      makeEvent({ seriousnessCriteria: 'death', causality: 'probable', expectedness: 'expected (listed in IB)' }),
    );
    expect(c.obligation).toBe('NOT_REPORTABLE');
    expect(c.reportingWindowDays).toBeNull();
    expect(c.deadline).toBeNull();
    expect(c.determinations.unexpected).toBe(false);
  });

  it('NOT reportable: NOT suspected (no reasonable possibility — causality unrelated)', () => {
    const c = classifyIndSafetyReport(
      makeEvent({ seriousnessCriteria: 'life_threatening', causality: 'unrelated', expectedness: 'unexpected' }),
    );
    expect(c.obligation).toBe('NOT_REPORTABLE');
    expect(c.determinations.suspected).toBe(false);
  });

  it('NOT reportable: unlikely causality is not a suspected adverse reaction', () => {
    const c = classifyIndSafetyReport(
      makeEvent({ seriousnessCriteria: 'death', causality: 'unlikely', expectedness: 'unexpected' }),
    );
    expect(c.obligation).toBe('NOT_REPORTABLE');
  });

  it('NOT reportable: NON-serious AE (eventType AE), even if unexpected + suspected', () => {
    const c = classifyIndSafetyReport(
      makeEvent({ eventType: 'AE', seriousnessCriteria: 'medically_important', causality: 'possible', expectedness: 'unexpected' }),
    );
    expect(c.obligation).toBe('NOT_REPORTABLE');
    expect(c.determinations.serious).toBe(false);
    expect(c.regulatoryBasis).toContain('312.33');
  });

  it('NOT reportable: expectedness unknown/absent is treated conservatively as expected', () => {
    const c = classifyIndSafetyReport(
      makeEvent({ seriousnessCriteria: 'life_threatening', causality: 'probable', expectedness: null }),
    );
    expect(c.obligation).toBe('NOT_REPORTABLE');
    expect(c.determinations.unexpected).toBe(false);
  });
});

describe('suspectedness / expectedness derivation', () => {
  it('definite/probable/possible are suspected; unlikely/unrelated are not', () => {
    expect(isSuspected('definite')).toBe(true);
    expect(isSuspected('probable')).toBe(true);
    expect(isSuspected('possible')).toBe(true);
    expect(isSuspected('unlikely')).toBe(false);
    expect(isSuspected('unrelated')).toBe(false);
  });

  it('expectedness wording: "unexpected"/"not listed" => unexpected; else expected', () => {
    expect(isUnexpected('unexpected')).toBe(true);
    expect(isUnexpected('Not listed in IB')).toBe(true);
    expect(isUnexpected('expected')).toBe(false);
    expect(isUnexpected(null)).toBe(false);
    expect(isUnexpected(undefined)).toBe(false);
  });
});

describe('document model + amendment intent', () => {
  it('builds a narrative section tree covering the required sections', () => {
    const event = makeEvent();
    const c = classifyIndSafetyReport(event);
    const doc = buildIndSafetyReportDocument(event, c);
    const keys = doc.sections.map((s) => s.key);
    expect(keys).toEqual([
      'identification',
      'description_of_event',
      'assessment',
      'action_taken',
      'sponsor_analysis',
      'aggregate_context',
    ]);
    expect(doc.caseReference.adverseEventId).toBe('ae-1');
  });

  it('amendment intent: type "amendment", m1.12.4 leaf, lifecycleOp new', () => {
    const c = classifyIndSafetyReport(makeEvent());
    const intent = buildAmendmentIntent(c);
    expect(intent).not.toBeNull();
    expect(intent!.sequenceType).toBe('amendment');
    expect(intent!.lifecycleStage).toBe('amendment');
    expect(intent!.leaves[0].sectionCode).toBe('m1.12.4');
    expect(intent!.leaves[0].lifecycleOp).toBe('new');
  });

  it('amendment intent adds an m5.3.5 leaf when an ICSR backs the case', () => {
    const c = classifyIndSafetyReport(makeEvent());
    const intent = buildAmendmentIntent(c, { hasIcsr: true });
    const codes = intent!.leaves.map((l) => l.sectionCode);
    expect(codes).toContain('m1.12.4');
    expect(codes).toContain('m5.3.5');
  });

  it('amendment intent is null for NOT_REPORTABLE events', () => {
    const c = classifyIndSafetyReport(makeEvent({ causality: 'unrelated' }));
    expect(buildAmendmentIntent(c)).toBeNull();
  });

  it('assembleIndSafetyReport wires classification + document + intent together', () => {
    const result = assembleIndSafetyReport(makeEvent(), { aggregateContext: { similarEventCount: 3 } });
    expect(result.classification.obligation).toBe('SEVEN_DAY');
    expect(result.document.sections.length).toBe(6);
    expect(result.amendmentIntent?.sequenceType).toBe('amendment');
  });
});
