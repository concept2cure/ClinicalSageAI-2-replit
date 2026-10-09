/**
 * Which model call proposed a command block, for its Part 11 row (D6).
 *
 * Its own module, not AnaToolExecutor: route harnesses mock that module whole,
 * and a helper added there is undefined under their mocks.
 */

/**
 * The model call that wrote the answer's command blocks, for their Part 11
 * rows: the one round whose text holds them. When several rounds wrote
 * blocks, the answer cannot say which call proposed which, so the record says
 * so (nulls) rather than naming the last round (2026-09-26 review). With no
 * block there is nothing to attribute.
 */
export function commandBlockProposer<T extends { provider: string | null; model: string | null; requestId: string | null }>(
  rounds: T[],
  last: T,
): { provider: string | null; model: string | null; requestId: string | null } {
  if (rounds.length === 0) return last;
  if (rounds.length === 1) return rounds[0];
  return { provider: null, model: null, requestId: null };
}
