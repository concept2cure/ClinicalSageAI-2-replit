/**
 * The E2B(R2) export writes its expedited flag, nullification flag, receiver,
 * age unit, weight and height only as the case records them (audit
 * 2026-10-15, GRDHE follow-up 4).
 *
 * What the generator used to write, for any case:
 *   fulfillexpeditecriteria  1 when serious, else 2: seriousness alone, though
 *                            expectedness and causality decide it too;
 *   casenullification        2 ("not a nullification"), for a case recorded as
 *                            a nullification as well;
 *   messagereceiveridentifier EVCTM, the clinical-trial module, and a receiver
 *                            block naming the EMA, for every case;
 *   patientonsetageunit      the recorded unit passed through uncoded ("yr",
 *                            "decades"), or the UCUM 'a' for an age computed
 *                            from the birth date;
 *   patientweight/height     the recorded number in the element's implied kg
 *                            and cm, whatever unit the case recorded (154 lb
 *                            filed as 154 kg).
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
    seriousnessDeath: false,
    seriousnessLifeThreatening: false,
    seriousnessHospitalization: false,
    seriousnessDisability: false,
    seriousnessCongenitalAnomaly: false,
    seriousnessOtherMedicallyImportant: false,
    patient: { initials: 'AB', sex: 'F' },
    reactions: [{ term: 'Headache', term_code: '10019211', term_system: 'MEDDRA', outcome: 'recovered' }],
    suspectProducts: [{ name: 'Examplamab' }],
    reporter: { qualification_code: '1', country_code: 'DE' },
    sender: { sender_type: '1', sender_organization: 'Example Pharma GmbH' },
  };
  return { ...base, ...overrides } as unknown as CanonicalAdverseEvent;
}

const run = (overrides: Record<string, unknown> = {}) => generateE2BR3XML(recordedCase(overrides), JOB, LOCKED);
const fields = (r: { errors?: Array<{ field: string }> }) => (r.errors ?? []).map(e => e.field);
const warned = (r: { warnings: Array<{ field: string }> }) => r.warnings.map(w => w.field);

describe('fulfillexpeditecriteria is not derived from seriousness', () => {
  it('is omitted, with a warning, for a serious case and for a non-serious one', () => {
    const serious = run({ isSerious: true, seriousnessHospitalization: true });
    expect(serious.success).toBe(true);
    expect(serious.content).not.toContain('<fulfillexpeditecriteria>');
    expect(warned(serious)).toContain('fulfillexpeditecriteria');

    expect(run().content).not.toContain('<fulfillexpeditecriteria>');
  });
});

describe('casenullification says only what the report type records', () => {
  it('refuses a case recorded as a nullification rather than filing it as "not a nullification"', () => {
    const r = run({ reportType: 'nullification' });
    expect(r.success).toBe(false);
    expect(fields(r)).toContain('reportType');
  });

  it('writes 2 for a recorded follow-up, and omits the flag, with a warning, when no report type is recorded', () => {
    expect(run({ reportType: 'followup' }).content).toContain('<casenullification>2</casenullification>');
    const unrecorded = run({ reportType: undefined });
    expect(unrecorded.success).toBe(true);
    expect(unrecorded.content).not.toContain('<casenullification>');
    expect(warned(unrecorded)).toContain('reportType');
  });
});

describe('the receiver is the one the case records', () => {
  it('names no receiver, with a warning, when none is recorded', () => {
    const r = run();
    expect(r.success).toBe(true);
    expect(r.content).not.toContain('EVCTM');
    expect(r.content).not.toContain('<messagereceiveridentifier>');
    expect(r.content).not.toContain('<receiver>');
    expect(r.content).not.toContain('European Medicines Agency');
    expect(warned(r)).toContain('receiver.receiver_identifier');
  });

  it('writes a recorded receiver as recorded', () => {
    const r = run({
      receiver: { receiver_identifier: 'EVHUMAN', receiver_type: '2', receiver_organization: 'European Medicines Agency' },
    });
    expect(r.content).toContain('<messagereceiveridentifier>EVHUMAN</messagereceiveridentifier>');
    expect(r.content).toContain('<receiverorganization>European Medicines Agency</receiverorganization>');
    expect(r.content).not.toContain('<receivercountrycode>');
  });
});

describe('the age unit is an E2B(R2) code (801-805) or the export is refused', () => {
  it('codes a recorded spelling of years as 801', () => {
    expect(run({ patient: { sex: 'F', age: 34, age_unit: 'yr' } }).content).toContain(
      '<patientonsetageunit>801</patientonsetageunit>'
    );
  });

  it('codes an age computed from the birth date as 801, not the UCUM "a"', () => {
    const r = run({ patient: { sex: 'F', date_of_birth: '1980-02-03' } });
    expect(r.content).toContain('<patientonsetage>46</patientonsetage>');
    expect(r.content).toContain('<patientonsetageunit>801</patientonsetageunit>');
  });

  it('refuses an age unit it has no code for, and an age with no unit', () => {
    expect(fields(run({ patient: { sex: 'F', age: 3, age_unit: 'decades' } }))).toContain('patient.age_unit');
    expect(fields(run({ patient: { sex: 'F', age: 34 } }))).toContain('patient.age_unit');
  });
});

describe('weight is filed in kg and height in cm, converted only by an exact power of ten', () => {
  it.each([
    [{ weight: 70, weight_unit: 'kg' }, '<patientweight>70</patientweight>'],
    [{ weight: 70500, weight_unit: 'g' }, '<patientweight>70.5</patientweight>'],
    [{ height: 175, height_unit: 'cm' }, '<patientheight>175</patientheight>'],
    [{ height: 1.75, height_unit: 'm' }, '<patientheight>175</patientheight>'],
    [{ height: 1755, height_unit: 'mm' }, '<patientheight>175.5</patientheight>'],
  ])('%j is written as %s', (measure, element) => {
    expect(run({ patient: { sex: 'F', ...measure } }).content).toContain(element);
  });

  it.each([
    ['patient.weight_unit', { weight: 154, weight_unit: 'lb' }, '<patientweight>'],
    ['patient.weight_unit', { weight: 70 }, '<patientweight>'],
    ['patient.height_unit', { height: 69, height_unit: 'in' }, '<patientheight>'],
  ])('omits, with a warning on %s, a measure recorded as %j', (field, measure, element) => {
    const r = run({ patient: { sex: 'F', ...measure } });
    expect(r.success).toBe(true);
    expect(r.content, 'a number filed in a unit the case did not record').not.toContain(element);
    expect(warned(r)).toContain(field);
  });
});
