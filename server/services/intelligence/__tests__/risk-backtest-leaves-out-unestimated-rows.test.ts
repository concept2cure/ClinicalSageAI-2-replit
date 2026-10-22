/**
 * The deployed-model backtest scores only predictions something produced.
 *
 * Until 2026-10-15 a cold start (no trained model, no network prior) was
 * persisted to intelligence.risk_predictions as predicted_prob 0.5 with no
 * model_version_id and no network_prior_prob. backtestRiskModel read those rows
 * back as the deployed model's predictions, so a constant nobody estimated was
 * scored for calibration and discrimination. Such rows remain in databases that
 * ran before the fix; the backtest now leaves them out. Real DDL on PGlite.
 */

import { describe, it, expect, beforeAll, afterAll, beforeEach, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { PGlite } from '@electric-sql/pglite';

let pglite: PGlite;
vi.mock('../../../db/runtime', () => ({
  pool: {
    query: async (sql: string, params?: unknown[]) => {
      const r = await pglite.query(sql, params as unknown[]);
      return { rows: r.rows as unknown[], rowCount: (r.rows as unknown[]).length };
    },
  },
}));

const { backtestRiskModel } = await import('../risk-model-backtest');

const ROOT = join(__dirname, '..', '..', '..', '..');
const MODEL = '11111111-1111-4111-8111-111111111111';

/** 20 positives at high p and 20 negatives at low p: a cleanly separated model. */
function separable(): Array<{ p: number; y: boolean }> {
  const rows: Array<{ p: number; y: boolean }> = [];
  for (let i = 0; i < 20; i++) rows.push({ p: 0.75 + (i % 5) * 0.04, y: true });
  for (let i = 0; i < 20; i++) rows.push({ p: 0.05 + (i % 5) * 0.04, y: false });
  return rows;
}

beforeAll(async () => {
  pglite = new PGlite();
  const ddl = readFileSync(join(ROOT, 'db/migrations/20260520_regulatory_intelligence_layer.sql'), 'utf8');
  const grab = (table: string) => {
    const m = [...ddl.matchAll(/CREATE TABLE IF NOT EXISTS intelligence\.([a-z_]+) \([\s\S]*?\n\);/g)]
      .find(match => match[1] === table);
    if (!m) throw new Error(`DDL for ${table} not found`);
    return m[0];
  };
  await pglite.exec(`CREATE SCHEMA IF NOT EXISTS intelligence;\n${grab('risk_model_versions')}\n${grab('risk_predictions')}`);
  await pglite.query(
    `INSERT INTO intelligence.risk_model_versions (id, target, algorithm, feature_names, weights, sample_size, trained_at, is_active)
     VALUES ($1, 'rtf', 'logistic_regression', '{}', '{}'::jsonb, 60, NOW(), TRUE)`,
    [MODEL],
  );
}, 60_000);

afterAll(async () => {
  await pglite?.close();
});

beforeEach(async () => {
  await pglite.exec('DELETE FROM intelligence.risk_predictions;');
});

async function insert(row: { p: number; y: boolean; model: string | null; prior: number | null }) {
  await pglite.query(
    `INSERT INTO intelligence.risk_predictions
       (organization_id, target, features, predicted_prob, model_version_id, network_prior_prob, observed_outcome, observed_at)
     VALUES (7, 'rtf', '{}'::jsonb, $1, $2, $3, $4, NOW())`,
    [row.p, row.model, row.prior, row.y],
  );
}

describe('backtestRiskModel', () => {
  it('leaves out rows no model and no prior produced (the old cold-start 0.5)', async () => {
    for (const r of separable()) await insert({ ...r, model: MODEL, prior: null });
    // Ten pre-fix cold-start rows: 0.5 with nothing behind it, all of them wrong half the time.
    for (let i = 0; i < 10; i++) await insert({ p: 0.5, y: i % 2 === 0, model: null, prior: null });

    const m = await backtestRiskModel({ target: 'rtf' });
    expect(m.sampleSize).toBe(40);
    expect(m.calibration.find((b) => b.lower === 0.5)).toBeUndefined();
  });

  it('keeps a network-prior prediction: a prior did produce it', async () => {
    for (const r of separable()) await insert({ ...r, model: null, prior: r.p });
    const m = await backtestRiskModel({ target: 'rtf' });
    expect(m.sampleSize).toBe(40);
  });
});
