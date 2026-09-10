#!/usr/bin/env node
/**
 * CI gate: a table a per-request path reads must be able to carry a tenant
 * policy.
 *
 * ── WHY THIS EXISTS ──────────────────────────────────────────────────────────
 * On 2026-09-10 three cross-tenant defects were found by hand, in three
 * unrelated subsystems, none of them reported by any of the 142 gates:
 *
 *   1. GET /api/grdhe/audit/:tableName/:recordId served any tenant's 21 CFR
 *      Part 11 audit trail — old_data and new_data JSONB — to any authenticated
 *      user of any other tenant. Record ids are sequential.
 *   2. auditService.getAuditLog applied its tenant filter on the primary path
 *      and, when that path failed, fell through to a store with no tenant
 *      column, returning every tenant's rows as an array the caller could not
 *      tell from a correct answer.
 *   3. regulatory_harmonization.electronic_signatures stores Part 11 signature
 *      manifestations with no sponsor attribution at all.
 *
 * One cause. Each table has NO TENANT COLUMN, and every RLS sweep in this
 * repository keys off one:
 *
 *   migrations/0021_enable_rls_everywhere.sql          every schema; column in
 *                                                      (organization_id, org_id,
 *                                                      tenant_id); integer,
 *                                                      bigint, smallint or uuid
 *   db/migrations/20260801_tenant_isolation_sweep.sql  public only; integer only
 *   db/migrations/20260801_uuid_tenant_isolation_
 *     nonpublic.sql                                    an explicit 28-entry
 *                                                      (schema, table, column)
 *                                                      list; uuid columns
 *   db/migrations/20260728_stability_tenant_isolation  tables LIKE 'stab\\_%';
 *     .sql                                             ADDS tenant_id, then
 *                                                      policies
 *
 * So a table with no tenant column is not "missing a policy" — it is outside
 * the population every policy mechanism operates on. And it is outside the
 * population every EXISTING GATE operates on too, for the same reason:
 * check-tenant-blind-models.mjs compares models against "tables that physically
 * declare a tenant column"; check-tenant-column-types.mjs validates the type of
 * columns that are declared and, in its own words, "cannot see one that is
 * absent"; check-tenant-isolation.mjs looks for raw SQL missing a tenant
 * predicate, and a query on a table with no tenant column has no predicate to
 * miss. The absence removes the table from the check rather than flagging it.
 *
 * That blind spot is what this gate closes. It is the only gate here that
 * treats a MISSING column as the finding.
 *
 * ── WHAT IT CHECKS ───────────────────────────────────────────────────────────
 * For every table that (a) some non-archived .sql creates and (b) server code
 * outside tests names in a FROM / JOIN / INTO / UPDATE clause:
 *
 *   PASS  it declares organization_id, org_id, tenant_id, workspace_id or
 *         company_id — in its CREATE TABLE, in a later ALTER ... ADD COLUMN, or
 *         via one of the dynamic sweeps modelled below
 *   PASS  a CREATE POLICY names it directly (unusual without a tenant column,
 *         but it means someone decided)
 *   PASS  it is in the baseline WITH A WRITTEN REASON
 *   FAIL  none of the above
 *
 * This gate deliberately does NOT judge whether a policy is correct, whether a
 * query carries a predicate, or whether a route checks authorization. Four
 * other gates do those, and each of them assumes the tenant column exists.
 * This one asks the question underneath: CAN this table be isolated at all?
 *
 * ── WHAT A BASELINE ENTRY MEANS ──────────────────────────────────────────────
 * Not "approved". A reason must say which of these it is:
 *
 *   global      platform reference data, identical for every customer
 *               (terminology registries, document type catalogues, rule packs)
 *   derived     scoped through a parent that IS keyed, naming the parent and
 *               the join — the shape grdhe's fix now uses
 *   exempt      cross-tenant BY DESIGN, naming the reader that requires it and
 *               the privileged role it runs under — the shape
 *               20260801_uuid_tenant_isolation_nonpublic.sql used, in writing,
 *               for audit.event_log and federated_ml.federation_participants
 *   unreviewed  nobody has decided yet. THIS IS A DEFECT, not a category.
 *
 * The initial baseline is almost entirely `unreviewed`, and says so rather than
 * inventing justifications for 125 tables nobody has looked at. Shrink it.
 *
 * MODES
 *   (default)          fail on any unkeyed table not in the baseline
 *   --strict           fail on ANY unkeyed table, baseline included
 *   --unreviewed       exit 1 if any baseline entry is still `unreviewed`
 *   --write-baseline   snapshot the current set; run intentionally, commit it
 *   --json <path>      also write the full report as JSON
 *
 * Usage:
 *   node scripts/ci/check-unkeyed-request-tables.mjs
 *   node scripts/ci/check-unkeyed-request-tables.mjs --strict
 */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');

