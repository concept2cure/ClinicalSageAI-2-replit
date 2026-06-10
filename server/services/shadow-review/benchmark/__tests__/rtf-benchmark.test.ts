/**
 * RTF Benchmark (WO-8) — the dataset is criteria-grounded and reproducible, the
 * label rule follows the public refuse grounds, and the EXISTING RTF risk model
 * recovers the administrative gate well above chance. This is the mandatory
 * Shadow-Review benchmark gate, run on the model we already have.
 */

import { describe, it, expect } from 'vitest';
import {
  RTF_BENCHMARK_DATASET,
  RTF_FEATURE_NAMES,
  RTF_GROUNDS,
  RTF_BENCHMARK_PROVENANCE,
  generateRtfBenchmark,
  labelFor,
} from '../rtf-benchmark-dataset';
import { runRtfBenchmark, formatBenchmarkReport } from '../run-rtf-benchmark';

describe('RTF benchmark dataset — integrity & provenance', () => {
  it('is reproducible (deterministic generator)', () => {
    expect(generateRtfBenchmark(50, 123)).toEqual(generateRtfBenchmark(50, 123));
  });

  it('is non-degenerate (both classes present, realistic positive rate)', () => {
    const pos = RTF_BENCHMARK_DATASET.filter(e => e.label).length;
    const rate = pos / RTF_BENCHMARK_DATASET.length;
    expect(rate).toBeGreaterThan(0.1);
    expect(rate).toBeLessThan(0.9);
  });

  it('every positive label cites at least one public refuse ground', () => {
    const groundIds = new Set(RTF_GROUNDS.map(g => g.id));
    for (const e of RTF_BENCHMARK_DATASET) {
      if (e.label) {
        expect(e.groundIds.length).toBeGreaterThan(0);
        for (const g of e.groundIds) expect(groundIds.has(g)).toBe(true);
      } else {
        expect(e.groundIds.length).toBe(0);
      }
    }
  });

  it('the label rule matches the documented administrative/substantive logic', () => {
    // A single administrative defect refuses.
    expect(labelFor({ missing_required_forms: 1 }).label).toBe(true);
    // A single substantive weakness alone does NOT refuse at the filing gate.
    expect(labelFor({ inadequate_efficacy_evidence: 1 }).label).toBe(false);
    // Both substantive weaknesses together refuse.
    expect(labelFor({ inadequate_efficacy_evidence: 1, cmc_incomplete: 1 }).label).toBe(true);
    // A clean submission is accepted.
    expect(labelFor({}).label).toBe(false);
  });

  it('is honestly labeled as criteria-grounded, not licensed data', () => {
    expect(RTF_BENCHMARK_PROVENANCE.licensed).toBe(false);
    expect(RTF_BENCHMARK_PROVENANCE.syntheticButCriteriaGrounded).toBe(true);
    expect(RTF_BENCHMARK_PROVENANCE.sources.length).toBeGreaterThanOrEqual(3);
  });
});

describe('RTF benchmark — existing risk model recovers the gate', () => {
  const metrics = runRtfBenchmark();

  it('computes a full confusion matrix on a held-out test split', () => {
    expect(metrics.tp + metrics.fp + metrics.fn + metrics.tn).toBe(metrics.testSize);
    expect(metrics.testSize).toBeGreaterThan(0);
  });

  it('achieves strong recall and precision well above chance', () => {
    // The administrative gate is a learnable boundary; the logistic model should
    // recover it with high recall (missing a refuse ground is the costly error).
    expect(metrics.recall).toBeGreaterThanOrEqual(0.8);
    expect(metrics.precision).toBeGreaterThanOrEqual(0.7);
    expect(metrics.f1).toBeGreaterThanOrEqual(0.75);
    expect(metrics.auc === null || metrics.auc >= 0.85).toBe(true);
  });

  it('produces a readable report', () => {
    const report = formatBenchmarkReport(metrics);
    expect(report).toMatch(/precision=/);
    expect(report).toMatch(/recall=/);
    // Surface the numbers in the test log for the benchmark doc.
    // eslint-disable-next-line no-console
    console.info('\n' + report + '\n');
  });
});
