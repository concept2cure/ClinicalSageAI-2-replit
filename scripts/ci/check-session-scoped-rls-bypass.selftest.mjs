#!/usr/bin/env node
/**
 * Self-test for ci:session-scoped-rls-bypass
 * (scripts/ci/check-session-scoped-rls-bypass.mjs).
 *
 * On the real tree the gate reports "OK — no new session-scoped RLS bypass. 34
 * baselined occurrence(s) remain in 7 unmounted innovation service(s)", so none
 * of its failure branches fires in normal use. A gate whose failure branch has
 * never been seen has not been tested (CLAUDE.md, working agreement). This
 * shows every one of them firing, shows the gate staying quiet on the
 * near-misses its own header says it must not flag, and records, as KNOWN
 * GAPS, the real defect shapes it does not catch yet.
 *
 * ── How ─────────────────────────────────────────────────────────────────────
 * Each case writes fixture sources into a fresh temp directory and writes a
 * copy of the REAL gate into that tree at the path it has in the repository
 * (scripts/ci/check-session-scoped-rls-bypass.mjs). Two declarations in the
 * copy are rewritten: `repoRoot`, to the fixture tree, and the `BASELINE` Map,
 * to the case's baseline. Nothing else in the gate is changed, so what is
 * judged is the logic CI runs. Placing the copy at its real path also means
 * every case exercises the gate's self-exclusion: the gate quotes the
 * offending form in its own failure text, and if that exclusion broke, every
 * quiet case below would fail.
 *
 * ── The defect shapes ───────────────────────────────────────────────────────
 * The failing cases are the shapes the gate's header and
 * server/services/innovation/rlsBypassSession.ts describe:
 *   - a plain `SET app.bypass_rls` / `SET app.is_admin` on a pooled client,
 *     which is SESSION-scoped and survives COMMIT, ROLLBACK and release(), so
 *     the next checkout (another tenant) inherits a full RLS bypass;
 *   - the idiom spreading from the seventeen innovation call sites into a new
 *     file, including a copy that already uses releaseWithoutBypass (the
 *     baseline freezes sites; the helper does not license new ones);
 *   - a baselined service returning the connection with a bare
 *     client.release() — the code before releaseWithoutBypass existed — and
 *     the regression of one path going back to it;
 *   - a baseline that drifts from reality in either direction.
 * The quiet cases are the near-misses: `SET LOCAL` inside an explicit
 * transaction (innovation-routes.ts guardQuery), transaction-local
 * set_config(…, true) (scripts/db/program-same-org-preflight.mjs), prose about
 * the hazard in comments (with the apostrophes and backticks real prose has),
 * RESET of the flags, other app.* GUCs including ones whose names merely START
 * with the flags' names (pins the trailing \b), the helper's own
 * client.release(), a baselined service destroying its connection with
 * client.release(true), the form quoted in a .md note and a .json baseline
 * inside a scanned dir (pins the extension filter — a case outside
 * server|scripts|shared only tests the directory list), and every SKIP_DIRS
 * entry: node_modules, dist, build, coverage and a nested .git.
 *
 * This baseline is an in-file Map of per-file counts with no reason field, so
 * there is no "reasonless entry" semantics to test; the baseline semantics the
 * gate does implement (exact count suppresses, over- and under-count and a
 * vanished file fail, a baselined file must release through the guard) are.
 *
 * ── KNOWN GAPS — real defect shapes the gate does NOT catch today ──────────
 * The `knownGap` cases are not passes and are not counted in "N passed". Each
 * is a real defect shape on which the gate, as written, prints OK (or names
 * only part of the problem). Closing one changes the gate's behaviour, so it
 * is a gate fix for the founder/lead to accept, not a test change. Until then
 * each case pins the gate's current blind output; the moment the gate catches
 * one, this selftest FAILS and says to promote it to a RED case and delete its
 * entry here. If the gate's output on one changes any other way, it fails too.
 *
 *   1. A `/*` inside a string literal hides a real SET. stripComments() runs
 *      its block-comment regex over raw text, strings included, so an Express
 *      glob such as '/api/reports/*' opens a phantom comment that runs to the
 *      next comment closer (typically the next JSDoc), and everything between
 *      is deleted before matching. Common: about a hundred code lines under
 *      server|scripts|shared have one, e.g. server/startup/services.ts
 *      ('/api/* routes'). Fix: stripComments skips '…', "…" and `…` while it
 *      removes comments. The RED cases' "not hidden by a // inside a string,
 *      or by a block comment closed on the same line" holds for those two
 *      shapes only.
 *   2. `await client.release()` in a baselined file is not counted as bare:
 *      the bare-release regex has a (?<!await\s) lookbehind, so one path of a
 *      baselined service can go back to returning the connection with the
 *      bypass on, and the gate still prints that every service releases
 *      through releaseWithoutBypass(). Removing the lookbehind is therefore an
 *      improvement this selftest can only see through case 2 flipping.
 *   3. `client.release(false)` is not counted either (the regex requires
 *      `()`). Fix for 2 and 3: count every `.release(` call other than
 *      `.release(true)` — which destroys the connection and is pinned quiet.
 *   4. "Never calls releaseWithoutBypass" is a substring test on raw text, so
 *      an unused import or a TODO comment satisfies it. With (2), a service
 *      that never clears the flags passes outright. Fix: require an actual
 *      call, `releaseWithoutBypass(`, on comment-stripped text.
 *   5. Only .ts/.tsx/.js/.mjs are read. scripts/ holds .cjs and .mts code
 *      (scripts/fix-missing-schema.cjs and two other .cjs files use pg), the
 *      same kind of file as the scripts/*.mjs the gate does scan. Fix: add
 *      cjs|cts|mts|jsx to the extension filter. The .md/.json quiet case does
 *      not pin these as out of scope.
 *
 * Fixture text is assembled from fragments (BYPASS / ADMIN below): scripts/ is
 * in the gate's scan path, so if this file's own code contained the offending
 * form the real gate would report this selftest as a new bypass. The last case
 * puts this file into a fixture tree and requires the gate to stay quiet on it.
 *
 * Usage:
 *   node scripts/ci/check-session-scoped-rls-bypass.selftest.mjs
 *   SELFTEST_GATE_PATH=/tmp/mutant.mjs node scripts/ci/check-session-scoped-rls-bypass.selftest.mjs
 *     (run the cases against a different copy of the gate — the mutation check)
 */

