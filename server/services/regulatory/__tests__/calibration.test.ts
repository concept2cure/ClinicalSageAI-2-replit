/**
 * Calibration / back-test harness tests.
 */

import { describe, it, expect } from 'vitest';
import { calibrate, type BacktestCase } from '../calibration';

const complete = {
  analyticalPrecision: true, detectionCapability: true, linearity: true, interference: true,
  methodComparison: true, stability: true, traceability: true, clinicalPerformance: true,
  scientificValidity: true, intendedUseMatchesPredicate: true,
};

describe('calibrate', () => {
  it('rewards a model that ranks complete dossiers as approved', () => {
    const cases: BacktestCase[] = [
      { profile: { pathway: '510k', assayType: 'quantitative', intendedUse: 'diagnosis', evidence: complete }, approved: true },
      { profile: { pathway: '510k', assayType: 'quantitative', intendedUse: 'diagnosis', evidence: complete }, approved: true },
      { profile: { pathway: 'pma', assayType: 'ngs', intendedUse: 'cdx' }, approved: false },
      { profile: { pathway: 'pma', assayType: 'ngs', intendedUse: 'cdx' }, approved: false },
    ];
    const r = calibrate(cases);
    expect(r.n).toBe(4);
    expect(r.auc).toBe(1); // complete cases scored above bare cases, perfectly separating outcomes
    expect(r.accuracy).toBe(1);
    expect(r.brierScore).toBeLessThan(0.25);
    expect(r.observedApprovalRate).toBeCloseTo(0.5, 3);
  });

  it('produces reliability bins and discrimination metrics', () => {
    const cases: BacktestCase[] = [
      { profile: { pathway: '510k', assayType: 'quantitative', intendedUse: 'diagnosis', evidence: complete }, approved: true },
      { profile: { pathway: 'de_novo', assayType: 'ngs', intendedUse: 'cdx' }, approved: false },
      { profile: { pathway: 'eu_ivdr', assayType: 'qualitative', intendedUse: 'screening' }, approved: true },
    ];
    const r = calibrate(cases);
    expect(r.calibrationBins.length).toBeGreaterThan(0);
    expect(r.logLoss).toBeGreaterThanOrEqual(0);
    expect(r.meanPredicted).toBeGreaterThan(0);
    const binCount = r.calibrationBins.reduce((s, b) => s + b.count, 0);
    expect(binCount).toBe(3);
  });

  it('AUC is null when all outcomes are the same class', () => {
    const r = calibrate([
      { profile: { pathway: '510k', assayType: 'quantitative', intendedUse: 'diagnosis', evidence: complete }, approved: true },
      { profile: { pathway: 'eu_ivdr', assayType: 'qualitative', intendedUse: 'screening' }, approved: true },
    ]);
    expect(r.auc).toBeNull();
  });

  it('rejects an empty case set', () => {
    expect(() => calibrate([])).toThrow();
  });
});
