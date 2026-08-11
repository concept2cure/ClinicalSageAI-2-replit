#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';

const root = process.cwd();

const checks = [
  {
    file: 'server/routes/cerv2-export-routes.ts',
    mustContain: [
      "router.post('/pdf'",
      "router.post('/docx'",
      "router.post('/zip'",
      'createGovernedExportConsequence(',
      "sourceType: 'export_pdf'",
      "sourceType: 'export_docx'",
      "sourceType: 'export_zip'",
      "backendRoute: 'POST /api/cerv2/export/pdf'",
      "backendRoute: 'POST /api/cerv2/export/docx'",
      "backendRoute: 'POST /api/cerv2/export/zip'",
      "error: 'GOVERNED_EXPORT_FAILED'",
    ],
  },
  {
    file: 'server/routes/510k-estar-routes.ts',
    mustContain: [
      "router.post('/build'",
      'createGovernedExportConsequence(',
      "sourceType: 'export_estar_zip'",
      "backendRoute: 'POST /api/510k/estar/build'",
      "error: 'GOVERNED_EXPORT_FAILED'",
    ],
  },
];

function findSection(source, routeStartToken, routeEndToken) {
  const start = source.indexOf(routeStartToken);
  if (start < 0) return '';
  const end = routeEndToken ? source.indexOf(routeEndToken, start + routeStartToken.length) : -1;
  return end > start ? source.slice(start, end) : source.slice(start);
}

let failures = 0;
for (const check of checks) {
  const target = path.join(root, check.file);
  if (!fs.existsSync(target)) {
    console.error(`❌ missing file: ${check.file}`);
    failures++;
    continue;
  }

  const src = fs.readFileSync(target, 'utf8');
  for (const token of check.mustContain) {
    if (!src.includes(token)) {
      console.error(`❌ ${check.file} missing token: ${token}`);
      failures++;
    }
  }

  // Guard against regressions to direct-stream ZIP bypass in the governed CERV2 POST /zip route.
  if (check.file === 'server/routes/cerv2-export-routes.ts') {
    // The section ends at the NEXT route, `router.post(\n  '/ai-to-editor'`.
    //
    // It used to end at "router.get('/sample/". When the sample routes were
    // deleted that token stopped existing, findSection's `end` fell to -1, and
    // the scan silently widened to the whole rest of the file — still green,
    // because nothing forbidden happened to live there. A range marker that
    // can vanish is a range marker that will one day scope a guard to
    // everything or nothing without saying so, so this one is asserted below
    // rather than assumed.
    const ZIP_SECTION_END = "router.post(\n  '/ai-to-editor'";
    if (!src.includes(ZIP_SECTION_END)) {
      console.error(
        `❌ ${check.file}: cannot locate the end of the governed ZIP section ` +
          `(expected the next route to be POST /ai-to-editor). The forbidden-token ` +
          `scan below would silently cover the wrong range — fix the marker.`
      );
      failures++;
    }
    const zipSection = findSection(src, "router.post('/zip'", ZIP_SECTION_END);
    const forbidden = ['archive.pipe(res)', "res.setHeader('Content-Disposition'"];
    for (const token of forbidden) {
      if (zipSection.includes(token)) {
        console.error(`❌ ${check.file} governed ZIP route contains forbidden token: ${token}`);
        failures++;
      }
    }

    // The sample export routes must not come back.
    //
    // This check used to be "if sample routes exist, they must call
    // isSampleExportEnabled()". They no longer exist: GET /sample/:docType and
    // its /docx, /zip and /json variants rendered downloadable documents from
    // an in-memory placeholder store (mockVault, also deleted). Being dev-gated
    // was the mitigation; not existing is the fix. Asserting their ABSENCE is
    // strictly stronger than asserting they were guarded, and unlike the old
    // form it cannot pass by finding nothing to check.
    if (src.includes("router.get('/sample/")) {
      console.error(
        `❌ ${check.file} reintroduces a GET /sample/* export route. These rendered ` +
          `documents that look like submissions from placeholder content; every export ` +
          `route here must serve real authored content behind authMiddleware + ` +
          `requireEditorAccess.`
      );
      failures++;
    }
  }
}

if (failures > 0) {
  console.error(`\nGoverned export route contract check failed with ${failures} issue(s).`);
  process.exit(1);
}

console.log('✅ Governed export route contract check passed.');