import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';

const SELF = fileURLToPath(import.meta.url);
const repoRoot = path.resolve(path.dirname(SELF), '..', '..');
const TAG = '[ci:session-scoped-rls-bypass:selftest]';
const GATE_REL = path.join('scripts', 'ci', 'check-session-scoped-rls-bypass.mjs');
const SELF_REL = path.join('scripts', 'ci', 'check-session-scoped-rls-bypass.selftest.mjs');
const GATE = process.env.SELFTEST_GATE_PATH
  ? path.resolve(process.env.SELFTEST_GATE_PATH)
  : path.join(repoRoot, GATE_REL);

const ROOT_DECL = /const repoRoot = [^;]+;/;
const BASELINE_DECL = /const BASELINE = new Map\(\[[\s\S]*?\]\);/;
const gateSrc = fs.readFileSync(GATE, 'utf8');
for (const [name, re] of [['const repoRoot = …;', ROOT_DECL], ['const BASELINE = new Map([…]);', BASELINE_DECL]]) {
  if (!re.test(gateSrc)) {
    // Without these the copy would judge the real tree, or the real baseline,
    // and every verdict below would be about something else.
    console.error(`${TAG} cannot find \`${name}\` in ${GATE} — the selftest no longer knows how to point it at a fixture tree.`);
    process.exit(1);
  }
}

// Fragments, joined at runtime — see the header.
const BYPASS = ['app', 'bypass_rls'].join('.');
const ADMIN = ['app', 'is_admin'].join('.');
const GUARD_IMPORT = ['import { releaseWithoutBypass }', 'from', "'./rlsBypassSession';"].join(' ');

