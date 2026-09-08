#!/usr/bin/env node
/**
 * check-migration-drop-safety.mjs — a DROP in the migration set must not be
 * undone, or repeated forever, by the applier that re-runs every file.
 *
 * ── Why this exists ──────────────────────────────────────────────────────────
 * `applyMigrationFiles` (scripts/db/migration-set.mjs) reads and EXECUTES every
 * entry of C2C_MIGRATION_FILES on every run, unconditionally. There is no
 * "already applied, skip" branch: the journal records a content hash and returns
 * a 'drift' status, and the caller discards it. The set is safe to replay only
 * because almost every file in it is additive and IF-NOT-EXISTS guarded.
 *
 * A DROP is not additive, and replay gives it two failure modes:
 *
 *   UNDONE   — file A does `ADD COLUMN IF NOT EXISTS x`, file B (after A) does
 *              `DROP COLUMN x`. Wrong order (B before A) and A puts the column
 *              back on the next deploy. The DROP looks applied, reverts, and
 *              nothing reports it.
 *   REPEATED — B after A means every deploy re-adds and re-drops. Any data
 *              written into that column between deploys is destroyed on the
 *              next one, silently, forever.
 *
 * Both are invisible: the deploy is green either way.
 *
 * ── The rule this encodes ────────────────────────────────────────────────────
 * The repo already follows it, unwritten. From the set's own comment on
 * migrations/20260823_drop_dead_c2c_cmc_changes.sql:
 *
 *     "Its creator db/migrations/20260718_cmc_changes_store.sql is on no
 *      applier, so there is no create-then-drop ordering hazard"
 *
 * That is the rule: DROP is safe when nothing on the applier re-creates the
 * object. When something does, the only correct fix is to AMEND THE CREATING
 * MIGRATION IN PLACE — see RULE 1 in CLAUDE.md — never to append a DROP.
 *
 * ── What this checks ─────────────────────────────────────────────────────────
 * For every file in C2C_MIGRATION_FILES, parse the objects it DROPs and the
 * objects it CREATEs/ADDs. A DROP is a violation when some OTHER file in the set
 * creates the same object — regardless of relative order, because both orders
 * are broken, just differently.
 *
 * An intentional, reviewed exception is recorded in
 * scripts/ci/migration-drop-safety-baseline.json with a reason. A baseline entry
 * is a decision someone made on the record, not a snooze: adding one requires
 * writing down why the pairing is safe.
 *
 * Usage: node scripts/ci/check-migration-drop-safety.mjs
 * Exit 0 when every DROP is replay-safe, 1 otherwise with the pairing named.
 */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { C2C_MIGRATION_FILES } from '../db/migration-set.mjs';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const TAG = '[ci:migration-drop-safety]';
const BASELINE = path.join(repoRoot, 'scripts', 'ci', 'migration-drop-safety-baseline.json');

/**
 * Strip comments and string literals before matching, so a DROP named in a
 * comment (this file's own header would otherwise trip it) or inside a quoted
 * string is not read as DDL.
 */
function stripNoise(sql) {
  return sql
    .replace(/\/\*[\s\S]*?\*\//g, ' ')
    .replace(/--[^\n]*/g, ' ')
    .replace(/\$([A-Za-z_]*)\$[\s\S]*?\$\1\$/g, match =>
      // Keep dollar-quoted bodies: DO $$ … $$ blocks are where most of this
      // repo's DDL actually lives. Only their string content is noise, and
      // single-quoted strings are handled below.
      match
    )
    .replace(/'(?:[^']|'')*'/g, "''");
}

const IDENT = String.raw`(?:"[^"]+"|[A-Za-z_][A-Za-z0-9_$]*)`;
const QUALIFIED = String.raw`(?:${IDENT}\s*\.\s*)*${IDENT}`;

function norm(raw) {
  return raw
    .split('.')
    .map(part => part.trim().replace(/^"|"$/g, '').toLowerCase())
    .join('.');
}

/** Qualify a bare table name to `public.` so `documents` and `public.documents` match. */
function qualify(name) {
  return name.includes('.') ? name : `public.${name}`;
}

/**
 * Objects a migration removes, as stable keys:
 *   column:<schema>.<table>.<column>
 *   table:<schema>.<table>
 *   index:<name>       constraint:<schema>.<table>.<name>      policy:<schema>.<table>.<name>
 */
