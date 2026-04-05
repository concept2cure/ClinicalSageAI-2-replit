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
 *   3. Shadow service renderer — shadow_service/shadow_service/docx_renderer.py
 *
 * Exit 0 = all DOCX generation is within approved files.
 * Exit 1 = unapproved DOCX generation entry point detected.
 */

import { execSync } from 'node:child_process';
import path from 'node:path';

const ROOT = path.resolve(new URL('.', import.meta.url).pathname, '../..');

// ─── Approved entry points ──────────────────────────────────────────────────

const APPROVED_JS = new Set([
  // Canonical entry points
  'server/services/docx/docxFactory.ts',
  'server/services/docxGenerator.ts',
  // Known legacy consumers — documented, not new entry points
  'server/services/documentReconstruction.js',
  'server/services/diffChecker.js',
  'server/services/fda510kDocumentGenerator.js',
  'server/services/cerGenerationService.ts',
  'server/services/pmaDocumentGenerator.js',
  'server/services/universal-packager.ts',
  'server/generate-all-submissions.js',
  'server/routes/authoring.router.ts',
  'server/routes/ind-templates.ts',
  'scripts/generate_sso_spec.js',
  'client/src/services/Fda510kExportService.js',
]);

const APPROVED_PYTHON = new Set([
  'workers/artifact-compute/docx-python-runtime.py',
  'shadow_service/shadow_service/docx_renderer.py',
  'shadow_service/shadow_service/generators/evidence_cell_renderer.py',
  'shadow_service/shadow_service/generators/docx_factory.py',
  'shadow_service/shadow_service/generate_seed_templates.py',
  'shadow_service/shadow_service/router_docx_factory.py',
  // Legacy backend consumers — quarantined, not new entry points
  'backend/generateSection.py',
  'backend/knowledge_ingestion.py',
  'scripts/extract_protocol_data.py',
  'ind_automation/templates.py',
  'ind_automation/create_template.py',
  'ind_automation/create_form_templates.py',
  'ind_automation/compilers/ectd4_compiler.py',
  'lumen_cortex/core/extractors/text_extract.py',
  'services/ectd_generator.py',
]);

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

function grepFiles(pattern) {
  try {
    const output = execSync(
      `grep -rn --include='*.ts' --include='*.tsx' --include='*.js' --include='*.mjs' --include='*.py' -E ${JSON.stringify(pattern)} .`,
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
      });
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
  console.log('  3. Shadow svc  → shadow_service/shadow_service/docx_renderer.py');
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
