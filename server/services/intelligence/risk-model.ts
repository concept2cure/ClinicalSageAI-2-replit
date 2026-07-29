/**
 * Predictive CRL/RTF risk model.
 *
 * Pure-TypeScript logistic regression trained on observed submission outcomes.
 * Three targets are supported in parallel: `rtf` (refuse-to-file), `crl`
 * (complete-response letter), and `first_cycle_approval`. Each gets its own
 * versioned weight set stored in `intelligence.risk_model_versions`.
 *
 * Cold-start: when no model has converged for a target yet (sample size below
 * `MIN_TRAIN_SAMPLES`), `predict()` returns the network prior from
 * `intelligence.network_risk_priors` blended at full weight. As the local
 * sample grows, the blend tilts toward the trained model. This is the loop
 * that compounds — the more outcomes flow in, the sharper predictions get.
 *
 * Training:
 *   - Standard gradient descent on the logistic NLL.
 *   - L2 regularization to keep coefficients bounded.
 *   - Holdout split for AUC + Brier; falls back gracefully on tiny samples.
 *   - Refuses to mark a new version active if it regresses on log-loss.
 *
 * The serving path is hot (called per draft validation). It reads weights
 * once, caches them in-process, and invalidates on `markActive` so the next
 * predict picks up the new version without a restart.
 *
 * @module server/services/intelligence/risk-model
 */

import { pool } from '../../db/runtime.js';
import { createScopedLogger } from '../../utils/logger.js';

const log = createScopedLogger('risk-model');

export const RISK_MODEL_VERSION = '1.0.0';
export const MIN_TRAIN_SAMPLES = 30;
export const HOLDOUT_FRACTION = 0.2;
export const DEFAULT_L2 = 0.5;
export const DEFAULT_LEARNING_RATE = 0.1;
export const DEFAULT_MAX_EPOCHS = 400;

export type RiskTarget = 'rtf' | 'crl' | 'first_cycle_approval';

export interface FeatureMap {
  readonly [feature: string]: number;
}

export interface RiskModelWeights {
  readonly target: RiskTarget;
  readonly featureNames: readonly string[];
  readonly weights: { readonly [feature: string]: number; readonly intercept: number };
  readonly versionId: string;
  readonly sampleSize: number;
  readonly positiveRate: number;
  readonly logLoss: number | null;
  readonly auc: number | null;
  readonly brier: number | null;
  readonly trainedAt: string;
}

export interface RiskPrediction {
  readonly target: RiskTarget;
  readonly probability: number;
  readonly modelVersionId: string | null;
  readonly source: 'trained_model' | 'network_prior' | 'blended' | 'cold_start';
  readonly localWeight: number;       // weight given to the trained model in the blend
  readonly priorWeight: number;       // weight given to the network prior
  readonly priorProbability: number | null;
  readonly sampleSize: number;
}

export interface TrainOptions {
  readonly target: RiskTarget;
  readonly l2?: number;
  readonly learningRate?: number;
  readonly maxEpochs?: number;
  readonly markActive?: boolean;
  readonly minImprovementToActivate?: number;
}

export interface TrainResult {
  readonly target: RiskTarget;
  readonly versionId: string | null;
  readonly trained: boolean;
  readonly reason?: string;
  readonly sampleSize: number;
  readonly logLoss: number | null;
  readonly auc: number | null;
  readonly brier: number | null;
  readonly weights: RiskModelWeights | null;
}

// ─── Cache ───────────────────────────────────────────────────────────────────

interface CacheEntry {
  readonly value: RiskModelWeights | null;
  readonly loadedAt: number;
}

const ACTIVE_MODEL_CACHE = new Map<RiskTarget, CacheEntry>();
const CACHE_TTL_MS = 60_000;

function invalidateCache(target?: RiskTarget): void {
  if (target) ACTIVE_MODEL_CACHE.delete(target);
  else ACTIVE_MODEL_CACHE.clear();
}

// ─── Pure math (kept side-effect free for testability) ───────────────────────

export function sigmoid(z: number): number {
  if (z >= 0) {
    const e = Math.exp(-z);
    return 1 / (1 + e);
  }
  const e = Math.exp(z);
  return e / (1 + e);
}

