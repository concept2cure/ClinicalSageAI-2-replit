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

export * from './types.js';
export { resolve, resolverFor } from './resolve.js';
export { rulesResolver } from './rules-resolver.js';
export { hrmResolver, HRM_ENABLED } from './hrm-resolver.js';
export {
  PROFILE_VERSION,
  requiredSections,
  ctdDependencies,
  reviewClock,
  granularityRule,
} from './rule-data.js';
export {
  buildSubmissionStructure,
  normalizeRegion,
  normalizeApplicationType,
  type RegionStructure,
  type SubmissionStructure,
} from './submission-structure.js';
