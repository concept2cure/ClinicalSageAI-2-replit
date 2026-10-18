/**
 * The two GRDHE safety exports code only what the case records (audit
 * 2026-10-15, finding 5).
 *
 * What the generators used to do, for a case that did not record the fact:
 *
 *   E2B   MedDRA version '27.1', primary-source and occurrence country 'US',
 *         reporter qualification '5' (consumer), sender type '2' (regulatory
 *         authority), <serious>2</serious> when seriousness was never stated,
 *         a stopped medical-history condition, a reaction duration unit 'd',
 *         report type 1 (spontaneous) for a clinical-trial case. Dose units
 *         were looked up in the AGE-unit table, which holds none, so every dose
 *         was coded 003 (mg): a 5 g dose filed as 5 mg. The file called itself
 *         E2B(R3) in the HL7 v3 namespace while every element was E2B(R2).
 *   3500A MedDRA '27.1', sender "Unknown Organization", reporter "Healthcare
 *         Professional" with qualification 5 and id "unknown", a non-serious
 *         flag for an unstated seriousness, dose unit 'mg', weight unit 'kg',
 *         a dosing period of 1 'd', a duration unit 'd', a recorded "negative"
 *         rechallenge filed as positive, a nullification filed as an initial
 *         report, and the code "unknown" in the MedDRA, route and NDC systems.
 *
 * Every one of those returned success: true.
 */
import { describe, expect, it } from 'vitest';
import { generateE2BR3XML, generateFDA3500AXML, SUPPORTED_FORMATS } from '../index';
import type { CanonicalAdverseEvent, ExportJob, TerminologyVersionLock } from '../../types';

const JOB = {} as ExportJob;
const LOCKED: Record<string, TerminologyVersionLock> = {
  MEDDRA: { version_id: 'tv-meddra', version_code: '26.1', display_name: 'MedDRA 26.1', locked_at: '2026-10-15T00:00:00Z' },
};

/**
 * A case with every fact the generators code recorded. Overrides replace whole keys.
 * Canonical field names (types.ts): 2026-10-15 these fixtures used product_name,
 * dose_value, meddra_pt_code and other names no type defines.
 */
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
    patient: { initials: 'AB', sex: 'female', country: 'DE' },
    reactions: [{ term: 'Headache', term_code: '10019211', outcome: 'recovered' }],
    suspectProducts: [{ name: 'Examplamab', dose: 5, dose_unit: 'g' }],
    reporter: { qualification_code: '1', country_code: 'DE', family_name: 'Ng' },
    sender: { sender_type: '1', sender_organization: 'Example Pharma GmbH' },
  };
  return { ...base, ...overrides } as unknown as CanonicalAdverseEvent;
}

const fields = (r: { errors?: Array<{ field: string }> }) => (r.errors ?? []).map(e => e.field);