const args = process.argv.slice(2);
const STRICT = args.includes('--strict');
const UNREVIEWED = args.includes('--unreviewed');
const WRITE_BASELINE = args.includes('--write-baseline');
const jsonIdx = args.indexOf('--json');
const JSON_OUT = jsonIdx !== -1 ? args[jsonIdx + 1] : null;

const BASELINE_PATH = path.join(repoRoot, 'scripts', 'ci', 'unkeyed-request-tables-baseline.json');

/**
 * The column names every sweep keys on. 0021 and the deploy sweep both use
 * exactly (organization_id, org_id, tenant_id); workspace_id and company_id are
 * included because check-tenant-isolation.mjs treats them as tenant keys, and a
 * table carrying one is a deliberate scoping decision rather than an oversight
 * even if today's sweeps would not pick it up. A gate that disagreed with its
 * sibling on what a tenant key IS would produce findings nobody can act on.
 */
const TENANT_COLUMNS = /^(organization_id|org_id|tenant_id|workspace_id|company_id)$/;

/**
 * Sweeps that ADD a tenant column dynamically, so the column is absent from
 * every CREATE TABLE and present on every real database.
 *
 * Modelled explicitly rather than by parsing PL/pgSQL, because a regex over a
 * DO block that guesses wrong here fails in the dangerous direction: it would
 * mark a genuinely unkeyed table as covered. Each entry names the file so the
 * claim can be checked, and the self-test asserts the file still contains it.
 */
const DYNAMIC_KEYERS = [
  {
    file: 'db/migrations/20260728_stability_tenant_isolation.sql',
    // FOR rec IN SELECT … WHERE t.table_name LIKE 'stab\_%' ESCAPE '\'
    //   EXECUTE format('ALTER TABLE %I.%I ADD COLUMN IF NOT EXISTS tenant_id INTEGER', …)
    match: (table) => /^stab_/.test(table),
    adds: 'tenant_id',
    why: "sweeps every table named LIKE 'stab\\_%', adding tenant_id then ENABLE/FORCE RLS and tenant_isolation_policy",
  },
];

const ARCHIVED = ['_legacy/', '_deprecated_migrations/', 'docs/archive/', '_consolidated/', 'node_modules/'];
const isArchived = (p) => ARCHIVED.some((a) => p.includes(a));

function walk(dir, exts, acc = []) {
  let entries;
  try {
    entries = fs.readdirSync(dir, { withFileTypes: true });
  } catch {
    return acc;
  }
  for (const e of entries) {
    const full = path.join(dir, e.name);
    const rel = path.relative(repoRoot, full);
    if (isArchived(rel) || e.name === '.git') continue;
    if (e.isDirectory()) walk(full, exts, acc);
    else if (exts.some((x) => e.name.endsWith(x))) acc.push(rel);
  }
  return acc;
}

