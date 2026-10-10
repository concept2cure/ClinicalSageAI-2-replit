/**
 * The dataset profile (S3): structure only, the CDISC standard and domain by
 * rule, and never a cell value. A listing holds subject-level data; the
 * catalog must not copy it.
 */
import { describe, expect, it } from 'vitest';
import { detectCdisc, profileDataset, profileFormat } from '../dataset-profile';

const AE_CSV = [
  'STUDYID,DOMAIN,USUBJID,AESEQ,AETERM,AEDECOD,AESTDTC,AESER',
  'BX-301-02,AE,BX-301-02-0012,1,Headache,Headache,2024-05-02,N',
  'BX-301-02,AE,BX-301-02-0031,1,Nausea,Nausea,2024-05-09,N',
  'BX-301-02,AE,BX-301-02-0031,2,Cough,Cough,2024-06-11,Y',
].join('\n');

describe('profileDataset', () => {
  it('profiles an SDTM AE listing: columns, types, rows, standard and domain', async () => {
    const p = await profileDataset(Buffer.from(AE_CSV), 'ae.csv', 'text/csv');
    expect(p?.format).toBe('csv');
    const t = p!.tables[0];
    expect(t.rowCount).toBe(3);
    expect(t.columnCount).toBe(8);
    expect(t.cdisc).toMatchObject({ standard: 'SDTM', domain: 'AE' });
    expect(t.columns.find(c => c.name === 'AESEQ')?.type).toBe('number');
    expect(t.columns.find(c => c.name === 'AESTDTC')?.type).toBe('date');
  });

  it('keeps no cell value: no subject id or term appears in the profile', async () => {
    const p = await profileDataset(Buffer.from(AE_CSV), 'ae.csv', 'text/csv');
    const json = JSON.stringify(p);
    expect(json).not.toContain('BX-301-02-0031');
    expect(json).not.toContain('Nausea');
  });

  it('profiles a TSV, and a table with no CDISC signature as no standard', async () => {
    const p = await profileDataset(Buffer.from('lot\tassay\tdate\nA1\t98.4\t2024-01-02\n'), 'stability.tsv', 'text/plain');
    expect(p?.format).toBe('tsv');
    expect(p?.tables[0]).toMatchObject({ rowCount: 1, columnCount: 3, cdisc: { standard: null, domain: null } });
  });

  it('reads the datasets a define.xml describes', async () => {
    const xml = `<?xml version="1.0"?><ODM xmlns:def="http://www.cdisc.org/ns/def/v2.1"><Study><MetaDataVersion>
      <ItemGroupDef OID="IG.AE" Name="AE" Domain="AE" Purpose="Tabulation" def:Structure="One record per adverse event">
        <ItemRef ItemOID="IT.AE.STUDYID"/><ItemRef ItemOID="IT.AE.USUBJID"/><ItemRef ItemOID="IT.AE.AETERM"/></ItemGroupDef>
      <ItemGroupDef OID="IG.ADSL" Name="ADSL" Purpose="Analysis"><ItemRef ItemOID="IT.ADSL.USUBJID"/></ItemGroupDef>
      </MetaDataVersion></Study></ODM>`;
    const p = await profileDataset(Buffer.from(xml), 'define.xml', 'application/xml');
    expect(p?.format).toBe('define-xml');
    expect(p?.tables.map(t => [t.name, t.cdisc.standard, t.columnCount])).toEqual([['AE', 'SDTM', 3], ['ADSL', 'ADaM', 1]]);
  });

  it('profiles paired and self-closing define elements without accepting longer element names', async () => {
    const xml = `<ODM><Study><MetaDataVersion>
      <ItemGroupDef
        Name="AE" Domain="AE" Purpose="Tabulation">
        <ItemRef ItemOID="IT.AE.STUDYID"/>
        <ItemRef ItemOID="IT.AE.USUBJID"></ItemRef>
        <ItemRefSuffix ItemOID="not-an-item-reference"/>
      </ItemGroupDef>
      <ItemGroupDef Name="ADSL(1)+" Purpose="Analysis"/>
      <ItemGroupDefSuffix Name="not-a-dataset"><ItemRef ItemOID="ignored"/></ItemGroupDefSuffix>
    </MetaDataVersion></Study></ODM>`;
    const p = await profileDataset(Buffer.from(xml), 'define.xml', 'application/xml');
    expect(p).toMatchObject({ format: 'define-xml', tableCount: 2, profiledBy: 'dataset-profile v1' });
    expect(p?.tables).toEqual([
      { name: 'AE', columns: [], rowCount: 0, columnCount: 2,
        cdisc: { standard: 'SDTM', domain: 'AE', rule: 'define.xml ItemGroupDef Purpose and Domain' } },
      { name: 'ADSL(1)+', columns: [], rowCount: 0, columnCount: 0,
        cdisc: { standard: 'ADaM', domain: 'ADSL(1)+', rule: 'define.xml ItemGroupDef Purpose and Domain' } },
    ]);
  });

  it('profiles every invocation from the beginning without retaining matching state', async () => {
    const bytes = Buffer.from('<ODM><ItemGroupDef Name="AE" Purpose="Tabulation"><ItemRef ItemOID="IT.AE.STUDYID"/></ItemGroupDef></ODM>');
    const first = await profileDataset(bytes, 'define.xml', 'application/xml');
    expect(first?.tables).toHaveLength(1);
    expect(first?.tables[0].columnCount).toBe(1);
    await profileDataset(Buffer.from('<ODM><ItemGroupDef Name="EMPTY"/></ODM>'), 'define.xml', 'application/xml');
    expect(await profileDataset(bytes, 'define.xml', 'application/xml')).toEqual(first);
    expect(await profileDataset(Buffer.from('<ODM><ItemGroupDefSuffix Name="ignored"/></ODM>'), 'define.xml', 'application/xml')).toBeNull();
  });

  it('counts every define dataset while retaining only the existing table limit', async () => {
    const groups = Array.from({ length: 28 }, (_, i) => `<ItemGroupDef Name="DS${i}" Purpose="Tabulation"><ItemRef ItemOID="IT.DS${i}.STUDYID"/></ItemGroupDef>`);
    const p = await profileDataset(Buffer.from(`<ODM>${groups.join('')}</ODM>`), 'define.xml', 'application/xml');
    expect(p?.tableCount).toBe(28);
    expect(p?.tables).toHaveLength(25);
    expect(p?.tables.map(t => t.name)).toEqual(Array.from({ length: 25 }, (_, i) => `DS${i}`));
    expect(p?.tables.every(t => t.columnCount === 1 && t.rowCount === 0 && t.columns.length === 0)).toBe(true);
  });

  it('declines what it does not read: a PDF, or an XML that is not a define.xml', async () => {
    expect(profileFormat('csr.pdf', 'application/pdf')).toBeNull();
    expect(await profileDataset(Buffer.from('<note/>'), 'define.xml', 'application/xml')).toBeNull();
  });
});

describe('detectCdisc', () => {
  it('recognises ADaM BDS and ADSL by their required variables', () => {
    expect(detectCdisc(['STUDYID', 'USUBJID', 'PARAMCD', 'PARAM', 'AVAL', 'AVISIT']).domain).toBe('BDS');
    expect(detectCdisc(['STUDYID', 'USUBJID', 'TRT01P', 'TRT01A', 'SAFFL', 'ITTFL']).domain).toBe('ADSL');
  });

  it('names no domain it cannot see in the variables', () => {
    expect(detectCdisc(['STUDYID', 'DOMAIN', 'USUBJID'])).toMatchObject({ standard: 'SDTM', domain: null });
  });
});
