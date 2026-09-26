/**
 * Provider placement registry.
 *
 * Every provider the gateway can route to runs inference on one of three
 * substrates (shared frontier API, frontier-in-your-cloud, or self-hosted),
 * in one or more regions, with or without a zero-data-retention guarantee.
 * Those three facts decide which compliance requirements a tenant can be
 * served under:
 *
 *   - A tenant requiring EU data residency can only use a provider whose
 *     placement includes the 'eu' region (or a self-hosted deployment).
 *   - A tenant requiring zero data retention (BAA-grade) can only use a
 *     provider whose placement is marked zeroDataRetention, i.e. a
 *     private-cloud deployment with a no-retention contract, or self-hosted.
 *   - An air-gapped tenant can only use a self_hosted provider.
 *
 * The gateway consults this registry in selectModel() so a request that
 * declares dataResidency / zeroDataRetention never routes to a provider that
 * cannot honor it, and records the resolved substrate/region in the audit log.
 *
 * The flags here describe the *contractual capability* of each substrate. The
 * shared frontier providers (openai/anthropic/moonshot) are marked
 * zeroDataRetention:false by default: enabling a real ZDR agreement on a
 * shared API is an operator action (a signed addendum + the provider-side
 * setting), tracked by flipping the relevant entry — not assumed here.
 *
 * @module server/services/ai-gateway/providers/placement
 */

import type {
  ProviderName,
  SubstrateClass,
  DataResidency,
} from '../types';

export interface ProviderPlacement {
  provider: ProviderName;
  substrate: SubstrateClass;
  /**
   * Regions this provider can be pinned to, as residency codes. 'global' means
   * the provider does not offer a residency guarantee (shared multi-region).
   * Self-hosted uses 'on_prem'. Bedrock and Vertex residency is derived from
   * the region their client calls; Azure's only from a declaration.
   */
  regions: Array<DataResidency | 'global'>;
  /** True only when the substrate contractually does not retain payloads. */
  zeroDataRetention: boolean;
  /** Operator-facing note on what unlocks / constrains this placement. */
  note: string;
}

/**
 * The region each private-cloud client actually calls. clients.ts builds the
 * clients from these same functions, so the residency this registry claims is
 * always derived from the region requests are sent to — never from a separate
 * declaration that can disagree with it. Until 2026-09-25 Vertex claimed
 * ['us', 'eu'] by default while its client called us-east5: an EU-resident
 * tenant was "compliant" on a US endpoint (docs/evidence/D6/2026-09-25-tenant-boundary/).
 */
export function bedrockClientRegion(env: NodeJS.ProcessEnv = process.env): string {
  // The Bedrock SDK's own default when no region is configured.
  return env.AI_BEDROCK_REGION || env.AWS_REGION || 'us-east-1';
}

export function vertexClientRegion(env: NodeJS.ProcessEnv = process.env): string {
  return env.AI_VERTEX_REGION || 'us-east5';
}

/**
 * The residency code a cloud region serves (AWS and GCP region names), or null
 * when it maps to none of 'us' / 'eu' / 'apac' — a region this registry cannot
 * vouch for guarantees no residency at all.
 */
export function residencyOfCloudRegion(region: string | undefined): DataResidency | 'global' | null {
  if (!region) return null;
  const r = region.trim().toLowerCase();
  if (r === 'global') return 'global';
  if (r === 'us' || /^us-/.test(r)) return 'us';
  if (r === 'eu' || /^(eu-|europe-)/.test(r)) return 'eu';
  if (r === 'apac' || /^(ap-|asia-|australia-)/.test(r)) return 'apac';
  return null;
}

function derivedRegions(region: string): Array<DataResidency | 'global'> {
  const code = residencyOfCloudRegion(region);
  return code ? [code] : ['global'];
}

