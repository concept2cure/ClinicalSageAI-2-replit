#!/usr/bin/env node
/**
 * CI Guard: DOCX Runtime Canonicality
 *
 * Ensures that DOCX generation entry points remain limited to the
 * 3 approved runtimes documented in
 * docs/architecture/docx-pipeline-canonical-designation.md
 *
 * Approved runtimes:
 *   1. JS `docx` library       — server/services/docx/docxFactory.ts
 *                                 server/services/docxGenerator.ts
 *   2. Python `python-docx`    — workers/artifact-compute/docx-python-runtime.py
 *
 * There were three. The shadow-service renderer
 * (shadow_service/shadow_service/docx_renderer.py) was deleted by b79f020e1
 * along with the rest of that Python service, and this gate went on listing it
 * — and printing it in its own PASS banner — for months afterwards. See
 * docs/architecture/docx-pipeline-canonical-designation.md, which still
 * designates that runtime the canonical path for regulatory submission
 * documents; that designation now names nothing and needs re-deciding.
 *
 * Exit 0 = all DOCX generation is within approved files.
 * Exit 1 = unapproved DOCX generation entry point detected.
 */

import { execSync } from 'node:child_process';
import path from 'node:path';
import { assertAllowlistPathsExist } from './lib/allowlist-paths.mjs';

const ROOT = path.resolve(new URL('.', import.meta.url).pathname, '../..');

// ─── Approved entry points ──────────────────────────────────────────────────

const APPROVED_JS = new Set([
  // Canonical entry points
  'server/services/docx/docxFactory.ts',
  'server/services/docxGenerator.ts',
  // Known legacy consumers — documented, not new entry points
  'server/services/documentReconstruction.js',
  'server/services/cerGenerationService.ts',
  'server/services/universal-packager.ts',
  'server/routes/authoring.router.ts',
  'scripts/generate_sso_spec.js',
  // Imports ONLY the convertInchesToTwip unit helper from 'docx' — no
  // Document generation (AnA integration, 2026-06-29).
  'server/services/templates/templateRenderAdapter.ts',
]);

const APPROVED_PYTHON = new Set([
  'workers/artifact-compute/docx-python-runtime.py',
  // AnA document-surgery runtimes — same isolated artifact-compute worker
  // family as docx-python-runtime.py (runtime #2), not a fourth runtime.
  // insert/xml EDIT existing documents surgically; validate only READS.
  // Landed 2026-06-29 (ana-integration); exercised by the CI test job's
  // author/build/surgical/validate/verify e2e (ANA_DOCX_E2E_REQUIRED=1).
  'workers/artifact-compute/docx-insert-runtime.py',
  'workers/artifact-compute/docx-xml-runtime.py',
  'workers/artifact-compute/docx-validate-runtime.py',
  // Legacy backend consumers — quarantined, not new entry points
  'scripts/extract_protocol_data.py',
]);

// An approved-runtime entry naming a file that no longer exists pre-approves a
// future file at that path. 13 of these 28 were orphaned by b79f020e1 (the
// dead-code purge), including all five shadow_service renderers — while this
// gate's success banner still advertised one of them as canonical runtime #3.
for (const [name, list] of [['APPROVED_JS', APPROVED_JS], ['APPROVED_PYTHON', APPROVED_PYTHON]]) {
  if (assertAllowlistPathsExist({ tag: '[ci:docx-runtime]', repoRoot: ROOT, name, paths: list }).length) {
    process.exit(1);
  }
}

// Patterns that indicate test files (always allowed)
const TEST_PATTERNS = [
  /\.test\.[^/]+$/,
  /\.spec\.[^/]+$/,
  /\/__tests__\//,
  /\/test\//,
  /\/tests\//,
];

function isTestFile(filePath) {
  return TEST_PATTERNS.some((re) => re.test(filePath));
}

/**
 * Is this matched line a COMMENT rather than code?
 *
 * ── Why this exists ──────────────────────────────────────────────────────────
 * This gate has been failing since `906d4d8`, the commit that FIXED the Word
 * export by replacing `require('docx')` with `await import('docx')`. That
 * commit documented the defect, and `scripts/ci/check-commonjs-require.mjs` —
 * the gate written to stop `require` coming back — quotes the offending line in
 * its own header so the next reader knows what it is looking for:
 *
 *       const { Document, Packer } = require('docx');
 *
 * This scanner is a raw grep, so it read that explanation as an occurrence and
 * reported two "unapproved DOCX entry points" inside another gate's
 * documentation. The result was a red gate that could only be silenced by
 * deleting the sentence explaining the bug — so it stayed red instead, which is
 * how a gate stops being read.
 *
 * A scanner that cannot tell an explanation from an occurrence forces a choice
 * between a working gate and a comment worth having. It should not.
 *
 * Line-level and deliberately so: this is a `grep -n` over whole files, and the
 * cheap check covers every real case here (JSDoc continuations, `//`, and `#`
 * for the Python runtimes). A `require('docx')` genuinely inside a multi-line
 * comment that does not start its own line would still be caught, which is the
 * safe direction to be wrong in.
 */
