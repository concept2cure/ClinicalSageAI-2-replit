import { describe, it, expect } from 'vitest';
import { promises as fs } from 'fs';
import * as os from 'os';
import * as path from 'path';
import JSZip from 'jszip';
import {
  generateStfFiles,
  stfFileName,
  STF_DATASET_FILE_TAGS,
  STF_DOCUMENT_FILE_TAGS,
  type StfLeaf,
} from '../stf-generator';
import { FDA_STUDY_DATA_TRC } from '../../ind/ctd/regulatory-basis';
import { packageEctdSubmission, type EctdLeaf } from '../../submission-gateways/regional-packager';

const leaf = (over: Partial<StfLeaf> & { studyId: string; fileTag: string }): StfLeaf => ({
  ctdSection: '5.3.5.1',
  href: `m5/5-3-5-1/${over.studyId.toLowerCase()}/body.pdf`,
  title: 'Study report',
  operation: 'new',
  indexLeafId: 'leaf-5-3-5-1-body',
  indexRelPath: '../../../index.xml',
  ...over,
});

describe('STF file name: "stf-" + study-id + ".xml" (ICH STF v2.6.1)', () => {
  it('names the file after the study, not stf.xml', () => {
    const res = generateStfFiles([leaf({ studyId: 'abc-301', fileTag: 'study-report' })]);
    expect(res.files[0].fileName).toBe('stf-abc-301.xml');
  });

  it('keeps the sponsor study-id verbatim in the XML and case-folds only the file name', () => {
    const res = generateStfFiles([leaf({ studyId: 'ABC-301', fileTag: 'study-report' })]);
    expect(res.files[0].fileName).toBe('stf-abc-301.xml');
    expect(res.files[0].xml).toContain('<study-id>ABC-301</study-id>');
    expect(stfFileName('ABC-301')).toBe('stf-abc-301.xml');
  });

  it.each(['S&1', 'abc 301', 'abc_301', 'abc/301', 'x'.repeat(64)])(
    'refuses a study id that cannot form an eCTD file name (%s) instead of escaping it',
    (studyId) => {
      expect(() => generateStfFiles([leaf({ studyId, fileTag: 'study-report' })])).toThrow(/eCTD file-name rule/);
    },
  );

  it('refuses two studies whose ids fold to the same STF file name', () => {
    expect(() =>
      generateStfFiles([
        leaf({ studyId: 'ABC-301', fileTag: 'study-report' }),
        leaf({ studyId: 'abc-301', fileTag: 'study-report' }),
      ]),
    ).toThrow(/same STF file name/);
  });
});

describe('STF file-tags on standardized datasets (FDA TRC 1735)', () => {
  it('exports the dataset and define.xml tag lists with the study-data TRC basis', () => {
    expect([...STF_DATASET_FILE_TAGS.xpt].sort()).toEqual(
      ['analysis-dataset-adam', 'data-tabulation-dataset-sdtm', 'data-tabulation-dataset-send'],
    );
    expect([...STF_DATASET_FILE_TAGS.define].sort()).toEqual(
      ['analysis-data-definition', 'data-tabulation-data-definition'],
    );
    expect(STF_DATASET_FILE_TAGS.basis).toBe(FDA_STUDY_DATA_TRC);
  });

  it('throws citing 1735 for an .xpt dataset carrying a free-text tag', () => {
    expect(() =>
      generateStfFiles([
        leaf({ studyId: 'abc-301', fileTag: 'datasets', href: 'm5/datasets/abc-301/tabulations/sdtm/ts.xpt' }),
      ]),
    ).toThrow(/TRC 1735/);
  });

  it('throws citing 1735 for a define.xml carrying a document tag', () => {
    expect(() =>
      generateStfFiles([
        leaf({ studyId: 'abc-301', fileTag: 'study-report', href: 'm5/datasets/abc-301/tabulations/sdtm/define.xml' }),
      ]),
    ).toThrow(/TRC 1735/);
  });

  it('accepts the 1735 tags on .xpt and define.xml leaves', () => {
    const res = generateStfFiles([
      leaf({ studyId: 'abc-301', fileTag: 'data-tabulation-dataset-sdtm', href: 'm5/datasets/abc-301/tabulations/sdtm/ts.xpt', indexLeafId: 'a' }),
      leaf({ studyId: 'abc-301', fileTag: 'data-tabulation-data-definition', href: 'm5/datasets/abc-301/tabulations/sdtm/define.xml', indexLeafId: 'b' }),
      leaf({ studyId: 'abc-301', fileTag: 'analysis-dataset-adam', href: 'm5/datasets/abc-301/analysis/adam/adsl.xpt', indexLeafId: 'c' }),
      leaf({ studyId: 'abc-301', fileTag: 'analysis-data-definition', href: 'm5/datasets/abc-301/analysis/adam/define.xml', indexLeafId: 'd' }),
    ]);
    expect(res.files).toHaveLength(1);
    expect(res.warnings).toEqual([]);
  });
});

