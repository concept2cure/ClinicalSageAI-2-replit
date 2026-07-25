/**
 * Risk-model deployed-outcome backtest (§16). Pure metrics + an END-TO-END read of
 * intelligence.risk_predictions via in-process PGlite.
 */

import { describe, it, expect, beforeAll, afterAll, beforeEach, vi } from 'vitest';
import { PGlite } from '@electric-sql/pglite';
import {
  brierScore, logLossScore, rocAuc, calibrationBins, evaluateBacktest, DEFAULT_THRESHOLDS,
  backtestRiskModel, type LabeledPrediction,
} from '../risk-model-backtest';

let pglite: PGlite;
const pool = {
  query: async (sql: string, params?: unknown[]) => {
    const r = await pglite.query(sql, params as unknown[]);
    return { rows: r.rows as unknown[], rowCount: (r as { affectedRows?: number }).affectedRows ?? (r.rows as unknown[]).length };
  },
};
vi.mock('../../../db/runtime', () => ({ pool: { query: (s: string, p?: unknown[]) => pool.query(s, p) } }));

// A cleanly separated, well-calibrated set: 20 positives at high p, 20 negatives at low p.
function separableRows(): LabeledPrediction[] {
  const rows: LabeledPrediction[] = [];
  for (let i = 0; i < 20; i++) rows.push({ p: 0.75 + (i % 5) * 0.04, y: 1 });
  for (let i = 0; i < 20; i++) rows.push({ p: 0.05 + (i % 5) * 0.04, y: 0 });
  return rows;
}

describe('pure metrics', () => {
  it('brierScore: perfect = 0, worst = 1, null on empty', () => {
    expect(brierScore([{ p: 1, y: 1 }, { p: 0, y: 0 }])).toBe(0);
    expect(brierScore([{ p: 0, y: 1 }])).toBe(1);
    expect(brierScore([])).toBeNull();
  });
  it('rocAuc: perfect separation = 1, single class = null', () => {
    expect(rocAuc(separableRows())).toBe(1);
    expect(rocAuc([{ p: 0.9, y: 1 }, { p: 0.8, y: 1 }])).toBeNull();
  });
  it('logLoss finite on a clean set; calibration bins land predictions in the right buckets', () => {
    expect(logLossScore(separableRows())!).toBeGreaterThan(0);
    const bins = calibrationBins([{ p: 0.05, y: 0 }, { p: 0.95, y: 1 }], 10);
    expect(bins.find((b) => b.bin === 0)!.observedRate).toBe(0);
    expect(bins.find((b) => b.bin === 9)!.observedRate).toBe(1);
  });
});

describe('evaluateBacktest gate', () => {
  it('passes a discriminating, well-calibrated, large-enough set', () => {
    const m = evaluateBacktest(separableRows(), 'crl');
    expect(m.passed).toBe(true);
    expect(m.sampleSize).toBe(40);
    expect(m.auc).toBe(1);
    expect(m.brier!).toBeLessThan(DEFAULT_THRESHOLDS.maxBrier);
    expect(m.baseRate).toBeCloseTo(0.5, 5);
  });
  it('fails an underpowered sample with a clear reason', () => {
    const m = evaluateBacktest([{ p: 0.9, y: 1 }, { p: 0.2, y: 0 }], 'crl');
    expect(m.passed).toBe(false);
    expect(m.reasons.join(' ')).toMatch(/insufficient outcomes/);
  });
  it('fails when only one outcome class is observed (AUC undefined)', () => {
    const oneClass = Array.from({ length: 40 }, () => ({ p: 0.6, y: 1 as const }));
    const m = evaluateBacktest(oneClass, 'crl');
    expect(m.passed).toBe(false);
    expect(m.auc).toBeNull();
    expect(m.reasons.join(' ')).toMatch(/one outcome class/);
  });
});

describe('backtestRiskModel (reads intelligence.risk_predictions via PGlite)', () => {
  beforeAll(async () => {
    pglite = new PGlite();
    await pglite.exec(`
      CREATE SCHEMA IF NOT EXISTS intelligence;
      CREATE TABLE intelligence.risk_predictions (
        id serial PRIMARY KEY, organization_id bigint NOT NULL, target text NOT NULL,
        predicted_prob double precision, observed_outcome boolean, observed_at timestamptz,
        created_at timestamptz NOT NULL DEFAULT now()
      );
    `);
  });
  afterAll(async () => { await pglite.close(); });
  beforeEach(async () => { await pglite.exec('DELETE FROM intelligence.risk_predictions;'); });

  it('backtests only landed outcomes, scoped by target', async () => {
    // 40 landed 'crl' rows (separable) + 5 still-pending (observed_outcome NULL) + noise on another target.
    for (const r of separableRows()) {
      await pglite.query(
        `INSERT INTO intelligence.risk_predictions (organization_id, target, predicted_prob, observed_outcome, observed_at)
         VALUES ($1,$2,$3,$4, now())`, [7, 'crl', r.p, r.y === 1]);
    }
    for (let i = 0; i < 5; i++) {
      await pglite.query(
        `INSERT INTO intelligence.risk_predictions (organization_id, target, predicted_prob, observed_outcome)
         VALUES ($1,$2,$3, NULL)`, [7, 'crl', 0.5]);
    }
    await pglite.query(
      `INSERT INTO intelligence.risk_predictions (organization_id, target, predicted_prob, observed_outcome, observed_at)
       VALUES ($1,$2,$3,$4, now())`, [7, 'rtf', 0.9, true]);

    const m = await backtestRiskModel({ target: 'crl' });
    expect(m.sampleSize).toBe(40);        // pending rows + other-target row excluded
    expect(m.passed).toBe(true);
    expect(m.auc).toBe(1);
    expect(m.target).toBe('crl');
  });

  it('returns a not-passed verdict (not a crash) when there are no landed outcomes', async () => {
    const m = await backtestRiskModel({ target: 'first_cycle_approval' });
    expect(m.sampleSize).toBe(0);
    expect(m.passed).toBe(false);
    expect(m.brier).toBeNull();
  });
});
