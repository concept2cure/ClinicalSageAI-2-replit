#!/usr/bin/env node
/**
 * CI Guard: CommonJS `require()` in an ESM package.
 *
 * ── The defect ────────────────────────────────────────────────────────────────
 * package.json declares `"type": "module"` and scripts/build-server.mjs bundles
 * with esbuild `format: 'esm'`. In both runtimes — `tsx` in development and the
 * built bundle in production — `require` is simply not defined. A line like
 *
 *     const { Document, Packer } = require('docx');
 *
 * therefore throws `ReferenceError: require is not defined` the first time that
 * code path executes. Not at boot. Not at import. At the moment a user clicks
 * the button.
 *
 * That is exactly how it was found. BP-W0-6 in the Biotech & Pharma work order
 * reads: "POST /api/authoring/docs/:id/export returns 500 for Word; PDF and XML
 * return 200; failure is silent." One line in the docx branch used `require`;
 * the PDF branch beside it used `await import(...)` and the XML branch imported
 * nothing. Only the Word branch was unreachable, and it had never once run —
 * there was nothing wrong with the document generation underneath it.
 *
 * ── Why this is a static gate and NOT a unit test ─────────────────────────────
 * This is the part worth reading before deleting this file.
 *
 * A test was written for the Word export first. It calls the real route, gets
 * the bytes back, unzips them and asserts word/document.xml contains the section
 * text. It is a good test of the export. It CANNOT catch this bug: reverting the
 * fix to `require('docx')` and re-running it produces a pass, because Vitest
 * transforms modules through its own loader and hands them a working `require`.
 * The test environment is not either of the environments that ship.
 *
 * So the runtime that would fail is not the runtime the tests run in, and no
 * amount of unit testing closes that gap. What can close it is refusing to let
 * the construct into the source at all — which is what this does.
 *
 * ── Baseline ──────────────────────────────────────────────────────────────────
 * There were 21 further occurrences when this gate was written, on paths
 * including token revocation, PDF analytics export and the global document
 * registry service. Each is a latent 500 of exactly this shape. They are frozen
 * in the baseline below rather than swept in one unreviewed change: converting
 * `require` to `await import` needs an async context, and several of these sit
 * in synchronous functions where the fix is a signature change, not a one-liner.
 *
 * The baseline may only shrink. A NEW `require` is a failure.
 *
 * Usage:
 *   node scripts/ci/check-commonjs-require.mjs                 # fail on new
 *   node scripts/ci/check-commonjs-require.mjs --list           # show all
 *   node scripts/ci/check-commonjs-require.mjs --write-baseline # after fixing
 */
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { execSync } from 'node:child_process';
import path from 'node:path';
import { stripComments } from './lib/strip-comments.mjs';

const ROOT = path.resolve(new URL('../..', import.meta.url).pathname);
const BASELINE = path.join(ROOT, 'scripts/ci/commonjs-require-baseline.json');

