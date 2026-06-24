import { describe, it, expect } from 'vitest';
import { validateSplSpec, generateSpl, type SplSpec } from '../spl-generator.js';

const goodSpec: SplSpec = {
  documentTypeCode: '34391-3',
  documentTypeDisplayName: 'Human Prescription Drug Label',
  title: 'EXAMPLE 20 mg Tablets',
  setId: '11111111-2222-3333-4444-555555555555',
  versionNumber: 1,
  effectiveDate: '20260101',
  organizationName: 'Example Pharma Inc.',
  sections: [
    { code: '34067-9', title: 'Indications and Usage', text: 'For the treatment of X.' },
  ],
};

describe('validateSplSpec', () => {
  it('passes a well-formed spec (with a synthesized-id warning)', () => {
    const v = validateSplSpec(goodSpec);
    expect(v.valid).toBe(true);
    expect(v.errors).toEqual([]);
    expect(v.warnings.some((w) => w.path === '/documentId')).toBe(true);
  });

  it('flags bad LOINC, bad GUID, bad version, and missing sections', () => {
    const v = validateSplSpec({ ...goodSpec, documentTypeCode: 'XYZ', setId: 'not-a-guid', versionNumber: 0, sections: [] });
    const paths = v.errors.map((e) => e.path);
    expect(v.valid).toBe(false);
    expect(paths).toEqual(expect.arrayContaining(['/documentTypeCode', '/setId', '/versionNumber', '/sections']));
  });
});

describe('generateSpl', () => {
  it('produces well-formed SPL XML with the HL7 namespace and LOINC code system', () => {
    const { xml, structurallyValid } = generateSpl(goodSpec);
    expect(structurallyValid).toBe(true);
    expect(xml).toContain('<document xmlns="urn:hl7-org:v3">');
    expect(xml).toContain('codeSystem="2.16.840.1.113883.6.1"');
    expect(xml).toContain('<setId root="11111111-2222-3333-4444-555555555555"/>');
    expect(xml).toContain('<name>Example Pharma Inc.</name>');
    expect(xml).toContain('Indications and Usage');
  });

  it('escapes XML special characters in content', () => {
    const { xml } = generateSpl({ ...goodSpec, sections: [{ code: '34067-9', title: 'A & B <test>', text: 'x < y & "z"' }] });
    expect(xml).toContain('A &amp; B &lt;test&gt;');
    expect(xml).toContain('x &lt; y &amp; &quot;z&quot;');
    expect(xml).not.toContain('<test>');
  });

  it('is deterministic (same spec → same XML, incl. synthesized ids)', () => {
    expect(generateSpl(goodSpec).xml).toBe(generateSpl(goodSpec).xml);
  });
});
