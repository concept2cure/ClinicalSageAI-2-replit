/**
 * check-internals-in-copy strips comments with the shared, string-aware
 * stripper (scripts/ci/lib/strip-comments.mjs), so a string literal that holds
 * `/*` or `//` cannot hide an API route printed into user-visible copy.
 *
 * The gate used to blank /\/\*[\s\S]*?\*\//g over raw text and then cut each
 * line at its first `//`. An upload control's accept="image/*" opened a
 * phantom comment that ran to the next real comment closer, so a hint naming
 * the endpoint, below it, was never read. And an href="https://…" on the same
 * line as the hint cut the hint off. Either way the gate read green over the
 * information disclosure it exists to stop.
 *
 * Fixtures sit under client/src/<dir>/ because the gate lists
 * 'client/src/**\/*.tsx', which needs at least one directory below src/. The
 * route is assembled at runtime so no gate reading scripts/ finds one here.
 * Run against another version of the gate with INTERNALS_IN_COPY_GATE_PATH.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import { runGateInScratchRepo, lineOf, CI_DIR } from './helpers/scratch-repo-gate.mjs';

const GATE = 'check-internals-in-copy.mjs';
const SOURCE = process.env.INTERNALS_IN_COPY_GATE_PATH
  ? path.resolve(process.env.INTERNALS_IN_COPY_GATE_PATH)
  : path.join(CI_DIR, GATE);
const FILE = 'client/src/concept2cure/v2/surfaces/SequencePanel.tsx';

const run = (src) => runGateInScratchRepo({ gate: GATE, source: SOURCE, files: { [FILE]: src } });

const ROUTE = ['', 'api', 'sequences', ':seqId', 'leaves'].join('/');
/** A tooltip that names the endpoint: the defect. */
const HINT = `<Field hint="Saved by PUT ${ROUTE}" />`;

test('a route in a hint below accept="image/*", above a JSDoc, is reported at its source line', () => {
  const src =
    'export function SequencePanel() {\n' +
    "  const accept = 'image/*';\n" +
    '  return (\n' +
    '    <div>\n' +
    '      <input type="file" accept={accept} />\n' +
    `      ${HINT}\n` +
    '    </div>\n' +
    '  );\n' +
    '}\n' +
    '\n' +
    '/** The panel footer. */\n' +
    "export const footer = 'Footer';\n";
  const r = run(src);
  assert.equal(r.code, 1, r.out);
  assert.ok(r.out.includes(`${FILE}:${lineOf(src, HINT)}  [API route]`), r.out);
});

test('a route in a hint after an href="https://…" on the same line is reported at its source line', () => {
  const src =
    'export function SequencePanel() {\n' +
    '  return (\n' +
    '    <div>\n' +
    `      <a href="https://example.test/help">Help</a> ${HINT}\n` +
    '    </div>\n' +
    '  );\n' +
    '}\n';
  const r = run(src);
  assert.equal(r.code, 1, r.out);
  assert.ok(r.out.includes(`${FILE}:${lineOf(src, HINT)}  [API route]`), r.out);
});

test('control: the same route only inside real comments, below the same glob and beside a URL, is quiet', () => {
  const src =
    'export function SequencePanel() {\n' +
    "  const accept = 'image/*';\n" +
    '  return (\n' +
    '    <div>\n' +
    '      <input type="file" accept={accept} />\n' +
    `      {/* ${HINT} */}\n` +
    `      <a href="https://example.test/help">Help</a> {/* reads ${ROUTE} */}\n` +
    '      <Field hint="Placement is saved to the sequence" />\n' +
    '    </div>\n' +
    '  );\n' +
    '}\n' +
    `// ${HINT}\n` +
    `/** Reads ${ROUTE} on mount. */\n`;
  const r = run(src);
  assert.equal(r.code, 0, r.out);
  assert.match(r.out, /check-internals-in-copy: no new occurrences\. 0 baselined across 0 file\(s\)\./);
});
