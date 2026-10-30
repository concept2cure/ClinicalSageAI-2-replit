import { describe, expect, it } from 'vitest';
import { generateStfFiles, STF_DOCUMENT_FILE_TAGS, type StfLeaf } from '../stf-generator';
import * as regulatoryFacts from '../../ind/ctd/regulatory-basis';
import { basisProblems, type RegulatoryBasis } from '../../../../shared/regulatory/regulatory-basis';

const report = (fileTag: string, operation: StfLeaf['operation'] = 'new'): StfLeaf => ({
  studyId: 'SYN-CSR-1', fileTag, operation, ctdSection: '5.3.5.1',
  href: 'm5/5351/syn-csr-1/body.pdf', title: 'Synthetic CSR body',
  indexLeafId: 'csr-body', indexRelPath: '../../../index.xml',
});

// Independent official source: ICH STF v2.6.1, §III.B p8, FDA media/159383.
// PDF SHA-256 is pinned in the slice evidence, not inferred from this implementation.
describe('CSR STF roles read from the official specification', () => {
  it('lists study-report-body rather than the invalid study-report spelling', () => {
    expect(STF_DOCUMENT_FILE_TAGS.tags).toContain('study-report-body');
    expect(STF_DOCUMENT_FILE_TAGS.tags).not.toContain('study-report');
  });

  it('writes the verified body role as an ICH file tag, with no warning', () => {
    const result = generateStfFiles([report('study-report-body')]);
    expect(result.warnings).toEqual([]);
    expect(result.files[0].xml).toContain('<file-tag name="study-report-body" info-type="ich"/>');
  });

  it.each(['new', 'replace', 'append'] as const)('refuses an old stored role during %s generation without relabelling it', operation => {
    const input = report('study-report', operation);
    const before = { ...input };
    expect(() => generateStfFiles([input])).toThrow(/study-report.*study-report-body/);
    expect(input).toEqual(before);
  });

  it('permits withdrawing an old-role leaf without emitting that obsolete role', () => {
    const result = generateStfFiles([report('study-report', 'delete')]);
    expect(result.files).toEqual([]);
  });

  it('retains the existing explicit advisory behavior for unverified document roles', () => {
    const result = generateStfFiles([report('unverified-regional-role')]);
    expect(result.warnings).toHaveLength(1);
    expect(result.files[0].xml).toContain('name="unverified-regional-role"');
    expect(STF_DOCUMENT_FILE_TAGS.basis.confidence).toBe('recall');
  });

  it('carries scoped checked-source provenance through the existing regulatory-basis owner', () => {
    const basis = Reflect.get(regulatoryFacts, 'ICH_STF_SPEC_261') as RegulatoryBasis | undefined;
    expect(basis).toMatchObject({
      confidence: 'regulator-text', checked: '2026-10-30',
      url: 'https://www.fda.gov/media/159383/download',
    });
    expect(basisProblems(basis!)).toEqual([]);
    expect(basis!.ref).toMatch(/2\.6\.1.*III\.B/);
    expect(basis!.note).toMatch(/regional|dataset|scope/i);
  });
});
