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

const ROOT = path.resolve(new URL('../..', import.meta.url).pathname);
const BASELINE = path.join(ROOT, 'scripts/ci/commonjs-require-baseline.json');

/** `x = require('y')`, `require('y').z`, `await require(...)` — any call form. */
const REQUIRE_CALL = /(?<![.\w$])require\s*\(/;

/**
 * Legitimate uses that are NOT the defect:
 *   - createRequire(import.meta.url) — the SUPPORTED ESM escape hatch.
 *   - require.resolve / require.cache on a createRequire handle.
 *   - .cjs files, which are CommonJS by extension and where require is defined.
 */
const ALLOWED = [/createRequire/, /\brequire\.resolve\b/, /\brequire\.cache\b/];

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
    if (!REQUIRE_CALL.test(text)) continue;
    /* Strip comments before matching. Prose ABOUT this defect — including the
       explanation sitting above the fixed docx import — otherwise reports as the
       defect, and a gate that flags its own documentation trains people to
       ignore it. Block comments are stripped across lines first, then line
       comments; string contents are left alone, since a `require(` inside a
       string literal in server source is worth a look either way. */
    const stripped = text.replace(/\/\*[\s\S]*?\*\//g, (m) => m.replace(/[^\n]/g, ' '));
    stripped.split('\n').forEach((line, i) => {
      const code = line.replace(/\/\/.*$/, '');
      if (!REQUIRE_CALL.test(code)) return;
      if (ALLOWED.some((re) => re.test(code))) return;
      hits.push({ file, line: i + 1, text: text.split('\n')[i].trim().slice(0, 120) });
    });
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
