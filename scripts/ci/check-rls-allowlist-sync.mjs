#!/usr/bin/env node
/**
 * CI gate: keep every copy of the RLS allowlist in sync with the single source
 * of truth, server/db/rlsAllowlist.ts → RLS_ALLOWLIST.
 *
 * The allowlist — tables that carry a tenant column but must NOT be policied —
 * is hand-copied into four hand-authored places because none of them can import
 * the TS (three are SQL/DO blocks; one is a standalone .mjs run under psql). This
 * script proves all four agree with the source of truth and fails the build on
 * any drift:
 *
 *   1. migrations/0021_enable_rls_everywhere.sql   — the install-time sweep
 *   2. db/migrations/20260801_tenant_isolation_sweep.sql — the deploy-time sweep
 *   3. scripts/db/rls-coverage-check.sql           — the CI coverage gate
 *   4. scripts/db/deploy-smoke-assert.mjs          — the real-DB smoke assertion
 *
 * WHY THIS GUARDS ALL FOUR, NOT JUST 0021 (ledger C-44). The deploy-time sweep
 * once carried a hand-written allowlist that dropped api_keys / billing_budgets /
 * billing_alerts. Nothing checked it, so it silently policied api_keys — the
 * table validateApiKey() reads PRE-AUTH — and under RLS_ENFORCE=on that filtered
 * the lookup to zero rows, breaking all api-key authentication. An allowlist that
 * is a source of truth for one consumer and folklore for three others is not a
 * source of truth. Every consumer is now pinned to it here.
 *
 * Usage:
 *   node scripts/ci/check-rls-allowlist-sync.mjs
 */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const repoRoot = path.resolve(path.dirname(__filename), '..', '..');

function fail(msg) {
  console.error(`[ci:rls-allowlist-sync] ${msg}`);
  process.exit(1);
}

// Pull the single-quoted identifiers out of a matched array/list body.
function idents(body) {
  return [...body.matchAll(/'([a-z_][a-z0-9_]*)'/gi)].map(m => m[1]);
}

function read(rel) {
  const p = path.join(repoRoot, rel);
  if (!fs.existsSync(p)) fail(`missing ${rel}`);
  return fs.readFileSync(p, 'utf8');
}

// Extract the FIRST capture group of `re` from `src`, or fail with `where`.
function extract(src, re, where, rel) {
  const m = src.match(re);
  if (!m) fail(`could not locate ${where} in ${rel}`);
  return idents(m[1]);
}

const TS = 'server/db/rlsAllowlist.ts';
const SOURCES = [
  {
    rel: 'migrations/0021_enable_rls_everywhere.sql',
    where: 'allowlist CONSTANT text[] := ARRAY[...]',
    re: /allowlist\s+CONSTANT\s+text\[\]\s*:=\s*ARRAY\s*\[([\s\S]*?)\]/i,
  },
  {
    rel: 'db/migrations/20260801_tenant_isolation_sweep.sql',
    where: 'allowlist TEXT[] := ARRAY[...]',
    re: /allowlist\s+(?:CONSTANT\s+)?text\[\]\s*:=\s*ARRAY\s*\[([\s\S]*?)\]/i,
  },
  {
    rel: 'scripts/db/rls-coverage-check.sql',
    where: 'table_name <> ALL (ARRAY[...])',
    re: /table_name\s*<>\s*ALL\s*\(\s*ARRAY\s*\[([\s\S]*?)\]/i,
  },
  {
    rel: 'scripts/db/deploy-smoke-assert.mjs',
    where: 'const TENANT_ALLOWLIST = [...]',
    re: /TENANT_ALLOWLIST\s*=\s*\[([\s\S]*?)\]/,
  },
];

// Source of truth.
const canonical = extract(read(TS), /RLS_ALLOWLIST[^=]*=\s*\[([\s\S]*?)\]\s*as const/, 'RLS_ALLOWLIST', TS);
const canonicalSet = new Set(canonical);

let drift = false;
for (const s of SOURCES) {
  const list = extract(read(s.rel), s.re, s.where, s.rel);
  const set = new Set(list);
  const missing = canonical.filter(t => !set.has(t)); // in source of truth, absent here
  const extra = list.filter(t => !canonicalSet.has(t)); // here, not in source of truth
  if (missing.length || extra.length) {
    drift = true;
    console.error(`[ci:rls-allowlist-sync] DRIFT — ${s.rel}`);
    if (missing.length) console.error(`  missing (in RLS_ALLOWLIST, not here): ${missing.join(', ')}`);
    if (extra.length) console.error(`  extra   (here, not in RLS_ALLOWLIST): ${extra.join(', ')}`);
  }
}

if (drift) {
  console.error(`  Source of truth is ${TS} → RLS_ALLOWLIST. Update the drifted copy to match it exactly.`);
  console.error(`  An allowlist entry dropped from any copy re-opens the api_keys pre-auth break (ledger C-44).`);
  process.exit(1);
}

console.log(
  `[ci:rls-allowlist-sync] OK — ${canonical.length} entries match across RLS_ALLOWLIST and ${SOURCES.length} consumers`
);
