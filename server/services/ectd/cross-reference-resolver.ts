/**
 * eCTD Cross-Reference / Hyperlink Resolver (architecture spec §5.1)
 *
 * Validates intra-package cross-references — the hyperlinks an eCTD submission
 * uses to point from one leaf/section to another (e.g. 2.7.3 Clinical Summary
 * citing a 5.3.5.1 study report). The audit found this capability FULLY ABSENT;
 * the existing packager only resolves a leaf's own href, never the links between
 * leaves. A dangling cross-reference is an eCTD technical-validation defect.
 *
 * PURE + DETERMINISTIC: no DB, no filesystem, no network, no LLM. Given the leaf
 * set and the declared references, it reports which resolve and which are broken
 * (with a reason). This is the deterministic spine — it complements, and can feed,
 * the href-resolution check in ectdExportService and the Truth Engine provenance
 * graph (which is the source of truth for "what links where").
 *
 * INTEGRATION (no duplication): operates on the existing `EctdLeaf` shape from
 * submission-gateways/regional-packager.ts. No new leaf type.
 *
 * @module server/services/ectd/cross-reference-resolver
 */

import type { EctdLeaf } from '../submission-gateways/regional-packager';

/**
 * A declared cross-reference: a hyperlink from one place in the submission to a
 * target leaf/section. `target` may be a CTD section code ('5.3.5.1'), an
 * explicit leaf key, or a relative href ('m5/53-clin-stud-rep/study-a.pdf').
 */
export interface CrossReference {
  /** Optional id for the reference (echoed back in results). */
  id?: string;
  /** Where the link originates — a CTD section code or leaf key (for reporting). */
  source: string;
  /** What it points at — a section code, leaf key, or relative href. */
  target: string;
  /** Optional human label for the link. */
  label?: string;
}

export type BrokenReason =
  | 'TARGET_NOT_FOUND' // nothing in the package matches the target
  | 'TARGET_DELETED'; // target resolves to a leaf whose operation is 'delete'

export interface ResolvedReference extends CrossReference {
  /** ctdSection of the matched target leaf. */
  resolvedSection: string;
  /** fileName of the matched target leaf. */
  resolvedFileName: string;
}

export interface BrokenReference extends CrossReference {
  reason: BrokenReason;
}

export interface CrossReferenceResult {
  resolved: ResolvedReference[];
  broken: BrokenReference[];
  /** True when every reference resolved to a live (non-deleted) target. */
  ok: boolean;
}

/** Leaf identity used to match a reference target. */
function leafKeyOf(leaf: EctdLeaf & { leafKey?: string }): string {
  return leaf.leafKey ?? `${leaf.ctdSection}/${leaf.fileName}`;
}

/** Normalize an href/path/section for tolerant matching. */
function norm(s: string): string {
  return s.trim().replace(/^\.?\//, '').replace(/\\/g, '/').toLowerCase();
}

/**
 * Resolve each cross-reference against the leaf set.
 *
 * A target matches a leaf when it equals (case-insensitively) the leaf's
 * section code, its leaf key, its fileName, or the tail of a relative href that
 * ends in the leaf's fileName. A reference that matches a `delete` leaf is
 * reported broken (`TARGET_DELETED`) — you must not link to content you are
 * withdrawing.
 */
export function resolveCrossReferences(
  leaves: Array<EctdLeaf & { leafKey?: string }>,
  references: CrossReference[]
): CrossReferenceResult {
  // Build lookup indexes once.
  const bySection = new Map<string, EctdLeaf & { leafKey?: string }>();
  const byKey = new Map<string, EctdLeaf & { leafKey?: string }>();
  const byFile = new Map<string, EctdLeaf & { leafKey?: string }>();
  for (const leaf of leaves) {
    bySection.set(norm(leaf.ctdSection), leaf);
    byKey.set(norm(leafKeyOf(leaf)), leaf);
    byFile.set(norm(leaf.fileName), leaf);
  }

  const resolved: ResolvedReference[] = [];
  const broken: BrokenReference[] = [];

  for (const ref of references) {
    const t = norm(ref.target);
    const match =
      bySection.get(t) ||
      byKey.get(t) ||
      byFile.get(t) ||
      // relative href like 'm5/.../study-a.pdf' → match by trailing filename
      [...byFile.entries()].find(([file]) => t.endsWith(file))?.[1];

    if (!match) {
      broken.push({ ...ref, reason: 'TARGET_NOT_FOUND' });
      continue;
    }
    if (match.operation === 'delete') {
      broken.push({ ...ref, reason: 'TARGET_DELETED' });
      continue;
    }
    resolved.push({
      ...ref,
      resolvedSection: match.ctdSection,
      resolvedFileName: match.fileName,
    });
  }

  return { resolved, broken, ok: broken.length === 0 };
}

export default { resolveCrossReferences };