export function dot(features: FeatureMap, weights: { [k: string]: number; intercept: number }, featureNames: readonly string[]): number {
  let z = weights.intercept;
  for (const name of featureNames) {
    const v = features[name];
    if (Number.isFinite(v)) z += weights[name] * (v as number);
  }
  return z;
}

export function scoreWithWeights(features: FeatureMap, model: RiskModelWeights): number {
  return sigmoid(dot(features, model.weights as any, model.featureNames));
}

/**
 * Train a logistic regression on the given (features, label) pairs.
 *
 * Pure function — no DB writes. Returns the trained coefficients plus
 * holdout metrics. Caller decides whether to persist & mark active.
 */
export function trainLogistic(
  samples: ReadonlyArray<{ features: FeatureMap; label: boolean }>,
  featureNames: readonly string[],
  opts: { l2?: number; learningRate?: number; maxEpochs?: number; holdoutFraction?: number } = {},
): {
  weights: { [k: string]: number; intercept: number };
  logLoss: number | null;
  auc: number | null;
  brier: number | null;
  sampleSize: number;
  positiveRate: number;
} {
  if (samples.length === 0) {
    return {
      weights: { intercept: 0, ...Object.fromEntries(featureNames.map(n => [n, 0])) } as any,
      logLoss: null,
      auc: null,
      brier: null,
      sampleSize: 0,
      positiveRate: 0,
    };
  }

  const l2 = opts.l2 ?? DEFAULT_L2;
  const lr = opts.learningRate ?? DEFAULT_LEARNING_RATE;
  const maxEpochs = opts.maxEpochs ?? DEFAULT_MAX_EPOCHS;
  const holdout = opts.holdoutFraction ?? HOLDOUT_FRACTION;

  // Deterministic shuffle for reproducible holdout. Mulberry32.
  const ordered = samples.map((s, i) => ({ ...s, _ix: i }));
  let seed = 0xC0FFEE;
  function rand(): number {
    seed |= 0; seed = (seed + 0x6D2B79F5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  }
  for (let i = ordered.length - 1; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1));
    [ordered[i], ordered[j]] = [ordered[j], ordered[i]];
  }

  const cutoff = Math.max(1, Math.floor(ordered.length * (1 - holdout)));
  const train = ordered.slice(0, cutoff);
  const test = ordered.slice(cutoff);

  // Initialize weights to 0; intercept to log-odds of base rate so we start
  // calibrated to the prior.
  const positives = train.reduce((acc, s) => acc + (s.label ? 1 : 0), 0);
  const baseRate = positives / Math.max(1, train.length);
  const safeRate = Math.min(0.999, Math.max(0.001, baseRate));
  const weights: { [k: string]: number; intercept: number } = {
    intercept: Math.log(safeRate / (1 - safeRate)),
  } as any;
  for (const name of featureNames) weights[name] = 0;

  // Gradient descent.
  for (let epoch = 0; epoch < maxEpochs; epoch++) {
    const grad: { [k: string]: number; intercept: number } = { intercept: 0 } as any;
    for (const name of featureNames) grad[name] = 0;

    for (const sample of train) {
      const p = sigmoid(dot(sample.features, weights, featureNames));
      const err = p - (sample.label ? 1 : 0);
      grad.intercept += err;
      for (const name of featureNames) {
        const v = sample.features[name];
        if (Number.isFinite(v)) grad[name] += err * (v as number);
      }
    }

    const n = train.length;
    weights.intercept -= (lr * grad.intercept) / n;
    for (const name of featureNames) {
      // L2 regularization (not applied to intercept).
      weights[name] -= (lr * (grad[name] / n + l2 * weights[name]));
    }
  }

  // Holdout metrics.
  const evalSet = test.length > 0 ? test : train;
  let ll = 0;
  let brier = 0;
  const preds: Array<{ p: number; y: number }> = [];
  for (const sample of evalSet) {
    const p = sigmoid(dot(sample.features, weights, featureNames));
    const y = sample.label ? 1 : 0;
    const pClamped = Math.min(0.999999, Math.max(0.000001, p));
    ll += -(y * Math.log(pClamped) + (1 - y) * Math.log(1 - pClamped));
    brier += (p - y) ** 2;
    preds.push({ p, y });
  }
  ll /= evalSet.length;
  brier /= evalSet.length;

  // AUC via Mann-Whitney U.
  const pos = preds.filter(x => x.y === 1).map(x => x.p);
  const neg = preds.filter(x => x.y === 0).map(x => x.p);
  let auc: number | null = null;
  if (pos.length > 0 && neg.length > 0) {
    let wins = 0;
    for (const a of pos) for (const b of neg) {
      if (a > b) wins += 1;
      else if (a === b) wins += 0.5;
    }
    auc = wins / (pos.length * neg.length);
  }

  return {
    weights,
    logLoss: Number.isFinite(ll) ? ll : null,
    auc,
    brier: Number.isFinite(brier) ? brier : null,
    sampleSize: samples.length,
    positiveRate: positives / Math.max(1, train.length),
  };
}

