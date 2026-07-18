import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { promises as fs } from 'fs';
import path from 'path';
import os from 'os';
import { createHash } from 'crypto';
import JSZip from 'jszip';
import {
  buildTechnicalFilePlan,
  materializeTechnicalFile,
} from '../technical-file-packager';
import type { TechnicalFileManifest } from '../../technical-file-manifest';
import type { CoreLeaf } from '../../../ectd/core-to-packager';

// A minimal MDR manifest with two sections that have sources + one required-missing.
function makeManifest(): TechnicalFileManifest {
  return {
    regulation: 'mdr',
    framework: 'EU MDR 2017/745',
    productName: 'Acme Cardiac Monitor',
    manufacturer: 'Acme Medical',
    generatedFrom: 'canonical-core',
    ready: false,
    totals: { sections: 3, requiredPresent: 2, requiredMissing: 1 },
    entries: [
      { path: '03-annex-ii/device-description', id: 'device-description', label: 'Device description', annex: 'Annex II 1', required: true, status: 'present', sources: ['1'] },
      { path: '03-annex-ii/gspr', id: 'gspr', label: 'GSPR checklist', annex: 'Annex I', required: true, status: 'present', sources: ['2'] },
      { path: '03-annex-ii/clinical-evaluation', id: 'clinical-evaluation', label: 'Clinical Evaluation Report', annex: 'Annex XIV', required: true, status: 'missing', sources: [] },
    ],
  };
}

const leaves: CoreLeaf[] = [
  { sectionCode: '1', title: 'Device description', lifecycleOp: 'new' },
  { sectionCode: '2', title: 'GSPR checklist', lifecycleOp: 'new' },
];

let tmpDir: string;
const fileBytes: Record<string, Buffer> = {
  '1': Buffer.from('DEVICE DESCRIPTION CONTENT'),
  '2': Buffer.from('GSPR CHECKLIST CONTENT'),
};

beforeAll(async () => {
  tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'tf-pkg-'));
  await fs.writeFile(path.join(tmpDir, 'desc.pdf'), fileBytes['1']);
  await fs.writeFile(path.join(tmpDir, 'gspr.pdf'), fileBytes['2']);
});

afterAll(async () => {
  await fs.rm(tmpDir, { recursive: true, force: true });
});

// Resolver maps a leaf to its on-disk temp file (and an MD5 over its bytes).
function resolveFile(leaf: CoreLeaf) {
  if (leaf.sectionCode === '1') return { fileName: 'desc.pdf', sourcePath: path.join(tmpDir, 'desc.pdf'), md5: createHash('md5').update(fileBytes['1']).digest('hex') };
  if (leaf.sectionCode === '2') return { fileName: 'gspr.pdf', sourcePath: path.join(tmpDir, 'gspr.pdf') };
  return null;
}

describe('materializeTechnicalFile (end-to-end ZIP emission)', () => {
  it('plans, writes a real ZIP, and the ZIP round-trips with manifest + files + checksums', async () => {
    const plan = buildTechnicalFilePlan({ manifest: makeManifest(), leaves, resolveFile });
    // The missing clinical-evaluation section has no source → not a placed file.
    expect(plan.files).toHaveLength(2);

    const bundle = await materializeTechnicalFile(plan, { outputDir: tmpDir, applicationId: 'APP-001' });

    // Bundle metadata is honest + content-addressed.
    expect(bundle.fileCount).toBe(2);
    expect(bundle.sizeBytes).toBeGreaterThan(0);
    expect(bundle.sha256).toMatch(/^[a-f0-9]{64}$/);
    expect(bundle.path).toMatch(/APP-001-technical-file-mdr\.zip$/);

    // The ZIP exists and unzips.
    const zipBytes = await fs.readFile(bundle.path);
    expect(zipBytes.subarray(0, 2).toString('latin1')).toBe('PK'); // ZIP magic
    const zip = await JSZip.loadAsync(zipBytes);

    // Contains the manifest TOC, checksum index, and both placed files at Annex paths.
    expect(zip.file('manifest.json')).not.toBeNull();
    expect(zip.file('checksums.md5.txt')).not.toBeNull();
    expect(zip.file('03-annex-ii/device-description/desc.pdf')).not.toBeNull();
    expect(zip.file('03-annex-ii/gspr/gspr.pdf')).not.toBeNull();

    // Placed file content matches the source bytes (true round-trip).
    const descOut = await zip.file('03-annex-ii/device-description/desc.pdf')!.async('nodebuffer');
    expect(descOut.equals(fileBytes['1'])).toBe(true);

    // manifest.json round-trips to the same manifest.
    const manifestOut = JSON.parse(await zip.file('manifest.json')!.async('string'));
    expect(manifestOut.regulation).toBe('mdr');
    expect(manifestOut.entries).toHaveLength(3);

    // checksum index lists every placed file + the manifest.
    const checksums = await zip.file('checksums.md5.txt')!.async('string');
    expect(checksums).toMatch(/manifest\.json/);
    expect(checksums).toMatch(/desc\.pdf/);
    expect(checksums).toMatch(/gspr\.pdf/);
  });

  it('is content-addressed: identical input yields the same sha256', async () => {
    const plan1 = buildTechnicalFilePlan({ manifest: makeManifest(), leaves, resolveFile });
    const plan2 = buildTechnicalFilePlan({ manifest: makeManifest(), leaves, resolveFile });
    const b1 = await materializeTechnicalFile(plan1, { outputDir: tmpDir, applicationId: 'APP-002' });
    const b2 = await materializeTechnicalFile(plan2, { outputDir: tmpDir, applicationId: 'APP-002' });
    expect(b1.sha256).toBe(b2.sha256);
  });

  it('pins every entry (files AND implicit folders) to a fixed epoch — no wall-clock timestamps', async () => {
    // Regression guard for the determinism flake: JSZip stamps the directory
    // entries it auto-creates for nested paths with `new Date()`, not the
    // per-file date, so two runs straddling the DOS 2-second boundary produced
    // different hashes. Deterministically catch a leak (no boundary needed) by
    // asserting NO entry carries a wall-clock (current-year) timestamp.
    const plan = buildTechnicalFilePlan({ manifest: makeManifest(), leaves, resolveFile });
    const bundle = await materializeTechnicalFile(plan, { outputDir: tmpDir, applicationId: 'APP-003' });
    const zip = await JSZip.loadAsync(await fs.readFile(bundle.path));
    const entries = Object.values(zip.files);
    expect(entries.length).toBeGreaterThan(0);
    const leaked = entries.filter((e) => e.date.getFullYear() !== 1980).map((e) => e.name);
    expect(leaked).toEqual([]);
  });

  it('reports skipped sources for leaves with no resolvable file', async () => {
    const manifest = makeManifest();
    // Add a section whose source leaf resolves to null.
    manifest.entries.push({ path: '03-annex-ii/extra', id: 'extra', label: 'Extra', annex: 'Annex II 9', required: false, status: 'optional-absent', sources: ['99'] });
    const plan = buildTechnicalFilePlan({
      manifest,
      leaves: [...leaves, { sectionCode: '99', title: 'Extra', lifecycleOp: 'new' }],
      resolveFile,
    });
    expect(plan.skipped.some((s) => s.sectionId === 'extra')).toBe(true);
    const bundle = await materializeTechnicalFile(plan, { outputDir: tmpDir, applicationId: 'APP-003' });
    expect(bundle.skippedCount).toBeGreaterThan(0);
  });
});
