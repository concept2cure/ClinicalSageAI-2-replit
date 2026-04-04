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
  // Scan only the governed POST route, not the dev-only sample GET routes.
  if (check.file === 'server/routes/cerv2-export-routes.ts') {
    const zipSection = findSection(src, "router.post('/zip'", "router.get('/sample/");
    const forbidden = ['archive.pipe(res)', "res.setHeader('Content-Disposition'"];
    for (const token of forbidden) {
      if (zipSection.includes(token)) {
        console.error(`❌ ${check.file} governed ZIP route contains forbidden token: ${token}`);
        failures++;
      }
    }

    // Also verify sample routes are dev-gated
    const sampleSection = findSection(src, "router.get('/sample/", '');
    if (sampleSection && !sampleSection.includes('isSampleExportEnabled')) {
      console.error(`❌ ${check.file} sample routes must be gated by isSampleExportEnabled()`);
      failures++;
    }
  }
}

if (failures > 0) {
  console.error(`\nGoverned export route contract check failed with ${failures} issue(s).`);
  process.exit(1);
}

console.log('✅ Governed export route contract check passed.');
