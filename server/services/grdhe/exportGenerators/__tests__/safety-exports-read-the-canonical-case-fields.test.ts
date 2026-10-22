/**
 * The safety exports read a case by the field names the canonical case types
 * define (server/services/grdhe/types.ts), which are the names intake records
 * and the seeded mapping rules read (audit 2026-10-15, GRDHE follow-up 6).
 *
 * What the generators used to read instead: product_name, product_id,
 * dose_value, dosage_form, stop_date; reaction_term, meddra_pt_code,
 * resolution_date, duration_value; patient_initials, birth_date, age_value,
 * weight_value; street_address, state_province, telephone; a medical-history
 * meddra_code and condition_term; lab_tests. None is a canonical field, so a
 * case recorded through POST /api/grdhe/adverse-events lost each of those facts
 * silently: the 3500A filed a product with an empty name, the E2B refused the
 * case for "missing" a product name it had. The E2B also filed the canonical
 * sex 'F' as 0 (unknown), and wrote the qualification text "physician" into
 * the coded qualification element.
 */
import { describe, expect, it } from 'vitest';
import { generateE2BR3XML, generateFDA3500AXML } from '../index';
import type { CanonicalAdverseEvent, ExportJob, TerminologyVersionLock } from '../../types';

const JOB = {} as ExportJob;
const LOCKED: Record<string, TerminologyVersionLock> = {
  MEDDRA: { version_id: 'tv-meddra', version_code: '26.1', display_name: 'MedDRA 26.1', locked_at: '2026-10-15T00:00:00Z' },
};

/** A case as intake records it: every key below is a canonical field. */
function canonicalCase(overrides: Record<string, unknown> = {}): CanonicalAdverseEvent {
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
    patient: { initials: 'AB', sex: 'F', date_of_birth: '1980-02-03', weight: 70, weight_unit: 'kg' },
    reactions: [
      { term: 'Headache', term_code: '10019211', term_system: 'MEDDRA', onset_date: '2026-03-10', end_date: '2026-03-12', outcome: 'recovered' },
    ],
    suspectProducts: [
      { id: 'prod-1', name: 'Examplamab', dose: '5', dose_unit: 'g', dose_form: 'solution for injection', end_date: '2026-03-11', rechallenge: 'negative' },
    ],
    medicalHistory: {
      conditions: [{ term: 'Asthma', term_code: '10003553', term_system: 'MEDDRA', ongoing: true }],
      relevant_tests: [{ test_name: 'ALT', result: '82', result_unit: 'U/L', date: '2026-03-11' }],
    },
    reporter: {
      name: 'Dr Ng', qualification: 'physician', organization: 'University Hospital', address: '1 Main St',
      city: 'Basel', state: 'BS', postal_code: '4051', country: 'CH', country_code: 'CH', phone: '+41 61 000 00 00',
    },
    sender: { sender_type: '1', sender_organization: 'Example Pharma GmbH' },
  };
  return { ...base, ...overrides } as unknown as CanonicalAdverseEvent;
}

const fields = (r: { errors?: Array<{ field: string }> }) => (r.errors ?? []).map(e => e.field);

describe('E2B export reads the canonical case fields', () => {
  it('files every recorded fact under its element', () => {
    const r = generateE2BR3XML(canonicalCase(), JOB, LOCKED);
    expect(r.errors ?? [], 'a canonical case was refused').toEqual([]);
    for (const element of [
      '<medicinalproduct>Examplamab</medicinalproduct>',
      '<drugstructuredosagenumb>5</drugstructuredosagenumb>',
      '<drugstructuredosageunit>002</drugstructuredosageunit>',
      '<drugdosageform>solution for injection</drugdosageform>',
      '<drugenddate>20260311</drugenddate>',
      '<drugrecurreadministration>2</drugrecurreadministration>',
      '<primarysourcereaction>Headache</primarysourcereaction>',
      '<reactionmeddrapt>10019211</reactionmeddrapt>',
      '<reactionenddate>20260312</reactionenddate>',
      '<patientinitial>AB</patientinitial>',
      '<patientbirthdate>19800203</patientbirthdate>',
      '<patientsex>2</patientsex>',
      '<patientweight>70</patientweight>',
      '<patientepisodename>10003553</patientepisodename>',
      '<testname>ALT</testname>',
      '<testunit>U/L</testunit>',
      '<testdate>20260311</testdate>',
      '<qualification>1</qualification>',
      '<reporterstreet>1 Main St</reporterstreet>',
      '<reporterstate>BS</reporterstate>',
    ]) {
      expect(r.content, element).toContain(element);
    }
  });

  it("says the reporter's one-string name is not split into given and family names", () => {
    const r = generateE2BR3XML(canonicalCase(), JOB, LOCKED);
    expect(r.content).not.toContain('Dr Ng');
    expect(r.warnings.map(w => w.field)).toContain('reporter.name');
  });

  it('files a recorded qualification code as recorded', () => {
    const r = generateE2BR3XML(canonicalCase({ reporter: { qualification_code: '3', country_code: 'CH' } }), JOB, LOCKED);
    expect(r.content).toContain('<qualification>3</qualification>');
  });
});

describe('3500A export reads the canonical case fields', () => {
  it('files every recorded fact under its element', () => {
    const r = generateFDA3500AXML(canonicalCase(), JOB, LOCKED);
    expect(r.errors ?? [], 'a canonical case was refused').toEqual([]);
    for (const element of [
      '<name>Examplamab</name>',
      '<id extension="prod-1"/>',
      '<doseQuantity value="5" unit="g"/>',
      '<high value="20260311"/>',
      'code="10019211"',
      'displayName="Headache"',
      '<high value="20260312"/>',
      '<name>AB</name>',
      '<birthTime value="19800203"/>',
      '<value xsi:type="PQ" value="70" unit="kg"/>',
      'code="10003553"',
      '<name>Dr Ng</name>',
      '<streetAddressLine>1 Main St</streetAddressLine>',
      '<state>BS</state>',
      '<telecom value="tel:+41 61 000 00 00"/>',
    ]) {
      expect(r.content, element).toContain(element);
    }
    expect(r.content, 'a product filed with no name').not.toContain('<name></name>');
  });
});

describe('both exports refuse what they cannot file as recorded', () => {
  it('a reaction coded in another terminology is not filed as a MedDRA code', () => {
    const snomed = canonicalCase({ reactions: [{ term: 'Headache', term_code: '25064002', term_system: 'SNOMED_CT' }] });
    expect(fields(generateE2BR3XML(snomed, JOB, LOCKED))).toContain('reactions[0].term_system');
    expect(fields(generateFDA3500AXML(snomed, JOB, LOCKED))).toContain('reactions[0].term_system');
  });

  it('a dose recorded as text is not split into a number by guess', () => {
    const text = canonicalCase({ suspectProducts: [{ name: 'Examplamab', dose: 'one tablet', dose_unit: 'mg' }] });
    expect(fields(generateE2BR3XML(text, JOB, LOCKED))).toContain('suspectProducts[0].dose');
    expect(fields(generateFDA3500AXML(text, JOB, LOCKED))).toContain('suspectProducts[0].dose');
  });
});
