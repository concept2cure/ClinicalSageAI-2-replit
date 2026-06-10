/**
 * UDI/GUDID — GS1 GTIN-14 check digit and GUDID completeness.
 */

import { describe, it, expect } from 'vitest';
import {
  gtin14CheckDigit,
  validateGs1DeviceIdentifier,
  assessGudidCompleteness,
} from '../udi-gudid';

describe('GS1 GTIN-14 check digit', () => {
  it('computes the standard mod-10 check digit', () => {
    // 0001234567890 → check digit 5 (hand-computed: weighted sum 85).
    expect(gtin14CheckDigit('0001234567890')).toBe(5);
  });

  it('rejects malformed input', () => {
    expect(() => gtin14CheckDigit('123')).toThrow();
  });
});

describe('validateGs1DeviceIdentifier', () => {
  it('accepts a GTIN-14 with the correct check digit', () => {
    const r = validateGs1DeviceIdentifier('00012345678905');
    expect(r.valid).toBe(true);
    expect(r.agency).toBe('GS1');
  });

  it('rejects a bad check digit and reports the expected one', () => {
    const r = validateGs1DeviceIdentifier('00012345678900');
    expect(r.valid).toBe(false);
    expect(r.expectedCheckDigit).toBe(5);
  });

  it('rejects a non-14-digit identifier', () => {
    expect(validateGs1DeviceIdentifier('123').valid).toBe(false);
    expect(validateGs1DeviceIdentifier('0001234567890A').valid).toBe(false);
  });
});

describe('assessGudidCompleteness', () => {
  it('flags missing attributes and scores completeness', () => {
    const r = assessGudidCompleteness({ primaryDi: true, brandName: true });
    expect(r.complete).toBe(false);
    expect(r.gaps).toContain('mriSafetyStatus');
    expect(r.completenessScore).toBeCloseTo(2 / 10, 8);
  });

  it('complete when all attributes present', () => {
    const all = {
      primaryDi: true,
      brandName: true,
      versionOrModel: true,
      companyName: true,
      deviceCountInBasePackage: true,
      fdaProductCodeOrGmdn: true,
      sterilization: true,
      mriSafetyStatus: true,
      singleUse: true,
      labeledContainsNrl: true,
    };
    const r = assessGudidCompleteness(all);
    expect(r.complete).toBe(true);
    expect(r.completenessScore).toBeCloseTo(1, 10);
  });
});
