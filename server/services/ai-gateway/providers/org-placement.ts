/**
 * Per-organization AI placement policy.
 *
 * A tenant can require that all of its AI requests run on a particular
 * substrate / region / retention posture (e.g. "this org is EU-resident and
 * BAA-only"). Rather than make every caller pass `dataResidency` /
 * `zeroDataRetention` on each request, the gateway resolves the org's policy
 * and applies it as *defaults* — an explicit value on the request always wins.
 *
 * This module is the storage-agnostic seam. The default resolver returns no
 * policy (so behavior is unchanged — callers pass requirements explicitly). A
 * DB-backed resolver (per-org settings table) is injected at startup via
 * {@link setOrgPlacementResolver}; it should cache per org. Keeping the seam
 * separate from the store lets the gateway depend on the interface, not on a
 * particular table.
 *
 * @module server/services/ai-gateway/providers/org-placement
 */

import type { DataResidency, SubstrateClass } from '../types';

export interface OrgPlacementPolicy {
  /** Required data residency for this org's requests, if any. */
  residency?: DataResidency;
  /** Whether this org requires zero data retention. */
  zeroDataRetention?: boolean;
  /** Optional allow-list of substrates this org may use (advisory metadata). */
  allowedSubstrates?: SubstrateClass[];
}

export interface OrgPlacementResolver {
  /**
   * Resolve the placement policy for an organization, or null when the org has
   * no configured policy. Implementations should cache (policy changes are rare;
   * this is on the hot path).
   */
  resolve(organizationId: string | number | undefined): Promise<OrgPlacementPolicy | null>;
}

/** No per-org policy — preserves the explicit-requirements-only behavior. */
class NullOrgPlacementResolver implements OrgPlacementResolver {
  async resolve(): Promise<OrgPlacementPolicy | null> {
    return null;
  }
}

let activeResolver: OrgPlacementResolver = new NullOrgPlacementResolver();

/** Inject the resolver (e.g. a DB-backed one) at application startup. */
export function setOrgPlacementResolver(resolver: OrgPlacementResolver): void {
  activeResolver = resolver;
}

/** The currently active resolver (Null by default). */
export function getOrgPlacementResolver(): OrgPlacementResolver {
  return activeResolver;
}

/** Reset to the default null resolver (tests). */
export function resetOrgPlacementResolver(): void {
  activeResolver = new NullOrgPlacementResolver();
}

/**
 * Merge an org policy into a request as defaults. Explicit request values are
 * never overridden — a caller that passes `dataResidency: 'us'` keeps it even if
 * the org policy says 'eu' (the request is the more specific intent; the org
 * policy is the floor for callers that don't specify). Returns the residency /
 * ZDR that should be in effect.
 */
export function mergeOrgPolicyDefaults(
  current: { dataResidency?: DataResidency; zeroDataRetention?: boolean },
  policy: OrgPlacementPolicy | null,
): { dataResidency?: DataResidency; zeroDataRetention?: boolean } {
  if (!policy) return current;
  return {
    dataResidency:
      current.dataResidency !== undefined ? current.dataResidency : policy.residency,
    zeroDataRetention:
      current.zeroDataRetention !== undefined
        ? current.zeroDataRetention
        : policy.zeroDataRetention,
  };
}
