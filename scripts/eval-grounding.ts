/**
 * Grounding / hallucination evaluation runner.
 *
 * Runs the offline grounding eval harness over the curated fixture set and
 * prints a quality report: per-case pass/fail plus aggregate fabrication-
 * detection precision/recall/F1 and the mean grounding ratio. Exits non-zero if
 * any case fails or fabrication recall is below 1.0, so it can serve as a CI
 * quality gate and as a reproducible quality artifact for regulated buyers.
 *
 * Run: npx tsx scripts/eval-grounding.ts [--json]
 */
import { runGroundingEval } from '../server/services/evidence/grounding-eval.js';

const asJson = process.argv.includes('--json');
const report = runGroundingEval();

if (asJson) {
  console.log(JSON.stringify(report, null, 2));
} else {
  console.log('\nGrounding / hallucination evaluation');
  console.log('────────────────────────────────────');
  for (const c of report.cases) {
    const mark = c.passed ? 'PASS' : 'FAIL';
    const detail = `checked=${c.checked} grounded=${c.grounded} ratio=${c.ratio.toFixed(2)}` +
      (c.unsupportedKinds.length ? ` unsupported=[${c.unsupportedKinds.join(',')}]` : '');
    console.log(`  [${mark}] ${c.category} · ${c.name} — ${detail}`);
    for (const n of c.notes) console.log(`         ${n}`);
  }
  const f = report.fabrication;
  console.log('────────────────────────────────────');
  console.log(`  Cases: ${report.passed}/${report.total} passed (${(report.passRate * 100).toFixed(0)}%)`);
  console.log(
    `  Fabrication detection — precision ${f.precision.toFixed(2)}, recall ${f.recall.toFixed(2)}, F1 ${f.f1.toFixed(2)} ` +
      `(TP ${f.truePositive}, FP ${f.falsePositive}, FN ${f.falseNegative}, TN ${f.trueNegative})`
  );
  console.log(`  Mean grounding ratio (grounded cases): ${report.meanGroundingRatio.toFixed(2)}`);
  console.log('');
}

const ok = report.failed === 0 && report.fabrication.recall === 1;
if (!ok) {
  console.error(`Grounding eval FAILED: ${report.failed} case(s) failed, recall ${report.fabrication.recall.toFixed(2)}.`);
  process.exit(1);
}
