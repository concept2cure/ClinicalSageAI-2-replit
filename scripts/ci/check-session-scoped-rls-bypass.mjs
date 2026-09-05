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

/**
 * Strip comments before matching. Prose ABOUT the hazard is not the hazard —
 * this file's own header and the note in innovation-routes.ts both quote the
 * offending form, and flagging them would make the gate cry wolf on its own
 * documentation. Block comments go first, then whole-line `//` and `*`
 * continuations; code lines are left untouched, so a real call is never hidden
 * by a `//` appearing inside a string on that same line.
 */
function stripComments(text) {
  return text
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .split('\n')
    .filter((line) => {
      const t = line.trimStart();
      return !t.startsWith('//') && !t.startsWith('*');
    })
    .join('\n');
}

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
