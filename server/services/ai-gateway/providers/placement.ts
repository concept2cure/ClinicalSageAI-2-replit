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
   * Self-hosted uses 'on_prem'. Private-cloud regions come from env at deploy
   * time; the defaults here are the conservative baseline.
   */
  regions: Array<DataResidency | 'global'>;
  /** True only when the substrate contractually does not retain payloads. */
  zeroDataRetention: boolean;
  /** Operator-facing note on what unlocks / constrains this placement. */
  note: string;
}

/**
 * Default placement for every provider. Private-cloud regions are read from
 * env where set (so an operator who deploys Bedrock in eu-central can declare
 * residency 'eu') and fall back to the conservative baseline otherwise.
 */
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
      regions: envRegions('AI_BEDROCK_RESIDENCY', ['us']),
      zeroDataRetention: process.env.AI_BEDROCK_ZERO_RETENTION !== 'false',
      note: 'Claude in your AWS account. BAA + no model-training on customer data by default; region pinned via AI_BEDROCK_RESIDENCY / AWS_REGION.',
    },
    vertex: {
      provider: 'vertex',
      substrate: 'frontier_private',
      regions: envRegions('AI_VERTEX_RESIDENCY', ['us', 'eu']),
      zeroDataRetention: process.env.AI_VERTEX_ZERO_RETENTION !== 'false',
      note: 'Claude / Gemini in your GCP project. Regional residency via AI_VERTEX_RESIDENCY; no training on customer data by default.',
    },
    azure: {
      provider: 'azure',
      substrate: 'frontier_private',
      regions: envRegions('AI_AZURE_RESIDENCY', ['us', 'eu']),
      zeroDataRetention: process.env.AI_AZURE_ZERO_RETENTION !== 'false',
      note: 'OpenAI models in your Azure tenant. Regional residency via AI_AZURE_RESIDENCY; abuse-monitoring opt-out is an Azure-side setting.',
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
