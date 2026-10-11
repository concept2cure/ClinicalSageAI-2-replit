#!/usr/bin/env node
/**
 * check-session-scoped-rls-bypass.mjs — no NEW session-scoped RLS bypass.
 *
 * ── What this stops ─────────────────────────────────────────────────────────
 * `app.bypass_rls` and `app.is_admin` are escape hatches: 4 SECURITY DEFINER
 * helpers (identity.can_access_org / can_write_org / can_access_program /
 * can_write_program) return TRUE immediately when bypass_rls is 'true', and
 * 142 of ~1016 policies — 80 tables across 15 schemas, including vault.documents,
 * signing.signatures, ectd_v4.regulatory_submissions and identity.users — are
 * decided by those helpers.
 *
 * Set with a plain `SET`, the flag is SESSION-scoped. It therefore survives
 * COMMIT, ROLLBACK and — the part that matters — `client.release()`. Verified
 * against a live database as app_service:
 *
 *     SET app.bypass_rls='true' -> after_commit: true, after_rollback: true
 *     only DISCARD ALL clears it; nothing in this repo issues DISCARD ALL
 *
 * pg-pool's _release() runs no SQL, poolInstrumentation's scopedRelease runs no
 * SQL, and withTenantConnection's cleanup resets app.current_tenant_id /
 * current_org_id / current_user_role — not these two. So a connection returns
 * to the pool with the bypass still on, and the NEXT checkout, serving a
 * different tenant, inherits it. Worse, withTenantConnection would clear the
 * tenant identity and leave the bypass: no tenant context AND full bypass.
 *
 * `SET LOCAL` inside an explicit transaction is the correct form — Postgres
 * discards it at COMMIT/ROLLBACK, so it cannot outlive the work it was for.
 * server/routes/innovation-routes.ts guardQuery() does exactly this.
 *
 * ── Why a baseline instead of a clean sweep ─────────────────────────────────
 * The known offenders are all in server/services/innovation/, whose router is
 * deliberately NOT mounted (see bootstrap/register-advanced-platform-routes.ts)
 * and whose service constructors have zero callers — so this is latent, not a
 * live leak. They cannot be fixed by swapping SET -> SET LOCAL: most are not
 * inside a transaction at all, and SET LOCAL outside one is a no-op with a
 * warning, which would silently REMOVE the bypass those queries rely on. Each
 * needs wrapping in a transaction, which is a real refactor of unmounted code.
 *
 * The urgent part is not those lines; it is that there are seventeen of them to
 * copy from. This gate freezes them and fails on any new one, so the idiom
 * cannot spread into reachable code, and anyone who mounts these services has
 * to fix them first. The baseline may only shrink.
 *
 * Usage: node scripts/ci/check-session-scoped-rls-bypass.mjs
 */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { stripComments } from './lib/strip-comments.mjs';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const TAG = '[ci:session-scoped-rls-bypass]';

/** Files permitted to still contain the session-scoped form, with a count. */
const BASELINE = new Map([
  ['server/services/innovation/regulatory-delta-radar-service.ts', 6],
  ['server/services/innovation/adaptive-reviewer-workspace-service.ts', 8],
  ['server/services/innovation/outcome-based-template-learning-service.ts', 6],
  ['server/services/innovation/auto-traceability-service.ts', 4],
  ['server/services/innovation/submission-readiness-twin-service.ts', 4],
  ['server/services/innovation/evidence-confidence-heatmap-service.ts', 4],
  ['server/services/innovation/regulatory-negotiation-logbook-service.ts', 2],
]);

// `SET app.bypass_rls`, but not `SET LOCAL app.bypass_rls`.
const OFFENDER = /\bSET\s+(?!LOCAL\b)(?:SESSION\s+)?app\.(bypass_rls|is_admin)\b/gi;

const SEARCH_DIRS = ['server', 'scripts', 'shared'];
const SKIP_DIRS = new Set(['node_modules', 'dist', 'build', '.git', 'coverage']);

/** @returns {string[]} repo-relative paths of .ts/.js files under the search dirs */
function walk(dir, acc = []) {
  let entries;
  try {
    entries = fs.readdirSync(path.join(repoRoot, dir), { withFileTypes: true });
  } catch {
    return acc;
  }
  for (const e of entries) {
    const rel = path.join(dir, e.name);
    if (e.isDirectory()) {
      if (!SKIP_DIRS.has(e.name)) walk(rel, acc);
    } else if (/\.(ts|tsx|js|mjs)$/.test(e.name)) {
      acc.push(rel);
    }
  }
  return acc;
}

/*
 * Comments are stripped before matching. Prose ABOUT the hazard is not the
 * hazard — this file's own header and the note in innovation-routes.ts both
 * quote the offending form, and flagging them would make the gate cry wolf on
 * its own documentation.
 *
 * The stripper is the shared, string-aware one (lib/strip-comments.mjs). This
 * gate used to carry its own, which ran /\/\*[\s\S]*?\*\//g over raw text: an
 * Express glob such as '/api/reports/*' opened a phantom comment that ran to
 * the next real comment closer, and every SET in between was deleted before
 * matching (the selftest's former KNOWN GAP 1). Counts are per file, so the
 * blanked-not-deleted output changes no number this gate reports.
 */

/** This file quotes the offending form in its own failure message. */
const SELF = path.relative(repoRoot, fileURLToPath(import.meta.url));

const found = new Map();
for (const rel of SEARCH_DIRS.flatMap((d) => walk(d))) {
  if (rel === SELF) continue;
  const text = stripComments(fs.readFileSync(path.join(repoRoot, rel), 'utf8'));
  const hits = [...text.matchAll(OFFENDER)];
  if (hits.length) found.set(rel, hits.length);
}

