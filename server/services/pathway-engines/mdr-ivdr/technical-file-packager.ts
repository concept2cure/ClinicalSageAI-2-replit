/**
 * Technical-file packager — materializes an EU MDR/IVDR technical documentation
 * file as a real ZIP on disk (the device equivalent of `packageEctdSubmission`).
 *
 * Two layers, mirroring the eCTD core→packager split:
 *   1. `buildTechnicalFilePlan` (PURE): turns a `TechnicalFileManifest` + the
 *      canonical leaves into a file plan — each source leaf placed at its Annex
 *      II/III folder path, with the storage-specific `resolveFile` INJECTED so the
 *      plan stays unit-testable. Leaves with no resolvable file are skipped + reported.
 *   2. `materializeTechnicalFile` (fs + JSZip): writes the planned tree, a
 *      `manifest.json` table-of-contents, and an MD5 checksum file into a ZIP, and
 *      returns a content-addressed bundle (sha256 + size).
 *
 * HONEST SCOPE: this is the technical-file PACKAGE (the dossier's folder tree +
 * manifest + checksums), not a EUDAMED registration payload and not a rendered
 * dossier. It places resolved source files and reports gaps; it never invents
 * content for a missing section.
 *
 * @module server/services/pathway-engines/mdr-ivdr/technical-file-packager
 */

import { promises as fs } from 'fs';
import path from 'path';
import { createHash } from 'crypto';
import JSZip from 'jszip';
import type { TechnicalFileManifest } from '../technical-file-manifest';
import type { CoreLeaf, LeafFileResolver } from '../../ectd/core-to-packager';

export interface TechnicalFilePlanFile {
  /** Path inside the ZIP, e.g. "03-annex-ii/device-description/desc.pdf". */
  targetPath: string;
  sourcePath: string;
  fileName: string;
  md5?: string;
  /** The manifest section id this file fills. */
  sectionId: string;
}

export interface TechnicalFilePlan {
  manifest: TechnicalFileManifest;
  files: TechnicalFilePlanFile[];
  skipped: Array<{ sectionId: string; source: string; reason: string }>;
}

/** Insert a `-N` suffix before the extension to de-collide a duplicate path. */
function dedupePath(target: string, seen: Set<string>): string {
  if (!seen.has(target)) {
    seen.add(target);
    return target;
  }
  const ext = path.extname(target);
  const base = target.slice(0, target.length - ext.length);
  let n = 2;
  let candidate = `${base}-${n}${ext}`;
  while (seen.has(candidate)) {
    n += 1;
    candidate = `${base}-${n}${ext}`;
  }
  seen.add(candidate);
  return candidate;
}

/**
 * Build the technical-file plan from a manifest + the canonical leaves. Each
 * section's `sources` are re-associated to their leaf (by sectionCode or title)
 * and resolved to an on-disk file via the injected resolver. Pure + deterministic.
 */
export function buildTechnicalFilePlan(args: {
  manifest: TechnicalFileManifest;
  leaves: CoreLeaf[];
  resolveFile: LeafFileResolver;
}): TechnicalFilePlan {
  const files: TechnicalFilePlanFile[] = [];
  const skipped: TechnicalFilePlan['skipped'] = [];
  const seenPaths = new Set<string>();

  for (const entry of args.manifest.entries) {
    for (const source of entry.sources) {
      const leaf = args.leaves.find((l) => l.sectionCode === source || l.title === source);
      if (!leaf) {
        skipped.push({ sectionId: entry.id, source, reason: 'no matching leaf for source' });
        continue;
      }
      const resolved = args.resolveFile(leaf);
      if (!resolved) {
        skipped.push({ sectionId: entry.id, source, reason: 'no resolvable source file for the leaf document' });
        continue;
      }
      const targetPath = dedupePath(`${entry.path}/${resolved.fileName}`, seenPaths);
      files.push({
        targetPath,
        sourcePath: resolved.sourcePath,
        fileName: resolved.fileName,
        md5: resolved.md5,
        sectionId: entry.id,
      });
    }
  }

  return { manifest: args.manifest, files, skipped };
}

export interface TechnicalFileBundle {
  path: string;
  sha256: string;
  sizeBytes: number;
  fileCount: number;
  skippedCount: number;
  displayName: string;
}

/** One MD5 per file, sorted by path (deterministic checksum manifest). */
function buildMd5Index(entries: Array<{ relPath: string; md5: string }>): string {
  return (
    entries
      .slice()
      .sort((a, b) => a.relPath.localeCompare(b.relPath))
      .map((e) => `${e.md5}  ${e.relPath}`)
      .join('\n') + '\n'
  );
}

/**
 * Materialize the plan into a ZIP on disk: the Annex II/III folder tree, a
 * `manifest.json` table-of-contents, and `checksums.md5.txt`. Returns a
 * content-addressed bundle (sha256 over the zip bytes).
 */
export async function materializeTechnicalFile(
  plan: TechnicalFilePlan,
  opts: { outputDir: string; applicationId: string }
): Promise<TechnicalFileBundle> {
  const zip = new JSZip();
  const checksums: Array<{ relPath: string; md5: string }> = [];

  const manifestJson = JSON.stringify(plan.manifest, null, 2);
  zip.file('manifest.json', manifestJson);
  checksums.push({ relPath: 'manifest.json', md5: createHash('md5').update(manifestJson).digest('hex') });

  for (const f of plan.files) {
    const buf = await fs.readFile(f.sourcePath);
    zip.file(f.targetPath, buf);
    checksums.push({ relPath: f.targetPath, md5: f.md5 ?? createHash('md5').update(buf).digest('hex') });
  }

  zip.file('checksums.md5.txt', buildMd5Index(checksums));

  await fs.mkdir(opts.outputDir, { recursive: true });
  const buffer = await zip.generateAsync({
    type: 'nodebuffer',
    compression: 'DEFLATE',
    compressionOptions: { level: 6 },
  });
  const filename = `${opts.applicationId}-technical-file-${plan.manifest.regulation}.zip`;
  const outPath = path.join(opts.outputDir, filename);
  await fs.writeFile(outPath, buffer);

  return {
    path: outPath,
    sha256: createHash('sha256').update(buffer).digest('hex'),
    sizeBytes: buffer.length,
    fileCount: plan.files.length,
    skippedCount: plan.skipped.length,
    displayName: `${plan.manifest.productName ?? opts.applicationId} · ${plan.manifest.regulation.toUpperCase()} technical file`,
  };
}

export default { buildTechnicalFilePlan, materializeTechnicalFile };