/** How one site hands its connection back. */
const RELEASE = {
  /** today's tree */
  guard: 'await releaseWithoutBypass(client);',
  /** the code before rlsBypassSession.ts existed */
  bare: 'client.release();',
  /** KNOWN GAP 2 — the same bare release, awaited */
  awaited: 'await client.release();',
  /** KNOWN GAP 3 — returns it to the pool, flags and all */
  keep: 'client.release(false);',
  /** safe: release(true) destroys the connection, so nothing on it is reused */
  destroy: '// A cross-tenant sweep: destroy this connection rather than return it.\n      client.release(true);',
};

/**
 * An innovation service in the shape the seventeen real call sites have:
 * check out a client, set both flags with a plain SET, query, release.
 * `releases` is one RELEASE key per site; `head` is what sits under the pg
 * import (by default the guard's import). Each site is two SETs, so the gate
 * counts 2 × releases.length.
 */
function service(cls, releases, head = GUARD_IMPORT) {
  const methods = releases.map(
    (r, i) => `
  async listThreads${i}(programId: string) {
    const client = await this.pool.connect();
    try {
      await client.query("SET ${BYPASS} = 'true'");
      await client.query("SET ${ADMIN} = 'true'");
      const result = await client.query(
        'SELECT * FROM innovation.negotiation_threads WHERE program_id = $1',
        [programId],
      );
      return result.rows;
    } finally {
      ${RELEASE[r]}
    }
  }`,
  );
  return `import { Pool } from 'pg';
${head}

export class ${cls} {
  constructor(private pool: Pool) {}
${methods.join('\n')}
}
`;
}

/** server/services/innovation/rlsBypassSession.ts — quotes the form in prose, and calls client.release() itself. */
const HELPER = `/**
 * The services in this directory reach cross-tenant data by setting two session
 * GUCs on a checked-out connection:
 *
 *     SET ${BYPASS} = 'true'
 *     SET ${ADMIN}   = 'true'
 *
 * A plain \`SET\` is SESSION-scoped. It survives COMMIT, ROLLBACK and release().
 */
import type { PoolClient } from 'pg';

const PRIVILEGE_GUCS = ['${BYPASS}', '${ADMIN}'] as const;

export async function releaseWithoutBypass(client: PoolClient): Promise<void> {
  try {
    await client.query('ROLLBACK').catch(() => undefined);
    for (const guc of PRIVILEGE_GUCS) {
      await client.query(\`RESET \${guc}\`);
    }
  } catch {
    client.release(true);
    return;
  }
  client.release();
}
`;

/** server/routes/innovation-routes.ts guardQuery() — the correct form, plus the line-85 note. */
const GUARD_QUERY = `import { pool } from '../db';

// The ownership checks need the bypass because the services reach their tables
// with \`SET ${BYPASS}\` — but only for this one transaction.
export async function guardQuery(text: string, params: unknown[]) {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    await client.query("SET LOCAL ${BYPASS} = 'true'");
    const result = await client.query(text, params);
    await client.query('COMMIT');
    return { ran: true, rows: result.rows };
  } catch (err) {
    await client.query('ROLLBACK').catch(() => undefined);
    throw err;
  } finally {
    client.release();
  }
}
`;

/** scripts/db/program-same-org-preflight.mjs — transaction-local set_config. */
const PREFLIGHT = `export async function preflight(client) {
  await client.query('BEGIN');
  await client.query(\`SELECT set_config('app.rls_enforce', 'off', true), set_config('${BYPASS}', 'true', true)\`);
  const { rows } = await client.query('SELECT id, organization_id FROM regulatory_programs');
  await client.query('ROLLBACK');
  return rows;
}
`;

/**
 * Prose about the hazard, in every comment form the gate strips — with the
 * apostrophes and backticks real prose has, so that a string-aware stripper
 * (the fix for KNOWN GAP 1) that opens a string inside a comment is caught.
 */
