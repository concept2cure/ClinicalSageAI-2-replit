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

      // --- Desired leaves for 0001 (real files; general changed, old-manufacture
      // WITHDRAWN by declaration). A leaf merely absent from a follow-up sequence
      // is unchanged and still on file; only a declared withdrawal is a delete.
      const desired = [
        {
          ctdSection: '3.2.S.1', fileName: 'general.pdf', md5: md5(generalBytes),
          title: 'Drug Substance — General Information', sourcePath: generalPath,
        },
        {
          ctdSection: '3.2.S.3', fileName: 'stability.pdf', md5: md5(newDocBytes),
          title: 'Drug Substance — Stability', sourcePath: newDocPath,
        },
        {
          ctdSection: '3.2.S.2', fileName: 'old-manufacture.pdf', md5: '',
          title: 'Drug Substance — Manufacture (withdrawn)', sourcePath: '', withdraw: true,
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
        fda: { applicationType: 'nda' }, // a package must declare what it is; this used to default to NDA silently
        sponsorId: 'D', sponsorName: 'S', productName: 'P', outputDir: path.join(work, 'out'),
        environment: 'staging', leaves: life.leaves as EctdLeaf[],
      });

      const zip = await JSZip.loadAsync(await fs.readFile(bundle.path));
      const names = Object.keys(zip.files);
      const index = await zip.file('index.xml')!.async('string');

      // Pull each leaf element out of the backbone so the exact ICH lifecycle
      // convention (which href points where) is pinned, not just "contains".
      const leafFor = (file: string) =>
        index.match(new RegExp(`<leaf\\b[^>]*${file.replace('.', '\\.')}[^>]*>`))?.[0] ?? '';
      const hrefOf = (el: string) => /xlink:href="([^"]*)"/.exec(el)?.[1] ?? '';
      const modOf = (el: string) => /modified-file="([^"]*)"/.exec(el)?.[1] ?? '';

      // REPLACE: ships the NEW file (xlink:href is THIS sequence's own path, not
      // "../"), and modified-file points BACK at the prior sequence's copy.
      const replaceLeaf = leafFor('general.pdf');
      expect(replaceLeaf).toMatch(/operation="replace"/);
      expect(hrefOf(replaceLeaf)).not.toMatch(/^\.\.\//); // current-sequence path
      expect(hrefOf(replaceLeaf)).toMatch(/general\.pdf$/);
      expect(modOf(replaceLeaf)).toBe('../0000/m3/3-2-s-1/general.pdf');

      // NEW: a first-time leaf carries NO modified-file and ships at its own path.
      const newLeaf = leafFor('stability.pdf');
      expect(newLeaf).toMatch(/operation="new"/);
      expect(newLeaf).not.toMatch(/modified-file=/);
      expect(hrefOf(newLeaf)).not.toMatch(/^\.\.\//);

      // DELETE: no new bytes — both xlink:href AND modified-file point at the
      // prior sequence's withdrawn file.
      const deleteLeaf = leafFor('old-manufacture.pdf');
      expect(deleteLeaf).toMatch(/operation="delete"/);
      expect(modOf(deleteLeaf)).toBe('../0000/m3/3-2-s-2/old-manufacture.pdf');
      expect(hrefOf(deleteLeaf)).toBe('../0000/m3/3-2-s-2/old-manufacture.pdf');

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

  it('exposes a per-sequence leafManifest that round-trips into prior leaves for lifecycle diffing', async () => {
    const { manifestToPriorLeaves, buildLeafManifest } = await import('../../ectd/sequence-manifest');
    const work = await fs.mkdtemp(path.join(os.tmpdir(), 'ectd-manifest-'));
    try {
      const docPath = path.join(work, 'general.pdf');
      await fs.writeFile(docPath, pdf('general'));
      const bundle = await packageEctdSubmission({
        region: 'fda', applicationId: 'IND000009', sequence: '0000', submissionType: 'IND',
        sponsorId: 'IND000009', sponsorName: 'Sponsor', productName: 'Product',
        outputDir: path.join(work, 'out'), environment: 'staging',
        leaves: [{
          ctdSection: '3.2.S.1', operation: 'new', sourcePath: docPath, fileName: 'general.pdf',
          title: 'Drug Substance — General Information', md5: md5(pdf('general')),
        }],
      });
      // The packager exposes the shipped leaf's section + final href + md5.
      expect(Array.isArray(bundle.leafManifest)).toBe(true);
      const leafManifest = bundle.leafManifest ?? [];
      const entry = leafManifest.find((l) => l.ctdSection === '3.2.S.1')!;
      expect(entry).toBeTruthy();
      expect(entry.href).toMatch(/^m3\/.+general\.pdf$/);
      expect(entry.md5).toBe(md5(pdf('general')));
      // Round-trips: this is exactly what ectd-compile persists as leaf_manifest,
      // and what the NEXT sequence loads to compute replace/append/delete.
      const priors = manifestToPriorLeaves(buildLeafManifest(leafManifest));
      expect(priors.find((p) => p.ctdSection === '3.2.S.1')?.md5).toBe(md5(pdf('general')));
    } finally {
      await fs.rm(work, { recursive: true, force: true });
    }
  });

  it('hashes the shipped bytes for the manifest, ignoring a wrong caller-supplied leaf.md5', async () => {
    const work = await fs.mkdtemp(path.join(os.tmpdir(), 'ectd-md5-'));
    try {
      const bytes = pdf('the real content that ships');
      const docPath = path.join(work, 'general.pdf');
      await fs.writeFile(docPath, bytes);
      const bundle = await packageEctdSubmission({
        region: 'fda', applicationId: 'IND000009', sequence: '0000', submissionType: 'IND',
        sponsorId: 'IND000009', sponsorName: 'Sponsor', productName: 'Product',
        outputDir: path.join(work, 'out'), environment: 'staging',
        skipPdfaConversion: true, // shipped bytes == raw, so md5(bytes) is exact
        leaves: [{
          ctdSection: '3.2.S.1', operation: 'new', sourcePath: docPath, fileName: 'general.pdf',
          title: 'Drug Substance — General Information',
          // A STALE/WRONG pre-computed checksum. Before the fix this value was
          // written into index-md5.txt verbatim, not matching the shipped bytes.
          md5: 'deadbeefdeadbeefdeadbeefdeadbeef',
        }],
      });
      const zip = await JSZip.loadAsync(await fs.readFile(bundle.path));
      const md5Index = await zip.file('util/index-md5.txt')!.async('string');
      expect(md5Index).toContain(md5(bytes));
      expect(md5Index).not.toContain('deadbeefdeadbeefdeadbeefdeadbeef');
      // The exposed leaf manifest is likewise the real hash.
      expect((bundle.leafManifest ?? [])[0]?.md5).toBe(md5(bytes));
    } finally {
      await fs.rm(work, { recursive: true, force: true });
    }
  });

  it('writes the ICH-required root index-md5.txt = MD5(index.xml) on the canonical packager', async () => {
    const work = await fs.mkdtemp(path.join(os.tmpdir(), 'ectd-rootmd5-'));
    try {
      const docPath = path.join(work, 'general.pdf');
      await fs.writeFile(docPath, pdf('general'));
      const bundle = await packageEctdSubmission({
        region: 'fda',
        applicationId: 'IND000001',
        sequence: '0000',
        submissionType: 'IND',
        sponsorId: 'IND000001',
        sponsorName: 'Sponsor',
        productName: 'Product',
        outputDir: path.join(work, 'out'),
        environment: 'staging',
        leaves: [
          {
            ctdSection: '3.2.S.1', operation: 'new', sourcePath: docPath, fileName: 'general.pdf',
            title: 'Drug Substance — General Information', md5: md5(pdf('general')),
          },
        ],
      });
      const zip = await JSZip.loadAsync(await fs.readFile(bundle.path));
      const indexXml = await zip.file('index.xml')!.async('string');
      // Root file present and equal to the bare MD5 of index.xml (FDA eValidator
      // rejects a sequence whose root index-md5.txt is missing/mismatched).
      const rootMd5 = await zip.file('index-md5.txt')!.async('string');
      expect(rootMd5).toBe(createHash('md5').update(indexXml).digest('hex'));
      // The util/ full-file manifest still ships alongside it.
      expect(zip.file('util/index-md5.txt')).not.toBeNull();
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
        fda: { applicationType: 'nda' }, // a package must declare what it is; this used to default to NDA silently
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
