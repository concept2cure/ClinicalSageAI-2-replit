// Vitest/Vite ESM resolution shim — same pattern as server/config/environment.js
// and server/utils/jwtVerify.js. Several first-party `.js` modules
// (server/api/enterprise/routes.js, server/api/enterprise/rbac-routes.js,
// server/api/semantic-search.js, server/api/cmc/index.js) import
// '../middleware/auth.js' with the .js extension, which Node ESM requires and
// which vite's resolver will NOT rewrite to .ts when the importer is itself a
// .js file. This file keeps that specifier resolvable.
//
// NB the sibling shims (environment.js, jwtVerify.js) each claim "production
// builds emit X.js from X.ts and overwrite this shim". No such step exists:
// package.json builds with `vite build && node scripts/build-server.mjs`, and
// build-server.mjs is a single esbuild bundle (entry server/index.ts, bundle:
// true, outfile dist/index.js) with no tsc emit into server/. THIS FILE IS WHAT
// SHIPS. Which is precisely why the twin mattered in production and not only
// under vitest: esbuild resolves an explicit './auth.js' literally, so the 29
// .ts modules that import '../middleware/auth.js' — every bootstrap registrar
// among them — bundled the twin. Confirmed by building both ways and grepping
// dist/index.js: the twin's isPublicRoute bypass is present with it and absent
// with this shim.
//
// ── What used to be here, and what it cost ───────────────────────────────────
// This file was a hand-written LEGACY TWIN of auth.ts, not a shim: ~360 lines
// with its own authenticateToken, requireRole, requirePermission and a
// public-route bypass. Because vite resolves `.js` before `.ts`, EVERY
// extensionless `import { authenticateToken } from '.../middleware/auth'` in a
// test resolved here — so the suite exercised an implementation production does
// not run.
//
// The two had drifted badly. auth.ts authenticates and then runs the chain that
// makes a request safe:
//
//     enforceOrgMembership -> establishRequestTenantScope
//       -> enforceTenantLifecycle -> enforceStorageQuota
//
// which re-checks that the membership behind the JWT's organizationId still
// exists, and opens the tenant AsyncLocalStorage scope that attaches the
// request-scoped DB client. The twin did none of it: it verified the signature,
// set req.user, and called next(). Under RLS_ENFORCE=on every handler reached
// through it then failed with REQUEST_DB_CONTEXT_REQUIRED ("Request-scoped
// database context is required"), which is how this was finally found —
// tests/db/two-tenant-application-rls.dbtest.ts, the suite whose whole job is to
// prove cross-tenant reads are impossible, could not get a single request past
// the auth gate. It also carried an isPublicRoute() bypass that auth.ts
// deliberately does not have (see the "no more dev-mode auth bypasses" note
// there).
//
// Three exports died with the twin — verifyJwt, hasPermission, isPublicRoute.
// Nothing imports them; server/auth/index.ts already carries a note saying they
// are not part of middleware/auth.ts's surface.
export * from './auth.ts';
export { default } from './auth.ts';
