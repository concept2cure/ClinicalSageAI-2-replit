/**
 * check-action-overclaim strips comments with the shared, string-aware
 * stripper (scripts/ci/lib/strip-comments.mjs), so a string literal that holds
 * `/*` or `//` cannot hide a control that promises a governed act and only
 * sends a chat message.
 *
 * The gate used to blank /\/\*[\s\S]*?\*\//g over raw text and then cut each
 * line at its first `//`. An upload control's accept="image/*" opened a
 * phantom comment that ran to the next real comment closer, so the ask-only
 * handler and the "Attach to dossier" button below it were never read. And
 * an href="https://…" on the same line as the button cut the button off.
 * Either way the gate read green over the exact defect it exists for.
 *
 * Fixtures sit under client/src/<dir>/ because the gate lists
 * 'client/src/**\/*.tsx', which needs at least one directory below src/.
 * Run against another version of the gate with ACTION_OVERCLAIM_GATE_PATH.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import { runGateInScratchRepo, lineOf, CI_DIR } from './helpers/scratch-repo-gate.mjs';

const GATE = 'check-action-overclaim.mjs';
const SOURCE = process.env.ACTION_OVERCLAIM_GATE_PATH
  ? path.resolve(process.env.ACTION_OVERCLAIM_GATE_PATH)
  : path.join(CI_DIR, GATE);
const FILE = 'client/src/concept2cure/v2/surfaces/DossierPanel.tsx';

const run = (src) => runGateInScratchRepo({ gate: GATE, source: SOURCE, files: { [FILE]: src } });

const BUTTON = '<button onClick={attach}>Attach to dossier</button>';

test('an ask-only "Attach to dossier" below accept="image/*", above a JSDoc, is reported at its source line', () => {
  const src =
    'export function DossierPanel({ ask }) {\n' +
    "  const accept = 'image/*';\n" +
    '  const attach = () => {\n' +
    "    ask('Attach the statistical report to the submission dossier');\n" +
    '  };\n' +
    '  return (\n' +
    '    <div>\n' +
    '      <input type="file" accept={accept} />\n' +
    `      ${BUTTON}\n` +
    '    </div>\n' +
    '  );\n' +
    '}\n' +
    '\n' +
    '/** The panel footer. */\n' +
    'export function Footer() {\n' +
    '  return <p>Footer</p>;\n' +
    '}\n';
  const r = run(src);
  assert.equal(r.code, 1, r.out);
  assert.ok(r.out.includes(`${FILE}:${lineOf(src, BUTTON)}  "Attach to dossier"`), r.out);
});

test('an ask-only "Attach to dossier" after an href="https://…" on the same line is reported at its source line', () => {
  const src =
    'export function DossierPanel({ ask }) {\n' +
    '  const attach = () => {\n' +
    "    ask('Attach the statistical report to the submission dossier');\n" +
    '  };\n' +
    '  return (\n' +
    '    <div>\n' +
    `      <a href="https://example.test/sop">SOP</a> ${BUTTON}\n` +
    '    </div>\n' +
    '  );\n' +
    '}\n';
  const r = run(src);
  assert.equal(r.code, 1, r.out);
  assert.ok(r.out.includes(`${FILE}:${lineOf(src, BUTTON)}  "Attach to dossier"`), r.out);
});

test('control: the same button only inside real comments, below the same glob and beside a URL, is quiet', () => {
  const src =
    'export function DossierPanel({ ask }) {\n' +
    "  const accept = 'image/*';\n" +
    '  const attach = () => {\n' +
    "    ask('Attach the statistical report to the submission dossier');\n" +
    '  };\n' +
    '  return (\n' +
    '    <div>\n' +
    '      <input type="file" accept={accept} />\n' +
    `      {/* ${BUTTON} */}\n` +
    '      <a href="https://example.test/sop">SOP</a>\n' +
    '    </div>\n' +
    '  );\n' +
    '}\n' +
    `// Never: ${BUTTON}\n` +
    '/** The panel footer. */\n';
  const r = run(src);
  assert.equal(r.code, 0, r.out);
  assert.match(r.out, /check-action-overclaim: no new occurrences\. 0 baselined\./);
});
