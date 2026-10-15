/**
 * The FDA export files a code under MedDRA's code system only when it is a
 * MedDRA code, and calls itself what it is (audit 2026-10-15, GRDHE
 * follow-up 5).
 *
 * What the generator used to do: write the report type, the seriousness
 * criteria, each reaction's outcome, each product's role and the reporter's
 * qualification with codeSystem 2.16.840.1.113883.6.163, which is MedDRA's.
 * None of them is a MedDRA code, so the message said "report type 1" was the
 * MedDRA concept 1. The repository vendors no OID for those ICH code lists
 * (it has LOINC, NDC and the eCTD v4 lists), so the codes are written without
 * a codeSystem and the export says so. The format list named this HL7 v3
 * message "FDA MedWatch 3500A" / "MedWatch Form 3500A", which is a paper and
 * PDF form.
 */
import { describe, expect, it } from 'vitest';
import { generateFDA3500AXML, SUPPORTED_FORMATS } from '../index';
import type { CanonicalAdverseEvent, ExportJob, TerminologyVersionLock } from '../../types';

const MEDDRA_OID = '2.16.840.1.113883.6.163';
const LOCKED: Record<string, TerminologyVersionLock> = {
  MEDDRA: { version_id: 'tv-meddra', version_code: '26.1', display_name: 'MedDRA 26.1', locked_at: '2026-10-15T00:00:00Z' },
};

const seriousCase = {
  id: 'evt-1',
  tenantId: '3f2a8c1e-7b4d-4e9a-9c2f-1a2b3c4d5e6f',
  caseNumber: 'CASE-001',
  caseVersion: 1,
  caseType: 'spontaneous',
  reportType: 'initial',
  eventDate: '2026-03-10',
  receiveDate: '2026-03-15',
  isSerious: true,
  seriousnessHospitalization: true,
  patient: { initials: 'AB', sex: 'F' },
  reactions: [{ term: 'Headache', term_code: '10019211', term_system: 'MEDDRA', outcome: 'recovered' }],
  suspectProducts: [{ name: 'Examplamab' }],
  concomitantProducts: [{ name: 'Paracetamol' }],
  medicalHistory: { conditions: [{ term: 'Asthma', term_code: '10003553', term_system: 'MEDDRA' }] },
  reporter: { qualification_code: '1' },
  sender: { sender_organization: 'Example Pharma Inc.' },
} as unknown as CanonicalAdverseEvent;

/** Every code written under MedDRA's OID, with the attributes of its element. */
function codesUnderMeddra(xml: string): string[] {
  return [...xml.matchAll(/<(?:code|value|translation)\b[^>]*>/g)]
    .map(m => m[0])
    .filter(tag => tag.includes(`codeSystem="${MEDDRA_OID}"`))
    .map(tag => /\bcode="([^"]*)"/.exec(tag)?.[1] ?? '');
}

describe('FDA export: a code carries MedDRA\'s code system only if it is a MedDRA code', () => {
  it('files only the recorded MedDRA codes under 2.16.840.1.113883.6.163', () => {
    const r = generateFDA3500AXML(seriousCase, {} as ExportJob, LOCKED);
    expect(r.success).toBe(true);
    expect(new Set(codesUnderMeddra(r.content ?? ''))).toEqual(new Set(['10019211', '10003553']));
  });

  it('still writes the report type, criterion, outcome, role and qualification codes, without a codeSystem, and says so', () => {
    const r = generateFDA3500AXML(seriousCase, {} as ExportJob, LOCKED);
    const xml = r.content ?? '';
    for (const code of ['code="HO"', 'code="1"', 'code="2"']) expect(xml).toContain(code);
    const warning = r.warnings.find(w => w.field === 'codeSystem');
    expect(warning, 'the uncoded code systems are named in a warning').toBeDefined();
    expect(warning?.message).toMatch(/report type/);
    expect(warning?.message).toMatch(/reporter qualification/);
  });
});

describe('FDA export: the format is labelled as what it writes', () => {
  it('is an HL7 v3 ICSR-style message, not MedWatch Form 3500A', () => {
    const format = SUPPORTED_FORMATS.FDA_AE_3500A;
    expect(format.name).toContain('HL7 v3');
    expect(format.description).toMatch(/not (?:the )?MedWatch Form 3500A/);
    const r = generateFDA3500AXML(seriousCase, {} as ExportJob, LOCKED);
    expect(r.fileName?.startsWith('FDA_3500A_'), 'a file name claiming the form').toBe(false);
  });
});
