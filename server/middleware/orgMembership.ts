/**
 * Live organization-membership re-check, shared across transports.
 *
 * The JWT carries an `organizationId` claim minted at login. Trusting it for
 * the whole token TTL means a user removed from an organization keeps tenant
 * access until the token expires. `authenticateToken` re-checks the
 * `organization_users` row on every HTTP request; the collaboration WebSocket
 * (`server/services/hocuspocus-server.ts`) re-checks it at connect time.
 *
 * This module owns the cache so both transports share ONE cache and ONE
 * invalidation path. Before the extraction the cache lived inside the Express
 * middleware, which is why the WebSocket had no way to consult it — and why
 * `invalidateOrgMembershipCache`, called from the invite / remove / role-change
 * routes, could not have reached a collaboration session even if one had
 * checked.
 *
 * Caching policy (unchanged by the extraction):
 *   - positive AND negative results cached (~60s), so the database sees at
 *     most one lookup per user:org per minute per process;
 *   - membership row gone → 'revoked' (callers fail closed);
 *   - database unavailable / query error → 'indeterminate', NOT cached, so a
 *     recovered database restores enforcement on the next check.
 *
 * `indeterminate` is deliberately not a decision — each transport decides what
 * to do with it, and they decide differently for good reason. See
 * `enforceOrgMembership` (fails open: an infra blip must not take the whole
 * API down) and the collaboration authenticator (an unverifiable membership
 * still cannot open a document, because document authorization needs the same
 * database and fails closed).
 *
 * Lives in its own module with no sibling `.js` compiled twin, for the same
 * reason `./tokenType` does: `server/middleware/auth.ts` has a legacy `auth.js`
 * counterpart, which makes `../middleware/auth` ambiguous at runtime.
 */

import { createScopedLogger } from '../utils/logger';

const logger = createScopedLogger('org-membership');

const ORG_MEMBERSHIP_CACHE_TTL_MS = 60_000;
const ORG_MEMBERSHIP_CACHE_MAX_ENTRIES = 5_000;

interface OrgMembershipCacheEntry {
  isMember: boolean;
  expiresAt: number;
}

const orgMembershipCache = new Map<string, OrgMembershipCacheEntry>();

const membershipCacheKey = (userId: number, organizationId: number): string =>
  `${userId}|${organizationId}`;

/** Mirror of server/auth.ts parseFiniteInt — accepts number | numeric string. */
export function parseFiniteInt(value: unknown): number | null {
  if (typeof value === 'number' && Number.isFinite(value)) return Math.trunc(value);
  if (typeof value === 'string' && value.trim() !== '') {
    const parsed = Number.parseInt(value, 10);
    return Number.isFinite(parsed) ? parsed : null;
  }
  return null;
}

/**
 * Drop cached membership entries. Call from any code path that mutates
 * organization membership (invite accepted, user removed, role changed,
 * org deleted) so the change takes effect immediately instead of after the
 * cache TTL.
 *
 *   invalidateOrgMembershipCache(userId, organizationId) — one membership
 *   invalidateOrgMembershipCache(undefined, organizationId) — whole org
 *   invalidateOrgMembershipCache(userId) — all orgs for a user
 *   invalidateOrgMembershipCache() — clear everything (tests)
 */
export function invalidateOrgMembershipCache(
  userId?: number | string,
  organizationId?: number | string
): void {
  if (userId === undefined && organizationId === undefined) {
    orgMembershipCache.clear();
    return;
  }
  const uid = userId === undefined ? null : parseFiniteInt(userId);
  const oid = organizationId === undefined ? null : parseFiniteInt(organizationId);
  for (const key of Array.from(orgMembershipCache.keys())) {
    const [entryUid, entryOid] = key.split('|');
    const uidMatches = uid === null || entryUid === String(uid);
    const oidMatches = oid === null || entryOid === String(oid);
    if (uidMatches && oidMatches) orgMembershipCache.delete(key);
  }
}

export type OrgMembershipCheckResult = 'member' | 'revoked' | 'indeterminate';

/**
 * Query organization_users for a live membership row. The db module is
 * imported lazily so this module (reached by middleware that 300+ route files
 * import) never pulls a DB connection at module-load time, and so test suites
 * that mock or omit '../db' degrade to 'indeterminate' instead of crashing.
 */
async function queryOrgMembership(
  userId: number,
  organizationId: number
): Promise<OrgMembershipCheckResult> {
  try {
    const [dbModule, schemaModule, drizzle] = await Promise.all([
      import('../db'),
      import('../../shared/schema'),
      import('drizzle-orm'),
    ]);
    const db = (dbModule as { db?: any }).db;
    const organizationUsers = (schemaModule as { organizationUsers?: any }).organizationUsers;
    if (!db || typeof db.select !== 'function' || !organizationUsers) {
      logger.warn('Org membership re-check unavailable (db not initialized)', {
        userId,
        organizationId,
      });
      return 'indeterminate';
    }
    const rows = await db
      .select({ role: organizationUsers.role })
      .from(organizationUsers)
      .where(
        drizzle.and(
          drizzle.eq(organizationUsers.userId, userId),
          drizzle.eq(organizationUsers.organizationId, organizationId)
        )
      )
      .limit(1);
    return rows.length > 0 ? 'member' : 'revoked';
  } catch (error) {
    logger.warn('Org membership re-check failed', {
      userId,
      organizationId,
      error: error instanceof Error ? error.message : String(error),
    });
    return 'indeterminate';
  }
}

/**
 * Synchronous cache probe. Returns the cached decision, or null when there is
 * no live entry. Lets the Express middleware stay synchronous on a cache hit
 * (the common case) instead of forcing every request through a microtask.
 */
export function peekOrgMembership(userId: number, organizationId: number): boolean | null {
  const cached = orgMembershipCache.get(membershipCacheKey(userId, organizationId));
  if (cached && cached.expiresAt > Date.now()) return cached.isMember;
  return null;
}

function cacheMembership(key: string, isMember: boolean): void {
  if (orgMembershipCache.size >= ORG_MEMBERSHIP_CACHE_MAX_ENTRIES) {
    // Size cap: evict the oldest entry (Map preserves insertion order).
    const oldest = orgMembershipCache.keys().next().value;
    if (oldest !== undefined) orgMembershipCache.delete(oldest);
  }
  orgMembershipCache.set(key, { isMember, expiresAt: Date.now() + ORG_MEMBERSHIP_CACHE_TTL_MS });
}

/**
 * Check membership, consulting the cache first. `indeterminate` results are
 * never cached — the caller decides what an unverifiable membership means, and
 * the next check should get a real answer as soon as the database recovers.
 */
export async function checkOrgMembership(
  userId: number,
  organizationId: number
): Promise<OrgMembershipCheckResult> {
  const cached = peekOrgMembership(userId, organizationId);
  if (cached !== null) return cached ? 'member' : 'revoked';

  const result = await queryOrgMembership(userId, organizationId);
  if (result !== 'indeterminate') {
    cacheMembership(membershipCacheKey(userId, organizationId), result === 'member');
  }
  return result;
}
