#!/usr/bin/env node
/**
 * CI Guard: a table the server QUERIES must exist on a database that a real
 * provisioning run actually produced.
 *
 * WHY THIS EXISTS — the blind spot the other two table guards share.
 * ------------------------------------------------------------------
 * `ci:unbacked-tables` asks "does any .sql file in this repo contain a CREATE
 * TABLE for this name?". `ci:migration-reachability` tightens that to "…and is
 * that .sql on a path some applier runs?" — a real improvement, but still a
 * question answered by READING THE REPOSITORY. Both compare the repo to itself,
 * and a repository can always answer yes about its own text.
 *
 * That is not a hypothetical gap. A 2026-08 assessment counted **85 tables the
 * server queries that do not exist after a full, successful provisioning run** —
 * design-controls' 20 endpoints, QC's 45, IVDR's core — while both guards
 * reported green over every one of them. The ways a CREATE TABLE can be real in
 * the tree and absent from the database are ordinary, not exotic:
 *
 *   • the file is on an applier's list but the applier stops earlier, on a
 *     failure it swallows, so the tail of the list never runs;
 *   • the statement sits behind a `DO $$ … IF … END $$` that no environment
 *     satisfies, or inside a transaction a later statement rolls back;
 *   • the CREATE runs against a different schema than the one the server's
 *     search_path resolves — the DDL succeeds and the query still 404s the
 *     relation;
 *   • the table is created and a later migration in the same run drops or
 *     renames it;
 *   • the applier is a `psql -f` loop whose per-file exit code nobody checks.
 *
 * In every one of those, the repository says "created" and the database says
 * "does not exist". Only a live database can tell them apart. This guard is the
 * one that asks it: it takes the SAME set of server-referenced tables the
 * reachability guard derives — by IMPORTING its parser, not by re-implementing
 * it — and resolves each name against a real, connected PostgreSQL.
 *
 * WHERE IT MUST RUN
 * -----------------
 * In the `blank-db-provisioning` CI job, which builds its database from nothing
 * with install-fresh + deploy-migrate. Running it against a hand-maintained or
 * long-lived database would prove nothing: those accumulate tables from ad-hoc
 * DDL that no deploy will ever reproduce, which is the very drift being
 * measured. It must NOT run in `lint` — that job has no database, and a guard
 * that needs one and cannot find one has exactly two honest options, neither of
 * which is "pass".
 *
 * IT NEVER SKIPS
 * --------------
 * No DATABASE_URL, an unreachable server, or a database that was never
 * provisioned are all HARD FAILURES here, not skips. A guard that silently
 * no-ops when its dependency is missing reports success while doing nothing —
 * the same class of defect this guard was written to catch, reproduced inside
 * the guard itself. In particular, --baseline REFUSES to snapshot a database
 * that has no base schema: a baseline captured against a blank database would
 * record every table as absent and permanently blind the ratchet.
 *
 * WHY A RATCHET AND NOT A HARD GATE
 * ---------------------------------
 * The current absence count is large. A hard gate would be reverted or bypassed
 * within a day and the defect would go back to being invisible; a ratchet can be
 * turned on today, and every absence it holds is a numbered, named, committed
 * fact rather than an unknown. The baseline may only shrink. Resolving an entry
 * (add the missing migration to a durable applier, or delete the dead query) and
 * removing it here is always preferable to re-running --baseline.
 *
 * MODES
 *   --baseline              snapshot the current absences; run intentionally and
 *   --write-baseline        commit the result (the two spellings are the same)
 *   --strict-no-regression  fail only on absences not in the baseline (default)
 *   --strict                fail on ANY absence, baseline ignored
 *   --json <path>           also write the full report as JSON
 *
 * KNOWN LIMITS (stated rather than hidden)
 *   - Reference extraction is the reachability guard's, so it inherits that
 *     guard's scope exactly: raw SQL in string literals only. Drizzle
 *     query-builder calls are typechecked against shared/schema.ts, and
 *     dynamically composed names (`FROM ${tbl}`) are unresolvable and skipped.
 *     This under-reports; it does not guess.
 *   - Existence is checked, not shape. A table that exists with the wrong
 *     columns passes here and fails at runtime. That is the next guard, not
 *     this one.
 *
 * Usage:
 *   DATABASE_URL='postgres://…' node scripts/ci/check-tables-against-live-schema.mjs
 *   DATABASE_URL='postgres://…' node scripts/ci/check-tables-against-live-schema.mjs --baseline
 */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import pg from 'pg';
import { sslFor } from '../db/connection.mjs';
import { referencedTables } from './check-migration-reachability.mjs';

const __filename = fileURLToPath(import.meta.url);
const repoRoot = path.resolve(path.dirname(__filename), '..', '..');
const TAG = '[ci:tables-live-schema]';
const BASELINE = path.join(repoRoot, 'scripts', 'ci', 'tables-live-schema-baseline.json');

const argv = process.argv.slice(2);
const writeBaseline = argv.includes('--baseline') || argv.includes('--write-baseline');
const strict = argv.includes('--strict');
const jsonIdx = argv.indexOf('--json');
const jsonOut = jsonIdx !== -1 ? argv[jsonIdx + 1] : null;

