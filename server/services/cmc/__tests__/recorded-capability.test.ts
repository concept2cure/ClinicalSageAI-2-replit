/**
 * The capability series a project's QC register produces — the one assembly
 * the composed §3.2.S.4.4 / §3.2.P.5.4, the HTTP route and the AnA tool all
 * call.
 *
 * The engine's arithmetic is pinned in process-capability.test.ts. What is
 * pinned here is the part that turns a register into its inputs, and every
 * place that must REFUSE instead of averaging: rows recorded against different
 * acceptance criteria, a cleaning swab that is not batch evidence, a
 * drug-product result that must not enter the drug substance's series.
 */
import { describe, expect, it } from 'vitest';

import {
  assessRecordedCapability,
  capabilitySentence,
  isBatchAnalysisFor,
} from '../recorded-capability';

/** A canonical qc_result payload as the write-through mapper stores it. */
const qc = (over: Record<string, unknown> = {}) => ({
  testMethod: 'AM-001 assay',
  sampleType: 'drug-substance',
  isBatchAnalysis: true,
  batchAnalysisSide: 'drug_substance',
  batchNumber: 'B-001',
  testResults: { value: '100.0', unit: '%' },
  specifications: { acceptanceCriteria: '95.0 - 105.0%' },
  ...over,
});

const series = (values: number[], over: Record<string, unknown> = {}) =>
  values.map((v, i) =>
    qc({ batchNumber: `B-${String(i + 1).padStart(3, '0')}`, testResults: { value: String(v), unit: '%' }, ...over }),
  );

describe('assessRecordedCapability — one series per test', () => {
  it('assesses a test over its batches and reports the indices', () => {
    const [s] = assessRecordedCapability(series([99.0, 101.0, 100.5, 99.5, 100.0, 101.5, 98.5, 100.0]));
    expect(s.test).toBe('AM-001 assay');
    expect(s.criterion).toBe('95.0 - 105.0%');
    expect(s.outcome.ok).toBe(true);
    if (!s.outcome.ok) return;
    expect(s.outcome.n).toBe(8);
    expect(s.outcome.limits).toEqual({ lower: 95, upper: 105 });
    // Under 25 batches the estimate is preliminary and must say so.
    expect(s.outcome.preliminary).toBe(true);
    expect(capabilitySentence(s)).toMatch(/over 8 batches the mean is/);
  });

  it('keeps each test in its own series, in first-seen order', () => {
    const rows = [
      ...series([99, 101, 100, 100, 99, 101]),
      ...series([0.1, 0.2, 0.15, 0.12, 0.18, 0.11], {
        testMethod: 'AM-002 related substances',
        specifications: { acceptanceCriteria: 'NMT 0.5%' },
      }),
    ];
    const out = assessRecordedCapability(rows);
    expect(out.map((s) => s.test)).toEqual(['AM-001 assay', 'AM-002 related substances']);
    expect(out[1].outcome.ok).toBe(true);
    if (!out[1].outcome.ok) return;
    // A one-sided criterion carries Cpu only; Pp/Cp are not stated.
    expect(out[1].outcome.limits).toEqual({ lower: null, upper: 0.5 });
    expect(out[1].outcome.pp).toBeNull();
  });

  it('REFUSES a test whose batches were judged against different criteria — it does not average them', () => {
    const rows = [
      ...series([99, 101, 100, 100, 99, 101]),
      qc({ batchNumber: 'B-007', specifications: { acceptanceCriteria: '90.0 - 110.0%' } }),
    ];
    const [s] = assessRecordedCapability(rows);
    expect(s.outcome.ok).toBe(false);
    if (s.outcome.ok) return;
    expect(s.criterion).toBeNull();
    expect(s.resultsOnFile).toBe(7);
    expect(s.outcome.message).toMatch(/different acceptance criteria/);
    expect(s.outcome.message).toContain('95.0 - 105.0%');
    expect(s.outcome.message).toContain('90.0 - 110.0%');
    expect(capabilitySentence(s)).toMatch(/^AM-001 assay: capability not assessed —/);
  });

  it('carries the engine’s own refusal — five batches is not a capability estimate', () => {
    const [s] = assessRecordedCapability(series([99, 101, 100, 100, 99]));
    expect(s.outcome.ok).toBe(false);
    if (s.outcome.ok) return;
    expect(s.outcome.code).toBe('INSUFFICIENT_BATCHES');
    // Reported, never dropped: a test missing from a capability report reads
    // as a test that passed.
    expect(capabilitySentence(s)).toContain('capability not assessed');
  });

  it('skips a row with no test method rather than opening an unnamed series', () => {
    expect(assessRecordedCapability([qc({ testMethod: '' }), qc({ testMethod: null })])).toEqual([]);
  });

  it('falls back to the sample id when a result carries no batch number', () => {
    const rows = series([99, 101, 100, 100, 99, 101]).map((r, i) =>
      i === 0 ? { ...r, batchNumber: '', sampleId: 'S-042' } : r,
    );
    const [s] = assessRecordedCapability(rows);
    expect(s.outcome.ok).toBe(true);
  });
});

describe('isBatchAnalysisFor — one gate, shared with the mapper and the composer', () => {
  it('honours the mapper’s decision over the sample type', () => {
    expect(isBatchAnalysisFor(qc({ batchAnalysisSide: 'drug_product' }), 'drug_product')).toBe(true);
    expect(isBatchAnalysisFor(qc({ batchAnalysisSide: 'drug_product' }), 'drug_substance')).toBe(false);
  });

  it('refuses a cleaning swab and a reference-standard qualification on either side', () => {
    for (const sampleType of ['cleaning-verification', 'reference-standard']) {
      const row = qc({ sampleType, batchAnalysisSide: null, isBatchAnalysis: false });
      expect(isBatchAnalysisFor(row, 'drug_substance')).toBe(false);
      expect(isBatchAnalysisFor(row, 'drug_product')).toBe(false);
    }
  });

  it('classifies a payload written before batchAnalysisSide existed by its sample type', () => {
    const legacy = (sampleType: string) => ({ testMethod: 'AM-001 assay', sampleType });
    expect(isBatchAnalysisFor(legacy('finished-product'), 'drug_product')).toBe(true);
    expect(isBatchAnalysisFor(legacy('finished-product'), 'drug_substance')).toBe(false);
    expect(isBatchAnalysisFor(legacy('drug-substance'), 'drug_substance')).toBe(true);
  });

  it('keeps a finished-product result out of the drug substance’s capability series', () => {
    const rows = [
      ...series([99, 101, 100, 100, 99, 101]),
      ...series([50, 51, 49, 50, 50, 51], {
        sampleType: 'finished-product',
        batchAnalysisSide: 'drug_product',
        specifications: { acceptanceCriteria: '95.0 - 105.0%' },
      }),
    ];
    const [ds] = assessRecordedCapability(rows.filter((r) => isBatchAnalysisFor(r, 'drug_substance')));
    expect(ds.outcome.ok).toBe(true);
    if (!ds.outcome.ok) return;
    expect(ds.outcome.n).toBe(6);
    expect(ds.outcome.batchesOutOfSpecification).toEqual([]);
  });
});