const PROSE = `/* Historical note: the innovation services didn't clear it — they ran
   SET ${BYPASS} = 'true' on a pooled client and never reset it. */
// Don't ever write: await client.query("SET ${BYPASS} = 'true'")
    // indented: SET SESSION ${ADMIN} = 'true' is the same hazard
/**
 * \`SET ${BYPASS}\` survives client.release(); use \`SET LOCAL\` inside BEGIN/COMMIT.
 */
export const RLS_NOTE = 'see docs/security/rls.md';
`;

/** Other GUC work that is not the bypass — what a loose pattern would trip on. */
const OTHER_GUCS = `export async function scope(client, db, tenantId: string) {
  await client.query("SELECT set_config('app.current_tenant_id', $1, false)", [tenantId]);
  await client.query("SET statement_timeout = '30s'");
  await client.query("SET LOCAL app.audit_archive_bypass = 'on'");
  await db.exec(\`SET LOCAL app.actor_id = '42'\`);
  await client.query("SET ${BYPASS}_reason = 'nightly-export'");
  await client.query("SET ${ADMIN}_view = 'off'");
  await client.query("RESET ${BYPASS}");
  await client.query("RESET ${ADMIN}");
  await client.query("SHOW ${BYPASS}");
}
`;

/** A fresh route that reaches across tenants the old way — the idiom spreading into reachable code. */
const NEW_ROUTE = `import { Router } from 'express';
import { pool } from '../db';

export const router = Router();

router.get('/api/reports/cross-program-summary', async (_req, res) => {
  const client = await pool.connect();
  try {
    await client.query("SET ${BYPASS} = 'true'");
    await client.query("SET ${ADMIN} = 'true'");
    const { rows } = await client.query('SELECT program_id, count(*) FROM vault.documents GROUP BY 1');
    res.json(rows);
  } finally {
    client.release();
  }
});
`;

/** NEW_ROUTE behind an Express glob, followed by the next handler's JSDoc — KNOWN GAP 1. */
const GLOB_ROUTE = NEW_ROUTE.replace(
  'export const router = Router();\n',
  "export const router = Router();\n\nrouter.use('/api/reports/*', requireAuth);\n",
).concat(`
/** Liveness for the reports surface. */
router.get('/api/reports/health', (_req, res) => res.json({ ok: true }));
`);

const INNOV = 'server/services/innovation';
const LOGBOOK = `${INNOV}/regulatory-negotiation-logbook-service.ts`;
const RADAR = `${INNOV}/regulatory-delta-radar-service.ts`;

