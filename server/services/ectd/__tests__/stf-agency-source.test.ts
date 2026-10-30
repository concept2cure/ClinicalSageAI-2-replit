import { describe, expect, it } from 'vitest';
import { DOMParser } from '@xmldom/xmldom';
import { generateStfFiles, type StfLeaf } from '../stf-generator';

// Independent oracle: official ICH STF v2.6.1 §III.B pp9–10, FDA media159383.
// Current stylesheet filename: FDA eCTD3.2.2 standards table, read2026-10-30.
// Exact source URLs/hashes and the distinction from formal DTD qualification
// are retained in the MR-10/2026-10-30 agency qualification evidence.
const US_ROLES = [
  'data-tabulation-data-definition', 'data-listing-dataset',
  'data-listing-data-definition', 'analysis-program', 'analysis-data-definition',
  'annotated-crf', 'subject-profiles', 'safety-report', 'antibacterial', 'special-pathogen',
] as const;
const leaf = (fileTag = 'study-report-body'): StfLeaf => ({
  studyId: 'SYN-AGENCY-1', title: 'Synthetic qualification document', fileTag,
  ctdSection: '5.3.5.1', href: ['data-tabulation-data-definition', 'analysis-data-definition'].includes(fileTag)
    ? 'm5/study/define.xml' : fileTag === 'data-listing-data-definition' ? 'm5/study/listing-definition.xml' : 'm5/study/document.pdf',
  operation: 'new', indexLeafId: 'synthetic-document', indexRelPath: '../../index.xml',
});
const document = (xml: string) => new DOMParser().parseFromString(xml, 'application/xml');

describe('source-confirmed STF stylesheet and regional info types', () => {
  it('references the current published STF stylesheet in its prolog', () => {
    const { xml } = generateStfFiles([leaf()]).files[0];
    expect(xml).toContain('<?xml-stylesheet type="text/xsl" href="ich-stf-stylesheet-2-3.xsl"?>');
    expect(xml.indexOf('<?xml-stylesheet')).toBeLessThan(xml.indexOf('<!DOCTYPE'));
    expect(xml).toContain('name="study-report-body" info-type="ich"');
  });

  it('uses the caller’s actual per-study package-relative stylesheet path', () => {
    const options = { stylesheetPath: (studyId: string) => `../../util/style/${studyId}/ich-stf-stylesheet-2-3.xsl` };
    const { xml } = generateStfFiles([leaf()], [], options).files[0];
    expect(xml).toContain('href="../../util/style/SYN-AGENCY-1/ich-stf-stylesheet-2-3.xsl"');
    expect(xml).toContain('SYSTEM "ich-stf-v2-2.dtd"');
  });

  it.each(US_ROLES)('emits the source-classified US info-type for %s', fileTag => {
    const result = generateStfFiles([leaf(fileTag)]);
    const tag = document(result.files[0].xml).getElementsByTagName('file-tag')[0];
    expect(tag.getAttribute('name')).toBe(fileTag);
    expect(tag.getAttribute('info-type')).toBe('us');
    expect(result.warnings).toEqual([]);
  });

  it.each(['study-report-body', 'protocol-or-amendment', 'case-report-forms'])('retains the source-classified ICH info-type for %s', fileTag => {
    const { xml } = generateStfFiles([leaf(fileTag)]).files[0];
    expect(document(xml).getElementsByTagName('file-tag')[0].getAttribute('info-type')).toBe('ich');
  });

  it('preserves the explicit advisory for a role not independently verified here', () => {
    const input = leaf('unverified-local-role');
    const before = { ...input };
    const result = generateStfFiles([input]);
    expect(result.warnings).toHaveLength(1);
    expect(input).toEqual(before);
  });
});
