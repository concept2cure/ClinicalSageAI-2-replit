/**
 * Contract: routers whose handlers issue tenant-scoped DB queries are mounted
 * behind a middleware that establishes the request's AsyncLocalStorage tenant
 * scope (`requireTenantContext`).
 *
 * ── The bug this gate exists for ──────────────────────────────────────────────
 * Under RLS_ENFORCE=on (the only value production accepts), the pool
 * instrumentation (server/db/poolInstrumentation.ts) FAILS CLOSED on any
 * non-infrastructure query issued with no active tenant scope — it throws
 * `[tenant-rls] FAIL-CLOSED`. The scope is established only by
 * `requireTenantContext`, which wraps `next()` in `runWithTenantScope(...)`
 * (server/middleware/tenantContext.ts) and sets `req.dbClient` for `requestDb`.
 * `authenticateToken` / `authMiddleware` authenticate but call a BARE `next()`
 * — they do NOT open a scope.
 *
 * So a router that uses the global `db`/`pool` (or `requestDb`) and is mounted
 * with only `authenticateToken` returns 500 on every call once RLS is enforced.
 * That is exactly how these five shipped — each was on the "still 500-ing"
 * list — and each is fixed by adding `requireTenantContext` at the mount:
 *
 *   /api/cerv2-sections      (global db, no mount auth at all)
 *   /api/batch-draft         (requestDb, mounted authenticateToken-only)
 *   /api/ivd-completeness     (requestDb, mounted authenticateToken-only)
 *   /api/task-management      (requestDb, mounted authenticateToken-only)
 *   /api/review               (requestDb + global db, mounted authenticateToken-only)
 *
 * ── Why a source-level assertion ──────────────────────────────────────────────
 * The scope→query half is proven at runtime by
 * server/db/__tests__/poolInstrumentation-tenant-scope.test.ts (scope present →
 * query wrapped + permitted; scope absent + RLS on → fail-closed). The
 * establishes-scope half is `requireTenantContext`'s documented job. This gate
 * guards the WIRING that connects them: if someone drops `requireTenantContext`
 * from one of these mounts, the endpoint silently returns to 500 under
 * enforcement. Static assertion keeps that regression visible without needing a
 * live Postgres with migrations/0021 applied (that is CI's integration tier).
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

interface MountCase {
  file: string;
  /** URL prefix as written in the app.use(...) call. */
  mount: string;
}

const CASES: MountCase[] = [
  { file: 'server/bootstrap/register-document-routes.ts', mount: '/api/cerv2-sections' },
  { file: 'server/bootstrap/register-regulatory-routes.ts', mount: '/api/batch-draft' },
  { file: 'server/bootstrap/register-regulatory-routes.ts', mount: '/api/ivd-completeness' },
  { file: 'server/bootstrap/register-regulatory-routes.ts', mount: '/api/task-management' },
  { file: 'server/bootstrap/register-regulatory-routes.ts', mount: '/api/review' },
];

/**
 * Find the `app.use('<mount>', ... )` call for a mount prefix and return its
 * argument list text (from the opening paren to the matching close paren).
 */
function mountCallArgs(src: string, mount: string): string | null {
  const needle = `app.use('${mount}'`;
  const start = src.indexOf(needle);
  if (start === -1) return null;
  // Walk to the matching close paren from the opening paren of app.use(.
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

describe('RLS-scoped route mounts', () => {
  for (const { file, mount } of CASES) {
    it(`${mount} is mounted behind requireTenantContext (else fail-closed 500 under RLS_ENFORCE=on)`, () => {
      const src = stripComments(fs.readFileSync(path.join(REPO_ROOT, file), 'utf8'));
      const args = mountCallArgs(src, mount);
      expect(args, `app.use('${mount}', ...) not found in ${file}`).not.toBeNull();
      expect(
        args!.includes('requireTenantContext'),
        `${mount} must include requireTenantContext in its mount chain so its handlers run inside a tenant scope`,
      ).toBe(true);
    });
  }

  it('both bootstrap files import requireTenantContext', () => {
    for (const file of new Set(CASES.map((c) => c.file))) {
      const src = fs.readFileSync(path.join(REPO_ROOT, file), 'utf8');
      expect(
        /import\s*\{[^}]*\brequireTenantContext\b[^}]*\}\s*from\s*['"][^'"]*tenantContext/.test(src),
        `${file} must import requireTenantContext`,
      ).toBe(true);
    }
  });
});
