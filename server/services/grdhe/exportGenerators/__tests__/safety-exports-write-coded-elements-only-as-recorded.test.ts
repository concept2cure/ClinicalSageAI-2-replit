/**
 * The safety exports write these coded elements only as the case records
 * them; otherwise they omit the element and say so (GRDHE follow-up 3,
 * 2026-10-15).
 *
 * What the generators used to write, for a case that recorded nothing there:
 *   E2B  <duplicate>2</duplicate> and <additionaldocument>2</additionaldocument>
 *        for every case; <actiondrug>5</actiondrug> (unknown) for an unrecorded
 *        action, and a substring guess for a recorded one ("not stopped" filed
 *        as 1, withdrawn); <reactionoutcome>6</reactionoutcome> for an
 *        unrecorded outcome, and 1 (recovered) for the recorded not_recovered;
 *        <patientautopsyyesno>3</patientautopsyyesno> (unknown) for a death
 *        with no autopsy recorded, and for an autopsy recorded as not done;
 *        <moreinformation> 1 or 2 from whether the result was abnormal;
 *        <drugauthorizationholder> filled with the manufacturer; and
 *        <messagesenderidentifier> filled with the tenant id.
 *   FDA  a reaction outcome of code 6, displayName "unknown", when none was
 *        recorded, and code 0 (not an ICH code) for one that did not map; and
 *        the sender device id filled with the tenant id.
 */
import { describe, expect, it } from 'vitest';
import { generateE2BR3XML, generateFDA3500AXML } from '../index';
import type { CanonicalAdverseEvent, ExportJob, TerminologyVersionLock } from '../../types';

const JOB = {} as ExportJob;
const TENANT = '3f2a8c1e-7b4d-4e9a-9c2f-1a2b3c4d5e6f';
const LOCKED: Record<string, TerminologyVersionLock> = {
  MEDDRA: { version_id: 'tv-meddra', version_code: '26.1', display_name: 'MedDRA 26.1', locked_at: '2026-10-15T00:00:00Z' },
};

function recordedCase(overrides: Record<string, unknown> = {}): CanonicalAdverseEvent {
  const base: Record<string, unknown> = {
    id: 'evt-1',
    tenantId: TENANT,
    caseNumber: 'CASE-001',
    caseVersion: 1,
    caseType: 'spontaneous',
    reportType: 'initial',
    eventDate: '2026-03-10',
    receiveDate: '2026-03-15',
    createdAt: new Date('2026-03-15T09:00:00Z'),
    isSerious: false,
    patient: { initials: 'AB', sex: 'F' },
    reactions: [{ term: 'Headache', term_code: '10019211', term_system: 'MEDDRA', term_version: '26.1', outcome: 'recovered' }],
    suspectProducts: [{ name: 'Examplamab', action_taken: 'dose_not_changed', authorization_holder: 'Example Pharma GmbH' }],
    reporter: { qualification_code: '1', country_code: 'DE' },
    sender: { sender_type: '1', sender_identifier: 'EXAMPLEPHARMA-DE', sender_organization: 'Example Pharma GmbH' },
  };
  return { ...base, ...overrides } as unknown as CanonicalAdverseEvent;
}

const e2b = (overrides: Record<string, unknown> = {}) => generateE2BR3XML(recordedCase(overrides), JOB, LOCKED);
const fda = (overrides: Record<string, unknown> = {}) => generateFDA3500AXML(recordedCase(overrides), JOB, LOCKED);
const warned = (r: { warnings: Array<{ field: string }> }) => r.warnings.map(w => w.field);

describe('E2B: elements no field records are omitted, with a warning', () => {
  it('writes no duplicate or additionaldocument flag nobody recorded', () => {
    const r = e2b();
    expect(r.success).toBe(true);
    expect(r.content).not.toContain('<duplicate>');
    expect(r.content).not.toContain('<additionaldocument>');
    expect(warned(r)).toEqual(expect.arrayContaining(['duplicate', 'additionaldocument']));
  });

  it('writes no moreinformation flag, and does not read it from whether a result was abnormal', () => {
    const r = e2b({ medicalHistory: { relevant_tests: [{ test_name: 'ALT', result: '82', abnormal: true }] } });
    expect(r.content).toContain('<testname>ALT</testname>');
    expect(r.content).not.toContain('<moreinformation>');
    expect(warned(r)).toContain('moreinformation');
  });

  it('names the sender only by the identifier the case records, never by the tenant id', () => {
    const recorded = e2b();
    expect(recorded.content).toContain('<messagesenderidentifier>EXAMPLEPHARMA-DE</messagesenderidentifier>');

    const unrecorded = e2b({ sender: { sender_type: '1', sender_organization: 'Example Pharma GmbH' } });
    expect(unrecorded.success).toBe(true);
    expect(unrecorded.content).not.toContain('<messagesenderidentifier>');
    expect(unrecorded.content).not.toContain(TENANT);
    expect(warned(unrecorded)).toContain('sender.sender_identifier');
  });

  it('files the authorization holder only as recorded, never the manufacturer', () => {
    expect(e2b().content).toContain('<drugauthorizationholder>Example Pharma GmbH</drugauthorizationholder>');
    const r = e2b({ suspectProducts: [{ name: 'Examplamab', manufacturer: 'Contract Fill-Finish AG', action_taken: 'withdrawn' }] });
    expect(r.content).not.toContain('<drugauthorizationholder>');
    expect(r.content).not.toContain('Contract Fill-Finish AG</drugauthorizationholder>');
    expect(warned(r)).toContain('suspectProducts[0].authorization_holder');
  });
});