describe('E2B export: codes only what the case records', () => {
  it('codes a 5 g dose as gram (002), not as milligram (003) from the age-unit table', () => {
    const r = generateE2BR3XML(recordedCase(), JOB, LOCKED);
    expect(r.success).toBe(true);
    expect(r.content).toContain('<drugstructuredosageunit>002</drugstructuredosageunit>');
    expect(r.content).not.toContain('<drugstructuredosageunit>003</drugstructuredosageunit>');
  });

  it('refuses a dose unit it has no code for, and a recorded dose with no unit', () => {
    const unknownUnit = generateE2BR3XML(
      recordedCase({ suspectProducts: [{ name: 'Examplamab', dose: 2, dose_unit: 'tablespoon' }] }),
      JOB,
      LOCKED
    );
    expect(unknownUnit.success).toBe(false);
    expect(fields(unknownUnit)).toContain('suspectProducts[0].dose_unit');

    const noUnit = generateE2BR3XML(
      recordedCase({ suspectProducts: [{ name: 'Examplamab', dose: 2 }] }),
      JOB,
      LOCKED
    );
    expect(noUnit.success).toBe(false);
    expect(fields(noUnit)).toContain('suspectProducts[0].dose_unit');
  });

  it("takes the MedDRA version from the job's terminology lock, and refuses without one", () => {
    const unlocked = generateE2BR3XML(recordedCase(), JOB, {});
    expect(unlocked.success, 'an export with no locked MedDRA version must not invent one').toBe(false);
    expect(unlocked.errors?.map(e => e.code)).toContain('E2B-MEDDRA-VERSION');

    const locked = generateE2BR3XML(recordedCase(), JOB, LOCKED);
    expect(locked.content).toContain('<reactionmeddraversionpt>26.1</reactionmeddraversionpt>');
    expect(locked.metadata?.terminologyVersions).toEqual({ meddra: '26.1' });
  });

  it('never asserts a reporter qualification or a country nobody recorded', () => {
    const r = generateE2BR3XML(
      recordedCase({ reporter: { family_name: 'Ng' }, patient: { initials: 'AB', sex: 'female' } }),
      JOB,
      LOCKED
    );
    expect(r.success).toBe(true);
    expect(r.content).not.toContain('<qualification>');
    expect(r.content).not.toContain('<medicallyconfirm>');
    expect(r.content).not.toContain('<primarysourcecountry>');
    expect(r.content).not.toContain('<occurcountry>');
    expect(r.content).not.toMatch(/>US</);
    expect(r.warnings.map(w => w.field)).toEqual(expect.arrayContaining(['reporter.qualification', 'reporter.country_code']));
  });

  it('refuses a case whose sender type is not recorded (code 2 is a regulatory authority)', () => {
    const r = generateE2BR3XML(recordedCase({ sender: {} }), JOB, LOCKED);
    expect(r.success).toBe(false);
    expect(fields(r)).toContain('sender.sender_type');
  });

  it('refuses a case whose seriousness was never stated, instead of filing it non-serious', () => {
    const r = generateE2BR3XML(recordedCase({ isSerious: undefined }), JOB, LOCKED);
    expect(r.success).toBe(false);
    expect(fields(r)).toContain('isSerious');
  });

  it('codes a clinical-trial case as a report from study, and refuses a case type with no single report type', () => {
    const trial = generateE2BR3XML(recordedCase({ caseType: 'clinical_trial' }), JOB, LOCKED);
    expect(trial.content).toContain('<reporttype>2</reporttype>');

    const literature = generateE2BR3XML(recordedCase({ caseType: 'literature' }), JOB, LOCKED);
    expect(literature.success).toBe(false);
    expect(fields(literature)).toContain('caseType');
  });

  it('does not say a medical-history condition stopped when nobody recorded whether it continues', () => {
    const history = (ongoing?: boolean) =>
      generateE2BR3XML(
        recordedCase({ medicalHistory: { conditions: [{ term_code: '10020772', ongoing }] } }),
        JOB,
        LOCKED
      ).content;
    expect(history(undefined)).not.toContain('<patientmedicalcontinue>');
    expect(history(false)).toContain('<patientmedicalcontinue>2</patientmedicalcontinue>');
  });

  it('codes a reaction duration through the time-unit list, and refuses a duration with no unit', () => {
    const reaction = { term: 'Headache', term_code: '10019211', outcome: 'recovered', duration: 3 };
    const days = generateE2BR3XML(recordedCase({ reactions: [{ ...reaction, duration_unit: 'days' }] }), JOB, LOCKED);
    expect(days.content).toContain('<reactiondurationunit>804</reactiondurationunit>');

    const none = generateE2BR3XML(recordedCase({ reactions: [reaction] }), JOB, LOCKED);
    expect(none.success).toBe(false);
    expect(fields(none)).toContain('reactions[0].duration_unit');
  });

  it('labels the output as the E2B(R2) ichicsr vocabulary it is written in', () => {
    const r = generateE2BR3XML(recordedCase(), JOB, LOCKED);
    expect(r.content).not.toContain('E2B(R3)');
    expect(r.content).not.toContain('urn:hl7-org:v3');
    expect(r.content).toContain('<ichicsr lang="en">');
    expect(r.fileName?.startsWith('E2B_R2_')).toBe(true);
    expect(r.metadata?.format).toBe('ICH_E2B_R2');
    expect(SUPPORTED_FORMATS.EMA_AE_E2B_R3.name).toContain('E2B(R2)');
    expect(SUPPORTED_FORMATS.EMA_AE_E2B_R3.description).not.toMatch(/ICH E2B\(R3\) format/);
  });
});