const cases = [
  // ── RED: detection ─────────────────────────────────────────────────────────
  {
    name: 'RED — a new reachable route sets both flags session-scoped (the idiom spreading); the near-misses beside it are not named',
    files: {
      'server/routes/cross-program-report-routes.ts': NEW_ROUTE,
      'server/routes/innovation-routes.ts': GUARD_QUERY,
      'server/services/innovation/rlsBypassSession.ts': HELPER,
      'scripts/db/program-same-org-preflight.mjs': PREFLIGHT,
    },
    expectExit: 1,
    expectIn: [
      'server/routes/cross-program-report-routes.ts: 2 session-scoped bypass set(s) — this file is not in the baseline',
      '1 problem(s)',
    ],
    expectNotIn: ['innovation-routes.ts', 'rlsBypassSession.ts', 'program-same-org-preflight.mjs'],
  },
  {
    name: 'RED — the fixed idiom copied into a new file still fails: releaseWithoutBypass does not license a new site',
    files: {
      'server/services/vault/vault-sweep-service.ts': service('VaultSweepService', ['guard']),
      'server/services/vault/rlsBypassSession.ts': HELPER,
    },
    expectExit: 1,
    expectIn: ['server/services/vault/vault-sweep-service.ts: 2 session-scoped bypass set(s) — this file is not in the baseline'],
  },
  {
    name: 'RED — the admin flag alone, in shared/ and in a .tsx file',
    files: {
      'shared/db/admin-client.ts': `export const asAdmin = (c) => c.query("SET ${ADMIN} = 'true'");\n`,
      'server/views/AdminPanel.tsx': `export async function load(c) { await c.query("SET ${ADMIN} TO 'true'"); return null; }\n`,
    },
    expectExit: 1,
    expectIn: [
      'shared/db/admin-client.ts: 1 session-scoped bypass set(s)',
      'server/views/AdminPanel.tsx: 1 session-scoped bypass set(s)',
    ],
  },
  {
    name: 'RED — explicit SET SESSION, lowercase, and a SET split across lines of template SQL, in a scripts/ .mjs',
    files: {
      'scripts/db/backfill-cross-tenant.mjs': `export async function run(client) {
  await client.query("set session ${BYPASS} to 'true'");
  await client.query(\`
    SET
      ${ADMIN} = 'true'
  \`);
  await client.query('SELECT id, organization_id FROM regulatory_programs');
}
`,
    },
    expectExit: 1,
    expectIn: ['scripts/db/backfill-cross-tenant.mjs: 2 session-scoped bypass set(s)'],
  },
  {
    name: 'RED — a real call is not hidden by a // inside a string, or by a block comment that closes on the same line (a /* inside a string: KNOWN GAP 1)',
    files: {
      'server/services/export/ectd-export-sweep.ts': `export async function sweep(client) {
  const runbook = 'https://wiki.internal/rls'; await client.query("SET ${BYPASS} = 'true'");
  /* cross-tenant export */ await client.query("SET ${ADMIN} = 'true'");
}
`,
    },
    expectExit: 1,
    expectIn: ['server/services/export/ectd-export-sweep.ts: 2 session-scoped bypass set(s)'],
  },

  // ── RED: baselined files must release through the guard ─────────────────
  {
    name: 'RED — the original defect: a baselined service at its exact count, returning the connection with a bare client.release()',
    files: { [LOGBOOK]: service('RegulatoryNegotiationLogbookService', ['bare'], '') },
    baseline: [[LOGBOOK, 2]],
    expectExit: 1,
    expectIn: [
      `${LOGBOOK}: sets the bypass but never calls releaseWithoutBypass()`,
      `${LOGBOOK}: 1 bare client.release()`,
    ],
  },
  {
    name: 'RED — a baselined service imports the guard but one path went back to a bare client.release()',
    files: {
      [RADAR]: service('RegulatoryDeltaRadarService', ['guard', 'guard', 'bare']),
      [`${INNOV}/rlsBypassSession.ts`]: HELPER,
    },
    baseline: [[RADAR, 6]],
    expectExit: 1,
    expectIn: [`${RADAR}: 1 bare client.release()`],
    expectNotIn: ['never calls releaseWithoutBypass', 'rlsBypassSession.ts'],
  },

  // ── RED: the baseline may only shrink, and must match reality ──────────────
  {
    name: 'RED — a baselined file grows past its allowance',
    files: { [LOGBOOK]: service('RegulatoryNegotiationLogbookService', ['guard', 'guard']) },
    baseline: [[LOGBOOK, 2]],
    expectExit: 1,
    expectIn: [`${LOGBOOK}: 4 session-scoped bypass set(s), baseline allows 2`],
  },
  {
    name: 'RED — a site was fixed but the baseline was not lowered',
    files: { [RADAR]: service('RegulatoryDeltaRadarService', ['guard', 'guard']) },
    baseline: [[RADAR, 6]],
    expectExit: 1,
    expectIn: [`${RADAR}: now 4 (baseline 6)`, 'lower the baseline'],
  },
  {
    name: 'RED — a baseline entry for a file that moved or was deleted',
    files: { [LOGBOOK]: service('RegulatoryNegotiationLogbookService', ['guard']) },
    baseline: [[LOGBOOK, 2], [`${INNOV}/evidence-confidence-heatmap-service.ts`, 4]],
    expectExit: 1,
    expectIn: [`${INNOV}/evidence-confidence-heatmap-service.ts: now 0 (baseline 4)`],
    expectNotIn: [`${LOGBOOK}:`],
  },

  // ── quiet ────────────────────────────────────────────────────────────────
  {
    name: "quiet — today's shape: baselined services at their exact counts, every path through releaseWithoutBypass, beside the helper's own client.release()",
    files: {
      [LOGBOOK]: service('RegulatoryNegotiationLogbookService', ['guard']),
      [RADAR]: service('RegulatoryDeltaRadarService', ['guard', 'guard', 'guard']),
      [`${INNOV}/rlsBypassSession.ts`]: HELPER,
      'server/routes/innovation-routes.ts': GUARD_QUERY,
    },
    baseline: [[LOGBOOK, 2], [RADAR, 6]],
    expectExit: 0,
    expectIn: ['OK — no new session-scoped RLS bypass. 8 baselined occurrence(s) remain in 2 '],
  },
  {
    name: 'quiet — a baselined service whose last path destroys its connection with client.release(true) instead of returning it',
    files: {
      [RADAR]: service('RegulatoryDeltaRadarService', ['guard', 'guard', 'destroy']),
      [`${INNOV}/rlsBypassSession.ts`]: HELPER,
    },
    baseline: [[RADAR, 6]],
    expectExit: 0,
    expectIn: ['OK — no new session-scoped RLS bypass. 6 baselined occurrence(s) remain in 1 '],
  },
  {
    name: 'quiet — SET LOCAL inside an explicit transaction (guardQuery) and transaction-local set_config (preflight)',
    files: {
      'server/routes/innovation-routes.ts': GUARD_QUERY,
      'scripts/db/program-same-org-preflight.mjs': PREFLIGHT,
    },
    expectExit: 0,
    expectIn: ['OK', '0 baselined occurrence(s)'],
  },
  {
    name: 'quiet — prose about the hazard in /* */, //, indented // and JSDoc comments, apostrophes and backticks included',
    files: { 'server/services/security/rls-notes.ts': PROSE },
    expectExit: 0,
    expectIn: ['OK'],
  },
  {
    name: 'quiet — RESET and SHOW of the flags, GUCs whose names only start with the flags’ names, other app.* GUCs, a session-scoped tenant id, statement_timeout',
    files: { 'server/middleware/establishRequestTenantScope.ts': OTHER_GUCS },
    expectExit: 0,
    expectIn: ['OK'],
  },
  {
    name: 'quiet — the form quoted in non-code files inside scanned dirs: a .md note and a .json baseline reason',
    files: {
      'server/README.md': `## RLS\n\nNever run \`SET ${BYPASS} = 'true'\` on a pooled client; use SET LOCAL inside BEGIN/COMMIT.\n`,
      'scripts/ci/rls-exceptions-baseline.json': `${JSON.stringify(
        { entries: [{ file: 'server/x.ts', reason: `uses SET ${BYPASS} = 'true' inside a migration, not a pooled client` }] },
        null,
        2,
      )}\n`,
    },
    expectExit: 0,
    expectIn: ['OK', '0 baselined occurrence(s)'],
  },
  {
    name: 'quiet — node_modules, dist, build, coverage and a nested .git under scanned dirs, and trees outside server|scripts|shared, are not scanned',
    files: {
      'server/node_modules/legacy-pg-helper/index.js': `module.exports = (c) => c.query("SET ${BYPASS} = 'true'");\n`,
      'server/dist/index.js': `await client.query("SET ${BYPASS} = 'true'");\n`,
      'server/build/services/innovation/regulatory-delta-radar-service.js': `await client.query("SET ${BYPASS} = 'true'");\n`,
      'server/coverage/instrumented/regulatory-delta-radar-service.js': `cov_1().s[3]++; await client.query("SET ${ADMIN} = 'true'");\n`,
      'scripts/vendor/pg-tools/.git/hooks/post-checkout.js': `await client.query("SET ${BYPASS} = 'true'");\n`,
      'docs/security/rls.md': `Do not run \`SET ${BYPASS} = 'true'\` on a pooled client.\n`,
    },
    expectExit: 0,
    expectIn: ['OK', '0 baselined occurrence(s)'],
  },
  {
    name: "quiet — the gate's own source, which quotes the form in its failure text, is excluded from its own scan",
    files: {},
    expectExit: 0,
    expectIn: ['OK — no new session-scoped RLS bypass. 0 baselined occurrence(s) remain in 0 '],
  },
  {
    name: "quiet — this selftest's own source, placed where it lives, does not trip the gate",
    files: { [SELF_REL]: fs.readFileSync(SELF, 'utf8') },
    expectExit: 0,
    expectIn: ['OK'],
  },

  // ── KNOWN GAPS: real defect shapes the gate misses today (see header) ─────
  // `today` is the gate's current, blind output; `caught` is what it must
  // print once fixed. Neither counts as a pass.
  {
    name: "KNOWN GAP 1 — a '/api/reports/*' glob earlier in the file hides a session-scoped SET until the next JSDoc",
    files: { 'server/routes/report-routes.ts': GLOB_ROUTE },
    knownGap: {
      today: { exit: 0, in: ['OK — no new session-scoped RLS bypass. 0 baselined occurrence(s)'] },
      caught: { exit: 1, in: ['server/routes/report-routes.ts: 2 session-scoped bypass set(s) — this file is not in the baseline'] },
    },
  },
  {
    name: 'KNOWN GAP 2 — a baselined service, one path back to returning the connection with `await client.release()`',
    files: {
      [RADAR]: service('RegulatoryDeltaRadarService', ['guard', 'guard', 'awaited']),
      [`${INNOV}/rlsBypassSession.ts`]: HELPER,
    },
    baseline: [[RADAR, 6]],
    knownGap: {
      today: { exit: 0, in: ['every one of them releasing through releaseWithoutBypass()'] },
      caught: { exit: 1, in: [`${RADAR}: `], notIn: ['rlsBypassSession.ts'] },
    },
  },
  {
    name: 'KNOWN GAP 3 — a baselined service, one path back to the pool with `client.release(false)`',
    files: {
      [RADAR]: service('RegulatoryDeltaRadarService', ['guard', 'guard', 'keep']),
      [`${INNOV}/rlsBypassSession.ts`]: HELPER,
    },
    baseline: [[RADAR, 6]],
    knownGap: {
      today: { exit: 0, in: ['every one of them releasing through releaseWithoutBypass()'] },
      caught: { exit: 1, in: [`${RADAR}: `], notIn: ['rlsBypassSession.ts'] },
    },
  },
  {
    name: 'KNOWN GAP 4 — a baselined service that never calls the guard: it is only an unused import and a TODO comment, and the release is awaited',
    files: {
      [LOGBOOK]: service(
        'RegulatoryNegotiationLogbookService',
        ['awaited'],
        `${GUARD_IMPORT}\n// TODO: switch these to releaseWithoutBypass(client) before the router is mounted.`,
      ),
    },
    baseline: [[LOGBOOK, 2]],
    knownGap: {
      today: { exit: 0, in: ['every one of them releasing through releaseWithoutBypass()'] },
      caught: { exit: 1, in: [`${LOGBOOK}: sets the bypass but never calls releaseWithoutBypass()`] },
    },
  },
  {
    name: 'KNOWN GAP 5 — a session-scoped SET in a scripts/ .cjs file, which the extension filter never reads',
    files: {
      'scripts/db/repair-cross-tenant.cjs': `const { Pool } = require('pg');
const pool = new Pool();
async function main() {
  const client = await pool.connect();
  await client.query("SET ${BYPASS} = 'true'");
  await client.query('UPDATE regulatory_programs SET organization_id = organization_id');
  client.release();
}
main();
`,
    },
    knownGap: {
      today: { exit: 0, in: ['OK — no new session-scoped RLS bypass. 0 baselined occurrence(s)'] },
      caught: { exit: 1, in: ['scripts/db/repair-cross-tenant.cjs: 1 session-scoped bypass set(s)'] },
    },
  },
];

