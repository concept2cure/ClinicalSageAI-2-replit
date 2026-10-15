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

import { isProductionEnv } from '../pii-screen';
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

// ── Production provider election (ADR-0014 §1, P1-45, 2026-10-01) ────────────
//
// Until 2026-10-01 an organization with no placement row, or a row whose
// allowedProviders is NULL, read as "no vendor constraint": in production its
// content reached OpenAI as soon as Anthropic failed and an OpenAI key was
// configured, and Moonshot whenever its key was. The DPA's "disabled for a
// tenant unless its Order Form lists them" was true only because Terraform
// provisioned no such key. In production it is now this rule, applied by the
// gateway's single placement predicate (tenantPlacementVerdict) to selection,
// every fallback rung, streaming, tool calls, the last-mile re-check and
// embeddings. Outside production nothing changes.

/**
 * Vendors an organization reaches in production without naming them: the ones
 * already on the default sub-processor list (Anthropic; AWS for Bedrock) or
 * involving no third party (the self-hosted lane).
 */
export const PRODUCTION_DEFAULT_PROVIDERS: ReadonlySet<ProviderName> = new Set<ProviderName>([
  'anthropic',
  'bedrock',
  'local',
]);

/** Never a production lane, for any organization, under any election (ADR-0014 §1.3). */
export const NEVER_IN_PRODUCTION_PROVIDERS: ReadonlySet<ProviderName> = new Set<ProviderName>(['moonshot']);

/** True when `provider` may not run in this environment at all (Moonshot, in production). */
export function isProviderExcludedInEnvironment(
  provider: ProviderName,
  env: NodeJS.ProcessEnv = process.env,
): boolean {
  return isProductionEnv(env) && NEVER_IN_PRODUCTION_PROVIDERS.has(provider);
}

/**
 * Why `provider` may not receive an organization's content under the
 * production provider election, or null when it may. Always null outside
 * production.
 *
 * `elected` is the organization's stored allowedProviders — undefined when it
 * has no placement policy, its row lists none, its policy could not be read, or
 * the request carries no organization. In production:
 *  - Moonshot is refused, listed or not;
 *  - anthropic, bedrock and local are allowed by default;
 *  - openai, azure and vertex are allowed only when `elected` names them.
 * The organization's own list still narrows the default set; that is the
 * tenant allow-list the gateway applies separately (and which a public-source
 * opt-in may lift). This election is not liftable: it says which vendors may
 * receive anything of the organization's at all.
 */
export function providerElectionRefusal(
  provider: ProviderName,
  elected: readonly ProviderName[] | undefined,
  env: NodeJS.ProcessEnv = process.env,
): string | null {
  if (!isProductionEnv(env)) return null;
  if (NEVER_IN_PRODUCTION_PROVIDERS.has(provider)) {
    return `${provider} is not a production AI service for any organization (ADR-0014 §1)`;
  }
  if (PRODUCTION_DEFAULT_PROVIDERS.has(provider) || elected?.includes(provider)) return null;
  return (
    `${provider} is not an AI service the organization has elected; in production OpenAI, Azure and ` +
    "Vertex are used only when the organization's placement policy names them (ADR-0014 §1)"
  );
}

/**
 * The vendors an organization with this stored list may reach in this
 * environment, or null for no vendor constraint (outside production, when it
 * lists none). The set {@link providerElectionRefusal} and the tenant
 * allow-list admit together for a tenant payload.
 */
export function effectiveAllowedProviders(
  elected: readonly ProviderName[] | null | undefined,
  env: NodeJS.ProcessEnv = process.env,
): ProviderName[] | null {
  if (!isProductionEnv(env)) return elected ? [...elected] : null;
  const base = elected ?? [...PRODUCTION_DEFAULT_PROVIDERS];
  return base.filter(p => !NEVER_IN_PRODUCTION_PROVIDERS.has(p));
}

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
   * Vendors this org has elected — Claude, OpenAI, a private-cloud lane or its
   * own models. Empty = none. Absent means different things by environment
   * (see {@link providerElectionRefusal}): outside production, no vendor
   * constraint; in production, the default set only (anthropic, bedrock,
   * local). The DPA says OpenAI and Moonshot are disabled for a tenant unless
   * its Order Form lists them; this is where the election is recorded, and in
   * production Moonshot is refused even when listed (ADR-0014 §1).
   */
  allowedProviders?: ProviderName[];
  /**
   * May a request whose payload is provably public-source (see
   * GatewayRequest.payloadProvenance) reach a shared frontier API even when the
   * floor above would exclude it? Also the tenant's opt-in to Anthropic-hosted
   * web search and fetch (server-tool-policy.ts). Default false.
   */
  publicSourceFrontier?: boolean;
  /**
   * May public-source requests be made for this org at all? Off means:
   *  - citation verification (citation-verification-service.ts) sends nothing
   *    to NCBI or CrossRef and reports `unverifiable`, never `verified`;
   *  - Anthropic-hosted web search and fetch are withheld (server-tool-policy.ts).
   * The integration clients AnA's research tools call (integrations/*) do not
   * read it yet; that is the public-source lane's work (plan WS14). Not read by
   * model routing.
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
