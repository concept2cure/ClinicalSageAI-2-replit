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
 *   - DB unavailable / query error → 503 (fail-closed; membership cannot be
 *     proven, so tenant access is not granted).
 * Mutation sites (invite / remove / role change) call invalidateOrgMembershipCache
 * so revocation takes effect immediately on the mutating instance; other
 * instances converge within the cache TTL.
 *
 * @module server/middleware/orgMembership
 */

import type { Request, Response, NextFunction } from 'express';
import { createScopedLogger } from '../utils/logger';
import { runWithTenantScope } from '../db/tenantStore';

const logger = createScopedLogger('auth-middleware');

const ORG_MEMBERSHIP_CACHE_TTL_MS = 60_000;
const ORG_MEMBERSHIP_CACHE_MAX_ENTRIES = 5_000;

interface OrgMembershipCacheEntry {
  isMember: boolean;
  // public.organizations.uuid for this org, resolved in the SAME membership
  // lookup (LEFT JOIN, no extra round-trip). Surfaced onto req.user.organizationUuid
  // so uuid-keyed subsystems (e.g. manufacturing routes) can org-scope regardless of
  // which mint path issued the token — the MFA path stamps organizationUuid into the
  // JWT but refresh/SSO/enterprise/legacy tokens drop it (ledger C-47/C-48 Stage 0).
  // NOTE: this deliberately populates req.user only — it is NOT wired into
  // app.current_org_id, which the identity-FK family would deny-all against until the
  // C-48 unification lands.
  orgUuid: string | null;
  expiresAt: number;
}

const orgMembershipCache = new Map<string, OrgMembershipCacheEntry>();

const membershipCacheKey = (userId: number, organizationId: number): string =>
  `${userId}|${organizationId}`;

/**
 * Mirror of server/auth.ts parseFiniteInt — accepts number | integer string.
 *
 * A string is accepted ONLY if it is entirely an integer. Number.parseInt is a
 * prefix parser: parseInt('3f1c2a10-…', 10) === 3, so a UUID JWT subject used to
 * become a valid-looking integer user id for a DIFFERENT real user, and this
 * middleware then re-checked membership for that wrong user — or 503'd the whole
 * authoring surface (UUID subjects) when the integer-keyed organization_users had
 * no matching row. A non-integer subject now yields null, and the caller's
 * documented null-branch (no numeric identity → no membership to re-check) runs
 * instead. See ledger C-21.
 */
