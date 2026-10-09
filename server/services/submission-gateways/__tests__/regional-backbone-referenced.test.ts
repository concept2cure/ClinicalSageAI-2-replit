/**
 * index.xml references the regional Module 1 backbone.
 *
 * ── The defect ────────────────────────────────────────────────────────────────
 * buildIndexXml emitted Modules 2-5 only. The regional backbone
 * (m1/us/us-regional.xml, which carries every Module 1 document — an IND's Form
 * FDA 1571 among them) was written into the package, checksummed into
 * util/index-md5.txt, and referenced by nothing in index.xml. In an ICH eCTD
 * v3.2.2 sequence the ICH backbone reaches Module 1 through a leaf under
 * m1-administrative-information-and-prescribing-information pointing at the
 * regional XML, with that file's MD5, so a reader of index.xml — a reviewer's
 * tool, the ICH stylesheet, an agency validator — saw a sequence with no Module
 * 1 at all.
 *
 * The in-repo validator already knew the heading ("regional content itself
 * lives in the regional backbone; the ICH DTD defines this element for m1
 * references"); only the emitter never wrote it. The agency validator run on
 * the exported package is the final word on the backbone's structure.
 */
import { describe, it, expect } from 'vitest';
import { promises as fs } from 'fs';
import * as os from 'os';
import * as path from 'path';
import { createHash } from 'crypto';
import JSZip from 'jszip';
import { packageEctdSubmission, type EctdLeaf } from '../regional-packager';
import { validateDtdConformance } from '../../ectd/ectd-validator-hardening';

const pdf = (label: string) => Buffer.from(`%PDF-1.4\n% ${label}\ntrailer<< /Root 1 0 R >>\n%%EOF\n`, 'utf8');
const md5 = (b: Buffer | string) => createHash('md5').update(b).digest('hex');

const REGIONS: Array<{ region: 'fda' | 'ema' | 'pmda' | 'ca'; backbone: string }> = [
  { region: 'fda', backbone: 'm1/us/us-regional.xml' },
  { region: 'ema', backbone: 'm1/eu/eu-regional.xml' },
  { region: 'pmda', backbone: 'm1/jp/jp-regional.xml' },
  { region: 'ca', backbone: 'm1/ca/ca-regional.xml' },
];

async function packageOne(region: (typeof REGIONS)[number]['region'], work: string) {
  const bytes = pdf('control');
  const src = path.join(work, 'control.pdf');
  await fs.writeFile(src, bytes);
  const leaves: EctdLeaf[] = [
    { operation: 'new', ctdSection: '3.2.S.4.2', fileName: 'control.pdf', md5: md5(bytes), title: 'Analytical Procedures', sourcePath: src },
  ];
  const bundle = await packageEctdSubmission({
    region,
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
  return JSZip.loadAsync(await fs.readFile(bundle.path));
}

describe('index.xml references the regional Module 1 backbone', () => {
  for (const { region, backbone } of REGIONS) {
    it(`${region}: a leaf under the ICH Module 1 heading points at ${backbone} with its real MD5`, async () => {
      const work = await fs.mkdtemp(path.join(os.tmpdir(), `ectd-m1-ref-${region}-`));
      try {
        const zip = await packageOne(region, work);
        const index = (await zip.file('index.xml')?.async('string')) ?? '';
        const regional = await zip.file(backbone)?.async('string');
        expect(regional, `${backbone} missing from the package`).toBeTruthy();

        const m1 = /<m1-administrative-information-and-prescribing-information>([\s\S]*?)<\/m1-administrative-information-and-prescribing-information>/.exec(index);
        expect(m1, 'index.xml has no Module 1 heading').toBeTruthy();
        const leaves = [...m1![1].matchAll(/<leaf\b([^>]*)>/g)].map((x) => x[1]);
        expect(leaves).toHaveLength(1);
        const attr = (name: string) => new RegExp(`${name}="([^"]*)"`).exec(leaves[0])?.[1];
        expect(attr('xlink:href')).toBe(backbone);
        expect(attr('checksum')).toBe(md5(regional!));
        expect(attr('checksum-type')).toBe('md5');
        expect(attr('operation')).toBe('new');
        // Module 1 precedes Module 2 in the backbone, as the ICH heading order has it.
        expect(index.indexOf('<m1-administrative')).toBeLessThan(index.indexOf('<m3-quality'));
      } finally {
        await fs.rm(work, { recursive: true, force: true });
      }
    });
  }

  it('the in-repo DTD-conformance layer accepts the referenced backbone', async () => {
    const work = await fs.mkdtemp(path.join(os.tmpdir(), 'ectd-m1-ref-dtd-'));
    try {
      const zip = await packageOne('fda', work);
      const index = (await zip.file('index.xml')?.async('string')) ?? '';
      const errors = validateDtdConformance(index, []).filter((f) => f.severity === 'error');
      expect(errors).toEqual([]);
    } finally {
      await fs.rm(work, { recursive: true, force: true });
    }
  });
});
