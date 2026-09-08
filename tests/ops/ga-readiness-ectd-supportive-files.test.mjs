/**
 * GA readiness report — the eCTD supportive-file rows.
 *
 * assets/ectd-dtd/ is the drop-point for SEVEN agency artifacts, not five: the
 * five .dtd files the DOCTYPEs reference AND the two .xsl stylesheets the
 * <?xml-stylesheet?> processing instructions reference (every index.xml points
 * at util/style/ectd-2-0.xsl; the FDA backbone points at
 * ../../util/style/us-regional.xsl). The packager's own gate,
 * assessDtdReadiness, counts both — so a readiness report that counts only the
 * DTDs reports GA-ready procurement for a package the packager will then refuse
 * to build. These pin the report against that.
 *
 * The required set is DERIVED from server/services/ectd/dtd-bundler.ts (see
 * ./helpers/ectd-required-artifacts.mjs), never restated here. The report
 * hardcodes its own copy — it must run with no TypeScript build — and a test
 * that hardcoded the same seven names would go green in lockstep with the copy
 * it exists to guard: adding an EMA stylesheet to REGIONAL_STYLESHEET would put
 * this GA blocker back to under-counting with every assertion still passing.
 *
 * The report is exercised as a subprocess with $ECTD_DTD_DIR pointed at a
 * fixture directory, so it observes exactly what each case describes and never
 * the repository's own (still-unvendored) drop-point.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, writeFileSync, rmSync } from 'node:fs';
import { createHash } from 'node:crypto';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  requiredDtdNames,
  requiredStylesheetNames,
  requiredSupportiveFileNames,
} from './helpers/ectd-required-artifacts.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, '..', '..');
const SCRIPT = path.join(repoRoot, 'scripts/ops/ga-readiness-report.mjs');

const DTDS = requiredDtdNames();
const STYLESHEETS = requiredStylesheetNames();
const ALL = requiredSupportiveFileNames();

const standIn = (f) => `<!-- stand-in ${f} -->\n`;

/** Build a fixture drop-point holding `files`, plus an optional checksums.txt.
 *  `manifest` may be a list of filenames (recorded with their REAL SHA-256) or
 *  an explicit array of raw lines. */
function dropPoint(files, manifest) {
  const dir = mkdtempSync(path.join(os.tmpdir(), 'ga-ectd-drop-'));
  for (const f of files) writeFileSync(path.join(dir, f), standIn(f));
  if (manifest) {
    const lines = manifest.map((entry) =>
      typeof entry === 'string' && !entry.includes(' ')
        ? `${createHash('sha256').update(standIn(entry)).digest('hex')}  ${entry}`
        : entry,
    );
    writeFileSync(path.join(dir, 'checksums.txt'), `# fixture manifest\n${lines.join('\n')}\n`);
  }
  return dir;
}

/** Run the report with a given drop-point and return its rows. The script exits
 *  1 while any blocker is outstanding (it always is here), so a non-zero exit is
 *  expected and its stdout is the report. */
function rowsFor(dtdDir) {
  let stdout;
  try {
    stdout = execFileSync(process.execPath, [SCRIPT, '--json'], {
      env: { ...process.env, ECTD_DTD_DIR: dtdDir },
      encoding: 'utf8',
      maxBuffer: 32 * 1024 * 1024,
    });
  } catch (err) {
    stdout = err.stdout ?? '';
  }
  const parsed = JSON.parse(stdout);
  return Object.fromEntries(parsed.rows.map((r) => [r.id, r]));
}

/* ── the vendored-files row ─────────────────────────────────────────────── */

