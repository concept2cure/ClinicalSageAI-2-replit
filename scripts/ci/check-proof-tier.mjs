#!/usr/bin/env node
/**
 * CI Guard: the proof hierarchy must not silently shrink or overclaim.
 *
 * WHY THIS EXISTS
 * ---------------
 * docs/architecture/PROOF_HIERARCHY.md defines the platform's ladder of evidence
 * (unit → schema contract → DB integration → tenant isolation → browser workflow
 * → export reopen → external validator qualification). A ladder is only a ladder
 * if it stays standing: nothing stops a refactor from deleting the one journey
 * that proves eCTD export reopen, or a rename from leaving the hierarchy doc
 * pointing at a proof file that no longer exists. Either way the maturity claim
 * quietly rots and no test notices — the exact failure class the hierarchy was
 * written to make visible.
 *
 * This guard turns the proof surface into a ratcheted floor and checks two
 * invariants that must ALWAYS hold.
 *
 * WHAT IT INVENTORIES  (non-overlapping, classified by unambiguous convention)
 *   - schema-contract  (tier 2)     tests/schema-contract/*.contract.test.ts
 *   - tenant-contract  (tiers 2-4)  repo-wide *.contract.test.ts (excl. schema-contract)
 *   - golden-journeys  (tiers 3-7)  tests/golden-journeys/*.journey.test.ts
 *   - export-contract  (tiers 6-7)  tests/export-contract/*.proof.test.ts
 *   - e2e-browser      (tier 5)     tests/e2e/*.{e2e.ts,spec.ts}
 *
 * WHAT IT ENFORCES
 *   - FLOOR: every proof file recorded in the baseline must still exist. Deleting
 *     a proof fails the build. Adding proofs is encouraged and reported, never
 *     penalised (the floor only ratchets up, via --write-baseline).
 *   - INVARIANT 1 (proof packet): every *.journey.test.ts and *.proof.test.ts
 *     emits a machine-readable manifest (calls `.write(`). A journey that proves
 *     nothing durable is not a proof.
 *   - INVARIANT 2 (doc↔code sync): every proof-test path named in
 *     PROOF_HIERARCHY.md exists on disk. The hierarchy cannot cite a proof that
 *     was deleted or renamed out from under it.
 *
 * MODES
 *   (default)          fail if a baselined proof is missing or an invariant breaks
 *   --strict           also fail if any tier category is empty (zero proofs)
 *   --write-baseline   snapshot the current proof surface + regenerate the ledger
 *                      (docs/architecture/PROOF_TIER_LEDGER.md); run intentionally,
 *                      commit both results
 *   --json <path>      also write the full report as JSON
 *
 * KNOWN LIMITS (stated rather than hidden)
 *   - Classification is by directory + filename convention, not by reading each
 *     test's assertions. A file misfiled into the wrong directory is counted by
 *     its location. This guard proves the proof surface does not SHRINK; it does
 *     not certify that every counted file is individually rigorous (that is what
 *     code review and the tests themselves are for).
 *   - Tier 1 (unit) is deliberately not inventoried: unit tests are ubiquitous
 *     and a count would be noise. The floor covers the tiers whose loss is
 *     silent and consequential.
 */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const repoRoot = path.resolve(path.dirname(__filename), '..', '..');

const args = process.argv.slice(2);
const STRICT = args.includes('--strict');
const WRITE_BASELINE = args.includes('--write-baseline');
const jsonIdx = args.indexOf('--json');
const JSON_OUT = jsonIdx !== -1 ? args[jsonIdx + 1] : null;

const BASELINE_PATH = path.join(repoRoot, 'scripts', 'ci', 'proof-tier-baseline.json');
const LEDGER_PATH = path.join(repoRoot, 'docs', 'architecture', 'PROOF_TIER_LEDGER.md');
const HIERARCHY_DOC = path.join(repoRoot, 'docs', 'architecture', 'PROOF_HIERARCHY.md');

const IGNORE_DIRS = new Set(['node_modules', '.git', '_archive', '_deprecated', 'dist']);

/** Collect repo-relative files under dir whose basename matches `re`. */
function collect(dir, re, acc = []) {
  let entries;
  try {
    entries = fs.readdirSync(dir, { withFileTypes: true });
  } catch {
    return acc;
  }
  for (const e of entries) {
    const full = path.join(dir, e.name);
    if (e.isDirectory()) {
      if (IGNORE_DIRS.has(e.name)) continue;
      collect(full, re, acc);
    } else if (re.test(e.name)) {
      acc.push(path.relative(repoRoot, full).split(path.sep).join('/'));
    }
  }
  return acc;
}

