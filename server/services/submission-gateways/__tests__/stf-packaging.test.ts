/**
 * STF (Study Tagging File) cross-linking in the regional packager (audit gap G5).
 *
 * Proves that M4/M5 study leaves generate a per-study stf-<study-id>.xml, placed in the
 * study's folder, referenced in index.xml, checksummed in index-md5.txt, and
 * cross-linked to exactly that study's leaves.
 */

import { describe, it, expect } from 'vitest';
import { promises as fs } from 'fs';
import * as os from 'os';
import * as path from 'path';
import JSZip from 'jszip';
import { packageEctdSubmission, studyFolderSlug, commonDir, type EctdLeaf } from '../regional-packager';

function pdf(label: string): Buffer {
  return Buffer.from(`%PDF-1.4\n% ${label}\ntrailer<< /Root 1 0 R >>\n%%EOF\n`, 'utf8');
}

async function build(work: string): Promise<JSZip> {
  const src = path.join(work, 'src');
  await fs.mkdir(src, { recursive: true });
  const files: Record<string, string> = {};
  for (const n of ['cover.pdf', 's1-report.pdf', 's1-crf.pdf', 's2-report.pdf']) {
    const p = path.join(src, n);
    await fs.writeFile(p, pdf(n));
    files[n] = p;
  }
  const leaves: EctdLeaf[] = [
    { ctdSection: '1.2', operation: 'new', sourcePath: files['cover.pdf'], fileName: 'cover.pdf', title: 'Cover' },
    { ctdSection: '5.3.5.1', operation: 'new', sourcePath: files['s1-report.pdf'], fileName: 's1-report.pdf', title: 'Study 1 report', studyId: 'STUDY-001', stfFileTag: 'study-report-body' },
    { ctdSection: '5.3.5.1', operation: 'new', sourcePath: files['s1-crf.pdf'], fileName: 's1-crf.pdf', title: 'Study 1 CRF', studyId: 'STUDY-001', stfFileTag: 'sample-crf' },
    { ctdSection: '5.3.5.1', operation: 'new', sourcePath: files['s2-report.pdf'], fileName: 's2-report.pdf', title: 'Study 2 report', studyId: 'STUDY-002', stfFileTag: 'study-report-body' },
  ];
  const bundle = await packageEctdSubmission({
    region: 'fda', applicationId: '123456', sequence: '0000', submissionType: 'original',
    fda: { applicationType: 'nda' }, // a package must declare what it is; this used to default to NDA silently
    sponsorId: 'D', sponsorName: 'S', productName: 'P', outputDir: path.join(work, 'out'),
    environment: 'staging', leaves,
    studyMeta: [{ studyId: 'STUDY-001', studyTitle: 'Pivotal efficacy', studyCategory: 'clinical-study-report' }],
  });
  expect(bundle.stf).toEqual({ studies: 2, leaves: 3, untagged: 0 });
  return JSZip.loadAsync(await fs.readFile(bundle.path));
}

describe('helpers', () => {
  it('slugifies study ids to folder-safe names', () => {
    expect(studyFolderSlug('STUDY-001')).toBe('study-001');
    expect(studyFolderSlug('ABC/123 (x)')).toBe('abc-123-x');
  });
  it('computes the common directory of package paths', () => {
    expect(commonDir(['m5/5-3-5-1/study-001/a.pdf', 'm5/5-3-5-1/study-001/b.pdf'])).toBe('m5/5-3-5-1/study-001');
    expect(commonDir(['m5/5-3-5-1/a.pdf'])).toBe('m5/5-3-5-1');
  });
});

describe('STF cross-linking in packageEctdSubmission', () => {
  it('generates a per-study stf-<study-id>.xml in each study folder, cross-linked to that study\'s leaves', async () => {
    const work = await fs.mkdtemp(path.join(os.tmpdir(), 'stf-test-'));
    try {
      const zip = await build(work);
      const names = Object.keys(zip.files);

      // One stf-<study-id>.xml per study (ICH STF v2.6.1), in the study's own folder.
      expect(names).toContain('m5/5-3-5-1/study-001/stf-study-001.xml');
      expect(names).toContain('m5/5-3-5-1/study-002/stf-study-002.xml');

      // Each doc-content points at its leaf's ID in index.xml and holds the file-tag.
      const indexXml = await zip.file('index.xml')!.async('string');
      const idOf = (href: string) => {
        const leaf = [...indexXml.matchAll(/<leaf [^>]*xlink:href="([^"]+)"[^>]*ID="([^"]+)"/g)].find(match => match[1] === href);
        expect(leaf, `index.xml leaf for ${href}`).toBeDefined();
        return leaf![2];
      };
      const stf1 = await zip.file('m5/5-3-5-1/study-001/stf-study-001.xml')!.async('string');
      expect(stf1).toContain('<study-id>STUDY-001</study-id>');
      expect(stf1).toContain('<title>Pivotal efficacy</title>');
      expect(stf1).toContain(`xlink:href="../../../index.xml#${idOf('m5/5-3-5-1/study-001/s1-report.pdf')}"`);
      expect(stf1).toContain(`xlink:href="../../../index.xml#${idOf('m5/5-3-5-1/study-001/s1-crf.pdf')}"`);
      expect(stf1).toContain('<file-tag name="study-report-body" info-type="ich"/>');
      expect(stf1).toContain('<file-tag name="sample-crf" info-type="ich"/>');
      expect(stf1).not.toContain('s2-report'); // no cross-study leakage

      // Study 2's STF is separate and references only its leaf.
      const stf2 = await zip.file('m5/5-3-5-1/study-002/stf-study-002.xml')!.async('string');
      expect(stf2).toContain('<study-id>STUDY-002</study-id>');
      expect(stf2).toContain(`xlink:href="../../../index.xml#${idOf('m5/5-3-5-1/study-002/s2-report.pdf')}"`);

      // Each STF is referenced as a leaf in index.xml (not an orphan file).
      expect(indexXml).toContain('m5/5-3-5-1/study-001/stf-study-001.xml');
      expect(indexXml).toContain('m5/5-3-5-1/study-002/stf-study-002.xml');

      // Each STF is checksummed in the MD5 manifest.
      const md5 = await zip.file('util/index-md5.txt')!.async('string');
      expect(md5).toContain('m5/5-3-5-1/study-001/stf-study-001.xml');
      expect(md5).toContain('m5/5-3-5-1/study-002/stf-study-002.xml');
    } finally {
      await fs.rm(work, { recursive: true, force: true });
    }
  }, 30000);

  it('is a no-op when there are no study leaves (bundle.stf undefined)', async () => {
    const work = await fs.mkdtemp(path.join(os.tmpdir(), 'stf-none-'));
    try {
      const src = path.join(work, 'src');
      await fs.mkdir(src, { recursive: true });
      await fs.writeFile(path.join(src, 'cover.pdf'), pdf('cover'));
      const bundle = await packageEctdSubmission({
        region: 'fda', applicationId: '1', sequence: '0000', submissionType: 'original',
        fda: { applicationType: 'nda' }, // a package must declare what it is; this used to default to NDA silently
        sponsorId: 'D', sponsorName: 'S', productName: 'P', outputDir: path.join(work, 'out'),
        environment: 'staging',
        leaves: [{ ctdSection: '1.2', operation: 'new', sourcePath: path.join(src, 'cover.pdf'), fileName: 'cover.pdf', title: 'Cover' }],
      });
      expect(bundle.stf).toBeUndefined();
    } finally {
      await fs.rm(work, { recursive: true, force: true });
    }
  }, 30000);
});
