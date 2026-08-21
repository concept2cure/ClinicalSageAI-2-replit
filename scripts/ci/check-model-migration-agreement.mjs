#!/usr/bin/env node
/**
 * Do the Drizzle model and the migration lineage AGREE about this table?
 *
 * ── The defect this exists for ───────────────────────────────────────────────
 * `vault.documents` had two definitions that never agreed:
 *
 *   db/migrations/044c_gcc_vault_schema.sql   CREATE TABLE IF NOT EXISTS, 11
 *                                             columns (filename, title, status…)
 *   shared/schema/vault.ts                    the 28-column model the product is
 *                                             written against (document_code,
 *                                             s3_key, processing_status…)
 *
 * `IF NOT EXISTS` means whichever runs first wins, and the migration runs first.
 * So the shape in a provisioned database was the 11-column one while every line
 * of application code was written against the 28-column one. The single endpoint
 * that persists an uploaded document INSERTed sixteen columns that do not exist:
 *
 *     ERROR:  column "document_code" of relation "documents" does not exist
 *
 * Every document upload in the product returned 500, for as long as both
 * definitions had existed.
 *
 * ── Why the existing guard could not see it ──────────────────────────────────
 * `check-insert-columns-declared.mjs` asks "is this column declared ANYWHERE?"
 * and accepts a Drizzle model OR the migration lineage as the answer. That is
 * the right question for ITS defect — a column that is real in the database and
 * merely stale in the model must not be flagged, which is why `audit_logs`'
 * chain columns do not trip it. But it means a model and a migration
 * DISAGREEING about one table reads as fully compliant: every column is declared
 * somewhere, so nothing is reported, and the disagreement — the thing that
 * breaks at runtime — is invisible.
 *
 * ── Why this file parses instead of reusing that one's parsers ───────────────
 * Not for want of trying: the first version imported `declaredColumns()` and
 * `sqlLineageColumns()` from it. Both key tables by BARE NAME, dropping the
 * schema, which is exactly right for a question about whether a column exists
 * anywhere and exactly wrong for this one. `documents` exists in three schemas
 * in this database — `vault`, `ectd_v4` and `public` — so a bare-name key merges
 * three different tables into one and compares nonsense. That parser also
 * matches only `pgTable(`, never `vault.table(`, so it could not see the very
 * table this guard was written for. Fault injection is what surfaced it: adding
 * a phantom column to the vault model did not trip the gate.
 *
 * So the parsing here is schema-qualified throughout. It is a different
 * measurement, not a second copy of the same one.
 *
 * ── What counts as a violation ───────────────────────────────────────────────
 * A table the migration lineage CREATEs, where a Drizzle model declares columns
 * the lineage never adds. That asymmetry is the one that bites: against an
 * already-provisioned database `CREATE TABLE IF NOT EXISTS` makes the model's
 * version a no-op, so the model's extra columns exist in the type system and
 * nowhere else.
 *
 * The OTHER direction is deliberately NOT a violation. A lineage column the
 * model lacks is a stale model — the column is really there and code writing it
 * is correct. `audit_logs` is the standing example (sha256_chain, hmac_seal,
 * actor_id and six more the model never got). Flagging that would be the guard
 * crying wolf on the Part 11 audit chain, which is how a guard gets switched off.
 *
 * A table the lineage does not CREATE is also not a violation: it is a
 * drizzle-push-only table, a legitimate provisioning path here, and a migration
 * that merely indexes or alters one is not a second definition of it. Keying off
 * "the lineage knows any column for this table" instead reported 90 tables,
 * nearly all false — `project_intelligence_profiles` is named only by an index
 * migration and created by none.
 *
 * ── Baseline ─────────────────────────────────────────────────────────────────
 * `--list` prints every finding, `--write-baseline` records the current set, and
 * the run fails only on something NEW. The existing divergences are real and are
 * for their owners to burn down; what must not happen is another arriving
 * unnoticed.
 */