// ── Inventory ────────────────────────────────────────────────────────────────

const schemaContract = collect(path.join(repoRoot, 'tests', 'schema-contract'), /\.contract\.test\.ts$/).sort();
const allContract = collect(path.join(repoRoot, 'tests'), /\.contract\.test\.ts$/).sort();
const schemaContractSet = new Set(schemaContract);
const tenantContract = allContract.filter((f) => !schemaContractSet.has(f)).sort();
const goldenJourneys = collect(path.join(repoRoot, 'tests', 'golden-journeys'), /\.journey\.test\.ts$/).sort();
const exportContract = collect(path.join(repoRoot, 'tests', 'export-contract'), /\.proof\.test\.ts$/).sort();
const e2eBrowser = collect(path.join(repoRoot, 'tests', 'e2e'), /\.(e2e\.ts|spec\.ts)$/).sort();

const CATEGORIES = [
  { key: 'schema-contract', tier: 'tier 2 (schema contract)', files: schemaContract },
  { key: 'tenant-contract', tier: 'tiers 2-4 (contract / tenant isolation)', files: tenantContract },
  { key: 'golden-journeys', tier: 'tiers 3-7 (DB → export reopen → external qualification)', files: goldenJourneys },
  { key: 'export-contract', tier: 'tiers 6-7 (export reopen → external qualification)', files: exportContract },
  { key: 'e2e-browser', tier: 'tier 5 (browser workflow)', files: e2eBrowser },
];
const inventory = Object.fromEntries(CATEGORIES.map((c) => [c.key, c.files]));

// ── Invariant 1: journeys + proofs emit a manifest ─────────────────────────────

