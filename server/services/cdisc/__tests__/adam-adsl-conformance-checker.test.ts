/**
 * ADaM ADSL conformance checker — required/expected-variable presence, Char/Num
 * type, population-flag (Y/N) conformance, numeric treatment-variable typing,
 * and the honest-by-construction verdict (ADaM IG v1.1).
 */

import { describe, it, expect } from 'vitest';
import {
  checkAdamAdslConformance,
  ADSL_REQUIRED,
  ADSL_EXPECTED,
  type AdamAdslConformanceInput,
  type AdamVariableInput,
} from '../adam-adsl-conformance-checker';

/** Build a fully-conformant ADSL variable list from the reference spec. */
function validVariables(): AdamVariableInput[] {
  const vars: AdamVariableInput[] = [
    ...ADSL_REQUIRED.map((v) => ({ name: v.name, dataType: v.dataType })),
    ...ADSL_EXPECTED.map((v) => ({
      name: v.name,
      dataType: v.dataType,
      controlledTerms: /FL$/.test(v.name) ? ['Y', 'N'] : undefined,
    })),
  ];
  return vars;
}

function input(variables: AdamVariableInput[]): AdamAdslConformanceInput {
  return { variables };
}

describe('checkAdamAdslConformance — valid ADSL', () => {
  it('a complete, correctly-typed ADSL with valid flags and Num AGE is ready', () => {
    const res = checkAdamAdslConformance(input(validVariables()));
    expect(res.ready).toBe(true);
    expect(res.datasetName).toBe('ADSL');
    expect(res.counts.errors).toBe(0);
    expect(res.missingRequired).toEqual([]);
    expect(res.missingExpected).toEqual([]);
  });

  it('a minimal valid ADSL (STUDYID, USUBJID, SAFFL Y/N, AGE Num) is ready apart from expected warnings', () => {
    const res = checkAdamAdslConformance(
      input([
        { name: 'STUDYID', dataType: 'Char' },
        { name: 'USUBJID', dataType: 'Char' },
        { name: 'SAFFL', dataType: 'Char', controlledTerms: ['Y', 'N'] },
        { name: 'AGE', dataType: 'Num' },
      ]),
    );
    // No errors -> ready, even though some expected variables are missing (warnings).
    expect(res.ready).toBe(true);
    expect(res.counts.errors).toBe(0);
    expect(res.findings.some((f) => f.code === 'FLAG_VIOLATION')).toBe(false);
    expect(res.findings.some((f) => f.code === 'TYPE_MISMATCH')).toBe(false);
  });
});

describe('checkAdamAdslConformance — MISSING_REQUIRED', () => {
  it('errors and lists USUBJID when it is absent', () => {
    const vars = validVariables().filter((v) => v.name !== 'USUBJID');
    const res = checkAdamAdslConformance(input(vars));
    expect(res.ready).toBe(false);
    expect(res.missingRequired).toContain('USUBJID');
    expect(
      res.findings.some((f) => f.code === 'MISSING_REQUIRED' && f.variable === 'USUBJID'),
    ).toBe(true);
  });
});

describe('checkAdamAdslConformance — MISSING_EXPECTED', () => {
  it('warns (but stays ready) when an expected variable like SEX is absent', () => {
    const vars = validVariables().filter((v) => v.name !== 'SEX');
    const res = checkAdamAdslConformance(input(vars));
    expect(res.ready).toBe(true);
    expect(res.missingExpected).toContain('SEX');
    const f = res.findings.find((f) => f.code === 'MISSING_EXPECTED' && f.variable === 'SEX');
    expect(f).toBeDefined();
    expect(f?.severity).toBe('warning');
  });
});

describe('checkAdamAdslConformance — FLAG_VIOLATION', () => {
  it('errors when SAFFL carries a controlled term outside Y/N', () => {
    const vars = validVariables().map((v) =>
      v.name === 'SAFFL' ? { ...v, controlledTerms: ['Y', 'N', 'U'] } : v,
    );
    const res = checkAdamAdslConformance(input(vars));
    expect(res.ready).toBe(false);
    const f = res.findings.find((f) => f.code === 'FLAG_VIOLATION' && f.variable === 'SAFFL');
    expect(f).toBeDefined();
    expect(f?.severity).toBe('error');
  });

  it('catches a flag not in the expected list (e.g. RANDFL) with a bad value', () => {
    const vars = [
      ...validVariables(),
      { name: 'RANDFL', dataType: 'Char' as const, controlledTerms: ['Y', 'X'] },
    ];
    const res = checkAdamAdslConformance(input(vars));
    expect(res.ready).toBe(false);
    expect(res.findings.some((f) => f.code === 'FLAG_VIOLATION' && f.variable === 'RANDFL')).toBe(true);
  });

  it('flags a population flag declared Num as TYPE_MISMATCH', () => {
    const vars = [
      ...validVariables(),
      { name: 'RANDFL', dataType: 'Num' as const },
    ];
    const res = checkAdamAdslConformance(input(vars));
    expect(res.ready).toBe(false);
    const f = res.findings.find((f) => f.code === 'TYPE_MISMATCH' && f.variable === 'RANDFL');
    expect(f).toBeDefined();
  });
});

describe('checkAdamAdslConformance — TYPE_MISMATCH', () => {
  it('errors when AGE is supplied as Char (must be Num)', () => {
    const vars = validVariables().map((v) =>
      v.name === 'AGE' ? { ...v, dataType: 'Char' as const } : v,
    );
    const res = checkAdamAdslConformance(input(vars));
    expect(res.ready).toBe(false);
    const f = res.findings.find((f) => f.code === 'TYPE_MISMATCH' && f.variable === 'AGE');
    expect(f).toBeDefined();
    expect(f?.message).toContain('Num');
  });

  it('errors when a numeric treatment variable TRT01PN is supplied as Char', () => {
    const vars = [
      ...validVariables(),
      { name: 'TRT01PN', dataType: 'Char' as const },
    ];
    const res = checkAdamAdslConformance(input(vars));
    expect(res.ready).toBe(false);
    const f = res.findings.find((f) => f.code === 'TYPE_MISMATCH' && f.variable === 'TRT01PN');
    expect(f).toBeDefined();
    expect(f?.message).toContain('Num');
  });
});

describe('checkAdamAdslConformance — determinism', () => {
  it('sorts findings by variable name then severity', () => {
    const vars = validVariables()
      .filter((v) => v.name !== 'SEX' && v.name !== 'RACE')
      .map((v) => (v.name === 'AGE' ? { ...v, dataType: 'Char' as const } : v));
    const res = checkAdamAdslConformance(input(vars));
    const names = res.findings.map((f) => f.variable);
    const sorted = [...names].sort((a, b) => a.localeCompare(b));
    expect(names).toEqual(sorted);
  });
});
