/**
 * The convergence adapter (packageLeafBytes) must produce the CANONICAL
 * conformant eCTD package — the same one the compile/export/sign path produces —
 * from already-rendered leaf bytes. This is what the agency-transmit path routes
 * through instead of the flat, non-conformant buildECTDZip.
 */
import { describe, it, expect } from 'vitest';
import { promises as fs } from 'fs';
import os from 'os';
import path from 'path';
import crypto from 'crypto';
import JSZip from 'jszip';
import { packageLeafBytes } from '../package-leaf-bytes';

const pdf = (label: string) =>
  Buffer.from(`%PDF-1.4\n% ${label}\ntrailer<< /Root 1 0 R >>\n%%EOF\n`, 'utf8');

describe('packageLeafBytes — canonical conformant packaging', () => {
  it('produces a real <ectd:ectd> tree (not flat <ectd:index>), regional M1, and root index-md5', async () => {
    const outputDir = await fs.mkdtemp(path.join(os.tmpdir(), 'plb-out-'));
    try {
      const bundle = await packageLeafBytes({
        region: 'fda',
        applicationId: 'IND123456',
        sequence: '0000',
        submissionType: 'original',
        sponsorId: 'SPON-1',
        sponsorName: 'Acme Bio',
        productName: 'Compound X',
        environment: 'staging',
        outputDir,
        leaves: [
          { ctdSection: '3.2.S.1', fileName: 'drug-substance.pdf', bytes: pdf('DS'), title: 'Drug Substance General' },
          { ctdSection: '3.2.P.1', fileName: 'drug-product.pdf', bytes: pdf('DP'), title: 'Drug Product Description' },
        ],
      });

      expect(bundle.sha256).toMatch(/^[0-9a-f]{64}$/);
      expect(bundle.sizeBytes).toBeGreaterThan(0);

      const zip = await JSZip.loadAsync(await fs.readFile(bundle.path));
      const indexXml = await zip.file('index.xml')!.async('string');

      // Conformant ICH root + nested module tree — NOT the flat <ectd:index>
      // buildECTDZip emitted.
      expect(indexXml).toContain('<ectd:ectd');
      expect(indexXml).not.toContain('<ectd:index');
      expect(indexXml).toContain('<m3-quality>');
      expect(indexXml).toContain('<m3-2-s-drug-substance>');
      expect(indexXml).toContain('<m3-2-p-drug-product>');
      expect(indexXml).toMatch(/<!DOCTYPE ectd:ectd SYSTEM "[^"]*ich-ectd-3-2\.dtd">/);
      expect(indexXml).toContain('checksum-type="md5"');

      // Root index-md5.txt = MD5(index.xml) — the ICH requirement.
      const rootMd5 = await zip.file('index-md5.txt')!.async('string');
      expect(rootMd5).toBe(crypto.createHash('md5').update(indexXml).digest('hex'));

      // Regional Module 1 backbone present (FDA us-regional).
      expect(Object.keys(zip.files).some((n) => /m1\/us\/us-regional\.xml$/.test(n))).toBe(true);
    } finally {
      await fs.rm(outputDir, { recursive: true, force: true });
    }
  });

  it('places deep sub-section granularity under its nearest ICH heading (does not reject normal content)', async () => {
    // The convergence must not reject real submissions: a leaf at a deeper CTD
    // granularity than the DTD's deepest heading (e.g. 3.2.S.4.2) is nested under
    // its ancestor container, not dropped — so routing transmit through the
    // canonical packager won't refuse ordinary content.
    const outputDir = await fs.mkdtemp(path.join(os.tmpdir(), 'plb-out2-'));
    try {
      const bundle = await packageLeafBytes({
        region: 'fda', applicationId: 'IND1', sequence: '0000', submissionType: 'original',
        sponsorId: 'S', sponsorName: 'S', productName: 'P', environment: 'staging', outputDir,
        leaves: [{ ctdSection: '3.2.S.4.2', fileName: 'controls.pdf', bytes: pdf('c'), title: 'Control of DS' }],
      });
      const zip = await JSZip.loadAsync(await fs.readFile(bundle.path));
      const indexXml = await zip.file('index.xml')!.async('string');
      expect(indexXml).toContain('<ectd:ectd');
      expect(indexXml).toContain('<m3-2-s-drug-substance>');
    } finally {
      await fs.rm(outputDir, { recursive: true, force: true });
    }
  });
});

describe('packageLeafBytes — lifecycle operations after sequence 0000', () => {
  it('refuses a follow-up sequence whose leaves carry no operation, rather than filing them all as new', async () => {
    // The primitive hardcoded operation:'new' for every leaf whatever the
    // sequence. A caller transmitting 0002 filed each leaf as brand-new with no
    // modified-file, so the versions those leaves superseded stayed current at
    // the agency alongside them.
    const outputDir = await fs.mkdtemp(path.join(os.tmpdir(), 'plb-out3-'));
    try {
      await expect(
        packageLeafBytes({
          region: 'fda', applicationId: 'IND123456', sequence: '0002', submissionType: 'original',
          sponsorId: 'SPON-1', sponsorName: 'Acme Bio', productName: 'Compound X', environment: 'staging', outputDir,
          leaves: [{ ctdSection: '3.2.S.1', fileName: 'drug-substance.pdf', bytes: pdf('DS v3'), title: 'Drug Substance General' }],
        }),
      ).rejects.toThrow(/Sequence 0002 cannot be packaged without a lifecycle operation/);
    } finally {
      await fs.rm(outputDir, { recursive: true, force: true });
    }
  });

  it('carries a supplied operation and modified-file into the backbone', async () => {
    const outputDir = await fs.mkdtemp(path.join(os.tmpdir(), 'plb-out4-'));
    try {
      const bundle = await packageLeafBytes({
        region: 'fda', applicationId: 'IND123456', sequence: '0002', submissionType: 'original',
        sponsorId: 'SPON-1', sponsorName: 'Acme Bio', productName: 'Compound X', environment: 'staging', outputDir,
        leaves: [{
          ctdSection: '3.2.S.1', fileName: 'drug-substance.pdf', bytes: pdf('DS v3'), title: 'Drug Substance General',
          operation: 'replace', modifiedFile: '../0001/m3/32-body-data/32s-drug-sub/drug-substance.pdf',
        }],
      });
      const zip = await JSZip.loadAsync(await fs.readFile(bundle.path));
      const indexXml = await zip.file('index.xml')!.async('string');
      expect(indexXml).toMatch(/operation="replace"/);
      expect(indexXml).toContain('../0001/m3/32-body-data/32s-drug-sub/drug-substance.pdf');
      expect(indexXml).not.toMatch(/operation="new"/);
    } finally {
      await fs.rm(outputDir, { recursive: true, force: true });
    }
  });
});
