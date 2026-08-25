#!/usr/bin/env node
/**
 * CI gate: a Drizzle model must not be blind to a tenant column its table has.
 *
 * ── Why this gate exists ─────────────────────────────────────────────────────
 * The same defect has now been found twice, by hand, in two unrelated
 * subsystems — which is the definition of a class rather than an incident:
 *
 *   1. `electronic_signatures` — the model declared `organization_id` and the
 *      SQL lineage never created it. Fixed by
 *      migrations/20260813c2_electronic_signatures_tenant_key.sql.
 *   2. `shared/cmc-schema.ts` — five models omit an `organization_id` that the
 *      physical table declares NOT NULL. Recorded in the baseline below.
 *
 * A model that omits the tenant column is not a cosmetic mismatch. Every route
 * built on it is STRUCTURALLY unable to filter by tenant: `db.update(t).set(x)
 * .where(eq(t.id, id))` cannot carry an organization predicate that the model
 * does not expose. The only remaining boundary is Postgres RLS, and a control
 * that is one deep is exactly what this codebase keeps finding at the bottom of
 * an incident.
 *
 * `check-tenant-column-types.mjs` is the sibling gate and does NOT cover this:
 * it validates the TYPE of tenant columns that are declared, and cannot see one
 * that is absent.
 *
 * ── What it checks ───────────────────────────────────────────────────────────
 * For every table that physically declares a tenant column in the drizzle
 * journal, every `pgTable` model of that table must reference it. Measured at
 * the time of writing: 225 tables carry a tenant column, 693 models exist, and
 * exactly 5 models are blind — so this gate is near-zero-baseline rather than a
 * large backlog being papered over.
 *
 * ── Baseline ─────────────────────────────────────────────────────────────────
 * `docs/reports/tenant-blind-models-baseline.json`. Entries require a written
 * reason, and the list may only SHRINK — the same ratchet idiom as
 * check-tenant-entry-points.mjs and check-tenant-isolation.mjs.
 *
 * Exit 0 — every model sees the tenant column its table has, or is baselined.
 * Exit 1 — at least one new tenant-blind model.
 *
 * Usage:
 *   node scripts/ci/check-tenant-blind-models.mjs
 *   node scripts/ci/check-tenant-blind-models.mjs --write-baseline
 */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const JOURNAL = path.join(repoRoot, 'migrations/0000_sweet_joseph.sql');
const BASELINE = path.join(repoRoot, 'docs/reports/tenant-blind-models-baseline.json');
const TENANT_COLUMNS = ['organization_id', 'tenant_id', 'org_id'];

/**
 * Model-side tenant reference. Matches both the camelCase property and the
 * quoted SQL name, because a model may name the property anything as long as it
 * maps the column — what matters is that the column is reachable at all.
 */
const TENANT_IN_MODEL =
  /\b(organizationId|tenantId|orgId)\b|['"](organization_id|tenant_id|org_id)['"]/;

/** Tables that physically declare a tenant column, from the drizzle journal. */
function physicalTenantTables() {
  const ddl = fs.readFileSync(JOURNAL, 'utf8');
  const out = new Map();
  for (const m of ddl.matchAll(/CREATE TABLE "([a-z0-9_]+)" \(([\s\S]*?)\n\);/g)) {
    const [, table, cols] = m;
    const col = TENANT_COLUMNS.find(c => new RegExp(`"${c}"`).test(cols));
    if (col) out.set(table, col);
  }
  return out;
}

function walk(dir, acc = []) {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) {
      if (e.name === '__tests__' || e.name === 'node_modules') continue;
      walk(p, acc);
    } else if (e.name.endsWith('.ts')) {
      acc.push(p);
    }
  }
  return acc;
}

