/**
 * Tests for the device technical-file packager — proves the plan maps leaves to
 * Annex II/III paths and that materialization produces a real, well-formed ZIP.
 */
import { describe, it, expect, afterAll } from 'vitest';
import { promises as fs } from 'fs';
import path from 'path';
import os from 'os';
import JSZip from 'jszip';
import { assembleTechDoc } from '../mdr-ivdr/tech-doc-assembler';
import { buildTechnicalFileManifest } from '../technical-file-manifest';
import {
  buildTechnicalFilePlan,
  materializeTechnicalFile,
} from '../mdr-ivdr/technical-file-packager';
import type { CoreLeaf, ResolvedFile } from '../../ectd/core-to-packager';

const tmpDirs: string[] = [];
async function tmp(): Promise<string> {
  const d = await fs.mkdtemp(path.join(os.tmpdir(), 'techfile-'));
  tmpDirs.push(d);
  return d;
}
afterAll(async () => {
  await Promise.all(tmpDirs.map((d) => fs.rm(d, { recursive: true, force: true })));
});

/** A leaf that matches the MDR GSPR section + a real temp source file. */
async function gsprLeafWithFile(srcDir: string): Promise<{ leaf: CoreLeaf; resolved: ResolvedFile }> {
  const sourcePath = path.join(srcDir, 'gspr.pdf');
  await fs.writeFile(sourcePath, 'GSPR checklist content');
  return {
    leaf: { sectionCode: 'gspr.checklist', title: 'GSPR Checklist', lifecycleOp: 'new' },
    resolved: { fileName: 'gspr.pdf', sourcePath },
  };
}

describe('buildTechnicalFilePlan', () => {
  it('places a matched leaf at its Annex section path and reports nothing skipped for it', () => {
    const manifest = buildTechnicalFileManifest(
      assembleTechDoc({ regulation: 'mdr', leaves: [{ sectionCode: 'gspr.checklist', title: 'GSPR Checklist', documentType: 'gspr' }] })
    );
    const leaf: CoreLeaf = { sectionCode: 'gspr.checklist', title: 'GSPR Checklist', lifecycleOp: 'new' };
    const plan = buildTechnicalFilePlan({
      manifest,
      leaves: [leaf],
      resolveFile: () => ({ fileName: 'gspr.pdf', sourcePath: '/x/gspr.pdf' }),
    });
    const gsprEntry = manifest.entries.find((e) => e.id === 'gspr')!;
    const placed = plan.files.find((f) => f.sectionId === 'gspr');
    expect(placed).toBeDefined();
    expect(placed!.targetPath).toBe(`${gsprEntry.path}/gspr.pdf`);
  });

  it('reports a source as skipped when the file cannot be resolved', () => {
    const manifest = buildTechnicalFileManifest(
      assembleTechDoc({ regulation: 'mdr', leaves: [{ sectionCode: 'gspr.checklist', title: 'GSPR Checklist', documentType: 'gspr' }] })
    );
    const plan = buildTechnicalFilePlan({
      manifest,
      leaves: [{ sectionCode: 'gspr.checklist', title: 'GSPR Checklist', lifecycleOp: 'new' }],
      resolveFile: () => null,
    });
    expect(plan.files).toHaveLength(0);
    expect(plan.skipped.some((s) => s.sectionId === 'gspr' && /no resolvable/.test(s.reason))).toBe(true);
  });

  it('de-collides duplicate file names within the package', () => {
    const manifest = buildTechnicalFileManifest(
      assembleTechDoc({ regulation: 'mdr', leaves: [] })
    );
    // Force two entries to share a file name by handing both the same resolved name.
    manifest.entries[0].sources = ['a', 'b'];
    const plan = buildTechnicalFilePlan({
      manifest,
      leaves: [
        { sectionCode: 'a', title: 'a', lifecycleOp: 'new' },
        { sectionCode: 'b', title: 'b', lifecycleOp: 'new' },
      ],
      resolveFile: () => ({ fileName: 'doc.pdf', sourcePath: '/x/doc.pdf' }),
    });
    const paths = plan.files.map((f) => f.targetPath);
    expect(new Set(paths).size).toBe(paths.length); // all unique
  });
});

