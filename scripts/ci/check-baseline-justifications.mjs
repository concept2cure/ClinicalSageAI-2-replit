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
import { INLINE_SUPPRESS_RE } from './lib/inline-suppression.mjs';
import { requireScanRoots } from './lib/scan-roots.mjs';

/** Source files the tenant-isolation scanner reads, same shape as that gate. */
function walkSource(dir, out = []) {
  if (!fs.existsSync(dir)) return out;
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      if (entry.name === 'node_modules' || entry.name === 'dist') continue;
      walkSource(full, out);
    } else if (/\.(ts|js|mjs)$/.test(entry.name)) out.push(full);
  }
  return out;
}

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
  // Both sides are empty by design — the 2026-08-07 pass drove the baseline
  // 25 → 0 and re-dispositioned every entry onto inline markers and the file
  // allowlist (see the justifications doc). Reporting "0 baseline file(s) all
  // justified" for that is an assertion that ∅ ⊆ ∅: true, and about nothing.
  //
  // So when the retired subject is empty, check the mechanism that replaced it
  // is actually in force. Every `tenant-isolation-safe:` marker must carry a
  // reason, which is what makes a suppression auditable; a bare marker is
  // ignored by the scanner and would be a suppression nobody can review. And
  // there must still BE markers — if they all vanish, this file is measuring
  // nothing again and should be retired rather than left printing OK.
  if (baselineFiles.size === 0) {
    // The marker scan is the whole check in this branch; a missing server/
    // would make it report zero suppressions and then fail for the wrong reason.
    requireScanRoots('[ci:baseline-justifications]', [path.join(repoRoot, 'server')]);
    const markers = [];
    const bare = [];
    for (const file of walkSource(path.join(repoRoot, 'server'))) {
      const src = fs.readFileSync(file, 'utf8');
      src.split('\n').forEach((line, i) => {
        if (!/tenant-isolation-safe/i.test(line)) return;
        const rel = `${path.relative(repoRoot, file)}:${i + 1}`;
        (INLINE_SUPPRESS_RE.test(line) ? markers : bare).push(rel);
      });
    }
    if (bare.length > 0) {
      console.error(
        '[ci:baseline-justifications] FAIL — tenant-isolation-safe marker(s) with no reason:'
      );
      for (const m of bare) console.error(`  - ${m}`);
      console.error('  → A suppression without a justification is not auditable. State why the');
      console.error('    query cannot cross tenants, or remove the marker and scope the query.');
      process.exit(1);
    }
    if (markers.length === 0) {
      console.error(
        '[ci:baseline-justifications] FAIL — the baseline is empty AND no inline suppressions exist.'
      );
      console.error('  Both mechanisms this gate can verify are gone, so it is asserting nothing.');
      console.error('  Retire this gate, or re-point it at whatever now carries the justifications.');
      process.exit(1);
    }
    console.log(
      `[ci:baseline-justifications] OK — baseline is empty (retired 2026-08-07); ` +
        `${markers.length} inline tenant-isolation-safe suppression(s), every one with a reason.`
    );
    process.exit(0);
  }
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
