#!/usr/bin/env node
/**
 * check-install-fresh-overlay-deps.mjs — a root-tree migration may not depend on
 * a table only db/migrations/ creates.
 *
 * ── The defect, five times ───────────────────────────────────────────────────
 * The repository has TWO appliers over DIFFERENT file lists:
 *
 *   install-fresh.mjs  step 3 overlays `migrations/` ONLY — MIGRATIONS_DIR is
 *                      <repo>/migrations and the overlay never walks
 *                      db/migrations/. Multi-pass, so a forward dependency
 *                      WITHIN that tree resolves on a later pass.
 *   deploy-migrate.mjs step 4 applies C2C_MIGRATION_FILES, which spans BOTH
 *                      trees, in one fixed order.
 *
 * So a file in `migrations/` that FKs or ALTERs a table whose only creator lives
 * in db/migrations/ applies fine on a deploy and can NEVER apply on a fresh
 * install: it defers on every pass, and the installer reports INCOMPLETE. That
 * fails ci.yml's blank-db-provisioning job and step 8 of Tier 5 Browser Smoke —
 * a job the release-evidence policy REQUIRES — so a green deploy path hides a
 * provisioning path that cannot stand up a new environment at all.
 *
 * install-fresh already carries the remedy, PRE_OVERLAY_CREATORS, and its own
 * comment describes the case: "Some root-tree files ALTER or FK-reference tables
 * whose ONLY creator lives in db/migrations/ — a tree this overlay never walks …
 * On a fresh install those files therefore deferred forever and the run reported
 * incomplete."
 *
 * What that comment does not say is that the list has only ever grown one
 * outage at a time. Three entries came from the 2026-07-30 blank-DB audit,
 * ana_runs from 2026-10-09, and on 2026-10-19
 * migrations/20261018b_agency_response_questions.sql — which FKs
 * public.concept2cure_agency_communications(event_id) twice, created only by
 * db/migrations/20260331_communication_center_scaffold.sql — made it five. Each
 * was found by watching CI go red, and that last one was found by reproducing
 * the installer locally because the job's logs are served from a host CI tooling
 * here cannot fetch. This gate is the alternative: the asymmetry is visible in
 * the files, so it can be answered before the push.
 *
 * ── What is checked ─────────────────────────────────────────────────────────
 * For every `.sql` in `migrations/` that the overlay applies (RLS migrations are
 * excluded — install-fresh applies those separately, in order, at step 5), every
 * table it REFERENCES or ALTERs and does not itself create must be reachable by
 * the installer: created by another file in `migrations/`, declared in the
 * Drizzle schema (step 2's push creates it), or named in PRE_OVERLAY_CREATORS.
 * A table nothing in the repository creates is NOT a finding here — that is
 * ci:unbacked-tables' question, not this one.
 *
 * ── The sixth, and why this gate reported nothing (2026-11-12) ──────────────
 * migrations/20261112_vault_catalog_dataset_profile.sql ALTERs
 * vault.document_catalog with no guard. The table's creator IS in `migrations/`
 * (20260905_document_catalog.sql), so by the rule above it looked reachable —
 * but that creator opens with `IF to_regclass('vault.documents') IS NULL THEN
 * RETURN`, and vault.documents comes from the governed-content tree at step 6.
 * So during the step-3 overlay the creator no-ops, is recorded applied and is
 * never retried, the table does not exist on any pass, and the unguarded ALTER
 * defers three times and leaves the installer INCOMPLETE. This gate said
 * "0 finding(s)" throughout, because `dependsOn` skipped every non-public
 * qualifier as "a different applier's question" and nothing else asked it.
 *
 * install-fresh states the contract for these files itself ("Second chance for
 * files guarded on a named-schema object"): a root file whose dependency lives
 * in a named schema opens with a `to_regclass` guard on it, no-ops at step 3,
 * and is re-applied at step 6, selected "mechanically by the guard they share".
 * So for a NON-PUBLIC table a root file FKs or ALTERs and does not create:
 * either the table exists during the overlay (created by a root file that is
 * not itself deferred to step 6, or by a pre-overlay creator), or the file
 * guards on that exact table. An unguarded one is a finding. The selector for
 * "deferred to step 6" is READ from install-fresh.mjs, like the two lists.
 *
 * Both lists are READ from install-fresh.mjs rather than restated, so this gate
 * cannot drift from the installer it models. Deliberately textual, like its
 * sibling migration gates: no database and no parser, so it runs anywhere and
 * cannot be wrong about a schema it failed to connect to.
 *
 * Usage:
 *   node scripts/ci/check-install-fresh-overlay-deps.mjs
 *   node scripts/ci/check-install-fresh-overlay-deps.mjs --list
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { stripComments } from './lib/strip-comments.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const TAG = '[ci:install-fresh-overlay-deps]';
const INSTALLER = 'scripts/db/install-fresh.mjs';
const ROOT_TREE = 'migrations';
const DB_TREE = 'db/migrations';

const read = (rel) => fs.readFileSync(path.join(ROOT, rel), 'utf8');
const sqlIn = (dir) => {
  try {
    return fs.readdirSync(path.join(ROOT, dir)).filter((f) => f.endsWith('.sql')).sort();
  } catch {
    return [];
  }
};

/** A named JS array literal of string entries, read out of the installer. */
function arrayFrom(src, name) {
  const declarations = [...src.matchAll(/\bconst[ \t]+([A-Za-z_$][\w$]*)[ \t]*=[ \t]*\[/g)]
    .filter(match => match[1] === name);
  if (declarations.length !== 1) throw new Error(`${TAG} expected one literal ${name} declaration in ${INSTALLER}`);
  // Both lists are indented inside the installer (one at module scope, one
  // inside the step-3 block). Read only the named list's literal body, rather
  // than treating its name as a regular expression or ignoring computed entries.
  const declaration = declarations[0];
  const tail = src.slice(declaration.index + declaration[0].length);
  const close = /\n[ \t]*\];/.exec(tail);
  if (!close) throw new Error(`${TAG} ${name} has no literal array terminator in ${INSTALLER}`);
  const entries = [];
  const remainder = tail.slice(0, close.index).replace(/'([^'\\\r\n]+)'/g, (_literal, entry) => {
    entries.push(entry);
    return '';
  });
  if (/[^\s,]/.test(remainder)) throw new Error(`${TAG} ${name} must contain only quoted literal filenames in ${INSTALLER}`);
  return entries;
}

