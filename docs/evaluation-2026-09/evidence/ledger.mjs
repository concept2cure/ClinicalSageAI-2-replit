#!/usr/bin/env node
/**
 * Suppression ledger census — exact, not heuristic.
 *
 * Every ratchet gate carries a baseline file, so a green gate means "no worse
 * than N", never "clean". Each baseline uses its own shape, so each is read by
 * an explicit rule below rather than by guessing at the largest array — an
 * earlier heuristic version of this script mis-read six of them.
 *
 * Two baselines are deliberately EXCLUDED from the total because they are not
 * counts of tolerated defects:
 *   coverage-baseline.json  — a coverage percentage floor
 *   proof-tier-baseline.json — an inverted ratchet: a floor of proof files that
 *                              must not disappear, i.e. an asset, not a debt
 *
 * Re-runnable: `node docs/evaluation-2026-09/evidence/ledger.mjs`
 */
import { readFileSync, writeFileSync, existsSync } from 'node:fs';

/** [file, extractor, isLint] — extractor returns the tolerated-entry count. */
const LEDGER = [
  ['scripts/ci/eslint-warning-baseline.json',        (j) => j.totalWarnings,        true],
  ['docs/reports/purge-coverage-baseline.json',      (j) => j.count],
  ['scripts/ci/duplicate-exported-types-baseline.json', (j) => j.count],
  ['docs/reports/env-var-docs-baseline.json',        (j) => j.count],
  ['scripts/ci/tenant-resolvers-baseline.json',      (j) => j.count],
  ['scripts/ci/drizzle-tenant-scope-baseline.json',  (j) => j.sites.length],
  ['scripts/ci/server-error-leaks-baseline.json',    (j) => j.totalSites],
  ['scripts/ci/unreferenced-modules-baseline.json',  (j) => j.count],
  ['docs/reports/requestdb-coverage-baseline.json',  (j) => j.onSharedPool.length],
  ['scripts/ci/dead-audit-tables-baseline.json',     (j) => j.count],
  ['scripts/ci/tables-live-schema-baseline.json',    (j) => j.count],
  ['scripts/ci/duplicate-table-ddl-baseline.json',   (j) => j.total],
  ['scripts/ci/phantom-tokens-baseline.json',        (j) => j.siteCount,            true],
  ['scripts/ci/insert-columns-baseline.json',        (j) => j.violations.length],
  ['scripts/ci/unbacked-tables-baseline.json',       (j) => j.total],
  ['scripts/ci/model-migration-agreement-baseline.json', (j) => j.findings.length],
  ['scripts/ci/writerless-stores-baseline.json',     (j) => Object.keys(j.stores).length],
  ['scripts/ci/shell-css-collisions-baseline.json',  (j) => j.collisions.length,    true],
  ['scripts/ci/css-selector-shadowing-baseline.json',(j) => j.knownShadowed.length, true],
  ['scripts/ci/gateway-bypass-baseline.json',        (j) => Object.keys(j.entries).length],
  ['docs/reports/workflow-target-baseline.json',     (j) => Object.keys(j.entries).length],
  ['scripts/ci/commonjs-require-baseline.json',      (j) => j.files.length],
  ['docs/reports/tenant-entry-points-baseline.json', (j) => j.count],
  ['docs/reports/tenant-isolation-baseline.json',    (j) => j.fingerprints.length],
  ['docs/reports/route-mount-audit-baseline.json',   (j) => j.errors + j.warnings],
  ['scripts/ci/canonicalizers-baseline.json',        (j) => j.count],
  ['scripts/ci/orm-table-reachability-baseline.json',(j) => j.sites.length],
  ['docs/reports/tenant-blind-models-baseline.json', (j) => Object.keys(j.entries).length],
  ['scripts/ci/migration-drop-safety-baseline.json', (j) => j.allow.length],
  ['docs/reports/path-containment-baseline.json',    (j) => Object.keys(j.entries).length],
  ['scripts/ci/empty-state-honesty-baseline.json',   (j) => j.files.length,         true],
  ['migrations/.prefix-collisions-baseline.json',    (j) => Object.values(j).filter(Array.isArray).flat().length],
  // Baselines currently at zero — listed so the ledger shows the machinery, not just the debt.
  ['.typecheck-baseline.json',                       (j) => (j.errors?.length ?? j.count ?? 0)],
  ['docs/reports/no-mock-in-prod-routes-baseline.json', (j) => j.findings.length],
  ['scripts/ci/action-overclaim-baseline.json',      (j) => j.entries.length],
  ['scripts/ci/client-reachability-baseline.json',   (j) => j.count],
  ['scripts/ci/component-class-coverage-baseline.json', (j) => j.entries.length],
  ['scripts/ci/dead-audit-catch-baseline.json',      (j) => j.files.length],
  ['scripts/ci/error-envelope-reads-baseline.json',  (j) => j.sites.length],
  ['scripts/ci/fabricated-identity-baseline.json',   (j) => j.occurrences.length],
  ['scripts/ci/internals-in-copy-baseline.json',     (j) => j.files.length],
  ['scripts/ci/migration-reachability-baseline.json',(j) => j.count],
  ['scripts/ci/orphaned-stylesheets-baseline.json',  (j) => j.count],
];

const rows = [];
for (const [file, extract, isLint] of LEDGER) {
  if (!existsSync(file)) { rows.push({ file, entries: null, note: 'file absent' }); continue; }
  let entries = null;
  try { entries = extract(JSON.parse(readFileSync(file, 'utf8'))) ?? null; }
  catch (err) { rows.push({ file, entries: null, note: `unreadable: ${err.message}` }); continue; }
  rows.push({ file, entries, class: isLint ? 'lint/cosmetic' : 'defect' });
}

const sum = (pred) => rows.filter(pred).reduce((n, r) => n + (r.entries ?? 0), 0);
const total = sum(() => true);
const defects = sum((r) => r.class === 'defect');
const lint = sum((r) => r.class === 'lint/cosmetic');

rows.sort((a, b) => (b.entries ?? -1) - (a.entries ?? -1));
writeFileSync(new URL('02-suppression-ledger.json', import.meta.url), `${JSON.stringify(
  { generated: new Date().toISOString(), excluded: ['scripts/ci/coverage-baseline.json (percentage floor)', 'scripts/ci/proof-tier-baseline.json (inverted ratchet — an asset floor)'],
    totals: { total, defectClass: defects, lintClass: lint }, rows }, null, 2)}\n`);

for (const r of rows) console.log(String(r.entries ?? '—').padStart(6), (r.class ?? r.note ?? '').padEnd(14), r.file);
console.log('-'.repeat(72));
console.log(`${String(defects).padStart(6)}  defect-class entries under active suppression`);
console.log(`${String(lint).padStart(6)}  lint/cosmetic entries`);
console.log(`${String(total).padStart(6)}  TOTAL across ${rows.length} baseline files`);
