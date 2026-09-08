/**
 * The canonical packager refuses an encrypted/secured PDF leaf. The eCTD PDF
 * specification prohibits security settings outright; the detection existed
 * (classifyPdfA) but reached the packager only as a warning string that
 * finalizeLeafBytes discarded, so a secured leaf shipped indistinguishable
 * from any other unconverted PDF.
 */
import { describe, it, expect } from 'vitest';
import { promises as fs } from 'fs';
import * as os from 'os';
import * as path from 'path';
import { createHash } from 'crypto';
import { packageEctdSubmission, type EctdLeaf } from '../regional-packager';
import { computeLifecycleOperations } from '../../ectd/lifecycle-operator';
import { computeSequencePrefix } from '../../ectd/sequence-manifest';

const md5 = (b: Buffer) => createHash('md5').update(b).digest('hex');
const plainPdf = Buffer.from('%PDF-1.4\n% plain\ntrailer<< /Root 1 0 R >>\n%%EOF\n', 'utf8');
const securedPdf = Buffer.from('%PDF-1.4\n% secured\ntrailer<< /Root 1 0 R /Encrypt 5 0 R >>\n%%EOF\n', 'utf8');

async function packageWith(work: string, leaves: Array<{ fileName: string; bytes: Buffer; ctdSection: string; title: string }>) {
  const desired = [];
  for (const l of leaves) {
    const p = path.join(work, l.fileName);
    await fs.writeFile(p, l.bytes);
    desired.push({ ctdSection: l.ctdSection, fileName: l.fileName, md5: md5(l.bytes), title: l.title, sourcePath: p });
  }
  const life = computeLifecycleOperations([], desired, { priorSequencePrefix: computeSequencePrefix('0000') });
  return packageEctdSubmission({
    region: 'fda', applicationId: '123456', sequence: '0000', submissionType: 'original',
    fda: { applicationType: 'nda' },
    sponsorId: 'D', sponsorName: 'S', productName: 'P', outputDir: path.join(work, 'out'),
    environment: 'staging', leaves: life.leaves as EctdLeaf[],
  });
}

describe('regional packager — encrypted leaves', () => {
  it('refuses to package a leaf that carries an /Encrypt dictionary, naming the leaf', async () => {
    const work = await fs.mkdtemp(path.join(os.tmpdir(), 'ectd-encrypted-'));
    try {
      await expect(packageWith(work, [
        { fileName: 'general.pdf', bytes: plainPdf, ctdSection: '3.2.S.1', title: 'General Information' },
        { fileName: 'secured.pdf', bytes: securedPdf, ctdSection: '3.2.S.3', title: 'Secured Doc' },
      ])).rejects.toThrow(/secured\.pdf.*encrypted\/secured PDF/);
    } finally {
      await fs.rm(work, { recursive: true, force: true });
    }
  });

  it('packages the same set without the secured leaf', async () => {
    const work = await fs.mkdtemp(path.join(os.tmpdir(), 'ectd-encrypted-'));
    try {
      const bundle = await packageWith(work, [
        { fileName: 'general.pdf', bytes: plainPdf, ctdSection: '3.2.S.1', title: 'General Information' },
      ]);
      expect(bundle.path).toBeTruthy();
    } finally {
      await fs.rm(work, { recursive: true, force: true });
    }
  });
});
