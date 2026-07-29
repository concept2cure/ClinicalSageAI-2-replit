/**
 * ADaM BDS conformance checker — required-variable presence, the AVAL/AVALC
 * analysis-value rule, expected-variable presence, Char/Num typing, indicator
 * flag (Y/N) conformance, and the honest-by-construction verdict (ADaM IG v1.1).
 */

import { describe, it, expect } from 'vitest';
import {
  checkAdamBdsConformance,
  BDS_REQUIRED,
  BDS_EXPECTED,
  type AdamBdsConformanceInput,
  type AdamVariableInput,
} from '../adam-bds-conformance-checker';

/**
 * Build a fully-conformant BDS variable list: the required structural variables,
 * an AVAL analysis value, all expected variables (flags carrying valid Y/N
 * controlled terms), plus a timing variable (ADT).
 */
function validVariables(): AdamVariableInput[] {
  return [
    ...BDS_REQUIRED.map((v) => ({ name: v.name, dataType: v.dataType })),
    { name: 'AVAL', dataType: 'Num' as const },
    ...BDS_EXPECTED.map((v) => ({
      name: v.name,
      dataType: v.dataType,
      controlledTerms: /FL$/.test(v.name) ? ['Y', 'N'] : undefined,
    })),
    { name: 'ADT', dataType: 'Num' as const },
  ];
}

function input(variables: AdamVariableInput[]): AdamBdsConformanceInput {
  return { variables };
}

describe('checkAdamBdsConformance — valid BDS', () => {
  it('a complete, correctly-typed BDS with AVAL Num and Y/N flags is ready', () => {
    const res = checkAdamBdsConformance(input(validVariables()));
    expect(res.ready).toBe(true);
    expect(res.datasetName).toBe('BDS');
    expect(res.counts.errors).toBe(0);
    expect(res.missingRequired).toEqual([]);
    expect(res.missingExpected).toEqual([]);
  });

  it('a minimal valid BDS (STUDYID, USUBJID, PARAMCD, PARAM, AVAL Num, ABLFL Y/N) is ready apart from expected warnings', () => {
    const res = checkAdamBdsConformance(
      input([
        { name: 'STUDYID', dataType: 'Char' },
        { name: 'USUBJID', dataType: 'Char' },
        { name: 'PARAMCD', dataType: 'Char' },
        { name: 'PARAM', dataType: 'Char' },
        { name: 'AVAL', dataType: 'Num' },
        { name: 'ABLFL', dataType: 'Char', controlledTerms: ['Y', 'N'] },
      ]),
    );
    expect(res.ready).toBe(true);
    expect(res.counts.errors).toBe(0);
    expect(res.findings.some((f) => f.code === 'FLAG_VIOLATION')).toBe(false);
    expect(res.findings.some((f) => f.code === 'TYPE_MISMATCH')).toBe(false);
    expect(res.findings.some((f) => f.code === 'MISSING_ANALYSIS_VALUE')).toBe(false);
  });

  it('accepts AVALC (Char) alone as the analysis value', () => {
    const vars = validVariables()
      .filter((v) => v.name !== 'AVAL')
      .concat([{ name: 'AVALC', dataType: 'Char' as const }]);
    const res = checkAdamBdsConformance(input(vars));
    expect(res.ready).toBe(true);
    expect(res.findings.some((f) => f.code === 'MISSING_ANALYSIS_VALUE')).toBe(false);
  });
});

describe('checkAdamBdsConformance — MISSING_REQUIRED', () => {
  it('errors and lists PARAMCD when it is absent', () => {
    const vars = validVariables().filter((v) => v.name !== 'PARAMCD');
    const res = checkAdamBdsConformance(input(vars));
    expect(res.ready).toBe(false);
    expect(res.missingRequired).toContain('PARAMCD');
    expect(
      res.findings.some((f) => f.code === 'MISSING_REQUIRED' && f.variable === 'PARAMCD'),
    ).toBe(true);
  });
});

describe('checkAdamBdsConformance — MISSING_ANALYSIS_VALUE', () => {
  it('errors when neither AVAL nor AVALC is present', () => {
    const vars = validVariables().filter((v) => v.name !== 'AVAL' && v.name !== 'AVALC');
    const res = checkAdamBdsConformance(input(vars));
    expect(res.ready).toBe(false);
    const f = res.findings.find((f) => f.code === 'MISSING_ANALYSIS_VALUE');
    expect(f).toBeDefined();
    expect(f?.severity).toBe('error');
  });
});

