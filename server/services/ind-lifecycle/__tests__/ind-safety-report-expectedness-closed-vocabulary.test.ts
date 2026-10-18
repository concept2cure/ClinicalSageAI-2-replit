/**
 * IND safety-report classification (21 CFR 312.32) — expectedness is a closed
 * vocabulary: "expected" or "unexpected". Anything else is not a determination.
 *
 * What the code used to do (until 2026-10-15): the P-20 guarantee ("unassessed
 * expectedness gives NOT_DETERMINED, never NOT_REPORTABLE") held only for a
 * blank. Any other text was read through isUnexpected(), which returned true
 * for words containing "unexpected" / "not listed" / "unlisted" and false for
 * everything else — so a serious, probable SAE recorded as "unknown" (a value
 * the pharmacovigilance intake route stores), "pending", "not assessed", "TBD"
 * or "N/A" was classified NOT_REPORTABLE with the rationale "event is expected
 * (listed in the IB / consistent with the RSI)", and its 15- or 7-day clock
 * never started.
 */
import { describe, it, expect } from 'vitest';
import {
  classifyIndSafetyReport,
  assembleIndSafetyReport,
  expectednessDetermination,
} from '../ind-safety-report-service';
import type { AdverseEvent } from '../../compliance/pharmacovigilanceService';

const DAY0 = new Date('2026-01-01T00:00:00.000Z');

function seriousProbable(expectedness: string | null): AdverseEvent {
  return {
    id: 'ae-1',
    organizationId: 'org-1',
    projectId: 'proj-1',
    eventType: 'SAE',
    patientId: 'subj-001',
    eventDescription: 'Acute hepatic failure following dosing.',
    onsetDate: DAY0,
    reportDate: DAY0,
    seriousnessCriteria: 'hospitalization',
    causality: 'probable',
    outcome: 'not_recovered',
    reporterType: 'investigator',
    countryOfOccurrence: 'US',
    regulatoryReportingDeadline: DAY0,
    reportedToAuthorities: false,
    expeditedReportRequired: true,
    expectedness,
    createdAt: DAY0,
  };
}

describe('classifyIndSafetyReport — text outside the vocabulary is not "expected"', () => {
  for (const text of ['unknown', 'pending', 'not assessed', 'TBD', 'N/A', 'expected?', 'Not listed in IB', 'listed']) {
    it(`"${text}" gives NOT_DETERMINED — never NOT_REPORTABLE, never a clock`, () => {
      const c = classifyIndSafetyReport(seriousProbable(text));
      expect(c.obligation).toBe('NOT_DETERMINED');
      expect(c.deadline).toBeNull();
      expect(c.determinations.unexpected).toBeNull();
      expect(c.determinations.expectednessRecorded).toBe(false);
      expect(c.rationale).toMatch(/^Not determined: expectedness not assessed/);
      expect(c.rationale).not.toMatch(/event is expected/);
      expect(c.rationale).toContain(`"${text}"`);
    });
  }

  it('"expected" and "unexpected" are determinations, whatever their case or spacing', () => {
    expect(classifyIndSafetyReport(seriousProbable(' Expected ')).obligation).toBe('NOT_REPORTABLE');
    expect(classifyIndSafetyReport(seriousProbable('UNEXPECTED')).obligation).toBe('FIFTEEN_DAY');
  });

  it('the assembled report says the recorded text is not a determination', () => {
    const r = assembleIndSafetyReport(seriousProbable('pending'));
    const assessment = r.document.sections.find((s) => s.key === 'assessment')!.body;
    expect(assessment).toContain('Expectedness: not recorded');
    expect(assessment).toContain('"pending"');
    expect(assessment).not.toMatch(/Expectedness: expected/);
    expect(r.amendmentIntent).toBeNull();
  });
});

describe('expectednessDetermination', () => {
  it('maps the closed vocabulary and nothing else', () => {
    expect(expectednessDetermination('expected')).toBe('expected');
    expect(expectednessDetermination('Unexpected')).toBe('unexpected');
    expect(expectednessDetermination('unknown')).toBe('not_assessed');
    expect(expectednessDetermination('unexpected, not listed in IB')).toBe('not_assessed');
    expect(expectednessDetermination('')).toBe('not_assessed');
    expect(expectednessDetermination(null)).toBe('not_assessed');
    expect(expectednessDetermination(undefined)).toBe('not_assessed');
  });
});
