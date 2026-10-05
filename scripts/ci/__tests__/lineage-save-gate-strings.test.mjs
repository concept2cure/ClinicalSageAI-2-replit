/**
 * check-lineage-save-gate discovers content writers in CODE, past string
 * literals that look like comment openers, and not in comments.
 *
 * Its discovery pass strips comments before matching `UPDATE … SET content =`.
 * It used to do that with /\/\*[\s\S]*?\*\//, which opens at a `/*` inside a
 * string ('/api/advisory/*') and deletes everything up to the next real
 * comment close, so a content write between the two was never seen and a new
 * unguarded prose writer passed the gate. The gate now uses the shared
 * scripts/ci/lib/strip-comments.mjs.
 *
 * The gate's root is process.cwd(), so this runs the real gate against a
 * fixture tree. Every GUARDED path is missing there, so the gate exits 1
 * regardless; the assertions read the per-file discovery verdicts.
 *
 * LINEAGE_SAVE_GATE_UNDER_TEST points this at another copy of the gate (for
 * instance one with the old regex restored) to show these cases fail on it.
 *
 * The fixture SQL and comment delimiters are assembled at runtime so that no
 * gate scanning scripts/ reads this file as a content write or a comment.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const GATE = process.env.LINEAGE_SAVE_GATE_UNDER_TEST
  ? path.resolve(process.env.LINEAGE_SAVE_GATE_UNDER_TEST)
  : path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', 'check-lineage-save-gate.mjs');

const OPEN = '/' + '*';
const CLOSE = '*' + '/';
const LINE = '/' + '/';
const UPDATE = 'UPD' + 'ATE';
const write = (table) => `await db.execute(sql\`${UPDATE} ${table} SET content = \${content} WHERE id = \${id}\`);`;

const FILES = {
  // A content write AFTER a string holding the comment opener, with a real
  // block comment further down for the old regex to run to.
  'server/routes/advisory-notes.ts': [
    `const ADVISORY_ROUTES = '/api/advisory${OPEN}';`,
    'export async function saveNote(db, sql, id, content) {',
    `  ${write('advisory_notes')}`,
    '}',
    `${OPEN} Advisory routes end here. ${CLOSE}`,
    '',
  ].join('\n'),

  // A content write on the same line as, and after, an https:// string: a
  // naive `//`-to-end-of-line rule would blank it.
  'server/routes/linked-notes.ts': [
    'export async function saveLinked(db, sql, id, content) {',
    `  const DOCS = 'https:${LINE}docs.example.com/notes'; ${write('linked_notes')}`,
    '}',
    '',
  ].join('\n'),

  // Control: the write appears only inside real comments, after the same kind
  // of string. Not a writer.
  'server/routes/retired-notes.ts': [
    `const ADVISORY_ROUTES = '/api/advisory${OPEN}';`,
    `${OPEN} Retired: ${UPDATE} retired_notes SET content = $1 moved behind the lineage gate. ${CLOSE}`,
    `${LINE} ${write('retired_notes')}`,
    'export const retired = true;',
    '',
  ].join('\n'),

  // Control: the write is named only in a trailing line comment after code.
  'server/routes/trailing-note.ts': [
    `export const notesTable = 'trailing_notes'; ${LINE} was: ${UPDATE} trailing_notes SET content = $1`,
    '',
  ].join('\n'),
};

let cached;
function runGate() {
  if (cached) return cached;
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'lineage-save-gate-'));
  try {
    for (const [rel, body] of Object.entries(FILES)) {
      fs.mkdirSync(path.dirname(path.join(root, rel)), { recursive: true });
      fs.writeFileSync(path.join(root, rel), body);
    }
    const r = spawnSync(process.execPath, [GATE], { cwd: root, encoding: 'utf8' });
    cached = { code: r.status, out: `${r.stdout}${r.stderr}` };
    return cached;
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
}

const reported = (out, file) =>
  new RegExp(`\\[ci:lineage-save-gate\\] FAIL ${file.replace(/[.]/g, '\\.')}\\n {2}✗ unguarded-writer`).test(out);

test('the gate ran against the fixture tree, not the repository', () => {
  const r = runGate();
  assert.equal(r.code, 1, r.out);
  assert.match(r.out, /MISSING FILE server\//);
});

test('a content write after a string holding /* is discovered', () => {
  const r = runGate();
  assert.ok(reported(r.out, 'server/routes/advisory-notes.ts'), r.out);
});

test('a content write after an https:// string on the same line is discovered', () => {
  const r = runGate();
  assert.ok(reported(r.out, 'server/routes/linked-notes.ts'), r.out);
});

test('a content write only inside real comments is not a writer', () => {
  const r = runGate();
  assert.ok(!r.out.includes('FAIL server/routes/retired-notes.ts'), r.out);
});

test('a content write named only in a trailing line comment is not a writer', () => {
  const r = runGate();
  assert.ok(!r.out.includes('FAIL server/routes/trailing-note.ts'), r.out);
});
