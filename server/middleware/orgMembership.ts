/**
 * Organization-membership re-check (audit finding M1) — extracted from
 * server/middleware/auth.ts so it can be imported by any route WITHOUT the
 * `.js`-twin resolver hazard.
 *
 * server/middleware/auth.js was a stale legacy twin: under Vite/vitest an
 * extensionless `import { enforceOrgMembership } from '../middleware/auth'`
 * resolved to auth.js (Vite prefers .js over .ts for a .js-less specifier),
 * which did NOT contain the membership re-check — so a router that composed
 * canonical auth by importing from '../middleware/auth' would silently drop
 * the AUTH_009 control under test. Since the M-5 consolidation auth.js is a
 * pure re-export shim of auth.ts, so every resolver executes the same code;
 * this module keeps no `.js` twin either. auth.ts imports enforceOrgMembership
 * + invalidateOrgMembershipCache from here and re-exports
 * invalidateOrgMembershipCache, so its public surface is unchanged.
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
  /**
   * True when the membership decision stands but the orgUuid enrichment did not
   * run — the LEFT JOIN threw and the membership-only fallback answered.
   *
   * The caller must NOT cache such a result. The membership answer is sound
   * (organization_users is the sole authority and it was read), but `orgUuid` is
   * null because enrichment failed, not because the organisation has no uuid.
   * Cached, that null would be served for the whole TTL, and uuid-keyed routes
   * would silently fall through to numeric scoping and return no tenant data —
   * a transient JOIN error turning into minutes of quietly wrong results.
   * Uncached, the next request re-queries and self-heals the moment the JOIN
   * works again, which is exactly how `indeterminate` is already handled.
   */
  enrichmentDegraded: boolean;
}

/**
 * A request that ran on the membership-only fallback: sound about MEMBERSHIP,
 * but with `orgUuid` null, which `tenantSessionVars` turns into an empty
 * `app.current_org_id` for the whole request.
 *
 * Recorded because a degraded run was previously invisible outside a log line.
 * Ledger L148 found the flagship authoring journey running EVERY request this
 * way — its `organizations` stub predated the uuid column, the LEFT JOIN threw
 * 42703 on every call, and the journey proved its tenant-isolation and
 * honest-failure steps with the org session variable empty. Nothing failed,
 * because membership itself was decided correctly; and nothing could notice,
 * because a warning is not something a test can read.
 *
 * A counter plus a bounded sample: the count is the fact, the sample is for
 * diagnosis, and the cap keeps a long-running process from accumulating.
 */
export interface DegradedEnrichment {
  userId: number;
  organizationId: number;
  error: string;
}
const DEGRADED_SAMPLE_CAP = 20;
let degradedCount = 0;
const degradedSample: DegradedEnrichment[] = [];

