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

/*
 * 2026-09-22 (W5/D7). The packager judged security only for a name ending
 * .pdf, and through a windowed scan that missed a trailer at 513-575 KB. And it
 * refused the official Form FDA 1571 — FDA-secured, and to be submitted with
 * FDA's own security settings — so no IND sequence carrying its m1.1
 * transmittal form could be packaged.
 */
import { generateIndForm } from '../../ind-forms/ind-form-fill-service';

function securedOfSize(size: number): Buffer {
  const head = '%PDF-1.4\n1 0 obj<</Type/Catalog>>endobj\n2 0 obj<</Length 0>>stream\n';
  const tail = '\nendstream\nendobj\ntrailer<</Root 1 0 R/Encrypt 5 0 R>>\n%%EOF\n';
  return Buffer.concat([Buffer.from(head, 'latin1'), Buffer.alloc(size - head.length - tail.length, 0x41), Buffer.from(tail, 'latin1')]);
}

describe('regional packager — leaf security judged on the bytes', () => {
  it('refuses a secured 540 KB leaf (trailer past the head window, before the tail window)', async () => {
    const work = await fs.mkdtemp(path.join(os.tmpdir(), 'ectd-encrypted-'));
    try {
      await expect(packageWith(work, [
        { fileName: 'band.pdf', bytes: securedOfSize(540 * 1024), ctdSection: '3.2.S.3', title: 'Band' },
      ])).rejects.toThrow(/band\.pdf.*encrypted\/secured PDF/);
    } finally {
      await fs.rm(work, { recursive: true, force: true });
    }
  });

  it('refuses secured PDF bytes shipped under a non-.pdf name', async () => {
    const work = await fs.mkdtemp(path.join(os.tmpdir(), 'ectd-encrypted-'));
    try {
      await expect(packageWith(work, [
        { fileName: 'secured.xpt', bytes: Buffer.concat([Buffer.from('\n'), securedPdf]), ctdSection: '3.2.S.3', title: 'Renamed' },
      ])).rejects.toThrow(/secured\.xpt.*encrypted\/secured PDF/);
    } finally {
      await fs.rm(work, { recursive: true, force: true });
    }
  });

  it('packages a filled official Form FDA 1571 at m1.1 byte-for-byte, as FDA issued it', async () => {
    const work = await fs.mkdtemp(path.join(os.tmpdir(), 'ectd-form-'));
    try {
      const form = await generateIndForm('FDA_1571', {
        sponsorName: 'Concept2Cure Biopharma, Inc.', indNumber: '162045', serialNumber: '0000',
        drugName: 'C2C-1042 capsules', indication: 'Plaque psoriasis',
      } as never);
      expect(form.usedOfficialTemplate).toBe(true);
      const bytes = Buffer.from(form.pdfBytes);
      const bundle = await packageWith(work, [
        { fileName: 'form-fda-1571.pdf', bytes, ctdSection: '1.1.1', title: 'Form FDA 1571' },
      ]);
      const JSZip = (await import('jszip')).default;
      const zip = await JSZip.loadAsync(await fs.readFile(bundle.path));
      const shipped = Object.values(zip.files).find((f) => f.name.endsWith('form-fda-1571.pdf'));
      expect(shipped).toBeDefined();
      expect(md5(await shipped!.async('nodebuffer'))).toBe(md5(bytes));
      expect(bundle.submissionGrade?.agencyFormsAsIssued).toEqual(['form-fda-1571.pdf']);
      expect(bundle.submissionGrade?.notConverted).toEqual([]);
    } finally {
      await fs.rm(work, { recursive: true, force: true });
    }
  });
});
