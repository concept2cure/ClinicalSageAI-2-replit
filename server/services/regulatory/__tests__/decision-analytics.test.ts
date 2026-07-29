/**
 * Decision-analytics (sensitivity / tornado / ROI) tests.
 */

import { describe, it, expect } from 'vitest';
import { sensitivityAnalysis } from '../decision-analytics';

describe('sensitivityAnalysis', () => {
  it('ranks missing evidence by readiness impact and ROI', () => {
    const r = sensitivityAnalysis({ pathway: '510k', assayType: 'quantitative', intendedUse: 'diagnosis' });
    expect(r.baselineReadiness).toBeLessThan(100);
    expect(r.tornado.length).toBeGreaterThan(0);
    // Tornado is sorted by readiness gain (descending).
    const gains = r.tornado.map(i => i.readinessGain);
    expect(gains).toEqual([...gains].sort((a, b) => b - a));
    // ROI list is sorted by gain-per-week (descending).
    const roi = r.byRoi.map(i => i.gainPerWeek);
    expect(roi).toEqual([...roi].sort((a, b) => b - a));
    expect(r.highestImpact).not.toBeNull();
    expect(r.bestRoi).not.toBeNull();
  });

  it('major-clearing elements are flagged and carry a positive gain', () => {
    const r = sensitivityAnalysis({ pathway: '510k', assayType: 'quantitative', intendedUse: 'diagnosis' });
    const major = r.tornado.find(i => i.removesMajor);
    expect(major).toBeDefined();
    expect(major!.readinessGain).toBeGreaterThan(0);
  });

  it('only suggests pathway-relevant evidence (no PMPF for a 510k)', () => {
    const r = sensitivityAnalysis({ pathway: '510k', assayType: 'quantitative', intendedUse: 'diagnosis' });
    expect(r.tornado.some(i => i.element === 'pmpfPlan')).toBe(false);
    expect(r.tornado.some(i => i.element === 'intendedUseMatchesPredicate')).toBe(true);
  });

  it('a near-complete dossier has few or no impactful additions', () => {
    const r = sensitivityAnalysis({
      pathway: '510k', assayType: 'quantitative', intendedUse: 'diagnosis',
      evidence: {
        analyticalPrecision: true, detectionCapability: true, linearity: true, interference: true,
        methodComparison: true, stability: true, traceability: true, clinicalPerformance: true,
        scientificValidity: true, intendedUseMatchesPredicate: true,
      },
    });
    expect(r.baselineReadiness).toBe(100);
    expect(r.highestImpact).toBeNull();
  });
});
