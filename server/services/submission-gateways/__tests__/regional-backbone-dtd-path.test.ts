/**
 * Regional backbone DOCTYPE — the DTD reference must resolve inside the package.
 *
 * ── The defect ────────────────────────────────────────────────────────────────
 * Every regional Module 1 backbone is written two levels deep
 * (m1/us/us-regional.xml, m1/eu/eu-regional.xml, …) while the vendored DTDs are
 * bundled at the sequence root (util/dtd/). The four backbones declared
 * `SYSTEM "../util/dtd/<file>"`, which from m1/<cc>/ resolves to m1/util/dtd/ —
 * a folder no package contains. FDA's own example us-regional.xml climbs two
 * levels (`../../util/dtd/`). Nothing caught it because no DTD has been
 * vendored yet: the DTD gate ran in report-only mode and xmllint never had a
 * file to fail to find. The moment the licensed DTDs are dropped in, every
 * regional backbone would have failed validation.
 *
 * This test does not need the DTDs. It resolves the DOCTYPE SYSTEM path from
 * the backbone's own location in the ZIP and requires it to land on
 * util/dtd/<file> at the root — the place dtd-bundler writes to.
 */
import { describe, it, expect } from 'vitest';
import { promises as fs } from 'fs';
import * as os from 'os';
import * as path from 'path';
import { createHash } from 'crypto';
import JSZip from 'jszip';
import { packageEctdSubmission, type EctdLeaf } from '../regional-packager';

function pdf(label: string): Buffer {
  return Buffer.from(`%PDF-1.4\n% ${label}\ntrailer<< /Root 1 0 R >>\n%%EOF\n`, 'utf8');
}
const md5 = (b: Buffer) => createHash('md5').update(b).digest('hex');

/** Resolve a SYSTEM path the way an XML parser does: relative to the document. */
function resolveSystemPath(backbonePath: string, systemPath: string): string {
  return path.posix.normalize(path.posix.join(path.posix.dirname(backbonePath), systemPath));
}

const REGIONS: Array<{ region: 'fda' | 'ema' | 'pmda' | 'ca'; backbone: string; dtd: string }> = [
  { region: 'fda', backbone: 'm1/us/us-regional.xml', dtd: 'us-regional-v3-3.dtd' },
  { region: 'ema', backbone: 'm1/eu/eu-regional.xml', dtd: 'eu-regional.dtd' },
  { region: 'pmda', backbone: 'm1/jp/jp-regional.xml', dtd: 'jp-regional.dtd' },
  { region: 'ca', backbone: 'm1/ca/ca-regional.xml', dtd: 'ca-regional.dtd' },
];

describe('regional backbone DOCTYPE resolves to the bundled util/dtd/ folder', () => {
  it('the resolver itself distinguishes one level from two (the check is not vacuous)', () => {
    expect(resolveSystemPath('m1/us/us-regional.xml', '../util/dtd/x.dtd')).toBe('m1/util/dtd/x.dtd');
    expect(resolveSystemPath('m1/us/us-regional.xml', '../../util/dtd/x.dtd')).toBe('util/dtd/x.dtd');
  });

  for (const { region, backbone, dtd } of REGIONS) {
    it(`${region}: ${backbone} points its DTD at util/dtd/${dtd}`, async () => {
      const work = await fs.mkdtemp(path.join(os.tmpdir(), `ectd-dtd-path-${region}-`));
      try {
        const bytes = pdf('general');
        const src = path.join(work, 'general.pdf');
        await fs.writeFile(src, bytes);
        const leaves: EctdLeaf[] = [
          {
            operation: 'new',
            ctdSection: '3.2.S.1',
            fileName: 'general.pdf',
            md5: md5(bytes),
            title: 'Drug Substance — General Information',
            sourcePath: src,
          },
        ];
        const bundle = await packageEctdSubmission({
          region,
          applicationId: '123456',
          sequence: '0000',
          submissionType: 'original',
          fda: { applicationType: 'nda' }, // a package must declare what it is; this used to default to NDA silently
          sponsorId: 'D',
          sponsorName: 'S',
          productName: 'P',
          outputDir: path.join(work, 'out'),
          environment: 'staging',
          leaves,
        });
        const zip = await JSZip.loadAsync(await fs.readFile(bundle.path));
        const xml = await zip.file(backbone)?.async('string');
        expect(xml, `${backbone} missing from the package`).toBeTruthy();
        const m = /<!DOCTYPE[^>]*SYSTEM\s+"([^"]+)"/.exec(xml!);
        expect(m, `${backbone} has no DOCTYPE SYSTEM reference`).toBeTruthy();
        expect(resolveSystemPath(backbone, m![1])).toBe(`util/dtd/${dtd}`);
      } finally {
        await fs.rm(work, { recursive: true, force: true });
      }
    });
  }

  it('the ICH index.xml at the root references util/dtd/ directly', async () => {
    const work = await fs.mkdtemp(path.join(os.tmpdir(), 'ectd-dtd-path-index-'));
    try {
      const bytes = pdf('general');
      const src = path.join(work, 'general.pdf');
      await fs.writeFile(src, bytes);
      const bundle = await packageEctdSubmission({
        region: 'fda',
        applicationId: '123456',
        sequence: '0000',
        submissionType: 'original',
        fda: { applicationType: 'nda' }, // a package must declare what it is; this used to default to NDA silently
        sponsorId: 'D',
        sponsorName: 'S',
        productName: 'P',
        outputDir: path.join(work, 'out'),
        environment: 'staging',
        leaves: [
          {
            operation: 'new',
            ctdSection: '3.2.S.1',
            fileName: 'general.pdf',
            md5: md5(bytes),
            title: 'General',
            sourcePath: src,
          },
        ],
      });
      const zip = await JSZip.loadAsync(await fs.readFile(bundle.path));
      const index = await zip.file('index.xml')!.async('string');
      const m = /<!DOCTYPE[^>]*SYSTEM\s+"([^"]+)"/.exec(index);
      expect(m).toBeTruthy();
      expect(resolveSystemPath('index.xml', m![1])).toBe('util/dtd/ich-ectd-3-2.dtd');
    } finally {
      await fs.rm(work, { recursive: true, force: true });
    }
  });
});