test('the DTD row counts the stylesheets: all five DTDs present is NOT ready', () => {
  const dir = dropPoint(DTDS);
  try {
    const row = rowsFor(dir)['ectd-dtds'];
    assert.equal(
      row.status,
      'blocked',
      'every DTD and no stylesheets is not a self-contained package — the packager ' +
        `refuses it — yet the report said "${row.observed}"`,
    );
    for (const xsl of STYLESHEETS) {
      assert.ok(
        row.observed.includes(xsl),
        `the report must name ${xsl} as missing; observed: ${row.observed}`,
      );
    }
    // The label must describe the set it actually counts.
    assert.match(row.label, /stylesheet/i, `label still describes DTDs only: ${row.label}`);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('the DTD row blocks on EACH required supportive file when it alone is absent', () => {
  // One case per file, derived from dtd-bundler.ts. This is the assertion that
  // breaks the moment the source of truth gains a supportive file and the
  // report's hardcoded REQUIRED_* copy does not: with the new file absent the
  // report would still say ready.
  for (const absent of ALL) {
    const dir = dropPoint(ALL.filter((f) => f !== absent));
    try {
      const row = rowsFor(dir)['ectd-dtds'];
      assert.equal(row.status, 'blocked', `report called itself ready with ${absent} absent`);
      assert.ok(
        row.observed.includes(absent),
        `with only ${absent} absent the report must name it; observed: ${row.observed}`,
      );
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  }
});

test('POSITIVE CONTROL: every supportive file present reads ready', () => {
  const dir = dropPoint(ALL);
  try {
    const row = rowsFor(dir)['ectd-dtds'];
    assert.equal(row.status, 'ready', `observed: ${row.observed}`);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

/* ── the checksum-manifest row ──────────────────────────────────────────── */

test('the checksum row reads the manifest of the drop-point in use and names the unrecorded files', () => {
  // Every DTD entry recorded, both stylesheets vendored but unrecorded. That is
  // exactly what verifyChecksumManifest(resolveDtdDir(), …, ['.dtd','.xsl'])
  // refuses, so the report must not call it ready.
  const dir = dropPoint(ALL, DTDS);
  try {
    const row = rowsFor(dir)['ectd-dtd-checksums'];
    assert.equal(row.status, 'blocked', `observed: ${row.observed}`);
    assert.ok(
      row.observed.includes(path.join(dir, 'checksums.txt')),
      `the report must say WHICH manifest it read: ${row.observed}`,
    );
    for (const xsl of STYLESHEETS) {
      assert.ok(row.observed.includes(xsl), `must name the unrecorded ${xsl}: ${row.observed}`);
    }
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('the checksum row does not read a manifest it never opened (label honesty)', () => {
  // Under $ECTD_DTD_DIR the repo's own assets/ectd-dtd/checksums.txt is not the
  // file that was read. A label naming it is a claim about a file this row never
  // opened.
  const dir = dropPoint(ALL, ALL);
  try {
    const row = rowsFor(dir)['ectd-dtd-checksums'];
    assert.ok(
      !row.label.includes('assets/ectd-dtd/checksums.txt'),
      `the label names a file the row did not read (it read ${path.join(dir, 'checksums.txt')}): ${row.label}`,
    );
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('the checksum row verifies HASHES, not line count: seven wrong hashes is not ready', () => {
  // Seven well-formed entries, every hash wrong. A row whose readiness is a bare
  // count of non-comment lines reads this as ready — "assessed and clear" for a
  // manifest that matches nothing it records.
  const wrong = ALL.map((f) => `${'0'.repeat(64)}  ${f}`);
  const dir = dropPoint(ALL, wrong);
  try {
    const row = rowsFor(dir)['ectd-dtd-checksums'];
    assert.equal(
      row.status,
      'blocked',
      `seven recorded hashes, none matching the bytes on disk, read as: "${row.observed}"`,
    );
    assert.match(row.observed, /mismatch/i, `observed: ${row.observed}`);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('the checksum row rejects seven lines that are not manifest entries at all', () => {
  const junk = ALL.map((f) => `TODO obtain ${f} from the agency`);
  const dir = dropPoint(ALL, junk);
  try {
    const row = rowsFor(dir)['ectd-dtd-checksums'];
    assert.equal(row.status, 'blocked', `seven prose lines read as: "${row.observed}"`);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('the checksum row rejects seven valid entries for files nobody requires', () => {
  // Seven real SHA-256 lines, correct format, matching bytes — for the wrong
  // files. A count-based row calls this ready.
  const decoys = ALL.map((f) => `decoy-${f}`);
  const dir = dropPoint([...ALL, ...decoys], decoys);
  try {
    const row = rowsFor(dir)['ectd-dtd-checksums'];
    assert.equal(row.status, 'blocked', `seven decoy entries read as: "${row.observed}"`);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('POSITIVE CONTROL: a manifest recording every vendored file with matching hashes reads ready', () => {
  const dir = dropPoint(ALL, ALL);
  try {
    const row = rowsFor(dir)['ectd-dtd-checksums'];
    assert.equal(row.status, 'ready', `observed: ${row.observed}`);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});
