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

  for (const router of ['mdxAnaDraftsRoutes', 'mdxVaultRoutes']) {
    it(`/api/mdx ${router} is mounted behind requireTenantContext`, () => {
      const src = read(INLINE);
      const re = new RegExp(
        `app\\.use\\(\\s*['"]/api/mdx['"]\\s*,\\s*requireTenantContext\\s*,\\s*${router}\\s*\\)`,
      );
      expect(
        re.test(src),
        `${router} must be mounted with requireTenantContext (it queries the global pool unscoped)`,
      ).toBe(true);
    });
  }
});