/** Every `export const X = pgTable('name', {...})` and whether it sees a tenant column. */
function models() {
  const out = [];
  for (const file of walk(path.join(repoRoot, 'shared'))) {
    const src = fs.readFileSync(file, 'utf8');
    for (const m of src.matchAll(/export const (\w+)\s*=\s*pgTable\(\s*['"]([a-z0-9_]+)['"]/g)) {
      // The model body runs to the next top-level `export const`, which is a
      // reliable terminator here and avoids brace-counting through nested
      // objects, template literals and index callbacks.
      const next = src.indexOf('\nexport const', m.index + m[0].length);
      const body = src.slice(m.index, next === -1 ? m.index + 6000 : next);
      out.push({
        file: path.relative(repoRoot, file),
        symbol: m[1],
        table: m[2],
        seesTenant: TENANT_IN_MODEL.test(body),
      });
    }
  }
  return out;
}

const physical = physicalTenantTables();
const all = models();
const blind = all
  .filter(m => physical.has(m.table) && !m.seesTenant)
  .map(m => ({ ...m, tenantColumn: physical.get(m.table) }))
  .sort((a, b) => `${a.table}${a.file}`.localeCompare(`${b.table}${b.file}`));

const key = m => `${m.file}::${m.symbol}`;

if (process.argv.includes('--write-baseline')) {
  const existing = fs.existsSync(BASELINE) ? JSON.parse(fs.readFileSync(BASELINE, 'utf8')) : {};
  const reasons = existing.entries ?? {};
  const entries = {};
  for (const m of blind) {
    entries[key(m)] = reasons[key(m)] ?? {
      table: m.table,
      tenantColumn: m.tenantColumn,
      reason: 'TODO: state why this model may omit the tenant column, or fix it.',
    };
  }
  fs.mkdirSync(path.dirname(BASELINE), { recursive: true });
  fs.writeFileSync(BASELINE, JSON.stringify({ entries }, null, 2) + '\n');
  console.log(`[ci:tenant-blind-models] wrote baseline with ${blind.length} entr(ies).`);
  process.exit(0);
}

const baseline = fs.existsSync(BASELINE) ? JSON.parse(fs.readFileSync(BASELINE, 'utf8')) : { entries: {} };
const baselined = new Set(Object.keys(baseline.entries ?? {}));

const unjustified = Object.entries(baseline.entries ?? {}).filter(
  ([, v]) => !v.reason || /^TODO/.test(v.reason)
);
const fresh = blind.filter(m => !baselined.has(key(m)));
const stale = [...baselined].filter(k => !blind.some(m => key(m) === k));

console.log(
  `[ci:tenant-blind-models] ${physical.size} table(s) carry a tenant column; ` +
    `${all.length} model(s) scanned; ${blind.length} blind (baseline ${baselined.size}).`
);

let failed = false;

if (fresh.length) {
  failed = true;
  console.error('\n[ci:tenant-blind-models] NEW tenant-blind model(s):\n');
  for (const m of fresh) {
    console.error(`  ${m.file} :: ${m.symbol}`);
    console.error(`      table "${m.table}" declares "${m.tenantColumn}"; the model does not.`);
    console.error(
      '      Every route on this model is structurally unable to filter by tenant.\n'
    );
  }
  console.error('  Add the column to the model, or baseline it with a written reason:');
  console.error('    node scripts/ci/check-tenant-blind-models.mjs --write-baseline\n');
}

if (unjustified.length) {
  failed = true;
  console.error('[ci:tenant-blind-models] baseline entr(ies) with no written reason:');
  for (const [k] of unjustified) console.error(`  ${k}`);
  console.error('');
}

// The ratchet only turns one way. A stale entry is not a failure — it means
// someone fixed a model, which is the point — but it must be removed so the
// baseline cannot silently regrow later.
if (stale.length) {
  failed = true;
  console.error('[ci:tenant-blind-models] baseline entr(ies) no longer blind — remove them:');
  for (const k of stale) console.error(`  ${k}`);
  console.error('\n  Regenerate: node scripts/ci/check-tenant-blind-models.mjs --write-baseline\n');
}

if (failed) process.exit(1);
console.log('[ci:tenant-blind-models] OK — no unjustified tenant-blind models.');