const stripSql = (s) => s.replace(/\/\*[\s\S]*?\*\//g, ' ').replace(/--[^\n]*/g, ' ');

// ── 1. What the SQL creates, and which tenant columns each table ends up with ──

/** table -> { columns:Set<string>, files:string[] } */
const created = new Map();
/** tables named by a literal CREATE POLICY */
const directlyPolicied = new Set();

const entryFor = (table) => {
  const key = table.toLowerCase();
  if (!created.has(key)) created.set(key, { columns: new Set(), files: [] });
  return created.get(key);
};

/** Split a CREATE TABLE body on TOP-LEVEL commas only — nested types have their own. */
function topLevelParts(body) {
  const parts = [];
  let depth = 0;
  let cur = '';
  for (const ch of body) {
    if (ch === '(') depth++;
    if (ch === ')') depth--;
    if (ch === ',' && depth === 0) {
      parts.push(cur);
      cur = '';
    } else cur += ch;
  }
  parts.push(cur);
  return parts;
}

const CONSTRAINT_LEAD = /^(PRIMARY|FOREIGN|UNIQUE|CHECK|CONSTRAINT|EXCLUDE|LIKE|PARTITION)\b/i;

for (const rel of walk(path.join(repoRoot, 'db', 'migrations'), ['.sql'])
  .concat(
    walk(path.join(repoRoot, 'migrations'), ['.sql']),
    walk(path.join(repoRoot, 'sql'), ['.sql']),
  )) {
  const src = stripSql(fs.readFileSync(path.join(repoRoot, rel), 'utf8'));

  for (const m of src.matchAll(/CREATE\s+POLICY\s+\S+\s+ON\s+(?:ONLY\s+)?([a-zA-Z_][\w.]*)/gi)) {
    directlyPolicied.add(m[1].toLowerCase());
  }

  const re = /CREATE\s+TABLE\s+(?:IF\s+NOT\s+EXISTS\s+)?([a-zA-Z_][\w.]*)\s*\(/gi;
  let m;
  while ((m = re.exec(src))) {
    let depth = 1;
    let i = re.lastIndex;
    while (i < src.length && depth > 0) {
      if (src[i] === '(') depth++;
      else if (src[i] === ')') depth--;
      i++;
    }
    const e = entryFor(m[1]);
    e.files.push(rel);
    for (const part of topLevelParts(src.slice(re.lastIndex, i - 1))) {
      const t = part.trim();
      if (!t || CONSTRAINT_LEAD.test(t)) continue;
      e.columns.add(t.split(/\s+/)[0].replace(/["`]/g, '').toLowerCase());
    }
  }

  // A later ALTER can add the tenant column the CREATE lacked. Two-stage parse:
  // one statement can carry several comma-separated ADD COLUMNs, and a regex
  // that reads only the first silently under-reports.
  for (const stmt of src.matchAll(
    /ALTER\s+TABLE\s+(?:IF\s+EXISTS\s+)?(?:ONLY\s+)?([a-zA-Z_][\w.]*)([^;]*)/gi,
  )) {
    const key = stmt[1].toLowerCase();
    if (!created.has(key)) continue;
    for (const col of stmt[2].matchAll(/ADD\s+COLUMN\s+(?:IF\s+NOT\s+EXISTS\s+)?["`]?(\w+)["`]?/gi)) {
      created.get(key).columns.add(col[1].toLowerCase());
    }
  }
}

// ── 2. What server code names in a per-request path ──────────────────────────

/**
 * SQL keywords and syntax that follow FROM/JOIN and are not tables. Anything
 * that survives this still has to match a table some migration creates, so a
 * miss here costs nothing — but a stray match on a real table name would be a
 * false finding, which is why the intersection is the filter rather than this.
 */
const NOT_A_TABLE = new Set(['select', 'lateral', 'unnest', 'values', 'generate_series', 'jsonb_array_elements', 'json_array_elements', 'dual', 'only']);

/** table -> Set<file> */
const referencedBy = new Map();

for (const rel of walk(path.join(repoRoot, 'server'), ['.ts', '.js', '.mjs'])) {
  if (/__tests__|\.test\.|\.spec\./.test(rel)) continue;
  const src = fs.readFileSync(path.join(repoRoot, rel), 'utf8');
  for (const m of src.matchAll(
    /\b(?:FROM|JOIN|INTO|UPDATE)\s+(?:ONLY\s+)?([a-z_][\w]*\.[a-z_][\w]*|[a-z_][\w]*)\b/gi,
  )) {
    const name = m[1].toLowerCase();
    if (NOT_A_TABLE.has(name)) continue;
    if (!created.has(name)) continue; // only tables the SQL actually creates
    if (!referencedBy.has(name)) referencedBy.set(name, new Set());
    referencedBy.get(name).add(rel);
  }
}

// ── 3. The finding ───────────────────────────────────────────────────────────

const dynamicKeyerFor = (table) => {
  const bare = table.includes('.') ? table.split('.').pop() : table;
  return DYNAMIC_KEYERS.find((d) => d.match(bare));
};

const unkeyed = [];
for (const [table, files] of referencedBy) {
  const info = created.get(table);
  if ([...info.columns].some((c) => TENANT_COLUMNS.test(c))) continue;
  if (dynamicKeyerFor(table)) continue;
  if (directlyPolicied.has(table)) continue;
  unkeyed.push({
    table,
    createdIn: [...new Set(info.files)].sort(),
    readBy: [...files].sort().slice(0, 6),
    readByCount: files.size,
  });
}
unkeyed.sort((a, b) => a.table.localeCompare(b.table));

// ── Baseline ─────────────────────────────────────────────────────────────────

if (WRITE_BASELINE) {
  let existing = {};
  try {
    existing = JSON.parse(fs.readFileSync(BASELINE_PATH, 'utf8')).entries ?? {};
  } catch {
    /* first run */
  }
  const baseline = {
    $comment:
      'Tables a per-request server path reads that carry NO tenant column, so no RLS ' +
      'sweep in this repository can policy them. Each entry needs a reason whose first ' +
      'word is one of: global | derived | exempt | unreviewed. "unreviewed" is a DEFECT ' +
      'awaiting triage, not a category — three cross-tenant disclosures on 2026-09-10 ' +
      'were all tables that would have sat here as "unreviewed". Shrink this file; never ' +
      'grow it. See docs/work-orders/WO-13-grdhe-tenant-scoping.md.',
    generatedAt: new Date().toISOString(),
    total: unkeyed.length,
    // Preserve any reason already written; default the rest to unreviewed. A
    // regenerate must never silently discard a human's triage.
    entries: Object.fromEntries(
      unkeyed.map((u) => [u.table, existing[u.table] ?? 'unreviewed — no one has classified this table yet']),
    ),
  };
  fs.writeFileSync(BASELINE_PATH, JSON.stringify(baseline, null, 2) + '\n');
  const kept = unkeyed.filter((u) => existing[u.table]).length;
  console.log(
    `[ci:unkeyed-request-tables] baseline written: ${unkeyed.length} tables ` +
      `(${kept} existing reason(s) preserved)`,
  );
  process.exit(0);
}

let baselineEntries = {};
if (fs.existsSync(BASELINE_PATH)) {
  try {
    baselineEntries = JSON.parse(fs.readFileSync(BASELINE_PATH, 'utf8')).entries ?? {};
  } catch {
    console.error(`[ci:unkeyed-request-tables] baseline unreadable at ${BASELINE_PATH}`);
    process.exit(1);
  }
}

const offending = STRICT ? unkeyed : unkeyed.filter((u) => !baselineEntries[u.table]);
const stillUnreviewed = Object.entries(baselineEntries)
  .filter(([, reason]) => /^unreviewed\b/i.test(String(reason)))
  .map(([t]) => t);

// A baseline entry for a table that is now keyed, or no longer read, is stale —
// and a baseline that overstates the debt hides the next real entry, which is
// the same bidirectional-parity rule check-tenant-blind-models.mjs enforces.
const present = new Set(unkeyed.map((u) => u.table));
const stale = Object.keys(baselineEntries).filter((t) => !present.has(t));

if (JSON_OUT) {
  fs.writeFileSync(
    path.isAbsolute(JSON_OUT) ? JSON_OUT : path.join(repoRoot, JSON_OUT),
    JSON.stringify(
      { scanned: created.size, requestReferenced: referencedBy.size, unkeyed, offending, stale, stillUnreviewed },
      null,
      2,
    ) + '\n',
  );
}

// ── Report ───────────────────────────────────────────────────────────────────

console.log(
  `[ci:unkeyed-request-tables] ${created.size} tables created; ` +
    `${referencedBy.size} read by a per-request path; ` +
    `${unkeyed.length} of those carry NO tenant column` +
    (STRICT ? ' (strict mode)' : `; ${Object.keys(baselineEntries).length} baselined, ${stillUnreviewed.length} still unreviewed`),
);

if (stale.length) {
  console.error('');
  console.error('🚫 Stale baseline entries — these tables are no longer unkeyed-and-read:');
  for (const t of stale) console.error(`      ${t}`);
  console.error('');
  console.error('  A baseline that overstates the debt hides the next real entry.');
  console.error('  Fix: npm run ci:unkeyed-request-tables:write-baseline');
  console.error('');
  process.exit(1);
}

if (UNREVIEWED && stillUnreviewed.length) {
  console.error('');
  console.error(`🚫 ${stillUnreviewed.length} baselined table(s) still carry no decision:`);
  for (const t of stillUnreviewed) console.error(`      ${t}`);
  console.error('');
  console.error('  Each needs a reason beginning global | derived | exempt.');
  console.error('  See docs/work-orders/WO-13-grdhe-tenant-scoping.md.');
  console.error('');
  process.exit(1);
}

if (offending.length === 0) {
  console.log('[ci:unkeyed-request-tables] ✅ no new tables read without a tenant key.');
  process.exit(0);
}

console.error('');
console.error('🚫 Table(s) a per-request path reads with NO tenant column:');
console.error('');
for (const u of offending) {
  console.error(`  ${u.table}`);
  console.error(`      created in : ${u.createdIn.join(', ')}`);
  console.error(
    `      read by    : ${u.readBy.join(', ')}${u.readByCount > u.readBy.length ? ` (+${u.readByCount - u.readBy.length} more)` : ''}`,
  );
}
console.error('');
console.error('  Every RLS sweep here keys off organization_id / org_id / tenant_id, so a');
console.error('  table with none is outside all of them — and outside every gate that looks');
console.error('  for a tenant-keyed table missing a policy. It is not protected in depth;');
console.error('  it is protected only by whatever predicate each query happens to carry.');
console.error('');
console.error('  Fix: give it a tenant column (RULE 1 — amend the creating migration in');
console.error('  place), or scope it through a parent that has one, or record it in the');
console.error('  baseline with a reason: global | derived | exempt.');
console.error('    npm run ci:unkeyed-request-tables:write-baseline');
console.error('');
process.exit(1);