describe('STF XML shape: doc-content -> index.xml leaf ID, holding file-tag', () => {
  it('writes a doc-content per leaf pointing at its index.xml leaf, holding an info-type file-tag, and no <leaf>', () => {
    const res = generateStfFiles([
      leaf({ studyId: 'abc-301', fileTag: 'study-report', title: 'Body', indexLeafId: 'leaf-5-3-5-1-body' }),
      leaf({ studyId: 'abc-301', fileTag: 'protocol-or-amendment', title: 'Protocol', indexLeafId: 'leaf-5-3-5-1-protocol', operation: 'replace' }),
    ]);
    const xml = res.files[0].xml;
    expect(xml).not.toMatch(/<leaf[\s>]/);
    expect(xml).toContain(
      '<doc-content xlink:href="../../../index.xml#leaf-5-3-5-1-body">\n' +
        '      <title>Body</title>\n' +
        '      <file-tag name="study-report" info-type="ich"/>\n' +
        '    </doc-content>',
    );
    expect(xml).toContain('<doc-content xlink:href="../../../index.xml#leaf-5-3-5-1-protocol">');
    expect(xml).toContain('<file-tag name="protocol-or-amendment" info-type="ich"/>');
    expect(xml).toMatch(/<study-identifier>\s*<title>abc-301<\/title>\s*<study-id>abc-301<\/study-id>\s*<\/study-identifier>/);
    expect(xml).toMatch(/<study-document>[\s\S]*<\/study-document>/);
  });

  it('refuses a leaf with no index.xml leaf ID or no path to index.xml', () => {
    expect(() => generateStfFiles([leaf({ studyId: 'abc-301', fileTag: 'study-report', indexLeafId: '' })])).toThrow(/index\.xml leaf ID/);
    expect(() => generateStfFiles([leaf({ studyId: 'abc-301', fileTag: 'study-report', indexRelPath: '' })])).toThrow(/index\.xml/);
  });

  it('does not tag a deleted leaf: it ships no file to describe', () => {
    const res = generateStfFiles([
      leaf({ studyId: 'abc-301', fileTag: 'study-report', indexLeafId: 'kept' }),
      leaf({ studyId: 'abc-301', fileTag: 'study-report', indexLeafId: 'gone', operation: 'delete' }),
    ]);
    expect(res.files[0].xml).toContain('index.xml#kept');
    expect(res.files[0].xml).not.toContain('index.xml#gone');
    expect(res.files[0].leafCount).toBe(1);
  });

  it('writes the study title from metadata and never invents a category', () => {
    const res = generateStfFiles(
      [leaf({ studyId: 'abc-301', fileTag: 'study-report' })],
      [{ studyId: 'abc-301', studyTitle: 'A Phase 1 FIH Study', studyCategory: 'clinical-study-report' }],
    );
    expect(res.files[0].xml).toContain('<title>A Phase 1 FIH Study</title>');
    expect(res.files[0].xml).not.toContain('study-category');
    expect(res.files[0].xml).not.toContain('clinical-study-report');
    expect(res.warnings.join('\n')).toMatch(/category "clinical-study-report" .*not written/);
  });

  it('warns, without refusing, on a document tag outside the recall list', () => {
    expect(STF_DOCUMENT_FILE_TAGS.basis.confidence).toBe('recall');
    const known = generateStfFiles([leaf({ studyId: 'abc-301', fileTag: 'study-report' })]);
    expect(known.warnings).toEqual([]);
    const unknown = generateStfFiles([leaf({ studyId: 'abc-301', fileTag: 'study-report-body' })]);
    expect(unknown.files).toHaveLength(1);
    expect(unknown.warnings.join('\n')).toMatch(/"study-report-body".*not in the reviewed STF file-tag list/);
  });

  it('escapes XML metacharacters in titles', () => {
    const res = generateStfFiles([leaf({ studyId: 's-1', fileTag: 'study-report', title: 'A <b> & "c"' })]);
    const xml = res.files[0].xml;
    expect(xml).toContain('A &lt;b&gt; &amp; &quot;c&quot;');
    expect(xml).not.toContain('A <b> & "c"');
  });

  it('skips and counts untagged (no studyId) leaves', () => {
    const res = generateStfFiles([
      leaf({ studyId: '', fileTag: 'study-report' }),
      leaf({ studyId: 's-001', fileTag: 'study-report' }),
    ]);
    expect(res.summary).toMatchObject({ studies: 1, leaves: 1, untagged: 1 });
  });

  it('throws when a tagged leaf is missing its file-tag', () => {
    expect(() => generateStfFiles([leaf({ studyId: 's-001', fileTag: '' })])).toThrow(/missing a file-tag/);
  });

  it('emits the DTD declaration and ectd/xlink namespaces, one file per study in sorted order', () => {
    const res = generateStfFiles([
      leaf({ studyId: 's-002', fileTag: 'study-report' }),
      leaf({ studyId: 's-001', fileTag: 'study-report' }),
    ]);
    expect(res.files.map((f) => f.fileName)).toEqual(['stf-s-001.xml', 'stf-s-002.xml']);
    const xml = res.files[0].xml;
    expect(xml.startsWith('<?xml version="1.0" encoding="UTF-8"?>')).toBe(true);
    expect(xml).toContain('<!DOCTYPE ectd:study SYSTEM "ich-stf-v2-2.dtd">');
    expect(xml).toContain('xmlns:ectd="http://www.ich.org/ectd"');
    expect(xml).toContain('xmlns:xlink="http://www.w3.org/1999/xlink"');
  });
});

