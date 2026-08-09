/**
 * Contract: /api/users (and its /api/user alias) is mounted behind preAuthScope.
 *
 * ── Why ───────────────────────────────────────────────────────────────────────
 * These mounts sit BEFORE the global /api auth gate in register-platform-routes,
 * so the gate's authMiddleware — and the tenant-scope lever it now runs
 * (establishRequestTenantScope, PR #1282) — never fires for them. The users
 * router is MIXED: pre-auth routes (/login, /register, /logout) alongside
 * authenticated ones (/, /me, /:id, /me/preferences, …), and it verifies JWTs
 * inline rather than via a mount middleware, so it opens no tenant scope itself.
 * Under RLS_ENFORCE=on (the only value production accepts) the pool
 * instrumentation fails closed on any non-infrastructure query with no active
 * scope, so the authenticated user/profile/preferences routes 500'd while login
 * stayed pre-auth.
 *
 * preAuthScope is the correct boundary for the whole mount: it clears the
 * fail-closed guard, carries no role (no policy bypass), and is safe because
 * every table the router touches is RLS-policy-free under
 * migrations/0021_enable_rls_everywhere.sql — users, organizations,
 * organization_users (0021 allowlist) and notification_preferences (no
 * organization_id column) — so the app-level WHERE clauses do the filtering.
 *
 * This gate keeps the mount from silently reverting to a bare mount (→ 500s) or
 * being handed a per-user scope it can't produce inline. Source-level so it runs
 * in the fast unit tier with no app boot.
 */

import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const FILE = 'server/bootstrap/register-platform-routes.ts';

function stripComments(src: string): string {
  return src
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/(^|[^:])\/\/.*$/gm, '$1');
}

/**
 * Argument-list text of the `app.use('<mount>', ...)` call, via plain string
 * search + paren matching — never a RegExp built from the mount (that is the
 * incomplete-escaping pattern CodeQL flags).
 */
function mountCallArgs(src: string, mount: string): string | null {
  const start = src.indexOf(`app.use('${mount}'`);
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

describe('/api/users pre-auth scope (pre-gate carve-out)', () => {
  const src = stripComments(fs.readFileSync(path.join(REPO_ROOT, FILE), 'utf8'));

  for (const mount of ['/api/users', '/api/user']) {
    it(`${mount} is mounted behind preAuthScope (else authed routes fail closed under RLS_ENFORCE=on)`, () => {
      const args = mountCallArgs(src, mount);
      expect(args, `app.use('${mount}', ...) not found in ${FILE}`).not.toBeNull();
      expect(
        args!.includes('preAuthScope'),
        `${mount} must be mounted with preAuthScope: it is registered before the global /api gate, ` +
          `so nothing else opens a scope and its authenticated routes fail closed under RLS_ENFORCE=on`,
      ).toBe(true);
    });
  }
});
