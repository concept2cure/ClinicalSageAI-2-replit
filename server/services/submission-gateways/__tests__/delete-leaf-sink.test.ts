/**
 * A withdrawal ships no bytes, at the one sink every path reaches.
 *
 * 2026-09-23 (W5/D7, round-2 skeptic). packageEctdSubmission treated a
 * `delete` leaf that carried a sourcePath as an ordinary file: it read the
 * bytes, wrote them into THIS sequence, checksummed them and pointed the
 * delete's xlink:href at the new in-sequence copy — with no modified-file, so
 * nothing named the filed leaf being withdrawn. The AnA tool
 * package_ectd_for_region mapped {operation:'delete', source_path} straight
 * into that shape. The lifecycle operator had been fixed; the sink had not.
 *
 * Now the packager refuses, naming the leaf:
 *   - a delete that carries a sourcePath (a withdrawal has no content), and
 *   - outside sequence 0000, a delete with no modifiedFile (a withdrawal must
 *     say which filed leaf it withdraws).
 * A backbone-only delete with a modified-file pointer still packages, with no
 * file, no checksum line and no bytes of its own.
 *
 * 2026-09-23 (W5/D7, round-2 skeptic, second pass): sequence 0000 was exempt
 * from the modified-file rule, so a delete in a first sequence — where nothing
 * is on file to withdraw — packaged with checksum="" and an xlink:href at a
 * file absent from the zip. Every delete in 0000 is now refused
 * (LEAF-DELETE-IN-FIRST-SEQUENCE), and every other delete must name its
 * modified-file.
 */
import { describe, it, expect } from 'vitest';
import { promises as fs } from 'fs';
import * as os from 'os';
import * as path from 'path';
import JSZip from 'jszip';
import { packageEctdSubmission, type EctdLeaf } from '../regional-packager';

const pdf = (l: string) => Buffer.from(`%PDF-1.4\n% ${l}\ntrailer<< /Root 1 0 R >>\n%%EOF\n`, 'utf8');

async function pkg(work: string, sequence: string, leaves: EctdLeaf[]) {
  return packageEctdSubmission({
    region: 'fda', applicationId: '123456', sequence, submissionType: 'original',
    fda: { applicationType: 'ind' }, sponsorId: 'D', sponsorName: 'S', productName: 'P',
    outputDir: path.join(work, 'out'), environment: 'staging', leaves,
  });
}

async function withWork<T>(fn: (work: string, cover: string, withdrawn: string) => Promise<T>): Promise<T> {
  const work = await fs.mkdtemp(path.join(os.tmpdir(), 'del-sink-'));
  try {
    const cover = path.join(work, 'cover.pdf');
    const withdrawn = path.join(work, 'old-manufacture.pdf');
    await fs.writeFile(cover, pdf('cover'));
    await fs.writeFile(withdrawn, pdf('WITHDRAWN DOCUMENT BYTES'));
    return await fn(work, cover, withdrawn);
  } finally {
    await fs.rm(work, { recursive: true, force: true });
  }
}

describe('packageEctdSubmission — a delete leaf never ships bytes', () => {
  it('refuses a delete that carries a sourcePath, naming the leaf (the AnA tool mapping)', async () => {
    await withWork(async (work, cover, withdrawn) => {
      const run = pkg(work, '0001', [
        {
          ctdSection: '3.2.S.2', operation: 'delete', sourcePath: withdrawn, fileName: 'old-manufacture.pdf',
          title: 'Old Manufacture', modifiedFile: '../0000/m3/3-2-s-2/old-manufacture.pdf',
        },
        { ctdSection: '1.2', operation: 'new', sourcePath: cover, fileName: 'cover.pdf', title: 'Cover' },
      ]);
      await expect(run).rejects.toThrow(/old-manufacture\.pdf/);
      await expect(run).rejects.toThrow(/delete/i);
      await expect(run).rejects.toMatchObject({
        findings: [expect.objectContaining({ ruleId: 'LEAF-DELETE-CARRIES-BYTES' })],
      });
      // Nothing was written: the refusal comes before any archive exists.
      const out = await fs.readdir(path.join(work, 'out')).catch(() => [] as string[]);
      expect(out.filter((f) => f.endsWith('.zip'))).toEqual([]);
    });
  });

  it('refuses a delete in a follow-up sequence that names no modified-file', async () => {
    await withWork(async (work, cover) => {
      const run = pkg(work, '0001', [
        { ctdSection: '3.2.S.2', operation: 'delete', sourcePath: '', fileName: 'old-manufacture.pdf', title: 'Old Manufacture' },
        { ctdSection: '1.2', operation: 'new', sourcePath: cover, fileName: 'cover.pdf', title: 'Cover' },
      ]);
      await expect(run).rejects.toThrow(/old-manufacture\.pdf/);
      await expect(run).rejects.toMatchObject({
        findings: [expect.objectContaining({ ruleId: 'LEAF-DELETE-NO-MODIFIED-FILE' })],
      });
    });
  });

  it('packages a backbone-only delete with a modified-file: no file, no checksum line, href at the filed copy', async () => {
    await withWork(async (work, cover) => {
      const bundle = await pkg(work, '0001', [
        {
          ctdSection: '3.2.S.2', operation: 'delete', sourcePath: '', fileName: 'old-manufacture.pdf',
          title: 'Old Manufacture', md5: 'c'.repeat(32), modifiedFile: '../0000/m3/3-2-s-2/old-manufacture.pdf',
        },
        { ctdSection: '1.2', operation: 'new', sourcePath: cover, fileName: 'cover.pdf', title: 'Cover' },
      ]);
      const zip = await JSZip.loadAsync(await fs.readFile(bundle.path));
      const files = Object.keys(zip.files).filter((f) => !zip.files[f].dir);
      expect(files.some((f) => f.endsWith('old-manufacture.pdf'))).toBe(false);
      const xml = (await zip.file('index.xml')?.async('string')) ?? '';
      const del = (xml.match(/<leaf[^>]*operation="delete"[^>]*>/) ?? [''])[0];
      expect(del).toContain('modified-file="../0000/m3/3-2-s-2/old-manufacture.pdf"');
      expect(del).toContain('xlink:href="../0000/m3/3-2-s-2/old-manufacture.pdf"');
      const manifestDelete = (bundle.leafManifest ?? []).find((m) => m.operation === 'delete');
      expect(manifestDelete?.href).toBe('../0000/m3/3-2-s-2/old-manufacture.pdf');
    });
  });

  it('refuses any delete in sequence 0000, where nothing is on file to withdraw', async () => {
    await withWork(async (work, cover) => {
      for (const modifiedFile of [undefined, '../0000/m3/3-2-s-2/ghost.pdf']) {
        const run = pkg(work, '0000', [
          { ctdSection: '3.2.S.2', operation: 'delete', sourcePath: '', fileName: 'ghost.pdf', title: 'Ghost',
            ...(modifiedFile ? { modifiedFile } : {}) },
          { ctdSection: '1.2', operation: 'new', sourcePath: cover, fileName: 'cover.pdf', title: 'Cover' },
        ]);
        await expect(run).rejects.toThrow(/ghost\.pdf/);
        await expect(run).rejects.toMatchObject({
          findings: [expect.objectContaining({ ruleId: 'LEAF-DELETE-IN-FIRST-SEQUENCE' })],
        });
      }
      const out = await fs.readdir(path.join(work, 'out')).catch(() => [] as string[]);
      expect(out.filter((f) => f.endsWith('.zip'))).toEqual([]);
    });
  });
});
