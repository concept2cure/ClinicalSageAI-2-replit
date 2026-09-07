#!/usr/bin/env node
/**
 * Guard: every artifact producer must emit a provenance event.
 *
 * Uniformity rule — a write to concept2cure_artifacts is a document the platform
 * builds, and every such write must record a concept2cure_provenance_events row
 * so the document's lifecycle (source_input → generation → transformation → edit
 * → approval → export) is uniformly traceable across the ENTIRE application.
 *
 * The canonical way to emit it is recordArtifactProvenance
 * (server/services/provenance/artifact-provenance.ts); the legacy in-file
 * emitProvenanceEvent and direct concept2cure_provenance_events inserts also
 * count as compliant.
 *
 * Enforcement is baseline-based (like check-unbacked-tables /
 * check-unreferenced-modules): a set of producers that predate this rule and do
 * NOT yet emit provenance is grandfathered in BASELINE. The guard FAILS when:
 *   - a NEW producer (not in BASELINE) writes artifact content without emitting
 *     provenance — no new debt; or
 *   - a BASELINE entry has become compliant (or no longer writes artifacts) but
 *     is still listed — keep the baseline honest and shrinking.
 *
 * So the debt can only go down. Remove a file from BASELINE in the same commit
 * that adds its provenance emission.
 *
 * Usage: node scripts/ci/check-artifact-provenance.mjs
 */
import fs from 'node:fs';
import path from 'node:path';
import { execSync } from 'node:child_process';

const ROOT = process.cwd();

// Producers that write artifact CONTENT but do not yet emit provenance. This
// list may only shrink. Each entry is technical debt tracked toward uniform
// provenance across every artifact producer. Now EMPTY — every artifact
// producer emits provenance; the guard fails on any new provenance-less writer.
const BASELINE = new Set([]);

// Writes artifact content (INSERT, content-setting UPDATE, or a Drizzle insert /
// content-setting update on any receiver — `db`, a transaction `tx`, a client).
const WRITE_RE =
  /INSERT\s+INTO\s+concept2cure_artifacts|UPDATE\s+concept2cure_artifacts[\s\S]{0,400}?\bcontent\b\s*=|\.insert\(\s*concept2cureArtifacts\b|\.update\(\s*concept2cureArtifacts\s*\)[\s\S]{0,400}?\bcontent\s*:/;
// Emits a provenance event (canonical primitive, legacy emitter, or raw insert).
const PROV_RE =
  /recordArtifactProvenance|emitProvenanceEvent|concept2cure_provenance_events|cmc_provenance_events|concept2cureProvenanceEvents/;

/** Drop block and line comments; string contents are left alone (a URL's `//`
 *  inside a string is not a comment). Good enough for identifier matching. */
function stripComments(src) {
  let out = '';
  let i = 0;
  let quote = null;
  while (i < src.length) {
    const c = src[i];
    const next = src[i + 1];
    if (quote) {
      out += c;
      if (c === '\\') { out += next ?? ''; i += 2; continue; }
      if (c === quote) quote = null;
      i += 1;
      continue;
    }
    if (c === '"' || c === "'" || c === '`') { quote = c; out += c; i += 1; continue; }
    if (c === '/' && next === '*') { const end = src.indexOf('*/', i + 2); i = end === -1 ? src.length : end + 2; continue; }
    if (c === '/' && next === '/') { const end = src.indexOf('\n', i); i = end === -1 ? src.length : end; continue; }
    out += c;
    i += 1;
  }
  return out;
}

function listServerTsFiles() {
  // Prefer git (fast, respects tracking); fall back to a recursive walk.
  try {
    const out = execSync('git ls-files server', { cwd: ROOT, encoding: 'utf8' });
    return out.split('\n').filter((f) => f.endsWith('.ts') && !f.includes('__tests__') && !f.endsWith('.test.ts'));
  } catch {
    const acc = [];
    const walk = (dir) => {
      for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
        const p = path.join(dir, e.name);
        if (e.isDirectory()) {
          if (e.name !== '__tests__' && e.name !== 'node_modules') walk(p);
        } else if (e.name.endsWith('.ts') && !e.name.endsWith('.test.ts')) {
          acc.push(path.relative(ROOT, p));
        }
      }
    };
    walk(path.join(ROOT, 'server'));
    return acc;
  }
}

const producers = [];
for (const rel of listServerTsFiles()) {
  let src;
  try {
    src = fs.readFileSync(path.join(ROOT, rel), 'utf8');
  } catch {
    continue;
  }
  // Match code, not prose: a comment that names the provenance table (or the
  // primitive) must not make a writer read as compliant. Three instruments in
  // this repo have been fooled that way; this one strips comments first.
  const code = stripComments(src);
  if (WRITE_RE.test(code)) producers.push({ rel, emitsProvenance: PROV_RE.test(code) });
}

const compliant = producers.filter((p) => p.emitsProvenance).map((p) => p.rel);
const nonCompliant = producers.filter((p) => !p.emitsProvenance).map((p) => p.rel);

const newDebt = nonCompliant.filter((f) => !BASELINE.has(f));
const staleBaseline = [...BASELINE].filter((f) => !nonCompliant.includes(f));

let failed = false;

if (newDebt.length > 0) {
  failed = true;
  console.error('\n[ci:artifact-provenance] NEW artifact producer(s) without a provenance event:');
  for (const f of newDebt) {
    console.error(`  ✗ ${f}`);
  }
  console.error(
    '\n  Every write to concept2cure_artifacts must emit a provenance event via\n' +
      '  recordArtifactProvenance (server/services/provenance/artifact-provenance.ts),\n' +
      '  in the same transaction as the artifact write.\n',
  );
}

if (staleBaseline.length > 0) {
  failed = true;
  console.error('\n[ci:artifact-provenance] BASELINE entries that are now compliant (or no longer write artifacts) — remove them from BASELINE:');
  for (const f of staleBaseline) {
    console.error(`  ✗ ${f}`);
  }
}

console.log(
  `\n[ci:artifact-provenance] ${compliant.length}/${producers.length} artifact producers emit provenance; ` +
    `${nonCompliant.length} in baseline debt.`,
);

if (failed) process.exit(1);
console.log('[ci:artifact-provenance] OK — no new provenance-less artifact producers.');
