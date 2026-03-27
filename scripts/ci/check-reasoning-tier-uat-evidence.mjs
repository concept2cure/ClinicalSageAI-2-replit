#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';

const root = process.cwd();
const strict = process.argv.includes('--strict');

const evidenceRootRel = 'docs/release/evidence/reasoning-tier-uat';
const evidenceRoot = path.join(root, evidenceRootRel);

const requiredRunTokens = [
  'Scenario id',
  'Run result:',
  'Reviewer confidence',
  '`provenance_ref`',
  '`audit_ref`',
  '`downloadable_output_ref`',
  'Defects opened',
  'Regulatory Affairs recommendation',
  'MEDICAL_WRITING_RED_FLAG_PATTERNS.md',
  'REGULATORY_TERMINOLOGY_GLOSSARY.md',
  'REASONING_TIER_MEDICAL_WRITING_EDIT_POLICY.md',
];

let failures = 0;

if (!fs.existsSync(evidenceRoot)) {
  console.error(`❌ missing evidence directory: ${evidenceRootRel}`);
  process.exit(1);
}

const cycleDirs = fs
  .readdirSync(evidenceRoot, { withFileTypes: true })
  .filter((entry) => entry.isDirectory())
  .map((entry) => entry.name)
  .sort();

const runFiles = [];

const summaryFilesByCycle = new Map();
for (const cycle of cycleDirs) {
  const cyclePath = path.join(evidenceRoot, cycle);
  const summaries = fs
    .readdirSync(cyclePath, { withFileTypes: true })
    .filter((entry) => entry.isFile() && entry.name.toLowerCase() === 'cycle_summary.md')
    .map((entry) => path.join(cyclePath, entry.name));
  summaryFilesByCycle.set(cycle, summaries);
}

for (const cycle of cycleDirs) {
  const cyclePath = path.join(evidenceRoot, cycle);
  const files = fs
    .readdirSync(cyclePath, { withFileTypes: true })
    .filter((entry) => entry.isFile() && entry.name.endsWith('.md') && entry.name.toLowerCase() !== 'cycle_summary.md')
    .map((entry) => path.join(cyclePath, entry.name));
  runFiles.push(...files);
}

if (strict) {
  for (const cycle of cycleDirs) {
    const summaries = summaryFilesByCycle.get(cycle) ?? [];
    if (summaries.length === 0) {
      console.error(`❌ cycle ${cycle} missing CYCLE_SUMMARY.md (strict mode).`);
      failures++;
    }
  }
}

if (runFiles.length === 0) {
  const msg = `⚠️ no UAT run evidence files found under ${evidenceRootRel}/<cycle-id>/*.md`;
  if (strict) {
    console.error(`❌ ${msg} (strict mode)`);
    process.exit(1);
  }
  console.log(msg);
  console.log('✅ UAT evidence structure check passed (non-strict mode).');
  process.exit(0);
}

for (const fullPath of runFiles) {
  const rel = path.relative(root, fullPath);
  const src = fs.readFileSync(fullPath, 'utf8');
  for (const token of requiredRunTokens) {
    if (!src.includes(token)) {
      console.error(`❌ ${rel} missing token: ${token}`);
      failures++;
    }
  }
}

if (failures > 0) {
  console.error(`\nReasoning Tier UAT evidence check failed with ${failures} issue(s).`);
  process.exit(1);
}

console.log(`✅ Reasoning Tier UAT evidence check passed (${runFiles.length} run file(s) validated).`);
