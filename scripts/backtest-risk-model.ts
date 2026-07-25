/**
 * Deployed-outcome backtest CLI (§16 governance eval).
 *
 * Backtests the LIVE risk model against realized outcomes in
 * intelligence.risk_predictions (observed_outcome). Complements the train-time holdout
 * gate (risk-model.trainModel refuses a model that doesn't improve holdout log-loss) by
 * checking how the DEPLOYED model actually calibrates/discriminates once outcomes land.
 *
 * Requires a reachable DB. Exits non-zero only when a target has enough landed outcomes
 * to judge (>= the min-sample threshold) AND fails the gate — absence of outcomes is not
 * a failure. Add `--json` for machine-readable output.
 *
 *   npm run eval:risk-backtest            # human-readable
 *   npm run eval:risk-backtest -- --json  # JSON
 */

import { backtestRiskModel, DEFAULT_THRESHOLDS, type BacktestMetrics } from '../server/services/intelligence/risk-model-backtest.js';

const TARGETS = ['rtf', 'crl', 'first_cycle_approval'] as const;
const asJson = process.argv.includes('--json');

async function main(): Promise<void> {
  const results: BacktestMetrics[] = [];
  for (const t of TARGETS) results.push(await backtestRiskModel({ target: t }));

  if (asJson) {
    console.info(JSON.stringify(results, null, 2));
  } else {
    for (const m of results) {
      console.info(
        m.sampleSize === 0
          ? `${m.target}: no landed outcomes yet`
          : `${m.target}: n=${m.sampleSize} base=${m.baseRate?.toFixed(2) ?? 'n/a'} ` +
            `AUC=${m.auc?.toFixed(3) ?? 'n/a'} Brier=${m.brier?.toFixed(3) ?? 'n/a'} → ${m.passed ? 'PASS' : 'FAIL'}`,
      );
      if (!m.passed && m.sampleSize > 0) for (const r of m.reasons) console.info(`   - ${r}`);
    }
  }

  // Hard-fail only once a target is powered enough to judge (>= min samples) and fails.
  const poweredFailures = results.filter((m) => !m.passed && m.sampleSize >= DEFAULT_THRESHOLDS.minSamples);
  if (poweredFailures.length > 0) {
    console.error(`\n${poweredFailures.length} target(s) failed the deployed-outcome backtest.`);
    process.exit(1);
  }
  if (results.every((m) => m.sampleSize === 0)) {
    console.info('\nNo landed outcomes to backtest yet — nothing to gate.');
  }
  process.exit(0);
}

main().catch((e: unknown) => {
  console.error('backtest failed:', e instanceof Error ? e.message : e);
  process.exit(1);
});
