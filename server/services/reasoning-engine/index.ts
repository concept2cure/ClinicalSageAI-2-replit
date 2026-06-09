/**
 * Reasoning Engine (WO-5) — single `resolve()` contract over swappable resolvers.
 *
 * HRM-candidate regulatory reasoning (required-section resolution, CTD
 * dependency resolution, granularity, review-clock) is isolated here so an HRM
 * resolver can replace the deterministic one later without touching callers
 * (e.g. the submission planner narration in submission-ai). Resolvers are tried
 * in priority order; the first that `supports()` the request answers. Today only
 * the deterministic rules-resolver supports anything, so the engine is fully
 * deterministic and LLM-free.
 */

import { ReasoningError, type ReasoningRequest, type ReasoningResolver, type ReasoningResult } from './types.js';
import { rulesResolver } from './rules-resolver.js';
import { hrmResolver } from './hrm-resolver.js';

export * from './types.js';
export { rulesResolver } from './rules-resolver.js';
export { hrmResolver, HRM_ENABLED } from './hrm-resolver.js';
export {
  PROFILE_VERSION,
  requiredSections,
  ctdDependencies,
  reviewClock,
  granularityRule,
} from './rule-data.js';

/** Resolver priority: HRM first (when enabled), deterministic rules as the floor. */
const RESOLVERS: ReasoningResolver[] = [hrmResolver, rulesResolver];

/**
 * Resolve a reasoning task with the first resolver that supports it. Pure,
 * deterministic, synchronous. Throws ReasoningError on bad input or when no
 * resolver supports the task.
 */
export function resolve<T = unknown>(req: ReasoningRequest): ReasoningResult<T> {
  for (const resolver of RESOLVERS) {
    if (resolver.supports(req)) {
      return resolver.resolve<T>(req);
    }
  }
  throw new ReasoningError('NO_RESOLVER', `No resolver supports task: ${req.task}`);
}

/** Which resolver would answer a request (for diagnostics / the determinism boundary). */
export function resolverFor(req: ReasoningRequest): ReasoningResolver['name'] | null {
  return RESOLVERS.find(r => r.supports(req))?.name ?? null;
}
