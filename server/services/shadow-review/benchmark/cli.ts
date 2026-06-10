/**
 * RTF Benchmark CLI (WO-8) — run the benchmark as a product artifact.
 *
 *   npm run benchmark:rtf
 *
 * Trains the existing RTF risk model on the criteria-grounded dataset, evaluates
 * a held-out split, prints the report, and exits non-zero if the model fails to
 * recover the administrative gate (so it doubles as a CI quality gate).
 */

import { runRtfBenchmark, formatBenchmarkReport } from './run-rtf-benchmark.js';
import { RTF_BENCHMARK_PROVENANCE } from './rtf-benchmark-dataset.js';

// Floors: the model must recover the documented gate. These are deliberately
// strict because the labels are a deterministic function of the public criteria.
const FLOORS = { recall: 0.8, precision: 0.7, f1: 0.75 };

function main(): void {
  const metrics = runRtfBenchmark();
  // eslint-disable-next-line no-console
  console.log('\n' + formatBenchmarkReport(metrics) + '\n');
  // eslint-disable-next-line no-console
  console.log(`provenance: ${RTF_BENCHMARK_PROVENANCE.name} v${RTF_BENCHMARK_PROVENANCE.version} ` +
    `(licensed=${RTF_BENCHMARK_PROVENANCE.licensed}, criteria-grounded=${RTF_BENCHMARK_PROVENANCE.syntheticButCriteriaGrounded})`);

  const failures: string[] = [];
  if (metrics.recall < FLOORS.recall) failures.push(`recall ${metrics.recall} < ${FLOORS.recall}`);
  if (metrics.precision < FLOORS.precision) failures.push(`precision ${metrics.precision} < ${FLOORS.precision}`);
  if (metrics.f1 < FLOORS.f1) failures.push(`F1 ${metrics.f1} < ${FLOORS.f1}`);

  if (failures.length > 0) {
    // eslint-disable-next-line no-console
    console.error(`\nRTF benchmark FAILED: ${failures.join('; ')}\n`);
    process.exit(1);
  }
  // eslint-disable-next-line no-console
  console.log('\nRTF benchmark PASSED — the model recovers the administrative gate.\n');
}

main();
