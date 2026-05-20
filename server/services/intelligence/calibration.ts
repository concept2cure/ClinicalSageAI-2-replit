/**
 * Confidence calibration — re-maps AnA's self-reported confidence to a
 * calibrated probability per (agency × document_type × intent) bucket.
 *
 * Method: Platt scaling. Fit a logistic curve `calibrated = sigmoid(a + b * raw)`
 * to observed (raw_confidence, was_failure) pairs. When AnA says "I'm 90%
 * sure" but is wrong 30% of the time on EMA CMC drafts, the calibrator
 * learns to report ~70% instead.
 *
 * The fit is closed-form gradient descent over the logistic NLL — same
 * routine as the risk model, but on a much smaller (per-bucket) sample.
 * For undertrained buckets (n < MIN_SAMPLES) we return the raw confidence
 * unchanged so the calibration doesn't add noise.
 *
 * @module server/services/intelligence/calibration
 */

import { pool } from '../../db/runtime.js';
import { createScopedLogger } from '../../utils/logger.js';
import {
  binAgencyForInteraction,
  binDocumentType,
  binIntent,
  type Agency,
  type DocumentType,
  type IntentClass,
} from './ana-failure-learning.js';

const log = createScopedLogger('calibration');

export const CALIBRATION_VERSION = '1.0.0';
export const MIN_SAMPLES_FOR_CALIBRATION = 30;
export const MAX_EPOCHS = 200;
export const LEARNING_RATE = 0.1;

// ─── Pure math (testable without DB) ─────────────────────────────────────────

function sigmoid(z: number): number {
  if (z >= 0) {
    const e = Math.exp(-z);
    return 1 / (1 + e);
  }
  const e = Math.exp(z);
  return e / (1 + e);
}

/**
 * Fit Platt scaling to (raw, label) pairs. Returns { a, b } such that
 * `calibrated = sigmoid(a + b * raw)`.
 *
 * When inputs are degenerate (no variance, all same label), returns
 * a = logit(positive_rate), b = 0 — i.e., ignore the raw signal.
 */
export function fitPlatt(
  pairs: ReadonlyArray<{ raw: number; label: boolean }>,
  opts: { maxEpochs?: number; learningRate?: number } = {},
): { a: number; b: number } {
  if (pairs.length === 0) return { a: 0, b: 1 };
  const positives = pairs.reduce((acc, p) => acc + (p.label ? 1 : 0), 0);
  const rate = positives / pairs.length;
  // Cold-start: intercept at log-odds of base rate, slope at 1.
  let a = Math.log(Math.max(0.001, Math.min(0.999, rate)) / Math.max(0.001, 1 - Math.min(0.999, rate)));
  let b = 1;

  // If labels have no variance, gradient is zero — return prior immediately.
  if (positives === 0 || positives === pairs.length) {
    return { a, b: 0 };
  }

  const epochs = opts.maxEpochs ?? MAX_EPOCHS;
  const lr = opts.learningRate ?? LEARNING_RATE;

  for (let epoch = 0; epoch < epochs; epoch++) {
    let gradA = 0;
    let gradB = 0;
    for (const p of pairs) {
      const pred = sigmoid(a + b * p.raw);
      const err = pred - (p.label ? 1 : 0);
      gradA += err;
      gradB += err * p.raw;
    }
    a -= (lr * gradA) / pairs.length;
    b -= (lr * gradB) / pairs.length;
  }

  return { a, b };
}

export function applyPlatt(raw: number, a: number, b: number): number {
  if (!Number.isFinite(raw)) return Number.NaN;
  return sigmoid(a + b * Math.max(0, Math.min(1, raw)));
}

/**
 * Compute Brier score (mean squared error of calibrated vs actual).
 */
export function brierScore(
  pairs: ReadonlyArray<{ raw: number; label: boolean }>,
  a: number,
  b: number,
): number {
  if (pairs.length === 0) return 0;
  let sum = 0;
  for (const p of pairs) {
    const c = applyPlatt(p.raw, a, b);
    const y = p.label ? 1 : 0;
    sum += (c - y) ** 2;
  }
  return sum / pairs.length;
}

export function logLoss(
  pairs: ReadonlyArray<{ raw: number; label: boolean }>,
  a: number,
  b: number,
): number {
  if (pairs.length === 0) return 0;
  let sum = 0;
  for (const p of pairs) {
    const c = Math.min(0.999999, Math.max(0.000001, applyPlatt(p.raw, a, b)));
    const y = p.label ? 1 : 0;
    sum += -(y * Math.log(c) + (1 - y) * Math.log(1 - c));
  }
  return sum / pairs.length;
}

// ─── DB-backed recompute / serve ─────────────────────────────────────────────

interface BucketRow {
  agency: Agency;
  document_type: DocumentType;
  intent_class: IntentClass;
  pairs: Array<{ raw: number; label: boolean }>;
}

