/**
 * CDISC Controlled Terminology validator — catalog coverage, case-sensitive
 * exact matching against NCI EVS submission values, unknown-codelist handling,
 * empty-input behaviour, the honest-by-construction verdict, and determinism.
 */

import { describe, it, expect } from 'vitest';
import {
  validateControlledTerms,
  listCodelists,
  getCodelist,
  CT_CODELISTS,
} from '../controlled-terminology-validator';

describe('validateControlledTerms — valid inputs', () => {
  it('SEX [M, F] is valid', () => {
    const res = validateControlledTerms({ codelist: 'SEX', values: ['M', 'F'] });
    expect(res.recognized).toBe(true);
    expect(res.valid).toBe(true);
    expect(res.invalidValues).toEqual([]);
    expect(res.findings).toEqual([]);
    expect(res.allowedValues).toEqual(['M', 'F', 'U', 'UNDIFFERENTIATED']);
  });

  it('NY [Y, N] is valid', () => {
    const res = validateControlledTerms({ codelist: 'NY', values: ['Y', 'N'] });
    expect(res.valid).toBe(true);
    expect(res.invalidValues).toEqual([]);
  });

  it('empty values are valid (nothing to reject)', () => {
    const res = validateControlledTerms({ codelist: 'SEX', values: [] });
    expect(res.recognized).toBe(true);
    expect(res.valid).toBe(true);
    expect(res.invalidValues).toEqual([]);
    expect(res.findings).toEqual([]);
  });

  it('trims surrounding whitespace before matching', () => {
    const res = validateControlledTerms({ codelist: 'SEX', values: ['  M  ', 'F'] });
    expect(res.valid).toBe(true);
    expect(res.invalidValues).toEqual([]);
  });

  it('accepts values containing slashes/parentheses verbatim', () => {
    const res = validateControlledTerms({
      codelist: 'OUT',
      values: ['RECOVERED/RESOLVED', 'FATAL'],
    });
    expect(res.valid).toBe(true);
    const route = validateControlledTerms({
      codelist: 'ROUTE',
      values: ['RESPIRATORY (INHALATION)'],
    });
    expect(route.valid).toBe(true);
  });
});

describe('validateControlledTerms — invalid values', () => {
  it('SEX [M, X] flags X with INVALID_VALUE and is not valid', () => {
    const res = validateControlledTerms({ codelist: 'SEX', values: ['M', 'X'] });
    expect(res.recognized).toBe(true);
    expect(res.valid).toBe(false);
    expect(res.invalidValues).toEqual(['X']);
    expect(res.findings).toHaveLength(1);
    expect(res.findings[0].code).toBe('INVALID_VALUE');
    expect(res.findings[0].severity).toBe('error');
    expect(res.findings[0].message).toContain('X');
  });

  it('is case-sensitive: AESEV [mild] is invalid (lowercase not allowed)', () => {
    const res = validateControlledTerms({ codelist: 'AESEV', values: ['mild'] });
    expect(res.valid).toBe(false);
    expect(res.invalidValues).toEqual(['mild']);
    expect(res.findings[0].code).toBe('INVALID_VALUE');
  });

  it('sorts and de-duplicates invalidValues deterministically', () => {
    const res = validateControlledTerms({
      codelist: 'SEX',
      values: ['Z', 'A', 'M', 'A'],
    });
    expect(res.valid).toBe(false);
    expect(res.invalidValues).toEqual(['A', 'Z']);
  });
});

describe('validateControlledTerms — unknown codelist', () => {
  it("ZZZ yields UNKNOWN_CODELIST, recognized false, valid false", () => {
    const res = validateControlledTerms({ codelist: 'ZZZ', values: ['M'] });
    expect(res.recognized).toBe(false);
    expect(res.valid).toBe(false);
    expect(res.allowedValues).toEqual([]);
    expect(res.invalidValues).toEqual([]);
    expect(res.findings).toHaveLength(1);
    expect(res.findings[0].code).toBe('UNKNOWN_CODELIST');
    expect(res.findings[0].severity).toBe('error');
  });
});

describe('catalog accessors', () => {
  it('listCodelists returns all codes sorted', () => {
    const codes = listCodelists();
    expect(codes).toEqual([...codes].sort());
    expect(codes).toEqual(
      ['ACN', 'AESEV', 'AGEU', 'FREQ', 'ND', 'NY', 'NYUNK', 'OUT', 'ROUTE', 'SEX'],
    );
  });

  it('getCodelist returns the codelist for a known code and undefined otherwise', () => {
    expect(getCodelist('SEX')?.codedValues).toEqual(['M', 'F', 'U', 'UNDIFFERENTIATED']);
    expect(getCodelist('NOPE')).toBeUndefined();
  });

  it('every catalog codelist validates its own submission values', () => {
    for (const [code, list] of Object.entries(CT_CODELISTS)) {
      const res = validateControlledTerms({ codelist: code, values: list.codedValues });
      expect(res.valid).toBe(true);
      expect(res.invalidValues).toEqual([]);
    }
  });
});

describe('determinism', () => {
  it('returns identical results across repeated calls', () => {
    const call = () =>
      validateControlledTerms({ codelist: 'AGEU', values: ['DAYS', 'parsecs', 'YEARS', 'furlongs'] });
    const a = call();
    const b = call();
    expect(a).toEqual(b);
    expect(a.invalidValues).toEqual(['furlongs', 'parsecs']);
    expect(a.valid).toBe(false);
  });
});