// Comments are stripped FIRST: both lists carry explanatory comments between
// their entries, and an apostrophe in English prose ("the root overlay's
// ana_run_events FK") otherwise opens a false string literal and the extraction
// reads half a sentence as a filename.
const installer = stripComments(read(INSTALLER));
const rlsExcluded = new Set(arrayFrom(installer, 'RLS_MIGRATIONS'));
const preOverlay = arrayFrom(installer, 'PRE_OVERLAY_CREATORS');

/** Tables a file CREATEs. `public.` is stripped; other schemas are kept whole. */
function creates(sql) {
  const out = new Set();
  for (const m of sql.matchAll(/CREATE\s+TABLE\s+(?:IF\s+NOT\s+EXISTS\s+)?"?(?:(public)"?\.)?"?([a-z0-9_]+)"?/gi)) {
    out.add(m[2].toLowerCase());
  }
  return out;
}

/**
 * Tables a file depends on: an inline/explicit FK target, or an ALTER subject.
 *
 * A qualifier other than `public` is SKIPPED, not captured. `ALTER TABLE
 * identity.org_relationships` is a table in the `identity` schema, created by
 * the governed-content tree at step 6; reading the qualifier as the table name
 * made this gate report a table called "identity" that nothing anywhere
 * creates. Who CREATES a non-public table is a different applier's question;
 * whether a root file may touch one unguarded is dependsOnNamed's, below.
 */