describe('E2B: coded values are coded from what is recorded, or omitted with a warning', () => {
  it.each([
    ['dose_not_changed', '4'],
    ['withdrawn', '1'],
    ['dose reduced', '2'],
    ['unknown', '5'],
  ])('codes a recorded action taken %s as %s', (action, code) => {
    expect(e2b({ suspectProducts: [{ name: 'Examplamab', action_taken: action }] }).content).toContain(`<actiondrug>${code}</actiondrug>`);
  });

  it.each([
    ['not recorded', undefined],
    ['text that names no action code ("not stopped" was filed as 1, withdrawn)', 'not stopped'],
  ])('omits the action taken when it is %s', (_name, action) => {
    const r = e2b({ suspectProducts: [{ name: 'Examplamab', action_taken: action }] });
    expect(r.success).toBe(true);
    expect(r.content).not.toContain('<actiondrug>');
    expect(warned(r)).toContain('suspectProducts[0].action_taken');
  });

  it.each([
    ['recovered', '1'],
    ['not_recovered', '3'],
    ['recovered_with_sequelae', '4'],
    ['unknown', '6'],
  ])('codes a recorded outcome %s as %s', (outcome, code) => {
    const reaction = { term: 'Headache', term_code: '10019211', term_system: 'MEDDRA', term_version: '26.1', outcome };
    expect(e2b({ reactions: [reaction] }).content).toContain(`<reactionoutcome>${code}</reactionoutcome>`);
  });

  it('omits an outcome nobody recorded, instead of filing it as 6 (unknown)', () => {
    const r = e2b({ reactions: [{ term: 'Headache', term_code: '10019211', term_system: 'MEDDRA', term_version: '26.1' }] });
    expect(r.success).toBe(true);
    expect(r.content).not.toContain('<reactionoutcome>');
    expect(warned(r)).toContain('reactions[0].outcome');
  });

  it.each([
    [true, '<patientautopsyyesno>1</patientautopsyyesno>'],
    [false, '<patientautopsyyesno>2</patientautopsyyesno>'],
  ])('files a recorded autopsy %s as recorded', (autopsy, element) => {
    const r = e2b({ isSerious: true, seriousnessDeath: true, patient: { sex: 'F', autopsy_performed: autopsy } });
    expect(r.content).toContain(element);
  });

  it('omits the autopsy flag for a death with none recorded, instead of filing 3 (unknown)', () => {
    const r = e2b({ isSerious: true, seriousnessDeath: true, patient: { sex: 'F' } });
    expect(r.success).toBe(true);
    expect(r.content).toContain('<patientdeath>');
    expect(r.content).not.toContain('<patientautopsyyesno>');
    expect(warned(r)).toContain('patient.autopsy_performed');
  });
});

describe('FDA: the reaction outcome and the sender id only as recorded', () => {
  it('codes a recorded outcome, and omits an unrecorded or unmapped one with a warning', () => {
    const outcome = (value?: string) =>
      fda({ reactions: [{ term: 'Headache', term_code: '10019211', term_system: 'MEDDRA', term_version: '26.1', outcome: value }] });
    expect(outcome('not_recovered').content).toMatch(/<value xsi:type="CD" code="3"\s+displayName="not_recovered"\/>/);

    for (const value of [undefined, 'resolved']) {
      const r = outcome(value);
      expect(r.success).toBe(true);
      expect(r.content).not.toContain('code="OUTCOME"');
      expect(r.content).not.toContain('displayName="unknown"');
      expect(r.content).not.toMatch(/<value xsi:type="CD" code="0"/);
      expect(warned(r)).toContain('reactions[0].outcome');
    }
  });

  it('identifies the sender device by the identifier the case records, never by the tenant id', () => {
    expect(fda().content).toContain('<id extension="EXAMPLEPHARMA-DE"/>');
    const r = fda({ sender: { sender_organization: 'Example Pharma GmbH' } });
    expect(r.content).not.toContain(`extension="${TENANT}"`);
    expect(r.content).not.toContain('2.16.840.1.113883.3.0"');
    expect(warned(r)).toContain('sender.sender_identifier');
  });
});
