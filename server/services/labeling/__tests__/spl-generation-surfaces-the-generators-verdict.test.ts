/**
 * The SPL convenience layer surfaces the canonical generator's own verdict.
 *
 * generateSplXml called generateSpl and kept only its XML: generateSpl's
 * `structurallyValid: false` — its verdict on a spec with structural errors,
 * such as an NDC that is not an NDC — was discarded. The route then ran
 * validateSplStructure over the XML, which checks the document's shape and not
 * the NDC, so a malformed NDC came back as "It passes the structural check".
 */
import { describe, expect, it } from 'vitest';
import { generateSplXml } from '../spl-generation-service';

const INPUT = {
  productName: 'TestDrug XR',
  version: 1,
  effectiveDate: '2026-10-15',
  activeIngredients: [{ name: 'Testazolam', strength: '10 mg' }],
  indications: 'Treatment of mock condition in adults.',
  contraindications: 'Hypersensitivity to testazolam.',
  warnings: 'May cause drowsiness.',
  dosage: 'One tablet orally twice daily.',
  manufacturer: 'Acme Pharma Inc.',
};

describe("generateSplXml surfaces generateSpl's verdict on the spec", () => {
  it('a malformed NDC is reported as a structural error, not a clean document', () => {
    const r = generateSplXml({ ...INPUT, ndc: '12-34-NDC' });
    expect(r.structurallyValid, 'a spec the generator rejects came back as valid').toBe(false);
    expect(r.specErrors).toEqual([
      expect.objectContaining({ severity: 'error', message: expect.stringMatching(/^ndcCode must be an NDC/) }),
    ]);
  });

  it('control: a well-formed NDC is a structurally valid spec with no errors', () => {
    const r = generateSplXml({ ...INPUT, ndc: '0002-1433-80' });
    expect(r.structurallyValid).toBe(true);
    expect(r.specErrors).toEqual([]);
  });
});
