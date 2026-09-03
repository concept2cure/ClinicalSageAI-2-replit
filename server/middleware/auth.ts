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
import { nonAccessTokenReason, requireAccessTokenReason } from './tokenType';
import { enforceOrgMembership, invalidateOrgMembershipCache } from './orgMembership';
import { establishRequestTenantScope } from './establishRequestTenantScope';
import { enforceTenantLifecycle } from './tenantLifecycleGuard';
import { enforceStorageQuota } from './storageQuotaGuard';

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
// The implementation lives in ./tokenType so any composition path reaches the
// same file. (./auth.js is a pure re-export shim of this module since the M-5
// consolidation, so every resolver now executes this implementation.)
export { nonAccessTokenReason };

// Re-exported so the external importers (tenants.ts, tenants-simple.ts,
// tenant-users.ts) and this module's default export keep working unchanged.
// The org-membership re-check (audit finding M1) that authenticateToken relies
// on lives in ./orgMembership so route code can compose it directly.
export { invalidateOrgMembershipCache };

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

    // SECURITY: the normal API path requires an explicit `type: 'access'`
    // claim. Refresh / MFA-challenge / MFA-partial tokens are rejected as
    // before, and so is any unknown or absent token class — the expected
    // class is positively asserted, not inferred from the absence of known-bad
    // ones. All first-party issuers stamp access tokens with type: 'access'.
    const nonAccess = requireAccessTokenReason(decoded);
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
      roles: expandRoleClaims(decoded.role, decoded.roles),
      organizationId: decoded.organizationId || decoded.orgId,
      permissions: decoded.permissions || [],
    };
    // SECURITY (M1): the organizationId claim was minted at login; re-check
    // that the membership row still exists so a revoked user loses access
    // within the cache TTL instead of the full token lifetime.
    //
    // Only AFTER membership is confirmed (enforceOrgMembership calls this next
    // on the member path) do we open the tenant scope + attach the request DB
    // client, so the downstream handler runs inside a real RLS boundary instead
    // of the historical bare next() that fail-closed every DB touch under
    // RLS_ENFORCE=on. Revoked/indeterminate members are answered by
    // enforceOrgMembership and never reach this callback. Idempotent; honours
    // the SYSTEM carve-outs. See establishRequestTenantScope.
    //
    // The lifecycle guard runs LAST, once the tenant scope exists, because its
    // posture lookup is itself a tenant-scoped query. Order matters in the other
    // direction too: membership answers "is this user still in this org", the
    // guard answers "is this org still entitled to operate". Both must hold.
    //
    // The storage quota guard runs LAST, and only on content-bearing writes. A
    // suspended tenant must be told it is suspended, not that it is out of disk.
    enforceOrgMembership(req, res, () =>
      establishRequestTenantScope(req, res, () =>
        enforceTenantLifecycle(req, res, () => enforceStorageQuota(req, res, next))
      )
    );
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
 * Roles that carry authority ACROSS tenants.
 *
 * The org-scoped vocabulary is admin / manager / member / viewer (see
 * shared/schema.ts organizationUsers.role). Those are a different trust
 * boundary: self-service signup mints the org-scoped `admin` for the first
 * user of every new organization, so an org admin is an ordinary customer,
 * not staff.
 *
 * Deliberately a superset of requirePlatformAdmin.ts's own set (it omits the
 * `superadmin` spelling that isPlatformStaff in organizations-routes.ts
 * accepts). Over-listing here can only make the guard stricter — a role named
 * in this set is one the org-admin stand-in will refuse to satisfy.
 */
export const PLATFORM_SCOPED_ROLES = new Set([
  'super_admin',
  'platform_admin',
  'superadmin',
  'support',
]);

/**
 * The functional roles an ORG role carries.
 *
 * The product grants exactly four org roles — admin, manager, member, viewer
 * (createUserSchema in server/routes/tenant-users.ts) — and stamps the chosen
 * one into the token as `role`. The guards on the regulatory surface ask for
 * something else entirely: `regulatory-author`, on 289 call sites across
 * submissions, the whole IND lifecycle, global-RI, authoring PDF and master
 * data. Nothing ever granted it.
 *
 * Those routes therefore passed for one caller only — the org admin, through
 * the stand-in below — and 403'd for everyone else. Verified live: an invited
 * colleague (role `member`, which is what every invitation mints) got
 * `403 AUTH_004` from GET /api/submissions while the founder got 200. A
 * platform whose regulatory associates cannot open the Submission Center is
 * not one a regulatory team can use.
 *
 * So the role the guards name is now actually GRANTED, by a stated mapping,
 * instead of resting on an admin stand-in that was never meant to carry it:
 *
 *   admin, owner, manager, member, editor → regulatory-author
 *   viewer                                → nothing (read-only is the point)
 *
 * This grants only the functional role. `admin` is still `admin`: a guard that
 * asks for it, or for any PLATFORM_SCOPED_ROLE, is unaffected, and a member
 * gains nothing an admin-guarded route would check.
 */
