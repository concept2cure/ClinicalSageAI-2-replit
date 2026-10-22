/**
 * validateEctdPackage — the ZIP validator the eCTD export route runs, as its
 * fail-closed gate and on a caller-supplied package — checks the eCTD checksum
 * contract and the region's file rules.
 *
 * 2026-10-08 (W5/D7, sweep VP-4): it said it verified "the eCTD checksum
 * contract" and read only util/index-md5.txt, the platform's own manifest. The
 * contract (ICH eCTD v3.2.2) is index-md5.txt at the sequence root holding the
 * MD5 of index.xml, plus each <leaf>'s checksum of the file it references. A
 * package with a wrong root checksum, no root checksum, or a wrong leaf checksum
 * was reported valid; FDA's criteria treat each as a High-severity rejection.
 *
 * 2026-10-08 (sweeps VP-3, VP-7): it never read a PDF's version, a folder name or
 * a path's length. The region is read from the package's regional backbone.
 */
import { describe, it, expect, beforeAll } from 'vitest';
import { promises as fs } from 'fs';
import * as os from 'os';
import * as path from 'path';
import { createHash } from 'crypto';
import JSZip from 'jszip';
import { packageEctdSubmission, buildMd5Index, type EctdLeaf } from '../regional-packager';
import { validateEctdPackage } from '../ectd-structural-validator';

const md5 = (b: Buffer | string) => createHash('md5').update(b).digest('hex');
const pdf = (version: string, label: string) =>
  Buffer.from(`%PDF-${version}\n% ${label}\ntrailer<< /Root 1 0 R >>\n%%EOF\n`, 'utf8');

type Files = Map<string, Buffer>;

/** The real packager's FDA bundle, as a map of entry → bytes. */
async function realBundle(): Promise<Files> {
  const work = await fs.mkdtemp(path.join(os.tmpdir(), 'ectd-integrity-'));
  try {
    const bytes = pdf('1.7', 'control');
    const src = path.join(work, 'control.pdf');
    await fs.writeFile(src, bytes);
    const coverBytes = pdf('1.7', 'cover');
    const cover = path.join(work, 'cover.pdf');
    await fs.writeFile(cover, coverBytes);
    const leaves: EctdLeaf[] = [
      { operation: 'new', ctdSection: '1.2', fileName: 'cover.pdf', md5: md5(coverBytes), title: 'Cover Letter', sourcePath: cover },
      { operation: 'new', ctdSection: '3.2.S.4.2', fileName: 'control.pdf', md5: md5(bytes), title: 'Analytical Procedures', sourcePath: src },
    ];
    const bundle = await packageEctdSubmission({
      region: 'fda',
      applicationId: '000512',
      sequence: '0000',
      submissionType: 'original',
      fda: { applicationType: 'ind' },
      sponsorId: 'D',
      sponsorName: 'S',
      productName: 'P',
      outputDir: path.join(work, 'out'),
      environment: 'staging',
      leaves,
    });
    const zip = await JSZip.loadAsync(await fs.readFile(bundle.path));
    const files: Files = new Map();
    for (const name of Object.keys(zip.files).filter((f) => !zip.files[f].dir)) {
      files.set(name, await zip.file(name)!.async('nodebuffer'));
    }
    return files;
  } finally {
    await fs.rm(work, { recursive: true, force: true });
  }
}

/** Re-zip, recomputing the root checksum and the util manifest unless told not to. */
async function zipOf(files: Files, opts: { keepRoot?: boolean; keepUtil?: boolean } = {}): Promise<Buffer> {
  const out = new Map(files);
  if (!opts.keepRoot && out.has('index.xml') && out.has('index-md5.txt')) {
    out.set('index-md5.txt', Buffer.from(md5(out.get('index.xml')!)));
  }
  if (!opts.keepUtil && out.has('util/index-md5.txt')) {
    const entries = [...out.entries()]
      .filter(([name]) => name !== 'util/index-md5.txt' && name !== 'index-md5.txt')
      .map(([relPath, bytes]) => ({ relPath, md5: md5(bytes) }));
    out.set('util/index-md5.txt', Buffer.from(buildMd5Index(entries)));
  }
  const zip = new JSZip();
  for (const [name, bytes] of out) zip.file(name, bytes);
  return zip.generateAsync({ type: 'nodebuffer' });
}

const editText = (files: Files, name: string, edit: (s: string) => string) =>
  files.set(name, Buffer.from(edit(files.get(name)!.toString('utf8')), 'utf8'));

let base: Files;
beforeAll(async () => {
  base = await realBundle();
}, 60_000);

