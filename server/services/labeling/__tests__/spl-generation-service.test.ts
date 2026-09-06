import { describe, it, expect } from 'vitest';
import { generateSplXml, validateSplStructure } from '../spl-generation-service';

const VALID_INPUT = {
  productName: 'TestDrug XR',
  ndc: '12345-678-90',
  activeIngredients: [
    { name: 'Testazolam', strength: '10 mg' },
    { name: 'Mockitol', strength: '25 mg' },
  ],
  indications: 'Treatment of mock condition in adults.',
  contraindications: 'Hypersensitivity to testazolam or mockitol.',
  warnings: 'May cause drowsiness. Use caution when operating machinery.',
  dosage: 'One tablet orally twice daily with food.',
  route: 'oral',
  manufacturer: 'Acme Pharma Inc.',
};

describe('generateSplXml', () => {
  it('produces XML with proper SPL structure', () => {
    const result = generateSplXml(VALID_INPUT);

    expect(result.status).toBe('generated');
    expect(result.sectionCount).toBe(5);
    expect(result.xml).toContain('<?xml version="1.0"');
    expect(result.xml).toContain('<document');
    expect(result.xml).toContain('<id root=');
    expect(result.xml).toContain('<setId root=');
    expect(result.xml).toContain('<versionNumber value="1"');
    expect(result.xml).toContain('Acme Pharma Inc.');
    expect(result.xml).toContain('TestDrug XR');
  });

  it('includes all 5 required section codes', () => {
    const result = generateSplXml(VALID_INPUT);
    const xml = result.xml;

    // LOINC section codes per NLM SPL standard
    expect(xml).toContain('code="34089-3"'); // DESCRIPTION
    expect(xml).toContain('code="34067-9"'); // INDICATIONS
    expect(xml).toContain('code="34070-3"'); // CONTRAINDICATIONS
    expect(xml).toContain('code="34071-1"'); // WARNINGS
    expect(xml).toContain('code="34068-7"'); // DOSAGE
  });

  it('returns correct sectionCount', () => {
    const result = generateSplXml(VALID_INPUT);
    expect(result.sectionCount).toBe(5);
  });

  it('includes active ingredient info in description section', () => {
    const result = generateSplXml(VALID_INPUT);
    expect(result.xml).toContain('Testazolam 10 mg');
    expect(result.xml).toContain('Mockitol 25 mg');
  });

  it('includes route when provided', () => {
    const result = generateSplXml(VALID_INPUT);
    expect(result.xml).toContain('oral');
  });

  it('is deterministic — same input yields same output', () => {
    const result1 = generateSplXml(VALID_INPUT);
    const result2 = generateSplXml(VALID_INPUT);
    expect(result1.xml).toBe(result2.xml);
  });

  it('rejects missing productName', () => {
    expect(() => generateSplXml({ ...VALID_INPUT, productName: '' })).toThrow(
      'productName is required'
    );
  });

  it('rejects missing manufacturer', () => {
    expect(() => generateSplXml({ ...VALID_INPUT, manufacturer: '' })).toThrow(
      'manufacturer is required'
    );
  });

  it('rejects empty activeIngredients', () => {
    expect(() => generateSplXml({ ...VALID_INPUT, activeIngredients: [] })).toThrow(
      'at least one'
    );
  });
});

