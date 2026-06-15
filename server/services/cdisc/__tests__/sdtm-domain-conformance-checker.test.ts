/**
 * SDTM domain conformance checker — required-variable presence, Char/Num type,
 * CDISC CT codelist conformance, unknown-domain handling, extra-variable
 * warnings, and the honest-by-construction verdict (SDTM-IG v3.4).
 */

import { describe, it, expect } from 'vitest';
import {
  checkSdtmDomainConformance,
  SDTM_DOMAIN_SPECS,
  type SdtmConformanceInput,
  type SdtmVariableInput,
} from '../sdtm-domain-conformance-checker';

/** Build a fully-conformant variable list for a domain from its reference spec. */
function variablesFor(domain: 'DM' | 'AE'): SdtmVariableInput[] {
  return SDTM_DOMAIN_SPECS[domain].variables.map((v) => ({
    name: v.name,
    dataType: v.dataType,
    controlledTerms: v.allowedValues ? [v.allowedValues[0]] : undefined,
  }));
}

function input(domain: string, variables: SdtmVariableInput[]): SdtmConformanceInput {
  return { domain, variables };
}

describe('checkSdtmDomainConformance — valid datasets', () => {
  it('a complete, correctly-typed DM with valid codelist values is ready', () => {
    const res = checkSdtmDomainConformance(input('DM', variablesFor('DM')));
    expect(res.ready).toBe(true);
    expect(res.recognized).toBe(true);
    expect(res.counts.errors).toBe(0);
    expect(res.missingRequired).toEqual([]);
  });

  it('a complete, correctly-typed AE is ready', () => {
    const res = checkSdtmDomainConformance(input('AE', variablesFor('AE')));
    expect(res.ready).toBe(true);
    expect(res.counts.errors).toBe(0);
  });

  it('normalizes a lowercase domain code', () => {
    const res = checkSdtmDomainConformance(input('dm', variablesFor('DM')));
    expect(res.domain).toBe('DM');
    expect(res.recognized).toBe(true);
  });
});

describe('checkSdtmDomainConformance — MISSING_REQUIRED', () => {
  it('errors and lists a missing required variable', () => {
    // RFSTDTC is Exp (not Req); drop a Req variable to exercise the rule.
    const vars = variablesFor('DM').filter((v) => v.name !== 'COUNTRY');
    const res = checkSdtmDomainConformance(input('DM', vars));
    expect(res.ready).toBe(false);
    expect(res.missingRequired).toContain('COUNTRY');
    expect(res.findings.some((f) => f.code === 'MISSING_REQUIRED' && f.variable === 'COUNTRY')).toBe(true);
  });

  it('flags a dropped RFSTDTC scenario via a required variable removal (USUBJID)', () => {
    const vars = variablesFor('DM').filter((v) => v.name !== 'USUBJID');
    const res = checkSdtmDomainConformance(input('DM', vars));
    expect(res.ready).toBe(false);
    expect(res.findings.some((f) => f.code === 'MISSING_REQUIRED' && f.variable === 'USUBJID')).toBe(true);
  });
});

describe('checkSdtmDomainConformance — TYPE_MISMATCH', () => {
  it('errors when USUBJID is supplied as Num', () => {
    const vars = variablesFor('DM').map((v) => (v.name === 'USUBJID' ? { ...v, dataType: 'Num' as const } : v));
    const res = checkSdtmDomainConformance(input('DM', vars));
    expect(res.ready).toBe(false);
    const f = res.findings.find((f) => f.code === 'TYPE_MISMATCH' && f.variable === 'USUBJID');
    expect(f).toBeDefined();
    expect(f?.message).toContain('Char');
  });
});

describe('checkSdtmDomainConformance — CODELIST_VIOLATION', () => {
  it('errors on an illegal AEOUT value', () => {
    const vars = variablesFor('AE').map((v) =>
      v.name === 'AEOUT' ? { ...v, controlledTerms: ['BETTER'] } : v,
    );
    const res = checkSdtmDomainConformance(input('AE', vars));
    expect(res.ready).toBe(false);
    const f = res.findings.find((f) => f.code === 'CODELIST_VIOLATION' && f.variable === 'AEOUT');
    expect(f).toBeDefined();
    expect(f?.message).toContain('OUT');
  });

  it('accepts a valid AEOUT value (case-insensitive)', () => {
    const vars = variablesFor('AE').map((v) =>
      v.name === 'AEOUT' ? { ...v, controlledTerms: ['fatal'] } : v,
    );
    const res = checkSdtmDomainConformance(input('AE', vars));
    expect(res.findings.some((f) => f.code === 'CODELIST_VIOLATION')).toBe(false);
    expect(res.ready).toBe(true);
  });
});

describe('checkSdtmDomainConformance — UNKNOWN_DOMAIN', () => {
  it('marks an unknown domain not recognized and not ready', () => {
    const res = checkSdtmDomainConformance(input('XYZ', [{ name: 'STUDYID', dataType: 'Char' }]));
    expect(res.recognized).toBe(false);
    expect(res.ready).toBe(false);
    expect(res.findings.some((f) => f.code === 'UNKNOWN_DOMAIN')).toBe(true);
  });
});

describe('checkSdtmDomainConformance — EXTRA_VARIABLE', () => {
  it('warns on an extra variable but stays ready', () => {
    const vars = [...variablesFor('DM'), { name: 'CUSTOMVAR', dataType: 'Char' as const }];
    const res = checkSdtmDomainConformance(input('DM', vars));
    expect(res.ready).toBe(true);
    const f = res.findings.find((f) => f.code === 'EXTRA_VARIABLE' && f.variable === 'CUSTOMVAR');
    expect(f).toBeDefined();
    expect(f?.severity).toBe('warning');
  });
});
