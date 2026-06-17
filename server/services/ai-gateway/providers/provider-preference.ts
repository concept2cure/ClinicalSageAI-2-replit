/**
 * Client-facing AI provider preference.
 *
 * The platform is Claude-first: unless told otherwise, every AI request runs on
 * `anthropic` (Claude). This module lets a client CHOOSE a provider — per request
 * (highest precedence) or as a per-tenant default — and resolves the effective
 * provider deterministically:
 *
 *     request override  →  tenant default  →  platform default (anthropic / Claude)
 *
 * The resolved provider is set on `GatewayRequest.provider`, which the governed AI
 * gateway already honors (subject to health + the hard residency/ZDR constraints —
 * provider CHOICE never overrides compliance placement). This module is the
 * storage-agnostic seam, mirroring ./org-placement: the default tenant store is
 * in-memory; a DB-backed store is injected at startup via
 * {@link setTenantProviderResolver}.
 *
 * @module server/services/ai-gateway/providers/provider-preference
 */

import type { ProviderName } from '../types';
import type {
  AiProviderId,
  AiProviderInfo,
  AiProviderCatalog,
  ProviderResolution,
} from '@shared/types/ai-provider';

/** The platform default — always Claude. */
export const PLATFORM_DEFAULT_PROVIDER: AiProviderId = 'anthropic';

/** The provider catalog (client-facing). `clientSelectable` gates what a tenant may pick. */
export const PROVIDER_CATALOG: AiProviderInfo[] = [
  { id: 'anthropic', label: 'Claude (Anthropic)', family: 'claude', description: 'Anthropic Claude — first-party. The platform default.', privateCloud: false, clientSelectable: true, isDefault: true },
  { id: 'bedrock', label: 'Claude on AWS Bedrock', family: 'claude', description: 'Claude via AWS Bedrock — private-cloud, BAA / zero-retention friendly.', privateCloud: true, clientSelectable: true, isDefault: false },
  { id: 'vertex', label: 'Claude on Google Vertex AI', family: 'claude', description: 'Claude via Google Vertex AI — regional data residency.', privateCloud: true, clientSelectable: true, isDefault: false },
  { id: 'openai', label: 'OpenAI (GPT)', family: 'openai', description: 'OpenAI GPT models.', privateCloud: false, clientSelectable: true, isDefault: false },
  { id: 'azure', label: 'OpenAI on Azure', family: 'openai', description: 'OpenAI via Azure — enterprise / Microsoft estate.', privateCloud: true, clientSelectable: true, isDefault: false },
  { id: 'moonshot', label: 'Kimi (Moonshot)', family: 'other', description: 'Moonshot Kimi models.', privateCloud: false, clientSelectable: true, isDefault: false },
  { id: 'local', label: 'Self-hosted (open-weight)', family: 'other', description: 'Self-hosted open-weight models — air-gappable.', privateCloud: true, clientSelectable: false, isDefault: false },
];

const SELECTABLE = new Set<AiProviderId>(PROVIDER_CATALOG.filter((p) => p.clientSelectable).map((p) => p.id));

/** Whether a provider id is one a client may select. */
export function isClientSelectableProvider(id: string): id is AiProviderId {
  return SELECTABLE.has(id as AiProviderId);
}

// ── Tenant default store (storage-agnostic seam; mirrors org-placement) ────────

export interface TenantProviderResolver {
  /** The tenant's default provider, or null when unset. Implementations should cache. */
  resolve(organizationId: string | number | undefined): Promise<AiProviderId | null>;
  /** Persist a tenant default (optional — required for the set-preference API). */
  setPreference?(organizationId: string | number, provider: AiProviderId): Promise<void>;
}

/** Default in-memory store — functional out of the box; swap for a DB-backed store in prod. */
class InMemoryTenantProviderResolver implements TenantProviderResolver {
  private prefs = new Map<string, AiProviderId>();
  async resolve(organizationId: string | number | undefined): Promise<AiProviderId | null> {
    if (organizationId === undefined || organizationId === null) return null;
    return this.prefs.get(String(organizationId)) ?? null;
  }
  async setPreference(organizationId: string | number, provider: AiProviderId): Promise<void> {
    this.prefs.set(String(organizationId), provider);
  }
}

let activeResolver: TenantProviderResolver = new InMemoryTenantProviderResolver();

/** Inject the resolver (e.g. a DB-backed one) at application startup. */
export function setTenantProviderResolver(resolver: TenantProviderResolver): void {
  activeResolver = resolver;
}

/** The currently active tenant-provider resolver. */
export function getTenantProviderResolver(): TenantProviderResolver {
  return activeResolver;
}

/** Reset to the default in-memory resolver (tests). */
export function resetTenantProviderResolver(): void {
  activeResolver = new InMemoryTenantProviderResolver();
}

// ── Resolution ────────────────────────────────────────────────────────────────

/**
 * Resolve the effective provider deterministically:
 * request override → tenant default → platform default (anthropic). A non-selectable
 * or unknown value at any layer is ignored (with a note) so resolution degrades to
 * the next layer rather than failing. Pure.
 */
export function resolveEffectiveProvider(input: {
  requestOverride?: string | null;
  tenantDefault?: string | null;
}): ProviderResolution {
  const notes: string[] = [];
  const consider = (value: string | null | undefined, source: 'request' | 'tenant'): AiProviderId | null => {
    if (value === undefined || value === null || value === '') return null;
    if (isClientSelectableProvider(value)) return value;
    notes.push(`Ignored ${source} provider "${value}" — not a client-selectable provider.`);
    return null;
  };

  const fromRequest = consider(input.requestOverride, 'request');
  if (fromRequest) return { provider: fromRequest, source: 'request', notes };

  const fromTenant = consider(input.tenantDefault, 'tenant');
  if (fromTenant) return { provider: fromTenant, source: 'tenant', notes };

  return { provider: PLATFORM_DEFAULT_PROVIDER, source: 'platform_default', notes };
}

/**
 * Resolve the effective provider for an organization, consulting the tenant store
 * for the default. `requestOverride` (if selectable) always wins.
 */
export async function resolveProviderForOrg(
  organizationId: string | number | undefined,
  requestOverride?: string | null,
): Promise<ProviderResolution> {
  const tenantDefault = await activeResolver.resolve(organizationId);
  return resolveEffectiveProvider({ requestOverride, tenantDefault });
}

/** Build the client-facing provider catalog, optionally with a tenant's current default. */
export function getProviderCatalog(tenantDefault?: AiProviderId | null): AiProviderCatalog {
  return {
    defaultProvider: PLATFORM_DEFAULT_PROVIDER,
    providers: PROVIDER_CATALOG,
    tenantDefault: tenantDefault ?? null,
  };
}

/**
 * Apply a resolved provider to a gateway request as the explicit `provider` (which
 * the gateway honors). An override already on the request is preserved.
 */
export function applyProviderToRequest<T extends { provider?: ProviderName }>(
  request: T,
  resolution: ProviderResolution,
): T {
  if (request.provider) return request;
  return { ...request, provider: resolution.provider as ProviderName };
}
