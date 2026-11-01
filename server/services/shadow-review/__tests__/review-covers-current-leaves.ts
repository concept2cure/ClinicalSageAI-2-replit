/**
 * Test support (2026-10-25). Since a completed Shadow Review counts only over
 * the leaves it read (shadow-review-coverage.ts), a fixture that inserts a
 * 'complete' run by hand must also say which leaves it covered. This records
 * the sequence's CURRENT digest on its completed runs, as runShadowReview does
 * for a run over those leaves. A suite whose subject is another gate calls it
 * right before it assesses; a suite about coverage itself does not use it.
 */
import { reviewedLeavesDigest, type CoverageQueryable } from '../shadow-review-coverage';

export async function coverCurrentLeaves(q: CoverageQueryable, sequenceId: number, organizationId: number): Promise<void> {
  const digest = await reviewedLeavesDigest(q, sequenceId, organizationId);
  await q.query(
    `UPDATE shadow_review_runs SET leaf_manifest_digest = $1
      WHERE sequence_id = $2 AND organization_id = $3 AND status = 'complete'`,
    [digest, sequenceId, organizationId],
  );
}
