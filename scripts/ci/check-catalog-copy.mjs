#!/usr/bin/env node
/**
 * check-catalog-copy.mjs — the module catalog's `description` column is
 * CUSTOMER COPY, and must not read like an engineering note.
 *
 * ── Why this exists ──────────────────────────────────────────────────────────
 * `available_modules.description` is rendered to customers in the Apps catalog
 * (client/src/concept2cure/v2/surfaces/AdminSurfaces.tsx, the `Apps` surface,
 * which maps it straight into each card's `desc`). The catalog was seeded by
 * copying each surface's registry `notes` verbatim — text written for whoever
 * builds the surface next — so 32 of 84 cards shipped telling a prospect the
 * product was unfinished ("In progress.", "Dashboard only today.", "No UI yet",
 * "Partially built in ui_kits/home") or leaking repository internals (file
 * paths, endpoint routes, `@shared` module names, "Contract ref").
 *
 * scripts/ci/check-internals-in-copy.mjs exists for exactly this class of
 * defect and reported clean throughout, because it scans
 * `client/src/**\/*.{ts,tsx}`. This copy lives in SQL and reaches the client
 * over HTTP at runtime, so a source scan cannot see it. That blind spot is the
 * reason the problem survived: the gate said clean while the catalog said
 * "In progress."
 *
 * This closes it by scanning the catalog migrations themselves — the one place
 * the text is authored — so the next person to add a module is stopped at CI
 * rather than at a customer demo.
 *
 * Usage: node scripts/ci/check-catalog-copy.mjs
 * Exit 0 when every description reads as product copy, 1 otherwise.
 */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const TAG = '[ci:catalog-copy]';

/**
 * Migrations that author catalog rows. A new one must be added here.
 *
 * ORDER IS SIGNIFICANT: the cross-file supersede pass below treats the LAST
 * file that authors an id as the one whose copy actually ships, which is how
 * the customer-copy repair supersedes the seed it is fixing. List a new
 * migration in the same order the applier runs it (scripts/db/migration-set.mjs)
 * or the gate will scan copy that no database ever ends up with.
 */
const SOURCES = [
  'db/migrations/20260810_reconcile_module_catalog.sql',
  'db/migrations/20260823_module_catalog_customer_copy.sql',
  'db/migrations/20260823_module_catalog_mdx_registers.sql',
];

/**
 * Each rule names what it forbids, so a failure tells the author what to write
 * instead rather than only that they were wrong.
 */
const RULES = [
  {
    why: 'build status — a customer reads this as "not finished"',
    re: /\b(in progress|no UI(?: yet)?|not yet (?:a|built|wired|prioriti[sz]ed)|partially built|dashboard only|kit-only|placeholder|coming soon|TODO|being assembled|strongest backend)\b/i,
  },
  {
    why: 'repository internals — paths, modules and filenames are not product copy',
    re: /(?:\b(?:server|client|shared|ui_kits|db|scripts|migrations)\/|@shared\b|\.tsx?\b|\.sql\b|\.mjs\b|\bHANDOFF_[A-Z_]+\b)/,
  },
  {
    why: 'API surface — endpoint routes and HTTP verbs are not product copy',
    re: /(?:\/api\/|\b(?:GET|POST|PUT|PATCH|DELETE)\s+\/|\bContract ref\b|\bread-model\b)/,
  },
  {
    why: 'code identifiers — constant and symbol names are not product copy',
    re: /\b(?:[A-Z][A-Z0-9]*_[A-Z0-9_]+|[a-z]+[A-Z][A-Za-z]*\.(?:ts|tsx))\b/,
  },
];

/** Parse `('id', 'name', 'description', ...` rows out of a VALUES list. */
function rowsIn(sql) {
  const out = [];
  const re = /^ {2}\('([a-z0-9-]+)', '((?:[^']|'')*)', '((?:[^']|'')*)'/gm;
  let m;
  while ((m = re.exec(sql)) !== null) {
    out.push({ moduleId: m[1], description: m[3].replace(/''/g, "'") });
  }
  return out;
}

/** Parse the two-column `('id', 'description')` form this repair migration uses. */
function pairsIn(sql) {
  const out = [];
  const re = /^ {2}\('([a-z0-9-]+)', '((?:[^']|'')*)'\)(?:,|;)?$/gm;
  let m;
  while ((m = re.exec(sql)) !== null) {
    out.push({ moduleId: m[1], description: m[2].replace(/''/g, "'") });
  }
  return out;
}

const findings = [];
let scanned = 0;

for (const rel of SOURCES) {
  const abs = path.join(repoRoot, rel);
  if (!fs.existsSync(abs)) {
    console.error(`${TAG} FAIL — listed source does not exist: ${rel}`);
    process.exit(1);
  }
  const sql = fs.readFileSync(abs, 'utf8');
  const rows = [...rowsIn(sql), ...pairsIn(sql)];
  // A parser that silently matches nothing would make this gate pass vacuously.
  if (rows.length === 0) {
    console.error(`${TAG} FAIL — parsed 0 rows from ${rel}. The row format changed; fix the parser.`);
    process.exit(1);
  }
  scanned += rows.length;

  // Within one file the LAST value for an id wins, which is how the repair
  // migration's corrected copy supersedes the seed it is fixing.
  const latest = new Map();
  for (const r of rows) latest.set(r.moduleId, r);

  for (const { moduleId, description } of latest.values()) {
    for (const rule of RULES) {
      const hit = description.match(rule.re);
      if (hit) findings.push({ rel, moduleId, why: rule.why, hit: hit[0], description });
    }
  }
}

// Cross-file: a later migration's corrected copy supersedes an earlier seed.
const superseded = new Set();
{
  const byId = new Map();
  for (const rel of SOURCES) {
    const sql = fs.readFileSync(path.join(repoRoot, rel), 'utf8');
    for (const r of [...rowsIn(sql), ...pairsIn(sql)]) byId.set(r.moduleId, rel);
  }
  for (const f of findings) if (byId.get(f.moduleId) !== f.rel) superseded.add(f);
}

const live = findings.filter((f) => !superseded.has(f));

if (live.length) {
  console.error(`${TAG} FAIL — ${live.length} catalog description(s) are not customer copy.\n`);
  for (const f of live) {
    console.error(`  ${f.moduleId}  (${f.rel})`);
    console.error(`    ${f.why}`);
    console.error(`    matched: ${JSON.stringify(f.hit)}`);
    console.error(`    text:    ${f.description.slice(0, 140)}${f.description.length > 140 ? '…' : ''}\n`);
  }
  console.error(
    '  These strings render to customers in the Apps catalog. Write what the\n' +
      '  module DOES for the person using it — no build status, no file paths,\n' +
      '  no endpoint names.\n',
  );
  process.exit(1);
}

console.log(
  `${TAG} OK — ${scanned} catalog description(s) across ${SOURCES.length} migration(s) read as product copy.`,
);