describe('regional packager writes the STF under its spec name and links it to index.xml leaf IDs', () => {
  const pdf = (label: string) => Buffer.from(`%PDF-1.4\n% ${label}\ntrailer<< /Root 1 0 R >>\n%%EOF\n`, 'utf8');

  it('ships m5/5-3-5-1/study-001/stf-study-001.xml whose doc-content resolves to the report leaf ID in index.xml', async () => {
    const work = await fs.mkdtemp(path.join(os.tmpdir(), 'stf-shape-'));
    try {
      const src = path.join(work, 'src');
      await fs.mkdir(src, { recursive: true });
      const files: Record<string, string> = {};
      for (const n of ['cover.pdf', 's1-report.pdf', 's1-protocol.pdf']) {
        files[n] = path.join(src, n);
        await fs.writeFile(files[n], pdf(n));
      }
      const leaves: EctdLeaf[] = [
        { ctdSection: '1.2', operation: 'new', sourcePath: files['cover.pdf'], fileName: 'cover.pdf', title: 'Cover' },
        { ctdSection: '5.3.5.1', operation: 'new', sourcePath: files['s1-report.pdf'], fileName: 's1-report.pdf', title: 'Study 1 report', studyId: 'STUDY-001', stfFileTag: 'study-report' },
        { ctdSection: '5.3.5.1', operation: 'new', sourcePath: files['s1-protocol.pdf'], fileName: 's1-protocol.pdf', title: 'Study 1 protocol', studyId: 'STUDY-001', stfFileTag: 'protocol-or-amendment' },
      ];
      const bundle = await packageEctdSubmission({
        region: 'fda', applicationId: '123456', sequence: '0000', submissionType: 'original',
        fda: { applicationType: 'nda' },
        sponsorId: 'D', sponsorName: 'S', productName: 'P', outputDir: path.join(work, 'out'),
        environment: 'staging', leaves,
      });
      const zip = await JSZip.loadAsync(await fs.readFile(bundle.path));
      const names = Object.keys(zip.files);
      expect(names).toContain('m5/5-3-5-1/study-001/stf-study-001.xml');
      expect(names).not.toContain('m5/5-3-5-1/study-001/stf.xml');

      const indexXml = await zip.file('index.xml')!.async('string');
      const idOf = (href: string): string => {
        const m = [...indexXml.matchAll(/<leaf [^>]*xlink:href="([^"]+)"[^>]*ID="([^"]+)"/g)].find(leaf => leaf[1] === href);
        expect(m, `index.xml leaf for ${href}`).toBeDefined();
        return m![2];
      };
      const reportId = idOf('m5/5-3-5-1/study-001/s1-report.pdf');
      const protocolId = idOf('m5/5-3-5-1/study-001/s1-protocol.pdf');
      const stfId = idOf('m5/5-3-5-1/study-001/stf-study-001.xml');
      expect(new Set([reportId, protocolId, stfId]).size).toBe(3);

      const stf = await zip.file('m5/5-3-5-1/study-001/stf-study-001.xml')!.async('string');
      expect(stf).toContain(`<doc-content xlink:href="../../../index.xml#${reportId}">`);
      expect(stf).toContain(`<doc-content xlink:href="../../../index.xml#${protocolId}">`);
      expect(stf).toContain('<study-id>STUDY-001</study-id>');
      expect(stf).not.toMatch(/<leaf[\s>]/);

      const md5 = await zip.file('util/index-md5.txt')!.async('string');
      expect(md5).toContain('m5/5-3-5-1/study-001/stf-study-001.xml');
    } finally {
      await fs.rm(work, { recursive: true, force: true });
    }
  }, 30000);

  it('refuses to package an .xpt study leaf tagged outside the 1735 list', async () => {
    const work = await fs.mkdtemp(path.join(os.tmpdir(), 'stf-1735-'));
    try {
      const src = path.join(work, 'src');
      await fs.mkdir(src, { recursive: true });
      const report = path.join(src, 'report.pdf');
      await fs.writeFile(report, pdf('r'));
      // The report is tagged correctly; a second leaf in the same study names an
      // .xpt with a free-text tag — the generator must refuse the whole package.
      const leaves: EctdLeaf[] = [
        { ctdSection: '5.3.5.1', operation: 'new', sourcePath: report, fileName: 'report.pdf', title: 'Report', studyId: 'study-001', stfFileTag: 'study-report' },
        { ctdSection: '5.3.5.1', operation: 'new', sourcePath: report, fileName: 'ts.xpt', title: 'TS', studyId: 'study-001', stfFileTag: 'datasets' },
      ];
      await expect(
        packageEctdSubmission({
          region: 'fda', applicationId: '123456', sequence: '0000', submissionType: 'original',
          fda: { applicationType: 'nda' },
          sponsorId: 'D', sponsorName: 'S', productName: 'P', outputDir: path.join(work, 'out'),
          environment: 'staging', leaves, skipPdfaConversion: true,
        }),
      ).rejects.toThrow(/1735/);
    } finally {
      await fs.rm(work, { recursive: true, force: true });
    }
  }, 30000);
});