describe('FDA 3500A export: codes only what the case records', () => {
  it("takes the MedDRA version from the job's terminology lock, and refuses without one", () => {
    const unlocked = generateFDA3500AXML(recordedCase(), JOB, {});
    expect(unlocked.success, 'an export with no locked MedDRA version must not invent one').toBe(false);
    expect(unlocked.errors?.map(e => e.code)).toContain('FDA-MEDDRA-VERSION');

    const locked = generateFDA3500AXML(recordedCase(), JOB, LOCKED);
    expect(locked.content).toContain('codeSystemVersion="26.1"');
    expect(locked.content).not.toContain('27.1');
  });

  it('never names a sender organisation, reporter qualification or reporter id nobody recorded', () => {
    const r = generateFDA3500AXML(recordedCase({ sender: {}, reporter: { family_name: 'Ng' } }), JOB, LOCKED);
    expect(r.success).toBe(true);
    expect(r.content).not.toContain('Unknown Organization');
    expect(r.content).not.toContain('Healthcare Professional');
    expect(r.content).not.toMatch(/<code code="5"/);
    expect(r.content).not.toContain('extension="unknown"');
    expect(r.warnings.map(w => w.field)).toEqual(
      expect.arrayContaining(['sender.sender_organization', 'reporter.qualification'])
    );
  });

  it('refuses a case whose seriousness was never stated, instead of filing it non-serious', () => {
    const r = generateFDA3500AXML(recordedCase({ isSerious: undefined }), JOB, LOCKED);
    expect(r.success).toBe(false);
    expect(fields(r)).toContain('isSerious');
  });

  it('codes a recorded dose unit, and refuses a dose with no unit instead of assuming mg', () => {
    const grams = generateFDA3500AXML(recordedCase(), JOB, LOCKED);
    expect(grams.content).toContain('<doseQuantity value="5" unit="g"/>');

    const none = generateFDA3500AXML(
      recordedCase({ suspectProducts: [{ name: 'Examplamab', dose: 5 }] }),
      JOB,
      LOCKED
    );
    expect(none.success).toBe(false);
    expect(fields(none)).toContain('suspectProducts[0].dose_unit');
  });

  it('emits a dosing period only when one is recorded, never "every 1 d"', () => {
    const textOnly = generateFDA3500AXML(
      recordedCase({ suspectProducts: [{ name: 'Examplamab', frequency: 'twice daily' }] }),
      JOB,
      LOCKED
    );
    expect(textOnly.success).toBe(true);
    expect(textOnly.content).not.toContain('<period');

    const recorded = generateFDA3500AXML(
      recordedCase({ suspectProducts: [{ name: 'Examplamab', frequency_value: 12, frequency_unit: 'hours' }] }),
      JOB,
      LOCKED
    );
    expect(recorded.content).toContain('<period value="12" unit="h"/>');
  });

  it('refuses a weight or a reaction duration with no unit, instead of assuming kg or days', () => {
    const weight = generateFDA3500AXML(
      recordedCase({ patient: { initials: 'AB', sex: 'female', weight: 70 } }),
      JOB,
      LOCKED
    );
    expect(weight.success).toBe(false);
    expect(fields(weight)).toContain('patient.weight_unit');

    const duration = generateFDA3500AXML(
      recordedCase({ reactions: [{ term: 'Headache', term_code: '10019211', duration: 3 }] }),
      JOB,
      LOCKED
    );
    expect(duration.success).toBe(false);
    expect(fields(duration)).toContain('reactions[0].duration_unit');
  });

  it('files a recorded negative rechallenge as negative', () => {
    const r = generateFDA3500AXML(
      recordedCase({ suspectProducts: [{ name: 'Examplamab', rechallenge: 'negative' }] }),
      JOB,
      LOCKED
    );
    expect(r.content).toContain('<value xsi:type="ST">negative</value>');
    expect(r.content).not.toContain('<value xsi:type="ST">positive</value>');
  });

  it('refuses a report type it has no code for: a nullification is not an initial report', () => {
    const r = generateFDA3500AXML(recordedCase({ reportType: 'nullification' }), JOB, LOCKED);
    expect(r.success).toBe(false);
    expect(fields(r)).toContain('reportType');
  });

  it('never writes the code "unknown" into the MedDRA, route or NDC code systems', () => {
    const uncoded = generateFDA3500AXML(recordedCase({ reactions: [{ term: 'Headache' }] }), JOB, LOCKED);
    expect(uncoded.success, 'a reaction with no MedDRA code').toBe(false);
    expect(fields(uncoded)).toContain('reactions[0].term_code');

    const r = generateFDA3500AXML(
      recordedCase({
        suspectProducts: [{ name: 'Examplamab', id: 'internal-7' }],
        medicalHistory: { conditions: [{ term: 'Asthma' }] },
      }),
      JOB,
      LOCKED
    );
    expect(r.success).toBe(true);
    expect(r.content).not.toContain('code="unknown"');
    expect(r.content).not.toContain('<routeCode');
    expect(r.content).not.toContain('code="internal-7"');
  });
});