describe('validateSplStructure', () => {
  it('valid XML passes validation', () => {
    const { xml } = generateSplXml(VALID_INPUT);
    const result = validateSplStructure(xml);

    expect(result.valid).toBe(true);
    expect(result.findings.filter((f) => f.severity === 'error')).toHaveLength(0);
  });

  it('flags missing root element', () => {
    const result = validateSplStructure('<root><id root="abc"/></root>');

    expect(result.valid).toBe(false);
    expect(result.findings).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ rule: 'root-element', severity: 'error' }),
      ])
    );
  });

  /* These were warnings, so a document with no Indications, no Warnings and no
     Dosage came back `valid: true` — and the surface says "It passes the
     structural check". The function's own message calls them required. */
  it('a document missing the required sections does not pass', () => {
    const minimal = '<document><id root="abc-123"/></document>';
    const result = validateSplStructure(minimal);

    expect(result.valid).toBe(false);
    const missing = result.findings.filter(
      (f) => f.rule.startsWith('section-') && f.severity === 'error',
    );
    expect(missing.length).toBe(5);
  });

  /* SPL nests sections document/component/structuredBody/component/section.
     The `<component>` probe matches the SECTION wrappers, so a flat document
     satisfied it and nothing else looked. */
  it('sections outside component/structuredBody do not pass', () => {
    const flat =
      '<document><id root="abc"/>' +
      ['34089-3', '34067-9', '34070-3', '34071-1', '34068-7']
        .map((c) => `<component><section><code code="${c}"/></section></component>`)
        .join('') +
      '</document>';
    const result = validateSplStructure(flat);

    expect(result.valid).toBe(false);
    expect(result.findings).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ rule: 'structured-body', severity: 'error' }),
      ]),
    );
  });

  it('flags missing id element', () => {
    const noId = '<document><component><section></section></component></document>';
    const result = validateSplStructure(noId);

    expect(result.findings).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ rule: 'document-id', severity: 'error' }),
      ])
    );
  });

  it('flags missing component sections', () => {
    const noComponent = '<document><id root="abc"/></document>';
    const result = validateSplStructure(noComponent);

    expect(result.findings).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ rule: 'component-present', severity: 'error' }),
      ])
    );
  });

  it('rejects non-string input', () => {
    expect(() => validateSplStructure(null as any)).toThrow('xml is required');
    expect(() => validateSplStructure('' as any)).toThrow('xml is required');
  });
});

/**
 * What the convenience layer used to emit, and what a customer got.
 *
 * The LabelingPi surface collects an NDC, POSTs it to /api/labeling-pi/spl, and
 * downloads the result as the submission format. The NDC appeared nowhere in
 * that file; the sections sat directly under <document> rather than inside
 * component/structuredBody, so the XML would not load into FDA's tooling; and
 * ids came from a 32-bit string hash, which is not a space to put a setId in.
 */
describe('generateSplXml — the document is an SPL document', () => {
  it('nests sections in component/structuredBody, as SPL does', () => {
    const { xml } = generateSplXml(VALID_INPUT);
    expect(xml).toContain('<structuredBody>');
    // …and the validator agrees, which is what the surface renders.
    expect(validateSplStructure(xml).valid).toBe(true);
  });

  it('carries the NDC the caller supplied, on FDA’s NDC code system', () => {
    const { xml } = generateSplXml(VALID_INPUT);
    expect(xml).toContain('code="12345-678-90"');
    expect(xml).toContain('codeSystem="2.16.840.1.113883.6.69"');
  });

  it('carries the product and its ingredients as subject/manufacturedProduct', () => {
    const { xml } = generateSplXml(VALID_INPUT);
    const subject = xml.slice(xml.indexOf('<subject>'), xml.indexOf('</subject>'));
    expect(subject).toContain('<manufacturedProduct>');
    expect(subject).toContain('Testazolam');
    expect(subject).toContain('Mockitol');
    expect(subject).toContain('10 mg');
  });

  it('gives two different products different set ids', () => {
    const a = generateSplXml(VALID_INPUT);
    const b = generateSplXml({ ...VALID_INPUT, productName: 'OtherDrug ER' });
    const setId = (xml: string) => /<setId root="([^"]+)"/.exec(xml)?.[1];
    expect(setId(a.xml)).toBeTruthy();
    expect(setId(a.xml)).not.toBe(setId(b.xml));
    // A real 128-bit id, not a 32-bit hash smeared into UUID shape.
    expect(setId(a.xml)).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/);
  });

  /* setId is the identity FDA uses to say "this is a new version of that
     label". It must NOT move between versions; the document id must. */
  it('a new version keeps the set id and takes a new document id', () => {
    const v1 = generateSplXml({ ...VALID_INPUT, version: 1 }).xml;
    const v2 = generateSplXml({ ...VALID_INPUT, version: 2 }).xml;
    const setId = (xml: string) => /<setId root="([^"]+)"/.exec(xml)?.[1];
    const docId = (xml: string) => /<id root="([^"]+)"/.exec(xml)?.[1];

    expect(setId(v2)).toBe(setId(v1));
    expect(docId(v2)).not.toBe(docId(v1));
    expect(v2).toContain('<versionNumber value="2"');
  });
});
