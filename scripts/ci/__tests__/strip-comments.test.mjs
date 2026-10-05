/**
 * scripts/ci/lib/strip-comments.mjs — the one comment stripper the CI gates
 * share. What it must never do is blank code: every gate that strips first
 * would then pass whatever sits in the blanked span.
 *
 * STRIP_COMMENTS_LIB_PATH runs the same cases against another copy of the lib
 * (e.g. the version before regex literals were recognised) to show which of
 * them it fails.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const LIB = process.env.STRIP_COMMENTS_LIB_PATH
  ? path.resolve(process.env.STRIP_COMMENTS_LIB_PATH)
  : path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', 'lib', 'strip-comments.mjs');
const { stripComments } = await import(pathToFileURL(LIB).href);

/** The call a gate would look for, assembled so no gate reads one in this file. */
const CALL = ['evaluate', 'Model(x);'].join('');

const kept = (src, needle) => stripComments(src).includes(needle);

test('a string holding /* or // does not open a comment', () => {
  const src = `const glob = '/api/x/*';\nconst u = 'https://a.example';\n${CALL}\nconst end = 'a */ b';\n`;
  assert.ok(kept(src, CALL));
});

test('a quote inside a regex literal does not mis-pair the strings after it', () => {
  // The critic's repro (2026-10-05): the "'" in /'/ used to open a string that
  // swallowed the real one, so '/api/x/*' then opened a comment.
  const src = `s.replace(/'/g, "''"); router.use('/api/x/*', auth);\n${CALL}\n/* real */\n`;
  assert.ok(kept(src, CALL));
  assert.ok(!kept(src, 'real'));
});

test('a backtick inside a regex class does not swallow a template literal', () => {
  // check-unapproved-model-pins.mjs:46 and build-investor-brief.mjs: /['"`]/
  // then a template whose CSS holds /* … */ — that CSS is string, not comment.
  const src = "const PIN = /['\"`]([^'\"`]+)['\"`]/g;\nconst CSS = `\n/* Fonts */\nbody{}\n`;\n" + `${CALL}\n`;
  const out = stripComments(src);
  assert.ok(out.includes('/* Fonts */'), 'template content is kept as written');
  assert.ok(out.includes(CALL));
});

test('a division is not read as a regex', () => {
  const src = `const r = total / count; const s = '/*';\n${CALL}\nconst h = (a + b) / 2; // half\n`;
  const out = stripComments(src);
  assert.ok(out.includes(CALL));
  assert.ok(!out.includes('half'), 'the line comment after a division is still blanked');
});

test('a regex after return, =>, ( and = is skipped whole', () => {
  const src =
    "const a = /\\/\\*/;\nconst f = (s) => /'/.test(s);\nfunction g(s) { return /\"/.test(s); }\n" +
    `if (/x/.test(y)) {}\nconst q = '/*';\n${CALL}\n`;
  assert.ok(kept(src, CALL));
});

test('JSX closing tags are not regex literals, and comments around them still go', () => {
  const src = `<a href="https://x.example">docs</a>; // note\n<b>{n}/{m}</b>\n${CALL}\n{/* hidden */}\n`;
  const out = stripComments(src);
  assert.ok(out.includes(CALL));
  assert.ok(!out.includes('note') && !out.includes('hidden'));
});

test('lines are kept: the output has as many lines as the input, in both modes', () => {
  const src = "a(); // one\n/* two\n three */ b();\nc('//x'); // four\n";
  for (const lineComments of ['blank', 'drop']) {
    const out = stripComments(src, { lineComments });
    assert.equal(out.split('\n').length, src.split('\n').length, lineComments);
    assert.ok(!/one|two|three|four/.test(out), lineComments);
    assert.ok(out.includes("c('//x');"), lineComments);
  }
});

test("lineComments: 'drop' deletes a // comment instead of blanking it", () => {
  const src = 'a(); // a long note that would spend a character window\nb();\n';
  assert.equal(stripComments(src, { lineComments: 'drop' }), 'a(); \nb();\n');
  assert.equal(stripComments(src).length, src.length, "the default 'blank' keeps every column");
});
