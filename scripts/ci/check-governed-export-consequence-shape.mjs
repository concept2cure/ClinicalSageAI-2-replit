#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';

const root = process.cwd();

const helperFile = 'server/services/export/governedExportConsequence.ts';
const helperPath = path.join(root, helperFile);

const requiredHelperTokens = [
  'governed: true',
  'artifact_id:',
  'artifact_version:',
  'artifact_status:',
  'placement_state:',
  'suggested_placement:',
  'provenance_ref:',
  'audit_ref:',
  'downloadable_output_ref:',
  "encoding: 'base64'",
  'mime_type:',
  'filename:',
  'data:',
  'assertValidGovernedExportInput',
  'INVALID_GOVERNED_EXPORT_INPUT',
];

const routeChecks = [
  {
    file: 'server/routes/510k-estar-routes.ts',
    mustContain: [
      'const consequence = await createGovernedExportConsequence({',
      /*
       * The official-eSTAR route returns the consequence THROUGH
       * withOfficialExtras, which spreads it and adds this route's own reports
       * beside it — the consequence's own keys reach the client unchanged. Both
       * halves are pinned: the consequence is the wrapper's FIRST argument, and
       * the wrapper's object literal opens with `...body`.
       *
       * These are PATTERNS, not the literal call, and that is a deliberate
       * narrowing after they broke on a legitimate change (adding the
       * attachment report). A gate that fails whenever an argument is added is
       * not protecting the shape — it is protecting the argument list, and the
       * cheapest way to satisfy it is to stop passing things through the
       * wrapper. What matters is that the consequence goes in first and comes
       * out whole; an extra report beside it was always allowed.
       */
      /return res\s*\.status\(200\)\s*\.json\(\s*withOfficialExtras\(\s*consequence\s*,/,
      /function withOfficialExtras[\s\S]{0,600}?return \{\s*\.\.\.body\s*,/,
    ],
  },
  {
    file: 'server/routes/cerv2-export-routes.ts',
    mustContain: [
      "backendRoute: 'POST /api/cerv2/export/pdf'",
      "backendRoute: 'POST /api/cerv2/export/docx'",
      "backendRoute: 'POST /api/cerv2/export/zip'",
      'return res.status(200).json(consequence);',
    ],
  },
];

let failures = 0;

if (!fs.existsSync(helperPath)) {
  console.error(`❌ missing file: ${helperFile}`);
  failures++;
} else {
  const src = fs.readFileSync(helperPath, 'utf8');
  for (const token of requiredHelperTokens) {
    if (!src.includes(token)) {
      console.error(`❌ ${helperFile} missing token: ${token}`);
      failures++;
    }
  }
}

for (const check of routeChecks) {
  const target = path.join(root, check.file);
  if (!fs.existsSync(target)) {
    console.error(`❌ missing file: ${check.file}`);
    failures++;
    continue;
  }
  const src = fs.readFileSync(target, 'utf8');
  for (const token of check.mustContain) {
    const found = token instanceof RegExp ? token.test(src) : src.includes(token);
    if (!found) {
      console.error(`❌ ${check.file} missing token: ${token}`);
      failures++;
    }
  }
}

if (failures > 0) {
  console.error(`\nGoverned export consequence shape check failed with ${failures} issue(s).`);
  process.exit(1);
}

console.log('✅ Governed export consequence shape check passed.');
