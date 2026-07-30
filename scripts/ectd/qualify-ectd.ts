/**
 * eCTD qualification runner (CLI).
 *
 * Runs the qualification harness for eCTD v3.2.2 (FDA/EMA/PMDA/HC) and v4.0
 * (FDA HL7 RPS): generates golden packages, runs the accepted validators
 * (xmllint well-formedness/DTD, the FDA-criteria subset, the configured
 * external eValidator when present, and the RPS model validator), reopens each
 * ZIP to re-verify every checksum, exercises a lifecycle sequence, and writes
 * JSON reports recording the exact spec version qualified against.
 *
 * Usage:
 *   npm run qualify:ectd                 # all regions, v3 + v4
 *   ECTD_REQUIRE_DTD=true npm run qualify:ectd   # once DTDs are vendored, DTD-validate too
 *   EVALIDATOR_USE_FDA_CRITERIA_FALLBACK=true npm run qualify:ectd
 *
 * Reports land in ./qualification-reports/ (gitignored).
 *
 * @module scripts/ectd/qualify-ectd
 */

import { runQualification } from '../../server/services/ectd/qualification';

async function main(): Promise<void> {
  const summary = await runQualification({ ranAt: new Date().toISOString() });

  // eslint-disable-next-line no-console
  console.log(`\neCTD qualification — ${summary.ranAt}`);
  // eslint-disable-next-line no-console
  console.log(`Reports: ${summary.reportDir}\n`);

  for (const r of summary.reports) {
    const mark = r.passed ? 'PASS' : 'FAIL';
    // eslint-disable-next-line no-console
    console.log(`[${mark}] ${r.id}  (${r.region.toUpperCase()} ${r.version})`);
    for (const v of r.validators) {
      const vm = v.ran ? (v.passed ? 'ok' : `${v.errorCount} error(s)`) : 'skipped';
      // eslint-disable-next-line no-console
      console.log(`        · ${v.name}: ${vm}`);
    }
    // eslint-disable-next-line no-console
    console.log(`        · checksums: ${r.checksum.filesChecked} verified, ${r.checksum.mismatches.length} mismatch(es)`);
    // eslint-disable-next-line no-console
    console.log(`        · lifecycle (${r.lifecycle.operations.join('/')}): ${r.lifecycle.nextPackagePassed ? 'ok' : 'FAILED'}`);
  }

  // eslint-disable-next-line no-console
  console.log(`\nOverall: ${summary.passed ? 'PASS' : 'FAIL'}\n`);
  process.exit(summary.passed ? 0 : 1);
}

main().catch((err) => {
  // eslint-disable-next-line no-console
  console.error('Qualification run failed:', err);
  process.exit(1);
});
