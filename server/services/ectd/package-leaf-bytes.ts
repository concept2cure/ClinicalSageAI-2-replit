/**
 * Package already-rendered leaf BYTES through the CANONICAL eCTD packager.
 *
 * THE CONVERGENCE PRIMITIVE. Several paths in this codebase historically had
 * their own ZIP builders; the agency-transmit path used a flat, non-conformant
 * `buildECTDZip` (root <ectd:index> with <ectd:leaf> children, no module tree,
 * no regional M1 backbone, no util/dtd) — so the artifact that reached the FDA
 * was neither the one validated nor the one signed. This routes any caller that
 * holds leaf content + a real CTD section through regional-packager's
 * `packageEctdSubmission`, producing the SAME conformant package the
 * compile/export/sign path produces: a real ICH <ectd:ectd> nested heading tree,
 * the regional Module 1 backbone, the root index-md5.txt, per-leaf MD5 checksums,
 * and DTD references.
 *
 * The packager reads each leaf from an on-disk `sourcePath`, so each leaf's bytes
 * are written to a temp file, packaged, and the temp dir cleaned; the bundle zip
 * lands in the caller's `outputDir` (the persistent bundle store). Placement is
 * by the leaf's ctdSection: the packager nests it under its deepest matching ICH
 * heading (a partial CTD code lands under its nearest ancestor container), and
 * only a ctdSection that matches NO ICH heading at all is refused (findDroppedLeaves
 * throws) — so callers should pass real CTD section codes, but ordinary
 * sub-section granularity is placed, not rejected.
 *
 * @module server/services/ectd/package-leaf-bytes
 */

import { promises as fs } from 'fs';
import * as os from 'os';
import * as path from 'path';
import {
  packageEctdSubmission,
  type EctdLeaf,
  type Region,
} from '../submission-gateways/regional-packager';
import type { SubmissionBundle } from '../submission-gateways/types';

/** One leaf: its real CTD section, filename, rendered bytes, and title. */
export interface LeafBytes {
  /** A real CTD section code the packager can place, e.g. '3.2.P.1' / 'm1.3'. */
  ctdSection: string;
  /** Leaf filename within its module folder, e.g. 'drug-product.pdf'. */
  fileName: string;
  /** The already-rendered leaf content (a PDF). */
  bytes: Buffer;
  /** Human-readable leaf title for the backbone. */
  title: string;
  /**
   * The leaf's ICH lifecycle operation. Optional only for sequence 0000, where
   * every leaf is `new` by definition. For any later sequence it is REQUIRED:
   * this primitive used to hardcode `new` for every leaf whatever the sequence,
   * so a caller transmitting 0002 filed each leaf as brand-new with no
   * modified-file, and the versions those leaves superseded stayed current at
   * the agency alongside them.
   */
  operation?: EctdLeaf['operation'];
  /** ICH modified-file pointer for replace/append/delete (prior sequence path). */
  modifiedFile?: string;
}

export interface PackageLeafBytesParams {
  region: Region;
  applicationId: string;
  sequence: string;
  submissionType: string;
  sponsorId: string;
  sponsorName: string;
  productName: string;
  leaves: LeafBytes[];
  /** Where the bundle zip is written (persistent bundle store). */
  outputDir: string;
  /** 'production' (default) enforces the PDF/A + DTD gates when their env flags
   *  are set; 'staging' never blocks. Structural conformance is produced either
   *  way — the gates only add opt-in fail-closed enforcement. */
  environment?: 'staging' | 'production';
}

/**
 * Write each leaf's bytes to a temp file and drive the canonical packager.
 * Returns the SubmissionBundle (path/sha256/sizeBytes/format/leafManifest).
 * Cleans up its temp working directory before returning.
 */
export async function packageLeafBytes(params: PackageLeafBytesParams): Promise<SubmissionBundle> {
  const work = await fs.mkdtemp(path.join(os.tmpdir(), 'ectd-leafbytes-'));
  try {
    const leavesDir = path.join(work, 'leaves');
    await fs.mkdir(leavesDir, { recursive: true });

    if (params.sequence !== '0000') {
      const unstated = params.leaves.filter((l) => !l.operation).map((l) => `${l.ctdSection}/${l.fileName}`);
      if (unstated.length > 0) {
        throw new Error(
          `Sequence ${params.sequence} cannot be packaged without a lifecycle operation on every leaf ` +
            `(${unstated.length} unstated: ${unstated.slice(0, 5).join(', ')}${unstated.length > 5 ? ', …' : ''}). ` +
            `Filing them as "new" would leave the versions they supersede current at the agency.`,
        );
      }
    }

    const usedNames = new Set<string>();
    const packagerLeaves: EctdLeaf[] = [];
    for (const leaf of params.leaves) {
      // Deterministic, collision-free on-disk filename: two leaves that share a
      // filename get a numeric suffix so neither temp write nor packaging drops
      // one. (Placement uniqueness within the backbone is the packager's job.)
      let fileName = leaf.fileName;
      if (usedNames.has(fileName)) {
        const dot = fileName.lastIndexOf('.');
        const base = dot > 0 ? fileName.slice(0, dot) : fileName;
        const ext = dot > 0 ? fileName.slice(dot) : '';
        let n = 2;
        while (usedNames.has(`${base}-${n}${ext}`)) n++;
        fileName = `${base}-${n}${ext}`;
      }
      usedNames.add(fileName);

      const abs = path.join(leavesDir, fileName);
      await fs.writeFile(abs, leaf.bytes);
      packagerLeaves.push({
        ctdSection: leaf.ctdSection,
        operation: leaf.operation ?? 'new',
        sourcePath: abs,
        fileName,
        title: leaf.title,
        ...(leaf.modifiedFile ? { modifiedFile: leaf.modifiedFile } : {}),
      });
    }

    return await packageEctdSubmission({
      region: params.region,
      applicationId: params.applicationId,
      sequence: params.sequence,
      submissionType: params.submissionType,
      sponsorId: params.sponsorId,
      sponsorName: params.sponsorName,
      productName: params.productName,
      outputDir: params.outputDir,
      environment: params.environment ?? 'production',
      leaves: packagerLeaves,
    });
  } finally {
    try {
      await fs.rm(work, { recursive: true, force: true });
    } catch {
      // best-effort temp cleanup; never mask the packaging result
    }
  }
}

export default { packageLeafBytes };
