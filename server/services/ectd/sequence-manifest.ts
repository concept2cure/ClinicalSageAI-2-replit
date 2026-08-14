/**
 * eCTD sequence leaf manifest — the immutable per-sequence record of what was
 * published, so a LATER sequence can compute its lifecycle correctly.
 *
 * When a sequence is compiled we snapshot every published leaf (its precise CTD
 * section, filename, package-relative href, and MD5) onto the compilation row
 * (`ectd_compilations.leaf_manifest`). That snapshot is the authoritative prior
 * state: the mutable `ectd_granules` rows drift as authoring continues, and the
 * published `index.xml` only records a leaf's heading-level section (it nests a
 * 3.2.S.4.2 leaf under `m3-2-s-drug-substance`, losing the sub-section), so
 * neither can serve as the exact prior state a `replace`/`delete` diff needs.
 * The manifest can — it stores the precise section verbatim.
 *
 * This module is pure (no DB/IO): it BUILDS a manifest from the leaves being
 * packaged, CONVERTS a stored manifest back into the `PriorLeaf` shape the
 * lifecycle operator diffs against, and computes the cross-sequence path prefix
 * for the ICH `modified-file` pointer. The DB read/write lives at the call
 * sites (compiling callers persist it; a loader reads it back).
 *
 * @module server/services/ectd/sequence-manifest
 */

import type { PriorLeaf } from './lifecycle-operator';

/** One published leaf, snapshotted at compile time. */
export interface SequenceLeafManifestEntry {
  /** Precise CTD section, e.g. '3.2.S.4.2' (verbatim, not heading-collapsed). */
  ctdSection: string;
  /** Leaf filename inside the package, e.g. 'general-information.pdf'. */
  fileName: string;
  /** Package-relative href as published, e.g. 'm3/32-body-data/32s/general.pdf'. */
  href: string;
  /** Published MD5 checksum of the leaf bytes. */
  md5: string;
  /** Lifecycle operation this leaf carried in its own sequence. */
  operation?: string;
  /** Optional display title. */
  title?: string;
}

/** The minimal leaf shape the manifest builder reads (satisfied by the export
 *  service's granule record and by EctdLeaf-with-href). */
export interface PublishableLeaf {
  /** Precise CTD section / granule id, e.g. '3.2.S.4.2'. */
  ctdSection: string;
  /** Package-relative path of the leaf, e.g. 'm3/32-body-data/32s/general.pdf'. */
  href: string;
  /** Published MD5. */
  md5: string;
  /** Optional filename; derived from href when absent. */
  fileName?: string;
  operation?: string;
  title?: string;
}

/** POSIX basename of a package href. */
function baseName(href: string): string {
  const clean = href.split(/[?#]/)[0];
  const idx = clean.lastIndexOf('/');
  return idx >= 0 ? clean.slice(idx + 1) : clean;
}

/**
 * Snapshot the leaves being published into an immutable manifest. Leaves without
 * a resolvable href or checksum are skipped (nothing to record / diff against).
 */
export function buildLeafManifest(leaves: PublishableLeaf[]): SequenceLeafManifestEntry[] {
  const out: SequenceLeafManifestEntry[] = [];
  for (const l of leaves) {
    if (!l.href || !l.md5) continue;
    out.push({
      ctdSection: l.ctdSection,
      fileName: l.fileName ?? baseName(l.href),
      href: l.href,
      md5: l.md5,
      ...(l.operation ? { operation: l.operation } : {}),
      ...(l.title ? { title: l.title } : {}),
    });
  }
  return out;
}

/**
 * Convert a stored manifest back into the lifecycle operator's PriorLeaf shape.
 * The precise `ctdSection` + `fileName` form the cross-sequence identity, and
 * `href` carries the published path used to build the modified-file pointer.
 *
 * Tolerates a manifest stored as an unknown JSON value (the DB column is json):
 * a non-array, or entries missing required fields, yield an empty/filtered list
 * rather than throwing.
 */
export function manifestToPriorLeaves(manifest: unknown): PriorLeaf[] {
  if (!Array.isArray(manifest)) return [];
  const out: PriorLeaf[] = [];
  for (const raw of manifest) {
    if (!raw || typeof raw !== 'object') continue;
    const e = raw as Partial<SequenceLeafManifestEntry>;
    if (typeof e.ctdSection !== 'string' || typeof e.md5 !== 'string') continue;
    const fileName = typeof e.fileName === 'string' ? e.fileName : e.href ? baseName(e.href) : '';
    if (!fileName) continue;
    out.push({
      ctdSection: e.ctdSection,
      fileName,
      md5: e.md5,
      ...(typeof e.href === 'string' ? { href: e.href } : {}),
      ...(typeof e.title === 'string' ? { title: e.title } : {}),
    });
  }
  return out;
}

/**
 * The relative traversal from a NEW sequence's backbone (index.xml) to a PRIOR
 * sequence's root, for the ICH `modified-file` pointer. In a grouped submission
 * each sequence is a sibling folder under the application
 * (`<app>/0000/`, `<app>/0001/`, …), so from `<app>/0001/index.xml` the prior
 * sequence root is `../0000/`. Returns a trailing-slash prefix to prepend to a
 * prior leaf's package-relative href.
 *
 * @throws if the sequence number is not a non-empty token (guards against an
 *         empty prefix silently producing a same-sequence pointer).
 */
export function computeSequencePrefix(priorSequenceNumber: string): string {
  const seq = (priorSequenceNumber ?? '').trim();
  if (!seq || !/^[0-9A-Za-z._-]+$/.test(seq)) {
    throw new Error(`Invalid prior sequence number for modified-file prefix: "${priorSequenceNumber}"`);
  }
  return `../${seq}/`;
}
