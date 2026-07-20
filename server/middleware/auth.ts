/**
 * Authentication Middleware
 *
 * Enterprise-grade authentication and authorization middleware
 * for Concept2Cure V2 platform.
 *
 * @module server/middleware/auth
 */

import type { Request, Response, NextFunction } from 'express';
import { verifyJwtWithRotation } from '../utils/jwtVerify';
import { nonAccessTokenReason } from './tokenType';
import { createScopedLogger } from '../utils/logger';

const logger = createScopedLogger('auth-middleware');

// SECURITY FIX: isDev variable removed — no more dev-mode auth bypasses.

/**
 * Extract the JWT from an Authorization header value, accepting only the
 * canonical `Bearer <token>` form (case-insensitive scheme, exactly one
 * space). Returns null if the header is missing, malformed, or the token
 * is empty. Previously the code used `authHeader.replace('Bearer ', '')`
 * which stripped the substring anywhere in the value and accepted exotic
 * shapes like `Foo Bearer realtoken`.
 */
export function extractBearerToken(authHeader: string | undefined): string | null {
  if (!authHeader) return null;
  const match = /^Bearer\s+(\S+)$/i.exec(authHeader);
  if (!match) return null;
  const token = match[1];
  return token.length > 0 ? token : null;
}

// JWT token payload interface
interface JWTPayload {
  userId?: number | string;
  id?: number | string;
  sub?: number | string;
  email?: string;
  role?: string;
  roles?: string[];
  organizationId?: string;
  orgId?: string;
  permissions?: string[];
  // Token-class discriminators. Non-access tokens (refresh, MFA challenge,
  // MFA-partial) are signed with the same secret as access tokens, so the
  // access path MUST reject them explicitly.
  type?: string;
  mfaPending?: boolean;
}

// Re-exported for callers that import the guard from the auth middleware.
// The implementation lives in ./tokenType (a module with no `.js` twin) so
// that TypeScript and the test/runtime resolvers agree on the same file.
export { nonAccessTokenReason };

