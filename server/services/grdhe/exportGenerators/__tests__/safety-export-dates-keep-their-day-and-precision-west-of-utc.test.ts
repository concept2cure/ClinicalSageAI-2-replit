/**
 * The safety exports write each date as the calendar date the case records,
 * to the precision it records, in a time zone west of UTC (GRDHE follow-up 4,
 * 2026-10-15).
 *
 * What the generators used to do:
 *  - E2B wrote every date as format 102 (CCYYMMDD), whatever precision was
 *    recorded: a month became the 1st of it, a year 1 January, and an age was
 *    computed from that invented day. drugstartperiod (an interval) was filled
 *    with the start date's precision word.
 *  - formatE2BDate read dates through new Date() and local getters. An ISO
 *    date-only string is UTC midnight, and so is the Date the service builds
 *    from a DATE column (new Date('2026-03-15')), so west of UTC every such date
 *    was filed a day early: 2026-03-15 as 20260314.
 *  - The FDA export did the same with a Date (receiveDate), and a month string
 *    ('2026-03') went through new Date() to 20260228.
 *
 * TZ is set to America/Los_Angeles (UTC-7/-8) for this file and restored after.
 * The repository's E2B reference (data/test_output/ingestion_00093_7146.json)
 * shows 102 with CCYYMMDD and 610 with CCYYMM and no year-only code, so a date
 * recorded to the year is omitted with a warning.
 */
const PREVIOUS_TZ = process.env.TZ;
process.env.TZ = 'America/Los_Angeles';

import { afterAll, describe, expect, it } from 'vitest';
import { generateE2BR3XML, generateFDA3500AXML } from '../index';
import type { CanonicalAdverseEvent, ExportJob, TerminologyVersionLock } from '../../types';

afterAll(() => {
  if (PREVIOUS_TZ === undefined) delete process.env.TZ;
  else process.env.TZ = PREVIOUS_TZ;
});

const JOB = {} as ExportJob;
const LOCKED: Record<string, TerminologyVersionLock> = {
  MEDDRA: { version_id: 'tv-meddra', version_code: '26.1', display_name: 'MedDRA 26.1', locked_at: '2026-10-15T00:00:00Z' },
};
const REACTION = { term: 'Headache', term_code: '10019211', term_system: 'MEDDRA', term_version: '26.1', outcome: 'recovered' };

/** A case as the service maps it: DATE columns become new Date('YYYY-MM-DD'), UTC midnight. */
function storedCase(overrides: Record<string, unknown> = {}): CanonicalAdverseEvent {
  const base: Record<string, unknown> = {
    id: 'evt-1',
    tenantId: '3f2a8c1e-7b4d-4e9a-9c2f-1a2b3c4d5e6f',
    caseNumber: 'CASE-001',
    caseVersion: 1,
    caseType: 'spontaneous',
    reportType: 'initial',
    eventDate: new Date('2026-03-10'),
    eventDatePrecision: 'day',
    receiveDate: new Date('2026-03-15'),
    createdAt: new Date('2026-03-15T09:00:00Z'),
    isSerious: false,
    patient: { initials: 'AB', sex: 'F' },
    reactions: [{ ...REACTION, onset_date: '2026-03-15' }],
    suspectProducts: [{ name: 'Examplamab', action_taken: 'withdrawn', authorization_holder: 'Example Pharma GmbH' }],
    reporter: { qualification_code: '1', country_code: 'DE' },
    sender: { sender_type: '1', sender_identifier: 'EXAMPLEPHARMA-DE', sender_organization: 'Example Pharma GmbH' },
  };
  return { ...base, ...overrides } as unknown as CanonicalAdverseEvent;
}

const e2b = (overrides: Record<string, unknown> = {}) => generateE2BR3XML(storedCase(overrides), JOB, LOCKED);
const fda = (overrides: Record<string, unknown> = {}) => generateFDA3500AXML(storedCase(overrides), JOB, LOCKED);
const warned = (r: { warnings: Array<{ field: string }> }) => r.warnings.map(w => w.field);

describe('E2B, west of UTC: a date keeps its day', () => {
  it('files a date-only string and a DATE-column Date as the recorded day, not the day before', () => {
    expect(new Date('2026-03-15').getDate(), 'this file runs west of UTC').toBe(14);
    const r = e2b();
    expect(r.success).toBe(true);
    expect(r.content).toContain('<reactionstartdate>20260315</reactionstartdate>');
    expect(r.content).toContain('<receivedateformat>102</receivedateformat>');
    expect(r.content).toContain('<receivedate>20260315</receivedate>');
    expect(r.content).not.toContain('20260314');
  });
});

describe('E2B: a date is written to the precision it records, with its format code', () => {
  it.each([
    [{ onset_date: '2026-03' }],
    [{ onset_date: '2026-03-01', onset_date_precision: 'month' }],
  ])('writes a month as 610 CCYYMM: %j', dates => {
    const r = e2b({ reactions: [{ ...REACTION, ...dates }] });
    expect(r.content).toContain('<reactionstartdateformat>610</reactionstartdateformat>');
    expect(r.content).toContain('<reactionstartdate>202603</reactionstartdate>');
    expect(r.content).not.toContain('20260301');
  });

  it('omits a date recorded to the year, which has no verified format code here, and computes no age from it', () => {
    const r = e2b({ patient: { sex: 'F', date_of_birth: '1980-01-01', date_of_birth_precision: 'year' } });
    expect(r.success).toBe(true);
    expect(r.content).not.toContain('<patientbirthdate');
    expect(r.content, 'an age computed from an invented 1 January').not.toContain('<patientonsetage>');
    expect(warned(r)).toEqual(expect.arrayContaining(['patient.date_of_birth']));
    expect(r.warnings.find(w => w.field === 'patient.date_of_birth')?.message).toMatch(/year/);
  });

  it('omits a recorded date that is not a calendar date, with a warning naming it', () => {
    const r = e2b({ reactions: [{ ...REACTION, onset_date: '2026-03-15', end_date: 'last Tuesday' }] });
    expect(r.success).toBe(true);
    expect(r.content).not.toContain('<reactionenddate');
    expect(warned(r)).toContain('reactions[0].end_date');
  });

  it('does not write a start date precision into drugstartperiod, an interval', () => {
    const r = e2b({
      suspectProducts: [{ name: 'Examplamab', start_date: '2026-03', start_date_precision: 'month', action_taken: 'withdrawn', authorization_holder: 'X' }],
    });
    expect(r.content).not.toContain('<drugstartperiod>');
    expect(r.content).toContain('<drugstartdateformat>610</drugstartdateformat>');
    expect(r.content).toContain('<drugstartdate>202603</drugstartdate>');
  });
});

describe('FDA, west of UTC: a date keeps its day and its precision', () => {
  it('files the DATE-column receive date as the recorded day', () => {
    const r = fda();
    expect(r.success).toBe(true);
    expect(r.content).toContain('<activityTime value="20260315"/>');
    expect(r.content).not.toContain('20260314');
  });

  it('writes a month as CCYYMM and a year as CCYY, never a day nobody recorded', () => {
    const r = fda({
      patient: { sex: 'F', date_of_birth: '1980-01-01', date_of_birth_precision: 'year' },
      reactions: [{ ...REACTION, onset_date: '2026-03' }],
    });
    expect(r.content).toContain('<low value="202603"/>');
    expect(r.content).toContain('<birthTime value="1980"/>');
    expect(r.content).not.toContain('20260228');
    expect(r.content).not.toContain('19800101');
  });
});