function dropsIn(sql) {
  const found = new Set();
  const add = (kind, key) => found.add(`${kind}:${key}`);

  for (const m of sql.matchAll(
    new RegExp(String.raw`ALTER\s+TABLE\s+(?:IF\s+EXISTS\s+)?(${QUALIFIED})([\s\S]*?)(?=;)`, 'gi')
  )) {
    const table = qualify(norm(m[1]));
    for (const c of m[2].matchAll(
      new RegExp(String.raw`DROP\s+COLUMN\s+(?:IF\s+EXISTS\s+)?(${IDENT})`, 'gi')
    )) {
      add('column', `${table}.${norm(c[1])}`);
    }
    for (const c of m[2].matchAll(
      new RegExp(String.raw`DROP\s+CONSTRAINT\s+(?:IF\s+EXISTS\s+)?(${IDENT})`, 'gi')
    )) {
      add('constraint', `${table}.${norm(c[1])}`);
    }
  }
  for (const m of sql.matchAll(
    new RegExp(String.raw`DROP\s+TABLE\s+(?:IF\s+EXISTS\s+)?(${QUALIFIED})`, 'gi')
  )) {
    add('table', qualify(norm(m[1])));
  }
  for (const m of sql.matchAll(
    new RegExp(String.raw`DROP\s+INDEX\s+(?:CONCURRENTLY\s+)?(?:IF\s+EXISTS\s+)?(${QUALIFIED})`, 'gi')
  )) {
    add('index', qualify(norm(m[1])));
  }
  return found;
}

/**
 * Objects a migration creates. `DROP POLICY … ; CREATE POLICY …` in one file is
 * the repo's idempotent re-create idiom, so policies are deliberately not
 * tracked — they are re-created by the same file that drops them.
 */
function createsIn(sql) {
  const found = new Set();
  const add = (kind, key) => found.add(`${kind}:${key}`);

  for (const m of sql.matchAll(
    new RegExp(String.raw`ALTER\s+TABLE\s+(?:IF\s+EXISTS\s+)?(${QUALIFIED})([\s\S]*?)(?=;)`, 'gi')
  )) {
    const table = qualify(norm(m[1]));
    for (const c of m[2].matchAll(
      new RegExp(String.raw`ADD\s+COLUMN\s+(?:IF\s+NOT\s+EXISTS\s+)?(${IDENT})`, 'gi')
    )) {
      add('column', `${table}.${norm(c[1])}`);
    }
    for (const c of m[2].matchAll(
      new RegExp(String.raw`ADD\s+CONSTRAINT\s+(${IDENT})`, 'gi')
    )) {
      add('constraint', `${table}.${norm(c[1])}`);
    }
  }
  for (const m of sql.matchAll(
    new RegExp(String.raw`CREATE\s+TABLE\s+(?:IF\s+NOT\s+EXISTS\s+)?(${QUALIFIED})`, 'gi')
  )) {
    add('table', qualify(norm(m[1])));
  }
  for (const m of sql.matchAll(
    new RegExp(
      String.raw`CREATE\s+(?:UNIQUE\s+)?INDEX\s+(?:CONCURRENTLY\s+)?(?:IF\s+NOT\s+EXISTS\s+)?(${QUALIFIED})`,
      'gi'
    )
  )) {
    add('index', qualify(norm(m[1])));
  }
  return found;
}

let baseline = { allow: [] };
if (fs.existsSync(BASELINE)) {
  baseline = JSON.parse(fs.readFileSync(BASELINE, 'utf8'));
}
const allowed = new Set(
  (baseline.allow ?? []).map(e => `${e.dropper}|${e.object}|${e.creator}`)
);

// Read every file once.
const parsed = new Map();
const missing = [];
for (const file of C2C_MIGRATION_FILES) {
  const full = path.join(repoRoot, file);
  if (!fs.existsSync(full)) {
    missing.push(file);
    continue;
  }
  const sql = stripNoise(fs.readFileSync(full, 'utf8'));
  parsed.set(file, { drops: dropsIn(sql), creates: createsIn(sql) });
}

/**
 * THE OTHER APPLIER.
 *
 * Rule 1 says a DROP is safe when nothing on ANY applier re-creates the object,
 * and this gate knew only one of the two: it built its creator index from
 * C2C_MIGRATION_FILES alone. `scripts/db/install-fresh.mjs` applies every
 * `migrations/*.sql` except six named RLS files — among them
 * migrations/0006_regulatory_atoms.sql, which declared the very constraint that
 * migrations/20260907_cmc_comparability_register_reachable.sql drops. The
 * pairing was invisible, the DROP passed clean, and the claim that nothing
 * re-creates it went unchecked until a reviewer read install-fresh by hand.
 *
 * So the creator index now also reads the install-fresh set. Those files are
 * creators only: a DROP in one of them is out of this gate's scope (they are
 * not replayed by deploy-migrate), and flagging them would be noise.
 */
