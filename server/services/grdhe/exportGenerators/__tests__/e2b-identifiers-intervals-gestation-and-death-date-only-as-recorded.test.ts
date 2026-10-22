/**
 * The E2B(R2) export writes authoritynumb, drugintervaldosagedefinition,
 * drugparadministration, gestationperiod and patientdeathdate only as the case
 * records them; otherwise it omits the element and says so.
 *
 * What the generator used to write (until 2026-10-22):
 *   authoritynumb               the worldwide case id, for every case: A.1.10.1
 *                               is a regulatory authority's case report number,
 *                               and nothing records whether a regulator or
 *                               another sender assigned that id;
 *   drugintervaldosagedefinition the recorded frequency_unit text ("hours"),
 *                               where the element takes an E2B code (801-805);
 *   drugparadministration       the recorded parent_route text ("oral"), where
 *                               the element takes a three-digit route code;
 *   gestationperiod             the number with no gestationperiodunit;
 *   patientdeathdate            a fatal reaction's end date when no date of
 *                               death was recorded.
 */
import { describe, expect, it } from 'vitest';
import { generateE2BR3XML } from '../index';
import type { CanonicalAdverseEvent, ExportJob, TerminologyVersionLock } from '../../types';

const JOB = {} as ExportJob;
const LOCKED: Record<string, TerminologyVersionLock> = {
  MEDDRA: { version_id: 'tv-meddra', version_code: '26.1', display_name: 'MedDRA 26.1', locked_at: '2026-10-15T00:00:00Z' },
};

function recordedCase(overrides: Record<string, unknown> = {}): CanonicalAdverseEvent {
  const base: Record<string, unknown> = {
    id: 'evt-1',
    tenantId: '3f2a8c1e-7b4d-4e9a-9c2f-1a2b3c4d5e6f',
    caseNumber: 'CASE-001',
    caseVersion: 1,
    caseType: 'spontaneous',
    reportType: 'initial',
    eventDate: '2026-03-10',
    receiveDate: '2026-03-15',
    createdAt: new Date('2026-03-15T09:00:00Z'),
    isSerious: false,
    patient: { initials: 'AB', sex: 'F' },
    reactions: [{ term: 'Headache', term_code: '10019211', term_system: 'MEDDRA', outcome: 'recovered' }],
    suspectProducts: [{ name: 'Examplamab' }],
    reporter: { qualification_code: '1', country_code: 'DE' },
    sender: { sender_type: '1', sender_organization: 'Example Pharma GmbH' },
  };
  return { ...base, ...overrides } as unknown as CanonicalAdverseEvent;
}

const run = (overrides: Record<string, unknown> = {}) => generateE2BR3XML(recordedCase(overrides), JOB, LOCKED);
const warned = (r: { warnings: Array<{ field: string }> }) => r.warnings.map(w => w.field);

describe('authoritynumb is not filled from the worldwide case id', () => {
  it('omits it, with a warning, when the worldwide case id is recorded', () => {
    const r = run({ worldwideCaseId: 'DE-EXAMPLEPHARMA-2026-001' });
    expect(r.success).toBe(true);
    expect(r.content, 'a company-assigned id was filed as a regulatory authority number').not.toContain('<authoritynumb>');
    expect(warned(r)).toContain('worldwideCaseId');
    expect(r.content).toContain('<companynumb>CASE-001</companynumb>');
  });
});

describe('the dosing interval and the parent route take only codes', () => {
  it('codes a recorded interval unit, and omits uncoded text with a warning', () => {
    const coded = run({ suspectProducts: [{ name: 'Examplamab', frequency_value: 12, frequency_unit: 'hours' }] });
    expect(coded.content).toContain('<drugintervaldosageunitnumb>12</drugintervaldosageunitnumb>');
    expect(coded.content).toContain('<drugintervaldosagedefinition>805</drugintervaldosagedefinition>');

    const uncoded = run({ suspectProducts: [{ name: 'Examplamab', frequency_value: 2, frequency_unit: 'fortnights' }] });
    expect(uncoded.success).toBe(true);
    expect(uncoded.content, 'uncoded text was written into a coded element').not.toContain('fortnights');
    expect(uncoded.content).not.toContain('<drugintervaldosagedefinition>');
    expect(uncoded.content, 'an interval count was filed with no unit').not.toContain('<drugintervaldosageunitnumb>');
    expect(warned(uncoded)).toContain('suspectProducts[0].frequency_unit');
  });

  it('writes a recorded three-digit parent route, and omits text with a warning', () => {
    expect(run({ suspectProducts: [{ name: 'Examplamab', parent_route: '048' }] }).content).toContain(
      '<drugparadministration>048</drugparadministration>'
    );
    const text = run({ suspectProducts: [{ name: 'Examplamab', parent_route: 'oral' }] });
    expect(text.success).toBe(true);
    expect(text.content, 'uncoded text was written into a coded element').not.toContain('<drugparadministration>');
    expect(warned(text)).toContain('suspectProducts[0].parent_route');
  });
});

describe('gestationperiod carries its recorded unit', () => {
  it('writes weeks (803) for a gestation recorded in weeks', () => {
    const r = run({ patient: { sex: 'F', gestation_weeks: 20 } });
    expect(r.content).toContain('<gestationperiod>20</gestationperiod>');
    expect(r.content, 'the gestation period was filed with no unit').toContain('<gestationperiodunit>803</gestationperiodunit>');
  });

  it('omits a gestation that is not a number of weeks, with a warning, and writes nothing when none is recorded', () => {
    const r = run({ patient: { sex: 'F', gestation_weeks: 'about twenty' } });
    expect(r.success).toBe(true);
    expect(r.content).not.toContain('<gestationperiod>');
    expect(warned(r)).toContain('patient.gestation_weeks');
    expect(run().content).not.toContain('<gestationperiod>');
  });
});

describe('patientdeathdate is a recorded date of death only', () => {
  const fatal = {
    isSerious: true,
    seriousnessDeath: true,
    reactions: [{ term: 'Cardiac arrest', term_code: '10007515', term_system: 'MEDDRA', outcome: 'fatal', end_date: '2026-03-12' }],
  };

  it("does not file a fatal reaction's end date as the date of death", () => {
    const r = run({ ...fatal, patient: { sex: 'F' } });
    expect(r.success).toBe(true);
    expect(r.content).toContain('<patientdeath>');
    expect(r.content, "a fatal reaction's end date was filed as the date of death").not.toContain('<patientdeathdate>');
    expect(warned(r)).toContain('patient.death_date');
  });

  it('writes a recorded date of death', () => {
    const r = run({ ...fatal, patient: { sex: 'F', death_date: '2026-03-13' } });
    expect(r.content).toContain('<patientdeathdate>20260313</patientdeathdate>');
  });
});
