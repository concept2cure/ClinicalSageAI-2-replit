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
 * A same-file `DROP CONSTRAINT IF EXISTS x; ADD CONSTRAINT x …` re-creates what
 * it drops, so it removes nothing — but it has a third failure mode of its own:
 *
 *   NARROWED — file A replaces constraint x with its definition, file B (after
 *              A) replaces x again with a wider one. ADD CONSTRAINT validates
 *              every existing row, so on each deploy A re-imposes its narrower
 *              definition over rows B admitted, the ADD fails, and from the
 *              first such row on every deploy stops at A. This one is loud —
 *              the deploy fails — but it fails on production data, never on a
 *              fresh database, so no test that starts empty ever sees it.
 *              Found 2026-09-25 on three constraints at once (span-lineage
 *              kinds, c2c doc types, orchestrator run status); reproduced by
 *              tests/schema-contract/check-constraint-replay.pglite.test.ts.
 *              A's replacement must be conditional on the constraint's CURRENT
 *              definition: a pg_constraint lookup by that name that reads
 *              pg_get_constraintdef, so it only replaces a definition that does
 *              not yet admit what A adds.
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
    .replace(
      /\$([A-Za-z_]*)\$[\s\S]*?\$\1\$/g,
      match =>
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
    new RegExp(
      String.raw`DROP\s+INDEX\s+(?:CONCURRENTLY\s+)?(?:IF\s+EXISTS\s+)?(${QUALIFIED})`,
      'gi'
    )
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
    for (const c of m[2].matchAll(new RegExp(String.raw`ADD\s+CONSTRAINT\s+(${IDENT})`, 'gi'))) {
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

/**
 * DDL THIS GATE CANNOT READ.
 *
 * `stripNoise` keeps dollar-quoted DO bodies on purpose — its own comment says
 * that is "where most of this repo's DDL actually lives" — and then strips
 * single-quoted strings. But dynamic DDL inside a DO block has to be a string:
 * `EXECUTE format('DROP INDEX IF EXISTS public.%I', t.idx)`. So every drop
 * issued that way was invisible to the matchers above, in the exact idiom the
 * stripper went out of its way to preserve. Measured when this was added: 16 of
 * the 285 files in the set issue a DROP through a string literal, and not one
 * of them had ever been examined by this gate.
 *
 * The object name usually cannot be recovered — it is a `%I` placeholder filled
 * from a loop variable at apply time — so pairing a dynamic drop against a
 * creator is not something this gate can do. What it CAN do is stop being
 * silent about it. So:
 *
 *   - every dynamic drop is COUNTED and reported in the summary line, so the
 *     gate's own coverage is legible rather than implied;
 *   - a dynamic DROP TABLE or DROP COLUMN — the two that destroy data, which is
 *     what RULE 1 is about — FAILS unless it carries a reviewed reason in the
 *     baseline's `allowDynamic`. The others (index, constraint, policy, trigger)
 *     carry no data, and in this repo are nearly always the
 *     `DROP … IF EXISTS` + re-create idiom inside one file.
 *
 * This is deliberately narrower than the static check. A gate that reports what
 * it cannot see beats one that reports OK for it.
 */
const DYNAMIC_DROP =
  /\bDROP\s+(TABLE|INDEX|COLUMN|CONSTRAINT|POLICY|TRIGGER|VIEW|MATERIALIZED\s+VIEW|SCHEMA|FUNCTION|TYPE|SEQUENCE)\b/gi;
/** Drops that can destroy rows, and so must be reasoned about, not counted. */
const DATA_BEARING = new Set(['table', 'column']);

function dynamicDropsIn(raw) {
  const noComments = raw.replace(/\/\*[\s\S]*?\*\//g, ' ').replace(/--[^\n]*/g, ' ');
  const kinds = new Set();
  for (const lit of noComments.match(/'(?:[^']|'')*'/g) ?? []) {
    for (const m of lit.matchAll(DYNAMIC_DROP)) {
      kinds.add(m[1].replace(/\s+/g, ' ').toLowerCase());
    }
  }
  return [...kinds].sort();
}

/**
 * Constraints whose replacement this file makes conditional on the current
 * definition — the NARROWED guard. Read from the raw text (the constraint name
 * in `conname = '…'` is a string literal, which stripNoise removes), comments
 * excluded so a header that merely describes the guard does not count as one.
 */
function guardedConstraintsIn(raw) {
  const code = raw.replace(/\/\*[\s\S]*?\*\//g, ' ').replace(/--[^\n]*/g, ' ');
  if (!/\bpg_get_constraintdef\s*\(/i.test(code)) return new Set();
  return new Set([...code.matchAll(/\bconname\s*=\s*'([^']+)'/gi)].map(m => m[1].toLowerCase()));
}

let baseline = { allow: [] };
if (fs.existsSync(BASELINE)) {
  baseline = JSON.parse(fs.readFileSync(BASELINE, 'utf8'));
}
const allowed = new Set((baseline.allow ?? []).map(e => `${e.dropper}|${e.object}|${e.creator}`));
/** Reviewed dynamic (EXECUTE-issued) data-bearing drops: file -> reason. */
const allowedDynamic = new Map(
  (baseline.allowDynamic ?? []).map(e => [`${e.dropper}|${e.object}`, e.reason])
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
  const raw = fs.readFileSync(full, 'utf8');
  const sql = stripNoise(raw);
  parsed.set(file, {
    drops: dropsIn(sql),
    creates: createsIn(sql),
    dynamic: dynamicDropsIn(raw),
    guarded: guardedConstraintsIn(raw),
  });
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
let replacementsChecked = 0;
for (const [file, { drops, creates, guarded }] of parsed) {
  for (const obj of drops) {
    // `DROP … IF EXISTS` immediately followed by `ADD`/`CREATE` of the same name
    // is this repo's idempotent re-create idiom. A file that re-creates what it
    // drops removes nothing, so it is neither UNDONE nor REPEATED. It is not
    // automatically safe, though: "whichever such file runs last simply defines
    // the object" is true of the end state and false of the step before it —
    // see NARROWED in the header.
    if (creates.has(obj)) {
      if (!obj.startsWith('constraint:')) continue;
      const at = C2C_MIGRATION_FILES.indexOf(file);
      const later = (creatorsOf.get(obj) ?? []).filter(
        c => parsed.has(c) && C2C_MIGRATION_FILES.indexOf(c) > at
      );
      if (!later.length) continue;
      replacementsChecked += 1;
      if (guarded.has(obj.split('.').pop())) continue;
      for (const creator of later) {
        if (allowed.has(`${file}|${obj}|${creator}`)) continue;
        violations.push({ file, object: obj, creator, mode: 'NARROWED' });
      }
      continue;
    }
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
  console.error(`${TAG} FAIL — ${violations.length} replay-unsafe DROP(s) or replacement(s).\n`);
  for (const v of violations) {
    console.error(`  ${v.object}`);
    if (v.mode === 'NARROWED') {
      console.error(`    replaced by : ${v.file}  (unconditionally)`);
      console.error(`    redefined by: ${v.creator}  (later in the set)`);
      console.error(
        `    effect      : NARROWED — every deploy re-imposes this file's definition before the\n` +
          `                  later one, and ADD CONSTRAINT validates every existing row. From the\n` +
          `                  first row only the later definition admits, every deploy fails here.\n` +
          `    fix         : amend this file in place (RULE 1) so the replacement runs only while\n` +
          `                  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conrelid = '<table>'::regclass\n` +
          `                    AND conname = '<name>' AND pg_get_constraintdef(oid) LIKE '%''<value it adds>''%')`
      );
      console.error('');
      continue;
    }
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

// ── Dynamic (EXECUTE-issued) drops — see dynamicDropsIn ─────────────────────
const dynamicFindings = [];
let dynamicTotal = 0;
for (const [file, { dynamic }] of parsed) {
  for (const kind of dynamic) {
    dynamicTotal += 1;
    if (!DATA_BEARING.has(kind)) continue;
    if (allowedDynamic.has(`${file}|${kind}`)) continue;
    dynamicFindings.push({ file, kind });
  }
}

if (dynamicFindings.length) {
  console.error(
    `${TAG} FAIL — ${dynamicFindings.length} unreviewed dynamic data-bearing DROP(s).\n`
  );
  for (const d of dynamicFindings) {
    console.error(`  DROP ${d.kind.toUpperCase()} issued through EXECUTE`);
    console.error(`    file : ${d.file}`);
    console.error(
      `    why  : the object name is built at apply time, so this gate cannot pair it\n` +
        `           against a creator the way it does a literal DROP. A dynamic ${d.kind}\n` +
        `           drop destroys rows, so it needs a reason on the record instead.`
    );
    console.error('');
  }
  console.error(
    `${TAG} Record each one in the baseline's \`allowDynamic\` with a written reason —\n` +
      `  what guarantees it cannot destroy a row that matters (an emptiness check before\n` +
      `  the drop, RESTRICT rather than CASCADE, a fail-soft handler). An entry without a\n` +
      `  reason is the thing that file exists to prevent.`
  );
  process.exit(1);
}

console.log(
  `${TAG} OK — ${parsed.size} migrations, ` +
    `${[...parsed.values()].reduce(
      (n, p) => n + p.drops.size,
      0
    )} DROP(s), none re-created by the set` +
    `; ${replacementsChecked} constraint replacement(s) a later file redefines, all conditional` +
    (allowed.size ? `, ${allowed.size} reviewed exception(s)` : '') +
    `; ${dynamicTotal} dynamic DROP(s) in ${
      [...parsed.values()].filter(p => p.dynamic.length).length
    } file(s) ` +
    `(names unresolvable — data-bearing kinds gated, ${allowedDynamic.size} reviewed).`
);
