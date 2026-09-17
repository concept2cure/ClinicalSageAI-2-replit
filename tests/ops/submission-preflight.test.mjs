/**
 * Drift guard for the submission procurement preflight CLI.
 *
 * scripts/ops/submission-preflight.mjs must run without a TypeScript build, so
 * it duplicates the expected artifact filenames. That duplication is only safe
 * if it cannot drift from the TypeScript sources of truth — if a DTD filename or
 * an eSTAR template name changes in code and the CLI keeps checking the old
 * name, the preflight would cheerfully report "ready" for artifacts the
 * packager will never find. These tests read both sides as text and pin them
 * against each other.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, mkdtempSync, writeFileSync, rmSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
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
const read = (p) => readFileSync(path.join(repoRoot, p), 'utf8');

const CLI_PATH = path.join(repoRoot, 'scripts/ops/submission-preflight.mjs');
const CLI = read('scripts/ops/submission-preflight.mjs');
const ESTAR_REGISTRY = read(
  'server/services/pathway-engines/estar/estar-template-registry.ts',
);

/** Every `expectedFileName: '...'` in the eSTAR manifest. */
function manifestTemplateNames() {
  return [...ESTAR_REGISTRY.matchAll(/expectedFileName:\s*'([^']+)'/g)].map((m) => m[1]);
}

/* requiredDtdNames() / requiredStylesheetNames() are derived from
   dtd-bundler.ts by ./helpers/ectd-required-artifacts.mjs — the one parser both
   ops suites share. The two local copies that used to live here matched only
   the four named region keys, so the eight widened regions (uk/ch/au/…) were
   invisible to them, and a regex that matched nothing would have yielded an
   empty "required" set that every coverage assertion passes. */

/** A throwaway drop-point directory holding exactly `files`. */
function dropPoint(files) {
  const dir = mkdtempSync(path.join(os.tmpdir(), 'preflight-drop-'));
  for (const f of files) writeFileSync(path.join(dir, f), `stand-in ${f}\n`);
  return dir;
}

/**
 * Run the preflight CLI as a subprocess against fixture drop-points and a
 * minimal environment, and return its exit code + parsed report. The env is
 * built from scratch rather than inherited so a developer's own
 * *_VALIDATOR_URL cannot change the verdict.
 */
function runPreflight(dtdDir, estarDir) {
  const r = spawnSync(process.execPath, [CLI_PATH, '--json'], {
    env: {
      PATH: process.env.PATH,
      HOME: process.env.HOME,
      ECTD_DTD_DIR: dtdDir,
      ESTAR_TEMPLATE_DIR: estarDir,
      FDA_VALIDATOR_URL: 'https://validator.invalid/fda',
      EMA_VALIDATOR_URL: 'https://validator.invalid/ema',
      PMDA_VALIDATOR_URL: 'https://validator.invalid/pmda',
    },
    encoding: 'utf8',
    maxBuffer: 32 * 1024 * 1024,
  });
  assert.ok(r.stdout, `preflight produced no stdout (stderr: ${r.stderr})`);
  return { code: r.status, report: JSON.parse(r.stdout) };
}

/** The labels of everything the CLI reported as still to obtain. */
function unsatisfiedLabels(report) {
  return report.items.filter((i) => !i.satisfied).map((i) => i.label);
}

test('the CLI checks every DTD the packager actually requires', () => {
  const required = requiredDtdNames();
  assert.ok(required.length >= 5, `expected backbone + 4 regional DTDs, got ${required.length}`);
  const missing = required.filter((f) => !CLI.includes(f));
  assert.deepEqual(
    missing,
    [],
    `these DTDs are required by dtd-bundler.ts but not checked by the preflight CLI: ` +
      `${missing.join(', ')}. The CLI would report "ready" for a package the ` +
      `packager cannot actually build.`,
  );
});

// The .xsl stylesheets are procurement items exactly like the .dtd files: they
// live in the SAME drop-point, every index.xml references
// util/style/ectd-2-0.xsl and the FDA backbone references
// ../../util/style/us-regional.xsl, and assessDtdReadiness counts a missing
// stylesheet as not-self-contained. A preflight that checked only *.dtd would
// exit 0 — "ready to file" — with both stylesheets still unobtained.
//
// Named for what it is: a check on the CLI's SOURCE TEXT. It cannot see whether
// the constants it finds are ever used — deleting the loop that reads them
// leaves this green — so the behavioural tests below are the ones that hold the
// contract. Kept because it localises a rename to the constant.
test('the CLI SOURCE names every stylesheet the packager requires (drift guard)', () => {
  const required = requiredStylesheetNames();
  assert.ok(required.length >= 2, `expected the ICH + FDA stylesheets, got ${required.length}`);
  const missing = required.filter((f) => !CLI.includes(f));
  assert.deepEqual(
    missing,
    [],
    `these stylesheets are required by dtd-bundler.ts but not named by the ` +
      `preflight CLI: ${missing.join(', ')}.`,
  );
});

// ── BEHAVIOUR ───────────────────────────────────────────────────────────────
// What the CLI actually REPORTS, run as a subprocess against fixture
// drop-points. The source-text guards above pass with the constants declared
// and never read; these do not.

