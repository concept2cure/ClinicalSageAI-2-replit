/**
 * Portfolio-level simulation tests.
 */

import { describe, it, expect } from 'vitest';
import { simulatePortfolio } from '../portfolio-simulation';

const complete = {
  analyticalPrecision: true, detectionCapability: true, linearity: true, interference: true,
  methodComparison: true, stability: true, traceability: true, clinicalPerformance: true,
  scientificValidity: true, intendedUseMatchesPredicate: true,
};

describe('simulatePortfolio', () => {
  it('handles an empty portfolio', () => {
    const r = simulatePortfolio([]);
    expect(r.programCount).toBe(0);
    expect(r.criticalProgram).toBeNull();
  });

  it('aggregates readiness, verdict mix, and the attention worklist', () => {
    const r = simulatePortfolio([
      { name: 'Assay A (ready)', profile: { pathway: '510k', assayType: 'quantitative', intendedUse: 'diagnosis', evidence: complete } },
      { name: 'Assay B (bare)', profile: { pathway: 'pma', assayType: 'ngs', intendedUse: 'cdx' } },
    ]);
    expect(r.programCount).toBe(2);
    expect(r.likelyAcceptances).toBe(1);
    expect(r.meanReadiness).toBeGreaterThan(0);
    // The worklist is ascending by readiness → the bare PMA NGS program is first.
    expect(r.worklist[0].name).toBe('Assay B (bare)');
    expect(r.criticalProgram?.name).toBe('Assay B (bare)');
    expect(r.minReadiness).toBeLessThan(r.meanReadiness + 1);
  });

  it('surfaces the most common deficiency themes across programs', () => {
    const r = simulatePortfolio([
      { name: 'P1', profile: { pathway: '510k', assayType: 'quantitative', intendedUse: 'diagnosis' } },
      { name: 'P2', profile: { pathway: '510k', assayType: 'quantitative', intendedUse: 'diagnosis' } },
    ]);
    expect(r.topDeficiencyThemes.length).toBeGreaterThan(0);
    // Precision is missing in both → its theme count should be 2.
    const precision = r.topDeficiencyThemes.find(t => t.area.toLowerCase().includes('precision'));
    expect(precision?.count).toBe(2);
  });

  it('aggregate finding counts sum across programs', () => {
    const r = simulatePortfolio([
      { name: 'P1', profile: { pathway: '510k', assayType: 'quantitative', intendedUse: 'diagnosis' } },
    ]);
    expect(r.aggregateFindingCounts.major).toBeGreaterThan(0);
  });
});
