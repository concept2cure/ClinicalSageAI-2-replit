# Stage 3 — Request Contract Table (Auth/Tenant)

Stage: Stage 3 — Auth / Tenant / DB Stabilization Without Organ Damage  
Branch / commit reviewed: `cursor/critical-files-management-f38a` @ `cfcf6882` (`cfcf68829ea55dd518f5a06ba7a1e92cf6af121b`)

## Contract comparison: `server/auth.ts` vs `middleware/auth.ts` vs `middleware/auth.js`

| Contract dimension | `server/auth.ts` (`authMiddleware`) | `server/middleware/auth.ts` | `server/middleware/auth.js` |
|---|---|---|---|
| Primary purpose | Global `/api` auth gate in `server/index.ts` | Route-level auth helpers for TS routes | Legacy/compat auth helpers for JS/TS routes and adapter |
| Token requirement | Bearer required | Bearer required (except `optionalAuth`) | Skips auth for `isPublicRoute`; otherwise Bearer required |
| JWT payload requirements | Requires `userId` + `organizationId` | Accepts `userId/id/sub`; `organizationId/orgId` optional in payload shape | Requires `organizationId` present after verify (403 if missing) |
| DB membership check | **Yes** (`organizationUsers`) for role resolution | No | No |
| Role assignment | DB-derived role, fallback `'viewer'` | JWT role/roles only | JWT roles only |
| `req` fields populated | `req.db`, `req.userId`, `req.userRole`, `req.userEmail`, `req.tenantId`, `req.user`, `req.tenantContext` | `req.user` only | `req.user` + `req.organizationId` |
| Error envelope | `{ error: string }` | `{ error: { code, message } }` | `{ status: 'error', message }` |
| Role middleware | `requireAdminRole` / `requireSuperAdminRole` | `requireRole(...allowedRoles)` variadic | `requireRole(requiredRole)` single-role |
| Permission model | None in this file | Flat list model (`resource:action`, `resource:*`, `*`) | Nested object model (`permissions[resource]`) |
| Public route logic | None in middleware itself | None in `authenticateToken`; separate `optionalAuth` exists | Built-in `isPublicRoute` skip in `authenticateJWT` |

## Adapter contract

| File | Behavior | Evidence |
|---|---|---|
| `server/middleware/authAdapter.ts` | Uses `createRequire` + `require('./auth')` and wraps JS middleware exports. This preserves legacy `auth.js` semantics under TypeScript importers. | `server/middleware/authAdapter.ts:12-16`, `:22-48` |

## Canonical declaration for Stage 3

- **Canonical global runtime auth path:** `server/auth.ts` (`authMiddleware`) for global `/api` gate and tenant context shape.
- **Compatibility auth layers (no deletion in Stage 3):**
  - `server/middleware/auth.ts`
  - `server/middleware/auth.js`
  - `server/middleware/authAdapter.ts`

## Route-family dependency map (non-canonical auth consumers)

| Route family (examples) | Imported auth surface |
|---|---|
| `documentAuthoring.routes.ts` | `middleware/authAdapter.ts` |
| `cortex-unified.ts`, `ana-cortex.ts`, `billing.ts`, `predicate-intelligence.ts`, `knowledge-base.ts`, etc. | `middleware/auth.js` |
| `ana-features.ts`, `biostatPlatform.ts`, `change-management.ts`, `templateRoutes.ts`, `submission-twin.ts`, etc. | `middleware/auth.ts` |

## Stage 3 safety notes

1. Do not collapse auth modules in this stage; request-shape and error-envelope contracts differ.
2. Export-shape parity is mandatory before any future consolidation (covered by Stage 3 smoke tests).
3. Preserve legacy aliases used by route importers (`verifyJwt`, `hasPermission`) to avoid runtime breakage.