import { readFileSync, writeFileSync, existsSync, readdirSync, statSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const BASELINE = path.join(ROOT, 'scripts', 'ci', 'model-migration-agreement-baseline.json');

const argv = new Set(process.argv.slice(2));
const LIST = argv.has('--list');
const WRITE = argv.has('--write-baseline');

/**
 * `id` is skipped. A primary key is often spelled in a separate constraint
 * clause the column scan does not capture, so reporting it on a hundred tables
 * would bury the real findings — which is how a gate becomes something people
 * run `--write-baseline` at and stop reading.
 */
const IGNORED_COLUMNS = new Set(['id']);

function walkFiles(dir, ext, out = []) {
  let entries;
  try {
    entries = readdirSync(dir);
  } catch {
    return out;
  }
  for (const name of entries) {
    const full = path.join(dir, name);
    let st;
    try {
      st = statSync(full);
    } catch {
      continue;
    }
    if (st.isDirectory()) walkFiles(full, ext, out);
    else if (name.endsWith(ext)) out.push(full);
  }
  return out;
}

/** Read the body of a `{ … }` starting just after its opening brace. */
function braceBody(src, startIndex) {
  let depth = 1;
  let i = startIndex;
  while (i < src.length && depth > 0) {
    const c = src[i];
    if (c === '{') depth++;
    else if (c === '}') depth--;
    i++;
  }
  return { body: src.slice(startIndex, i - 1), end: i };
}

/**
 * Qualified table name → Set of column names the Drizzle models declare.
 *
 * Handles both spellings:
 *   pgTable('name', { … })            → public.name
 *   <schemaVar>.table('name', { … })  → <schema>.name
 * where `<schemaVar>` was bound by `const <schemaVar> = pgSchema('<schema>')`.
 */
function modelTables() {
  const byTable = new Map();
  for (const file of walkFiles(path.join(ROOT, 'shared'), '.ts')) {
    let src;
    try {
      src = readFileSync(file, 'utf8');
    } catch {
      continue;
    }

    // Which local identifiers are pgSchema handles in THIS file.
    const schemaOf = new Map();
    for (const m of src.matchAll(/(?:const|let|var)\s+([A-Za-z0-9_$]+)\s*=\s*pgSchema\(\s*['"]([a-z0-9_]+)['"]/gi)) {
      schemaOf.set(m[1], m[2].toLowerCase());
    }

    const re = /(?:([A-Za-z0-9_$]+)\.table|pgTable)\(\s*['"]([a-z0-9_]+)['"]\s*,\s*\{/gi;
    let m;
    while ((m = re.exec(src)) !== null) {
      const handle = m[1];
      // `foo.table(` where `foo` is not a pgSchema handle is some other API.
      if (handle && !schemaOf.has(handle)) continue;
      const schema = handle ? schemaOf.get(handle) : 'public';
      const key = `${schema}.${m[2].toLowerCase()}`;

      const { body, end } = braceBody(src, re.lastIndex);
      re.lastIndex = end;

      const cols = byTable.get(key) ?? new Set();
      // field: someType('sql_name'  — the sql name is what the database sees.
      for (const cm of body.matchAll(
        /^\s*[A-Za-z0-9_]+\s*:\s*[A-Za-z0-9_]+\s*\(\s*['"]([a-z0-9_]+)['"]/gim,
      )) {
        cols.add(cm[1].toLowerCase());
      }
      byTable.set(key, cols);
    }
  }
  return byTable;
}

/**
 * Qualified table name → { created, columns } from the migration lineage.
 *
 * `_consolidated` AND `_legacy` are excluded: archived snapshots that no applier
 * runs. Treating those as evidence about the live database is how the sibling
 * guard came to vouch for a column that existed nowhere — and it is not
 * hypothetical. `db/migrations/_legacy/042_gcc_evidence_vault.sql` CREATEs
 * `vault.documents` with the full 28-column shape, references a `core.programs`
 * table that exists in no schema here, and is applied by nothing. That file is
 * the reason the sibling guard passed the INSERT whose sixteen missing columns
 * 500'd every document upload in the product: it found `document_code` there and
 * called it declared. This guard found the same hole by fault injection —
 * hiding the real reconciling migration changed nothing, because the archive was
 * still answering for it.
 */
function lineageTables() {
  const byTable = new Map();
  const entry = (key) => {
    let e = byTable.get(key);
    if (!e) {
      e = { created: false, columns: new Set() };
      byTable.set(key, e);
    }
    return e;
  };
  const qualify = (schema, name) => `${(schema || 'public').toLowerCase()}.${name.toLowerCase()}`;

  /* The Drizzle-generated journal snapshot is excluded, and this one matters
     most of all.
     `migrations/meta/_journal.json` names it (`0000_sweet_joseph`), and it is
     GENERATED FROM THE MODELS — it CREATEs `vault.documents` with the full
     28-column model shape. Counting it as lineage means comparing the models
     against a copy of themselves, so every table it covers reports perfect
     agreement by construction. That is precisely what happened: with it
     included, hiding the real reconciling migration changed nothing, because
     the snapshot was still answering for the columns. It is also not applied
     here — `install-fresh` uses `drizzle-kit push`, not a journal replay, which
     is why the live table had 11 columns while this file described 28.
     An artifact derived from one side of a comparison cannot be evidence for
     that side. */
  const journalTags = new Set();
  try {
    const journal = JSON.parse(
      readFileSync(path.join(ROOT, 'migrations', 'meta', '_journal.json'), 'utf8'),
    );
    for (const e of journal.entries ?? []) if (e?.tag) journalTags.add(`${e.tag}.sql`);
  } catch {
    /* No journal in this checkout — nothing to exclude on that basis. */
  }

  const files = [
    ...walkFiles(path.join(ROOT, 'migrations'), '.sql'),
    ...walkFiles(path.join(ROOT, 'db', 'migrations'), '.sql'),
  ].filter(
    (f) =>
      /* Archived snapshots of schemas no applier runs. `_legacy/042` is why the
         sibling guard vouched for `document_code`: it CREATEs vault.documents
         with the full shape, references a `core.programs` that exists in no
         schema here, and nothing applies it. */
      !f.includes(`${path.sep}_consolidated${path.sep}`) &&
      !f.includes(`${path.sep}_legacy${path.sep}`) &&
      !journalTags.has(path.basename(f)),
  );

  for (const file of files) {
    let src;
    try {
      src = readFileSync(file, 'utf8');
    } catch {
      continue;
    }
    /* Comments come out BEFORE any paren balancing, not after.
       The CREATE TABLE body is found by counting parens, and a `--` comment
       containing an unmatched bracket makes that count run past the closing
       paren and swallow the NEXT table's columns. Measured: this attributed 34
       columns to `vault.documents`, a table whose one non-archived definition
       declares 13 — which silently made the guard unable to flag the very
       divergence it was written for. The sibling guard records the same lesson
       about splitting; it applies to balancing too. */
    src = src.replace(/--[^\n]*/g, '').replace(/\/\*[\s\S]*?\*\//g, '');

    // CREATE TABLE [IF NOT EXISTS] [schema.]name ( … )
    const create =
      /CREATE\s+TABLE\s+(?:IF\s+NOT\s+EXISTS\s+)?(?:["`]?([a-z0-9_]+)["`]?\s*\.\s*)?["`]?([a-z0-9_]+)["`]?\s*\(/gi;
    let m;
    while ((m = create.exec(src)) !== null) {
      const key = qualify(m[1], m[2]);
      const e = entry(key);
      e.created = true;

      // Balance parens rather than matching a terminator — indentation and
      // trailing comments vary too much across these files for a terminator.
      let depth = 1;
      let i = create.lastIndex;
      while (i < src.length && depth > 0) {
        const c = src[i];
        if (c === '(') depth++;
        else if (c === ')') depth--;
        i++;
      }
      const body = src.slice(create.lastIndex, i - 1);
      create.lastIndex = i;

      const clean = body; // comments already stripped file-wide above
      // Top-level column definitions only; a nested paren is a type or a
      // constraint argument, not a new column.
      let d = 0;
      let cur = '';
      const frags = [];
      for (const ch of clean) {
        if (ch === '(') d++;
        else if (ch === ')') d--;
        if (ch === ',' && d === 0) {
          frags.push(cur);
          cur = '';
        } else cur += ch;
      }
      frags.push(cur);
      for (const frag of frags) {
        const cm = frag.trim().match(/^["`]?([a-z0-9_]+)["`]?\s+/i);
        if (!cm) continue;
        const name = cm[1].toLowerCase();
        // Table-level constraint clauses are not columns.
        if (
          ['primary', 'unique', 'foreign', 'constraint', 'check', 'exclude', 'like'].includes(name)
        ) {
          continue;
        }
        e.columns.add(name);
      }
    }

    // ALTER TABLE [schema.]name ADD COLUMN [IF NOT EXISTS] col
    for (const am of src.matchAll(
      /ALTER\s+TABLE\s+(?:ONLY\s+)?(?:["`]?([a-z0-9_]+)["`]?\s*\.\s*)?["`]?([a-z0-9_]+)["`]?\s+ADD\s+COLUMN\s+(?:IF\s+NOT\s+EXISTS\s+)?["`]?([a-z0-9_]+)["`]?/gi,
    )) {
      entry(qualify(am[1], am[2])).columns.add(am[3].toLowerCase());
    }
  }
  return byTable;
}

function main() {
  const models = modelTables();
  const lineage = lineageTables();

  const findings = [];
  let bothCount = 0;

  for (const [table, modelCols] of models) {
    const l = lineage.get(table);
    if (!l || !l.created) continue;
    bothCount++;

    const missing = [...modelCols]
      .filter((c) => !l.columns.has(c))
      .filter((c) => !IGNORED_COLUMNS.has(c))
      .sort();

    if (missing.length > 0) findings.push({ table, missing });
  }

  findings.sort((a, b) => b.missing.length - a.missing.length || a.table.localeCompare(b.table));

  const key = (f) => `${f.table}:${f.missing.join(',')}`;
  const current = [...new Set(findings.map(key))].sort();

  if (WRITE) {
    writeFileSync(
      BASELINE,
      `${JSON.stringify({ generated: 'by --write-baseline', findings: current }, null, 2)}\n`,
    );
    console.log(`[ci:model-migration] baseline written — ${current.length} divergent table(s).`);
    return 0;
  }

  const baseline = new Set(
    existsSync(BASELINE) ? (JSON.parse(readFileSync(BASELINE, 'utf8')).findings ?? []) : [],
  );
  const fresh = findings.filter((f) => !baseline.has(key(f)));

  console.log('[ci:model-migration] Drizzle models vs migration lineage');
  console.log(`  models parsed              : ${models.size}`);
  console.log(`  tables CREATEd by both     : ${bothCount}`);
  console.log(`  divergent tables           : ${findings.length}`);
  console.log(`  baselined (known, unfixed) : ${baseline.size}`);

  if (LIST) {
    for (const f of findings) {
      console.log(
        `  ${baseline.has(key(f)) ? ' ' : '!'} ${f.table} — ${f.missing.length} model column(s) no migration creates:`,
      );
      console.log(`      ${f.missing.join(', ')}`);
    }
  }

  if (fresh.length === 0) {
    console.log(`\n✅ no new divergence. ${baseline.size} baselined and awaiting burn-down.`);
    return 0;
  }

  console.log(`\n❌ ${fresh.length} table(s) newly diverge between model and migration:\n`);
  for (const f of fresh) {
    console.log(`  ${f.table}`);
    console.log(`    model declares, no migration creates: ${f.missing.join(', ')}`);
  }
  console.log(
    '\n  A model column no migration creates exists in the type system and nowhere\n' +
      '  else. Against a database already provisioned by the migration, CREATE TABLE\n' +
      '  IF NOT EXISTS makes the model a no-op — so code written against these\n' +
      '  columns raises 42703 on EVERY execution. That is how every document upload\n' +
      '  in this product returned 500; see\n' +
      '  migrations/20260821_vault_documents_canonical_shape.sql.\n\n' +
      '  Fix by adding a migration that reconciles the table, not by widening this\n' +
      '  baseline. Use --list to see every divergence.',
  );
  return 1;
}

process.exit(main());
