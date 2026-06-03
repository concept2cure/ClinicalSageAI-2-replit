/**
 * ═══════════════════════════════════════════════════════════════════════════
 *                        RECIPROCAL RANK FUSION (RRF)
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * Fuses several ranked lists (e.g. a dense/vector ranking and a sparse/lexical
 * ranking) into one ordering without needing their scores to be on the same
 * scale. Each list contributes 1/(k + rank) per item (rank is 1-based, best
 * first); an item's fused score is the sum across the lists it appears in. An
 * item ranked highly by *both* retrievers therefore beats one that only one
 * retriever liked — which is exactly the hybrid-search behavior we want.
 *
 * k (default 60, the value from the original Cormack et al. paper) damps the
 * contribution of deep ranks so the head of each list dominates. RRF is
 * deliberately score-agnostic: cosine similarity and ts_rank_cd are not
 * comparable numbers, so we fuse on *position*, not magnitude.
 */

/** The damping constant from the original RRF paper. */
export const RRF_K = 60;

/**
 * Compute fused RRF scores for the given ranked lists of ids (each list is
 * best-first; ids may repeat across lists but should be unique within a list).
 * Returns id → summed RRF score. Empty/whitespace ids are ignored.
 */
export function reciprocalRankFusion(lists: string[][], k: number = RRF_K): Map<string, number> {
  const scores = new Map<string, number>();
  for (const list of lists) {
    for (let i = 0; i < list.length; i++) {
      const id = list[i];
      if (!id) continue;
      const contribution = 1 / (k + i + 1); // rank is 1-based
      scores.set(id, (scores.get(id) ?? 0) + contribution);
    }
  }
  return scores;
}

/**
 * Min-max normalize a score map into [0,1] so fused scores are comparable to
 * the downstream rerank score (also [0,1]) and the (initial+rerank)/2 blend
 * stays meaningful. When every score is equal (one item, or a single-list
 * fusion with no overlap differences) we map them all to 1 rather than 0, since
 * a uniform set carries no relative signal to discount.
 */
export function normalizeToUnit(scores: Map<string, number>): Map<string, number> {
  const values = [...scores.values()];
  if (values.length === 0) return new Map();
  const min = Math.min(...values);
  const max = Math.max(...values);
  const span = max - min;
  const out = new Map<string, number>();
  for (const [id, v] of scores) {
    out.set(id, span > 0 ? (v - min) / span : 1);
  }
  return out;
}