/** Run a copy of the gate whose repoRoot is a fresh fixture tree holding `files`. */
function runGate({ files, baseline = [] }) {
  // realpath: on macOS os.tmpdir() is a symlink, and the gate compares its own
  // resolved path against repoRoot to exclude itself.
  const root = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'session-rls-bypass-selftest-')));
  try {
    for (const [rel, content] of Object.entries(files)) {
      const full = path.join(root, rel);
      fs.mkdirSync(path.dirname(full), { recursive: true });
      fs.writeFileSync(full, content);
    }
    const src = gateSrc
      .replace(ROOT_DECL, () => `const repoRoot = ${JSON.stringify(root)};`)
      .replace(BASELINE_DECL, () => `const BASELINE = new Map(${JSON.stringify(baseline)});`);
    const gatePath = path.join(root, GATE_REL);
    fs.mkdirSync(path.dirname(gatePath), { recursive: true });
    fs.writeFileSync(gatePath, src);
    const res = spawnSync(process.execPath, [gatePath], { cwd: root, encoding: 'utf8', timeout: 20_000 });
    if (res.error) return { code: -1, out: String(res.error) };
    return { code: res.status, out: `${res.stdout}${res.stderr}` };
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
}

/**
 * Does the gate's output match `spec`? `in` is searched in the whole output;
 * `notIn` only in the finding bullets — the gate's closing advice names
 * innovation-routes.ts as the example of the correct form.
 */
