/**
 * eCTD Lifecycle Operator Engine (architecture spec §5.1)
 *
 * Computes the ICH M2/M8 lifecycle operator (`new | replace | append | delete`)
 * for each leaf of a NEW sequence by diffing it against the PRIOR sequence — the
 * one capability the audit found ABSENT (every other module only *passes through*
 * or *validates* an operation, none derives it).
 *
 * PURE + DETERMINISTIC: no DB, no filesystem, no network, no LLM. Diffing is by
 * stable leaf identity + content checksum, exactly as an eCTD publisher must do
 * it (the deterministic spine — spec §7 keeps LLMs out of this path).
 *
 * INTEGRATION (no duplication): the output is the existing
 * `EctdLeaf` shape from `submission-gateways/regional-packager.ts`, so the result
 * feeds straight into `packageEctdSubmission()` and the
 * `ectd-validator-hardening.ts` / `ectd4-validator.ts` pipeline. No new leaf
 * type, no new backbone generator.
 *
 * @module server/services/ectd/lifecycle-operator
 */

import type { EctdLeaf } from '../submission-gateways/regional-packager';

export type LifecycleOperation = EctdLeaf['operation']; // 'new' | 'append' | 'replace' | 'delete'

/**
 * A leaf as it existed in the prior sequence. `md5` is the content checksum that
 * was published for it; `leafKey` is its stable cross-sequence identity (eCTD
 * leaf GUID, or — when absent — `ctdSection/fileName`).
 */
export interface PriorLeaf {
  leafKey?: string;
  ctdSection: string;
  fileName: string;
  md5: string;
  title?: string;
  sourcePath?: string;
  /**
   * The leaf's PUBLISHED path within the prior sequence, backbone-relative
   * (e.g. `m3/32-body-data/32s-drug-sub/drug-substance.pdf`), optionally with a
   * `#leafId` fragment. Used to build the ICH `modified-file` pointer for a
   * superseding op. When absent, the exact prior path can't be reconstructed
   * from ctdSection/fileName alone, so no pointer is emitted (the op still
   * carries its operation, but a downstream step must supply modified-file).
   */
  href?: string;
}

/**
 * A leaf the new sequence intends to contain, without its operation (this engine
 * computes it). Carries everything `EctdLeaf` needs plus the diff inputs.
 */
export type DesiredLeaf = Omit<EctdLeaf, 'operation'> & {
  /** Stable identity; defaults to `ctdSection/fileName`. */
  leafKey?: string;
  /** Content checksum of the desired file. Required to diff against prior. */
  md5: string;
  /**
   * Caller intent: when the content changed relative to prior, emit `append`
   * (supplementary content added to the same leaf) instead of the default
   * `replace`. The diff cannot infer append vs replace from bytes alone, so it
   * is an explicit, opt-in declaration — defaults to `replace`.
   */
  appendOnChange?: boolean;
};

export interface LifecycleSummary {
  new: number;
  replace: number;
  append: number;
  delete: number;
  /** Leaves unchanged from the prior sequence — omitted from the new sequence. */
  unchanged: number;
}

export interface LifecycleResult {
  /** Leaves for the new sequence, each with its computed operation. */
  leaves: EctdLeaf[];
  summary: LifecycleSummary;
}

/** Stable identity for a leaf across sequences. */
function keyOf(leaf: { leafKey?: string; ctdSection: string; fileName: string }): string {
  return leaf.leafKey ?? `${leaf.ctdSection}/${leaf.fileName}`;
}

/**
 * Build the ICH `modified-file` pointer for a superseding op (replace/append/
 * delete): the prior leaf's published path, prefixed with the relative traversal
 * from the NEW sequence's backbone to the prior sequence. Returns undefined when
 * the prior leaf's published href is unknown (nothing to point at).
 *
 * @param prev    the prior-sequence leaf being modified
 * @param prefix  relative traversal to the prior sequence root, e.g. '../0000/'
 *                for a grouped submission where sequences are sibling folders.
 *                Empty → the bare prior href (correct only when both sequences
 *                resolve against the same backbone root).
 */
