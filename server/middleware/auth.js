/**
 * PURE RE-EXPORT SHIM — the canonical auth middleware is ./auth.ts.
 *
 * KNOWN_ISSUES_LEDGER M-5 consolidation. This file used to carry a diverged
 * legacy implementation of the same export names, so the runtimes disagreed
 * about which middleware a route ran (measured, scripts/ci/check-js-ts-shadows.mjs):
 * esbuild (prod bundle) and vitest loaded THIS file for explicit
 * '../middleware/auth.js' specifiers while tsx (dev) loaded auth.ts — and
 * vitest resolved even the extensionless '../middleware/auth' here. Tests
 * could therefore exercise a different middleware than production shipped.
 *
 * The file is kept (rather than deleted) because ~26 .ts routes and several
 * plain .js modules import '../middleware/auth.js' explicitly, and vite/vitest
 * resolve an explicit '.js' specifier from a .js importer to the literal .js
 * file without falling back to .ts. As a pure re-export every resolver now
 * executes the same auth.ts code. Do NOT add logic here.
 *
 * Dispositions of the legacy-only behaviors (audited 2026-08-28):
 *  - organizationId required in JWT (403): superseded — canonical
 *    authenticateToken re-checks LIVE org membership (enforceOrgMembership,
 *    AUTH_009) when the claim is present, and establishRequestTenantScope +
 *    RLS fail closed when it is absent; a hard 403 would break platform-level
 *    tokens that legitimately carry no org claim (orgMembership.ts:270-275).
 *  - x-organization-id impersonation warn-log: covered — the canonical chain
 *    never reads that header (org comes only from the JWT + membership row);
 *    the header-forgery logging control lives in middleware/tenantIsolation.ts.
 *  - isPublicRoute bypass: dropped, deliberately NOT ported. The global /api
 *    gate (bootstrap/register-platform-routes.ts) already 401s unauthenticated
 *    requests to every non-allowlisted route before any router-level guard
 *    runs, so no production consumer could depend on the bypass. Porting it
 *    would punch path-shaped unauthenticated holes ('/health', '/auth/login',
 *    …) into every router that mounts canonical auth. Fail closed.
 *  - verifyJwt / hasPermission / isPublicRoute exports: no importer anywhere
 *    in the live tree (the @server/auth barrel takes hasPermission from
 *    middleware/tenantIsolation.ts; the routes that used verifyJwt were
 *    deleted before this consolidation). Dropped rather than re-aliased.
 *  - requireSameOrganization (req.organizationId comparison): production
 *    always ran auth.ts's alias (= requireOrgAccess) via the bare specifier;
 *    the .js semantics were only ever reachable under vitest. No route
 *    imports the name (only the platform-role-escalation test, updated).
 */

export {
  extractBearerToken,
  nonAccessTokenReason,
  invalidateOrgMembershipCache,
  authenticateToken,
  authenticateJWT,
  authenticate,
  requireAuth,
  PLATFORM_SCOPED_ROLES,
  expandRoleClaims,
  requireRole,
  requireOrgAccess,
  requireSameOrganization,
  requirePermission,
  optionalAuth,
  default,
} from './auth.ts';
