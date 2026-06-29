import { describe, it, expect } from 'vitest';
import {
  validateSdtmDataset,
  validateAdamDataset,
  generateDefineXml,
} from '../cdisc-conformance-service';

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

// ─────────────────────────────────────────────────────────────────────────────
// generateDefineXml
// ─────────────────────────────────────────────────────────────────────────────

describe('generateDefineXml', () => {
  const sampleInput = {
    studyName: 'TESTSTUDY',
    datasets: [
      {
        domain: 'DM',
        label: 'Demographics',
        variables: [
          { name: 'STUDYID', label: 'Study Identifier', type: 'Char' as const },
          { name: 'USUBJID', label: 'Unique Subject Identifier', type: 'Char' as const },
          { name: 'AGE', label: 'Age', type: 'Num' as const, length: 8 },
        ],
      },
      {
        domain: 'AE',
        label: 'Adverse Events',
        variables: [
          { name: 'STUDYID', label: 'Study Identifier', type: 'Char' as const },
          { name: 'AETERM', label: 'Reported Term for AE', type: 'Char' as const },
        ],
      },
    ],
  };

  it('output contains ODM wrapper', () => {
    const result = generateDefineXml(sampleInput);
    expect(result.xml).toContain('<?xml version="1.0"');
    expect(result.xml).toContain('<ODM');
    expect(result.xml).toContain('xmlns="http://www.cdisc.org/ns/odm/v1.3"');
    expect(result.xml).toContain('xmlns:def="http://www.cdisc.org/ns/def/v2.1"');
    expect(result.xml).toContain('</ODM>');
  });

  it('output contains MetaDataVersion', () => {
    const result = generateDefineXml(sampleInput);
    expect(result.xml).toContain('<MetaDataVersion');
    expect(result.xml).toContain('def:DefineVersion="2.1.0"');
    expect(result.xml).toContain('</MetaDataVersion>');
  });

  it('output contains ItemGroupDef for each dataset', () => {
    const result = generateDefineXml(sampleInput);
    expect(result.xml).toContain('<ItemGroupDef OID="IG.DM"');
    expect(result.xml).toContain('<ItemGroupDef OID="IG.AE"');
  });

  it('output contains ItemDef for each variable', () => {
    const result = generateDefineXml(sampleInput);
    expect(result.xml).toContain('<ItemDef OID="IT.DM.STUDYID"');
    expect(result.xml).toContain('<ItemDef OID="IT.DM.USUBJID"');
    expect(result.xml).toContain('<ItemDef OID="IT.DM.AGE"');
    expect(result.xml).toContain('<ItemDef OID="IT.AE.AETERM"');
  });

  it('returns correct dataset count', () => {
    const result = generateDefineXml(sampleInput);
    expect(result.datasetCount).toBe(2);
  });

  it('returns correct variable count', () => {
    const result = generateDefineXml(sampleInput);
    expect(result.variableCount).toBe(5); // 3 from DM + 2 from AE
  });

  it('throws when datasets is missing or empty', () => {
    expect(() => generateDefineXml({} as any)).toThrow('datasets must be a non-empty array');
    expect(() => generateDefineXml({ datasets: [] })).toThrow('datasets must be a non-empty array');
  });
});
