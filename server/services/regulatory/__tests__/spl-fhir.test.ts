/**
 * Interop — LOINC check digit (vs published codes), SPL completeness, FHIR.
 */

import { describe, it, expect } from 'vitest';
import {
  loincCheckDigit,
  validateLoincCode,
  assessSplCompleteness,
  validateFhirResource,
} from '../spl-fhir';

describe('LOINC check digit', () => {
  it('matches published LOINC codes', () => {
    expect(loincCheckDigit('10013')).toBe(1); // 10013-1 Electrocardiogram
    expect(loincCheckDigit('2160')).toBe(0); // 2160-0 Creatinine
    expect(loincCheckDigit('8867')).toBe(4); // 8867-4 Heart rate
  });

  it('validateLoincCode accepts valid and rejects bad check digits', () => {
    expect(validateLoincCode('8867-4').valid).toBe(true);
    const bad = validateLoincCode('8867-9');
    expect(bad.valid).toBe(false);
    expect(bad.expectedCheckDigit).toBe(4);
  });

  it('rejects malformed LOINC codes', () => {
    expect(validateLoincCode('8867').valid).toBe(false);
    expect(validateLoincCode('ABC-1').valid).toBe(false);
  });
});

describe('assessSplCompleteness', () => {
  it('flags missing PLR sections with their LOINC codes', () => {
    const r = assessSplCompleteness({ indicationsAndUsage: true, dosageAndAdministration: true });
    expect(r.complete).toBe(false);
    expect(r.completenessScore).toBeCloseTo(2 / 10, 8);
    expect(r.gaps.find(g => g.section === 'contraindications')?.loincCode).toBe('34070-3');
  });
});

describe('validateFhirResource', () => {
  it('requires resourceType', () => {
    const r = validateFhirResource({} as Record<string, unknown>);
    expect(r.valid).toBe(false);
    expect(r.errors[0]).toMatch(/resourceType/);
  });

  it('checks required fields for known resource types', () => {
    expect(validateFhirResource({ resourceType: 'Observation', status: 'final', code: {} }).valid).toBe(true);
    const missing = validateFhirResource({ resourceType: 'Observation', status: 'final' });
    expect(missing.valid).toBe(false);
    expect(missing.errors[0]).toMatch(/code/);
  });

  it('passes an unknown resource type with only resourceType', () => {
    expect(validateFhirResource({ resourceType: 'Basic' }).valid).toBe(true);
  });
});
