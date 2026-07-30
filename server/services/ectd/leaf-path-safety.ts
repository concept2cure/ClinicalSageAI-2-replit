/**
 * Leaf path-safety gate for the eCTD packager.
 *
 * A regulated packager must not read whatever absolute `sourcePath` a leaf hands
 * it. The canonical resolver (`leaf-source-resolver`) already produces
 * server-generated paths under a staging dir, but `ResolvedFile.sourcePath` is a
 * DEPENDENCY-INJECTION seam (`LeafFileResolver`): any caller can supply a
 * resolver that returns an arbitrary path. This gate validates every staged leaf
 * file before it is packaged and fails closed on anything unsafe:
 *
 *   - path traversal / not contained in the allowed staging root
 *   - symlinks (lstat — a symlink could point outside the root)
 *   - missing file or not a regular file
 *   - oversize file (DoS / accidental huge attachment)
 *   - not a PDF (magic bytes) — an eCTD leaf must be a PDF
 *   - duplicate output file names (two leaves colliding in the package)
 *
 * Pure w.r.t. policy; the filesystem probe is the one effect and is injectable
 * for tests via `FsProbe`.
 *
 * @module server/services/ectd/leaf-path-safety
 */

import { promises as fs } from 'fs';
import path from 'path';

export type PathViolationCode =
  | 'OUTSIDE_ALLOWED_ROOT'
  | 'PATH_TRAVERSAL'
  | 'SYMLINK'
  | 'MISSING'
  | 'NOT_A_FILE'
  | 'TOO_LARGE'
  | 'NOT_PDF'
  | 'DUPLICATE_OUTPUT_NAME';

export interface LeafPathInput {
  fileName: string;
  sourcePath: string;
}

export interface PathSafetyOptions {
  /** Absolute directory every leaf source file MUST be contained within. */
  allowedRoot: string;
  /** Max leaf size in bytes (default 500 MiB — an eCTD leaf far exceeding this is a red flag). */
  maxBytes?: number;
}

export interface PathViolation {
  fileName: string;
  sourcePath: string;
  code: PathViolationCode;
  detail: string;
}

export interface PathSafetyResult {
  ok: boolean;
  violations: PathViolation[];
}

/** Injectable filesystem probe (real impl uses fs; tests inject a fake). */
export interface FsProbe {
  lstat(p: string): Promise<{ isSymbolicLink: boolean; isFile: boolean; size: number } | null>;
  readMagic(p: string, n: number): Promise<Buffer | null>;
}

const DEFAULT_MAX_BYTES = 500 * 1024 * 1024;

const realFsProbe: FsProbe = {
  async lstat(p) {
    try {
      const s = await fs.lstat(p);
      return { isSymbolicLink: s.isSymbolicLink(), isFile: s.isFile(), size: s.size };
    } catch {
      return null;
    }
  },
  async readMagic(p, n) {
    try {
      const fh = await fs.open(p, 'r');
      try {
        const buf = Buffer.alloc(n);
        const { bytesRead } = await fh.read(buf, 0, n, 0);
        return buf.subarray(0, bytesRead);
      } finally {
        await fh.close();
      }
    } catch {
      return null;
    }
  },
};

/** True when `child` is contained within `root` (no traversal escape). */
export function isContainedIn(root: string, child: string): boolean {
  const nRoot = path.resolve(root);
  const nChild = path.resolve(child);
  const rel = path.relative(nRoot, nChild);
  return rel === '' ? false : !rel.startsWith('..') && !path.isAbsolute(rel);
}

/**
 * Validate every leaf source file. Returns all violations (empty = safe). Fails
 * closed: a file that cannot be probed is treated as MISSING, never allowed.
 */
export async function validateLeafPaths(
  leaves: LeafPathInput[],
  opts: PathSafetyOptions,
  probe: FsProbe = realFsProbe,
): Promise<PathSafetyResult> {
  const maxBytes = opts.maxBytes ?? DEFAULT_MAX_BYTES;
  const violations: PathViolation[] = [];
  const seenNames = new Map<string, number>();

  for (const leaf of leaves) {
    const v = (code: PathViolationCode, detail: string) =>
      violations.push({ fileName: leaf.fileName, sourcePath: leaf.sourcePath, code, detail });

    // Output-name collision (two leaves would overwrite each other in the package).
    const lower = leaf.fileName.toLowerCase();
    seenNames.set(lower, (seenNames.get(lower) ?? 0) + 1);
    if (seenNames.get(lower)! > 1) v('DUPLICATE_OUTPUT_NAME', `output file name "${leaf.fileName}" is used by more than one leaf`);

    // Traversal in the declared path string (before touching the fs).
    if (leaf.sourcePath.includes('\0')) { v('PATH_TRAVERSAL', 'null byte in path'); continue; }
    if (path.normalize(leaf.sourcePath).split(path.sep).includes('..')) v('PATH_TRAVERSAL', 'path contains a ".." segment');

    // Containment within the allowed staging root.
    if (!isContainedIn(opts.allowedRoot, leaf.sourcePath)) {
      v('OUTSIDE_ALLOWED_ROOT', `not contained in allowed root ${opts.allowedRoot}`);
      continue; // do not probe a path outside the root
    }

    const st = await probe.lstat(leaf.sourcePath);
    if (!st) { v('MISSING', 'file does not exist or is not readable'); continue; }
    if (st.isSymbolicLink) { v('SYMLINK', 'source is a symlink (could escape the root)'); continue; }
    if (!st.isFile) { v('NOT_A_FILE', 'source is not a regular file'); continue; }
    if (st.size > maxBytes) v('TOO_LARGE', `size ${st.size} exceeds max ${maxBytes}`);
    if (st.size === 0) { v('MISSING', 'file is empty'); continue; }

    const magic = await probe.readMagic(leaf.sourcePath, 5);
    if (!magic || magic.toString('latin1') !== '%PDF-') v('NOT_PDF', 'missing %PDF- header — an eCTD leaf must be a PDF');
  }

  return { ok: violations.length === 0, violations };
}