const ORG_ROLE_FUNCTIONAL_GRANTS: ReadonlyMap<string, readonly string[]> = new Map([
  ['admin', ['regulatory-author']],
  ['owner', ['regulatory-author']],
  ['manager', ['regulatory-author']],
  ['member', ['regulatory-author']],
  // Legacy org role, still present on older memberships.
  ['editor', ['regulatory-author']],
  ['viewer', []],
]);

/**
 * Expand a token's role claims with the functional roles its org role carries.
 *
 * Applied where req.user is built, so it covers every token this platform
 * mints — password login, dev login, MFA completion, refresh, SSO and SCIM —
 * and tokens issued before this change, without editing ten sign sites.
 * Deduplicated and order-preserving; a token that already names a functional
 * role keeps it.
 */
export function expandRoleClaims(
  role: string | undefined,
  roles: readonly string[] | undefined,
): string[] {
  const declared = roles?.length ? [...roles] : [role || 'user'];
  const granted = declared.flatMap(r => ORG_ROLE_FUNCTIONAL_GRANTS.get(String(r).toLowerCase()) ?? []);
  return [...new Set([...declared, ...granted])];
}

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

    // Org-scoped RBAC: an org "admin" is a superset of the org's operational
    // roles, so it satisfies an org-scoped role guard.
    //
    // It is no longer load-bearing for the regulatory surface. It used to be:
    // `regulatory-author` — the role 289 of this file's requireRole call sites
    // ask for — was granted to nobody, so the stand-in was the only thing
    // letting anyone through, and only an admin. Every other member of a
    // customer organization got 403 from the Submission Center and the whole
    // IND lifecycle. ORG_ROLE_FUNCTIONAL_GRANTS above now grants that role to
    // the org roles that do the work, so the guards pass on their own terms
    // and the stand-in covers only what it was written for.
    //
    // What it must never do is satisfy a PLATFORM-scoped role, and that is now
    // enforced here rather than asked for in a comment. Platform-operator
    // routes use `requirePlatformAdmin` (which has no org-admin bypass), and
    // routing tenants-simple.ts through it is what closed the reproduced
    // cross-tenant deletion. But that left the rule "never write
    // requireRole('super_admin', …)" resting on a comment — and the next
    // developer who writes it would silently re-open the hole, because signup
    // mints the org-scoped `admin` for the first user of every organization:
    //
    //     POST /api/auth/signup  → JWT role:"admin", org 30
    //     DELETE /api/tenants/28 → 200 "…VICTIM PHARMA … permanently deleted"
    //
    // So the stand-in is now SCOPED: it answers org-scoped requirements only.
    // A guard that asks for a platform role gets no org-admin stand-in, whoever
    // writes it. A route that genuinely wants to admit org admins alongside
    // staff still works by listing 'admin' explicitly — `hasRole` is evaluated
    // before the stand-in, so an explicit grant always wins.
    const userRoles = req.user.roles || [req.user.role];
    const hasRole = allowedRoles.some(role => userRoles?.includes(role) || role === '*');

    const requiresPlatformRole = allowedRoles.some(role => PLATFORM_SCOPED_ROLES.has(role));
    const orgAdminStandIn = !requiresPlatformRole && Boolean(userRoles?.includes('admin'));

    if (!hasRole && !orgAdminStandIn) {
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

  // Cross-organization access is PLATFORM staff only.
  //
  // This read `req.user.role === 'admin' || roles.includes('admin')` — the
  // org-scoped admin that signup mints for the first user of every new
  // organization. So the guard whose job is "ensure the user belongs to the
  // requested organization" waved through any customer admin for ANY
  // organization id, including one they had no membership in.
  //
  // Scope of the live exposure, stated honestly: the only consumer is
  // server/routes/cortexRoutes.ts, which is not mounted by any bootstrap
  // registrar and never reads an organization id from request input — so this
  // was latent, not exploitable, and it is not the cross-tenant deletion that
  // an audit reproduced (that was requireRole + tenants-simple.ts, closed by
  // routing those routes through requirePlatformAdmin). It is fixed here
  // because the next router to reach for a middleware named
  // `requireOrgAccess` would inherit the bypass without ever reading it.
  const callerRoles = [req.user.role, ...(req.user.roles || [])].filter(Boolean) as string[];
  if (callerRoles.some(role => PLATFORM_SCOPED_ROLES.has(role))) {
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
        roles: expandRoleClaims(decoded.role, decoded.roles),
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
