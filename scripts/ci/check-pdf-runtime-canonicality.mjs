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
import { assertAllowlistPathsExist } from './lib/allowlist-paths.mjs';

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
  'server/services/biotech-artifact-generator.ts',
  'server/services/universal-packager.ts',
  'server/services/tools/index.ts',
  'server/routes/concept2cure.ts',
  'server/src/routes/stability.router.ts',
  // Additional pre-existing consumers (documented at gate-introduction time,
  // 2026-05-07). New PDF surfaces must use pdf-converter.ts instead of
  // adding entries here.
  'server/routes/authoring.router.ts',
  'server/routes/documentOrchestrationRoutes.ts',
  'server/routes/integration-test.ts',
  'server/routes/planner-routes.ts',
  'server/routes/report-os.ts',
  'server/services/ivdrPackHtml.ts',
  // AnA-integration consumers (landed 2026-06-29 via the ana-integration
  // merge while this gate was advisory-only; documented at CI-wiring time,
  // 2026-07-06). Each is a legitimate exception — none is a DOCX→PDF
  // conversion that pdf-converter.ts could perform:
  //   submission-ops.ts        — binder export renders section markdown via pdfkit.
  //   leaf-pdf-renderer.ts     — deterministic eCTD leaf PDFs (byte-identical output
  //                              is the index.xml md5 checksum contract).
  //   pdf-bookmark-generator.ts — builds /Outlines dicts on EXISTING PDFs (eCTD spec).
  //   fill-official-pdf.ts     — fills AcroForm fields of official FDA PDFs.
  //   ind-form-fill-service.ts — fills official FDA 1571/1572/3674 AcroForms.
  //   ind-form-reconstruct.ts  — re-renders dynamic-XFA 1571/3674 forms that carry
  //                              NO fillable AcroForm layer; pdf-converter.ts (a
  //                              DOCX/HTML→PDF converter) cannot reconstruct XFA.
  //   templateExtractor.ts     — READS PDFs (PDFDocument.load) to extract formatting.
  'server/routes/submission-ops.ts',
  'server/services/ectd/leaf-pdf-renderer.ts',
  'server/services/ectd/pdf-bookmark-generator.ts',
  'server/services/forms/fill-official-pdf.ts',
  'server/services/ind-forms/ind-form-fill-service.ts',
  'server/services/ind-forms/ind-form-reconstruct.ts',
  'server/services/templates/templateExtractor.ts',
  // Data Origins report (landed 2026-08-04). Renders a provenance report for a
  // selected passage — there is no DOCX source for pdf-converter.ts to convert,
  // it is composed from lineage rows directly.
  //
  // WHAT MAKES ITS OUTPUT REPRODUCIBLE — and what does not.
  // This entry first claimed the bytes were safe because they go through the
  // converter's makeDeterministic(). That was not sufficient and the file was
  // in fact non-deterministic while the claim stood. makeDeterministic()
  // rewrites INLINE `/CreationDate (D:…)` literals, which is what LibreOffice
  // and Puppeteer emit; pdfkit writes the Info dictionary as indirect object
  // references (`/CreationDate 17 0 R`), so the pattern never matched and the
  // wall-clock timestamp survived every render.
  //
  // What actually makes it stable is that the date is fixed at CONSTRUCTION:
  // `info.CreationDate`/`ModDate` are derived from `report.generatedAt`, so
  // there is no varying value left to rewrite. makeDeterministic() is still
  // applied, for the trailer /ID that pdfkit genuinely randomises.
  //
  // Held by __tests__/data-origins-pdf.determinism.test.ts, which asserts both
  // that every date in the file equals the one derived from the report AND that
  // two renders separated by a real clock tick are byte-identical. A provenance
  // artefact whose hash changed on every print would be the one document in the
  // platform least able to afford it.
  'server/services/clinical-regulatory-evidence/data-origins-pdf.ts',
]);

// See scripts/ci/lib/allowlist-paths.mjs: an entry for an absent file is a
// pre-approval, not dead weight. Three of these were orphaned by deletions.
if (assertAllowlistPathsExist({ tag: '[ci:pdf-runtime]', repoRoot, name: 'APPROVED', paths: APPROVED }).length) {
  process.exit(1);
}

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
