/**
 * Batch portfolio runner tests.
 */

import { describe, it, expect } from 'vitest';
import { runPortfolioPlans } from '../batch-portfolio';

const complete = {
  analyticalPrecision: true, detectionCapability: true, linearity: true, interference: true,
  methodComparison: true, stability: true, traceability: true, clinicalPerformance: true,
  scientificValidity: true, intendedUseMatchesPredicate: true,
};

describe('runPortfolioPlans', () => {
  it('handles an empty batch', () => {
    const r = runPortfolioPlans([]);
    expect(r.programCount).toBe(0);
    expect(r.programs).toHaveLength(0);
  });

  it('builds plans and aggregates a portfolio view', () => {
    const r = runPortfolioPlans([
      { name: 'Ready 510k', input: { pathway: '510k', assayType: 'quantitative', intendedUse: 'diagnosis', evidence: complete, seed: 1 } },
      { name: 'Bare PMA NGS CDx', input: { pathway: 'pma', assayType: 'ngs', intendedUse: 'cdx', biomarker: 'EGFR', seed: 1 } },
    ]);
    expect(r.programCount).toBe(2);
    expect(r.likelyAcceptances).toBe(1);
    expect(r.totalRemainingCostUsd).toBeGreaterThan(0);
    // Parallel timeline is the longest single program; sequential is the sum.
    expect(r.sequentialTimelineWeeksP50).toBeGreaterThanOrEqual(r.parallelTimelineWeeksP50);
    // Worklist puts the least-ready program first.
    expect(r.worklist[0].name).toBe('Bare PMA NGS CDx');
    expect(r.programs[0].ivdrClass).toBeDefined();
  });

  it('per-program lines carry class, verdict, timeline, cost, and a next action', () => {
    const r = runPortfolioPlans([
      { name: 'P1', input: { pathway: '510k', assayType: 'quantitative', intendedUse: 'diagnosis', seed: 2 } },
    ]);
    const line = r.programs[0];
    expect(line.readinessScore).toBeGreaterThanOrEqual(0);
    expect(line.estimatedCalendarWeeksP50).toBeGreaterThan(0);
    expect(line.topNextAction).not.toBeNull();
  });
});