/**
 * The repo's own definition of "this database has been provisioned", kept
 * identical to BASE_SCHEMA_SENTINELS in scripts/db/deploy-migrate.mjs.
 *
 * Copied rather than imported ON PURPOSE: deploy-migrate.mjs is a script with no
 * entry-point guard, so importing it would APPLY MIGRATIONS as a side effect of
 * running a read-only check. Four table names carry no parsing subtlety to drift
 * over; if that list changes, this one follows.
 */
const BASE_SCHEMA_SENTINELS = ['organizations', 'users', 'c2c_documents', 'regulatory_programs'];

function die(lines) {
  console.error('');
  for (const l of [].concat(lines)) console.error(l);
  console.error('');
  process.exit(1);
}

// ── 1. What the server references ───────────────────────────────────────────
// Imported from the reachability guard so the two cannot disagree about what
// "a table the server references" means. See referencedTables() there.
const referenced = referencedTables();
if (referenced.size === 0) {
  die([
    `${TAG} ✗ the reference scan found NO tables in server/.`,
    '  That is not a clean result, it is a broken scan — this repo has hundreds.',
    '  Check that server/ is present in the checkout and that the shared parser in',
    '  scripts/ci/check-migration-reachability.mjs still exports referencedTables().',
  ]);
}

// ── 2. What the live database actually has ──────────────────────────────────
const url = process.env.DATABASE_URL;
if (!url) {
  die([
    `${TAG} ✗ DATABASE_URL is not set.`,
    '  This guard exists precisely because the repository cannot answer its',
    '  question. Without a live, provisioned database there is nothing to check,',
    '  and reporting success would make it the very kind of guard it was written',
    '  to replace. Run it in the blank-db-provisioning job, or locally against a',
    '  database built by:',
    '',
    "      DATABASE_URL='postgres://…' node scripts/db/install-fresh.mjs",
    "      DATABASE_URL='postgres://…' node scripts/db/deploy-migrate.mjs",
  ]);
}

const client = new pg.Client({ connectionString: url, ssl: sslFor(url) });

try {
  await client.connect();
} catch (err) {
  die([
    `${TAG} ✗ could not connect to DATABASE_URL: ${err.message}`,
    '  Failing rather than skipping: an unreachable database means this check did',
    '  not run, and "did not run" must never be reported as "passed".',
  ]);
}