describe('validateEctdPackage — the eCTD checksum contract', () => {
  it('CONTROL: the real packager’s bundle is valid', async () => {
    const r = await validateEctdPackage(await zipOf(base, { keepRoot: true, keepUtil: true }));
    expect(r.errors).toEqual([]);
    expect(r.valid).toBe(true);
  });

  it('a root index-md5.txt that is not the MD5 of index.xml is an error', async () => {
    const files = new Map(base);
    files.set('index-md5.txt', Buffer.from('0'.repeat(32)));
    const r = await validateEctdPackage(await zipOf(files, { keepRoot: true }));
    expect(r.valid).toBe(false);
    expect(r.errors.join('\n')).toMatch(/index-md5\.txt records 0{32}, but the MD5 of index\.xml is/);
  });

  it('a missing root index-md5.txt is an error, and a malformed one is too', async () => {
    const missing = new Map(base);
    missing.delete('index-md5.txt');
    const r = await validateEctdPackage(await zipOf(missing));
    expect(r.valid).toBe(false);
    expect(r.errors.join('\n')).toMatch(/Missing required file: index-md5\.txt/);

    const malformed = new Map(base);
    malformed.set('index-md5.txt', Buffer.from('not a checksum'));
    const m = await validateEctdPackage(await zipOf(malformed, { keepRoot: true }));
    expect(m.errors.join('\n')).toMatch(/index-md5\.txt does not hold an MD5/);
  });

  it('an index.xml leaf checksum that does not match its file is an error, though root and util agree', async () => {
    const files = new Map(base);
    const leafHref = 'm3/3-2-s-4-2/control.pdf';
    const real = md5(files.get(leafHref) ?? Buffer.alloc(0));
    expect(files.get('index.xml')!.toString()).toContain(`checksum="${real}"`);
    editText(files, 'index.xml', (s) => s.replace(`checksum="${real}"`, `checksum="${'e'.repeat(32)}"`));
    const r = await validateEctdPackage(await zipOf(files));
    expect(r.valid).toBe(false);
    expect(r.errors.join('\n')).toMatch(new RegExp(`index\\.xml: checksum mismatch for "${leafHref}"`));
  });

  it('a regional backbone whose leaf checksum is wrong is an error, though index.xml, root and util agree', async () => {
    const files = new Map(base);
    const regional = files.get('m1/us/us-regional.xml')!.toString('utf8');
    const leafTag = /<leaf\b[^>]*checksum="([0-9a-f]{32})"[^>]*>/.exec(regional);
    expect(leafTag, 'the regional backbone carries a checksummed leaf').toBeTruthy();
    const oldRegionalMd5 = md5(files.get('m1/us/us-regional.xml')!);
    editText(files, 'm1/us/us-regional.xml', (s) => s.replace(leafTag![1], 'f'.repeat(32)));
    // Keep index.xml's checksum of the regional backbone true, so only the regional leaf is wrong.
    editText(files, 'index.xml', (s) => s.replace(oldRegionalMd5, md5(files.get('m1/us/us-regional.xml')!)));
    const r = await validateEctdPackage(await zipOf(files));
    expect(r.valid).toBe(false);
    expect(r.errors).toHaveLength(1);
    expect(r.errors[0]).toMatch(/^m1\/us\/us-regional\.xml: checksum mismatch for "/);
  });

  it('a leaf with no checksum, or one that is not md5, is an error', async () => {
    const files = new Map(base);
    const real = md5(files.get('m3/3-2-s-4-2/control.pdf')!);
    editText(files, 'index.xml', (s) => s.replace(`checksum="${real}" checksum-type="md5"`, `checksum="${real}" checksum-type="sha1"`));
    const r = await validateEctdPackage(await zipOf(files));
    expect(r.errors.join('\n')).toMatch(/checksum-type "sha1"; eCTD v3\.2\.2 requires md5/);

    const none = new Map(base);
    editText(none, 'index.xml', (s) => s.replace(`checksum="${real}" `, ''));
    const n = await validateEctdPackage(await zipOf(none));
    expect(n.errors.join('\n')).toMatch(/the leaf for "m3\/3-2-s-4-2\/control\.pdf" carries no checksum/);
  });

  it('with no util manifest, a wrong root checksum is still an error; the absent manifest stays a warning', async () => {
    const files = new Map(base);
    files.delete('util/index-md5.txt');
    files.set('index-md5.txt', Buffer.from('0'.repeat(32)));
    const r = await validateEctdPackage(await zipOf(files, { keepRoot: true }));
    expect(r.valid).toBe(false);
    expect(r.warnings.join('\n')).toMatch(/Missing util\/index-md5\.txt/);
  });
});

describe('validateEctdPackage — the region’s file rules', () => {
  it('a PDF outside the region’s accepted versions is an error (FDA: 1.4–1.7)', async () => {
    const files = new Map(base);
    const href = 'm3/3-2-s-4-2/control.pdf';
    const old = md5(files.get(href)!);
    files.set(href, pdf('1.3', 'control'));
    editText(files, 'index.xml', (s) => s.replace(old, md5(files.get(href)!)));
    const r = await validateEctdPackage(await zipOf(files));
    expect(r.valid).toBe(false);
    expect(r.errors.join('\n')).toMatch(new RegExp(`${href}: PDF version 1\\.3 is outside the FDA accepted range \\(PDF 1\\.4–1\\.7\\)`));
  });

  it('a multi-dot file name, an uppercase folder and a path over the region cap are errors', async () => {
    const files = new Map(base);
    const long = `m5/${Array.from({ length: 4 }, () => 'a'.repeat(60)).join('/')}/x.pdf`;
    files.set('m2/2-5/a.b.c.pdf', pdf('1.7', 'a'));
    files.set('m3/3-2-P-1/desc.pdf', pdf('1.7', 'b'));
    files.set(long, pdf('1.7', 'c'));
    const r = await validateEctdPackage(await zipOf(files));
    const text = r.errors.join('\n');
    expect(text).toMatch(/File name 'a\.b\.c\.pdf' breaks the eCTD file-name rule/);
    expect(text).toMatch(/Folder '3-2-P-1' in m3\/3-2-P-1\/desc\.pdf breaks the eCTD folder-name rule/);
    expect(text).toMatch(new RegExp(`Path ${long} is ${long.length} characters; FDA allows at most 230`));
  });

  it('a package that names no region says the version and path rules were not checked', async () => {
    const zip = new JSZip();
    zip.file('index.xml', '<?xml version="1.0"?><ectd:ectd xmlns:ectd="http://www.ich.org/ectd"></ectd:ectd>');
    zip.file('m2/2-5/old.pdf', pdf('1.3', 'x'));
    const r = await validateEctdPackage(await zip.generateAsync({ type: 'nodebuffer' }));
    expect(r.errors.join('\n')).not.toMatch(/PDF version/);
    expect(r.warnings.join('\n')).toMatch(/PDF versions and path lengths were not checked/);
  });
});