/** `x = require('y')`, `require('y').z`, `await require(...)` — any call form. */
const REQUIRE_CALL = /(?<![.\w$])require\s*\(/g;

/**
 * Legitimate uses that are NOT the defect:
 *   - createRequire(import.meta.url) — the SUPPORTED ESM escape hatch.
 *   - require.resolve / require.cache on a createRequire handle.
 *   - .cjs files, which are CommonJS by extension and where require is defined.
 */
const ALLOWED = [/\bcreateRequire\s*\(/];

/** Blank literal text while retaining executable template interpolations and source positions. */
function executableText(src) {
  const out = src.split('');
  const blank = (from, to) => {
    for (let k = from; k < to; k++) if (src[k] !== '\n') out[k] = ' ';
  };
  const quoted = (start, quote) => {
    let end = start + 1;
    while (end < src.length) {
      if (src[end] === '\\') { end += 2; continue; }
      if (src[end++] === quote) break;
      if (src[end - 1] === '\n') break;
    }
    blank(start, Math.min(end, src.length));
    return end;
  };
  const regexMayStart = (at) => {
    let k = at - 1;
    while (k >= 0 && /\s/.test(src[k])) k--;
    if (k < 0) return true;
    if ('(,=:[!&|?{;+-*%~^<>'.includes(src[k])) return true;
    const word = src.slice(0, k + 1).match(/[A-Za-z_$][\w$]*$/)?.[0];
    return /^(?:return|typeof|instanceof|in|of|new|delete|void|throw|case|do|else|yield|await)$/.test(word ?? '');
  };
  const regexEnd = (start) => {
    let inClass = false;
    for (let k = start + 1; k < src.length; k++) {
      if (src[k] === '\n' || src[k] === '\r') return -1;
      if (src[k] === '\\') { k++; continue; }
      if (src[k] === '[') inClass = true;
      else if (src[k] === ']') inClass = false;
      else if (!inClass && src[k] === '/') {
        k++;
        while (/[a-z]/i.test(src[k] ?? '') && k < src.length) k++;
        return k;
      }
    }
    return -1;
  };
  const template = (start) => {
    blank(start, start + 1);
    let k = start + 1;
    while (k < src.length) {
      if (src[k] === '\\') { blank(k, Math.min(k + 2, src.length)); k += 2; continue; }
      if (src[k] === '`') { blank(k, k + 1); return k + 1; }
      if (src[k] === '$' && src[k + 1] === '{') {
        blank(k, k + 2);
        k = code(k + 2, true);
        continue;
      }
      blank(k, k + 1);
      k++;
    }
    return k;
  };
  const comment = (start) => {
    if (src[start] !== '/') return start;
    const marker = src[start + 1];
    if (marker !== '/' && marker !== '*') return start;
    const close = src.indexOf(marker === '/' ? '\n' : '*/', start + 2);
    const end = close < 0 ? src.length : close + (marker === '*' ? 2 : 0);
    blank(start, end);
    return end;
  };
  const code = (start, interpolation = false) => {
    let depth = 0;
    let k = start;
    while (k < src.length) {
      const c = src[k];
      if (c === "'" || c === '"') { k = quoted(k, c); continue; }
      if (c === '`') { k = template(k); continue; }
      const afterComment = comment(k);
      if (afterComment > k) { k = afterComment; continue; }
      if (c === '/' && regexMayStart(k)) {
        const end = regexEnd(k);
        if (end >= 0) { blank(k, end); k = end; continue; }
      }
      if (c === '{') depth++;
      if (c === '}') {
        if (interpolation && depth === 0) { blank(k, k + 1); return k + 1; }
        depth--;
      }
      k++;
    }
    return k;
  };
  code(0);
  return out.join('');
}

function sourceFiles() {
  const out = execSync(
    "git ls-files 'server/**/*.ts' 'shared/**/*.ts' 'workers/**/*.ts' 'services/**/*.ts'",
    { cwd: ROOT, encoding: 'utf8', maxBuffer: 32 * 1024 * 1024 }
  );
  return out
    .split('\n')
    .filter(Boolean)
    .filter((f) => !f.endsWith('.cjs'))
    // Tests run under Vitest, which provides `require`. They are not shipped and
    // not subject to this constraint.
    .filter((f) => !/__tests__|\.test\.ts$|\.spec\.ts$/.test(f));
}

function findings() {
  const hits = [];
  for (const file of sourceFiles()) {
    const text = readFileSync(path.join(ROOT, file), 'utf8');
    if (!/\brequire\b/.test(text)) continue;
    /* Strip comments before matching. Prose ABOUT this defect — including the
       explanation sitting above the fixed docx import — otherwise reports as the
       defect, and a gate that flags its own documentation trains people to
       ignore it. The shared stripper (lib/strip-comments.mjs) is string-aware
       and blanks comments in place, so line i of `stripped` is line i of the
       source. Literal prose is then blanked, while executable expressions
       inside template strings remain visible. This gate's
       former regex stripper was not string-aware: a '/api/x/*' literal hid
       every line up to the next real comment closer, and an 'https://…'
       literal hid the rest of its own line. */
    const stripped = executableText(stripComments(text));
    const sourceLines = text.split('\n');
    const codeLines = stripped.split('\n');
    for (const match of stripped.matchAll(REQUIRE_CALL)) {
      const i = stripped.slice(0, match.index).split('\n').length - 1;
      if (ALLOWED.some((re) => re.test(codeLines[i]))) continue;
      hits.push({ file, line: i + 1, text: sourceLines[i].trim().slice(0, 120) });
    }
  }
  return hits;
}

const hits = findings();
const key = (h) => `${h.file}:${h.line}`;

if (process.argv.includes('--list')) {
  for (const h of hits) console.log(`${key(h)}  ${h.text}`);
  console.log(`\n${hits.length} occurrence(s).`);
  process.exit(0);
}

if (process.argv.includes('--write-baseline')) {
  writeFileSync(BASELINE, JSON.stringify({ files: hits.map((h) => h.file).filter((v, i, a) => a.indexOf(v) === i).sort() }, null, 2) + '\n');
  console.log(`Baseline written: ${hits.length} occurrence(s) across ${new Set(hits.map((h) => h.file)).size} file(s).`);
  process.exit(0);
}

const baseline = existsSync(BASELINE) ? JSON.parse(readFileSync(BASELINE, 'utf8')).files : [];
const allowed = new Set(baseline);
const fresh = hits.filter((h) => !allowed.has(h.file));

if (fresh.length > 0) {
  console.error('\n❌ CommonJS require() in an ESM package — this throws at runtime, not at build.\n');
  for (const h of fresh) console.error(`   ${key(h)}\n     ${h.text}`);
  console.error(`
   package.json is "type": "module" and the server bundle is esbuild format:'esm'.
   \`require\` is undefined in BOTH runtimes, so this line throws ReferenceError
   the first time its branch executes — a 500 at click time, invisible until then.
   Vitest supplies a working \`require\`, so a passing unit test proves nothing here.

   Use:  const { X } = await import('pkg');        (inside an async function)
     or: import { X } from 'pkg';                  (at module scope)
     or: createRequire(import.meta.url)            (only for genuine CJS interop)
`);
  process.exit(1);
}

const stale = baseline.filter((f) => !hits.some((h) => h.file === f));
console.log(
  `check-commonjs-require: no new occurrences. ${hits.length} baselined across ${new Set(hits.map((h) => h.file)).size} file(s).` +
    (stale.length ? `\n  ${stale.length} baselined file(s) now clean — run --write-baseline to shrink it.` : '')
);
