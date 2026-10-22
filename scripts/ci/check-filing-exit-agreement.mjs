#!/usr/bin/env node
/**
 * Guard: a seal, and anything built from the filing, asks whether the filing
 * still holds the document's text.
 *
 * P-29.2, docs/EXIT_ATTESTATION_DECISION_2026-10-18.md. An exit attests to the
 * EDITING layer (`authoring_sections`); the filing (`c2c_document_sections`) is
 * a derived projection. The guarantee a client is owed is that you cannot seal,
 * sign or ship a document whose filed copy is not the text you are looking at,
 * and `filingAgreesWithEditing` is the one place that question is asked.
 *
 * WHY A CI CHECK AND NOT ONLY TESTS
 * The gate is two statements in an 8,000-line router. Round 16 shipped it at
 * the freeze and left `/e-sign` as APPROVER — the path a client actually uses —
 * passing no check at all, for a round, while the tests were green and the
 * refusal read as coverage. That is the failure mode: not a broken gate, an
 * ABSENT one at the next door, invisible because every door that has it keeps
 * working. P-29's own closing paragraph says that without this check the
 * decision degrades into a comment.
 *
 * DISCOVERY, NOT AN ALLOWLIST. `check-lineage-save-gate.mjs` learned this the
 * hard way (ledger L157/L158: three content writers had shipped prose with no
 * lineage for as long as they existed, because an allowlist only guards what
 * someone remembered to add). So this script finds the doors itself, from the
 * WRITES and READS that constitute them, and a new one fails here by name
 * before it can ship unguarded.
 *
 * TWO FAMILIES OF DOOR
 *
 *   SEAL — a file that writes a seal or a signature over an authoring document:
 *     `INSERT INTO frozen_documents`, `INSERT INTO authoring_signatures`, or an
 *     `UPDATE authoring_documents SET … 'APPROVED'` stamp. After one of these
 *     the text is sealed for filing and the signature attests to it, so the
 *     filing must have been proven equal first. The seal is also the LAST point
 *     at which the two stores can be made to agree: saving a section re-files
 *     it, and after the seal that remedy is gone.
 *
 *   PACKAGE — a file that loads device/IVD content from the filing to build a
 *     deliverable (`loadDeviceContentLeaves`, `resolveDeviceContentScope`).
 *     These are the device exits P-29.3 put on the list and that no candidate
 *     exit list contained: they read `c2c_document_sections`, consult no seal
 *     and hash neither store.
 *
 * WHAT COUNTS AS GUARDED: a call to `filingAgreesWithEditing` in the same file,
 * or to one of the router's two wrappers around it (`filingBlocksSeal`,
 * `sealRefusedForFiling`). Same file, not same function — the scanner cannot
 * follow a call across a boundary, which is what the baseline's reasons are
 * for.
 *
 * THE BASELINE is per-file, shrink-only, and every entry needs a written
 * reason, in the shape `scripts/ci/sign-ceremony-baseline.json` and
 * `scripts/ci/migration-drop-safety-baseline.json` mandate: an entry is a
 * decision on the record, not a snooze. Each reason says whether the entry is
 * a DEFECT (recorded so it cannot grow) or a PROOF the scanner cannot see.
 *
 * Its failure branch is exercised by check-filing-exit-agreement.selftest.mjs.
 */
import { readFileSync, readdirSync, statSync } from 'node:fs';
import path from 'node:path';

const ROOT = process.cwd();
const BASELINE_PATH = path.join(ROOT, 'scripts/ci/filing-exit-agreement-baseline.json');

/** A seal or a signature over an authoring document. */
const SEAL_PATTERNS = [
  { re: /INSERT\s+INTO\s+frozen_documents/i, kind: 'frozen-snapshot' },
  { re: /INSERT\s+INTO\s+authoring_signatures/i, kind: 'signature-row' },
  // The stamp, in either column order, across a line break.
  { re: /UPDATE\s+authoring_documents\s+SET[\s\S]{0,200}?'APPROVED'/i, kind: 'approval-stamp' },
  { re: /UPDATE\s+authoring_documents[\s\S]{0,200}?SET\s+status\s*=\s*\$1[\s\S]{0,200}?approved_at/i, kind: 'approval-stamp' },
];

