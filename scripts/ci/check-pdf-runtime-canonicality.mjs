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
 * An approval is for a file that generates PDF. One whose file no longer
 * imports a PDF library is a standing pre-approval for whatever is added there
 * next, so it fails until deleted (2026-10-01: five had gone unused, among them
 * routes/report-os.ts once its rendering moved into services/report-os/pdf/).
 * Before scanning, the gate shows both rules firing on a constructed case, so
 * a pattern that stopped matching cannot pass silently.
 *
 * Exit 0 — all PDF generation is in approved files OR within tests.
 * Exit 1 — unapproved new PDF entry point, or an approval that is unused.
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

/** The canonical service. It renders through LibreOffice or a browser, not a PDF library, so the unused-approval rule does not apply to it. */
const CANONICAL = 'server/services/pdf-converter.ts';

const APPROVED = new Set([
  CANONICAL,
  // Existing platform consumers (documented, not new).
  // (2026-10-01: documentQuality/pdfValidationAttachment.ts and tools/index.ts
  //  removed — neither imports a PDF library.)
  'server/export/renderers.ts',
  'server/services/documentExportService.ts',
  'server/services/biotech-artifact-generator.ts',
  'server/services/universal-packager.ts',
  // The Concept2Cure export family (L53 slice 7 moved it out of routes/concept2cure.ts).
  'server/routes/c2c/exports.ts',
  'server/src/routes/stability.router.ts',
  // Additional pre-existing consumers (documented at gate-introduction time,
  // 2026-05-07). New PDF surfaces must use pdf-converter.ts instead of
  // adding entries here.
  // (2026-10-01: authoring.router.ts and report-os.ts removed — neither imports
  //  a PDF library any more; report-os.ts renders through services/report-os/pdf/.)
  'server/routes/documentOrchestrationRoutes.ts',
  'server/routes/integration-test.ts',
  'server/routes/planner-routes.ts',
  // Reporting's governed exports (reporting review 2026-10-01, Part 11 §11.10(b):
  // accurate and complete copies). A report run is structured data, not a DOCX,
  // so there is nothing for pdf-converter.ts to convert; the run PDF prints the
  // report body (the sealed document for a final run), the §11.50 signature
  // manifestation, and the export id and time on every page, and the route
  // records the sha256 of the bytes it sends on the audit chain before sending
  // them (routes/report-os.ts sendRecordedPdf), refusing the export otherwise.
  // Reproducible as the Data Origins report below is: the metadata dates are
  // the recorded export time, fixed at construction (writer.ts
  // stampExportIdentity), so a recorded hash can be re-verified by rendering
  // again. Held by report-os/pdf/__tests__/export-identity.test.ts.
  'server/services/report-os/pdf/writer.ts',
  'server/services/report-os/pdf/run-pdf.ts',
  'server/services/report-os/pdf/bundle-pdf.ts',
  // eCTD leaf rendering — pdfkit directly, and deliberately. The canonical
  // converter cannot pin what this file must pin: PDFKit stamps /CreationDate
  // and /ModDate from the wall clock and writes its own version into /Producer
  // and /Creator, so identical content renders to different bytes. Two things
  // downstream depend on it not doing that — a follow-up eCTD sequence decides
  // which leaves changed by comparing md5 against what the prior sequence
  // filed, and the Part 11 signature binds a bundle sha256. Non-deterministic
  // bytes make every leaf differ from itself, re-filing an entire application
  // at an agency as `replace` on a dependency bump. The file's own header
  // carries the full reasoning; it routes text rendering through
  // documentExportService (already approved) and uses pdfkit only to pin the
  // metadata. Added 2026-09-06 (ledger L175).
  'server/services/ectd/leaf-pdf.ts',
  'server/services/ivdrPackHtml.ts',
  // AnA-integration consumers (landed 2026-06-29 via the ana-integration
  // merge while this gate was advisory-only; documented at CI-wiring time,
  // 2026-07-06). Each is a legitimate exception — none is a DOCX→PDF
  // conversion that pdf-converter.ts could perform:
  //   (submission-ops.ts — binder export via pdfkit — removed 2026-10-01: it no
  //    longer imports a PDF library.)
  //   leaf-pdf-renderer.ts     — deterministic eCTD leaf PDFs (byte-identical output
  //                              is the index.xml md5 checksum contract).
  //   pdf-bookmark-generator.ts — builds /Outlines dicts on EXISTING PDFs (eCTD spec).
  //   fill-official-pdf.ts     — fills AcroForm fields of official FDA PDFs.
  //   ind-form-fill-service.ts — fills official FDA 1571/1572/3674 AcroForms.
  //   ind-form-reconstruct.ts  — re-renders dynamic-XFA 1571/3674 forms that carry
  //                              NO fillable AcroForm layer; pdf-converter.ts (a
  //                              DOCX/HTML→PDF converter) cannot reconstruct XFA.
  //   templateExtractor.ts     — READS PDFs (PDFDocument.load) to extract formatting.
  'server/services/ectd/leaf-pdf-renderer.ts',
  // typeset-leaf-pdf.ts — leaf-pdf-renderer's sibling for Module 3 sections
  //   (headings, wrapped paragraphs, ruled tables). Same byte-identical
  //   contract, held by module3-leaf-typeset.test.ts "is byte-deterministic";
  //   pdf-converter.ts cannot give that. Added 2026-10-05 for af3df074c (D2).
  'server/services/ectd/typeset-leaf-pdf.ts',
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
// require() too. Until 2026-10-01 the gate read only `import`, and the one file
// that reached pdfkit through require() was an unrecorded export serving
// hard-coded figures (routes/analytics-routes.ts GET /export, retired that day).
const PDF_LIB_REQUIRE = /\brequire\(\s*['"](pdfkit|pdf-lib)['"]\s*\)/;

/** How a file generates PDF, as the findings name it; empty when it does not. */
function pdfUses(text) {
  const matches = [];
  if (PDF_LIB_IMPORT.test(text)) matches.push("imports 'pdfkit' or 'pdf-lib'");
  if (PDF_LIB_DYNAMIC.test(text)) matches.push("dynamic import of 'pdfkit'/'pdf-lib'");
  if (PDF_LIB_REQUIRE.test(text)) matches.push("require() of 'pdfkit'/'pdf-lib'");
  if (PUPPETEER_PDF.test(text)) matches.push('calls page.pdf() (puppeteer)');
  return matches;
}

/** Approved files (the canonical service aside) whose text no longer generates PDF. */
function unusedApprovals(approved, read) {
  return [...approved].filter(rel => rel !== CANONICAL && pdfUses(read(rel)).length === 0).sort();
}

// The gate fails on the cases it exists for before it is allowed to pass.
{
  const probe = new Set([CANONICAL, 'probe/uses.ts', 'probe/unused.ts']);
  const text = { 'probe/uses.ts': "import PDFDocument from 'pdfkit';", 'probe/unused.ts': 'export const x = 1;' };
  const caught =
    pdfUses("import { PDFDocument } from 'pdf-lib';").length === 1 &&
    pdfUses("const { PDFDocument } = await import('pdf-lib');").length === 1 &&
    pdfUses("const PDFDocument = require('pdfkit');").length === 1 &&
    pdfUses('await page.pdf({ format: "A4" });').length === 1 &&
    pdfUses('export const report = "pdf";').length === 0 &&
    JSON.stringify(unusedApprovals(probe, rel => text[rel] ?? '')) === '["probe/unused.ts"]';
  if (!caught) {
    console.error('[ci:pdf-runtime-canonicality] FAIL — the gate no longer detects its own probe cases; it would pass anything.');
    process.exit(1);
  }
}

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
    const matches = pdfUses(text);
    if (matches.length > 0) {
      findings.push({ file: rel, matches });
    }
  }
}

const unused = unusedApprovals(APPROVED, rel => fs.readFileSync(path.join(repoRoot, rel), 'utf8'));
if (unused.length > 0) {
  console.error('[ci:pdf-runtime-canonicality] FAIL — approved files that no longer generate PDF:\n');
  for (const rel of unused) console.error(`  ${rel}`);
  console.error(
    '\nAn unused approval admits whatever PDF generation is added to that file next, unreviewed. ' +
      'Delete each entry from APPROVED.'
  );
  process.exit(1);
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
