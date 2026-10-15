/**
 * check-empty-state-honesty strips comments with the shared, string-aware
 * stripper (scripts/ci/lib/strip-comments.mjs), so a string literal that holds
 * `/*` or `//` cannot hide clearance copy chosen by an empty collection.
 *
 * The gate used to blank /\/\*[\s\S]*?\*\//g over raw text, then cut each
 * line at the first `//` not preceded by `:` or a quote. An upload control's
 * accept="image/*" opened a phantom comment that ran to the next real comment
 * closer, so "No Refuse-to-File blockers found." over an empty list, below it,
 * was never read. The `:`/quote guard spared 'https://…', but not the
 * everyday `${location.protocol}//${location.host}`: there `//` follows `}`,
 * and the ternary after it on that line was cut off.
 *
 * Fixtures sit under client/src/<dir>/ because the gate lists
 * 'client/src/**\/*.tsx', which needs at least one directory below src/.
 * Run against another version of the gate with EMPTY_STATE_HONESTY_GATE_PATH.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import { runGateInScratchRepo, lineOf, CI_DIR } from './helpers/scratch-repo-gate.mjs';

const GATE = 'check-empty-state-honesty.mjs';
const SOURCE = process.env.EMPTY_STATE_HONESTY_GATE_PATH
  ? path.resolve(process.env.EMPTY_STATE_HONESTY_GATE_PATH)
  : path.join(CI_DIR, GATE);
const FILE = 'client/src/concept2cure/v2/surfaces/FilingReadiness.tsx';

const run = (src) => runGateInScratchRepo({ gate: GATE, source: SOURCE, files: { [FILE]: src } });

/** Clearance selected by `blockers` being empty: the alternate of a bare `.length` test. */
const CLAIM = "{blockers.length ? 'Blockers remain before filing.' : 'No Refuse-to-File blockers found.'}";
const REPORTED = /when `\(collection\)` is empty → "'No Refuse-to-File blockers found\.'"/;

test('clearance over an empty list below accept="image/*", above a JSDoc, is reported at its source line', () => {
  const src =
    'export function FilingReadiness({ blockers }: { blockers: string[] }) {\n' +
    "  const accept = 'image/*';\n" +
    '  return (\n' +
    '    <section>\n' +
    '      <input type="file" accept={accept} />\n' +
    `      <p>${CLAIM}</p>\n` +
    '    </section>\n' +
    '  );\n' +
    '}\n' +
    '\n' +
    '/** The cockpit footer. */\n' +
    "export const footer = 'Footer';\n";
  const r = run(src);
  assert.equal(r.code, 1, r.out);
  assert.ok(r.out.includes(`${FILE}:${lineOf(src, CLAIM)}\n`), r.out);
  assert.match(r.out, REPORTED);
});

test('clearance after an href="https://…" on the same line is reported at its source line', () => {
  const src =
    'export function FilingReadiness({ blockers }: { blockers: string[] }) {\n' +
    '  return (\n' +
    `    <p><a href="https://example.test/rtf">RTF guidance</a> ${CLAIM}</p>\n` +
    '  );\n' +
    '}\n';
  const r = run(src);
  assert.equal(r.code, 1, r.out);
  assert.ok(r.out.includes(`${FILE}:${lineOf(src, CLAIM)}\n`), r.out);
});

test('clearance after a `${location.protocol}//${location.host}` link on the same line is reported at its source line', () => {
  const src =
    'export function FilingReadiness({ blockers }: { blockers: string[] }) {\n' +
    '  return (\n' +
    '    <p>\n' +
    '      <a href={`${location.protocol}//${location.host}/rtf`}>RTF guidance</a> ' + `${CLAIM}\n` +
    '    </p>\n' +
    '  );\n' +
    '}\n';
  const r = run(src);
  assert.equal(r.code, 1, r.out);
  assert.ok(r.out.includes(`${FILE}:${lineOf(src, CLAIM)}\n`), r.out);
});

test('control: the same clearance only inside real comments, below the same glob and beside both links, is quiet', () => {
  const src =
    'export function FilingReadiness({ blockers }: { blockers: string[] }) {\n' +
    "  const accept = 'image/*';\n" +
    '  return (\n' +
    '    <section>\n' +
    '      <input type="file" accept={accept} />\n' +
    `      {/* never: ${CLAIM} */}\n` +
    '      <a href="https://example.test/rtf">RTF guidance</a>\n' +
    '      <a href={`${location.protocol}//${location.host}/rtf`}>RTF portal</a>\n' +
    '    </section>\n' +
    '  );\n' +
    '}\n' +
    "// never: const headline = !blockers.length ? 'No Refuse-to-File blockers found.' : 'Blockers remain.';\n" +
    '/** The cockpit footer. */\n';
  const r = run(src);
  assert.equal(r.code, 0, r.out);
  assert.match(r.out, /check-empty-state-honesty: no new occurrences\. 0 baselined across 0 file\(s\)\./);
});
