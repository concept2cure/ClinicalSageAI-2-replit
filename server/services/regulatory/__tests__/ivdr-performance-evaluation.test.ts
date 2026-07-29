/**
 * IVDR Performance Evaluation Report completeness (Annex XIII pillars).
 */

import { describe, it, expect } from 'vitest';
import { assessPerformanceEvaluationReport } from '../ivdr-performance-evaluation';

describe('assessPerformanceEvaluationReport', () => {
  it('reports per-pillar gaps and an overall score', () => {
    const r = assessPerformanceEvaluationReport({
      scientificValidityReport: true,
      analyticalSensitivity: true,
      analyticalSpecificity: true,
    });
    // 3 of 10 elements present.
    expect(r.completenessScore).toBeCloseTo(3 / 10, 8);
    expect(r.complete).toBe(false);
    const analytical = r.pillars.find(p => p.pillar === 'analyticalPerformance')!;
    expect(analytical.gaps).toContain('limitOfDetection');
    const sci = r.pillars.find(p => p.pillar === 'scientificValidity')!;
    expect(sci.complete).toBe(true);
  });

  it('complete when every pillar is satisfied', () => {
    const r = assessPerformanceEvaluationReport({
      scientificValidityReport: true,
      analyticalSensitivity: true,
      analyticalSpecificity: true,
      trueness: true,
      precision: true,
      limitOfDetection: true,
      measuringRange: true,
      diagnosticSensitivity: true,
      diagnosticSpecificity: true,
      clinicalEvidence: true,
    });
    expect(r.complete).toBe(true);
    expect(r.completenessScore).toBeCloseTo(1, 10);
    expect(r.gaps).toEqual([]);
  });

  it('exposes the three Annex XIII pillars', () => {
    const r = assessPerformanceEvaluationReport({});
    expect(r.pillars.map(p => p.pillar)).toEqual([
      'scientificValidity',
      'analyticalPerformance',
      'clinicalPerformance',
    ]);
  });
});
