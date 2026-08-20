/**
 * Contract (RLS route-layer tranche 2): the /api/quality and the DB-touching
 * /api/mdx routers are mounted behind requireTenantContext so their handlers
 * run inside a tenant scope.
 *
 * ── The bug this gate exists for ──────────────────────────────────────────────
 * Under RLS_ENFORCE=on the pool instrumentation fails closed on any query with
 * no active AsyncLocalStorage tenant scope (see poolInstrumentation.ts). The
 * scope + req.dbClient are established only by requireTenantContext.
 *
 *   /api/quality (quality-management-api) uses getDb(req) === requestDb(req),
 *     which throws MissingRequestDbContextError without req.dbClient. It was
 *     mounted via mountAll with NO middleware → 500 on every call.
 *   /api/mdx (mdxAnaDrafts, mdxVault) query the global pool
 *     (concept2cure_artifacts, ana drafts) with no scope, mounted with no auth
 *     at all → fail-closed 500 (and req.user was never populated for org
 *     resolution).
 *
 * Fix: requireTenantContext at those mounts. This is the sibling gate to
 * tests/rls-scoped-route-mounts.contract.test.ts (tranche 1: cerv2-sections,
 * batch-draft, ivd-completeness, task-management, review). The scope→query
 * mechanism is proven at runtime by
 * server/db/__tests__/poolInstrumentation-tenant-scope.test.ts; full end-to-end
 * RLS row-filtering runs in CI's real-Postgres integration tier.
 */

import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

/** Strip line + block comments so a commented-out mount can't satisfy the gate. */
function stripComments(src: string): string {
  return src
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/(^|[^:])\/\/.*$/gm, '$1');
}

const read = (rel: string) => stripComments(fs.readFileSync(path.join(REPO_ROOT, rel), 'utf8'));

const PROJECT = 'server/bootstrap/register-project-routes.ts';
const INLINE = 'server/bootstrap/register-inline-routes.ts';

const IMPORT_RE =
  /import\s*\{[^}]*\brequireTenantContext\b[^}]*\}\s*from\s*['"][^'"]*tenantContext/;

describe('RLS-scoped route mounts — tranche 2', () => {
  it('register-project-routes imports requireTenantContext', () => {
    expect(IMPORT_RE.test(read(PROJECT))).toBe(true);
  });

  it('register-inline-routes imports requireTenantContext', () => {
    expect(IMPORT_RE.test(read(INLINE))).toBe(true);
  });

  it('/api/quality is mounted in a mountAll call gated by requireTenantContext', () => {
    const src = read(PROJECT);
    // A mountAll(app, [ ... '/api/quality' ... ], requireTenantContext) call.
    const gated =
      /mountAll\(\s*app\s*,\s*\[[^\]]*['"]\/api\/quality['"][^\]]*\]\s*,\s*requireTenantContext\s*\)/s;
    expect(
      gated.test(src),
      "/api/quality must be mounted via mountAll(..., requireTenantContext) so getDb(req) has a request-scoped client",
    ).toBe(true);
  });

  it('/api/quality is NOT left in an ungated mountAll group', () => {
    const src = read(PROJECT);
    // The ungated Analytics/Planner group must not also carry /api/quality.
    const ungatedWithQuality =
      /mountAll\(\s*app\s*,\s*\[[^\]]*['"]\/api\/quality['"][^\]]*['"]\/api\/analytics['"][^\]]*\]\s*\)/s;
    expect(ungatedWithQuality.test(src)).toBe(false);
  });

  // ── These two cases used to require the gate ON THE BARE PREFIX ───────────
  //
  // They asserted `app.use('/api/mdx', requireTenantContext, <router>)`. That
  // shape was REMOVED on purpose: path-mounted middleware runs for every
  // request matching the prefix, whichever router serves it, so gating the
  // shared `/api/mdx` prefix also gated ~18 routers that were mounted below it
  // with no auth by design — the 500-then-401 alternation in the UAT report.
  //
  // The replacement binds the gate to the two URL sub-trees those routers own.
  // server/bootstrap/__tests__/mdx-prefix-gate.test.ts codifies that and
  // asserts the bare-prefix form is NEVER used — the exact inverse of what
  // these two cases required. Both cannot hold, so CI could not be green until
  // one was retired, and the retired one is the form-assertion below.
  //
  // What replaces it is stronger, not looser. The old test checked the SHAPE of
  // one call. This checks the PROPERTY that makes those routers safe: every
  // path either router actually serves must sit under a gated sub-tree. That is
  // the step nobody was verifying — the sub-tree gate is only sufficient if no
  // route escapes it, and a new route added at, say, `/api/mdx/rollup` would
  // silently bypass the gate while both old and new shape-checks stayed green.
  // Behavioural proof (refuses without tenant context, admits with it) lives in
  // mdx-prefix-gate.test.ts, which drives a real Express app.
  const MDX_SUBTREE_ROUTERS: Array<{ router: string; file: string; subtree: string }> = [
    { router: 'mdxAnaDraftsRoutes', file: 'server/routes/mdx-ana-drafts.ts', subtree: 'ana-drafts' },
    { router: 'mdxVaultRoutes', file: 'server/routes/mdx-vault.ts', subtree: 'vault' },
  ];

  for (const { router, file, subtree } of MDX_SUBTREE_ROUTERS) {
    it(`/api/mdx/${subtree} is gated, and ${router} serves nothing outside it`, () => {
      const src = read(INLINE);

      // 1. The sub-tree gate exists.
      const gate = new RegExp(
        `app\\.use\\(\\s*['"]/api/mdx/${subtree}['"]\\s*,\\s*requireTenantContext\\s*\\)`,
      );
      expect(
        gate.test(src),
        `/api/mdx/${subtree} must be gated by requireTenantContext (${router} queries the global pool unscoped)`,
      ).toBe(true);

      // 2. Every route the router serves is under that sub-tree, so the gate
      //    in (1) actually covers all of them.
      const routerSrc = stripComments(
        fs.readFileSync(path.join(REPO_ROOT, file), 'utf8'),
      );
      const paths = [
        ...routerSrc.matchAll(/router\.(?:get|post|put|patch|delete|all|use)\(\s*['"]([^'"]+)['"]/g),
      ].map(m => m[1]);

      expect(paths.length, `no routes parsed from ${file} — the matcher has drifted`).toBeGreaterThan(0);

      const escaping = paths.filter(p => p !== `/${subtree}` && !p.startsWith(`/${subtree}/`));
      expect(
        escaping,
        `${router} serves ${escaping.join(', ')} outside /${subtree}, which the sub-tree gate does not cover`,
      ).toEqual([]);
    });
  }
});
