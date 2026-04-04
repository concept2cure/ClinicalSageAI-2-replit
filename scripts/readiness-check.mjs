#!/usr/bin/env node
/**
 * Readiness Check Runner
 *
 * Runs startup invariants and reports results.
 *
 * Modes:
 *   --warn-only  (default) — log results, always exit 0
 *   --strict               — exit 1 if any critical invariant fails
 *
 * Usage:
 *   node scripts/readiness-check.mjs              # warn-only
 *   node scripts/readiness-check.mjs --strict     # strict mode (CI/deploy gate)
 *
 * Checks:
 *   1. Database connectivity (critical)
 *   2. revoked_tokens table (warning)
 *   3. documents.artifact_id column (warning)
 *   4. concept2cure_artifacts table (critical)
 *   5. Redis connectivity (warning)
 */

const strict = process.argv.includes('--strict');

console.log('╔══════════════════════════════════════════════════════════════╗');
console.log(`║  Readiness Check — ${strict ? 'STRICT (blocking)' : 'WARN-ONLY'}                       ║`);
console.log('╚══════════════════════════════════════════════════════════════╝\n');

try {
  const { runStartupInvariants } = await import('../server/lib/startup-invariants.js');
  const report = await runStartupInvariants();

  console.log(`Checked at: ${report.checkedAt}`);
  console.log(`Duration:   ${report.durationMs}ms\n`);

  for (const inv of report.invariants) {
    const icon = inv.passed ? '✓' : (inv.severity === 'critical' ? '✗' : '⚠');
    const tag = inv.passed ? 'PASS' : inv.severity.toUpperCase();
    console.log(`  [${icon} ${tag}] ${inv.name}: ${inv.message}`);
  }

  console.log(`\n── Summary ──`);
  console.log(`  All passed:        ${report.allPassed}`);
  console.log(`  Critical failures: ${report.criticalFailures}`);
  console.log(`  Warnings:          ${report.warnings}`);

  if (strict && report.criticalFailures > 0) {
    console.log(`\n✗ STRICT MODE: ${report.criticalFailures} critical failure(s) — exiting with code 1.`);
    console.log('  Fix critical issues before deploy.\n');
    process.exit(1);
  }

  if (report.criticalFailures > 0) {
    console.log(`\n⚠ WARN: ${report.criticalFailures} critical failure(s) detected (warn-only mode).`);
  }
  if (report.warnings > 0) {
    console.log(`  ${report.warnings} warning(s) — platform will operate in degraded mode.`);
  }
  if (report.allPassed) {
    console.log('\n✓ All readiness checks passed.');
  }
  console.log('');
  process.exit(0);
} catch (err) {
  console.error('Readiness check failed to execute:', err.message || err);
  if (strict) process.exit(1);
  process.exit(0);
}
