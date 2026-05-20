#!/usr/bin/env node
/**
 * CI gate against future tenant-column type drift.
 *
 * Scans the Drizzle schema files for any tenant-keyed column
 * (organizationId / orgId / tenantId) declared with a non-INTEGER type
 * (text, varchar, uuid). Fails the build if any are found.
 *
 * Why this gate exists: the RLS policy installed by
 * migrations/0021_enable_rls_everywhere.sql does
 * `<col> = NULLIF(current_setting(...), '')::INT`. A TEXT column would
 * either fail the migration (which checks for INTEGER and raises) or, if
 * the migration were ever bypassed, silently mismatch every row. Catching
 * drift at PR time is cheaper than catching it at deploy time.
 *
 * The four TEXT columns coerced by 0020 are pinned in shared/*.ts as
 * `integer(...)` after that migration ran. New schema additions must
 * follow the same convention.
 *
 * Usage:
 *   node scripts/ci/check-tenant-column-types.mjs
 *
 * Allowlist: if a tenant column legitimately needs a non-integer type
 * (vanishingly rare; usually means re-thinking the design), add it to
 * ALLOWED_NON_INTEGER below with a one-line `// why:` comment so the
 * next reader can challenge the decision.
 */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const repoRoot = path.resolve(path.dirname(__filename), '..', '..');

// Recursively list every .ts file under shared/. Drizzle schemas can live
// anywhere under there (root, modular subdirs, future additions) — globbing
// the whole tree is the only way to be sure we don't miss a new file.
function walkTs(rel) {
  const abs = path.join(repoRoot, rel);
  if (!fs.existsSync(abs)) return [];
  const out = [];
  for (const entry of fs.readdirSync(abs, { withFileTypes: true })) {
    const childRel = path.join(rel, entry.name);
    if (entry.isDirectory()) {
      out.push(...walkTs(childRel));
    } else if (entry.isFile() && entry.name.endsWith('.ts')) {
      out.push(childRel);
    }
  }
  return out;
}

const SCHEMA_FILES = walkTs('shared');

const TENANT_COLS = new Set(['organizationId', 'orgId', 'tenantId']);
const NON_INTEGER_TYPES = new Set(['text', 'varchar', 'uuid', 'char']);

// Format: 'shared/path/file.ts:LINE:colName' (resolved at scan time).
// Empty by default. Add only with a documented reason.
const ALLOWED_NON_INTEGER = new Set([
  // 'shared/example.ts:42:tenantId', // why: this column joins to a
  //                                    third-party UUID-keyed table.
]);

const violations = [];

for (const rel of SCHEMA_FILES) {
  const abs = path.join(repoRoot, rel);
  if (!fs.existsSync(abs)) continue;

  const lines = fs.readFileSync(abs, 'utf8').split('\n');
  lines.forEach((line, idx) => {
    // Match e.g. `organizationId: text('organization_id')` or
    // `tenantId: varchar('tenant_id', { length: 64 })`. Comments excluded.
    if (line.trim().startsWith('//') || line.trim().startsWith('*')) return;
    const m = line.match(
      /\b(organizationId|orgId|tenantId)\s*:\s*(text|varchar|uuid|char)\s*\(/
    );
    if (!m) return;
    const colName = m[1];
    const colType = m[2];
    if (!TENANT_COLS.has(colName) || !NON_INTEGER_TYPES.has(colType)) return;

    const key = `${rel}:${idx + 1}:${colName}`;
    if (ALLOWED_NON_INTEGER.has(key)) return;

    violations.push({ file: rel, line: idx + 1, column: colName, type: colType });
  });
}

if (violations.length) {
  console.error(
    `[ci:tenant-column-types] ${violations.length} tenant column(s) declared with a non-INTEGER type:`
  );
  for (const v of violations) {
    console.error(`  ${v.file}:${v.line}  ${v.column}: ${v.type}(...)`);
  }
  console.error('');
  console.error('  These columns must be `integer(...)` for the RLS policy in');
  console.error('  migrations/0021_enable_rls_everywhere.sql to filter them. If');
  console.error('  the design genuinely requires a non-integer type, add the');
  console.error('  entry to ALLOWED_NON_INTEGER in this script with a "why" note.');
  process.exit(1);
}

console.log(`[ci:tenant-column-types] OK — all tenant columns are integer-typed`);