// ─────────────────────────────────────────────────────────────────────────────
// Org-membership re-check (audit finding M1)
//
// The JWT carries an organizationId claim minted at login. Trusting it for
// the whole token TTL (1d) meant a user removed from an organization kept
// tenant access for up to 24h. authenticateToken now re-checks the
// organization_users row behind a small in-memory TTL cache:
//   - positive AND negative results are cached (~60s) so the DB sees at most
//     one membership lookup per user:org per minute per process;
//   - membership row gone → 403 (fail-closed);
//   - DB unavailable / query error → structured warning + fail-open on the
//     JWT claims (an infra blip must not take the whole API down).
// Mutation sites (invite / remove / role change) call
// invalidateOrgMembershipCache so revocation takes effect immediately on the
// mutating instance; other instances converge within the cache TTL.
// ─────────────────────────────────────────────────────────────────────────────

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
function parseFiniteInt(value: unknown): number | null {
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

type OrgMembershipCheckResult = 'member' | 'revoked' | 'indeterminate';

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
function enforceOrgMembership(req: Request, res: Response, next: NextFunction): void {
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

// Extend Request type to include user
declare global {
  namespace Express {
    interface Request {
      user?: {
        id?: number | string;
        userId?: number | string;
        email?: string;
        role?: string;
        roles?: string[];
        organizationId?: number | string;
        permissions?: string[];
        tenantId?: number | string;
        industryMode?: string | null;
      };
      tenantContext?: {
        organizationId?: number | string | null;
        organizationUuid?: string | null;
        clientWorkspaceId?: number | string | null;
        module?: string | null;
        userId?: number | string;
        role?: string | null;
      };
      userId?: number | string;
      tenantId?: number | string;
      userRole?: string;
      userEmail?: string;
      /**
       * How the request was authenticated. Set to 'api_key' by
       * validateApiKey (enterprise-security.ts) when an X-API-Key header
       * validates. Absent for normal JWT/session requests. Read by
       * requireScope to decide whether to apply API-key scope enforcement.
       */
      authMethod?: 'api_key';
      /** Scopes granted to the validated API key (validateApiKey). */
      apiScopes?: string[];
      /** Numeric id of the validated API key row (validateApiKey). */
      apiKeyId?: number;
      /** Per-key rate limit pulled from the api_keys row (validateApiKey). */
      apiRateLimit?: number;
    }
  }
}

/**
 * Authenticate JWT token from Authorization header
 */
export const authenticateToken = (req: Request, res: Response, next: NextFunction) => {
  // SECURITY FIX: Dev auto-auth removed. All requests must provide a valid JWT.
  // To test locally, create a user via POST /api/auth/signup then login normally.

  const token = extractBearerToken(req.headers.authorization);

  if (!token) {
    return res.status(401).json({
      error: { code: 'AUTH_001', message: 'No authentication token provided' },
    });
  }

  try {
    const decoded = verifyJwtWithRotation(token) as JWTPayload;

    // SECURITY: a non-access token (refresh / MFA challenge / MFA partial) must
    // never authenticate a normal request, otherwise MFA can be bypassed.
    const nonAccess = nonAccessTokenReason(decoded);
    if (nonAccess) {
      return res.status(401).json({
        error: { code: 'AUTH_008', message: 'Token is not valid for this operation' },
      });
    }

    const subject = decoded.userId ?? decoded.id ?? decoded.sub;
    if (subject === undefined || subject === null || subject === '' || subject === 0) {
      // A signed token with no usable subject claim must not authenticate.
      // Falling back to id=0 (the previous behaviour) would otherwise let
      // queries like `WHERE user_id = 0` produce inconsistent results and
      // confuse downstream RBAC checks.
      return res.status(401).json({
        error: { code: 'AUTH_007', message: 'Token missing required subject claim' },
      });
    }
    req.user = {
      id: subject,
      userId: subject,
      email: decoded.email,
      role: decoded.role || 'user',
      roles: decoded.roles || [decoded.role || 'user'],
      organizationId: decoded.organizationId || decoded.orgId,
      permissions: decoded.permissions || [],
    };
    // SECURITY (M1): the organizationId claim was minted at login; re-check
    // that the membership row still exists so a revoked user loses access
    // within the cache TTL instead of the full token lifetime.
    enforceOrgMembership(req, res, next);
  } catch (error) {
    return res.status(401).json({
      error: { code: 'AUTH_002', message: 'Invalid or expired token' },
    });
  }
};

/**
 * Alias for authenticateToken - used by some routes
 */
export const authenticateJWT = authenticateToken;

/**
 * Alias for authenticateToken - used by some routes
 */
export const authenticate = authenticateToken;

/**
 * Require authentication middleware
 * Alias for authenticateToken for semantic clarity
 */
export const requireAuth = authenticateToken;

/**
 * Require specific role(s) for access
 */
export const requireRole = (...allowedRoles: string[]) => {
  return (req: Request, res: Response, next: NextFunction) => {
    // SECURITY FIX: Dev-mode role bypass removed. Roles are always enforced.

    if (!req.user) {
      return res.status(401).json({
        error: { code: 'AUTH_003', message: 'Authentication required' },
      });
    }

    const userRoles = req.user.roles || [req.user.role];
    const hasRole = allowedRoles.some(role => userRoles?.includes(role) || role === '*');

    if (!hasRole && !userRoles?.includes('admin')) {
      return res.status(403).json({
        error: { code: 'AUTH_004', message: 'Insufficient permissions' },
      });
    }

    next();
  };
};

/**
 * Require organization access
 * Ensures user belongs to the requested organization
 */
export const requireOrgAccess = (req: Request, res: Response, next: NextFunction) => {
  // SECURITY FIX: Dev-mode org bypass removed. Org access is always enforced.

  if (!req.user) {
    return res.status(401).json({
      error: { code: 'AUTH_003', message: 'Authentication required' },
    });
  }

  // Admin users have access to all organizations
  if (req.user.role === 'admin' || req.user.roles?.includes('admin')) {
    return next();
  }

  // Check if request has an orgId parameter that matches user's org
  const requestedOrgId =
    req.params.orgId ||
    req.params.organizationId ||
    req.body?.organizationId ||
    req.query?.organizationId;

  if (requestedOrgId && requestedOrgId !== req.user.organizationId) {
    return res.status(403).json({
      error: { code: 'AUTH_005', message: 'Access to this organization denied' },
    });
  }

  next();
};

/**
 * Require same organization middleware
 */
export const requireSameOrganization = requireOrgAccess;

/**
 * Require specific permission for access
 */
export const requirePermission = (resource: string, action: string) => {
  return (req: Request, res: Response, next: NextFunction) => {
    // SECURITY FIX: Dev-mode permission bypass removed. Permissions are always enforced.

    if (!req.user) {
      return res.status(401).json({
        error: { code: 'AUTH_003', message: 'Authentication required' },
      });
    }

    const permissions = req.user.permissions || [];
    const requiredPermission = `${resource}:${action}`;

    const hasPermission =
      permissions.includes('*') ||
      permissions.includes(requiredPermission) ||
      permissions.includes(`${resource}:*`);

    if (!hasPermission && req.user.role !== 'admin') {
      return res.status(403).json({
        error: { code: 'AUTH_006', message: `Permission '${requiredPermission}' required` },
      });
    }

    next();
  };
};

/**
 * Optional authentication - attaches user if token present, continues if not
 */
export const optionalAuth = (req: Request, res: Response, next: NextFunction) => {
  const token = extractBearerToken(req.headers.authorization);

  if (!token) {
    // SECURITY FIX: Dev auto-auth removed from optional auth path.
    return next();
  }

  try {
    const decoded = verifyJwtWithRotation(token) as JWTPayload;
    const subject = decoded.userId ?? decoded.id ?? decoded.sub;
    // Silently ignore tokens without a usable subject, and never attach a user
    // from a non-access (refresh / MFA challenge / partial) token — optional
    // auth continues unauthenticated rather than attaching a phantom user.
    if (
      !nonAccessTokenReason(decoded) &&
      subject !== undefined && subject !== null && subject !== '' && subject !== 0
    ) {
      req.user = {
        id: subject,
        userId: subject,
        email: decoded.email,
        role: decoded.role || 'user',
        roles: decoded.roles || [decoded.role || 'user'],
        organizationId: decoded.organizationId || decoded.orgId,
        permissions: decoded.permissions || [],
      };
    }
  } catch {
    // Token invalid but that's okay for optional auth
  }

  next();
};

export default {
  authenticateToken,
  authenticateJWT,
  authenticate,
  requireAuth,
  requireRole,
  requireOrgAccess,
  requireSameOrganization,
  requirePermission,
  optionalAuth,
  invalidateOrgMembershipCache,
};
