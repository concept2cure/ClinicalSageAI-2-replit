import { describe, it, expect } from 'vitest';
import { generateStfFiles, type StfLeaf } from '../stf-generator';

const leaf = (over: Partial<StfLeaf> & { studyId: string; fileTag: string }): StfLeaf => ({
  ctdSection: over.ctdSection ?? '5.3.5.1',
  href: over.href ?? `m5/53-clin-stud-rep/${over.studyId}/body.pdf`,
  title: over.title ?? 'Study report',
  operation: over.operation ?? 'new',
  ...over,
});

describe('generateStfFiles', () => {
  it('produces one stf.xml per study', () => {
    const res = generateStfFiles([
      leaf({ studyId: 'S-001', fileTag: 'study-report-body' }),
      leaf({ studyId: 'S-002', fileTag: 'study-report-body' }),
    ]);
    expect(res.summary).toMatchObject({ studies: 2, leaves: 2, untagged: 0 });
    expect(res.files.map(f => f.studyId)).toEqual(['S-001', 'S-002']); // sorted
    expect(res.files[0].fileName).toBe('stf.xml');
  });

  it('groups leaves by file-tag within a study and includes each leaf with its operation', () => {
    const res = generateStfFiles([
      leaf({ studyId: 'S-001', fileTag: 'study-report-body', title: 'Body', operation: 'new' }),
      leaf({ studyId: 'S-001', fileTag: 'protocol-or-amendment', title: 'Protocol', operation: 'replace' }),
      leaf({ studyId: 'S-001', fileTag: 'study-report-body', title: 'Body appendix', operation: 'append' }),
    ]);
    expect(res.files).toHaveLength(1);
    const xml = res.files[0].xml;
    expect(xml).toContain('<file-tag name="protocol-or-amendment">');
    expect(xml).toContain('<file-tag name="study-report-body">');
    expect(xml).toContain('operation="replace"');
    expect(xml).toContain('operation="append"');
    expect(xml).toContain('<study-id>S-001</study-id>');
  });

  it('uses study metadata for title and category when provided', () => {
    const res = generateStfFiles(
      [leaf({ studyId: 'S-001', fileTag: 'study-report-body' })],
      [{ studyId: 'S-001', studyTitle: 'A Phase 1 FIH Study', studyCategory: 'clinical-study-report' }]
    );
    expect(res.files[0].xml).toContain('<title>A Phase 1 FIH Study</title>');
    expect(res.files[0].xml).toContain('<study-category>clinical-study-report</study-category>');
  });

  it('escapes XML metacharacters in titles and hrefs', () => {
    const res = generateStfFiles([
      leaf({ studyId: 'S&1', fileTag: 'study-report-body', title: 'A <b> & "c"', href: 'm5/a&b.pdf' }),
    ]);
    const xml = res.files[0].xml;
    expect(xml).toContain('A &lt;b&gt; &amp; &quot;c&quot;');
    expect(xml).toContain('m5/a&amp;b.pdf');
    expect(xml).not.toContain('A <b> & "c"');
  });

  it('skips and counts untagged (no studyId) leaves', () => {
    const res = generateStfFiles([
      leaf({ studyId: '', fileTag: 'study-report-body' }),
      leaf({ studyId: 'S-001', fileTag: 'study-report-body' }),
    ]);
    expect(res.summary).toMatchObject({ studies: 1, leaves: 1, untagged: 1 });
  });

  it('throws when a tagged leaf is missing its file-tag', () => {
    expect(() =>
      generateStfFiles([leaf({ studyId: 'S-001', fileTag: '' })])
    ).toThrow(/missing a file-tag/);
  });

  it('emits well-formed STF with the DTD declaration and ectd namespaces', () => {
    const res = generateStfFiles([leaf({ studyId: 'S-001', fileTag: 'study-report-body' })]);
    const xml = res.files[0].xml;
    expect(xml.startsWith('<?xml version="1.0" encoding="UTF-8"?>')).toBe(true);
    expect(xml).toContain('<!DOCTYPE ectd:study SYSTEM "ich-stf-v2-2.dtd">');
    expect(xml).toContain('xmlns:ectd="http://www.ich.org/ectd"');
    expect(xml).toContain('xmlns:xlink="http://www.w3.org/1999/xlink"');
  });
});