function check(spec, { code, out }) {
  const findings = out.split('\n').filter((l) => l.trimStart().startsWith('•')).join('\n');
  const missing = (spec.in ?? []).filter((s) => !out.includes(s));
  const leaked = (spec.notIn ?? []).filter((s) => findings.includes(s));
  return { ok: code === spec.exit && missing.length === 0 && leaked.length === 0, missing, leaked };
}

const dump = (out) => out.trimEnd().split('\n').map((l) => `      | ${l}`).join('\n');

let passed = 0;
let failed = 0;
const gaps = [];
for (const c of cases) {
  const res = runGate(c);

  if (c.knownGap) {
    if (check(c.knownGap.caught, res).ok) {
      failed++;
      console.log(`  ✗ ${c.name}`);
      console.log('      the gate now CATCHES this known gap — promote it to a RED case (expectExit: 1) and delete its entry under KNOWN GAPS in the header.');
      console.log(dump(res.out));
    } else if (check(c.knownGap.today, res).ok) {
      gaps.push(c.name);
      console.log(`  ! ${c.name}`);
      console.log('      not a pass — the gate still prints OK on this real defect shape (see KNOWN GAPS in the header).');
    } else {
      failed++;
      const t = check(c.knownGap.today, res);
      console.log(`  ✗ ${c.name}`);
      console.log("      the gate's output on this known-gap shape changed, but it does not catch it either — re-examine the gap.");
      if (res.code !== c.knownGap.today.exit) console.log(`      expected today's exit ${c.knownGap.today.exit}, got ${res.code}`);
      for (const s of t.missing) console.log(`      output lacked: ${JSON.stringify(s)}`);
      console.log(dump(res.out));
    }
    continue;
  }

  const r = check({ exit: c.expectExit, in: c.expectIn, notIn: c.expectNotIn }, res);
  console.log(`  ${r.ok ? '✓' : '✗'} ${c.name}`);
  if (r.ok) {
    passed++;
    continue;
  }
  failed++;
  if (res.code !== c.expectExit) console.log(`      expected exit ${c.expectExit}, got ${res.code}`);
  for (const s of r.missing) console.log(`      output lacked: ${JSON.stringify(s)}`);
  for (const s of r.leaked) console.log(`      a finding named: ${JSON.stringify(s)}`);
  console.log(dump(res.out));
}

if (failed) {
  console.error(`\n${TAG} FAIL — ${failed}/${cases.length} case(s) did not hold against ${GATE.startsWith(repoRoot + path.sep) ? path.relative(repoRoot, GATE) : GATE}.`);
  process.exit(1);
}
console.log(
  `\n${TAG} ${gaps.length} known gap(s), NOT counted below: real defect shapes the gate still prints OK on ` +
    '(marked ! above; described, with the fix each needs, under KNOWN GAPS in this file’s header).',
);
console.log(`${TAG} ${passed} passed — the gate fails on what it exists to catch.`);
