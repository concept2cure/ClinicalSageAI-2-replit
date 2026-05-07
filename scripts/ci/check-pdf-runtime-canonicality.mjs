#!/usr/bin/env node
/**
 * CI Guard: PDF Runtime Canonicality
 *
 * The canonical entry point for DOCX→PDF conversion is
 * server/services/pdf-converter.ts. New PDF generation in the platform
 * should route through that service so its output is deterministic and
 * its hash is bound to the audit chain.
 *
 * This gate flags NEW callers of the raw PDF libraries (pdfkit, pdf-lib,
 * puppeteer page.pdf()) outside an allowlist of known legacy entry points.
 * The allowlist exists because we have several pre-existing routes
 * (ind-pdf, /artifacts/export-pdf, documentExportService, etc.) that
 * predate the canonical converter; they're documented and not new.
 *
 * Exit 0 — all PDF generation is in approved files OR within tests.
 * Exit 1 — unapproved new PDF entry point detected.
 *
 * Usage:
 *   node scripts/ci/check-pdf-runtime-canonicality.mjs
 *   node scripts/ci/check-pdf-runtime-canonicality.mjs --strict
 */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const repoRoot = path.resolve(path.dirname(__filename), '..', '..');

// ─── Approved entry points ──────────────────────────────────────────────────

const APPROVED = new Set([
  // Canonical service.
  'server/services/pdf-converter.ts',
  // Existing platform consumers (documented, not new).
  'server/export/renderers.ts',
  'server/services/documentExportService.ts',
  'server/services/documentQuality/pdfValidationAttachment.ts',
  'server/services/cerGenerator.ts',
  'server/services/cerGenerationService.ts',
  'server/services/eSTARValidator.ts',
  'server/services/biotech-artifact-generator.ts',
  'server/services/fda510kDocumentGenerator.js',
  'server/services/pmaDocumentGenerator.js',
  'server/services/universal-packager.ts',
  'server/services/claude/ClaudeToolExecutor.ts',
  'server/services/tools/index.ts',
  'server/routes/ind-pdf.ts',
  'server/routes/concept2cure.ts',
  'server/src/routes/stability.router.ts',
  'server/pdf-processor.ts',
  'server/generate-all-submissions.js',
  // Additional pre-existing consumers (documented at gate-introduction time,
  // 2026-05-07). New PDF surfaces must use pdf-converter.ts instead of
  // adding entries here.
  'server/routes/authoring.router.ts',
  'server/routes/documentOrchestrationRoutes.ts',
  'server/routes/integration-test.ts',
  'server/routes/planner-routes.ts',
  'server/routes/report-os.ts',
  'server/services/ivdrPackHtml.ts',
]);

const PDF_LIB_IMPORT = /from\s+['"](pdfkit|pdf-lib)['"]/;
const PDF_LIB_DYNAMIC = /import\(\s*['"](pdfkit|pdf-lib)['"]\s*\)/;
const PUPPETEER_PDF = /\bpage\.pdf\s*\(/;

const SCAN_ROOTS = [path.join(repoRoot, 'server')];

function isTestPath(rel) {
  if (rel.includes('/__tests__/')) return true;
  if (rel.endsWith('.test.ts') || rel.endsWith('.test.js')) return true;
  if (rel.endsWith('.spec.ts') || rel.endsWith('.spec.js')) return true;
  return false;
}

function walk(dir) {
  const out = [];
  if (!fs.existsSync(dir)) return out;
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      if (entry.name === 'node_modules' || entry.name === '_deprecated_migrations') continue;
      out.push(...walk(full));
    } else if (entry.isFile() && (full.endsWith('.ts') || full.endsWith('.js'))) {
      out.push(full);
    }
  }
  return out;
}

const findings = [];

for (const root of SCAN_ROOTS) {
  for (const file of walk(root)) {
    const rel = path.relative(repoRoot, file).replaceAll(path.sep, '/');
    if (isTestPath(rel)) continue;
    if (APPROVED.has(rel)) continue;

    const text = fs.readFileSync(file, 'utf8');
    const matches = [];
    if (PDF_LIB_IMPORT.test(text)) matches.push("imports 'pdfkit' or 'pdf-lib'");
    if (PDF_LIB_DYNAMIC.test(text)) matches.push("dynamic import of 'pdfkit'/'pdf-lib'");
    if (PUPPETEER_PDF.test(text)) matches.push('calls page.pdf() (puppeteer)');
    if (matches.length > 0) {
      findings.push({ file: rel, matches });
    }
  }
}

if (findings.length === 0) {
  console.log(
    '[ci:pdf-runtime-canonicality] OK — no new PDF entry points outside the approved list'
  );
  process.exit(0);
}

console.error('[ci:pdf-runtime-canonicality] FAIL — new PDF entry points detected:\n');
for (const f of findings) {
  console.error(`  ${f.file}`);
  for (const m of f.matches) console.error(`    → ${m}`);
  console.error('');
}
console.error(
  `Total: ${findings.length} file(s). New PDF generation should route through ` +
    'server/services/pdf-converter.ts for deterministic, audit-bound output. ' +
    'If this file is a legitimate exception, add it to the APPROVED list with ' +
    'a one-line justification.'
);
process.exit(1);
