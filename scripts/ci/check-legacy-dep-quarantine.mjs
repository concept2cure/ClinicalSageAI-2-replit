#!/usr/bin/env node
/**
 * CI Guard: Legacy Dependency Quarantine
 *
 * Prevents new imports of quarantined legacy dependencies.
 * Existing known consumer files are allowlisted; any NEW file importing
 * a quarantined dependency will fail this check.
 *
 * Quarantined families:
 *   - @supabase/supabase-js (legacy data harvesting — 9 known consumers)
 *   - aws-sdk v2 (legacy — 1 known consumer, should use @aws-sdk v3)
 *
 * Exit 0 = no new quarantine violations.
 * Exit 1 = new import of quarantined dependency detected.
 */

import { execSync } from 'node:child_process';
import path from 'node:path';

const ROOT = path.resolve(new URL('.', import.meta.url).pathname, '../..');

// Known existing consumers of @supabase/supabase-js (allowlisted)
const SUPABASE_ALLOWLIST = new Set([
  'server/services/pdfGenerator.js',
  'server/services/harvestEngine.js',
  'server/services/indCopilot.js',
  'server/services/esgService.js',
  'server/services/dataHarvester.js',
  'server/jobs/periodicReview.js',
  'scripts/test_reference_model.js',
  'scripts/setup_reference_model.js',
  'scripts/migrate_legacy_types.js',
]);

// Known existing consumers of aws-sdk v2 (allowlisted)
const AWSV2_ALLOWLIST = new Set([
  'server/routes/cerRoutes.ts',
]);

// Test file patterns (always allowed)
const TEST_PATTERNS = [/\.test\./, /\.spec\./, /\/__tests__\//, /\/test\//, /\/tests\//];
function isTestFile(f) { return TEST_PATTERNS.some(re => re.test(f)); }

function grepFiles(pattern) {
  try {
    const output = execSync(
      `grep -rn --include='*.ts' --include='*.tsx' --include='*.js' --include='*.mjs' -E ${JSON.stringify(pattern)} .`,
      { cwd: ROOT, encoding: 'utf-8', stdio: ['pipe', 'pipe', 'pipe'] },
    );
    return output.trim().split('\n').filter(Boolean).map(line => {
      const i = line.indexOf(':');
      const j = line.indexOf(':', i + 1);
      return { file: line.slice(0, i).replace(/^\.\//, ''), lineNo: line.slice(i + 1, j), content: line.slice(j + 1).trim() };
    });
  } catch { return []; }
}

console.log('╔══════════════════════════════════════════════════════════════╗');
console.log('║  CI Guard: Legacy Dependency Quarantine                     ║');
console.log('╚══════════════════════════════════════════════════════════════╝\n');

const violations = [];

// Check @supabase/supabase-js
const supabaseHits = grepFiles(String.raw`from\s+['"]@supabase/supabase-js['"]|require\(['"]@supabase/supabase-js['"]\)`);
console.log(`── @supabase/supabase-js imports (${supabaseHits.length} found) ──`);
for (const hit of supabaseHits) {
  const allowed = SUPABASE_ALLOWLIST.has(hit.file) || isTestFile(hit.file);
  console.log(`  [${allowed ? '✓ known' : '✗ NEW'}] ${hit.file}:${hit.lineNo}`);
  if (!allowed) violations.push({ file: hit.file, line: hit.lineNo, dep: '@supabase/supabase-js' });
}

// Check aws-sdk v2
const awsv2Hits = grepFiles(String.raw`from\s+['"]aws-sdk['"]|require\(['"]aws-sdk['"]\)`);
console.log(`\n── aws-sdk v2 imports (${awsv2Hits.length} found) ──`);
for (const hit of awsv2Hits) {
  const allowed = AWSV2_ALLOWLIST.has(hit.file) || isTestFile(hit.file);
  console.log(`  [${allowed ? '✓ known' : '✗ NEW'}] ${hit.file}:${hit.lineNo}`);
  if (!allowed) violations.push({ file: hit.file, line: hit.lineNo, dep: 'aws-sdk v2' });
}

console.log('\n══════════════════════════════════════════════════════════════');
if (violations.length === 0) {
  console.log('Result: PASS — no new quarantine violations.');
  process.exit(0);
} else {
  console.log(`Result: FAIL — ${violations.length} new quarantine violation(s).\n`);
  for (const v of violations) console.log(`  ✗ ${v.file}:${v.line} (${v.dep})`);
  console.log('\nTo fix: use the canonical dependency or add to the allowlist if intentional.');
  process.exit(1);
}
