/**
 * SEND domain conformance checker — required-variable presence, Char/Num type,
 * CDISC CT codelist conformance, unknown-domain handling, extra-variable
 * warnings, and the honest-by-construction verdict (SEND-IG v3.1).
 */

import { describe, it, expect } from 'vitest';
import {
  checkSendDomainConformance,
  SEND_DOMAIN_SPECS,
  type SendConformanceInput,
  type SendVariableInput,
} from '../send-domain-conformance-checker';

type SendDomain = 'DM' | 'EX' | 'BW' | 'CL' | 'LB' | 'MI';

/** Build a fully-conformant variable list for a domain from its reference spec. */
function variablesFor(domain: SendDomain): SendVariableInput[] {
  return SEND_DOMAIN_SPECS[domain].variables.map((v) => ({
    name: v.name,
    dataType: v.dataType,
    controlledTerms: v.allowedValues ? [v.allowedValues[0]] : undefined,
  }));
}

function input(domain: string, variables: SendVariableInput[]): SendConformanceInput {
  return { domain, variables };
}

describe('checkSendDomainConformance — valid datasets', () => {
  it('a complete, correctly-typed DM with valid codelist values is ready', () => {
    const res = checkSendDomainConformance(input('DM', variablesFor('DM')));
    expect(res.ready).toBe(true);
    expect(res.recognized).toBe(true);
    expect(res.counts.errors).toBe(0);
    expect(res.missingRequired).toEqual([]);
    expect(res.findings).toEqual([]);
  });

  it('every supported domain conforms when built from its own spec', () => {
    for (const domain of Object.keys(SEND_DOMAIN_SPECS) as SendDomain[]) {
      const res = checkSendDomainConformance(input(domain, variablesFor(domain)));
      expect(res.ready).toBe(true);
      expect(res.recognized).toBe(true);
      expect(res.counts.errors).toBe(0);
      expect(res.domain).toBe(domain);
    }
  });

  it('domain code is accepted case-insensitively', () => {
    const res = checkSendDomainConformance(input('dm', variablesFor('DM')));
    expect(res.ready).toBe(true);
    expect(res.domain).toBe('DM');
  });
});

describe('checkSendDomainConformance — MISSING_REQUIRED', () => {
  it('BW missing BWSEQ is flagged MISSING_REQUIRED and not ready', () => {
    const vars = variablesFor('BW').filter((v) => v.name !== 'BWSEQ');
    const res = checkSendDomainConformance(input('BW', vars));
    expect(res.ready).toBe(false);
    expect(res.missingRequired).toContain('BWSEQ');
    const finding = res.findings.find((f) => f.variable === 'BWSEQ');
    expect(finding?.code).toBe('MISSING_REQUIRED');
    expect(finding?.severity).toBe('error');
  });

  it('DM missing required STUDYID and USUBJID lists both', () => {
    const vars = variablesFor('DM').filter(
      (v) => v.name !== 'STUDYID' && v.name !== 'USUBJID',
    );
    const res = checkSendDomainConformance(input('DM', vars));
    expect(res.ready).toBe(false);
    expect(res.missingRequired).toEqual(expect.arrayContaining(['STUDYID', 'USUBJID']));
    expect(res.counts.errors).toBe(2);
  });
});

describe('checkSendDomainConformance — TYPE_MISMATCH', () => {
  it('EX with EXDOSE typed Char is flagged TYPE_MISMATCH and not ready', () => {
    const vars = variablesFor('EX').map((v) =>
      v.name === 'EXDOSE' ? { ...v, dataType: 'Char' as const } : v,
    );
    const res = checkSendDomainConformance(input('EX', vars));
    expect(res.ready).toBe(false);
    const finding = res.findings.find((f) => f.variable === 'EXDOSE');
    expect(finding?.code).toBe('TYPE_MISMATCH');
    expect(finding?.severity).toBe('error');
    expect(finding?.message).toContain('Num');
  });
});

describe('checkSendDomainConformance — UNKNOWN_DOMAIN', () => {
  it("unknown domain 'ZZ' is not recognized and not ready", () => {
    const res = checkSendDomainConformance(input('ZZ', []));
    expect(res.recognized).toBe(false);
    expect(res.ready).toBe(false);
    expect(res.missingRequired).toEqual([]);
    expect(res.findings).toHaveLength(1);
    expect(res.findings[0].code).toBe('UNKNOWN_DOMAIN');
    expect(res.findings[0].severity).toBe('error');
    expect(res.counts).toEqual({ errors: 1, warnings: 0 });
  });

  it('empty domain string is handled as unknown', () => {
    const res = checkSendDomainConformance(input('', []));
    expect(res.recognized).toBe(false);
    expect(res.findings[0].code).toBe('UNKNOWN_DOMAIN');
  });
});

describe('checkSendDomainConformance — EXTRA_VARIABLE', () => {
  it('an extra (non-spec) variable is a warning but stays ready', () => {
    const vars = [...variablesFor('CL'), { name: 'CLNOMDY', dataType: 'Num' as const }];
    const res = checkSendDomainConformance(input('CL', vars));
    expect(res.ready).toBe(true);
    expect(res.counts.errors).toBe(0);
    expect(res.counts.warnings).toBe(1);
    const finding = res.findings.find((f) => f.variable === 'CLNOMDY');
    expect(finding?.code).toBe('EXTRA_VARIABLE');
    expect(finding?.severity).toBe('warning');
  });
});

describe('checkSendDomainConformance — codelist', () => {
  it('an out-of-codelist SEX value is a CODELIST_VIOLATION error', () => {
    const vars = variablesFor('DM').map((v) =>
      v.name === 'SEX' ? { ...v, controlledTerms: ['X'] } : v,
    );
    const res = checkSendDomainConformance(input('DM', vars));
    expect(res.ready).toBe(false);
    const finding = res.findings.find((f) => f.variable === 'SEX');
    expect(finding?.code).toBe('CODELIST_VIOLATION');
  });
});

describe('checkSendDomainConformance — determinism & ordering', () => {
  it('is deterministic across repeated and reordered input', () => {
    const a = checkSendDomainConformance(input('MI', variablesFor('MI')));
    const b = checkSendDomainConformance(input('MI', variablesFor('MI')));
    expect(a).toEqual(b);

    const reversed = [...variablesFor('MI')].reverse();
    const c = checkSendDomainConformance(input('MI', reversed));
    expect(c).toEqual(a);
  });

  it('findings are sorted by variable name then severity', () => {
    // Build BW with a type error (BWDY as Char), a missing required (BWSEQ),
    // and an extra variable — verify stable ordering.
    const vars = variablesFor('BW')
      .filter((v) => v.name !== 'BWSEQ')
      .map((v) => (v.name === 'BWDY' ? { ...v, dataType: 'Char' as const } : v));
    vars.push({ name: 'ZZEXTRA', dataType: 'Char' });
    const res = checkSendDomainConformance(input('BW', vars));

    const names = res.findings.map((f) => f.variable);
    const sorted = [...names].sort((x, y) => x.localeCompare(y));
    expect(names).toEqual(sorted);
  });
});
