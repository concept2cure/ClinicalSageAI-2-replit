import { describe, it, expect } from 'vitest';
import { runCdiscPipeline } from '../pipeline.js';
import type { DefineSpec } from '../define-xml.js';

const dm: DefineSpec = {
  studyName: 'STUDY-001',
  standard: 'SDTM',
  datasets: [
    {
      name: 'DM', label: 'Demographics',
      variables: [
        { name: 'STUDYID', label: 'Study Identifier', type: 'text', length: 20 },
        { name: 'DOMAIN', label: 'Domain Abbreviation', type: 'text', length: 2 },
        { name: 'USUBJID', label: 'Unique Subject Identifier', type: 'text', length: 30 },
        { name: 'SEX', label: 'Sex', type: 'text', length: 1, codelist: 'CL.SEX' },
      ],
    },
  ],
  codelists: [{ oid: 'CL.SEX', name: 'Sex', items: [{ code: 'M', decode: 'Male' }, { code: 'F', decode: 'Female' }] }],
};

describe('runCdiscPipeline', () => {
  it('passes a conformant spec and emits define.xml + readiness', () => {
    const r = runCdiscPipeline(dm);
    expect(r.readiness.submissionReady).toBe(true);
    expect(r.readiness.errors).toBe(0);
    expect(r.defineXml).toContain('def:DefineVersion="2.0.0"');
  });

  it('flags duplicate variables and empty codelists (deep rules)', () => {
    const bad: DefineSpec = {
      studyName: 'S', standard: 'SDTM',
      datasets: [{ name: 'DM', label: 'Demographics', variables: [
        { name: 'STUDYID', label: 'Study Identifier', type: 'text', length: 20 },
        { name: 'DOMAIN', label: 'Domain', type: 'text', length: 2 },
        { name: 'USUBJID', label: 'Subject', type: 'text', length: 30 },
        { name: 'USUBJID', label: 'Dup', type: 'text', length: 30 },
      ] }],
      codelists: [{ oid: 'CL.EMPTY', name: 'Empty', items: [] }],
    };
    const r = runCdiscPipeline(bad);
    const rules = r.findings.map((f) => f.rule);
    expect(r.readiness.submissionReady).toBe(false);
    expect(rules).toEqual(expect.arrayContaining(['variable.duplicate', 'codelist.empty']));
  });

  it('warns when an ADaM submission has no ADSL', () => {
    const adam: DefineSpec = {
      studyName: 'S', standard: 'ADaM',
      datasets: [{ name: 'ADAE', label: 'AE Analysis', variables: [
        { name: 'STUDYID', label: 'Study', type: 'text', length: 20 },
        { name: 'USUBJID', label: 'Subject', type: 'text', length: 30 },
      ] }],
    };
    const r = runCdiscPipeline(adam);
    expect(r.findings.some((f) => f.rule === 'adam.adsl')).toBe(true);
  });
});