// ─── DB access ───────────────────────────────────────────────────────────────

async function fetchActiveModel(target: RiskTarget): Promise<RiskModelWeights | null> {
  const result = await pool.query(
    `SELECT id, target, feature_names, weights, sample_size, positive_rate,
            log_loss, auc, calibration_brier, trained_at
       FROM intelligence.risk_model_versions
      WHERE target = $1 AND is_active = TRUE
      ORDER BY trained_at DESC
      LIMIT 1`,
    [target],
  );
  if (result.rows.length === 0) return null;
  const r = result.rows[0];
  return {
    target,
    featureNames: r.feature_names,
    weights: r.weights,
    versionId: r.id,
    sampleSize: r.sample_size,
    positiveRate: parseFloat(r.positive_rate ?? '0'),
    logLoss: r.log_loss === null ? null : parseFloat(r.log_loss),
    auc: r.auc === null ? null : parseFloat(r.auc),
    brier: r.calibration_brier === null ? null : parseFloat(r.calibration_brier),
    trainedAt: typeof r.trained_at === 'string' ? r.trained_at : r.trained_at?.toISOString?.() ?? '',
  };
}

export async function getActiveModel(target: RiskTarget): Promise<RiskModelWeights | null> {
  const cached = ACTIVE_MODEL_CACHE.get(target);
  if (cached && Date.now() - cached.loadedAt < CACHE_TTL_MS) {
    return cached.value;
  }
  const value = await fetchActiveModel(target);
  ACTIVE_MODEL_CACHE.set(target, { value, loadedAt: Date.now() });
  return value;
}

/**
 * Score a single feature vector against the active model, blending in a
 * network prior when the local model is undertrained.
 *
 * Blend rule: localWeight = min(1, sampleSize / MIN_TRAIN_SAMPLES * 4). Until
 * the model has seen ~4× the training-floor sample, the prior keeps anchoring
 * the prediction. Beyond that, the local model dominates.
 */
export async function predict(params: {
  target: RiskTarget;
  features: FeatureMap;
  networkPrior?: number | null;
}): Promise<RiskPrediction> {
  const { target, features } = params;
  const prior = params.networkPrior ?? null;
  const model = await getActiveModel(target);

  if (!model) {
    return {
      target,
      probability: prior ?? 0.5,
      modelVersionId: null,
      source: prior === null ? 'cold_start' : 'network_prior',
      localWeight: 0,
      priorWeight: prior === null ? 0 : 1,
      priorProbability: prior,
      sampleSize: 0,
    };
  }

  const localProb = scoreWithWeights(features, model);
  if (prior === null) {
    return {
      target,
      probability: localProb,
      modelVersionId: model.versionId,
      source: 'trained_model',
      localWeight: 1,
      priorWeight: 0,
      priorProbability: null,
      sampleSize: model.sampleSize,
    };
  }

  const localWeight = Math.min(1, model.sampleSize / Math.max(1, MIN_TRAIN_SAMPLES * 4));
  const priorWeight = 1 - localWeight;
  const blended = localWeight * localProb + priorWeight * prior;
  return {
    target,
    probability: blended,
    modelVersionId: model.versionId,
    source: 'blended',
    localWeight,
    priorWeight,
    priorProbability: prior,
    sampleSize: model.sampleSize,
  };
}

// ─── Training pipeline (DB-backed) ───────────────────────────────────────────

interface TrainingRow {
  features: FeatureMap;
  label: boolean;
}

