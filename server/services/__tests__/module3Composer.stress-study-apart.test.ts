/**
 * A stress (forced-degradation) study is tabulated on its own and never enters
 * the storage-period verdict.
 *
 * What the code used to do (until 2026-11-13): §3.2.S.7 and §3.2.P.8 read every
 * stability source on their side into one results table, the conformance
 * verdict and the trend, and took the design table's condition from the first
 * one. The register records a "Stress — thermal, photostability or
 * freeze-thaw" study as type `stress`; its results are outside their limits
 * by design (that is what forced degradation is for), so a programme with a
 * passing long-term study and a stress study filed "The stability conclusion
 * and the proposed storage period are NOT established by this section". The
 * ICH check's Q1A rule likewise counted a 40 °C stress study as accelerated.
 */
import { describe, expect, it } from 'vitest';
import { composeModule3FromCanonicalSources } from '../module3Composer';
import { checkQ1A, type ProjectInputs } from '../cmc/ich-compliance-rules';

let n = 0;
const src = (sourceType: string, sourcePayload: Record<string, unknown>) => ({
  id: `s${++n}`, sourceType, sourcePayload, sourceHash: `h${n}`,
});

const LONG_TERM = src('stability', {
  stabilityScope: 'drug_product', studyType: 'long-term', studyName: 'DP long-term',
  storageCondition: '25C/60%RH', timePoints: ['0', '3', '6'], batchesStudied: ['DP-001'],
  results: [
    { timePoint: '0', parameter: 'assay', result: '99.8', specification: '95.0-105.0%' },
    { timePoint: '3', parameter: 'assay', result: '99.4', specification: '95.0-105.0%' },
    { timePoint: '6', parameter: 'assay', result: '99.0', specification: '95.0-105.0%' },
  ],
});
const STRESS = src('stability', {
  stabilityScope: 'drug_product', studyType: 'stress', studyName: 'DP thermal stress',
  storageCondition: '60C', timePoints: ['0', '1'], batchesStudied: ['DP-STR'],
  results: [
    { timePoint: '0', parameter: 'assay', result: '99.7', specification: '95.0-105.0%' },
    { timePoint: '1', parameter: 'assay', result: '81.2', specification: '95.0-105.0%' },
  ],
});

const p8 = (sources: unknown[]) =>
  composeModule3FromCanonicalSources([src('drug_product', { name: 'DP-1' }), ...sources] as never)
    .find((s) => s.sectionKey === '3.2.P.8')!;

describe('§3.2.P.8 — a stress study is evidence of degradation, not of a storage period', () => {
  it('does not let a stress result outside its limit decide the storage period', () => {
    const s = p8([LONG_TERM, STRESS]);
    expect(s.narrativeDraft).not.toContain('NOT established');
    expect(s.narrativeDraft).toContain('All 3 recorded result(s) compared here are within');
  });

  it('tabulates the stress results apart and says why', () => {
    const s = p8([LONG_TERM, STRESS]);
    const main = s.tables.find((t) => t.title === 'Stability Results — Drug Product')!;
    expect(main.rows.flat()).not.toContain('DP-STR');
    const stress = s.tables.find((t) => t.title === 'Stress Study Results — Drug Product');
    expect(stress?.rows.map((r) => r.join(' | '))).toContain('DP-STR | 60C | assay | 1 | 81.2 | 95.0-105.0% | OUTSIDE');
    expect(s.narrativeDraft).toContain(
      '1 stress (forced-degradation) study is recorded and tabulated separately (2 result(s)); stress results characterise how the material degrades and are not compared toward the storage period.',
    );
  });

  it('takes the storage condition from a claim study, never from the stress study', () => {
    const s = p8([STRESS, LONG_TERM]);
    expect(s.narrativeDraft).toContain('conducted under 25C/60%RH');
  });

  it('a stress study alone establishes no storage period', () => {
    const s = p8([STRESS]);
    expect(s.narrativeDraft).toContain('No drug product stability study is present');
    expect(s.narrativeDraft).toContain('1 stress (forced-degradation) study is recorded');
  });
});

describe('ICH Q1A — the check counts studies by their recorded type', () => {
  const inputs = (stability: Array<Record<string, unknown>>): ProjectInputs => ({
    specs: [], methods: [], stability, drugSubs: [], processes: [], sourceObjects: [], sections: [],
  });
  it('a 40 °C stress study is not the accelerated study', () => {
    const f = checkQ1A(inputs([
      { studyName: 'LT', studyType: 'long-term', storageCondition: '25°C / 60% RH', status: 'in_progress' },
      { studyName: 'Stress', studyType: 'stress', storageCondition: '40°C / 75% RH', status: 'completed' },
    ]));
    expect(f.map((x) => x.ruleId)).toContain('Q1A_NO_ACCELERATED');
  });
});
