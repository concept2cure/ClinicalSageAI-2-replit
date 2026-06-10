/**
 * Shadow Review — RTF Benchmark Runner (WO-8)
 *
 * Evaluates the EXISTING RTF risk model (`intelligence/risk-model.ts`) on the
 * criteria-grounded benchmark dataset. Uses only the model's pure functions
 * (`trainLogistic`, `scoreWithWeights`) so it runs with no DB and no LLM.
 *
 * Protocol: deterministic train/test split → train logistic on the train split
 * → score the test split → confusion matrix + precision / recall / F1 / accuracy
 * / AUC at a decision threshold. Reproducible.
 */

import { trainLogistic, scoreWithWeights, RISK_MODEL_VERSION, type RiskModelWeights } from '../../intelligence/risk-model.js';
import {
  RTF_BENCHMARK_DATASET,
  RTF_FEATURE_NAMES,
  RTF_BENCHMARK_PROVENANCE,
  type BenchmarkExample,
} from './rtf-benchmark-dataset.js';

export interface BenchmarkMetrics {
  threshold: number;
  /** How the operating threshold was chosen. */
  thresholdSource: 'tuned_on_train' | 'fixed';
  trainSize: number;
  testSize: number;
  positiveRate: number;
  tp: number;
  fp: number;
  fn: number;
  tn: number;
  precision: number;
  recall: number;
  f1: number;
  accuracy: number;
  auc: number | null;
  modelVersion: string;
}

function aucScore(scored: Array<{ score: number; label: boolean }>): number | null {
  const pos = scored.filter(s => s.label);
  const neg = scored.filter(s => !s.label);
  if (pos.length === 0 || neg.length === 0) return null;
  // Mann–Whitney U (rank-based AUC).
  const ranked = [...scored].sort((a, b) => a.score - b.score);
  let rankSumPos = 0;
  for (let i = 0; i < ranked.length; i++) {
    if (ranked[i].label) rankSumPos += i + 1;
  }
  const u = rankSumPos - (pos.length * (pos.length + 1)) / 2;
  return Number((u / (pos.length * neg.length)).toFixed(4));
}

/** Deterministic split that preserves order (dataset is already shuffled by gen). */
function split(data: BenchmarkExample[], trainFraction: number) {
  const cutoff = Math.max(1, Math.floor(data.length * trainFraction));
  return { train: data.slice(0, cutoff), test: data.slice(cutoff) };
}

function f1At(scored: Array<{ score: number; label: boolean }>, threshold: number): number {
  let tp = 0, fp = 0, fn = 0;
  for (const s of scored) {
    const pred = s.score >= threshold;
    if (pred && s.label) tp++;
    else if (pred && !s.label) fp++;
    else if (!pred && s.label) fn++;
  }
  const p = tp + fp === 0 ? 0 : tp / (tp + fp);
  const r = tp + fn === 0 ? 0 : tp / (tp + fn);
  return p + r === 0 ? 0 : (2 * p * r) / (p + r);
}

/**
 * Choose the operating threshold by sweeping candidate cut-points on the TRAIN
 * scores and maximizing F1. Tuning on train (never test) avoids leakage and
 * mirrors deployment, where the model ranks but the operating point is set on a
 * dev split. Returns 0.5 if train is degenerate.
 */
function tuneThreshold(trainScored: Array<{ score: number; label: boolean }>): number {
  if (trainScored.length === 0) return 0.5;
  const cuts = Array.from(new Set(trainScored.map(s => s.score))).sort((a, b) => a - b);
  let best = 0.5;
  let bestF1 = -1;
  for (let i = 0; i < cuts.length; i++) {
    // midpoint between adjacent scores as the candidate threshold
    const t = i === 0 ? cuts[0] - 1e-6 : (cuts[i] + cuts[i - 1]) / 2;
    const f1 = f1At(trainScored, t);
    if (f1 > bestF1) {
      bestF1 = f1;
      best = Number(t.toFixed(6));
    }
  }
  return best;
}

export function runRtfBenchmark(
  dataset: BenchmarkExample[] = RTF_BENCHMARK_DATASET,
  opts: { threshold?: number; trainFraction?: number } = {}
): BenchmarkMetrics {
  const trainFraction = opts.trainFraction ?? 0.75;
  const { train, test } = split(dataset, trainFraction);

  // Train on the train split only (holdoutFraction 0 → use all train rows).
  const trained = trainLogistic(
    train.map(e => ({ features: e.features, label: e.label })),
    RTF_FEATURE_NAMES,
    { holdoutFraction: 0 }
  );

  const model: RiskModelWeights = {
    target: 'rtf',
    featureNames: RTF_FEATURE_NAMES,
    weights: trained.weights,
    versionId: `benchmark-${RISK_MODEL_VERSION}`,
    sampleSize: trained.sampleSize,
    positiveRate: trained.positiveRate,
    logLoss: trained.logLoss,
    auc: trained.auc,
    brier: trained.brier,
    trainedAt: new Date(0).toISOString(),
  };

  // Operating threshold: caller-fixed, else tuned on the TRAIN split (no leakage).
  const trainScored = train.map(e => ({ score: scoreWithWeights(e.features, model), label: e.label }));
  const thresholdSource: 'tuned_on_train' | 'fixed' = opts.threshold == null ? 'tuned_on_train' : 'fixed';
  const threshold = opts.threshold ?? tuneThreshold(trainScored);

  let tp = 0;
  let fp = 0;
  let fn = 0;
  let tn = 0;
  const scored: Array<{ score: number; label: boolean }> = [];
  for (const e of test) {
    const score = scoreWithWeights(e.features, model);
    scored.push({ score, label: e.label });
    const predicted = score >= threshold;
    if (predicted && e.label) tp++;
    else if (predicted && !e.label) fp++;
    else if (!predicted && e.label) fn++;
    else tn++;
  }

  const precision = tp + fp === 0 ? 0 : tp / (tp + fp);
  const recall = tp + fn === 0 ? 0 : tp / (tp + fn);
  const f1 = precision + recall === 0 ? 0 : (2 * precision * recall) / (precision + recall);
  const accuracy = test.length === 0 ? 0 : (tp + tn) / test.length;

  return {
    threshold: Number(threshold.toFixed(4)),
    thresholdSource,
    trainSize: train.length,
    testSize: test.length,
    positiveRate: Number((test.filter(e => e.label).length / Math.max(1, test.length)).toFixed(4)),
    tp,
    fp,
    fn,
    tn,
    precision: Number(precision.toFixed(4)),
    recall: Number(recall.toFixed(4)),
    f1: Number(f1.toFixed(4)),
    accuracy: Number(accuracy.toFixed(4)),
    auc: aucScore(scored),
    modelVersion: model.versionId,
  };
}

/** Human-readable report (used by the benchmark doc / CLI). */
export function formatBenchmarkReport(m: BenchmarkMetrics): string {
  return [
    `RTF Benchmark — ${RTF_BENCHMARK_PROVENANCE.name} v${RTF_BENCHMARK_PROVENANCE.version}`,
    `model: ${m.modelVersion} · threshold: ${m.threshold} (${m.thresholdSource})`,
    `train/test: ${m.trainSize}/${m.testSize} · test positive rate: ${m.positiveRate}`,
    `confusion: TP=${m.tp} FP=${m.fp} FN=${m.fn} TN=${m.tn}`,
    `precision=${m.precision} recall=${m.recall} F1=${m.f1} accuracy=${m.accuracy} AUC=${m.auc}`,
  ].join('\n');
}