/** How many requests have answered on the membership-only fallback. */
export function degradedEnrichmentCount(): number {
  return degradedCount;
}
/** Up to DEGRADED_SAMPLE_CAP of the most recent degraded runs, for diagnosis. */
export function degradedEnrichmentSample(): readonly DegradedEnrichment[] {
  return degradedSample;
}
/** Tests only: clear the record between runs. */
export function resetDegradedEnrichments(): void {
  degradedCount = 0;
  degradedSample.length = 0;
}
function noteDegradedEnrichment(entry: DegradedEnrichment): void {
  degradedCount += 1;
  if (degradedSample.length < DEGRADED_SAMPLE_CAP) degradedSample.push(entry);
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
      return { status: 'indeterminate', orgUuid: null, enrichmentDegraded: false };
    }
    // Set when the orgUuid LEFT JOIN failed and the membership-only fallback
    // answered instead. See OrgMembershipQueryResult.enrichmentDegraded.
    let enrichmentDegraded = false;
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
          enrichmentDegraded = true;
          noteDegradedEnrichment({
            userId,
            organizationId,
            error: joinErr instanceof Error ? joinErr.message : String(joinErr),
          });
          return membershipOnly();
        }
      }
    );
    if (rows.length === 0) return { status: 'revoked', orgUuid: null, enrichmentDegraded };
    const orgUuid = typeof rows[0]?.orgUuid === 'string' ? rows[0].orgUuid : null;
    return { status: 'member', orgUuid, enrichmentDegraded };
  } catch (error) {
    logger.warn('Org membership re-check failed — tenant access will be refused', {
      userId,
      organizationId,
      error: error instanceof Error ? error.message : String(error),
    });
    return { status: 'indeterminate', orgUuid: null, enrichmentDegraded: false };
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
    .then(({ status: result, orgUuid, enrichmentDegraded }) => {
      if (result === 'indeterminate') {
        // Warning already logged in queryOrgMembership. Not cached, so the next
        // request retries immediately after recovery. Never authorize a tenant
        // request whose current membership cannot be proven.
        sendMembershipIndeterminate(res);
        return;
      }
      // Cache only a COMPLETE answer. When the orgUuid enrichment fell back, the
      // membership decision is sound but orgUuid is null because the JOIN
      // failed, not because the org has none — caching that would serve the null
      // for the whole TTL and silently drop uuid-keyed routes to numeric
      // scoping, turning a transient error into minutes of empty tenant results.
      // Skipping the cache costs one query per request until the JOIN recovers,
      // and self-heals the moment it does.
      if (!enrichmentDegraded) cacheMembership(key, result === 'member', orgUuid);
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

/* ── The governed-write role gate ─────────────────────────────────────────── */

/**
 * Organization roles permitted to WRITE governed regulatory data — the device
 * profile, the eSTAR registration, the CER/510(k) authoring and export paths.
 * Everything an FDA submission is built from.
 *
 * THE VOCABULARY IS `organization_users.role`, AND ONLY THAT. `req.userRole` is
 * set in exactly two places (server/auth.ts and
 * middleware/establishRequestTenantScope.ts) and both resolve it from that
 * column, whose documented values are `admin | manager | member | viewer` with
 * a default of `member`. So `viewer` is the one org role this set excludes, and
 * it is the whole line: a viewer reads, everyone else in the organization can
 * work.
 *
 * WHAT THIS REPLACED, AND WHY IT MATTERED. Four route files each carried a
 * private copy of this gate admitting `{admin, owner, editor, super_admin}`.
 * Of those four names only `admin` is an organization role — `owner` and
 * `super_admin` belong to the separate PLATFORM role vocabulary, and `editor`
 * appears in no vocabulary in this repository at all. The set therefore
 * resolved, in practice, to admin-only: `manager` was refused despite sitting
 * directly above `member`, and `member` — what SSO provisioning assigns
 * (server/routes/sso.ts) — was refused too. Every user an enterprise client
 * onboarded through SSO was 403'd out of the entire eSTAR workflow, on a gate
 * that read as though it admitted four roles.
 *
 * `owner` and `super_admin` are KEPT deliberately. They cannot appear in
 * `organization_users.role`, so keeping them widens nothing; removing them
 * could lock out a platform administrator if any path ever does surface a
 * platform role here. `editor` is dropped: it is reachable from nowhere.
 */
export const GOVERNED_WRITE_ROLES: ReadonlySet<string> = new Set([
  'admin',
  'manager',
  'member',
  // Platform roles — unreachable through organization_users.role, kept so that
  // narrowing this set can never be what locks a platform admin out.
  'owner',
  'super_admin',
]);

/**
 * Guard for a route that writes governed regulatory data: the caller must hold
 * a writing role AND a usable numeric organization context, which is attached
 * to `req.resolvedOrganizationId` for the handler.
 *
 * ONE implementation, because there were three. The four copies this replaces
 * had already drifted in ways that mattered rather than merely looked untidy:
 * `cerv2-ai-routes` ran `Number(orgId)` with no finiteness check, so a
 * malformed context reached the handler as `NaN` instead of a 400; and
 * `cerv2-export-routes` reversed the precedence to `req.tenantId ||
 * req.tenantContext?.organizationId`, reading a different source than its three
 * siblings for the same decision. A permission rule that exists four times is a
 * permission rule with four answers.
 *
 * Order is deliberate: role first, then organization context. A caller who may
 * not write is told so without the route disclosing whether their org context
 * would have resolved.
 */
export function requireEditorAccess(req: any, res: any, next: () => void) {
  const role = String(req.userRole || req.user?.role || '').toLowerCase();
  if (!role || !GOVERNED_WRITE_ROLES.has(role)) {
    return res.status(403).json({ error: 'Insufficient permissions' });
  }
  // Middleware-derived sources only — never a client-supplied header.
  const orgId = req.tenantContext?.organizationId ?? req.user?.organizationId ?? req.tenantId;
  if (!orgId) {
    return res.status(400).json({ error: 'Organization context required' });
  }
  const numericOrgId = parseFiniteInt(orgId);
  if (numericOrgId === null || numericOrgId <= 0) {
    return res.status(400).json({ error: 'Valid numeric organization context required' });
  }
  req.resolvedOrganizationId = numericOrgId;
  return next();
}
