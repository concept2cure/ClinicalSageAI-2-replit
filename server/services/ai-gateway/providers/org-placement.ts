/**
 * Per-organization AI placement policy.
 *
 * A tenant can require that all of its AI requests run on a particular
 * substrate / vendor / region / retention posture (e.g. "this org is
 * EU-resident, zero-retention, and may use Claude on Bedrock or our own
 * models, never a shared frontier API"). The gateway resolves the org's policy
 * and applies it to every dispatch as a FLOOR: a request may add a constraint
 * the org did not set, but it can never lower one the org did.
 *
 * This module is the storage-agnostic seam. The default resolver returns no
 * policy. A DB-backed resolver (`org-placement-db.ts`, table
 * `ai_placement_policies`) is injected at startup via
 * {@link setOrgPlacementResolver}; it caches per org. Keeping the seam separate
 * from the store lets the gateway depend on the interface, not on a table.
 *
 * History: until 2026-09-25 the merge let an explicit request value win over
 * the org's (a caller passing `zeroDataRetention: false` defeated an org's ZDR
 * requirement at model selection), and `allowedSubstrates` was advisory
 * metadata nothing enforced. Both are now enforced — see
 * docs/evidence/D6/2026-09-25-tenant-boundary/.
 *
 * @module server/services/ai-gateway/providers/org-placement
 */

import type { DataResidency, ProviderName, SubstrateClass } from '../types';

/** The values a stored policy may name — shared by the resolver and the writer. */
export const PLACEMENT_RESIDENCIES: ReadonlySet<DataResidency> = new Set<DataResidency>([
  'any',
  'us',
  'eu',
  'apac',
  'on_prem',
]);
export const PLACEMENT_SUBSTRATES: ReadonlySet<SubstrateClass> = new Set<SubstrateClass>([
  'frontier_shared',
  'frontier_private',
  'self_hosted',
]);
export const PLACEMENT_PROVIDERS: ReadonlySet<ProviderName> = new Set<ProviderName>([
  'openai',
  'anthropic',
  'moonshot',
  'bedrock',
  'vertex',
  'azure',
  'local',
]);

export interface OrgPlacementPolicy {
  /** Required data residency for this org's requests, if any. */
  residency?: DataResidency;
  /** Whether this org requires zero data retention. */
  zeroDataRetention?: boolean;
  /**
   * Substrates this org may use. Absent = no substrate constraint. Empty = none
   * (fail closed: an allow-list that names nothing valid allows nothing).
   */
  allowedSubstrates?: SubstrateClass[];
  /**
   * Vendors this org may use — Claude, OpenAI, Kimi (Moonshot), a private-cloud
   * lane or its own models. Absent = no vendor constraint. Empty = none. The DPA
   * says OpenAI and Moonshot are disabled for a tenant unless its Order Form
   * lists them; this is where that is recorded and enforced.
   */
  allowedProviders?: ProviderName[];
  /**
   * May a request whose payload is provably public-source (see
   * GatewayRequest.payloadProvenance) reach a shared frontier API even when the
   * floor above would exclude it? Default false.
   */
  publicSourceFrontier?: boolean;
  /**
   * May the platform's own public-source fetchers make outbound requests for
   * this org at all? Off means a citation check reports `unverifiable` rather
   * than `verified`. Read by the fetchers, not by model routing.
   */
  publicSourceEgress?: boolean;
}

export interface OrgPlacementResolver {
  /**
   * Resolve the placement policy for an organization, or null when the org has
   * no configured policy. Implementations should cache (policy changes are rare;
   * this is on the hot path) and must THROW when the policy cannot be read —
   * a failed lookup is an unknown policy, never "no policy".
   */
  resolve(organizationId: string | number | undefined): Promise<OrgPlacementPolicy | null>;
  /** Drop a cached policy after it changes (all orgs when omitted). */
  invalidate?(organizationId?: string | number): void;
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
 * Merge an org policy into a request's residency / retention as a floor.
 *
 *  - Zero retention: required if either the org or the request requires it. A
 *    request cannot turn off an org's requirement.
 *  - Residency: the org's, when it has one. A request that names a DIFFERENT
 *    residency cannot be satisfied without breaking one of the two, so it is
 *    flagged as a conflict and the gateway refuses it (DENY_TENANT_POLICY)
 *    rather than silently choosing. A request may name a residency when the
 *    org has none.
 */
export function mergeOrgPolicyDefaults(
  current: { dataResidency?: DataResidency; zeroDataRetention?: boolean },
  policy: OrgPlacementPolicy | null,
): { dataResidency?: DataResidency; zeroDataRetention?: boolean; residencyConflict?: true } {
  if (!policy) return current;

  const zeroDataRetention =
    policy.zeroDataRetention === true || current.zeroDataRetention === true
      ? true
      : current.zeroDataRetention ?? policy.zeroDataRetention;

  const orgResidency = policy.residency && policy.residency !== 'any' ? policy.residency : undefined;
  const requestResidency =
    current.dataResidency && current.dataResidency !== 'any' ? current.dataResidency : undefined;

  if (orgResidency && requestResidency && orgResidency !== requestResidency) {
    return { dataResidency: orgResidency, zeroDataRetention, residencyConflict: true };
  }
  return {
    dataResidency: orgResidency ?? current.dataResidency,
    zeroDataRetention,
  };
}