// A baselined file is only acceptable while it ALSO guarantees the flags are
// cleared before the connection goes back to the pool. Freezing the count alone
// would let the seventeen sit there forever; this ties the allowance to the fix.
const RELEASE_GUARD = 'releaseWithoutBypass';
const violations = [];
for (const [file, count] of found) {
  if (BASELINE.has(file)) {
    const text = fs.readFileSync(path.join(repoRoot, file), 'utf8');
    if (!text.includes(RELEASE_GUARD)) {
      violations.push(
        `${file}: sets the bypass but never calls ${RELEASE_GUARD}() — the connection ` +
          `returns to the pool still carrying it`,
      );
    }
    const bare = (text.match(/(?<!await\s)\bclient\.release\(\)/g) || []).length;
    if (bare) {
      violations.push(
        `${file}: ${bare} bare client.release() — use await ${RELEASE_GUARD}(client) so the ` +
          `privilege GUCs cannot outlive the borrower`,
      );
    }
  }
  const allowed = BASELINE.get(file) ?? 0;
  if (count > allowed) {
    violations.push(
      allowed === 0
        ? `${file}: ${count} session-scoped bypass set(s) — this file is not in the baseline`
        : `${file}: ${count} session-scoped bypass set(s), baseline allows ${allowed}`,
    );
  }
}

// ── Writers of the isolation switches, in any form (D3, 2026-10-08) ─────────
//
// Tenant policies grant every row when app.rls_enforce is not 'on'; the
// identity.can_* helpers grant on app.bypass_rls; gcc policies on app.is_admin.
// The check above catches only a session-scoped SET of the latter two. This one
// counts every write of any of the three in server code (SET, SET LOCAL, SET
// SESSION, set_config), outside tests, against a named allowlist. RESET is not
// a write: it restores the connection's startup value. Enforcement is turned on
// by the startup option (rlsEnforcement.ts), which is not a statement, and kept
// on by server/db/sessionScope.ts, which pins it whenever a scope is applied and
// clears the bypass switches on release
// (tests/db/isolation-switch-does-not-outlive-request.dbtest.ts).
const SWITCH_WRITE =
  /\bSET\s+(?:LOCAL\s+|SESSION\s+)?app\.(?:rls_enforce|bypass_rls|is_admin)\b|set_config\(\s*['"]app\.(?:rls_enforce|bypass_rls|is_admin)['"]/gi;
/** Server files that may write a switch, with the exact count and why. The BASELINE files above count at their allowance. */
const SWITCH_WRITERS = new Map([
  ['server/db/sessionScope.ts', [5, 'the one pin (3: enforcement to the deployment mode, both bypass switches empty) and the release clear (2: both bypass switches empty)']],
  ['server/routes/innovation-routes.ts', [1, 'SET LOCAL inside guardQuery\'s own transaction; the router is not mounted']],
]);
const isTestPath = (rel) => /(^|\/)(__tests__|__mocks__)\//.test(rel) || /\.(test|spec)\.[cm]?[jt]sx?$/.test(rel);
for (const rel of walk('server')) {
  if (isTestPath(rel)) continue;
  // A file the check above already reports is not reported twice for the same lines.
  if (violations.some((v) => v.startsWith(`${rel}:`))) continue;
  const n = [...stripComments(fs.readFileSync(path.join(repoRoot, rel), 'utf8')).matchAll(SWITCH_WRITE)].length;
  const allowed = SWITCH_WRITERS.get(rel)?.[0] ?? BASELINE.get(rel) ?? 0;
  if (n > allowed) {
    violations.push(
      allowed === 0
        ? `${rel}: ${n} write(s) of an isolation switch (app.rls_enforce / app.bypass_rls / app.is_admin) — not an allowed writer; ` +
            'a scope is applied through server/db/sessionScope.ts, and enforcement is never turned off by the runtime'
        : `${rel}: ${n} write(s) of an isolation switch, allowed ${allowed}`,
    );
  } else if (SWITCH_WRITERS.has(rel) && n < allowed) {
    violations.push(`${rel}: now ${n} isolation-switch write(s) (allowed ${allowed}) — lower SWITCH_WRITERS to lock it in`);
  }
}

// A baseline entry that no longer matches reality is itself a defect: it either
// hides a fix that should have shrunk it, or points at a file that moved.
for (const [file, allowed] of BASELINE) {
  const actual = found.get(file) ?? 0;
  if (actual < allowed) {
    violations.push(
      `${file}: now ${actual} (baseline ${allowed}) — good news; lower the baseline in this file to lock it in`,
    );
  }
}

if (violations.length) {
  console.error(`${TAG} ❌ ${violations.length} problem(s):\n`);
  for (const v of violations) console.error(`  • ${v}`);
  console.error(
    '\n  `SET app.bypass_rls` is SESSION-scoped: it survives COMMIT, ROLLBACK and\n' +
      '  client.release(), so the next checkout — a different tenant — inherits a\n' +
      '  full RLS bypass across 142 policies (vault.documents, signing.*,\n' +
      '  identity.users among them). Nothing in this repo issues DISCARD ALL.\n\n' +
      '  Use `SET LOCAL` inside an explicit transaction, as\n' +
      '  server/routes/innovation-routes.ts guardQuery() does — Postgres then\n' +
      '  discards it at COMMIT/ROLLBACK.\n',
  );
  process.exit(1);
}

const total = [...found.values()].reduce((a, b) => a + b, 0);
console.log(
  `${TAG} OK — no new session-scoped RLS bypass. ${total} baselined occurrence(s) remain in ` +
    `${found.size} unmounted innovation service(s), every one of them releasing through ` +
    `${RELEASE_GUARD}(); the baseline may only shrink.`,
);
