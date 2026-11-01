/**
 * Which leaves a Shadow Review covered, and whether that is still this
 * sequence's leaves (2026-10-25, row D7).
 *
 * Before: the dispatch gate's presence check counted every completed run a
 * sequence ever had. A run held nothing that said what it reviewed, so a review
 * of last week's leaves cleared a sequence whose documents had since been
 * replaced, while a signed waiver over the same sequence lapsed the moment its
 * leaves changed (shadow-review-waiver.ts waiverSignatureState). The review was
 * the weaker of the two records and the gate trusted it more.
 *
 * Now each run records the digest of the leaves it was given
 * (shadow_review_runs.leaf_manifest_digest), and only a run over the leaves as
 * they stand now counts. The digest is the content half of the sequence's
 * leaf-manifest binding (ectd-sequence-binding.ts readEctdSequenceContent, the
 * binding's `sequenceContentDigest`): the sequence identity and every leaf's
 * section, operation, document pointer and content pin. It is the same derivation a release signature and a waiver are
 * bound by, so "does this record still cover the dossier" has one answer.
 * Recording the package identity (an application number, an applicant) changes
 * no document the reviewer read, so it does not lapse a review; it does lapse a
 * signature, which covers it.
 *
 * A run recorded before this file carries no digest and covers nothing that can
 * be shown, so it is counted as stale, never as current. A sequence whose
 * digest cannot be derived counts nothing as current: undetermined is not
 * reviewed.
 *
 * @module server/services/shadow-review/shadow-review-coverage
 */
import { sha256CanonicalJson } from '../part11/signature-persistence';
import { readEctdSequenceContent } from '../part11/ectd-sequence-binding';
import { createScopedLogger } from '../../utils/logger';

const log = createScopedLogger('shadow-review-coverage');

export type CoverageQueryable = { query: (text: string, params?: unknown[]) => Promise<{ rows: any[] }> };

/**
 * The digest of a sequence's leaves as they stand now, or null when the
 * sequence cannot be read. The same recipe as a leaf-manifest signature's
 * `sequenceContentDigest`, read through the same function. Read on `q`, so a
 * caller inside a transaction sees that transaction's leaves. A failed read is
 * null, never a throw: the caller is a gate, and null is "undetermined".
 */
export async function reviewedLeavesDigest(
  q: CoverageQueryable,
  sequenceId: number,
  organizationId: number,
): Promise<string | null> {
  try {
    const content = await readEctdSequenceContent(q, String(sequenceId), organizationId);
    return content ? sha256CanonicalJson(content) : null;
  } catch (err) {
    log.warn('The leaves of a sequence could not be read for Shadow Review coverage', {
      sequenceId, organizationId, err: err instanceof Error ? err.message : String(err),
    });
    return null;
  }
}

export interface ShadowReviewCurrency {
  /** Completed runs over the sequence's leaves as they stand now. */
  current: number;
  /** Completed runs over other leaves, or recorded before runs carried a digest. */
  stale: number;
  /** The newest stale run, which the presence sentence names. */
  newestStaleRunId: number | null;
  /** The current digest could not be derived, so no run is counted as current. */
  undetermined: boolean;
}

/** Completed, non-deleted runs of a sequence, split by whether they cover its current leaves. */
export async function shadowReviewCurrency(
  q: CoverageQueryable,
  params: { sequenceId: number; organizationId: number },
): Promise<ShadowReviewCurrency> {
  const { sequenceId, organizationId } = params;
  const runs = (await q.query(
    `SELECT id, leaf_manifest_digest FROM shadow_review_runs
      WHERE sequence_id = $1 AND organization_id = $2 AND status = 'complete' AND deleted_at IS NULL
      ORDER BY created_at DESC NULLS LAST, id DESC`,
    [sequenceId, organizationId],
  )).rows as Array<{ id: number; leaf_manifest_digest: string | null }>;
  if (runs.length === 0) return { current: 0, stale: 0, newestStaleRunId: null, undetermined: false };
  const digest = await reviewedLeavesDigest(q, sequenceId, organizationId);
  if (!digest) {
    return { current: 0, stale: runs.length, newestStaleRunId: Number(runs[0].id), undetermined: true };
  }
  const stale = runs.filter((r) => r.leaf_manifest_digest !== digest);
  return {
    current: runs.length - stale.length,
    stale: stale.length,
    newestStaleRunId: stale.length > 0 ? Number(stale[0].id) : null,
    undetermined: false,
  };
}
