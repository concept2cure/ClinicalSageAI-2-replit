/**
 * Contract: the systemic RLS route-layer fix stays wired.
 *
 * ── What this protects ────────────────────────────────────────────────────────
 * Under RLS_ENFORCE=on (the only value production accepts) the instrumented pool
 * FAILS CLOSED on any non-infrastructure query issued with no active tenant
 * scope. PR #1282 made ~80% of the API stop 500'ing by turning the already-
 * verified `req.user` identity into a real tenant scope at the one place every
 * authenticated route passes through — the auth boundary — via the shared
 * `establishRequestTenantScope` lever. That fix rests on a few load-bearing
 * invariants that are invisible at any single call site and easy to regress in
 * an unrelated refactor. If any of them breaks, the failure is a whole-
 * application outage (every authed DB touch 500s) or, for the carve-outs, a
 * cross-tenant admin console silently scoped to the caller's org.
 *
 * Runtime proof that the lever itself opens a scope lives in
 * server/middleware/__tests__/auth-establishes-scope.integration.test.ts and
 * server/middleware/__tests__/establishRequestTenantScope.test.ts. THIS gate
 * guards the structural wiring around it — the parts a green unit test on the
 * helper cannot see:
 *
 *   1. The lever is invoked from ALL THREE entry points that run on the request
 *      path (authMiddleware, authenticateToken, requireTenantContext). Dropping
 *      it from any one silently returns that path to a bare `next()` → 500s.
 *   2. The global `/api` auth gate is registered BEFORE every tenant route
 *      group, so its authMiddleware (and thus the lever) actually runs ahead of
 *      them. Re-order the composition root and later groups bypass the gate.
 *   3. The gate delegates to authMiddleware for non-open routes.
 *   4. The pre-gate SYSTEM consoles keep their explicit system scope — a
 *      per-user scope (or none) would restrict/deny their cross-tenant reads.
 *
 * Source-level, not runtime: the whole point is to catch the regression without
 * a live Postgres + full app boot, in the fast unit tier, the moment the wiring
 * changes.
 */

import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

/** Strip line + block comments so commented-out code can't satisfy the gate. */
function stripComments(src: string): string {
  return src
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/(^|[^:])\/\/.*$/gm, '$1');
}

function read(rel: string): string {
  return stripComments(fs.readFileSync(path.join(REPO_ROOT, rel), 'utf8'));
}

/**
 * Return the argument-list text of the `app.use('<mount>', ...)` call for a
 * mount prefix (from the opening paren to its matching close), or null. Uses
 * plain string search + paren matching — deliberately NOT a RegExp built from
 * `mount`, which would require escaping the mount's `/` (and any future
 * metacharacter) and is exactly the incomplete-escaping pattern CodeQL flags.
 */
function mountCallArgs(src: string, mount: string): string | null {
  const needle = `app.use('${mount}'`;
  const start = src.indexOf(needle);
  if (start === -1) return null;
  const parenStart = src.indexOf('(', start);
  let depth = 0;
  for (let i = parenStart; i < src.length; i++) {
    const ch = src[i];
    if (ch === '(') depth++;
    else if (ch === ')') {
      depth--;
      if (depth === 0) return src.slice(parenStart + 1, i);
    }
  }
  return null;
}