test('the CLI reports a drop-point missing ONLY the stylesheets as not ready', () => {
  const stylesheets = requiredStylesheetNames();
  const dtdDir = dropPoint(requiredDtdNames()); // every DTD, no *.xsl
  const estarDir = dropPoint([...new Set(manifestTemplateNames())]);
  try {
    const { code, report } = runPreflight(dtdDir, estarDir);
    assert.equal(
      report.ready,
      false,
      'every DTD present and neither stylesheet is not "ready to file" — the ' +
        'packager refuses that package under ECTD_REQUIRE_DTD',
    );
    assert.equal(code, 1, 'a not-ready preflight must exit non-zero so it can gate a pipeline');
    const unsatisfied = unsatisfiedLabels(report);
    for (const xsl of stylesheets) {
      assert.ok(
        unsatisfied.includes(xsl),
        `the preflight must report ${xsl} as still to obtain; it reported: ${unsatisfied.join(', ') || '(nothing)'}`,
      );
    }
  } finally {
    rmSync(dtdDir, { recursive: true, force: true });
    rmSync(estarDir, { recursive: true, force: true });
  }
});

test('the CLI reports EACH required supportive file when it alone is absent', () => {
  // One case per file, so a list that silently loses an entry cannot hide
  // behind the others. This is the assertion that breaks when dtd-bundler.ts
  // gains a supportive file and the CLI's hardcoded copy does not.
  const required = requiredSupportiveFileNames();
  const estarDir = dropPoint([...new Set(manifestTemplateNames())]);
  try {
    for (const absent of required) {
      const dtdDir = dropPoint(required.filter((f) => f !== absent));
      try {
        const { code, report } = runPreflight(dtdDir, estarDir);
        assert.equal(report.ready, false, `preflight called itself ready with ${absent} absent`);
        assert.equal(code, 1, `preflight exited ${code} with ${absent} absent`);
        assert.deepEqual(
          unsatisfiedLabels(report),
          [absent],
          `with only ${absent} absent the preflight must report exactly that file`,
        );
      } finally {
        rmSync(dtdDir, { recursive: true, force: true });
      }
    }
  } finally {
    rmSync(estarDir, { recursive: true, force: true });
  }
});

test('POSITIVE CONTROL: a complete drop-point + templates + validators exits 0', () => {
  const dtdDir = dropPoint(requiredSupportiveFileNames());
  const estarDir = dropPoint([...new Set(manifestTemplateNames())]);
  try {
    const { code, report } = runPreflight(dtdDir, estarDir);
    assert.deepEqual(unsatisfiedLabels(report), [], 'nothing should be outstanding');
    assert.equal(report.ready, true);
    assert.equal(code, 0);
  } finally {
    rmSync(dtdDir, { recursive: true, force: true });
    rmSync(estarDir, { recursive: true, force: true });
  }
});

test('the CLI checks every official eSTAR template in the manifest', () => {
  // The manifest still describes the whole eSTAR program — nine descriptors.
  const descriptors = manifestTemplateNames();
  assert.ok(descriptors.length >= 9, `expected the full eSTAR program, got ${descriptors.length}`);
  // …but they do NOT resolve to nine files. FDA ships one nIVD PDF and one IVD
  // PDF, each carrying 510(k), De Novo and PMA, so the six marketing
  // descriptors name two files between them. This asserted nine DISTINCT files
  // until 2026-09-04, which was only true while De Novo and PMA pointed at
  // eSTAR-denovo-*/eSTAR-pma-* names FDA does not publish. What the CLI owes is
  // coverage of every distinct file the manifest actually names.
  const templates = [...new Set(descriptors)];
  const missing = templates.filter((f) => !CLI.includes(f));
  assert.deepEqual(
    missing,
    [],
    `these templates are in ESTAR_TEMPLATE_MANIFEST but not checked by the ` +
      `preflight CLI: ${missing.join(', ')}.`,
  );
});

test('the CLI does not check artifacts that no source requires (no phantom gaps)', () => {
  // Every *.dtd the CLI names must be one the bundler requires — otherwise the
  // preflight reports a gap nobody can ever close.
  const required = new Set(requiredDtdNames());
  const cliDtds = [...CLI.matchAll(/'([a-z0-9-]+\.dtd)'/gi)].map((m) => m[1]);
  const phantom = cliDtds.filter((f) => !required.has(f));
  assert.deepEqual(phantom, [], `preflight names DTDs no source requires: ${phantom.join(', ')}`);

  // Same rule for the stylesheets, added with the stylesheet coverage check
  // above so the CLI cannot start naming an .xsl no source requires.
  const requiredXsl = new Set(requiredStylesheetNames());
  const cliXsl = [...CLI.matchAll(/'([a-z0-9-]+\.xsl)'/gi)].map((m) => m[1]);
  const phantomXsl = cliXsl.filter((f) => !requiredXsl.has(f));
  assert.deepEqual(phantomXsl, [], `preflight names stylesheets no source requires: ${phantomXsl.join(', ')}`);


  // The same rule for the eSTAR templates, which this check did NOT cover until
  // 2026-09-04 — and that blind spot is why the CLI asked procurement for four
  // FDA files that do not exist (eSTAR-denovo-*.pdf, eSTAR-pma-*.pdf) and
  // reported De Novo and PMA blocked, with a green gate, for as long as it did.
  // A preflight naming an artifact no source requires reports a gap nobody can
  // close, which is the same defect wearing the other coat.
  const declared = new Set(manifestTemplateNames());
  const cliTemplates = [...CLI.matchAll(/'([A-Za-z0-9-]+\.pdf)'/g)].map((m) => m[1]);
  const phantomTemplates = cliTemplates.filter((f) => !declared.has(f));
  assert.deepEqual(
    phantomTemplates,
    [],
    `preflight names eSTAR templates ESTAR_TEMPLATE_MANIFEST does not: ${phantomTemplates.join(', ')}`,
  );
});

test('the CLI exits non-zero when artifacts are missing (so it can gate a pipeline)', () => {
  // The contract that makes this usable in CI: ready → 0, missing → 1.
  assert.match(
    CLI,
    /process\.exit\(report\.ready \? 0 : 1\)/,
    'the preflight must exit 0 only when everything is present',
  );
});
