/**
 * CDISC Define-XML generator — deterministic XML + gap report from dataset /
 * variable / codelist metadata, at the requested Define-XML version.
 */

import { describe, it, expect } from 'vitest';
import { generateDefineXml, type DefineXmlInput } from '../define-xml-generator';

function input(over: Partial<DefineXmlInput> = {}): DefineXmlInput {
  return {
    studyName: 'C2C-001',
    standard: 'SDTMIG 3.4',
    datasets: [
      {
        name: 'DM',
        label: 'Demographics',
        datasetClass: 'SPECIAL PURPOSE',
        structure: 'One record per subject',
        variables: [
          { name: 'STUDYID', label: 'Study Identifier', dataType: 'text', length: 12, mandatory: true, keySequence: 1 },
          { name: 'USUBJID', label: 'Unique Subject Identifier', dataType: 'text', length: 20, mandatory: true, keySequence: 2 },
          { name: 'SEX', label: 'Sex', dataType: 'text', length: 1, mandatory: true, codelistId: 'SEX' },
        ],
      },
    ],
    codelists: [
      { id: 'SEX', name: 'Sex', dataType: 'text', terms: [{ value: 'M', decode: 'Male' }, { value: 'F', decode: 'Female' }] },
    ],
    ...over,
  };
}

describe('generateDefineXml — well-formed output', () => {
  it('emits an ODM Define-XML 2.1 document with the dataset, variables and codelist', () => {
    const { xml, valid, datasetCount, variableCount, codelistCount } = generateDefineXml(input());
    expect(xml.startsWith('<?xml version="1.0" encoding="UTF-8"?>')).toBe(true);
    expect(xml).toContain('def:DefineVersion="2.1.0"');
    expect(xml).toContain('<ItemGroupDef OID="IG.DM"');
    expect(xml).toContain('<ItemRef ItemOID="IT.DM.STUDYID" Mandatory="Yes" KeySequence="1"/>');
    expect(xml).toContain('<ItemDef OID="IT.DM.SEX"');
    expect(xml).toContain('<CodeListRef CodeListOID="CL.SEX"/>');
    expect(xml).toContain('<CodeList OID="CL.SEX"');
    expect(xml).toContain('CodedValue="M"');
    expect(valid).toBe(true);
    expect(datasetCount).toBe(1);
    expect(variableCount).toBe(3);
    expect(codelistCount).toBe(1);
  });

  it('is deterministic for identical input', () => {
    expect(generateDefineXml(input()).xml).toBe(generateDefineXml(input()).xml);
  });

  it('escapes XML special characters in labels', () => {
    const xml = generateDefineXml(
      input({ datasets: [{ name: 'DM', label: 'Demographics <A & B>', variables: [{ name: 'STUDYID', label: 'id', dataType: 'text', keySequence: 1 }] }] }),
    ).xml;
    expect(xml).toContain('Demographics &lt;A &amp; B&gt;');
  });
});

describe('generateDefineXml — gap detection', () => {
  it('flags a dataset with no key variables (NO_KEYS, error → invalid)', () => {
    const res = generateDefineXml(
      input({ datasets: [{ name: 'DM', label: 'Demographics', variables: [{ name: 'STUDYID', label: 'id', dataType: 'text' }] }] }),
    );
    expect(res.valid).toBe(false);
    expect(res.gaps.some((g) => g.code === 'NO_KEYS')).toBe(true);
  });

  it('flags an empty dataset (EMPTY_DATASET)', () => {
    const res = generateDefineXml(input({ datasets: [{ name: 'DM', label: 'Demographics', variables: [] }] }));
    expect(res.gaps.some((g) => g.code === 'EMPTY_DATASET')).toBe(true);
    expect(res.valid).toBe(false);
  });

  it('flags a variable referencing a missing codelist (ORPHAN_CODELIST)', () => {
    const res = generateDefineXml(
      input({
        datasets: [{ name: 'DM', label: 'Demographics', variables: [{ name: 'STUDYID', label: 'id', dataType: 'text', keySequence: 1, codelistId: 'GHOST' }] }],
        codelists: [],
      }),
    );
    expect(res.gaps.some((g) => g.code === 'ORPHAN_CODELIST')).toBe(true);
    expect(res.valid).toBe(false);
  });

  it('flags a duplicate dataset (DUPLICATE_DATASET)', () => {
    const ds = { name: 'DM', label: 'Demographics', variables: [{ name: 'STUDYID', label: 'id', dataType: 'text' as const, keySequence: 1 }] };
    const res = generateDefineXml(input({ datasets: [ds, ds], codelists: [] }));
    expect(res.gaps.some((g) => g.code === 'DUPLICATE_DATASET')).toBe(true);
  });

  it('warns on an unused codelist + a missing label (warnings, still valid)', () => {
    const res = generateDefineXml(
      input({
        datasets: [{ name: 'DM', label: '', variables: [{ name: 'STUDYID', label: 'id', dataType: 'text', keySequence: 1 }] }],
        codelists: [{ id: 'SEX', name: 'Sex', dataType: 'text', terms: [{ value: 'M' }] }],
      }),
    );
    expect(res.gaps.some((g) => g.code === 'UNUSED_CODELIST' && g.severity === 'warning')).toBe(true);
    expect(res.gaps.some((g) => g.code === 'MISSING_LABEL' && g.severity === 'warning')).toBe(true);
    expect(res.valid).toBe(true); // warnings do not invalidate
  });
});

describe('generateDefineXml — the version is a parameter, not a guess', () => {
  it('defaults to 2.1 and says so in the result', () => {
    const res = generateDefineXml(input());
    expect(res.defineVersion).toBe('2.1');
    expect(res.xml).toContain('xmlns:def="http://www.cdisc.org/ns/def/v2.1"');
    expect(res.xml).toContain('def:DefineVersion="2.1.0"');
  });

  it('emits 2.0 when asked, in both places the version is declared', () => {
    const res = generateDefineXml(input({ defineVersion: '2.0' }));
    expect(res.defineVersion).toBe('2.0');
    expect(res.xml).toContain('xmlns:def="http://www.cdisc.org/ns/def/v2.0"');
    expect(res.xml).toContain('def:DefineVersion="2.0.0"');
    // The version must not survive anywhere from the other branch: a file whose
    // namespace and DefineVersion disagree fails schema validation at the
    // receiving gateway, which is precisely what one hardcoded version caused.
    expect(res.xml).not.toContain('def/v2.1');
    expect(res.xml).not.toContain('DefineVersion="2.1.0"');
  });

  it('carries def:Origin through, the one thing the deleted 2.0 generator could do', () => {
    const res = generateDefineXml(
      input({
        datasets: [
          {
            name: 'DM',
            label: 'Demographics',
            variables: [{ name: 'AGE', label: 'Age', dataType: 'integer', keySequence: 1, origin: 'CRF' }],
          },
        ],
        codelists: [],
      }),
    );
    expect(res.xml).toContain('<def:Origin Type="CRF"/>');
  });

  it('omits def:Origin entirely when no origin is stated', () => {
    expect(generateDefineXml(input()).xml).not.toContain('def:Origin');
  });
});
