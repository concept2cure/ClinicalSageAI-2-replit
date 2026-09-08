/**
 * Cross-reference enforcement in the regional packager.
 *
 * The PURE resolver (cross-reference-resolver.ts) was only reachable via the AnA
 * tool; the packager now runs it over declared intra-package hyperlinks and
 * surfaces / (opt-in) blocks on broken ones.
 */

import { describe, it, expect } from 'vitest';
import { promises as fs } from 'fs';
import * as os from 'os';
import * as path from 'path';
import { packageEctdSubmission, type EctdLeaf } from '../regional-packager';
import type { CrossReference } from '../../ectd/cross-reference-resolver';

function pdf(l: string): Buffer { return Buffer.from(`%PDF-1.4\n% ${l}\n%%EOF\n`, 'utf8'); }

async function pkg(work: string, opts: {
  crossReferences?: CrossReference[];
  deleteTarget?: boolean;
  env?: Record<string, string>;
}) {
  const src = path.join(work, 'src');
  await fs.mkdir(src, { recursive: true });
  for (const n of ['summary.pdf', 'study.pdf']) await fs.writeFile(path.join(src, n), pdf(n));
  const leaves: EctdLeaf[] = [
    { ctdSection: '2.7.3', operation: 'new', sourcePath: path.join(src, 'summary.pdf'), fileName: 'summary.pdf', title: 'Clinical Summary' },
    { ctdSection: '5.3.5.1', operation: opts.deleteTarget ? 'delete' : 'new', sourcePath: path.join(src, 'study.pdf'), fileName: 'study.pdf', title: 'Study Report' },
  ];
  const prevEnv: Record<string, string | undefined> = {};
  for (const [k, v] of Object.entries(opts.env ?? {})) { prevEnv[k] = process.env[k]; process.env[k] = v; }
  try {
    return await packageEctdSubmission({
      region: 'fda', applicationId: '1', sequence: '0000', submissionType: 'original',
      fda: { applicationType: 'nda' }, // a package must declare what it is; this used to default to NDA silently
      sponsorId: 'D', sponsorName: 'S', productName: 'P', outputDir: path.join(work, 'out'),
      environment: 'production', leaves, crossReferences: opts.crossReferences,
    });
  } finally {
    for (const [k, v] of Object.entries(prevEnv)) { if (v === undefined) delete process.env[k]; else process.env[k] = v; }
  }
}

describe('cross-reference enforcement in packageEctdSubmission', () => {
  it('resolves a valid reference and reports it on the bundle', async () => {
    const work = await fs.mkdtemp(path.join(os.tmpdir(), 'xref-ok-'));
    try {
      const b = await pkg(work, { crossReferences: [{ source: '2.7.3', target: '5.3.5.1', label: 'cites study' }] });
      expect(b.crossReferenceStatus).toEqual({ resolved: 1, broken: [], ok: true });
    } finally { await fs.rm(work, { recursive: true, force: true }); }
  }, 30000);

  it('flags a dangling reference (TARGET_NOT_FOUND) but does not block by default', async () => {
    const work = await fs.mkdtemp(path.join(os.tmpdir(), 'xref-dangle-'));
    try {
      const b = await pkg(work, { crossReferences: [{ source: '2.7.3', target: '5.3.5.99', label: 'bad' }] });
      expect(b.crossReferenceStatus?.ok).toBe(false);
      expect(b.crossReferenceStatus?.broken[0]).toMatchObject({ target: '5.3.5.99', reason: 'TARGET_NOT_FOUND' });
    } finally { await fs.rm(work, { recursive: true, force: true }); }
  }, 30000);

  it('flags a reference to a withdrawn (delete) target as TARGET_DELETED', async () => {
    const work = await fs.mkdtemp(path.join(os.tmpdir(), 'xref-del-'));
    try {
      const b = await pkg(work, { deleteTarget: true, crossReferences: [{ source: '2.7.3', target: '5.3.5.1' }] });
      expect(b.crossReferenceStatus?.broken[0]).toMatchObject({ reason: 'TARGET_DELETED' });
    } finally { await fs.rm(work, { recursive: true, force: true }); }
  }, 30000);

  it('blocks a production build with a broken reference when ECTD_REQUIRE_XREF=true', async () => {
    const work = await fs.mkdtemp(path.join(os.tmpdir(), 'xref-block-'));
    try {
      await expect(
        pkg(work, { crossReferences: [{ source: '2.7.3', target: 'nope' }], env: { ECTD_REQUIRE_XREF: 'true' } }),
      ).rejects.toThrow(/broken cross-reference/);
    } finally { await fs.rm(work, { recursive: true, force: true }); }
  }, 30000);

  it('is a no-op when no cross-references are declared', async () => {
    const work = await fs.mkdtemp(path.join(os.tmpdir(), 'xref-none-'));
    try {
      const b = await pkg(work, {});
      expect(b.crossReferenceStatus).toBeUndefined();
    } finally { await fs.rm(work, { recursive: true, force: true }); }
  }, 30000);
});