export function parseFiniteInt(value: unknown): number | null {
  if (typeof value === 'number' && Number.isFinite(value)) return Math.trunc(value);
  if (typeof value === 'string' && value.trim() !== '') {
    if (!/^[+-]?\d+$/.test(value.trim())) return null;
    const parsed = Number.parseInt(value.trim(), 10);
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
interface OrgMembershipQueryResult {
  status: OrgMembershipCheckResult;
  orgUuid: string | null;
}

async function queryOrgMembership(
  userId: number,
  organizationId: number
): Promise<OrgMembershipQueryResult> {
  try {
    const [dbModule, schemaModule, drizzle] = await Promise.all([
      import('../db'),
      import('../../shared/schema'),
      import('drizzle-orm'),
    ]);
    const db = (dbModule as { db?: any }).db;
    const organizationUsers = (schemaModule as { organizationUsers?: any }).organizationUsers;
    const organizations = (schemaModule as { organizations?: any }).organizations;
    if (!db || typeof db.select !== 'function' || !organizationUsers) {
      logger.warn(
        'Org membership re-check unavailable (db not initialized) — tenant access will be refused',
        { userId, organizationId }
      );
      return { status: 'indeterminate', orgUuid: null };
    }
    const rows = await runWithTenantScope(
      {
        tenantId: String(organizationId),
        role: null,
        source: 'request',
        caller: 'org-membership-bootstrap',
      },
      async () => {
        const where = drizzle.and(
          drizzle.eq(organizationUsers.userId, userId),
          drizzle.eq(organizationUsers.organizationId, organizationId)
        );
        // The MEMBERSHIP decision is governed SOLELY by the organization_users row.
        const membershipOnly = () =>
          db
            .select({ role: organizationUsers.role })
            .from(organizationUsers)
            .where(where)
            .limit(1);
        // organizations.uuid rides along via LEFT JOIN as enrichment only — it is
        // never the membership authority. When `organizations` is not in the schema
        // at all, skip straight to the membership-only query.
        if (!organizations) return membershipOnly();
        // It IS in the schema, so attempt the enriched JOIN. If the JOIN throws at
        // RUNTIME — e.g. a partial schema whose `organizations` table lacks `uuid`,
        // which the auth-parity contract's fixture deliberately models — fall back to
        // the membership-only query rather than letting a DETERMINABLE membership
        // (member, or revoked when the row is gone) surface as `indeterminate`. A
        // genuine DB outage re-throws from membershipOnly() and the outer catch maps
        // it to `indeterminate` (503, fail-closed). NB the surrounding
        // runWithTenantScope opens no transaction (it is AsyncLocalStorage only), so
        // the failed JOIN leaves no aborted transaction for the fallback to trip on.
        try {
          const enriched = await db
            .select({ role: organizationUsers.role, orgUuid: organizations.uuid })
            .from(organizationUsers)
            .leftJoin(
              organizations,
              drizzle.eq(organizationUsers.organizationId, organizations.id)
            )
            .where(where)
            .limit(1);
          return enriched;
        } catch (joinErr) {
          logger.warn('Org membership enrichment JOIN failed; using membership-only decision', {
            userId,
            organizationId,
            error: joinErr instanceof Error ? joinErr.message : String(joinErr),
          });
          return membershipOnly();
        }
      }
    );
    if (rows.length === 0) return { status: 'revoked', orgUuid: null };
    const orgUuid = typeof rows[0]?.orgUuid === 'string' ? rows[0].orgUuid : null;
    return { status: 'member', orgUuid };
  } catch (error) {
    logger.warn('Org membership re-check failed — tenant access will be refused', {
      userId,
      organizationId,
      error: error instanceof Error ? error.message : String(error),
    });
    return { status: 'indeterminate', orgUuid: null };
  }
}

function cacheMembership(key: string, isMember: boolean, orgUuid: string | null = null): void {
  if (orgMembershipCache.size >= ORG_MEMBERSHIP_CACHE_MAX_ENTRIES) {
    // Size cap: evict the oldest entry (Map preserves insertion order).
    const oldest = orgMembershipCache.keys().next().value;
    if (oldest !== undefined) orgMembershipCache.delete(oldest);
  }
  orgMembershipCache.set(key, {
    isMember,
    orgUuid,
    expiresAt: Date.now() + ORG_MEMBERSHIP_CACHE_TTL_MS,
  });
}

/** Attach the resolved org uuid to req.user (localized cast — the global
 *  Express.Request['user'] type does not declare organizationUuid). Never sets
 *  app.current_org_id; see the cache-entry note. */
function attachOrgUuid(req: Request, orgUuid: string | null): void {
  if (req.user && orgUuid) {
    (req.user as { organizationUuid?: string | null }).organizationUuid = orgUuid;
  }
}

function sendMembershipRevoked(res: Response): Response {
  return res.status(403).json({
    error: { code: 'AUTH_009', message: 'Organization membership revoked or not found' },
  });
}

function sendMembershipIndeterminate(res: Response): Response {
  return res.status(503).json({
    error: { code: 'AUTH_010', message: 'Organization membership could not be verified' },
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
      attachOrgUuid(req, cached.orgUuid);
      next();
      return;
    }
    sendMembershipRevoked(res);
    return;
  }

  void queryOrgMembership(userId, organizationId)
    .then(({ status: result, orgUuid }) => {
      if (result === 'indeterminate') {
        // Warning already logged in queryOrgMembership. Not cached, so the next
        // request retries immediately after recovery. Never authorize a tenant
        // request whose current membership cannot be proven.
        sendMembershipIndeterminate(res);
        return;
      }
      cacheMembership(key, result === 'member', orgUuid);
      if (result === 'member') {
        attachOrgUuid(req, orgUuid);
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
      logger.warn('Org membership re-check crashed — refusing tenant access', {
        userId,
        organizationId,
        error: error instanceof Error ? error.message : String(error),
      });
      sendMembershipIndeterminate(res);
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
 * All tenant-bearing callers must refuse `indeterminate`. A signed JWT proves
 * token issuance, not current organization membership.
 */
export async function checkOrgMembership(
  userId: number,
  organizationId: number
): Promise<OrgMembershipCheckResult> {
  const cached = peekOrgMembership(userId, organizationId);
  if (cached !== null) return cached ? 'member' : 'revoked';

  const { status: result, orgUuid } = await queryOrgMembership(userId, organizationId);
  if (result !== 'indeterminate') {
    cacheMembership(membershipCacheKey(userId, organizationId), result === 'member', orgUuid);
  }
  return result;
}
