/**
 * DB-backed per-organization AI provider-preference resolver.
 *
 * Reads/writes a tenant's preferred provider from the `preferred_ai_provider`
 * column of `ai_placement_policies` (migrations/20260617_ai_provider_preference.sql)
 * and caches per org. Wired in at startup via setTenantProviderResolver() so the
 * client's per-tenant default persists across restarts. A per-request override
 * still wins, and provider choice never overrides residency/ZDR (gateway-enforced).
 *
 * Fail-open-to-default: if the DB is unavailable or the column/table is absent
 * (pre-migration), resolve() returns null and the platform default (Claude /
 * anthropic) applies — never a less-safe state. Mirrors ./org-placement-db.
 *
 * @module server/services/ai-gateway/providers/provider-preference-db
 */

import { getPool } from '../../../db/runtime';
import { createScopedLogger } from '../../../utils/logger.js';
import type { AiProviderId } from '@shared/types/ai-provider';
import { isClientSelectableProvider, type TenantProviderResolver } from './provider-preference';

const log = createScopedLogger('ai-gateway:provider-preference');

interface CacheEntry {
  provider: AiProviderId | null;
  at: number;
}

export class DbTenantProviderResolver implements TenantProviderResolver {
  private cache = new Map<string, CacheEntry>();
  private readonly ttlMs: number;

  constructor(ttlMs = 5 * 60_000) {
    this.ttlMs = ttlMs;
  }

  async resolve(organizationId: string | number | undefined): Promise<AiProviderId | null> {
    if (organizationId === undefined || organizationId === null) return null;
    const orgId = Number(organizationId);
    if (!Number.isInteger(orgId)) return null; // org ids are integers

    const key = String(orgId);
    const cached = this.cache.get(key);
    if (cached && Date.now() - cached.at < this.ttlMs) return cached.provider;

    let provider: AiProviderId | null = null;
    try {
      const pool: any = getPool();
      const { rows } = await pool.query(
        `SELECT preferred_ai_provider
           FROM ai_placement_policies
          WHERE organization_id = $1
          LIMIT 1`,
        [orgId],
      );
      const value = rows[0]?.preferred_ai_provider;
      // Ignore unknown / no-longer-selectable stored values → platform default applies.
      provider = typeof value === 'string' && isClientSelectableProvider(value) ? value : null;
    } catch (e: any) {
      // Fail open to the platform default — same posture as before this feature.
      log.warn(`[AI Gateway] provider preference lookup failed for org ${key}: ${e?.message}`);
      provider = null;
    }

    this.cache.set(key, { provider, at: Date.now() });
    return provider;
  }

  async setPreference(organizationId: string | number, provider: AiProviderId): Promise<void> {
    const orgId = Number(organizationId);
    if (!Number.isInteger(orgId)) throw new Error('organizationId must be an integer.');
    if (!isClientSelectableProvider(provider)) throw new Error(`Provider "${provider}" is not client-selectable.`);
    const pool: any = getPool();
    await pool.query(
      `INSERT INTO ai_placement_policies (organization_id, preferred_ai_provider)
            VALUES ($1, $2)
       ON CONFLICT (organization_id)
       DO UPDATE SET preferred_ai_provider = EXCLUDED.preferred_ai_provider, updated_at = NOW()`,
      [orgId, provider],
    );
    this.invalidate(orgId);
  }

  /** Clear the cache for one org (after an update), or all orgs. */
  invalidate(organizationId?: string | number): void {
    if (organizationId === undefined) {
      this.cache.clear();
    } else {
      this.cache.delete(String(Number(organizationId)));
    }
  }
}
