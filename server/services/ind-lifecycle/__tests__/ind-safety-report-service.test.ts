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
  unstatedSafetyReportFields,
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
      expectednessRecorded: true,
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

  it('NOT reportable: a recorded "expected" determination is reported as such', () => {
    const c = classifyIndSafetyReport(
      makeEvent({ seriousnessCriteria: 'death', causality: 'probable', expectedness: 'expected (listed in IB)' }),
    );
    expect(c.determinations.expectednessRecorded).toBe(true);
    expect(c.rationale).toMatch(/event is expected/);
  });
});

describe('P-20: with expectedness not recorded there is no verdict', () => {
  /* P-20 (product decision 2026-10-08): a safety report never infers what
     nobody stated. With expectedness not recorded the expedited verdict is
     "not determined: expectedness not assessed" — never "not reportable" — and
     there is no verdict at all, so it cannot become an unsent 15-day report. */
  it('expectedness not recorded: the verdict is NOT_DETERMINED — never NOT_REPORTABLE — with no clock and no inferred expectedness', () => {
    const c = classifyIndSafetyReport(
      makeEvent({ seriousnessCriteria: 'life_threatening', causality: 'probable', expectedness: null }),
    );
    expect(c.obligation).toBe('NOT_DETERMINED');
    expect(c.reportingWindowDays).toBeNull();
    expect(c.deadline).toBeNull();
    // Nobody assessed this event against the IB/RSI: neither "expected" nor
    // "unexpected" is asserted on the reviewer's behalf.
    expect(c.determinations.unexpected).toBeNull();
    expect(c.determinations.expectednessRecorded).toBe(false);
    expect(c.rationale).toMatch(/^Not determined: expectedness not assessed/);
    expect(c.rationale).not.toMatch(/Not an individual expedited|not reportable|event is expected/i);
  });

  it('expectedness not recorded on a serious, suspected event is NOT_DETERMINED — expectedness decides it', () => {
    for (const over of [
      { seriousnessCriteria: 'hospitalization' as const, causality: 'possible' as Causality },
      { seriousnessCriteria: 'death' as const, causality: 'definite' as Causality },
      { eventType: 'SUSAR' as EventType, seriousnessCriteria: 'medically_important' as const, causality: 'probable' as Causality },
    ]) {
      const c = classifyIndSafetyReport(makeEvent({ ...over, expectedness: '  ' }));
      expect(c.obligation, JSON.stringify(over)).toBe('NOT_DETERMINED');
    }
  });
});

