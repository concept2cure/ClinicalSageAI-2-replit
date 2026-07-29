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

  it('flags missing sections with warnings', () => {
    const minimal = '<document><id root="abc-123"/></document>';
    const result = validateSplStructure(minimal);

    // Should have warning for missing component and warnings for each missing section code
    const warnings = result.findings.filter((f) => f.severity === 'warning');
    expect(warnings.length).toBeGreaterThanOrEqual(5);
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
