/**
 * End-to-end lifecycle packaging (the payoff of the sequence-manifest work).
 *
 * Proves the whole chain on the canonical publisher: a prior sequence's stored
 * leaf manifest → computeLifecycleOperations → packageEctdSubmission produces a
 * sequence-0001 package whose index.xml carries the correct operation on every
 * leaf (new / replace / delete) with a cross-sequence modified-file pointer, and
 * whose ZIP contains bytes for the new/replaced leaves but NOT for the deleted
 * one (its file lives in the prior sequence).
 */

import { describe, it, expect } from 'vitest';
import { promises as fs } from 'fs';
import * as os from 'os';
import * as path from 'path';
import { createHash } from 'crypto';
import JSZip from 'jszip';
import { packageEctdSubmission, type EctdLeaf } from '../regional-packager';
import { computeLifecycleOperations } from '../../ectd/lifecycle-operator';
import {
  buildLeafManifest,
  manifestToPriorLeaves,
  computeSequencePrefix,
} from '../../ectd/sequence-manifest';

function pdf(label: string): Buffer {
  return Buffer.from(`%PDF-1.4\n% ${label}\ntrailer<< /Root 1 0 R >>\n%%EOF\n`, 'utf8');
}
const md5 = (b: Buffer) => createHash('md5').update(b).digest('hex');

describe('lifecycle packaging — manifest → operator → canonical packager', () => {
  it('emits new/replace/delete with modified-file, and omits the deleted leaf from the ZIP', async () => {
    const work = await fs.mkdtemp(path.join(os.tmpdir(), 'ectd-lifecycle-'));
    try {
      // --- New sequence (0001) content on disk: a changed doc + a brand-new doc.
      const generalBytes = pdf('general v2'); // replaces the prior general
      const newDocBytes = pdf('brand new stability doc');
      const generalPath = path.join(work, 'general.pdf');
      const newDocPath = path.join(work, 'stability.pdf');
      await fs.writeFile(generalPath, generalBytes);
      await fs.writeFile(newDocPath, newDocBytes);

      // --- Prior sequence (0000) manifest, as it would have been stored.
      const priorManifest = buildLeafManifest([
        { ctdSection: '3.2.S.1', href: 'm3/3-2-s-1/general.pdf', md5: 'PRIOR_GENERAL_V1' },
        { ctdSection: '3.2.S.2', href: 'm3/3-2-s-2/old-manufacture.pdf', md5: 'PRIOR_OLD' },
      ]);
      const prior = manifestToPriorLeaves(priorManifest);

      // --- Desired leaves for 0001 (real files; general changed, old-manufacture dropped).
      const desired = [
        {
          ctdSection: '3.2.S.1', fileName: 'general.pdf', md5: md5(generalBytes),
          title: 'Drug Substance — General Information', sourcePath: generalPath,
        },
        {
          ctdSection: '3.2.S.3', fileName: 'stability.pdf', md5: md5(newDocBytes),
          title: 'Drug Substance — Stability', sourcePath: newDocPath,
        },
      ];

      const life = computeLifecycleOperations(prior, desired, {
        priorSequencePrefix: computeSequencePrefix('0000'),
      });
      // Sanity: operator produced exactly the expected shape.
      expect(life.summary).toMatchObject({ new: 1, replace: 1, delete: 1, unchanged: 0 });

      // --- Package the computed leaves through the canonical publisher.
      const bundle = await packageEctdSubmission({
        region: 'fda', applicationId: '123456', sequence: '0001', submissionType: 'original',
        sponsorId: 'D', sponsorName: 'S', productName: 'P', outputDir: path.join(work, 'out'),
        environment: 'staging', leaves: life.leaves as EctdLeaf[],
      });

      const zip = await JSZip.loadAsync(await fs.readFile(bundle.path));
      const names = Object.keys(zip.files);
      const index = await zip.file('index.xml')!.async('string');

      // replace: the changed general doc, pointing modified-file at the prior file.
      expect(index).toMatch(
        /<leaf operation="replace" modified-file="\.\.\/0000\/m3\/3-2-s-1\/general\.pdf"[^>]*>/,
      );
      // new: the brand-new stability doc, no modified-file.
      expect(index).toMatch(/<leaf operation="new"(?![^>]*modified-file)[^>]*stability\.pdf/);
      // delete: the withdrawn doc, pointing modified-file at the prior file.
      expect(index).toMatch(
        /<leaf operation="delete" modified-file="\.\.\/0000\/m3\/3-2-s-2\/old-manufacture\.pdf"/,
      );

      // The new + replaced leaves ship real bytes; the deleted one ships NONE.
      expect(names.some((n) => n.endsWith('general.pdf'))).toBe(true);
      expect(names.some((n) => n.endsWith('stability.pdf'))).toBe(true);
      expect(names.some((n) => n.includes('old-manufacture.pdf'))).toBe(false);

      // The delete leaf contributes no line to the MD5 integrity manifest.
      const md5Index = await zip.file('util/index-md5.txt')!.async('string');
      expect(md5Index).not.toContain('old-manufacture.pdf');
      expect(md5Index).toContain('general.pdf');
    } finally {
      await fs.rm(work, { recursive: true, force: true });
    }
  });

  it('packages a bytes-less delete (empty sourcePath) without crashing and ships no file for it', async () => {
    const work = await fs.mkdtemp(path.join(os.tmpdir(), 'ectd-lifecycle-del-'));
    try {
      // A pure backbone-only delete: no new bytes, points at the prior file.
      const leaves: EctdLeaf[] = [
        {
          ctdSection: '3.2.S.2', operation: 'delete', sourcePath: '', fileName: 'old.pdf',
          title: 'Old', md5: 'abc', modifiedFile: '../0000/m3/3-2-s-2/old.pdf',
        },
      ];
      const bundle = await packageEctdSubmission({
        region: 'fda', applicationId: '123456', sequence: '0001', submissionType: 'original',
        sponsorId: 'D', sponsorName: 'S', productName: 'P', outputDir: path.join(work, 'out'),
        environment: 'staging', leaves,
      });
      const zip = await JSZip.loadAsync(await fs.readFile(bundle.path));
      const index = await zip.file('index.xml')!.async('string');
      expect(index).toMatch(/<leaf operation="delete" modified-file="\.\.\/0000\/m3\/3-2-s-2\/old\.pdf"/);
      // No bytes shipped for a backbone-only delete.
      expect(Object.keys(zip.files).some((n) => n.endsWith('old.pdf'))).toBe(false);
    } finally {
      await fs.rm(work, { recursive: true, force: true });
    }
  });
});
