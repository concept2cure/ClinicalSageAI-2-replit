/**
 * DB-backed per-organization placement resolver.
 *
 * Reads an org's AI placement policy from the `ai_placement_policies` table
 * (migrations/20260608_ai_placement_policies.sql, applied on every deploy from
 * C2C_MIGRATION_FILES) and caches it per org. Wired in at startup via
 * setOrgPlacementResolver().
 *
 * Fails CLOSED. A lookup that cannot complete throws, and the throw is not
 * cached: the gateway turns it into an unknown policy, which refuses a tenant
 * payload wherever placement is enforced. Until 2026-09-25 this resolver
 * caught every error, answered "no policy" and cached that for five minutes,
 * so one transient error — or one unscoped query under RLS_ENFORCE=on — lifted
 * an org's residency, zero-retention and substrate floor for every request in
 * the next five minutes (docs/evidence/D6/2026-09-25-tenant-boundary/).
 *
 * The lookup runs in the tenant scope of the org it resolves. The table is
 * under row-level security, so a lookup made in some other tenant's ambient
 * scope would see no row and read as "no policy" — the same fail-open by a
 * different route. The scope carries no role, so it bypasses nothing.
 *
 * @module server/services/ai-gateway/providers/org-placement-db
 */

import { getPool } from '../../../db/runtime';
import { runWithTenantScope } from '../../../db/tenantStore';
import type { DataResidency } from '../types';
import {
  PLACEMENT_PROVIDERS as VALID_PROVIDERS,
  PLACEMENT_RESIDENCIES as VALID_RESIDENCY,
  PLACEMENT_SUBSTRATES as VALID_SUBSTRATES,
  type OrgPlacementPolicy,
  type OrgPlacementResolver,
} from './org-placement';

interface CacheEntry {
  policy: OrgPlacementPolicy | null;
  at: number;
}

/**
 * An allow-list column. NULL means "no constraint" (undefined). Anything else
 * keeps only the values this build recognises — so a list that names nothing
 * valid becomes an empty list, which allows nothing. A typo must narrow, never
 * widen.
 */
function allowList<T extends string>(value: unknown, valid: ReadonlySet<T>): T[] | undefined {
  if (value === null || value === undefined) return undefined;
  if (!Array.isArray(value)) return [];
  return value.filter((v): v is T => typeof v === 'string' && valid.has(v as T));
}

export class DbOrgPlacementResolver implements OrgPlacementResolver {
  private cache = new Map<string, CacheEntry>();
  private readonly ttlMs: number;
  /**
   * Bumped by invalidate(). A lookup caches its result only if the generation
   * it started under is still current, so a read that took its snapshot before
   * a policy change committed cannot put the superseded policy back after the
   * writer invalidated it. Until 2026-09-26 it could, for a full TTL, in the
   * very process that made the change.
   */
  private generations = new Map<string, number>();
  private allGeneration = 0;

  // One minute. The policy writer (org-placement-writer.ts) invalidates this
  // process's cache on commit; every other API process converges within the
  // TTL, so a tightened policy is enforced everywhere within a minute. It was
  // five minutes while nothing wrote the table.
  constructor(ttlMs = 60_000) {
    this.ttlMs = ttlMs;
  }

  async resolve(organizationId: string | number | undefined): Promise<OrgPlacementPolicy | null> {
    if (organizationId === undefined || organizationId === null) return null;
    const orgId = Number(organizationId);
    if (!Number.isInteger(orgId) || orgId <= 0) return null; // org ids are positive integers

    const key = String(orgId);
    const cached = this.cache.get(key);
    if (cached && Date.now() - cached.at < this.ttlMs) return cached.policy;
    const generation = this.generationOf(key);

    // No catch: a failure propagates to the gateway as an unknown policy.
    const { rows } = await runWithTenantScope(
      { tenantId: key, role: null, source: 'job', caller: 'ai-gateway:org-placement' },
      () =>
        (getPool() as any).query(
          `SELECT required_data_residency, zero_data_retention, allowed_substrates,
                  allowed_providers, public_source_frontier, public_source_egress
             FROM ai_placement_policies
            WHERE organization_id = $1
            LIMIT 1`,
          [orgId],
        ),
    );

    const row = rows[0];
    let policy: OrgPlacementPolicy | null = null;
    if (row) {
      const residency =
        typeof row.required_data_residency === 'string' &&
        VALID_RESIDENCY.has(row.required_data_residency as DataResidency)
          ? (row.required_data_residency as DataResidency)
          : undefined;
      policy = {
        residency,
        zeroDataRetention: row.zero_data_retention === true,
        allowedSubstrates: allowList(row.allowed_substrates, VALID_SUBSTRATES),
        allowedProviders: allowList(row.allowed_providers, VALID_PROVIDERS),
        publicSourceFrontier: row.public_source_frontier === true,
        publicSourceEgress: row.public_source_egress === true,
      };
    }

    if (this.generationOf(key) === generation) this.cache.set(key, { policy, at: Date.now() });
    return policy;
  }

  private generationOf(key: string): string {
    return `${this.allGeneration}:${this.generations.get(key) ?? 0}`;
  }

  /** Clear the cache for one org (after a policy update), or all orgs. */
  invalidate(organizationId?: string | number): void {
    if (organizationId === undefined) {
      this.allGeneration += 1;
      this.cache.clear();
    } else {
      const key = String(Number(organizationId));
      this.generations.set(key, (this.generations.get(key) ?? 0) + 1);
      this.cache.delete(key);
    }
  }
}