/**
 * ── The same defect, one line down ───────────────────────────────────────────
 * The FDA backbone's DOCTYPE was corrected to climb two levels; the
 * <?xml-stylesheet?> processing instruction on the very next line still said
 * `../util/style/us-regional.xsl`, which from m1/us/ lands on m1/util/style/ —
 * a folder no package contains. index.xml carried no stylesheet PI at all, and
 * nothing bundled *.xsl into the package. eValidator flags a backbone that
 * references a stylesheet the package does not ship, and WO-9 Click 4 requires
 * index.xml to open in a browser through the ICH stylesheet.
 *
 * None of this needs the real stylesheets: the PI href is resolved from the
 * backbone's own location, and bundling is exercised with stand-in *.xsl files
 * through the same drop-point the DTDs use ($ECTD_DTD_DIR).
 */
describe('stylesheet references resolve to the bundled util/style/ folder', () => {
  async function packageOne(work: string, region: 'fda' | 'ema') {
    const bytes = pdf('general');
    const src = path.join(work, 'general.pdf');
    await fs.writeFile(src, bytes);
    const bundle = await packageEctdSubmission({
      region,
      applicationId: '123456',
      sequence: '0000',
      submissionType: 'original',
      fda: { applicationType: 'nda' },
      sponsorId: 'D',
      sponsorName: 'S',
      productName: 'P',
      outputDir: path.join(work, 'out'),
      environment: 'staging',
      leaves: [
        { operation: 'new', ctdSection: '3.2.S.1', fileName: 'general.pdf', md5: md5(bytes), title: 'General', sourcePath: src },
      ],
    });
    return JSZip.loadAsync(await fs.readFile(bundle.path));
  }
  const piHref = (xml: string) => /<\?xml-stylesheet[^>]*href="([^"]+)"/.exec(xml)?.[1];

  it('fda: m1/us/us-regional.xml points its stylesheet at util/style/us-regional.xsl', async () => {
    const work = await fs.mkdtemp(path.join(os.tmpdir(), 'ectd-xsl-path-fda-'));
    try {
      const zip = await packageOne(work, 'fda');
      const xml = await zip.file('m1/us/us-regional.xml')!.async('string');
      const href = piHref(xml);
      expect(href, 'us-regional.xml has no stylesheet PI').toBeTruthy();
      expect(resolveSystemPath('m1/us/us-regional.xml', href!)).toBe('util/style/us-regional.xsl');
    } finally {
      await fs.rm(work, { recursive: true, force: true });
    }
  });

  it('the ICH index.xml carries a stylesheet PI that resolves to util/style/ectd-2-0.xsl', async () => {
    const work = await fs.mkdtemp(path.join(os.tmpdir(), 'ectd-xsl-path-index-'));
    try {
      const zip = await packageOne(work, 'fda');
      const index = await zip.file('index.xml')!.async('string');
      const href = piHref(index);
      expect(href, 'index.xml has no stylesheet PI').toBeTruthy();
      expect(resolveSystemPath('index.xml', href!)).toBe('util/style/ectd-2-0.xsl');
      // The PI must sit in the prolog after the XML declaration, before the root.
      expect(index.indexOf('<?xml-stylesheet')).toBeGreaterThan(index.indexOf('<?xml '));
      expect(index.indexOf('<?xml-stylesheet')).toBeLessThan(index.indexOf('<ectd:ectd'));
    } finally {
      await fs.rm(work, { recursive: true, force: true });
    }
  });

  it('bundles vendored *.xsl into util/style/ and checksums them into the MD5 index', async () => {
    const work = await fs.mkdtemp(path.join(os.tmpdir(), 'ectd-xsl-bundle-'));
    const drop = path.join(work, 'drop');
    await fs.mkdir(drop);
    await fs.writeFile(path.join(drop, 'ectd-2-0.xsl'), '<xsl:stylesheet version="1.0"/>');
    await fs.writeFile(path.join(drop, 'us-regional.xsl'), '<xsl:stylesheet version="1.0"/>');
    const previous = process.env.ECTD_DTD_DIR;
    process.env.ECTD_DTD_DIR = drop;
    try {
      const zip = await packageOne(work, 'fda');
      expect(zip.file('util/style/ectd-2-0.xsl'), 'ICH stylesheet not bundled').toBeTruthy();
      expect(zip.file('util/style/us-regional.xsl'), 'FDA stylesheet not bundled').toBeTruthy();
      const md5Index = zip.file('util/index-md5.txt');
      expect(md5Index, 'no util/index-md5.txt in package').toBeTruthy();
      const listing = await md5Index!.async('string');
      expect(listing).toContain('util/style/ectd-2-0.xsl');
      expect(listing).toContain('util/style/us-regional.xsl');
    } finally {
      if (previous === undefined) delete process.env.ECTD_DTD_DIR;
      else process.env.ECTD_DTD_DIR = previous;
      await fs.rm(work, { recursive: true, force: true });
    }
  });
});