describe('RLS auth-boundary invariant', () => {
  // ── 1. The lever is wired at every request-path entry point ─────────────────
  const LEVER = 'establishRequestTenantScope';
  const ENTRY_POINTS: Array<{ file: string; fn: string }> = [
    { file: 'server/auth.ts', fn: 'authMiddleware' },
    { file: 'server/middleware/auth.ts', fn: 'authenticateToken' },
    { file: 'server/middleware/tenantContext.ts', fn: 'requireTenantContext' },
  ];

  for (const { file, fn } of ENTRY_POINTS) {
    it(`${fn} (${file}) invokes ${LEVER} — else its routes fail closed under RLS_ENFORCE=on`, () => {
      const src = read(file);
      // The middleware must both import and CALL the lever. A bare mention in a
      // type position or a stale import is not enough; require a call.
      expect(
        src.includes(`import { ${LEVER} }`) || new RegExp(`import\\s*\\{[^}]*\\b${LEVER}\\b`).test(src),
        `${file} must import ${LEVER}`,
      ).toBe(true);
      expect(
        new RegExp(`${LEVER}\\s*\\(`).test(src),
        `${fn} in ${file} must call ${LEVER}(...) so authenticated routes run inside a tenant scope`,
      ).toBe(true);
    });
  }

  // ── 2. The global /api gate is registered before every tenant route group ───
  it('registerPlatformRoutes (the global /api gate) runs before all tenant route groups', () => {
    const src = read('server/startup/routes.ts');
    // Index of a registrar's CALL site (name followed by `(`), not its import
    // (name followed by `}`/`,`). registerPlatformRoutes mounts the gate.
    const callIndex = (name: string): number => src.search(new RegExp(`${name}\\s*\\(`));

    const gateIdx = callIndex('registerPlatformRoutes');
    expect(gateIdx, 'registerPlatformRoutes call not found in startup/routes.ts').toBeGreaterThan(-1);

    const TENANT_GROUPS = [
      'registerCoreRoutes',
      'registerRegulatoryRoutes',
      'registerDocumentRoutes',
      'registerAiRoutes',
      'registerConcept2CureRoutes',
      'registerAdminRoutes',
      'registerGovernanceRoutes',
      'registerIndLifecycleRoutes',
      'registerTenantRoutes',
      'registerProjectRoutes',
      'registerClinicalIntelRoutes',
      'registerAdvancedPlatformRoutes',
      'registerInlineEarlyRoutes',
      'registerInlineAnaIntelligenceRoutes',
      'registerInlineLitCommerceRoutes',
      'registerInlinePlatformFacadesRoutes',
      'registerInlineAiWorkflowRoutes',
      'registerInlineSubmissionWorkflowRoutes',
    ];

    for (const group of TENANT_GROUPS) {
      const idx = callIndex(group);
      if (idx === -1) continue; // group not present in this revision — skip, don't fail
      expect(
        gateIdx,
        `${group} is registered before registerPlatformRoutes; the global /api gate must be first ` +
          `or ${group}'s routes bypass the auth boundary (and its tenant scope)`,
      ).toBeLessThan(idx);
    }
  });

  // ── 3. The gate delegates to authMiddleware for non-open routes ─────────────
  it('the global /api gate delegates to authMiddleware', () => {
    const src = read('server/bootstrap/register-platform-routes.ts');
    expect(
      /app\.use\(\s*['"]\/api['"]/.test(src),
      "register-platform-routes.ts must mount the global gate at app.use('/api', ...)",
    ).toBe(true);
    expect(
      /return\s+authMiddleware\s*\(/.test(src),
      'the global /api gate must delegate non-open routes to authMiddleware',
    ).toBe(true);
  });

  // ── 4. Pre-gate SYSTEM consoles keep their explicit system scope ────────────
  // These mounts sit BEFORE the global gate (or outside /api), so the lever's
  // in-gate SYSTEM_SCOPE_PREFIXES redirect never runs for them; they must apply
  // establishRequestSystemScope directly, or they get a per-user scope / no
  // scope and their cross-tenant reads break.
  const SYSTEM_MOUNTS = [
    '/api/setup',
    '/scim/v2',
    '/api/admin/scim-tenants',
  ];

  for (const mount of SYSTEM_MOUNTS) {
    it(`${mount} is mounted behind establishRequestSystemScope (cross-tenant carve-out)`, () => {
      const src = read('server/bootstrap/register-platform-routes.ts');
      const args = mountCallArgs(src, mount);
      expect(args, `app.use('${mount}', ...) not found in register-platform-routes.ts`).not.toBeNull();
      expect(
        args!.includes('establishRequestSystemScope'),
        `${mount} must be mounted with establishRequestSystemScope so its cross-tenant reads ` +
          `run under the system scope, not the caller's org (or fail closed)`,
      ).toBe(true);
    });
  }

  it('register-platform-routes.ts imports establishRequestSystemScope', () => {
    const src = read('server/bootstrap/register-platform-routes.ts');
    expect(
      /import\s*\{[^}]*\bestablishRequestSystemScope\b/.test(src),
      'register-platform-routes.ts must import establishRequestSystemScope',
    ).toBe(true);
  });
});
