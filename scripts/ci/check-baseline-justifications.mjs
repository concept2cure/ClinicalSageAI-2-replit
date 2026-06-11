#!/usr/bin/env node
/**
 * Guardrail: tenant-isolation baseline ↔ justification parity.
 *
 * Policy (docs/reports/tenant-isolation-justifications.md): every file that
 * appears in the tenant-isolation baseline must have a justification row in
 * the "Justified entries" table, and every row in that table must still
 * correspond to at least one baseline entry (no stale justifications).
 *
 * Parity is enforced at FILE level: baseline fingerprints are content-hash
 * keyed (`file#hash:table`) while justification rows cite `file:line`, so
 * line/hash matching would churn on every edit. File-level parity plus the
 * existing no-regression count check keeps both artifacts honest.
 *
 * Exit 1 with a per-file report on any mismatch.
 */
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const baselinePath = path.join(repoRoot, 'docs', 'reports', 'tenant-isolation-baseline.json');
const justificationsPath = path.join(repoRoot, 'docs', 'reports', 'tenant-isolation-justifications.md');

const baseline = JSON.parse(fs.readFileSync(baselinePath, 'utf8'));
const baselineFiles = new Set(
  (baseline.fingerprints ?? []).map((fp) => fp.split('#')[0])
);

const doc = fs.readFileSync(justificationsPath, 'utf8');

// Parse only the "Justified entries" table (rows up to the next ## heading).
const sectionMatch = doc.match(/## Justified entries[\s\S]*?(?=\n## |$)/);
if (!sectionMatch) {
  console.error('[ci:baseline-justifications] FAIL — "## Justified entries" section not found in justifications doc.');
  process.exit(1);
}
const justifiedFiles = new Set();
for (const row of sectionMatch[0].matchAll(/^\| `([^`]+)`/gm)) {
  // Cell is `path:lines` (lines may be a comma list); strip the line refs.
  justifiedFiles.add(row[1].split(':')[0].trim());
}

const missingJustification = [...baselineFiles].filter((f) => !justifiedFiles.has(f)).sort();
const staleJustifications = [...justifiedFiles].filter((f) => !baselineFiles.has(f)).sort();

if (missingJustification.length === 0 && staleJustifications.length === 0) {
  console.log(
    `[ci:baseline-justifications] OK — ${baselineFiles.size} baseline file(s) all justified, no stale rows.`
  );
  process.exit(0);
}

if (missingJustification.length > 0) {
  console.error('[ci:baseline-justifications] FAIL — baseline entries with NO justification row:');
  for (const f of missingJustification) console.error(`  - ${f}`);
  console.error('  → Add a row to the "Justified entries" table in docs/reports/tenant-isolation-justifications.md');
  console.error('    (or better: scope the query and remove the baseline entry).');
}
if (staleJustifications.length > 0) {
  console.error('[ci:baseline-justifications] FAIL — justification rows for files NO LONGER in the baseline:');
  for (const f of staleJustifications) console.error(`  - ${f}`);
  console.error('  → Move the row to the "Resolved (no longer in baseline)" section.');
}
process.exit(1);
