/**
 * DB-backed per-organization placement resolver.
 *
 * Reads an org's AI placement policy from the `ai_placement_policies` table
 * (migrations/20260608_ai_placement_policies.sql) and caches it per org. Wired
 * in at startup via setOrgPlacementResolver() so the gateway applies an org's
 * required residency / zero-retention as request defaults.
 *
 * Fail-open-to-explicit: if the DB is unavailable or the table is absent
 * (pre-migration), resolve() returns null and the gateway falls back to
 * explicit-only behavior — i.e. exactly the behavior before this feature, never
 * a less-safe state. Callers that pass dataResidency/zeroDataRetention
 * explicitly are unaffected regardless.
 *
 * @module server/services/ai-gateway/providers/org-placement-db
 */

import { getPool } from '../../../db/runtime';
import { createScopedLogger } from '../../../utils/logger.js';
import type { DataResidency, SubstrateClass } from '../types';
import type { OrgPlacementPolicy, OrgPlacementResolver } from './org-placement';

const log = createScopedLogger('ai-gateway:org-placement');

const VALID_RESIDENCY = new Set<DataResidency>(['any', 'us', 'eu', 'apac', 'on_prem']);

interface CacheEntry {
  policy: OrgPlacementPolicy | null;
  at: number;
}

export class DbOrgPlacementResolver implements OrgPlacementResolver {
  private cache = new Map<string, CacheEntry>();
  private readonly ttlMs: number;

  constructor(ttlMs = 5 * 60_000) {
    this.ttlMs = ttlMs;
  }

  async resolve(organizationId: string | number | undefined): Promise<OrgPlacementPolicy | null> {
    if (organizationId === undefined || organizationId === null) return null;
    const orgId = Number(organizationId);
    if (!Number.isInteger(orgId)) return null; // org ids are integers

    const key = String(orgId);
    const cached = this.cache.get(key);
    if (cached && Date.now() - cached.at < this.ttlMs) return cached.policy;

    let policy: OrgPlacementPolicy | null = null;
    try {
      const pool: any = getPool();
      const { rows } = await pool.query(
        `SELECT required_data_residency, zero_data_retention, allowed_substrates
           FROM ai_placement_policies
          WHERE organization_id = $1
          LIMIT 1`,
        [orgId],
      );
      const row = rows[0];
      if (row) {
        const residency =
          typeof row.required_data_residency === 'string' &&
          VALID_RESIDENCY.has(row.required_data_residency as DataResidency)
            ? (row.required_data_residency as DataResidency)
            : undefined;
        policy = {
          residency,
          zeroDataRetention: row.zero_data_retention === true,
          allowedSubstrates: Array.isArray(row.allowed_substrates)
            ? (row.allowed_substrates as SubstrateClass[])
            : undefined,
        };
      }
    } catch (e: any) {
      // Fail open to explicit-only — same behavior as before this feature.
      log.warn(`[AI Gateway] org placement lookup failed for org ${key}: ${e?.message}`);
      policy = null;
    }

    this.cache.set(key, { policy, at: Date.now() });
    return policy;
  }

  /** Clear the cache for one org (after a policy update), or all orgs. */
  invalidate(organizationId?: string | number): void {
    if (organizationId === undefined) {
      this.cache.clear();
    } else {
      this.cache.delete(String(Number(organizationId)));
    }
  }
}