const manifestless = [];
for (const f of [...goldenJourneys, ...exportContract]) {
  // The shared harness renders a report FROM the manifest; skip it — it defines
  // write(), it does not run a journey.
  if (f.endsWith('/harness.ts')) continue;
  const src = fs.readFileSync(path.join(repoRoot, f), 'utf8');
  if (!/\.write\s*\(/.test(src)) manifestless.push(f);
}

// ── Invariant 2: every proof path named in the hierarchy doc exists ────────────

const docMissing = [];
if (fs.existsSync(HIERARCHY_DOC)) {
  const doc = fs.readFileSync(HIERARCHY_DOC, 'utf8');
  const referenced = new Set(
    [...doc.matchAll(/tests\/[\w./-]+?\.(?:journey|proof|contract)\.test\.ts/g)].map((m) => m[0]),
  );
  for (const ref of referenced) {
    if (!fs.existsSync(path.join(repoRoot, ref))) docMissing.push(ref);
  }
}

// ── Ledger renderer ────────────────────────────────────────────────────────────

function renderLedger() {
  const total = CATEGORIES.reduce((n, c) => n + c.files.length, 0);
  const lines = [
    '# Proof-Tier Ledger',
    '',
    '> Generated by `npm run ci:proof-tier:write-baseline`. Do not edit by hand.',
    '> A snapshot of the platform\'s proof surface — the floor that',
    '> `scripts/ci/check-proof-tier.mjs` refuses to let shrink. See',
    '> `docs/architecture/PROOF_HIERARCHY.md` for what each tier means.',
    '',
    `**${total} proof files** across ${CATEGORIES.length} inventoried categories.`,
    '',
    '| Category | Tier(s) | Count |',
    '|---|---|--:|',
    ...CATEGORIES.map((c) => `| \`${c.key}\` | ${c.tier} | ${c.files.length} |`),
    '',
  ];
  for (const c of CATEGORIES) {
    lines.push(`## \`${c.key}\` — ${c.tier} (${c.files.length})`, '');
    if (c.files.length === 0) lines.push('_none_', '');
    else {
      for (const f of c.files) lines.push(`- \`${f}\``);
      lines.push('');
    }
  }
  return lines.join('\n');
}

// ── Write-baseline mode ────────────────────────────────────────────────────────

if (WRITE_BASELINE) {
  const baseline = {
    $comment:
      'The proof-tier FLOOR: proof files whose loss would silently weaken a maturity ' +
      'claim (docs/architecture/PROOF_HIERARCHY.md). scripts/ci/check-proof-tier.mjs fails ' +
      'when a listed file disappears. Grow this file (add proofs); never shrink it by ' +
      'deleting proofs. Regenerate with: npm run ci:proof-tier:write-baseline.',
    generatedAt: new Date().toISOString(),
    totals: Object.fromEntries(CATEGORIES.map((c) => [c.key, c.files.length])),
    inventory,
  };
  fs.writeFileSync(BASELINE_PATH, JSON.stringify(baseline, null, 2) + '\n');
  fs.writeFileSync(LEDGER_PATH, renderLedger() + '\n');
  const total = CATEGORIES.reduce((n, c) => n + c.files.length, 0);
  console.log(`[ci:proof-tier] baseline written: ${total} proof files across ${CATEGORIES.length} categories`);
  console.log(`[ci:proof-tier] ledger written: ${path.relative(repoRoot, LEDGER_PATH)}`);
  process.exit(0);
}

// ── Check mode ─────────────────────────────────────────────────────────────────

let baseline = null;
if (fs.existsSync(BASELINE_PATH)) {
  try {
    baseline = JSON.parse(fs.readFileSync(BASELINE_PATH, 'utf8'));
  } catch {
    console.error(`[ci:proof-tier] baseline unreadable at ${path.relative(repoRoot, BASELINE_PATH)}`);
    process.exit(1);
  }
}

const removed = []; // baselined proof files that no longer exist
if (baseline?.inventory) {
  for (const c of CATEGORIES) {
    const now = new Set(c.files);
    for (const f of baseline.inventory[c.key] ?? []) {
      if (!now.has(f) && !fs.existsSync(path.join(repoRoot, f))) removed.push({ category: c.key, file: f });
    }
  }
}

const added = [];
if (baseline?.inventory) {
  for (const c of CATEGORIES) {
    const was = new Set(baseline.inventory[c.key] ?? []);
    for (const f of c.files) if (!was.has(f)) added.push({ category: c.key, file: f });
  }
}

const emptyCategories = STRICT ? CATEGORIES.filter((c) => c.files.length === 0) : [];

if (JSON_OUT) {
  fs.writeFileSync(
    path.isAbsolute(JSON_OUT) ? JSON_OUT : path.join(repoRoot, JSON_OUT),
    JSON.stringify({ inventory, removed, added, manifestless, docMissing }, null, 2) + '\n',
  );
}

const total = CATEGORIES.reduce((n, c) => n + c.files.length, 0);
console.log(
  `[ci:proof-tier] ${total} proof files: ` +
    CATEGORIES.map((c) => `${c.key}=${c.files.length}`).join(', ') +
    (baseline ? '' : ' (no baseline — run ci:proof-tier:write-baseline)'),
);
if (added.length) {
  console.log(`[ci:proof-tier] +${added.length} new proof file(s) since baseline (good — run write-baseline to ratchet):`);
  for (const a of added) console.log(`      + [${a.category}] ${a.file}`);
}

const failures = [];
if (removed.length) failures.push(`${removed.length} baselined proof file(s) deleted`);
if (manifestless.length) failures.push(`${manifestless.length} journey/proof file(s) emit no manifest`);
if (docMissing.length) failures.push(`${docMissing.length} proof path(s) in PROOF_HIERARCHY.md do not exist`);
if (emptyCategories.length) failures.push(`${emptyCategories.length} proof categor(ies) are empty (strict)`);

if (failures.length === 0) {
  console.log('[ci:proof-tier] ✅ proof surface intact — no proofs removed, every journey emits a manifest, doc in sync.');
  process.exit(0);
}

console.error('');
console.error('🚫 Proof hierarchy regression:');
if (removed.length) {
  console.error('');
  console.error('  Baselined proof files that were DELETED (a maturity claim just lost its evidence):');
  for (const r of removed) console.error(`      − [${r.category}] ${r.file}`);
  console.error('    If a proof was intentionally retired, justify it in review, then re-baseline:');
  console.error('      npm run ci:proof-tier:write-baseline');
}
if (manifestless.length) {
  console.error('');
  console.error('  Journey/proof files that emit NO machine-readable manifest (call `.write(`):');
  for (const f of manifestless) console.error(`      ${f}`);
  console.error('    A journey that leaves no proof packet proves nothing durable.');
}
if (docMissing.length) {
  console.error('');
  console.error('  PROOF_HIERARCHY.md references proof files that do not exist (rename/delete drift):');
  for (const f of docMissing) console.error(`      ${f}`);
  console.error('    Update the doc to point at the real file, or restore the proof.');
}
if (emptyCategories.length) {
  console.error('');
  console.error('  Proof categories with zero files (strict mode):');
  for (const c of emptyCategories) console.error(`      ${c.key} — ${c.tier}`);
}
console.error('');
process.exit(1);
