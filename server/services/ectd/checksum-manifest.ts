/**
 * eCTD vendored-artifact checksum-manifest verifier.
 *
 * The DTD and schema drop-points ship a `checksums.txt` (SHA-256, `sha256sum`
 * format: `<64-hex>  <filename>`). This is the verifier the drop-point READMEs
 * promised: it refuses to trust a vendored DTD/XSD whose bytes don't match its
 * recorded hash, and flags manifest entries with no file and files with no
 * manifest entry. Pure logic + a thin FS reader.
 *
 * Comment lines (`#…`) and blank lines are ignored, matching the manifest format.
 *
 * @module server/services/ectd/checksum-manifest
 */

import { promises as fs } from 'fs';
import * as path from 'path';
import { createHash } from 'crypto';

/** One parsed manifest entry. */
export interface ManifestEntry {
  sha256: string;
  fileName: string;
}

export interface ChecksumVerifyResult {
  /** Files present in the dir whose bytes match their manifest hash. */
  verified: string[];
  /** Files whose bytes do NOT match the recorded hash (tampered / stale). */
  mismatched: Array<{ fileName: string; expected: string; actual: string }>;
  /** Manifest entries with no corresponding file on disk. */
  missingFiles: string[];
  /** Vendored files (by extension) with no manifest entry (unrecorded). */
  unlistedFiles: string[];
  /** True when nothing is mismatched, missing, or unlisted. */
  ok: boolean;
}

const SHA256_LINE = /^([0-9a-fA-F]{64})\s{1,2}(.+)$/;

/** Parse `checksums.txt` content into entries (ignoring comments/blanks). */
export function parseManifest(text: string): ManifestEntry[] {
  const out: ManifestEntry[] = [];
  for (const raw of text.split('\n')) {
    const line = raw.trim();
    if (!line || line.startsWith('#')) continue;
    const m = SHA256_LINE.exec(line);
    if (!m) continue;
    out.push({ sha256: m[1].toLowerCase(), fileName: m[2].trim() });
  }
  return out;
}

/**
 * Verify every vendored artifact in `dir` (matching `extensions`) against the
 * SHA-256 manifest. A missing manifest file or missing dir yields an empty,
 * non-throwing result with ok=true when there are also no vendored files (the
 * pre-vendoring state), and ok=false when files exist but aren't recorded.
 */
export async function verifyChecksumManifest(
  dir: string,
  manifestName = 'checksums.txt',
  extensions: string[] = ['.dtd', '.xsd'],
): Promise<ChecksumVerifyResult> {
  const result: ChecksumVerifyResult = {
    verified: [],
    mismatched: [],
    missingFiles: [],
    unlistedFiles: [],
    ok: true,
  };

  let manifestText = '';
  try {
    manifestText = await fs.readFile(path.join(dir, manifestName), 'utf8');
  } catch {
    manifestText = '';
  }
  const entries = parseManifest(manifestText);
  const entryByName = new Map(entries.map((e) => [e.fileName, e.sha256]));

  // Actual vendored artifact files present.
  let names: string[] = [];
  try {
    names = (await fs.readdir(dir)).filter((n) => extensions.some((e) => n.toLowerCase().endsWith(e)));
  } catch {
    names = [];
  }

  for (const name of names.sort()) {
    const expected = entryByName.get(name);
    if (!expected) {
      result.unlistedFiles.push(name);
      continue;
    }
    let actual = '';
    try {
      actual = createHash('sha256').update(await fs.readFile(path.join(dir, name))).digest('hex');
    } catch {
      actual = '';
    }
    if (actual === expected) result.verified.push(name);
    else result.mismatched.push({ fileName: name, expected, actual });
  }

  // Manifest entries with no file on disk.
  const present = new Set(names);
  for (const e of entries) {
    if (!present.has(e.fileName)) result.missingFiles.push(e.fileName);
  }

  result.ok =
    result.mismatched.length === 0 &&
    result.missingFiles.length === 0 &&
    result.unlistedFiles.length === 0;
  return result;
}

export default { parseManifest, verifyChecksumManifest };
