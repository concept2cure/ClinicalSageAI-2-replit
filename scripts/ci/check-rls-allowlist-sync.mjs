#!/usr/bin/env node
/**
 * CI gate: keep server/db/rlsAllowlist.ts in sync with the array literal
 * embedded in migrations/0021_enable_rls_everywhere.sql.
 *
 * The migration is hand-authored SQL (Drizzle DO blocks can't import TS),
 * so the allowlist appears in two places. This script proves they agree —
 * fail the build if they drift.
 *
 * Source of truth: server/db/rlsAllowlist.ts → RLS_ALLOWLIST.
 *
 * Usage:
 *   node scripts/ci/check-rls-allowlist-sync.mjs
 */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const repoRoot = path.resolve(path.dirname(__filename), '..', '..');

const tsPath = path.join(repoRoot, 'server', 'db', 'rlsAllowlist.ts');
const sqlPath = path.join(repoRoot, 'migrations', '0021_enable_rls_everywhere.sql');

function fail(msg) {
  console.error(`[ci:rls-allowlist-sync] ${msg}`);
  process.exit(1);
}

function parseTsAllowlist(src) {
  // Match: export const RLS_ALLOWLIST: ... = [ ... ] as const;
  const block = src.match(/RLS_ALLOWLIST[^=]*=\s*\[([\s\S]*?)\]\s*as const/);
  if (!block) fail(`could not locate RLS_ALLOWLIST in ${tsPath}`);
  return [...block[1].matchAll(/'([a-z_][a-z0-9_]*)'/gi)].map(m => m[1]);
}

function parseSqlAllowlist(src) {
  // Match: allowlist CONSTANT text[] := ARRAY[ ... ];
  const block = src.match(/allowlist\s+CONSTANT\s+text\[\]\s*:=\s*ARRAY\s*\[([\s\S]*?)\]/);
  if (!block) fail(`could not locate allowlist ARRAY[...] in ${sqlPath}`);
  return [...block[1].matchAll(/'([a-z_][a-z0-9_]*)'/gi)].map(m => m[1]);
}

if (!fs.existsSync(tsPath)) fail(`missing ${tsPath}`);
if (!fs.existsSync(sqlPath)) fail(`missing ${sqlPath}`);

const tsList = parseTsAllowlist(fs.readFileSync(tsPath, 'utf8'));
const sqlList = parseSqlAllowlist(fs.readFileSync(sqlPath, 'utf8'));

const tsSet = new Set(tsList);
const sqlSet = new Set(sqlList);

const onlyInTs = tsList.filter(t => !sqlSet.has(t));
const onlyInSql = sqlList.filter(t => !tsSet.has(t));

if (onlyInTs.length || onlyInSql.length) {
  console.error(`[ci:rls-allowlist-sync] DRIFT detected.`);
  if (onlyInTs.length) console.error(`  in TS only:  ${onlyInTs.join(', ')}`);
  if (onlyInSql.length) console.error(`  in SQL only: ${onlyInSql.join(', ')}`);
  console.error(`  Source of truth is server/db/rlsAllowlist.ts. Update the migration to match.`);
  process.exit(1);
}

console.log(
  `[ci:rls-allowlist-sync] OK — ${tsList.length} entries match between TS and SQL`
);