/** A residency list declared in env, or the fallback when none is declared. */
function envRegions(
  envVar: string,
  fallback: Array<DataResidency | 'global'>,
): Array<DataResidency | 'global'> {
  const raw = process.env[envVar];
  if (!raw) return fallback;
  const parsed = raw
    .split(',')
    .map(s => s.trim().toLowerCase())
    .filter(Boolean) as Array<DataResidency | 'global'>;
  return parsed.length > 0 ? parsed : fallback;
}

/**
 * Default placement for every provider. Private-cloud residency is derived from
 * the region the client calls (above); the AI_*_RESIDENCY variables are a
 * declaration the production boot check holds against it
 * ({@link assertPlacementRegistryConsistency}). Azure's endpoint does not name
 * its region, so Azure claims residency only when declared, and no residency
 * otherwise.
 */
export function buildPlacementRegistry(): Record<ProviderName, ProviderPlacement> {
  return {
    openai: {
      provider: 'openai',
      substrate: 'frontier_shared',
      regions: ['global'],
      zeroDataRetention: process.env.OPENAI_ZERO_RETENTION === 'true',
      note: 'Shared frontier API. ZDR requires a signed zero-retention agreement; set OPENAI_ZERO_RETENTION=true once it is in force.',
    },
    anthropic: {
      provider: 'anthropic',
      substrate: 'frontier_shared',
      regions: ['global'],
      zeroDataRetention: process.env.ANTHROPIC_ZERO_RETENTION === 'true',
      note: 'Shared first-party Claude API. ZDR requires a signed agreement; set ANTHROPIC_ZERO_RETENTION=true once in force.',
    },
    moonshot: {
      provider: 'moonshot',
      substrate: 'frontier_shared',
      regions: ['global'],
      zeroDataRetention: false,
      note: 'Shared frontier API (Kimi). Cross-provider fallback only; not approved for residency- or ZDR-constrained tenants.',
    },
    bedrock: {
      provider: 'bedrock',
      substrate: 'frontier_private',
      regions: derivedRegions(bedrockClientRegion()),
      // Default true: Amazon Bedrock does not store or log prompts and
      // completions, and model providers have no access to them — a property
      // of the service, which DPA §6.2 relies on ("Yes by default"). Set
      // AI_BEDROCK_ZERO_RETENTION=false if model-invocation logging is enabled.
      zeroDataRetention: process.env.AI_BEDROCK_ZERO_RETENTION !== 'false',
      note: 'Claude in your AWS account. No prompt storage or model-training on customer data by default; residency follows the region the client calls (AI_BEDROCK_REGION / AWS_REGION).',
    },
    vertex: {
      provider: 'vertex',
      substrate: 'frontier_private',
      regions: derivedRegions(vertexClientRegion()),
      // Explicit only: zero retention on Vertex depends on project-side
      // settings (caching, abuse-monitoring logging), so it is claimed only
      // when the operator records it with AI_VERTEX_ZERO_RETENTION=true.
      zeroDataRetention: process.env.AI_VERTEX_ZERO_RETENTION === 'true',
      note: 'Claude / Gemini in your GCP project. Residency follows the region the client calls (AI_VERTEX_REGION); zero retention only when AI_VERTEX_ZERO_RETENTION=true.',
    },
    azure: {
      provider: 'azure',
      substrate: 'frontier_private',
      regions: envRegions('AI_AZURE_RESIDENCY', ['global']),
      // Explicit only: Azure OpenAI retains prompts for abuse monitoring unless
      // the tenant is approved for modified abuse monitoring.
      zeroDataRetention: process.env.AI_AZURE_ZERO_RETENTION === 'true',
      note: 'OpenAI models in your Azure tenant. Residency only when declared with AI_AZURE_RESIDENCY; zero retention only when AI_AZURE_ZERO_RETENTION=true (modified abuse monitoring approved).',
    },
    local: {
      provider: 'local',
      substrate: 'self_hosted',
      regions: ['on_prem'],
      zeroDataRetention: true,
      note: 'Open-weight models served on infrastructure you control (vLLM/LiteLLM). Data never leaves the deployment; the only air-gappable substrate.',
    },
  };
}