describe('materializeTechnicalFile', () => {
  it('writes a real ZIP with the manifest, the placed file, and a checksum index', async () => {
    const srcDir = await tmp();
    const outDir = await tmp();
    const { leaf, resolved } = await gsprLeafWithFile(srcDir);

    const manifest = buildTechnicalFileManifest(
      assembleTechDoc({ regulation: 'mdr', leaves: [{ sectionCode: leaf.sectionCode, title: leaf.title, documentType: 'gspr' }] }),
      { productName: 'AcmeScope' }
    );
    const plan = buildTechnicalFilePlan({ manifest, leaves: [leaf], resolveFile: () => resolved });

    const bundle = await materializeTechnicalFile(plan, { outputDir: outDir, applicationId: 'DEV-123' });

    expect(bundle.fileCount).toBe(1);
    expect(bundle.sizeBytes).toBeGreaterThan(0);
    expect(bundle.sha256).toMatch(/^[0-9a-f]{64}$/);
    expect(path.basename(bundle.path)).toBe('DEV-123-technical-file-mdr.zip');

    // Open the ZIP and assert structure.
    const zip = await JSZip.loadAsync(await fs.readFile(bundle.path));
    expect(zip.file('manifest.json')).not.toBeNull();
    expect(zip.file('checksums.md5.txt')).not.toBeNull();
    const gsprEntry = manifest.entries.find((e) => e.id === 'gspr')!;
    const placed = zip.file(`${gsprEntry.path}/gspr.pdf`);
    expect(placed).not.toBeNull();
    expect(await placed!.async('string')).toBe('GSPR checklist content');

    // manifest.json round-trips to the same manifest.
    const parsed = JSON.parse(await zip.file('manifest.json')!.async('string'));
    expect(parsed.regulation).toBe('mdr');
    expect(parsed.productName).toBe('AcmeScope');

    // Checksum index references the placed file.
    const checks = await zip.file('checksums.md5.txt')!.async('string');
    expect(checks).toMatch(/manifest\.json/);
    expect(checks).toMatch(/gspr\.pdf/);
  });
});

describe('buildTechnicalFilePlan — unmapped leaves are reported, never dropped', () => {
  it('reports a resolvable leaf that no manifest entry lists as a source under sectionId "unmapped"', () => {
    // An authored section whose key matches no Annex II/III slot (e.g. the
    // conformity/registration group IV.*) must surface in `skipped`, not vanish.
    const manifest = buildTechnicalFileManifest(assembleTechDoc({ regulation: 'mdr', leaves: [] }));
    const leaf: CoreLeaf = { sectionCode: 'IV.1', title: 'EU declaration of conformity — Annex IV', lifecycleOp: 'new' };
    const plan = buildTechnicalFilePlan({
      manifest,
      leaves: [leaf],
      resolveFile: () => ({ fileName: 'doc.pdf', sourcePath: '/x/doc.pdf' }),
    });
    expect(plan.files).toHaveLength(0);
    const unmapped = plan.skipped.filter((s) => s.sectionId === 'unmapped');
    expect(unmapped).toHaveLength(1);
    expect(unmapped[0].source).toBe('IV.1');
    expect(unmapped[0].reason).toMatch(/no technical-file section matched/i);
  });

  it('does not double-report a leaf that a section lists but whose file cannot be resolved', () => {
    const manifest = buildTechnicalFileManifest(
      assembleTechDoc({ regulation: 'mdr', leaves: [{ sectionCode: 'gspr.checklist', title: 'GSPR Checklist', documentType: 'gspr' }] })
    );
    const plan = buildTechnicalFilePlan({
      manifest,
      leaves: [{ sectionCode: 'gspr.checklist', title: 'GSPR Checklist', lifecycleOp: 'new' }],
      resolveFile: () => null,
    });
    expect(plan.skipped.filter((s) => s.sectionId === 'unmapped')).toHaveLength(0);
    expect(plan.skipped.filter((s) => s.sectionId === 'gspr')).toHaveLength(1);
  });
});
