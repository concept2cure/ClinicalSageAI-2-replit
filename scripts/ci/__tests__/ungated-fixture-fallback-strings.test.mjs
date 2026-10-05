/**
 * check-ungated-fixture-fallback (ci:fixture-fallback) strips comments with the
 * shared, string-aware stripper (scripts/ci/lib/strip-comments.mjs), so a
 * string literal that holds `/*` or `//` cannot hide a tenant screen falling
 * back to example rows.
 *
 * The gate used to blank /\/\*[\s\S]*?\*\//g over raw text and then cut each
 * line at its first `//`. A route glob such as '/api/regulatory/*' opened a
 * phantom comment that ran to the next real comment closer, and an
 * 'https://…' literal cut off the rest of its own line. A `live ?? FIXTURE_*`
 * or a `live?.length ? live : IMPORTED_FIXTURE` in either place read as clean.
 * Both shapes the gate knows are covered.
 *
 * How: the gate resolves its root (and its baseline) from its own path and
 * walks client/src/concept2cure, so each case copies the real gate and the
 * real lib into a temp tree at their repository paths, beside the case's
 * files and no baseline (absent reads as empty, as it does in the repository).
 *
 * UNGATED_FIXTURE_FALLBACK_GATE_PATH runs the same cases against another copy
 * of the gate, which is how they were shown to fail on the old stripper.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const CI = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const GATE = process.env.UNGATED_FIXTURE_FALLBACK_GATE_PATH
  ? path.resolve(process.env.UNGATED_FIXTURE_FALLBACK_GATE_PATH)
  : path.join(CI, 'check-ungated-fixture-fallback.mjs');
const LIB = path.join(CI, 'lib', 'strip-comments.mjs');

const SURFACE = 'client/src/concept2cure/mdx/surfaces/ChangeLog.tsx';

function run(files) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'ungated-fixture-fallback-strings-'));
  try {
    for (const [rel, body] of Object.entries(files)) {
      fs.mkdirSync(path.dirname(path.join(root, rel)), { recursive: true });
      fs.writeFileSync(path.join(root, rel), body);
    }
    const ci = path.join(root, 'scripts', 'ci');
    fs.mkdirSync(path.join(ci, 'lib'), { recursive: true });
    fs.copyFileSync(GATE, path.join(ci, 'check-ungated-fixture-fallback.mjs'));
    fs.copyFileSync(LIB, path.join(ci, 'lib', 'strip-comments.mjs'));
    const r = spawnSync(process.execPath, [path.join(ci, 'check-ungated-fixture-fallback.mjs')], {
      cwd: root,
      encoding: 'utf8',
      timeout: 20_000,
    });
    return { code: r.status, out: `${r.stdout}${r.stderr}` };
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
}

/** 1-based line of the first `needle` in `src`. */
const lineOf = (src, needle) => src.slice(0, src.indexOf(needle)).split('\n').length;

test("`?? FIXTURE_*` below a '/api/regulatory/*' glob, above a JSDoc, is reported at its source line", () => {
  const src =
    "import { useRegulatoryRead } from '../lib/useRegulatoryRead';\n" +
    "const CHANGES_GLOB = '/api/regulatory/changes/*';\n" +
    'export function ChangeLog() {\n' +
    '  const reg = useRegulatoryRead(CHANGES_GLOB);\n' +
    '  const changes = reg.changes ?? FIXTURE_CHANGES;\n' +
    '  return changes;\n' +
    '}\n' +
    '/** The ICH Q10 change-control log. */\n' +
    'export default ChangeLog;\n';
  const r = run({ [SURFACE]: src });
  assert.equal(r.code, 1, r.out);
  assert.ok(r.out.includes(`${SURFACE}:${lineOf(src, '?? FIXTURE_CHANGES')}  ?? FIXTURE_CHANGES`), r.out);
});

test("`?? FIXTURE_*` after an 'https://…' string on its line is reported at its source line", () => {
  const src =
    '/* a block comment first, so a line shift would show */\n' +
    '// and a line comment\n' +
    'export function SopRegister({ reg }) {\n' +
    "  const help = 'https://docs.example/sop-register', docs = reg.docs ?? FIXTURE_DOCS;\n" +
    '  return { help, docs };\n' +
    '}\n';
  const r = run({ [SURFACE]: src });
  assert.equal(r.code, 1, r.out);
  assert.ok(r.out.includes(`${SURFACE}:${lineOf(src, '?? FIXTURE_DOCS')}  ?? FIXTURE_DOCS`), r.out);
});

test("a fixture ternary below a '/api/pma/metrics/*' glob, above a JSDoc, is reported at its source line", () => {
  const src =
    "import { PMA_TRIAL_METRICS } from '../data/pma';\n" +
    "const METRICS_GLOB = '/api/pma/metrics/*';\n" +
    'export function Metrics({ extras }) {\n' +
    '  const rows = extras.pmaTrialMetrics?.length ? extras.pmaTrialMetrics : PMA_TRIAL_METRICS;\n' +
    '  return [METRICS_GLOB, rows];\n' +
    '}\n' +
    '/** Enrolment and adverse-event tiles. */\n' +
    'export default Metrics;\n';
  const r = run({ [SURFACE]: src });
  assert.equal(r.code, 1, r.out);
  assert.ok(r.out.includes(`${SURFACE}:${lineOf(src, ': PMA_TRIAL_METRICS')}  ? : PMA_TRIAL_METRICS`), r.out);
});

test("a fixture ternary after an 'https://…' string on its line is reported at its source line", () => {
  const src =
    "import { PMA_TRIAL_METRICS } from '../data/pma';\n" +
    '/* a block comment, so a line shift would show */\n' +
    'export function Metrics({ live }) {\n' +
    "  const src = 'https://registry.example/pma', rows = live?.length ? live : PMA_TRIAL_METRICS;\n" +
    '  return [src, rows];\n' +
    '}\n';
  const r = run({ [SURFACE]: src });
  assert.equal(r.code, 1, r.out);
  assert.ok(r.out.includes(`${SURFACE}:${lineOf(src, ': PMA_TRIAL_METRICS')}  ? : PMA_TRIAL_METRICS`), r.out);
});

test('control: both shapes only inside real comments, beside the same glob and URL, are quiet', () => {
  const src =
    "import { PMA_TRIAL_METRICS } from '../data/pma';\n" +
    "const GLOB = '/api/regulatory/*';\n" +
    '// const changes = reg.changes ?? FIXTURE_CHANGES;\n' +
    '/* const rows = live?.length ? live : PMA_TRIAL_METRICS; */\n' +
    'export function Panel({ live }) {\n' +
    "  const help = 'https://docs.example/sop'; // not: reg.docs ?? FIXTURE_DOCS\n" +
    '  const rows = useSampleRows(live, PMA_TRIAL_METRICS);\n' +
    '  return [GLOB, help, rows];\n' +
    '}\n' +
    '/** A panel that falls back honestly. */\n' +
    'export default Panel;\n';
  const r = run({ [SURFACE]: src });
  assert.equal(r.code, 0, r.out);
  assert.match(r.out, /ungated content fallbacks {2}: 0/);
});
