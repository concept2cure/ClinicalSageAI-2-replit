#!/usr/bin/env node
/**
 * CI Guard: no Drizzle model that nothing can create.
 *
 * ── THE INCIDENT ─────────────────────────────────────────────────────────────
 * `GET /api/approval-workflows/pending` answered 500 on every request, for the
 * life of the endpoint, with `relation "document_workflows" does not exist`.
 * The table was declared as a Drizzle model in `shared/schema/unified_workflow.ts`
 * and read by six services. Nothing created it:
 *
 *   · `drizzle-kit push` reads ONLY `shared/schema.ts` (drizzle.config.ts), and
 *     that barrel re-exports 8 of the 86 modules in `shared/schema/`.
 *     `unified_workflow` is not one of them, so push never saw the model.
 *   · No raw SQL migration created it either. The three files that mention
 *     `document_workflows` only add indexes or RLS policies TO it.
 *
 * ── WHY THE EXISTING GATE MISSED IT ──────────────────────────────────────────
 * `check-unbacked-tables.mjs` scans server code for RAW SQL table references. A
 * table reached through the ORM — `db.select().from(documentWorkflows)` — names
 * no table in any string, so it is invisible there. That gate is not wrong; it
 * covers a different surface. This one covers the ORM surface.
 *
 * ── THE RULE ─────────────────────────────────────────────────────────────────
 * Every `pgTable('name', …)` declared under `shared/schema/` must be creatable
 * by at least one provisioning path:
 *
 *   (a) its module is re-exported from `shared/schema.ts`, so `drizzle-kit push`
 *       creates it; OR
 *   (b) some `.sql` file under migrations/, db/migrations/ or sql/ has a
 *       `CREATE TABLE` for it.
 *
 * A model satisfying neither is a table that exists in TypeScript, is read by
 * production code, and has never existed in a database. That is the
 * "merged ≠ applied" failure this repo already names — caught here at the point
 * the model is written rather than the first time a customer opens the surface.
 *
 * Baseline: the sites that predate the rule. It must never grow.
 *
 * Usage:
 *   node scripts/ci/check-orm-table-reachability.mjs
 *   node scripts/ci/check-orm-table-reachability.mjs --list
 *   node scripts/ci/check-orm-table-reachability.mjs --write-baseline
 */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const SCHEMA_DIR = path.join(repoRoot, 'shared/schema');
const BARREL = path.join(repoRoot, 'shared/schema.ts');
const SQL_DIRS = ['migrations', 'db/migrations', 'sql'];
const BASELINE_FILE = path.join(repoRoot, 'scripts/ci/orm-table-reachability-baseline.json');

/** Every CREATE TABLE across the SQL trees, lower-cased for matching. */
function loadSqlCorpus() {
  let corpus = '';
  for (const dir of SQL_DIRS) {
    const full = path.join(repoRoot, dir);
    if (!fs.existsSync(full)) continue;
    for (const entry of fs.readdirSync(full)) {
      if (entry.endsWith('.sql')) corpus += fs.readFileSync(path.join(full, entry), 'utf8').toLowerCase() + '\n';
    }
  }
  return corpus;
}

function hasSqlCreator(corpus, table) {
  // `CREATE TABLE [IF NOT EXISTS] ["]public.]table`
  return new RegExp(`create table (?:if not exists )?"?(?:public\\.)?${table}\\b`).test(corpus);
}

const barrelSrc = fs.readFileSync(BARREL, 'utf8');
const sqlCorpus = loadSqlCorpus();

const findings = [];
for (const file of fs.readdirSync(SCHEMA_DIR).sort()) {
  if (!file.endsWith('.ts')) continue;
  const moduleName = file.replace(/\.ts$/, '');
  // (a) push creates everything in a re-exported module.
  if (barrelSrc.includes(`from './schema/${moduleName}'`)) continue;

  const src = fs.readFileSync(path.join(SCHEMA_DIR, file), 'utf8');
  for (const m of src.matchAll(/pgTable\(\s*['"]([a-z0-9_]+)['"]/g)) {
    const table = m[1];
    // (b) a raw migration creates it.
    if (hasSqlCreator(sqlCorpus, table)) continue;
    findings.push({ site: `shared/schema/${moduleName}.ts::${table}`, table, module: moduleName });
  }
}

findings.sort((a, b) => a.site.localeCompare(b.site));
const currentSites = new Set(findings.map((f) => f.site));

if (process.argv.includes('--list')) {
  for (const f of findings) console.log(f.site);
  console.log(`\n${findings.length} unreachable Drizzle model(s).`);
  process.exit(0);
}

if (process.argv.includes('--write-baseline')) {
  fs.writeFileSync(
    BASELINE_FILE,
    JSON.stringify(
      {
        note:
          'Drizzle models under shared/schema/ that no provisioning path can create: ' +
          'their module is not re-exported from shared/schema.ts (so drizzle-kit push ' +
          'never sees them) and no .sql file creates the table. Each is an endpoint ' +
          'that 500s the first time it is exercised. Fix by adding a migration, then ' +
          're-run with --write-baseline to shrink this list. It must never grow.',
        generatedBy: 'scripts/ci/check-orm-table-reachability.mjs --write-baseline',
        sites: findings.map((f) => f.site),
      },
      null,
      2,
    ) + '\n',
  );
  console.log(`[ci:orm-reachability] baseline written — ${findings.length} site(s).`);
  process.exit(0);
}

if (!fs.existsSync(BASELINE_FILE)) {
  console.error(
    '[ci:orm-reachability] FAIL — baseline missing. Generate it with:\n' +
      '  node scripts/ci/check-orm-table-reachability.mjs --write-baseline',
  );
  process.exit(1);
}

const baseline = new Set(JSON.parse(fs.readFileSync(BASELINE_FILE, 'utf8')).sites);
const introduced = findings.filter((f) => !baseline.has(f.site));
const resolved = [...baseline].filter((s) => !currentSites.has(s));

if (introduced.length > 0) {
  console.error(`\n[ci:orm-reachability] FAIL — ${introduced.length} Drizzle model(s) nothing can create:\n`);
  for (const f of introduced) console.error(`  ${f.site}`);
  console.error(
    '\n  A model here exists in TypeScript, is read by production code, and has\n' +
      '  never existed in a database. The endpoint reading it answers 500 with\n' +
      '  "relation ... does not exist" the first time anyone opens the surface.\n' +
      '\n  Give it a provisioning path — either:\n' +
      "    · add `export * from './schema/<module>';` to shared/schema.ts, so\n" +
      '      drizzle-kit push creates it (check for export-name collisions first); or\n' +
      '    · add a migration under migrations/ with the CREATE TABLE, and list it\n' +
      '      in scripts/db/migration-set.mjs so a DEPLOY applies it too. Creating\n' +
      '      the file is not enough: deploy-migrate applies only that array.\n',
  );
  process.exit(1);
}

let msg = `[ci:orm-reachability] OK — ${findings.length} unreachable model(s) (baseline ${baseline.size}), none new.`;
if (resolved.length > 0) {
  msg +=
    `\n  ${resolved.length} baseline model(s) now reachable: ${resolved.slice(0, 8).join(', ')}` +
    (resolved.length > 8 ? ` (+${resolved.length - 8})` : '') +
    '\n  Shrink the baseline:\n    node scripts/ci/check-orm-table-reachability.mjs --write-baseline';
}
console.log(msg);
process.exit(0);
