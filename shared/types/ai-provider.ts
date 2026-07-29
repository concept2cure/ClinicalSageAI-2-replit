/**
 * AI provider choice — typed contract (UI ⇄ /api/platform/ai-providers).
 *
 * Clients may choose which model provider backs their AI features. The platform is
 * Claude-first: the default is always `anthropic`. This contract lets the UI render
 * the selectable providers, show the current tenant default, and set a preference.
 *
 * Selection NEVER overrides hard compliance constraints (data residency / zero
 * retention) — the governed AI gateway still enforces those; provider choice is a
 * preference layered on top.
 *
 * Zero runtime dependencies (pure types). Safe to import from server, client,
 * scripts, and tests.
 *
 * @module shared/types/ai-provider
 */

/** Provider id (mirrors the gateway's ProviderName). */
export type AiProviderId =
  | 'anthropic' // Claude — first-party (DEFAULT)
  | 'bedrock'   // Claude on AWS Bedrock (private-cloud / BAA / zero-retention)
  | 'vertex'    // Claude / Gemini on Google Vertex AI (regional residency)
  | 'openai'    // OpenAI (GPT)
  | 'azure'     // OpenAI on Azure (enterprise estate)
  | 'moonshot'  // Kimi
  | 'local';    // Self-hosted open-weight (air-gappable)

/** Provider family, for grouping/badging in the UI. */
export type AiProviderFamily = 'claude' | 'openai' | 'other';

/** One selectable AI provider for the client. */
export interface AiProviderInfo {
  id: AiProviderId;
  /** Display label. */
  label: string;
  /** Family (claude / openai / other) for grouping + badges. */
  family: AiProviderFamily;
  /** Plain-language description. */
  description: string;
  /** Whether this provider runs in a private-cloud / residency-friendly substrate. */
  privateCloud: boolean;
  /** Whether a client may select this provider (vs internal-only). */
  clientSelectable: boolean;
  /** True for the platform default (Claude / anthropic). */
  isDefault: boolean;
}

/** Response of `GET /api/platform/ai-providers`. */
export interface AiProviderCatalog {
  /** The platform default provider — always Claude (anthropic). */
  defaultProvider: AiProviderId;
  /** The selectable providers. */
  providers: AiProviderInfo[];
  /** The caller tenant's configured default, or null when unset (→ platform default). */
  tenantDefault?: AiProviderId | null;
}

/** Where a resolved provider choice came from. */
export type ProviderResolutionSource = 'request' | 'tenant' | 'platform_default';

/** The outcome of resolving the effective provider for a request. */
export interface ProviderResolution {
  provider: AiProviderId;
  source: ProviderResolutionSource;
  /** Notes (e.g. an invalid override that was ignored). */
  notes: string[];
}

/** Request body for `PUT /api/platform/ai-providers/preference`. */
export interface SetProviderPreferenceRequest {
  /** The provider to set as the tenant default. */
  provider: AiProviderId;
}
