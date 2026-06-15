/**
 * ADaM OCCDS conformance checker — required/expected-variable presence, Char/Num
 * type, occurrence/treatment-emergent flag (Y/N) conformance, analysis-date
 * typing, and the honest-by-construction verdict (ADaM OCCDS IG v1.0).
 */

import { describe, it, expect } from 'vitest';
import {
  checkAdamOccdsConformance,
  OCCDS_REQUIRED,
  OCCDS_EXPECTED,
  type AdamOccdsConformanceInput,
  type AdamVariableInput,
} from '../adam-occds-conformance-checker';

/** Build a fully-conformant OCCDS (ADAE) variable list from the reference spec. */
function validVariables(): AdamVariableInput[] {
  const vars: AdamVariableInput[] = [
    ...OCCDS_REQUIRED.map((v) => ({ name: v.name, dataType: v.dataType })),
    ...OCCDS_EXPECTED.map((v) => ({
      name: v.name,
      dataType: v.dataType,
      controlledTerms: /FL$/.test(v.name) ? ['Y', 'N'] : undefined,
    })),
  ];
  return vars;
}

function input(variables: AdamVariableInput[]): AdamOccdsConformanceInput {
  return { variables };
}

describe('checkAdamOccdsConformance — valid ADAE', () => {
  it('a complete, correctly-typed OCCDS with valid flags is ready', () => {
    const res = checkAdamOccdsConformance(input(validVariables()));
    expect(res.ready).toBe(true);
    expect(res.datasetName).toBe('OCCDS');
    expect(res.counts.errors).toBe(0);
    expect(res.missingRequired).toEqual([]);
    expect(res.missingExpected).toEqual([]);
  });

  it('a minimal valid ADAE (STUDYID, USUBJID, AEDECOD, TRTA, TRTEMFL Y/N) is ready apart from expected warnings', () => {
    const res = checkAdamOccdsConformance(
      input([
        { name: 'STUDYID', dataType: 'Char' },
        { name: 'USUBJID', dataType: 'Char' },
        { name: 'AEDECOD', dataType: 'Char' },
        { name: 'TRTA', dataType: 'Char' },
        { name: 'TRTEMFL', dataType: 'Char', controlledTerms: ['Y', 'N'] },
      ]),
    );
    // No errors -> ready, even though some expected variables are missing (warnings).
    expect(res.ready).toBe(true);
    expect(res.counts.errors).toBe(0);
    expect(res.missingRequired).toEqual([]);
    expect(res.findings.some((f) => f.code === 'FLAG_VIOLATION')).toBe(false);
    expect(res.findings.some((f) => f.code === 'TYPE_MISMATCH')).toBe(false);
  });
});

describe('checkAdamOccdsConformance — MISSING_REQUIRED', () => {
  it('errors and lists AEDECOD when the analyzed term is absent', () => {
    const vars = validVariables().filter((v) => v.name !== 'AEDECOD');
    const res = checkAdamOccdsConformance(input(vars));
    expect(res.ready).toBe(false);
    expect(res.missingRequired).toContain('AEDECOD');
    expect(
      res.findings.some((f) => f.code === 'MISSING_REQUIRED' && f.variable === 'AEDECOD'),
    ).toBe(true);
  });

  it('errors and lists TRTA when actual treatment is absent', () => {
    const vars = validVariables().filter((v) => v.name !== 'TRTA');
    const res = checkAdamOccdsConformance(input(vars));
    expect(res.ready).toBe(false);
    expect(res.missingRequired).toContain('TRTA');
    expect(
      res.findings.some((f) => f.code === 'MISSING_REQUIRED' && f.variable === 'TRTA'),
    ).toBe(true);
  });
});

describe('checkAdamOccdsConformance — MISSING_EXPECTED', () => {
  it('warns (but stays ready) when an expected variable like AESER is absent', () => {
    const vars = validVariables().filter((v) => v.name !== 'AESER');
    const res = checkAdamOccdsConformance(input(vars));
    expect(res.ready).toBe(true);
    expect(res.missingExpected).toContain('AESER');
    const f = res.findings.find((f) => f.code === 'MISSING_EXPECTED' && f.variable === 'AESER');
    expect(f).toBeDefined();
    expect(f?.severity).toBe('warning');
  });
});