async function fetchTrainingSet(target: RiskTarget): Promise<{ rows: TrainingRow[]; featureNames: string[] }> {
  const result = await pool.query(
    `SELECT features, label_rtf, label_crl, label_first_cycle
       FROM intelligence.outcome_feature_vectors
      ORDER BY extracted_at DESC
      LIMIT 5000`,
  );

  const rows: TrainingRow[] = [];
  const featureNameSet = new Set<string>();
  for (const r of result.rows) {
    const features: FeatureMap = r.features ?? {};
    for (const k of Object.keys(features)) featureNameSet.add(k);
    let label: boolean;
    switch (target) {
      case 'rtf': label = !!r.label_rtf; break;
      case 'crl': label = !!r.label_crl; break;
      case 'first_cycle_approval': label = !!r.label_first_cycle; break;
    }
    rows.push({ features, label });
  }
  return { rows, featureNames: Array.from(featureNameSet).sort() };
}

export async function trainModel(opts: TrainOptions): Promise<TrainResult> {
  const target = opts.target;
  const { rows, featureNames } = await fetchTrainingSet(target);

  if (rows.length < MIN_TRAIN_SAMPLES) {
    return {
      target,
      versionId: null,
      trained: false,
      reason: `insufficient_samples (${rows.length} < ${MIN_TRAIN_SAMPLES})`,
      sampleSize: rows.length,
      logLoss: null,
      auc: null,
      brier: null,
      weights: null,
    };
  }

  if (featureNames.length === 0) {
    return {
      target,
      versionId: null,
      trained: false,
      reason: 'no_features_observed',
      sampleSize: rows.length,
      logLoss: null,
      auc: null,
      brier: null,
      weights: null,
    };
  }

  const trained = trainLogistic(rows, featureNames, {
    l2: opts.l2,
    learningRate: opts.learningRate,
    maxEpochs: opts.maxEpochs,
  });

  // Compare against previous active version to decide whether to activate.
  const previous = await getActiveModel(target);
  const minImprovement = opts.minImprovementToActivate ?? 0;
  let shouldActivate = opts.markActive ?? true;
  let reason: string | undefined;
  if (shouldActivate && previous?.logLoss != null && trained.logLoss != null) {
    if (trained.logLoss > previous.logLoss - minImprovement) {
      shouldActivate = false;
      reason = `no_improvement (new log_loss=${trained.logLoss.toFixed(4)} vs active=${previous.logLoss.toFixed(4)})`;
    }
  }

  const insert = await pool.query(
    `INSERT INTO intelligence.risk_model_versions (
       target, algorithm, feature_names, weights, sample_size, positive_rate,
       log_loss, auc, calibration_brier, trained_at, trained_by, is_active, notes
     ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, NOW(), $10, FALSE, $11)
     RETURNING id`,
    [
      target,
      'logistic_regression',
      featureNames,
      JSON.stringify(trained.weights),
      trained.sampleSize,
      trained.positiveRate,
      trained.logLoss,
      trained.auc,
      trained.brier,
      `risk-model@${RISK_MODEL_VERSION}`,
      reason ?? null,
    ],
  );
  const versionId: string = insert.rows[0].id;

  if (shouldActivate) {
    await pool.query(
      `UPDATE intelligence.risk_model_versions SET is_active = FALSE WHERE target = $1`,
      [target],
    );
    await pool.query(
      `UPDATE intelligence.risk_model_versions SET is_active = TRUE WHERE id = $1`,
      [versionId],
    );
    invalidateCache(target);
    log.info(`Activated new ${target} model version=${versionId} log_loss=${trained.logLoss?.toFixed(4)} auc=${trained.auc?.toFixed(3) ?? 'n/a'} n=${rows.length}`);
  } else {
    log.info(`Trained ${target} model version=${versionId} but kept inactive (${reason ?? 'caller_requested'})`);
  }

  return {
    target,
    versionId,
    trained: true,
    reason,
    sampleSize: trained.sampleSize,
    logLoss: trained.logLoss,
    auc: trained.auc,
    brier: trained.brier,
    weights: shouldActivate
      ? {
          target,
          featureNames,
          weights: trained.weights as any,
          versionId,
          sampleSize: trained.sampleSize,
          positiveRate: trained.positiveRate,
          logLoss: trained.logLoss,
          auc: trained.auc,
          brier: trained.brier,
          trainedAt: new Date().toISOString(),
        }
      : null,
  };
}

export function _invalidateModelCacheForTests(): void {
  invalidateCache();
}