function isCommentLine(content) {
  return /^\s*(\*|\/\/|\/\*|#)/.test(content);
}

function grepFiles(pattern) {
  try {
    // --exclude-dir keeps installed packages out of the scan: with
    // node_modules present (CI runs after npm install) third-party dist
    // files that import 'docx' would fail the gate spuriously.
    const output = execSync(
      `grep -rn --include='*.ts' --include='*.tsx' --include='*.js' --include='*.mjs' --include='*.py' --exclude-dir=node_modules --exclude-dir=dist --exclude-dir=.git -E ${JSON.stringify(pattern)} .`,
      { cwd: ROOT, encoding: 'utf-8', stdio: ['pipe', 'pipe', 'pipe'] },
    );
    return output
      .trim()
      .split('\n')
      .filter(Boolean)
      .map((line) => {
        // Format: ./relative/path:lineNo:content
        const firstColon = line.indexOf(':');
        const secondColon = line.indexOf(':', firstColon + 1);
        const file = line.slice(0, firstColon).replace(/^\.\//, '');
        const lineNo = line.slice(firstColon + 1, secondColon);
        const content = line.slice(secondColon + 1).trim();
        return { file, lineNo, content };
      })
      // A quoted example in a docblock is not an entry point.
      .filter((hit) => !isCommentLine(hit.content));
  } catch {
    // grep returns exit 1 when no matches — that's fine
    return [];
  }
}

// ─── Scan ───────────────────────────────────────────────────────────────────

console.log('╔══════════════════════════════════════════════════════════════╗');
console.log('║  CI Guard: DOCX Runtime Canonicality                       ║');
console.log('╚══════════════════════════════════════════════════════════════╝\n');

const violations = [];

// 1. JS docx package imports
const jsImportPattern = String.raw`(import\s+.*from\s+['"]docx['"]|require\(\s*['"]docx['"]\s*\))`;
const jsImports = grepFiles(jsImportPattern);

console.log(`── JS \`docx\` package imports (${jsImports.length} found) ──`);
for (const hit of jsImports) {
  const approved = APPROVED_JS.has(hit.file) || isTestFile(hit.file);
  const tag = approved ? '✓ approved' : '✗ VIOLATION';
  console.log(`  [${tag}] ${hit.file}:${hit.lineNo}`);
  if (!approved) {
    violations.push({
      file: hit.file,
      line: hit.lineNo,
      reason: 'Unapproved JS `docx` package import',
      content: hit.content,
    });
  }
}

// 2. new Document() from docx (heuristic — look for `new Document(` in TS/JS files
//    that are NOT already flagged by the import check)
const newDocPattern = String.raw`new\s+Document\s*\(`;
const newDocHits = grepFiles(newDocPattern);

console.log(`\n── \`new Document()\` calls (${newDocHits.length} found) ──`);
for (const hit of newDocHits) {
  // Only flag if the file is not already approved and not a test
  const approved = APPROVED_JS.has(hit.file) || isTestFile(hit.file);
  // Skip python files and this script itself for this check
  if (hit.file.endsWith('.py')) continue;
  if (hit.file === 'scripts/ci/check-docx-runtime-canonicality.mjs') continue;
  const tag = approved ? '✓ approved' : '⚠ review';
  console.log(`  [${tag}] ${hit.file}:${hit.lineNo}`);
  // We only hard-fail on this if the file also has a docx import (checked above)
  // This is a supplementary signal, not a standalone violation
}

// 3. Python python-docx imports
const pyImportPattern = String.raw`(from\s+docx\s+import|import\s+docx)`;
const pyImports = grepFiles(pyImportPattern);

console.log(`\n── Python \`python-docx\` imports (${pyImports.length} found) ──`);
for (const hit of pyImports) {
  // Only check .py files
  if (!hit.file.endsWith('.py')) continue;
  const approved = APPROVED_PYTHON.has(hit.file) || isTestFile(hit.file);
  const tag = approved ? '✓ approved' : '✗ VIOLATION';
  console.log(`  [${tag}] ${hit.file}:${hit.lineNo}`);
  if (!approved) {
    violations.push({
      file: hit.file,
      line: hit.lineNo,
      reason: 'Unapproved Python `python-docx` import',
      content: hit.content,
    });
  }
}

// ─── Summary ────────────────────────────────────────────────────────────────

console.log('\n══════════════════════════════════════════════════════════════');
if (violations.length === 0) {
  console.log('Result: PASS — all DOCX generation is within approved runtimes.\n');
  console.log('Approved runtimes:');
  console.log('  1. JS docx    → server/services/docx/docxFactory.ts');
  console.log('                  server/services/docxGenerator.ts');
  console.log('  2. python-docx → workers/artifact-compute/docx-python-runtime.py');
  console.log('                  (+ the docx-insert / docx-xml / docx-validate');
  console.log('                   surgical-edit runtimes in the same directory)');
  process.exit(0);
} else {
  console.log(`Result: FAIL — ${violations.length} unapproved DOCX entry point(s) detected.\n`);
  for (const v of violations) {
    console.log(`  ✗ ${v.file}:${v.line}`);
    console.log(`    Reason: ${v.reason}`);
    console.log(`    Code:   ${v.content}\n`);
  }
  console.log('To fix: move DOCX generation logic into one of the 3 approved runtimes,');
  console.log('or update the approved list in this script if a new runtime is intentional.');
  console.log('See: docs/architecture/docx-pipeline-canonical-designation.md');
  process.exit(1);
}