describe('checkAdamOccdsConformance — FLAG_VIOLATION', () => {
  it('errors when TRTEMFL carries a controlled term outside Y/N', () => {
    const vars = validVariables().map((v) =>
      v.name === 'TRTEMFL' ? { ...v, controlledTerms: ['Y', 'N', 'U'] } : v,
    );
    const res = checkAdamOccdsConformance(input(vars));
    expect(res.ready).toBe(false);
    const f = res.findings.find((f) => f.code === 'FLAG_VIOLATION' && f.variable === 'TRTEMFL');
    expect(f).toBeDefined();
    expect(f?.severity).toBe('error');
  });

  it('catches a flag not in the expected list (e.g. AOCCFL) with a bad value', () => {
    const vars = [
      ...validVariables(),
      { name: 'AOCCFL', dataType: 'Char' as const, controlledTerms: ['Y', 'X'] },
    ];
    const res = checkAdamOccdsConformance(input(vars));
    expect(res.ready).toBe(false);
    expect(res.findings.some((f) => f.code === 'FLAG_VIOLATION' && f.variable === 'AOCCFL')).toBe(true);
  });

  it('flags an occurrence flag declared Num as TYPE_MISMATCH', () => {
    const vars = [
      ...validVariables(),
      { name: 'AOCCFL', dataType: 'Num' as const },
    ];
    const res = checkAdamOccdsConformance(input(vars));
    expect(res.ready).toBe(false);
    const f = res.findings.find((f) => f.code === 'TYPE_MISMATCH' && f.variable === 'AOCCFL');
    expect(f).toBeDefined();
  });

  it('accepts lower-case Y/N flag values (case-insensitive)', () => {
    const vars = validVariables().map((v) =>
      v.name === 'TRTEMFL' ? { ...v, controlledTerms: ['y', 'n'] } : v,
    );
    const res = checkAdamOccdsConformance(input(vars));
    expect(res.findings.some((f) => f.code === 'FLAG_VIOLATION')).toBe(false);
    expect(res.ready).toBe(true);
  });
});

describe('checkAdamOccdsConformance — TYPE_MISMATCH', () => {
  it('errors when ASTDT is supplied as Char (must be Num)', () => {
    const vars = validVariables().map((v) =>
      v.name === 'ASTDT' ? { ...v, dataType: 'Char' as const } : v,
    );
    const res = checkAdamOccdsConformance(input(vars));
    expect(res.ready).toBe(false);
    const f = res.findings.find((f) => f.code === 'TYPE_MISMATCH' && f.variable === 'ASTDT');
    expect(f).toBeDefined();
    expect(f?.message).toContain('Num');
  });

  it('errors when AEDECOD is supplied as Num (must be Char)', () => {
    const vars = validVariables().map((v) =>
      v.name === 'AEDECOD' ? { ...v, dataType: 'Num' as const } : v,
    );
    const res = checkAdamOccdsConformance(input(vars));
    expect(res.ready).toBe(false);
    const f = res.findings.find((f) => f.code === 'TYPE_MISMATCH' && f.variable === 'AEDECOD');
    expect(f).toBeDefined();
    expect(f?.message).toContain('Char');
  });
});

describe('checkAdamOccdsConformance — determinism', () => {
  it('sorts findings by variable name then severity', () => {
    const vars = validVariables()
      .filter((v) => v.name !== 'AESER' && v.name !== 'AEREL')
      .map((v) => (v.name === 'ASTDT' ? { ...v, dataType: 'Char' as const } : v));
    const res = checkAdamOccdsConformance(input(vars));
    const names = res.findings.map((f) => f.variable);
    const sorted = [...names].sort((a, b) => a.localeCompare(b));
    expect(names).toEqual(sorted);
  });

  it('produces identical output across repeated runs', () => {
    const vars = [
      ...validVariables().filter((v) => v.name !== 'AESEV'),
      { name: 'AOCCFL', dataType: 'Char' as const, controlledTerms: ['Y', 'Q'] },
    ];
    const a = checkAdamOccdsConformance(input(vars));
    const b = checkAdamOccdsConformance(input(vars));
    expect(a).toEqual(b);
  });
});