try {
  // The provisioning assertion. A blank or half-built database would make every
  // table look absent — a finding that says nothing about the code and, under
  // --baseline, would freeze that nonsense into the ratchet forever.
  const sentinels = await client.query(
    `SELECT unnest($1::text[]) AS name EXCEPT
     SELECT table_name FROM information_schema.tables WHERE table_schema = 'public'`,
    [BASE_SCHEMA_SENTINELS],
  );
  if (sentinels.rows.length) {
    die([
      `${TAG} ✗ this database has not been provisioned — refusing to check against it.`,
      `  Missing base tables: ${sentinels.rows.map((r) => r.name).join(', ')}`,
      '  Every referenced table would report as absent, which measures the fixture,',
      '  not the schema. Provision it first with scripts/db/install-fresh.mjs.',
    ]);
  }

  const inventory = await client.query(
    `SELECT count(*)::int AS n
       FROM pg_class c JOIN pg_namespace ns ON ns.oid = c.relnamespace
      WHERE c.relkind IN ('r','p','v','m','f')
        AND ns.nspname NOT IN ('pg_catalog','information_schema')
        AND ns.nspname NOT LIKE 'pg_toast%'`,
  );

  // to_regclass is the RUNTIME question, asked exactly as the server asks it: it
  // resolves an unqualified name through the connection's search_path and
  // returns NULL when nothing resolves. information_schema.tables would answer a
  // narrower question — it omits materialized views, which are perfectly
  // queryable storage, so a matview-backed table would be reported as a phantom
  // absence and would then sit in the baseline as a defect nobody can fix.
  const names = [...referenced.keys()].sort();
  const resolved = await client.query(
    `SELECT n AS name, to_regclass(n)::text AS relation FROM unnest($1::text[]) AS n`,
    [names],
  );

  const unresolved = resolved.rows.filter((r) => r.relation === null).map((r) => r.name);

  // A name that resolves to no relation may still be a set-returning FUNCTION:
  // `FROM ectd.seed_project_hierarchy($1::uuid)` and
  // `FROM vault.hybrid_search(...)` are calls, not storage, and reporting them
  // as missing tables would put ~15 entries into the baseline that no migration
  // can ever resolve — a permanent "known defect" nobody can close, which is how
  // a ratchet gets ignored. The other guards separate these with a `(`-lookahead
  // heuristic; this one can do better and simply ASK THE DATABASE whether the
  // name is a callable routine, which is the same authority it uses for
  // everything else.
  const routines = unresolved.length
    ? await client.query(
        `SELECT n AS name, EXISTS (
           SELECT 1 FROM pg_proc p JOIN pg_namespace ns ON ns.oid = p.pronamespace
            WHERE (position('.' in n) > 0
                   AND ns.nspname = split_part(n, '.', 1)
                   AND p.proname   = split_part(n, '.', 2))
               OR (position('.' in n) = 0
                   AND p.proname = n
                   AND pg_function_is_visible(p.oid))
         ) AS is_routine
         FROM unnest($1::text[]) AS n`,
        [unresolved],
      )
    : { rows: [] };
  const callable = new Set(routines.rows.filter((r) => r.is_routine).map((r) => r.name));

  const absent = unresolved.filter((n) => !callable.has(n)).sort();

  // ── 3. Report, grouped by the file that does the referencing ──────────────
  const byFile = new Map();
  for (const t of absent) {
    for (const f of referenced.get(t)) {
      if (!byFile.has(f)) byFile.set(f, []);
      byFile.get(f).push(t);
    }
  }
  const filesSorted = [...byFile.keys()].sort();

  console.log(
    `${TAG} ${inventory.rows[0].n} relations on the live database; ` +
      `${names.length} referenced by server SQL; ${callable.size} resolved as functions; ` +
      `${absent.length} absent`,
  );

  if (writeBaseline) {
    const body = {
      _comment:
        'Tables the server QUERIES that do not exist on a database built by a full, ' +
        'successful provisioning run (install-fresh + deploy-migrate). Unlike ' +
        'ci:unbacked-tables and ci:migration-reachability — which compare the repo to ' +
        'itself and can only tell you whether some file CLAIMS to create a table — every ' +
        'entry here was checked against a real PostgreSQL and was not there. Each one is ' +
        'an endpoint that 500s on "relation does not exist", or a write inside a ' +
        'try/catch that silently discards its data. This file may only SHRINK: fix an ' +
        'entry (add the creating migration to a durable applier, or delete the dead ' +
        'query) and remove it here. Re-running --baseline to make a failure go away ' +
        'converts a caught defect into an accepted one.',
      generatedAt: new Date().toISOString(),
      liveRelationCount: inventory.rows[0].n,
      referencedCount: names.length,
      count: absent.length,
      tables: Object.fromEntries(absent.map((t) => [t, [...referenced.get(t)].sort()])),
    };
    fs.writeFileSync(BASELINE, `${JSON.stringify(body, null, 2)}\n`);
    console.log(`${TAG} baseline written: ${absent.length} absent table(s) → ${path.relative(repoRoot, BASELINE)}`);
    process.exit(0);
  }

  const baseline =
    !strict && fs.existsSync(BASELINE) ? JSON.parse(fs.readFileSync(BASELINE, 'utf8')) : { tables: {} };
  const baselined = new Set(Object.keys(baseline.tables || {}));
  const added = absent.filter((t) => !baselined.has(t));
  const resolvedSince = [...baselined].filter((t) => !absent.includes(t));

  if (jsonOut) {
    fs.writeFileSync(
      path.isAbsolute(jsonOut) ? jsonOut : path.join(repoRoot, jsonOut),
      `${JSON.stringify(
        {
          liveRelationCount: inventory.rows[0].n,
          referencedCount: names.length,
          absent,
          added,
          resolvedSince,
          byFile: Object.fromEntries(filesSorted.map((f) => [f, byFile.get(f).sort()])),
        },
        null,
        2,
      )}\n`,
    );
  }

  if (resolvedSince.length) {
    console.log(
      `${TAG} ✅ ${resolvedSince.length} baselined table(s) now exist — remove them from the baseline to ratchet down:`,
    );
    for (const t of resolvedSince.slice(0, 20)) console.log(`    • ${t}`);
  }

  if (added.length === 0) {
    console.log(
      `${TAG} ✅ no NEW references to tables missing from the live schema` +
        (strict ? ' (strict mode)' : ` (${baselined.size} baselined)`),
    );
    process.exit(0);
  }

  console.error('');
  console.error(`${TAG} ❌ ${added.length} table(s) referenced by server SQL do not exist on the provisioned database:`);
  console.error('');
  const newSet = new Set(added);
  for (const f of filesSorted) {
    const hits = byFile.get(f).filter((t) => newSet.has(t)).sort();
    if (!hits.length) continue;
    console.error(`  ${f}`);
    for (const t of hits) console.error(`      ${t}`);
  }
  console.error('');
  console.error('  These were checked against a REAL database built by install-fresh +');
  console.error('  deploy-migrate, not against the repo. A CREATE TABLE existing somewhere');
  console.error('  in the tree is not the question and does not resolve this: the applier');
  console.error('  may never reach it, a guard clause may skip it, a later migration may');
  console.error('  drop it, or it may land in a schema the query does not resolve.');
  console.error('');
  console.error('  Fix: put the creating migration on a durable apply path (usually');
  console.error('  C2C_MIGRATION_FILES in scripts/db/migration-set.mjs), then re-run the');
  console.error('  provisioning locally and confirm the table is there. Or delete the');
  console.error('  query, if the feature it belongs to is dead.');
  console.error('');
  process.exit(1);
} finally {
  await client.end().catch(() => {});
}