async function fetchBuckets(lookbackDays: number): Promise<BucketRow[]> {
  const result = await pool.query<{
    agency: Agency;
    document_type: DocumentType;
    intent_class: IntentClass;
    raw: number | null;
    failure: boolean;
  }>(
    `SELECT agency, document_type, intent_class,
            ana_confidence AS raw,
            outcome <> 'accepted' AS failure
       FROM intelligence.ana_interactions
      WHERE ana_confidence IS NOT NULL
        AND recorded_at > NOW() - ($1 || ' days')::interval`,
    [String(lookbackDays)],
  );

  const map = new Map<string, BucketRow>();
  for (const r of result.rows) {
    if (r.raw == null) continue;
    const key = `${r.agency}|${r.document_type}|${r.intent_class}`;
    let bucket = map.get(key);
    if (!bucket) {
      bucket = { agency: r.agency, document_type: r.document_type, intent_class: r.intent_class, pairs: [] };
      map.set(key, bucket);
    }
    bucket.pairs.push({ raw: r.raw, label: r.failure });
  }
  return Array.from(map.values());
}

export interface RecomputeOptions {
  readonly lookbackDays?: number;
  readonly minSamples?: number;
}

export interface RecomputeResult {
  readonly evaluated: number;
  readonly updated: number;
  readonly skipped: number;
}

export async function recomputeCalibration(opts: RecomputeOptions = {}): Promise<RecomputeResult> {
  const lookback = opts.lookbackDays ?? 180;
  const minSamples = opts.minSamples ?? MIN_SAMPLES_FOR_CALIBRATION;
  const buckets = await fetchBuckets(lookback);

  let evaluated = 0;
  let updated = 0;
  let skipped = 0;

  for (const b of buckets) {
    evaluated += 1;
    if (b.pairs.length < minSamples) {
      skipped += 1;
      continue;
    }
    const { a, b: slope } = fitPlatt(b.pairs);
    const brier = brierScore(b.pairs, a, slope);
    const ll = logLoss(b.pairs, a, slope);
    const positives = b.pairs.filter(p => p.label).length;
    const meanRaw = b.pairs.reduce((acc, p) => acc + p.raw, 0) / b.pairs.length;
    const meanObs = positives / b.pairs.length;

    await pool.query(
      `INSERT INTO intelligence.calibration_buckets (
         agency, document_type, intent_class,
         sample_size, positive_count, mean_raw_confidence, mean_observed,
         platt_a, platt_b, brier, log_loss, recomputed_at
       ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, NOW())
       ON CONFLICT (agency, document_type, intent_class) DO UPDATE SET
         sample_size = EXCLUDED.sample_size,
         positive_count = EXCLUDED.positive_count,
         mean_raw_confidence = EXCLUDED.mean_raw_confidence,
         mean_observed = EXCLUDED.mean_observed,
         platt_a = EXCLUDED.platt_a,
         platt_b = EXCLUDED.platt_b,
         brier = EXCLUDED.brier,
         log_loss = EXCLUDED.log_loss,
         recomputed_at = NOW()`,
      [
        b.agency, b.document_type, b.intent_class,
        b.pairs.length, positives, meanRaw, meanObs,
        a, slope, brier, ll,
      ],
    );
    updated += 1;
  }
  if (updated > 0) log.info(`Calibration recomputed: evaluated=${evaluated} updated=${updated} skipped=${skipped}`);
  return { evaluated, updated, skipped };
}

/**
 * Re-map a raw AnA confidence to a calibrated probability. Falls back to
 * the raw value when no calibrated bucket exists for the tuple.
 */
export async function calibrateConfidence(params: {
  rawConfidence: number;
  agency: string;
  documentType: string;
  intent: string;
}): Promise<{ calibrated: number; source: 'calibrated' | 'raw_passthrough'; sampleSize: number }> {
  const agency = binAgencyForInteraction(params.agency);
  const documentType = binDocumentType(params.documentType);
  const intent = binIntent(params.intent);

  const result = await pool.query(
    `SELECT platt_a, platt_b, sample_size
       FROM intelligence.calibration_buckets
      WHERE agency = $1 AND document_type = $2 AND intent_class = $3`,
    [agency, documentType, intent],
  );
  if (result.rows.length === 0) {
    return { calibrated: params.rawConfidence, source: 'raw_passthrough', sampleSize: 0 };
  }
  const r = result.rows[0];
  return {
    calibrated: applyPlatt(params.rawConfidence, parseFloat(r.platt_a), parseFloat(r.platt_b)),
    source: 'calibrated',
    sampleSize: r.sample_size,
  };
}

export async function getCalibrationStats(): Promise<Array<{
  agency: string;
  documentType: string;
  intent: string;
  sampleSize: number;
  brier: number | null;
  logLoss: number | null;
  plattA: number;
  plattB: number;
  meanRaw: number | null;
  meanObserved: number | null;
}>> {
  const result = await pool.query(
    `SELECT agency, document_type, intent_class,
            sample_size, brier, log_loss, platt_a, platt_b,
            mean_raw_confidence, mean_observed
       FROM intelligence.calibration_buckets
      ORDER BY sample_size DESC`,
  );
  return result.rows.map(r => ({
    agency: r.agency,
    documentType: r.document_type,
    intent: r.intent_class,
    sampleSize: r.sample_size,
    brier: r.brier == null ? null : parseFloat(r.brier),
    logLoss: r.log_loss == null ? null : parseFloat(r.log_loss),
    plattA: parseFloat(r.platt_a),
    plattB: parseFloat(r.platt_b),
    meanRaw: r.mean_raw_confidence == null ? null : parseFloat(r.mean_raw_confidence),
    meanObserved: r.mean_observed == null ? null : parseFloat(r.mean_observed),
  }));
}