const RLS_MIGRATIONS_EXCLUDED_BY_INSTALL_FRESH = new Set([
  '0005_csr_knowledge_database.sql',
  '0019_tenant_column_audit.sql',
  '0020_coerce_text_tenant_columns.sql',
  '0021_enable_rls_everywhere.sql',
  '20260608_ai_placement_policies.sql',
  '20260612_rls_research_admin.sql',
]);
const installFreshCreators = new Map();
const rootMigrationsDir = path.join(repoRoot, 'migrations');
if (fs.existsSync(rootMigrationsDir)) {
  for (const name of fs.readdirSync(rootMigrationsDir).sort()) {
    if (!name.endsWith('.sql')) continue;
    if (RLS_MIGRATIONS_EXCLUDED_BY_INSTALL_FRESH.has(name)) continue;
    const rel = path.join('migrations', name);
    if (parsed.has(rel)) continue; // already read as part of the set
    const sql = stripNoise(fs.readFileSync(path.join(rootMigrationsDir, name), 'utf8'));
    installFreshCreators.set(rel, createsIn(sql));
  }
}

// Index creators by object — from BOTH appliers.
const creatorsOf = new Map();
const addCreator = (obj, file) => {
  if (!creatorsOf.has(obj)) creatorsOf.set(obj, []);
  creatorsOf.get(obj).push(file);
};
for (const [file, { creates }] of parsed) {
  for (const obj of creates) addCreator(obj, file);
}
for (const [file, creates] of installFreshCreators) {
  for (const obj of creates) addCreator(obj, file);
}

const violations = [];
for (const [file, { drops, creates }] of parsed) {
  for (const obj of drops) {
    // `DROP … IF EXISTS` immediately followed by `ADD`/`CREATE` of the same name
    // is this repo's idempotent re-create idiom (see the DROP CONSTRAINT /
    // ADD CONSTRAINT pairs in db/migrations/20260725_*_port.sql). A file that
    // re-creates what it drops removes nothing, so replay is not a hazard —
    // whichever such file runs last simply defines the object.
    if (creates.has(obj)) continue;
    const creators = (creatorsOf.get(obj) ?? []).filter(c => c !== file);
    for (const creator of creators) {
      if (allowed.has(`${file}|${obj}|${creator}`)) continue;
      const dropAt = C2C_MIGRATION_FILES.indexOf(file);
      const createAt = C2C_MIGRATION_FILES.indexOf(creator);
      violations.push({
        file,
        object: obj,
        creator,
        mode: dropAt > createAt ? 'REPEATED' : 'UNDONE',
      });
    }
  }
}

if (missing.length) {
  console.error(`${TAG} ${missing.length} file(s) in the set are missing from the repo:`);
  for (const f of missing) console.error(`  - ${f}`);
  process.exit(1);
}

if (violations.length) {
  console.error(`${TAG} FAIL — ${violations.length} replay-unsafe DROP(s).\n`);
  for (const v of violations) {
    console.error(`  ${v.object}`);
    console.error(`    dropped by : ${v.file}`);
    console.error(`    created by : ${v.creator}`);
    const carriesData = v.object.startsWith('column:') || v.object.startsWith('table:');
    console.error(
      v.mode === 'REPEATED'
        ? `    effect     : REPEATED — the creator runs first every deploy, so this re-adds\n` +
            `                 and re-drops it on every deploy.` +
            (carriesData
              ? ` Any data written into it between\n                 deploys is destroyed, silently.`
              : ` The object exists mid-run, so its\n                 constraint applies to anything the rest of the run writes.`)
        : `    effect     : UNDONE — the creator runs after this, so the drop reverts on\n` +
            `                 the next deploy and nothing reports it.`
    );
    console.error('');
  }
  console.error(
    `${TAG} The applier re-runs every file on every deploy, so a DROP cannot remove\n` +
      `  something another file in the set re-creates. Amend the creating migration in\n` +
      `  place (CLAUDE.md RULE 1) instead of appending a DROP. If a pairing is genuinely\n` +
      `  safe, record it in scripts/ci/migration-drop-safety-baseline.json with a reason.`
  );
  process.exit(1);
}

console.log(
  `${TAG} OK — ${parsed.size} migrations, ` +
    `${[...parsed.values()].reduce((n, p) => n + p.drops.size, 0)} DROP(s), none re-created by the set` +
    (allowed.size ? `, ${allowed.size} reviewed exception(s)` : '') +
    '.'
);
