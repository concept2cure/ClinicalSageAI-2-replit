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
let noUatEvidence = false;
for (const [cmd, args] of checks) {
  const label = `${cmd} ${args.join(' ')}`;
  console.log(`\n▶ ${label}`);
  // Piped, not inherited, for the one step whose verdict qualifies this suite's
  // own closing line — see the NO_UAT_EVIDENCE token in
  // check-reasoning-tier-uat-evidence.mjs. Output is echoed either way, so
  // nothing is hidden.
  const capture = args[0].includes('check-reasoning-tier-uat-evidence');
  const result = capture
    ? spawnSync(cmd, args, { encoding: 'utf8' })
    : spawnSync(cmd, args, { stdio: 'inherit' });
  if (capture) {
    if (result.stdout) process.stdout.write(result.stdout);
    if (result.stderr) process.stderr.write(result.stderr);
    if (`${result.stdout ?? ''}`.includes('NO_UAT_EVIDENCE')) noUatEvidence = true;
  }
  if (result.status !== 0) {
    console.error(`❌ failed: ${label}`);
    failures++;
  }
}

if (failures > 0) {
  console.error(`\nReasoning Tier readiness suite failed (${failures} step(s) failed).`);
  process.exit(1);
}

if (noUatEvidence) {
  // The honest closing line. Every check above passed, and none of them
  // witnessed a UAT: the GA-readiness step verifies that certain documents
  // exist and contain certain phrases — including the literal string "Human UAT
  // completed and signed off" — which a document describing the gate satisfies
  // on its own. Calling that "readiness" would let a release decision rest on
  // its own paperwork.
  console.log(
    '\n✅ Reasoning Tier readiness suite passed — DOCUMENTS AND CONTRACTS ONLY.\n' +
      '   No UAT run evidence exists, so this run establishes no GA readiness.\n' +
      '   The GA gate is npm run ci:reasoning-tier-readiness:strict, which fails\n' +
      '   until real evidence is committed under\n' +
      '   docs/release/evidence/reasoning-tier-uat/<cycle-id>/.'
  );
  process.exit(0);
}

console.log('\n✅ Reasoning Tier readiness suite passed, with UAT run evidence present.');
