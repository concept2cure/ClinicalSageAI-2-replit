/**
 * CSR builder — deterministic ICH E3 section registry (getICHE3Structure).
 * The clinical-study-report structure is the regulatorily-critical scaffolding;
 * test it independently of the AI drafting gateway.
 */

import { describe, it, expect } from 'vitest';
import { getICHE3Structure } from '../csr-builder';

describe('getICHE3Structure', () => {
  const structure = getICHE3Structure();

  it('returns a non-empty, well-formed ICH E3 section tree', () => {
    expect(structure.length).toBeGreaterThan(0);
    for (const s of structure) {
      expect(s.number).toBeTruthy();
      expect(s.title).toBeTruthy();
      expect(typeof s.required).toBe('boolean');
      expect(s.status).toBe('empty');
    }
  });

  it('has unique top-level section numbers', () => {
    const nums = structure.map((s) => s.number);
    expect(new Set(nums).size).toBe(nums.length);
  });

  it('covers the ICH E3 backbone (efficacy, safety, study population, references/appendices)', () => {
    const blob = JSON.stringify(structure).toLowerCase();
    expect(blob).toMatch(/efficac/);
    expect(blob).toMatch(/safety|adverse/);
    expect(blob).toMatch(/disposition|population|patients/);
    expect(blob).toMatch(/reference|appendi/);
  });

  it('is deterministic (same structure each call)', () => {
    expect(JSON.stringify(getICHE3Structure())).toBe(JSON.stringify(getICHE3Structure()));
  });
});
