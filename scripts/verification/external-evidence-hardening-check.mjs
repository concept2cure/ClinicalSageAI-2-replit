#!/usr/bin/env node
/**
 * External Evidence hardening sanity check.
 * Non-destructive; validates env + key route files + migration presence.
 */
import fs from 'fs';

const checks = [];
const add = (name, ok, detail='') => checks.push({ name, ok, detail });

add('FIRECRAWL_API_KEY configured', Boolean(process.env.FIRECRAWL_API_KEY), 'env');
add('FIRECRAWL_WEBHOOK_SECRET configured', Boolean(process.env.FIRECRAWL_WEBHOOK_SECRET), 'env');
add('FEATURE_FIRECRAWL_ENABLED true', process.env.FEATURE_FIRECRAWL_ENABLED === 'true', process.env.FEATURE_FIRECRAWL_ENABLED || 'unset');

const files = [
  'server/routes/firecrawl.ts',
  'server/routes/firecrawl-webhooks.ts',
  'server/routes/external-evidence.ts',
  'sql/migrations/20260327_external_evidence_intelligence.sql',
  'sql/migrations/20260327_external_evidence_indexes.sql',
];
for (const f of files) {
  add(`file exists: ${f}`, fs.existsSync(f), 'filesystem');
}

const failed = checks.filter(c => !c.ok);
console.log('\nExternal Evidence Hardening Check');
console.log('=================================');
for (const c of checks) {
  console.log(`${c.ok ? 'PASS' : 'FAIL'} - ${c.name}${c.detail ? ` (${c.detail})` : ''}`);
}
console.log('---------------------------------');
if (failed.length) {
  console.log(`Result: ${failed.length} failing checks`);
  process.exitCode = 1;
} else {
  console.log('Result: all checks passed');
}