function dependsOn(sql) {
  const out = new Set();
  const add = (schema, table) => {
    if (schema && schema.toLowerCase() !== 'public') return;
    out.add(table.toLowerCase());
  };
  for (const m of sql.matchAll(/REFERENCES\s+(?:"?([a-z0-9_]+)"?\s*\.\s*)?"?([a-z0-9_]+)"?\s*\(/gi)) add(m[1], m[2]);
  for (const m of sql.matchAll(/ALTER\s+TABLE\s+(?:IF\s+EXISTS\s+)?(?:ONLY\s+)?(?:"?([a-z0-9_]+)"?\s*\.\s*)?"?([a-z0-9_]+)"?/gi)) add(m[1], m[2]);
  return out;
}

/**
 * Tables the file itself checks for with `to_regclass(...) IS NULL` before
 * touching them.
 *
 * This is the difference between a gate and noise. A self-guarded file no-ops
 * cleanly when its table is absent, so it does NOT defer and does NOT make the
 * installer report incomplete — nine of the fifteen findings this gate reported
 * on its first run were exactly that, and the real one
 * (20261018b_agency_response_questions.sql) carries no guard at all, which is
 * why it hard-failed.
 *
 * What a guarded file leaves behind is quieter and someone else's question: on a
 * fresh install the guard silently does not exist until its creator lands, which
 * is what ci:migration-guard-order reasons about for the deploy order.
 */
function guards(sql) {
  const out = new Set();
  for (const m of sql.matchAll(/to_regclass\(\s*'(?:public\.)?([a-z0-9_.]+)'/gi)) {
    out.add(m[1].toLowerCase().replace(/^public\./, ''));
  }
  return out;
}

/** NON-public tables a file CREATEs, kept schema-qualified (`vault.document_catalog`). */
function createsNamed(sql) {
  const out = new Set();
  for (const m of sql.matchAll(/CREATE\s+TABLE\s+(?:IF\s+NOT\s+EXISTS\s+)?"?([a-z0-9_]+)"?\s*\.\s*"?([a-z0-9_]+)"?/gi)) {
    if (m[1].toLowerCase() !== 'public') out.add(`${m[1]}.${m[2]}`.toLowerCase());
  }
  return out;
}

/**
 * NON-public tables a file depends on, schema-qualified: the same two forms
 * dependsOn reads — an FK target or an ALTER subject — for the qualifiers it
 * skips. (`guards` already returns these whole: `to_regclass('vault.x')` is
 * recorded as `vault.x`.)
 */
function dependsOnNamed(sql) {
  const out = new Set();
  const add = (schema, table) => {
    if (schema.toLowerCase() !== 'public') out.add(`${schema}.${table}`.toLowerCase());
  };
  for (const m of sql.matchAll(/REFERENCES\s+"?([a-z0-9_]+)"?\s*\.\s*"?([a-z0-9_]+)"?\s*\(/gi)) add(m[1], m[2]);
  for (const m of sql.matchAll(/ALTER\s+TABLE\s+(?:IF\s+EXISTS\s+)?(?:ONLY\s+)?"?([a-z0-9_]+)"?\s*\.\s*"?([a-z0-9_]+)"?/gi)) add(m[1], m[2]);
  return out;
}

/**
 * install-fresh's own selector for the files it re-applies at step 6, read out
 * of the installer rather than restated. Read from the RAW source: the literal
 * carries apostrophes, which is what stripComments exists to be careful about.
 */
function namedSchemaGuardFrom(src) {
  const found = [...src.matchAll(/\bconst[ \t]+namedSchemaGuard[ \t]*=[ \t]*\/(.+)\/([a-z]*);/g)];
  if (found.length !== 1) throw new Error(`${TAG} expected one namedSchemaGuard literal in ${INSTALLER}`);
  return new RegExp(found[0][1], found[0][2]);
}

/** Table names the Drizzle schema declares, which step 2's push creates. */
function drizzleTables() {
  const files = ['shared/schema.ts'];
  try {
    for (const f of fs.readdirSync(path.join(ROOT, 'shared/schema'))) {
      if (f.endsWith('.ts')) files.push(`shared/schema/${f}`);
    }
  } catch { /* no schema directory */ }
  const out = new Set();
  for (const rel of files) {
    let src;
    try { src = read(rel); } catch { continue; }
    for (const m of src.matchAll(/pgTable\(\s*['"]([a-zA-Z0-9_]+)['"]/g)) out.add(m[1].toLowerCase());
  }
  return out;
}

const pushed = drizzleTables();
const overlayFiles = sqlIn(ROOT_TREE).filter((f) => !rlsExcluded.has(f));

/** table -> the db/migrations/ file(s) that create it. */
const dbTreeCreators = new Map();
for (const f of sqlIn(DB_TREE)) {
  for (const t of creates(stripComments(read(`${DB_TREE}/${f}`)))) {
    if (!dbTreeCreators.has(t)) dbTreeCreators.set(t, []);
    dbTreeCreators.get(t).push(`${DB_TREE}/${f}`);
  }
}

/** Everything the overlay itself creates, across all its files and passes. */
const overlayCreates = new Set();
for (const f of overlayFiles) for (const t of creates(stripComments(read(`${ROOT_TREE}/${f}`)))) overlayCreates.add(t);

/** Tables the pre-overlay creators already install before the overlay runs. */
const preCreated = new Set();
for (const rel of preOverlay) {
  try {
    for (const t of creates(stripComments(read(rel)))) preCreated.add(t);
  } catch {
    console.error(`${TAG} PRE_OVERLAY_CREATORS names a file that does not exist: ${rel}`);
    process.exit(1);
  }
}

/* Named-schema tables. Step 2's push creates none of them (the installer says
   so: "live in a named schema, which push does not create; the overlay does"),
   so one exists during the overlay only if a pre-overlay creator made it, or a
   root file that is NOT deferred to step 6 does. A root creator carrying the
   named-schema guard no-ops at step 3, so what it creates arrives at step 6 —
   with everything the governed-content tree in db/migrations/ creates. */
const namedSchemaGuard = namedSchemaGuardFrom(read(INSTALLER));
const namedInOverlay = new Set();
/** table -> the file(s) that create it, none of which has run by step 3. */
const namedLate = new Map();
const late = (table, file) => {
  if (!namedLate.has(table)) namedLate.set(table, []);
  namedLate.get(table).push(file);
};
for (const rel of preOverlay) for (const t of createsNamed(stripComments(read(rel)))) namedInOverlay.add(t);
for (const f of overlayFiles) {
  const sql = stripComments(read(`${ROOT_TREE}/${f}`));
  const deferred = namedSchemaGuard.test(sql);
  for (const t of createsNamed(sql)) {
    if (deferred) late(t, `${ROOT_TREE}/${f} (guarded: re-applied at step 6)`);
    else namedInOverlay.add(t);
  }
}
for (const f of sqlIn(DB_TREE)) {
  if (preOverlay.includes(`${DB_TREE}/${f}`)) continue;
  for (const t of createsNamed(stripComments(read(`${DB_TREE}/${f}`)))) late(t, `${DB_TREE}/${f}`);
}
for (const t of namedInOverlay) namedLate.delete(t);

/**
 * PURE: the per-file decision for NON-public tables, exported for --selftest.
 *
 * `availableInOverlay` is every named-schema table that exists at step 3;
 * `lateCreators` maps the ones that do not to whoever creates them later. The
 * guard must name the table itself, as for public tables above: a file that
 * guards on one table and ALTERs another still hard-fails on the second.
 */
export function unguardedNamedDeps({ file, sql, availableInOverlay, lateCreators }) {
  const out = [];
  const own = createsNamed(sql);
  const guarded = guards(sql);
  for (const table of dependsOnNamed(sql)) {
    if (own.has(table) || availableInOverlay.has(table) || guarded.has(table)) continue;
    const creators = lateCreators.get(table);
    if (!creators) continue; // nothing in the repo creates it — ci:unbacked-tables' question
    out.push({ file, table, creators });
  }
  return out;
}

/**
 * PURE: the per-file decision, exported for --selftest.
 *
 * `reachable` is every table the installer has by the time the overlay runs —
 * pushed at step 2, installed by a pre-overlay creator, or created by any
 * overlay file (the overlay is multi-pass, so order within the tree is free).
 */
export function unreachableDeps({ file, sql, reachable, dbTreeCreators }) {
  const out = [];
  const own = creates(sql);
  const guarded = guards(sql);
  for (const table of dependsOn(sql)) {
    if (own.has(table) || reachable.has(table) || guarded.has(table)) continue;
    const creators = dbTreeCreators.get(table);
    if (!creators) continue; // nothing in the repo creates it — ci:unbacked-tables' question
    out.push({ file, table, creators });
  }
  return out;
}

if (process.argv.includes('--selftest')) {
  const dbTree = new Map([['comms', ['db/migrations/scaffold.sql']], ['auth_docs', ['db/migrations/loop.sql']]]);
  const cases = [
    ['THE REAL CASE — an unguarded FK to a db/migrations-only table', 1,
      'CREATE TABLE IF NOT EXISTS q (id int REFERENCES public.comms(event_id));'],
    ['guarded — to_regclass IS NULL short-circuits, so it no-ops instead of deferring', 0,
      "DO $$ BEGIN IF to_regclass('public.auth_docs') IS NULL THEN RETURN; END IF;\n" +
      '  ALTER TABLE public.auth_docs ADD COLUMN x int; END $$;'],
    ['a non-public schema qualifier is not the table name', 0,
      'ALTER TABLE comms.org_relationships ENABLE ROW LEVEL SECURITY;'],
    ['reachable because step 2 pushed it', 0,
      'ALTER TABLE public.auth_docs ADD COLUMN y int;'],
    ['a table nothing in the repo creates is another gate\'s question', 0,
      'CREATE TABLE z (id int REFERENCES public.nobody_creates_me(id));'],
    ['the file creating it itself is never its own missing dependency', 0,
      'CREATE TABLE comms (event_id text PRIMARY KEY);\nCREATE TABLE q2 (e text REFERENCES public.comms(event_id));'],
  ];
  let bad = 0;
  const arrayCases = [
    ['the exact named literal array, beside an unrelated inline array',
      "const OTHER = ['unrelated.sql'];\nconst EXPECTED = [\n  'db/migrations/one.sql',\n  'db/migrations/two.sql',\n];", ['db/migrations/one.sql', 'db/migrations/two.sql']],
    ['a computed filename must not be mistaken for its literal prefix',
      "const EXPECTED = [\n  'db/migrations/one.sql' + suffix,\n];", null],
    ['a spread must not silently hide creator entries',
      "const EXPECTED = [\n  ...otherCreators,\n];", null],
    ['duplicate declarations cannot choose a convenient first list',
      "const EXPECTED = [\n  'one.sql',\n];\nconst EXPECTED = [\n  'two.sql',\n];", null],
  ];
  for (const [name, source, expected] of arrayCases) {
    let got;
    let refused = false;
    try { got = arrayFrom(source, 'EXPECTED'); } catch { refused = true; }
    const ok = expected === null ? refused : !refused && JSON.stringify(got) === JSON.stringify(expected);
    if (!ok) bad++;
    console.log(`  ${ok ? '✓' : '✗'} ${name}`);
  }
  for (const [name, expected, sql] of cases) {
    const reachable = new Set(name.includes('step 2 pushed') ? ['auth_docs'] : []);
    const got = unreachableDeps({ file: 'migrations/probe.sql', sql, reachable, dbTreeCreators: dbTree }).length;
    const ok = got === expected;
    if (!ok) bad++;
    console.log(`  ${ok ? '✓' : '✗'} ${name} — expected ${expected}, got ${got}`);
  }
  // Named schemas. `vault.catalog` exists only after step 6 (its creator is
  // guarded); `vault.early` is created by an undeferred root file, so the
  // overlay's own passes resolve it.
  const lateNamed = new Map([['vault.catalog', ['migrations/creator.sql (guarded: re-applied at step 6)']]]);
  const earlyNamed = new Set(['vault.early']);
  const namedCases = [
    ['THE REAL CASE (2026-11-12) — an unguarded ALTER of a named-schema table that exists only after step 6', 1,
      'ALTER TABLE vault.catalog ADD COLUMN IF NOT EXISTS dataset_profile jsonb;'],
    ['an unguarded FK to it is the same defect', 1,
      'CREATE TABLE IF NOT EXISTS q (id uuid REFERENCES vault.catalog(document_id));'],
    ['guarded on that exact table — no-ops at step 3, re-applied at step 6', 0,
      "DO $$ BEGIN IF to_regclass('vault.catalog') IS NULL THEN RETURN; END IF;\n" +
      '  ALTER TABLE vault.catalog ADD COLUMN IF NOT EXISTS x int; END $$;'],
    ['guarded on a DIFFERENT table — the unguarded one still hard-fails', 1,
      "DO $$ BEGIN IF to_regclass('vault.documents') IS NULL THEN RETURN; END IF; END $$;\n" +
      'ALTER TABLE vault.catalog ADD COLUMN IF NOT EXISTS y int;'],
    ['created during the overlay by an undeferred root file — a later pass resolves it', 0,
      'ALTER TABLE vault.early ADD COLUMN IF NOT EXISTS z int;'],
    ['the file creating it itself is never its own missing dependency', 0,
      'CREATE TABLE IF NOT EXISTS vault.catalog (document_id uuid PRIMARY KEY);\n' +
      'ALTER TABLE vault.catalog ADD COLUMN IF NOT EXISTS w int;'],
    ['a named-schema table nothing in the repo creates is another gate\'s question', 0,
      'ALTER TABLE vault.nobody_creates_me ADD COLUMN IF NOT EXISTS v int;'],
    ['a public table is not this rule\'s — it is unreachableDeps\' above', 0,
      'ALTER TABLE public.catalog ADD COLUMN IF NOT EXISTS u int;'],
  ];
  for (const [name, expected, sql] of namedCases) {
    const got = unguardedNamedDeps({
      file: 'migrations/probe.sql', sql, availableInOverlay: earlyNamed, lateCreators: lateNamed,
    }).length;
    const ok = got === expected;
    if (!ok) bad++;
    console.log(`  ${ok ? '✓' : '✗'} ${name} — expected ${expected}, got ${got}`);
  }
  const guardCases = [
    ['the installer\'s selector is read, not restated',
      "const namedSchemaGuard = /to_regclass\\(\\s*'(?!public\\.)[a-z_]+\\.[a-z_]+'\\s*\\)/i;", true],
    ['a missing selector must not fall back to a guess', 'const other = 1;', false],
    ['two selectors cannot choose a convenient first one',
      'const namedSchemaGuard = /a/i;\nconst namedSchemaGuard = /b/i;', false],
  ];
  for (const [name, source, readable] of guardCases) {
    let refused = false;
    let re;
    try { re = namedSchemaGuardFrom(source); } catch { refused = true; }
    const ok = readable
      ? !refused && re.test("IF to_regclass('vault.documents') IS NULL") && !re.test("IF to_regclass('public.x') IS NULL")
      : refused;
    if (!ok) bad++;
    console.log(`  ${ok ? '✓' : '✗'} ${name}`);
  }
  console.log(bad === 0
    ? `\n${TAG} selftest passed: it fails on the unguarded case and only on that case.`
    : `\n${TAG} selftest FAILED on ${bad} case(s).`);
  process.exit(bad === 0 ? 0 : 1);
}

const reachable = new Set([...pushed, ...preCreated, ...overlayCreates]);
const findings = [];
for (const f of overlayFiles) {
  findings.push(
    ...unreachableDeps({
      file: `${ROOT_TREE}/${f}`,
      sql: stripComments(read(`${ROOT_TREE}/${f}`)),
      reachable,
      dbTreeCreators,
    }),
  );
}

const namedFindings = [];
for (const f of overlayFiles) {
  namedFindings.push(
    ...unguardedNamedDeps({
      file: `${ROOT_TREE}/${f}`,
      sql: stripComments(read(`${ROOT_TREE}/${f}`)),
      availableInOverlay: namedInOverlay,
      lateCreators: namedLate,
    }),
  );
}

if (process.argv.includes('--list')) {
  for (const h of findings) console.log(`${h.file}  needs ${h.table}  <- ${h.creators.join(', ')}`);
  for (const h of namedFindings) console.log(`${h.file}  touches ${h.table} unguarded  <- ${h.creators.join(', ')}`);
  console.log(`\n${findings.length + namedFindings.length} finding(s).`);
  process.exit(0);
}

console.log(
  `${TAG} ${overlayFiles.length} overlay file(s) · ${pushed.size} pushed table(s) · ` +
    `${preOverlay.length} pre-overlay creator(s) · ${namedLate.size} named-schema table(s) that exist only ` +
    `after the overlay · ${findings.length + namedFindings.length} finding(s).`,
);

if (findings.length > 0) {
  console.error(`\n${TAG} FAIL — ${findings.length} overlay dependency the installer cannot reach:\n`);
  for (const h of findings) {
    console.error(`  ${h.file}`);
    console.error(`      needs ${h.table}, created only by ${h.creators.join(', ')}`);
  }
  console.error(
    `\n  install-fresh's step-3 overlay reads ${ROOT_TREE}/ and nothing else, so each of these\n` +
      `  defers on every pass and the installer reports INCOMPLETE — failing blank-db\n` +
      `  provisioning and step 8 of Tier 5 Browser Smoke, which the release-evidence policy\n` +
      `  requires. deploy-migrate is unaffected, so the deploy path stays green and hides it.\n\n` +
      `  Add the creator to PRE_OVERLAY_CREATORS in ${INSTALLER}, with a dated note saying\n` +
      `  which file needed it — the same documented exception pattern the five entries\n` +
      `  already there follow.\n`,
  );
  process.exit(1);
}

if (namedFindings.length > 0) {
  console.error(`\n${TAG} FAIL — ${namedFindings.length} overlay file(s) touch a named-schema table unguarded:\n`);
  for (const h of namedFindings) {
    console.error(`  ${h.file}`);
    console.error(`      touches ${h.table}, which does not exist until ${h.creators.join(', ')}`);
  }
  console.error(
    `\n  The table is absent on every pass of install-fresh's step-3 overlay, so each of these\n` +
      `  defers until the passes run out and the installer reports INCOMPLETE — failing blank-db\n` +
      `  provisioning, and with it every job that needs a database built from empty.\n` +
      `  deploy-migrate is unaffected, so the deploy path stays green and hides it.\n\n` +
      `  Open the file's statements with the guard its siblings carry:\n\n` +
      `      IF to_regclass('<schema>.<table>') IS NULL THEN RETURN; END IF;\n\n` +
      `  It then no-ops at step 3 and ${INSTALLER} re-applies it at step 6, once the table\n` +
      `  exists (it selects every root file carrying that guard). PRE_OVERLAY_CREATORS is NOT\n` +
      `  the remedy here: the creator is already in ${ROOT_TREE}/ and is deferred on purpose.\n`,
  );
  process.exit(1);
}

console.log(`${TAG} ✅ every overlay dependency is reachable by the installer.`);
