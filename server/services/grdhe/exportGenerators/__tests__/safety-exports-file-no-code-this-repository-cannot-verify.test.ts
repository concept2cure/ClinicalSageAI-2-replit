/**
 * The safety exports file no code this repository cannot verify; each such
 * code is left out, the element says it has none (nullFlavor), and a warning
 * names the code (GRDHE follow-up 5, 2026-10-15).
 *
 * What the FDA export used to file:
 *   - the patient's age under LOINC 3137-7 labelled "Age at onset", the weight
 *     under LOINC 3141-9 and the medical history under LOINC 29762-2. The only
 *     LOINC codes this repository vendors are SPL document and section codes
 *     (server/services/labeling/labeling-intelligence-knowledge.ts,
 *     server/services/regulatory/spl-fhir.ts); none of these is among them, and
 *     3137-7 is believed to be a body-height code;
 *   - the route as an NCI C-code (C38288 for oral) under 2.16.840.1.113883.5.112,
 *     HL7's RouteOfAdministration, and a route with no C-code as its own text in
 *     the code attribute;
 *   - the action taken under C53254 in 2.16.840.1.113883.3.26.1.1, which
 *     db/migrations/057_gcc_product_master.sql names as ISO 11238 substance
 *     identifiers.
 * The E2B export wrote the same NCI C-code (or the recorded text) into
 * drugadministrationroute, whose codes in this repository's E2B reference are
 * three digits (data/test_output/ingestion_00093_7146.json: "048").
 */
import { describe, expect, it } from 'vitest';
import { generateE2BR3XML, generateFDA3500AXML } from '../index';
import type { CanonicalAdverseEvent, ExportJob, TerminologyVersionLock } from '../../types';

const JOB = {} as ExportJob;
const LOCKED: Record<string, TerminologyVersionLock> = {
  MEDDRA: { version_id: 'tv-meddra', version_code: '26.1', display_name: 'MedDRA 26.1', locked_at: '2026-10-15T00:00:00Z' },
};

function recordedCase(overrides: Record<string, unknown> = {}): CanonicalAdverseEvent {
  return {
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
    patient: { initials: 'AB', sex: 'F', age: 34, age_unit: 'years', weight: 70, weight_unit: 'kg' },
    reactions: [{ term: 'Headache', term_code: '10019211', term_system: 'MEDDRA', term_version: '26.1', outcome: 'recovered' }],
    medicalHistory: { conditions: [{ term: 'Asthma', term_code: '10003553', term_system: 'MEDDRA' }] },
    suspectProducts: [{ name: 'Examplamab', route: 'oral', action_taken: 'withdrawn', authorization_holder: 'Example Pharma GmbH' }],
    reporter: { qualification_code: '1', country_code: 'DE' },
    sender: { sender_type: '1', sender_identifier: 'EXAMPLEPHARMA-DE', sender_organization: 'Example Pharma GmbH' },
    ...overrides,
  } as unknown as CanonicalAdverseEvent;
}

const messages = (r: { warnings: Array<{ message: string }> }) => r.warnings.map(w => w.message).join('\n');

describe('FDA export: no LOINC code the repository does not vendor', () => {
  it('files age, weight and medical history without 3137-7, 3141-9 or 29762-2, keeping the recorded values, and names each code', () => {
    const r = generateFDA3500AXML(recordedCase(), JOB, LOCKED);
    expect(r.success).toBe(true);
    const xml = r.content ?? '';
    for (const code of ['3137-7', '3141-9', '29762-2']) {
      expect(xml, `LOINC ${code} filed`).not.toContain(`code="${code}"`);
      expect(messages(r), `no warning names ${code}`).toContain(code);
    }
    expect(xml).toContain('<value xsi:type="PQ" value="34" unit="a"/>');
    expect(xml).toContain('<value xsi:type="PQ" value="70" unit="kg"/>');
    expect(xml).toContain('<code nullFlavor="NI"><originalText>Age at onset</originalText></code>');
    expect(xml).toContain('code="10003553"');
  });
});

describe('FDA export: no route code filed under a code system it does not belong to', () => {
  it('writes a recorded route as text, without its NCI code or the HL7 route OID, and names the code', () => {
    const r = generateFDA3500AXML(recordedCase(), JOB, LOCKED);
    expect(r.content).not.toContain('C38288');
    expect(r.content).not.toContain('2.16.840.1.113883.5.112');
    expect(r.content).toContain('<routeCode nullFlavor="NI"><originalText>oral</originalText></routeCode>');
    expect(r.warnings.find(w => w.field === 'suspectProducts[0].route')?.message).toContain('C38288');
  });

  it('does not write a recorded route with no code as if it were a code', () => {
    const r = generateFDA3500AXML(
      recordedCase({ suspectProducts: [{ name: 'Examplamab', route: 'by mouth', action_taken: 'withdrawn' }] }),
      JOB,
      LOCKED
    );
    expect(r.content).not.toContain('code="by mouth"');
    expect(r.content).toContain('<originalText>by mouth</originalText>');
  });
});

describe('FDA export: the action taken is not filed under an ISO 11238 OID', () => {
  it('writes the recorded action without C53254 or 2.16.840.1.113883.3.26.1.1, and names both', () => {
    const r = generateFDA3500AXML(recordedCase(), JOB, LOCKED);
    expect(r.content).not.toContain('C53254');
    expect(r.content).not.toContain('2.16.840.1.113883.3.26.1.1');
    expect(r.content).toContain('<value xsi:type="ST">withdrawn</value>');
    const warning = r.warnings.find(w => w.field === 'suspectProducts[0].action_taken')?.message ?? '';
    expect(warning).toContain('C53254');
    expect(warning).toContain('2.16.840.1.113883.3.26.1.1');
  });
});

describe('E2B export: drugadministrationroute carries an E2B route code or nothing', () => {
  it('omits a route recorded as text, rather than filing its NCI code or the text as the code', () => {
    const r = generateE2BR3XML(recordedCase(), JOB, LOCKED);
    expect(r.success).toBe(true);
    expect(r.content).not.toContain('C38288');
    expect(r.content).not.toContain('<drugadministrationroute>');
    expect(r.warnings.map(w => w.field)).toContain('suspectProducts[0].route');
  });

  it('writes a route recorded as an E2B route code as recorded', () => {
    const r = generateE2BR3XML(
      recordedCase({ suspectProducts: [{ name: 'Examplamab', route: '048', action_taken: 'withdrawn', authorization_holder: 'X' }] }),
      JOB,
      LOCKED
    );
    expect(r.content).toContain('<drugadministrationroute>048</drugadministrationroute>');
    expect(r.warnings.map(w => w.field)).not.toContain('suspectProducts[0].route');
  });
});
