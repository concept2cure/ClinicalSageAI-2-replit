import { describe, it, expect } from 'vitest';
import { validateSdtmDataset, validateAdamDataset } from '../cdisc-conformance-service';

// ─────────────────────────────────────────────────────────────────────────────
// validateSdtmDataset
// ─────────────────────────────────────────────────────────────────────────────

describe('validateSdtmDataset', () => {
  it('valid DM dataset passes with no error findings', () => {
    const result = validateSdtmDataset({
      domain: 'DM',
      variables: [
        { name: 'STUDYID' },
        { name: 'DOMAIN' },
        { name: 'USUBJID' },
        { name: 'SUBJID' },
        { name: 'RFSTDTC' },
        { name: 'RFENDTC' },
      ],
    });
    expect(result.valid).toBe(true);
    expect(result.findings.filter((f) => f.severity === 'error')).toHaveLength(0);
  });

  it('flags a missing required variable', () => {
    const result = validateSdtmDataset({
      domain: 'DM',
      variables: [
        { name: 'STUDYID' },
        { name: 'DOMAIN' },
        { name: 'USUBJID' },
        // SUBJID, RFSTDTC, RFENDTC missing
      ],
    });
    expect(result.valid).toBe(false);
    const missingFindings = result.findings.filter((f) => f.rule === 'MISSING_REQUIRED');
    expect(missingFindings.length).toBeGreaterThanOrEqual(1);
    const missingVarNames = missingFindings.map((f) => f.variable);
    expect(missingVarNames).toContain('SUBJID');
    expect(missingVarNames).toContain('RFSTDTC');
    expect(missingVarNames).toContain('RFENDTC');
  });

  it('flags an invalid domain code', () => {
    const result = validateSdtmDataset({
      domain: 'ZZ',
      variables: [{ name: 'STUDYID' }],
    });
    expect(result.valid).toBe(false);
    expect(result.findings.some((f) => f.rule === 'UNKNOWN_DOMAIN')).toBe(true);
  });

  it('flags a variable name exceeding 8 characters', () => {
    const result = validateSdtmDataset({
      domain: 'DM',
      variables: [
        { name: 'STUDYID' },
        { name: 'DOMAIN' },
        { name: 'USUBJID' },
        { name: 'SUBJID' },
        { name: 'RFSTDTC' },
        { name: 'RFENDTC' },
        { name: 'TOOLONGVAR' }, // 10 chars
      ],
    });
    expect(result.valid).toBe(false);
    const lengthFindings = result.findings.filter((f) => f.rule === 'VARIABLE_NAME_LENGTH');
    expect(lengthFindings).toHaveLength(1);
    expect(lengthFindings[0].variable).toBe('TOOLONGVAR');
  });

  it('flags a lowercase variable name', () => {
    const result = validateSdtmDataset({
      domain: 'DM',
      variables: [
        { name: 'STUDYID' },
        { name: 'DOMAIN' },
        { name: 'USUBJID' },
        { name: 'SUBJID' },
        { name: 'RFSTDTC' },
        { name: 'RFENDTC' },
        { name: 'myvar' },
      ],
    });
    expect(result.valid).toBe(false);
    expect(result.findings.some((f) => f.rule === 'VARIABLE_NAME_CASE' && f.variable === 'myvar')).toBe(true);
  });

  it('throws when domain is missing', () => {
    expect(() => validateSdtmDataset({ variables: [] } as any)).toThrow('domain is required');
  });

  it('throws when variables is not an array', () => {
    expect(() => validateSdtmDataset({ domain: 'DM' } as any)).toThrow('variables must be an array');
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// validateAdamDataset
// ─────────────────────────────────────────────────────────────────────────────

describe('validateAdamDataset', () => {
  it('valid ADSL dataset passes with no error findings', () => {
    const result = validateAdamDataset({
      dataset: 'ADSL',
      variables: [
        { name: 'STUDYID' },
        { name: 'USUBJID' },
        { name: 'SUBJID' },
        { name: 'SITEID' },
        { name: 'ARM' },
        { name: 'ACTARM' },
        { name: 'TRT01P' },
        { name: 'TRT01A' },
        { name: 'SAFFL' },
        { name: 'ITTFL' },
      ],
    });
    expect(result.valid).toBe(true);
    expect(result.findings.filter((f) => f.severity === 'error')).toHaveLength(0);
  });

  it('flags a missing required variable', () => {
    const result = validateAdamDataset({
      dataset: 'ADSL',
      variables: [
        { name: 'STUDYID' },
        { name: 'USUBJID' },
        // missing SUBJID, SITEID, ARM, ACTARM, TRT01P, TRT01A, SAFFL, ITTFL
      ],
    });
    expect(result.valid).toBe(false);
    const missingFindings = result.findings.filter((f) => f.rule === 'MISSING_REQUIRED');
    expect(missingFindings.length).toBeGreaterThanOrEqual(1);
    const missingVarNames = missingFindings.map((f) => f.variable);
    expect(missingVarNames).toContain('SUBJID');
    expect(missingVarNames).toContain('SAFFL');
  });

  it('flags an unknown ADaM dataset name', () => {
    const result = validateAdamDataset({
      dataset: 'ADXYZ',
      variables: [{ name: 'STUDYID' }],
    });
    expect(result.valid).toBe(false);
    expect(result.findings.some((f) => f.rule === 'UNKNOWN_DATASET')).toBe(true);
  });

  it('throws when dataset is missing', () => {
    expect(() => validateAdamDataset({ variables: [] } as any)).toThrow('dataset is required');
  });

  it('throws when variables is not an array', () => {
    expect(() => validateAdamDataset({ dataset: 'ADSL' } as any)).toThrow('variables must be an array');
  });
});
