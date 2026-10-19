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
  // Both lists are indented inside the installer (one at module scope, one
  // inside the step-3 block), so the close is matched with its indentation.
  const m = src.match(new RegExp(`const ${name} = \\[([\\s\\S]*?)\\n\\s*\\];`));
  if (!m) throw new Error(`${TAG} ${name} not found in ${INSTALLER} — this gate models that list and must be updated with it`);
  return [...m[1].matchAll(/'([^']+)'/g)].map((x) => x[1]);
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
 * creates. Non-public schemas are a different applier's question.
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
  for (const [name, expected, sql] of cases) {
    const reachable = new Set(name.includes('step 2 pushed') ? ['auth_docs'] : []);
    const got = unreachableDeps({ file: 'migrations/probe.sql', sql, reachable, dbTreeCreators: dbTree }).length;
    const ok = got === expected;
    if (!ok) bad++;
    console.log(`  ${ok ? '✓' : '✗'} ${name} — expected ${expected}, got ${got}`);
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

if (process.argv.includes('--list')) {
  for (const h of findings) console.log(`${h.file}  needs ${h.table}  <- ${h.creators.join(', ')}`);
  console.log(`\n${findings.length} finding(s).`);
  process.exit(0);
}

console.log(
  `${TAG} ${overlayFiles.length} overlay file(s) · ${pushed.size} pushed table(s) · ` +
    `${preOverlay.length} pre-overlay creator(s) · ${findings.length} finding(s).`,
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

console.log(`${TAG} ✅ every overlay dependency is reachable by the installer.`);
