import { describe, it, expect } from 'vitest';
import { runCdiscPipeline } from '../pipeline.js';
import type { DefineSpec } from '../define-spec-conformance.js';

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
    expect(r.defineVersion).toBe('2.1');
    expect(r.defineXml).toContain('def:DefineVersion="2.1.0"');
  });

  it('emits the Define-XML version the spec asks for, and reports which it emitted', () => {
    const r = runCdiscPipeline({ ...dm, defineVersion: '2.0' });
    expect(r.defineVersion).toBe('2.0');
    expect(r.defineXml).toContain('xmlns:def="http://www.cdisc.org/ns/def/v2.0"');
    expect(r.defineXml).toContain('def:DefineVersion="2.0.0"');
    expect(r.notes).toContain('define.xml emitted at Define-XML 2.0.');
  });

  it('carries the spec through to the generator rather than dropping metadata', () => {
    // The pipeline and the generator model the same things under different
    // names (type/dataType, codelist/codelistId, oid/id, items/terms). A
    // mistranslation here loses variables or codelists silently, so assert the
    // spec's own content survives into the XML.
    const r = runCdiscPipeline(dm);
    expect(r.defineXml).toContain('<ItemGroupDef OID="IG.DM"');
    expect(r.defineXml).toContain('<ItemDef OID="IT.DM.SEX"');
    expect(r.defineXml).toContain('<CodeList OID="CL.CL.SEX"');
    expect(r.defineXml).toContain('<CodeListItem CodedValue="M">');
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