/** Building a device/IVD deliverable out of the filing store. */
const PACKAGE_PATTERNS = [
  { re: /\bloadDeviceContentLeaves\s*\(/, kind: 'device-content-load' },
  { re: /\bresolveDeviceContentScope\s*\(/, kind: 'device-content-scope' },
];

/** The one question, and the router's two wrappers around it. */
const GUARD_RE = /\b(filingAgreesWithEditing|filingBlocksSeal|sealRefusedForFiling)\s*\(/;

/**
 * Modules that DEFINE what is guarded, rather than being a door.
 * `filing-section-target.ts` holds the question itself; `estar-content-leaves.ts`
 * holds the device loaders this script anchors on, and a definition cannot call
 * itself into compliance. Every CALLER of them is still scanned.
 */
const DEFINES_GUARD = new Set([
  'server/services/c2c/filing-section-target.ts',
  'server/services/pathway-engines/estar/estar-content-leaves.ts',
]);

function walk(dir, out = []) {
  /* A gate that throws instead of reporting is a gate whose failure cannot be
     read. Found by the selftest's empty-tree case: `server/` always exists in
     this repository, so an unhandled ENOENT here would only ever have surfaced
     as a stack trace in CI with no verdict attached. */
  let entries;
  try {
    entries = readdirSync(dir);
  } catch (error) {
    if (error && error.code === 'ENOENT') return out;
    throw error;
  }
  for (const entry of entries) {
    if (entry === 'node_modules' || entry === '__tests__' || entry === 'dist') continue;
    const full = path.join(dir, entry);
    const st = statSync(full);
    if (st.isDirectory()) walk(full, out);
    else if (/\.ts$/.test(entry) && !/\.test\.ts$/.test(entry) && !/\.d\.ts$/.test(entry)) out.push(full);
  }
  return out;
}

function lineOf(text, index) {
  return text.slice(0, index).split('\n').length;
}

function scan() {
  const sites = new Map(); // relative path -> [{kind, line, family}]
  for (const file of walk(path.join(ROOT, 'server'))) {
    const rel = path.relative(ROOT, file);
    if (DEFINES_GUARD.has(rel)) continue;
    const text = readFileSync(file, 'utf8');
    const found = [];
    for (const family of [
      { patterns: SEAL_PATTERNS, name: 'seal' },
      { patterns: PACKAGE_PATTERNS, name: 'package' },
    ]) {
      for (const { re, kind } of family.patterns) {
        const g = new RegExp(re.source, re.flags.includes('g') ? re.flags : `${re.flags}g`);
        let m;
        while ((m = g.exec(text)) !== null) {
          found.push({ kind, line: lineOf(text, m.index), family: family.name });
          if (m.index === g.lastIndex) g.lastIndex += 1;
        }
      }
    }
    if (found.length === 0) continue;
    if (GUARD_RE.test(text)) continue; // guarded in this file
    sites.set(rel, found);
  }
  return sites;
}

function main() {
  let baseline;
  try {
    baseline = JSON.parse(readFileSync(BASELINE_PATH, 'utf8'));
  } catch (error) {
    console.error(`[ci:filing-exit-agreement] FAIL — cannot read ${path.relative(ROOT, BASELINE_PATH)}: ${error.message}`);
    process.exit(1);
  }
  const allowed = baseline.files ?? {};
  const sites = scan();

  const failures = [];
  const unreasoned = [];
  const shrinkable = [];

  for (const [file, found] of sites) {
    const entry = allowed[file];
    const count = found.length;
    if (!entry) {
      failures.push({ file, found, allowedCount: 0 });
      continue;
    }
    if (typeof entry.reason !== 'string' || entry.reason.trim().length < 40) unreasoned.push(file);
    if (count > (entry.count ?? 0)) failures.push({ file, found, allowedCount: entry.count ?? 0 });
    else if (count < (entry.count ?? 0)) shrinkable.push({ file, count, allowed: entry.count });
  }
  for (const file of Object.keys(allowed)) {
    if (!sites.has(file)) shrinkable.push({ file, count: 0, allowed: allowed[file].count ?? 0 });
  }

  let failed = false;
  if (failures.length) {
    failed = true;
    console.error('[ci:filing-exit-agreement] FAIL — a seal, or a package built from the filing, that never asks whether the filing holds this document\'s text:');
    for (const f of failures) {
      for (const s of f.found) console.error(`  ✗ ${f.file}:${s.line}  (${s.family}: ${s.kind})`);
      console.error(`    ${f.file}: ${f.found.length} site(s), baseline allows ${f.allowedCount}.`);
    }
    console.error('\n  Call filingAgreesWithEditing (server/services/c2c/filing-section-target.ts) on the');
    console.error('  SEALING transaction and refuse on the `different` subset — see');
    console.error('  filingBlocksSeal in server/routes/authoring.router.ts, and P-29.2 in');
    console.error('  docs/EXIT_ATTESTATION_DECISION_2026-10-18.md. An exit that takes an unsealed');
    console.error('  draft by design records the divergence instead of refusing it; say so in the');
    console.error('  baseline with a reason.');
  }
  if (unreasoned.length) {
    failed = true;
    console.error('[ci:filing-exit-agreement] FAIL — baseline entries with no written reason (40 characters or more, saying DEFECT or PROOF):');
    for (const f of unreasoned) console.error(`  ✗ ${f}`);
  }
  if (shrinkable.length) {
    failed = true;
    console.error('[ci:filing-exit-agreement] FAIL — the baseline allows more than exists. Lower these entries (or remove them at 0) so the freed allowance cannot absorb a new door:');
    for (const x of shrinkable) console.error(`  ✗ ${x.file}: ${x.count} now, baseline ${x.allowed}`);
  }

  if (failed) {
    process.exit(1);
  }
  const total = [...sites.values()].reduce((a, v) => a + v.length, 0);
  console.log(`[ci:filing-exit-agreement] OK — every seal and every filing-built package asks the agreement question, or is baselined with a reason. ${total} baselined site(s) in ${sites.size} file(s), exactly as baselined.`);
}

main();