let cachedRegistry: Record<ProviderName, ProviderPlacement> | null = null;

/** Resolve the placement for a single provider (memoized per process). */
export function resolvePlacement(provider: ProviderName): ProviderPlacement {
  if (!cachedRegistry) cachedRegistry = buildPlacementRegistry();
  return cachedRegistry[provider];
}

/** Reset the memoized registry (tests / env changes). */
export function resetPlacementRegistry(): void {
  cachedRegistry = null;
}

export interface PlacementRequirement {
  /** Required residency, or null/'any' for no constraint. */
  residency?: DataResidency | null;
  /** Whether zero data retention is required. */
  zeroDataRetention?: boolean;
}

/**
 * Does a placement satisfy a tenant's residency + retention requirements?
 *
 * - No requirements → always compliant.
 * - Zero-retention required → placement must be zeroDataRetention.
 * - Residency 'on_prem' → placement must be self_hosted.
 * - Residency region code → placement must serve that region, OR be
 *   self_hosted (on-prem trivially satisfies any single-region requirement).
 */
export function isPlacementCompliant(
  placement: ProviderPlacement,
  req: PlacementRequirement,
): boolean {
  const needsZdr = req.zeroDataRetention === true;
  const residency = req.residency && req.residency !== 'any' ? req.residency : null;

  if (!needsZdr && !residency) return true;

  if (needsZdr && !placement.zeroDataRetention) return false;

  if (residency) {
    if (residency === 'on_prem') {
      return placement.substrate === 'self_hosted';
    }
    if (placement.substrate === 'self_hosted') return true;
    if (!placement.regions.includes(residency)) return false;
  }

  return true;
}

/**
 * Declared private-cloud residency that the configured client region does not
 * serve. Only enabled lanes are judged. Empty when the registry is truthful.
 */
export function placementConfigurationProblems(env: NodeJS.ProcessEnv = process.env): string[] {
  const problems: string[] = [];
  const lanes: Array<{ lane: string; enabled: boolean; declaredVar: string; region: string }> = [
    { lane: 'bedrock', enabled: env.AI_BEDROCK_ENABLED === 'true', declaredVar: 'AI_BEDROCK_RESIDENCY', region: bedrockClientRegion(env) },
    { lane: 'vertex', enabled: env.AI_VERTEX_ENABLED === 'true', declaredVar: 'AI_VERTEX_RESIDENCY', region: vertexClientRegion(env) },
  ];
  for (const { lane, enabled, declaredVar, region } of lanes) {
    const declared = env[declaredVar];
    if (!enabled || !declared) continue;
    const served = residencyOfCloudRegion(region);
    const claims = declared.split(',').map(v => v.trim().toLowerCase()).filter(Boolean);
    const overclaims = claims.filter(code => code !== served);
    if (overclaims.length > 0) {
      problems.push(
        `${declaredVar}=${declared} claims ${overclaims.join(', ')}, but the ${lane} client calls ${region}` +
          (served ? ` (${served})` : ' (no residency code)'),
      );
    }
  }
  return problems;
}

/**
 * Production boot check: refuse to start when a declared private-cloud
 * residency contradicts the region the client calls. The DPA promises that a
 * residency-constrained tenant is served only in its region; a declaration the
 * deployment does not honour would make that promise false on every request.
 * No-op outside production, where the registry already ignores the declaration.
 */
export function assertPlacementRegistryConsistency(env: NodeJS.ProcessEnv = process.env): void {
  if ((env.NODE_ENV || '').toLowerCase() !== 'production') return;
  const problems = placementConfigurationProblems(env);
  if (problems.length > 0) {
    throw new Error(`[ai-placement] declared residency does not match the configured region: ${problems.join('; ')}`);
  }
}
