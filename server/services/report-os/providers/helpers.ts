export const CONFIDENCE_MIN = 25;
export const CONFIDENCE_MAX = 95;

/**
 * Clamps a confidence value to the orchestrator's [25, 95] band and rounds it.
 * Mirrors `Math.max(25, Math.min(95, ...))` from the orchestrator.
 */
export function clampConfidence(n: number): number {
  return Math.max(CONFIDENCE_MIN, Math.min(CONFIDENCE_MAX, Math.round(n)));
}

/**
 * Derives a confidence score from the count of blockers, optionally blending in
 * a regulatory readiness score. Mirrors the orchestrator's two confidence paths:
 *   - base = clamp(95 - blockerCount * 20)
 *   - with readinessScore: clamp(round(base * 0.55 + readinessScore * 0.45))
 *   - without: clamp(base)
 */
export function confidenceFromBlockers(blockerCount: number, readinessScore?: number): number {
  const base = clampConfidence(CONFIDENCE_MAX - blockerCount * 20);
  if (readinessScore !== undefined) {
    return clampConfidence(base * 0.55 + readinessScore * 0.45);
  }
  return clampConfidence(base);
}

/**
 * Derives a lifecycle status from governed-artifact counts. Mirrors the
 * orchestrator's readiness derivation: ready when any artifact is approved or
 * locked, partial when artifacts exist but none are approved/locked, otherwise
 * missing.
 */
export function deriveLifecycleStatus(
  approvedOrLocked: number,
  total: number
): 'ready' | 'partial' | 'missing' {
  if (approvedOrLocked > 0) return 'ready';
  if (total > 0) return 'partial';
  return 'missing';
}

/**
 * Returns true when an observation is within its freshness budget relative to now.
 */
export function isFresh(observedAtIso: string, budgetMs: number, now?: Date): boolean {
  const observedMs = new Date(observedAtIso).getTime();
  if (Number.isNaN(observedMs)) return false;
  const nowMs = (now ?? new Date()).getTime();
  return nowMs - observedMs <= budgetMs;
}