function modifiedFileFor(prev: PriorLeaf, prefix: string): string | undefined {
  if (!prev.href) return undefined;
  const href = prev.href.replace(/^\//, '');
  if (!prefix) return href;
  return `${prefix.replace(/\/+$/, '')}/${href}`;
}

/**
 * Diff a desired (new-sequence) leaf set against the prior sequence and assign
 * each leaf its lifecycle operation.
 *
 * Rules (deterministic):
 *  - in desired, not in prior            → `new`      (no modified-file)
 *  - in both, checksum equal             → unchanged (omitted; stays in prior seq)
 *  - in both, checksum differs           → `replace` (or `append` if appendOnChange)
 *  - in prior, not in desired            → `delete` (a delete leaf referencing prior)
 *
 * Every superseding op (replace / append / delete) carries a `modified-file`
 * pointer at the prior leaf it acts on — required by ICH so the receiving review
 * tool knows which previously-submitted file is being replaced, extended, or
 * withdrawn. The pointer is built from the prior leaf's published `href` plus
 * `opts.priorSequencePrefix`; if a prior leaf has no known href, that op is
 * emitted without a pointer (no worse than before) rather than guessed.
 *
 * @throws if two desired leaves share the same identity key (ambiguous lifecycle).
 */
export function computeLifecycleOperations(
  prior: PriorLeaf[],
  desired: DesiredLeaf[],
  opts: { includeUnchanged?: boolean; priorSequencePrefix?: string } = {}
): LifecycleResult {
  const prefix = opts.priorSequencePrefix ?? '';
  const priorByKey = new Map<string, PriorLeaf>();
  for (const p of prior) priorByKey.set(keyOf(p), p);

  const summary: LifecycleSummary = { new: 0, replace: 0, append: 0, delete: 0, unchanged: 0 };
  const leaves: EctdLeaf[] = [];
  const seenDesired = new Set<string>();

  for (const d of desired) {
    const key = keyOf(d);
    if (seenDesired.has(key)) {
      throw new Error(`Ambiguous lifecycle: two desired leaves share identity "${key}".`);
    }
    seenDesired.add(key);

    const prev = priorByKey.get(key);
    const { leafKey: _lk, md5, appendOnChange: _aoc, ...base } = d;

    if (!prev) {
      summary.new++;
      leaves.push({ ...base, md5, operation: 'new' });
      continue;
    }
    if (prev.md5 === md5) {
      // Unchanged: not re-emitted in the new sequence. Optionally surface it as a
      // no-op `append` for callers that want the full tree (rare).
      summary.unchanged++;
      if (opts.includeUnchanged) leaves.push({ ...base, md5, operation: 'append' });
      continue;
    }
    const modifiedFile = modifiedFileFor(prev, prefix);
    if (d.appendOnChange) {
      summary.append++;
      leaves.push({ ...base, md5, operation: 'append', ...(modifiedFile ? { modifiedFile } : {}) });
    } else {
      summary.replace++;
      leaves.push({ ...base, md5, operation: 'replace', ...(modifiedFile ? { modifiedFile } : {}) });
    }
  }

  // Anything in prior that the new sequence dropped is a delete — pointing its
  // modified-file at the prior leaf being withdrawn.
  for (const p of prior) {
    if (seenDesired.has(keyOf(p))) continue;
    summary.delete++;
    const modifiedFile = modifiedFileFor(p, prefix);
    leaves.push({
      ctdSection: p.ctdSection,
      fileName: p.fileName,
      title: p.title ?? p.fileName,
      sourcePath: p.sourcePath ?? '',
      md5: p.md5,
      operation: 'delete',
      ...(modifiedFile ? { modifiedFile } : {}),
    });
  }

  return { leaves, summary };
}

export default { computeLifecycleOperations };