describe('checkAdamBdsConformance — TYPE_MISMATCH', () => {
  it('errors when AVAL is supplied as Char (must be Num)', () => {
    const vars = validVariables().map((v) =>
      v.name === 'AVAL' ? { ...v, dataType: 'Char' as const } : v,
    );
    const res = checkAdamBdsConformance(input(vars));
    expect(res.ready).toBe(false);
    const f = res.findings.find((f) => f.code === 'TYPE_MISMATCH' && f.variable === 'AVAL');
    expect(f).toBeDefined();
    expect(f?.message).toContain('Num');
  });

  it('errors when AVALC is supplied as Num (must be Char)', () => {
    const vars = validVariables()
      .filter((v) => v.name !== 'AVAL')
      .concat([{ name: 'AVALC', dataType: 'Num' as const }]);
    const res = checkAdamBdsConformance(input(vars));
    expect(res.ready).toBe(false);
    const f = res.findings.find((f) => f.code === 'TYPE_MISMATCH' && f.variable === 'AVALC');
    expect(f).toBeDefined();
    expect(f?.message).toContain('Char');
  });

  it('errors when PARAMCD is supplied as Num (must be Char)', () => {
    const vars = validVariables().map((v) =>
      v.name === 'PARAMCD' ? { ...v, dataType: 'Num' as const } : v,
    );
    const res = checkAdamBdsConformance(input(vars));
    expect(res.ready).toBe(false);
    const f = res.findings.find((f) => f.code === 'TYPE_MISMATCH' && f.variable === 'PARAMCD');
    expect(f).toBeDefined();
    expect(f?.message).toContain('Char');
  });

  it('errors when ADY is supplied as Char (must be Num)', () => {
    const vars = validVariables()
      .filter((v) => v.name !== 'ADT')
      .concat([{ name: 'ADY', dataType: 'Char' as const }]);
    const res = checkAdamBdsConformance(input(vars));
    expect(res.ready).toBe(false);
    const f = res.findings.find((f) => f.code === 'TYPE_MISMATCH' && f.variable === 'ADY');
    expect(f).toBeDefined();
    expect(f?.message).toContain('Num');
  });
});

describe('checkAdamBdsConformance — MISSING_EXPECTED', () => {
  it('warns (but stays ready) when an expected variable like ABLFL is absent', () => {
    const vars = validVariables().filter((v) => v.name !== 'ABLFL');
    const res = checkAdamBdsConformance(input(vars));
    expect(res.ready).toBe(true);
    expect(res.missingExpected).toContain('ABLFL');
    const f = res.findings.find((f) => f.code === 'MISSING_EXPECTED' && f.variable === 'ABLFL');
    expect(f).toBeDefined();
    expect(f?.severity).toBe('warning');
  });

  it('warns (but stays ready) when no timing variable (ADT/ADY) is present', () => {
    const vars = validVariables().filter((v) => v.name !== 'ADT');
    const res = checkAdamBdsConformance(input(vars));
    expect(res.ready).toBe(true);
    expect(res.missingExpected).toContain('ADT');
    const f = res.findings.find((f) => f.code === 'MISSING_EXPECTED' && f.variable === 'ADT');
    expect(f?.severity).toBe('warning');
  });
});

describe('checkAdamBdsConformance — FLAG_VIOLATION', () => {
  it('errors when ABLFL carries a controlled term outside Y/N', () => {
    const vars = validVariables().map((v) =>
      v.name === 'ABLFL' ? { ...v, controlledTerms: ['Y', 'N', 'U'] } : v,
    );
    const res = checkAdamBdsConformance(input(vars));
    expect(res.ready).toBe(false);
    const f = res.findings.find((f) => f.code === 'FLAG_VIOLATION' && f.variable === 'ABLFL');
    expect(f).toBeDefined();
    expect(f?.severity).toBe('error');
  });

  it('catches a flag not in the expected list (e.g. CRIT1FL) with a bad value', () => {
    const vars = [
      ...validVariables(),
      { name: 'CRIT1FL', dataType: 'Char' as const, controlledTerms: ['Y', 'X'] },
    ];
    const res = checkAdamBdsConformance(input(vars));
    expect(res.ready).toBe(false);
    expect(
      res.findings.some((f) => f.code === 'FLAG_VIOLATION' && f.variable === 'CRIT1FL'),
    ).toBe(true);
  });

  it('accepts a flag carrying only {Y}', () => {
    const vars = validVariables().map((v) =>
      v.name === 'ANL01FL' ? { ...v, controlledTerms: ['Y'] } : v,
    );
    const res = checkAdamBdsConformance(input(vars));
    expect(res.ready).toBe(true);
    expect(res.findings.some((f) => f.code === 'FLAG_VIOLATION')).toBe(false);
  });

  it('flags an indicator flag declared Num as TYPE_MISMATCH', () => {
    const vars = [...validVariables(), { name: 'CRIT1FL', dataType: 'Num' as const }];
    const res = checkAdamBdsConformance(input(vars));
    expect(res.ready).toBe(false);
    const f = res.findings.find((f) => f.code === 'TYPE_MISMATCH' && f.variable === 'CRIT1FL');
    expect(f).toBeDefined();
  });
});

describe('checkAdamBdsConformance — determinism', () => {
  it('sorts findings by variable name then severity', () => {
    const vars = validVariables()
      .filter((v) => v.name !== 'AVISIT' && v.name !== 'PARAMN')
      .map((v) => (v.name === 'AVAL' ? { ...v, dataType: 'Char' as const } : v));
    const res = checkAdamBdsConformance(input(vars));
    const names = res.findings.map((f) => f.variable);
    const sorted = [...names].sort((a, b) => a.localeCompare(b));
    expect(names).toEqual(sorted);
  });

  it('produces identical output across repeated runs', () => {
    const vars = validVariables().map((v) =>
      v.name === 'ABLFL' ? { ...v, controlledTerms: ['Y', 'N', 'U'] } : v,
    );
    const a = checkAdamBdsConformance(input(vars));
    const b = checkAdamBdsConformance(input(vars));
    expect(a).toEqual(b);
  });
});
