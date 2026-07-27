/**
 * Organization-membership re-check (audit finding M1) — extracted from
 * server/middleware/auth.ts so it can be imported by any route WITHOUT the
 * `.js`-twin resolver hazard.
 *
 * server/middleware/auth.js is a stale legacy twin. Under Vite/vitest an
 * extensionless `import { enforceOrgMembership } from '../middleware/auth'`
 * resolves to auth.js (Vite prefers .js over .ts for a .js-less specifier),
 * which does NOT contain the membership re-check — so a router that composed
 * canonical auth by importing from '../middleware/auth' would silently drop
 * the AUTH_009 control under test. This module has no `.js` twin, so TypeScript,
 * vitest, tsx, and the production build all resolve the SAME file. auth.ts now
 * imports enforceOrgMembership + invalidateOrgMembershipCache from here and
 * re-exports invalidateOrgMembershipCache, so its public surface is unchanged.
 *
 * The JWT carries an organizationId claim minted at login. Trusting it for the
 * whole token TTL (1d) meant a user removed from an organization kept tenant
 * access for up to 24h. authenticateToken re-checks the organization_users row
 * behind a small in-memory TTL cache:
 *   - positive AND negative results are cached (~60s) so the DB sees at most one
 *     membership lookup per user:org per minute per process;
 *   - membership row gone → 403 (fail-closed);
 *   - DB unavailable / query error → structured warning + fail-open on the JWT
 *     claims (an infra blip must not take the whole API down).
 * Mutation sites (invite / remove / role change) call invalidateOrgMembershipCache
 * so revocation takes effect immediately on the mutating instance; other
 * instances converge within the cache TTL.
 *
 * @module server/middleware/orgMembership
 */

import type { Request, Response, NextFunction } from 'express';
import { createScopedLogger } from '../utils/logger';

const logger = createScopedLogger('auth-middleware');

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
 * imported lazily so this middleware (imported by 300+ route files) never
 * pulls a DB connection at module-load time, and so test suites that mock
 * or omit '../db' degrade to the fail-open path instead of crashing.
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
      logger.warn(
        'Org membership re-check unavailable (db not initialized) — allowing on JWT claims (fail-open)',
        { userId, organizationId }
      );
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
    logger.warn(
      'Org membership re-check failed — allowing on JWT claims (fail-open)',
      {
        userId,
        organizationId,
        error: error instanceof Error ? error.message : String(error),
      }
    );
    return 'indeterminate';
  }
}

function cacheMembership(key: string, isMember: boolean): void {
  if (orgMembershipCache.size >= ORG_MEMBERSHIP_CACHE_MAX_ENTRIES) {
    // Size cap: evict the oldest entry (Map preserves insertion order).
    const oldest = orgMembershipCache.keys().next().value;
    if (oldest !== undefined) orgMembershipCache.delete(oldest);
  }
  orgMembershipCache.set(key, { isMember, expiresAt: Date.now() + ORG_MEMBERSHIP_CACHE_TTL_MS });
}

function sendMembershipRevoked(res: Response): Response {
  return res.status(403).json({
    error: { code: 'AUTH_009', message: 'Organization membership revoked or not found' },
  });
}

/**
 * Post-JWT membership enforcement. Sync fast path on cache hit (keeps the
 * middleware synchronous for repeat requests); one async DB lookup per
 * user:org per TTL window otherwise.
 */
export function enforceOrgMembership(req: Request, res: Response, next: NextFunction): void {
  const userId = parseFiniteInt(req.user?.userId);
  const organizationId = parseFiniteInt(req.user?.organizationId);
  // Tokens without a numeric org claim carry no membership to re-check
  // (e.g. platform-level tokens). Downstream tenant guards still apply.
  if (userId === null || organizationId === null) {
    next();
    return;
  }

  const key = membershipCacheKey(userId, organizationId);
  const cached = orgMembershipCache.get(key);
  if (cached && cached.expiresAt > Date.now()) {
    if (cached.isMember) {
      next();
      return;
    }
    sendMembershipRevoked(res);
    return;
  }

  void queryOrgMembership(userId, organizationId)
    .then(result => {
      if (result === 'indeterminate') {
        // Warning already logged in queryOrgMembership. Not cached — retry
        // on the next request so a recovered DB restores enforcement fast.
        next();
        return;
      }
      cacheMembership(key, result === 'member');
      if (result === 'member') {
        next();
        return;
      }
      logger.warn('Org membership revoked — rejecting authenticated request (fail-closed)', {
        userId,
        organizationId,
      });
      sendMembershipRevoked(res);
    })
    .catch(error => {
      // Belt-and-braces: queryOrgMembership already fails open internally.
      logger.warn('Org membership re-check crashed — allowing on JWT claims (fail-open)', {
        userId,
        organizationId,
        error: error instanceof Error ? error.message : String(error),
      });
      next();
    });
}

// ─────────────────────────────────────────────────────────────────────────────
// Transport-agnostic core
//
// `enforceOrgMembership` above is Express-shaped: it decides, and it answers on
// a Response. The collaboration WebSocket
// (server/services/hocuspocus-server.ts) has no Request/Response pair and needs
// a different policy on 'indeterminate', so it consults the check directly.
//
// These deliberately reuse THIS module's cache rather than keeping their own.
// One cache means `invalidateOrgMembershipCache` — called from the invite /
// remove / role-change routes — takes effect on a live collaboration session
// too, which a second cache would silently break.
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Synchronous cache probe. Returns the cached decision, or null when there is
 * no live entry.
 */
export function peekOrgMembership(userId: number, organizationId: number): boolean | null {
  const cached = orgMembershipCache.get(membershipCacheKey(userId, organizationId));
  if (cached && cached.expiresAt > Date.now()) return cached.isMember;
  return null;
}

/**
 * Check membership, consulting the cache first. `indeterminate` is never
 * cached — the caller decides what an unverifiable membership means, and the
 * next check should get a real answer as soon as the database recovers.
 *
 * Callers differ on purpose. HTTP treats 'indeterminate' as allow (an infra
 * blip must not take the whole API down, and the handler behind it still
 * applies its own tenant filters). The collaboration socket treats it as
 * refuse, because a socket that opens has unmediated read and write access to
 * a document's full CRDT state with no downstream guard behind it.
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