describe('P-20 follow-up: "not determined" only where expectedness decides the outcome', () => {
  /* Follow-up decision on P-20 (docs/LAUNCH_DEFINITION_OF_DONE.md, from the
     second IND pass): an event recorded as non-serious, or as not suspected, is
     not expedited on those stated facts, and the verdict says so. Expectedness
     is the deciding determination only for a serious, suspected event. */
  it('a NOT-SUSPECTED event with expectedness unrecorded is not reportable, on the stated causality', () => {
    for (const causality of ['unrelated', 'unlikely'] as Causality[]) {
      const c = classifyIndSafetyReport(
        makeEvent({ seriousnessCriteria: 'life_threatening', causality, expectedness: null }),
      );
      expect(c.obligation, causality).toBe('NOT_REPORTABLE');
      expect(c.reportingWindowDays).toBeNull();
      expect(c.deadline).toBeNull();
      // Nothing is inferred about expectedness: it stays unrecorded.
      expect(c.determinations.unexpected).toBeNull();
      expect(c.determinations.expectednessRecorded).toBe(false);
      expect(c.rationale).toMatch(/not a suspected adverse reaction/);
      expect(c.rationale).toMatch(new RegExp(`causality stated as ${causality}`));
      expect(c.rationale).toMatch(/Expectedness is not recorded; it does not change this verdict/);
      expect(c.rationale).not.toMatch(/Not determined/);
    }
  });

  it('a NON-SERIOUS event with expectedness unrecorded is not reportable, on the stated seriousness', () => {
    const c = classifyIndSafetyReport(
      makeEvent({ eventType: 'AE' as EventType, causality: 'probable', expectedness: undefined }),
    );
    expect(c.obligation).toBe('NOT_REPORTABLE');
    expect(c.determinations.serious).toBe(false);
    expect(c.determinations.unexpected).toBeNull();
    expect(c.regulatoryBasis).toContain('312.32(c)(1)');
    expect(c.rationale).toMatch(/non-serious/);
    expect(c.rationale).toMatch(/Expectedness is not recorded; it does not change this verdict/);
    expect(c.rationale).not.toMatch(/Not determined/);
  });

  it('non-serious AND not suspected names both stated facts', () => {
    const c = classifyIndSafetyReport(
      makeEvent({ eventType: 'AE' as EventType, causality: 'unrelated', expectedness: null }),
    );
    expect(c.obligation).toBe('NOT_REPORTABLE');
    expect(c.rationale).toMatch(/not a suspected adverse reaction/);
    expect(c.rationale).toMatch(/non-serious/);
  });

  it('the assembled report of such an event has no report to file and reads "not individually reportable", with expectedness "not recorded"', () => {
    const r = assembleIndSafetyReport(makeEvent({ eventType: 'AE' as EventType, causality: 'possible', expectedness: null }));
    expect(r.classification.obligation).toBe('NOT_REPORTABLE');
    expect(r.amendmentIntent).toBeNull();
    const ident = r.document.sections.find((s) => s.key === 'identification')!.body;
    expect(ident).toContain('IND Safety Report (not individually reportable).');
    const assessment = r.document.sections.find((s) => s.key === 'assessment')!.body;
    expect(assessment).toContain('Expectedness: not recorded');
  });

  it('a recorded expectedness on a non-serious or not-suspected event keeps its existing verdict', () => {
    const notSuspected = classifyIndSafetyReport(makeEvent({ causality: 'unrelated', expectedness: 'unexpected' }));
    expect(notSuspected.obligation).toBe('NOT_REPORTABLE');
    expect(notSuspected.determinations.unexpected).toBe(true);
    expect(notSuspected.rationale).not.toMatch(/Expectedness is not recorded/);
    const nonSerious = classifyIndSafetyReport(makeEvent({ eventType: 'AE' as EventType, causality: 'possible', expectedness: 'unexpected' }));
    expect(nonSerious.obligation).toBe('NOT_REPORTABLE');
    expect(nonSerious.regulatoryBasis).toContain('312.33');
  });

  it('a not-determined verdict produces no report to file and says so in the document', () => {
    const r = assembleIndSafetyReport(makeEvent({ expectedness: null }));
    expect(r.amendmentIntent).toBeNull();
    const ident = r.document.sections.find((s) => s.key === 'identification')!.body;
    expect(ident).toContain('IND Safety Report (not determined: expectedness not assessed).');
    expect(ident).not.toMatch(/not individually reportable/);
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

/* QA 2026-10-08 (j7, findings 1, 11, 12). The card posted SAE / death /
   definite / recovered for selects nobody touched, and the assembled report
   asserted all four. With no dates the route answered 500 (toISOString of
   undefined), and an absent patient id or country printed "undefined".
   Nothing regulated is asserted that the person did not state: the engine
   refuses, naming each field, and an absent identifier is an explicit gap. */
describe('nothing regulated is assumed — the engine refuses, naming the fields', () => {
  const blank = (keys: Array<keyof AdverseEvent>): AdverseEvent => {
    const e = makeEvent() as unknown as Record<string, unknown>;
    for (const k of keys) delete e[k];
    return e as unknown as AdverseEvent;
  };
  const refusal = (fn: () => unknown): (Error & { code?: string }) | null => {
    try {
      fn();
      return null;
    } catch (e) {
      return e as Error & { code?: string };
    }
  };

  it('refuses to classify or assemble when the determinations and dates were not stated, naming each one', () => {
    const ev = blank(['eventType', 'seriousnessCriteria', 'causality', 'outcome', 'onsetDate', 'reportDate']);
    for (const run of [() => classifyIndSafetyReport(ev), () => assembleIndSafetyReport(ev)]) {
      const err = refusal(run);
      expect(err).not.toBeNull();
      // 'VALIDATION' is the code the lifecycle routes map to 400 — never a 500.
      expect(err!.code).toBe('VALIDATION');
      for (const named of [
        'event type',
        'seriousness criterion',
        'causality',
        'outcome',
        'onset date',
        'sponsor awareness date',
      ]) {
        expect(err!.message).toContain(named);
      }
    }
  });

  it('a single unstated field is named on its own, and nothing is defaulted in its place', () => {
    const err = refusal(() => assembleIndSafetyReport(blank(['causality'])));
    expect(err?.code).toBe('VALIDATION');
    expect(err!.message).toContain('causality');
    expect(err!.message).not.toContain('outcome');
  });

  it('a value outside the enum is refused, not passed through', () => {
    const err = refusal(() => assembleIndSafetyReport(makeEvent({ causality: 'maybe' as Causality })));
    expect(err?.code).toBe('VALIDATION');
    expect(err!.message).toContain('causality');
  });

  /* P-20: the onset date is stated as a date or explicitly as unknown; a
     blank is refused, an explicit "unknown" is accepted and printed as such. */
  it('an onset date stated explicitly as unknown is accepted and printed as unknown', () => {
    const ev = { ...blank(['onsetDate']), onsetDateUnknown: true } as AdverseEvent & { onsetDateUnknown: true };
    expect(unstatedSafetyReportFields(ev)).toEqual([]);
    const r = assembleIndSafetyReport(ev);
    const desc = r.document.sections.find((s) => s.key === 'description_of_event')!.body;
    expect(desc).toContain('Onset: unknown (stated as unknown).');
    expect(desc).not.toMatch(/Onset: \d{4}-/);
  });

  it('a blank onset date is refused and the refusal says it may be stated as unknown', () => {
    const err = refusal(() => assembleIndSafetyReport(blank(['onsetDate'])));
    expect(err?.code).toBe('VALIDATION');
    expect(err!.message).toContain('onset date (a date, or stated as unknown)');
  });

  it('an onset stated both as a date and as unknown is refused, not resolved for the person', () => {
    const ev = { ...makeEvent(), onsetDateUnknown: true } as AdverseEvent & { onsetDateUnknown: true };
    const err = refusal(() => assembleIndSafetyReport(ev));
    expect(err?.code).toBe('VALIDATION');
    expect(err!.message).toContain('onset date (stated both as a date and as unknown — state one)');
  });

  it('an unparseable date is refused (400), not thrown from toISOString (500)', () => {
    const err = refusal(() => assembleIndSafetyReport(makeEvent({ onsetDate: new Date('not a date') })));
    expect(err?.code).toBe('VALIDATION');
    expect(err!.message).toContain('onset date');
  });

  it('a non-serious AE needs no seriousness criterion, and the report does not invent one', () => {
    const r = assembleIndSafetyReport({ ...blank(['seriousnessCriteria']), eventType: 'AE' as EventType });
    expect(r.classification.obligation).toBe('NOT_REPORTABLE');
    const assessment = r.document.sections.find((s) => s.key === 'assessment')!.body;
    expect(assessment).not.toMatch(/undefined/);
    expect(assessment).toMatch(/non-serious/i);
  });

  it('an absent patient id or country is an explicit gap, never the word "undefined"', () => {
    const r = assembleIndSafetyReport(blank(['patientId', 'countryOfOccurrence']));
    const ident = r.document.sections.find((s) => s.key === 'identification')!.body;
    expect(ident).not.toMatch(/undefined/);
    expect(ident).toContain('Case (de-identified patient): [to be completed]');
    expect(ident).toContain('Country of occurrence: [to be completed]');
  });

  it('an unrecorded expectedness is reported as not recorded, never as "expected"', () => {
    const r = assembleIndSafetyReport(makeEvent({ expectedness: null }));
    const assessment = r.document.sections.find((s) => s.key === 'assessment')!.body;
    expect(assessment).toContain('Expectedness: not recorded');
    expect(assessment).not.toMatch(/Expectedness: expected/);
    // A recorded determination still reads as recorded.
    const recorded = assembleIndSafetyReport(makeEvent({ expectedness: 'expected (listed in IB)' }));
    expect(recorded.document.sections.find((s) => s.key === 'assessment')!.body).toMatch(/Expectedness: expected/);
  });
});
