#!/usr/bin/env node
import { spawnSync } from 'node:child_process';

const strictUatEvidence = process.argv.includes('--strict-uat-evidence');

const checks = [
  ['node', ['scripts/ci/check-governed-export-routes.mjs']],
  ['node', ['scripts/ci/check-governed-export-consequence-shape.mjs']],
  ['node', ['scripts/ci/check-reasoning-tier-ga-readiness.mjs']],
  ['node', ['scripts/ci/check-reasoning-tier-uat-evidence.mjs', ...(strictUatEvidence ? ['--strict'] : [])]],
];

let failures = 0;
for (const [cmd, args] of checks) {
  const label = `${cmd} ${args.join(' ')}`;
  console.log(`\n▶ ${label}`);
  const result = spawnSync(cmd, args, { stdio: 'inherit' });
  if (result.status !== 0) {
    console.error(`❌ failed: ${label}`);
    failures++;
  }
}

if (failures > 0) {
  console.error(`\nReasoning Tier readiness suite failed (${failures} step(s) failed).`);
  process.exit(1);
}

console.log('\n✅ Reasoning Tier readiness suite passed.');
