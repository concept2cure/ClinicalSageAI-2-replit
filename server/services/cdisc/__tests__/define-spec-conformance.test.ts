import { describe, it, expect } from 'vitest';
import { checkDatasetConformance, type DefineSpec } from '../define-spec-conformance.js';

const dm: DefineSpec = {
  studyName: 'STUDY-001',
  standard: 'SDTM',
  datasets: [
    {
      name: 'DM',
      label: 'Demographics',
      datasetClass: 'SPECIAL PURPOSE',
      variables: [
        { name: 'STUDYID', label: 'Study Identifier', type: 'text', length: 20, mandatory: true },
        { name: 'DOMAIN', label: 'Domain Abbreviation', type: 'text', length: 2, mandatory: true },
        { name: 'USUBJID', label: 'Unique Subject Identifier', type: 'text', length: 30, mandatory: true },
        { name: 'SEX', label: 'Sex', type: 'text', length: 1, codelist: 'CL.SEX' },
      ],
    },
  ],
  codelists: [{ oid: 'CL.SEX', name: 'Sex', items: [{ code: 'M', decode: 'Male' }, { code: 'F', decode: 'Female' }] }],
};

describe('checkDatasetConformance', () => {
  it('passes a conformant SDTM DM domain', () => {
    const r = checkDatasetConformance(dm);
    expect(r.summary.pass).toBe(true);
    expect(r.summary.errors).toBe(0);
  });

  it('flags missing required vars, bad names, bad types, and unresolved codelists', () => {
    const r = checkDatasetConformance({
      studyName: 'S', standard: 'SDTM',
      datasets: [{ name: 'dm', label: 'x', variables: [
        { name: 'lowercase', label: 'bad', type: 'text', length: 5 },
        { name: 'AGE', label: 'Age', type: 'banana' as any },
        { name: 'X', label: 'Y', type: 'text', codelist: 'CL.MISSING' },
      ] }],
    });
    const rules = r.findings.map((f) => f.rule);
    expect(r.summary.pass).toBe(false);
    expect(rules).toEqual(expect.arrayContaining(['dataset.name', 'required.variable', 'variable.name', 'variable.type', 'codelist.ref']));
  });

  it('throws on empty datasets', () => {
    expect(() => checkDatasetConformance({ studyName: 'S', standard: 'SDTM', datasets: [] })).toThrow(/non-empty/);
  });
});
