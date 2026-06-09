/**
 * Reasoning Engine — the resolve() dispatcher (WO-5)
 *
 * Kept in its own module so helpers (e.g. submission-structure) can import the
 * dispatcher without a circular dependency on the package index.
 */

import { ReasoningError, type ReasoningRequest, type ReasoningResolver, type ReasoningResult } from './types.js';
import { rulesResolver } from './rules-resolver.js';
import { hrmResolver } from './hrm-resolver.js';

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
