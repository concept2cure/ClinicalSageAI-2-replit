/**
 * The number a caller reads is the number for the design it asked for
 * (2026-10-11).
 *
 * `tests/biostat/ana-sizing-reference.test.ts` pins `computeCrossover` to 32
 * and `computeAUCComparison` to 10 per group — by calling them directly. That
 * is how both defects below survived a reference suite: the formulas are
 * right, and `compute()` / `computeEnhanced()` never reach them. A caller
 * reads `result.sampleSize` and `result.method`; nothing asserted that those
 * two fields describe the design that was asked for.
 *
 * Defect A — a 2×2 crossover came back as the PARALLEL-GROUP design. With
 * d = 0.5, ρ = 0.5 the headline was `{perGroup: 64, total: 128}` and the
 * method read "Two-sample t-test (superiority)". The correct 32 was attached
 * out of the way on `crossoverResult.withinSubjectN`, which no surface reads.
 * Every UI and the protocol bridge read `sampleSize.total`, so a crossover
 * trial was sized at 128 subjects where 32 is right — four times the
 * enrolment, on the headline figure, with nothing saying the design had been
 * ignored.
 *
 * Defect B — an AUC/ROC endpoint was REFUSED even with its own parameters
 * complete. `computeStandard` routed `auc_roc` to `computeDiagnostic`, which
 * requires sensitivity, specificity and prevalence, so a complete AUC design
 * (aucTarget 0.85, aucNull 0.5) threw `missing_input` naming `sensitivity` —
 * a field an ROC design does not have. `computeAUCComparison` was reachable
 * from tests only. (That routing was introduced on 2026-10-11 in the same
 * change that stopped six endpoint types being silently sized as continuous;
 * it replaced a wrong number with a wrong refusal.)
 *
 * Both are the same mistake as the kappa gate this suite already covers: the
 * method was chosen by the sponsor's track rather than by the endpoint. An
 * accuracy endpoint is sized as one whatever the track.
 */
import { describe, expect, it } from 'vitest';
import { computationEngine as engine } from '../../server/services/ana-biostats/computation-engine.js';
import type { StatisticalInput } from '../../server/services/ana-biostats/types.js';

const base = {
  clientTrack: 'biotech_pharma',
  studyType: 'superiority',
  objectiveType: 'efficacy',
  endpointType: 'continuous',
  alpha: 0.05,
  powerTarget: 0.8,
  effectSize: 0.5,
  attritionRate: 0,
  allocationRatio: 1,
  numberOfGroups: 2,
} as unknown as StatisticalInput;

describe('a 2×2 crossover is sized as a crossover, on the headline figure', () => {
  const crossover = { ...base, crossoverPeriods: 2, withinSubjectCorrelation: 0.5 } as StatisticalInput;

  it('reports the crossover total (32), not the parallel-group total (128)', () => {
    const r = engine.computeEnhanced(crossover);
    expect(r.sampleSize.total).toBe(32);
  });

  it('names the crossover design in the method, so the number is readable', () => {
    const r = engine.computeEnhanced(crossover);
    expect(r.method).toMatch(/crossover/i);
    expect(r.method).not.toMatch(/^Two-sample t-test/);
  });

  it('splits the total over the two sequences, not over two parallel arms', () => {
    const r = engine.computeEnhanced(crossover);
    expect(r.sampleSize.groups).toBe(2);
    expect(r.sampleSize.perGroup).toBe(16);
    expect(r.sampleSize.perGroup * r.sampleSize.groups).toBe(r.sampleSize.total);
  });

  it('keeps the parallel-group comparator available, so the saving is auditable', () => {
    const r = engine.computeEnhanced(crossover);
    expect(r.crossoverResult?.withinSubjectN).toBe(32);
    expect(r.crossoverResult?.parallelEquivalentN).toBeGreaterThan(100);
  });

  it('still refuses a crossover whose correlation it was not given', () => {
    const r = engine.computeEnhanced({ ...base, crossoverPeriods: 2 } as StatisticalInput);
    // The main sizing stands and the refusal is recorded beside it.
    expect(JSON.stringify(r.assumptions)).toMatch(/crossover_not_computed/);
    expect(JSON.stringify(r.assumptions)).toMatch(/correlation/i);
    // And it must NOT claim to be a crossover answer.
    expect(r.method).not.toMatch(/crossover/i);
  });

  it('applies attrition to the crossover total', () => {
    const r = engine.computeEnhanced({ ...crossover, attritionRate: 0.2 } as StatisticalInput);
    // 32 subjects needed, 20% lost ⇒ ceil(32 / 0.8) = 40.
    expect(r.sampleSize.total).toBe(40);
  });
});

describe('an AUC/ROC endpoint is sized by the AUC method, on any track', () => {
  const auc = { ...base, endpointType: 'auc_roc', aucTarget: 0.85, aucNull: 0.5 } as unknown as StatisticalInput;

  it.each(['biotech_pharma', 'medical_device', 'diagnostics_ivd'] as const)(
    'computes rather than refusing on the %s track',
    (clientTrack) => {
      const r = engine.compute({ ...auc, clientTrack } as StatisticalInput);
      // 10 diseased + 10 non-diseased (Hanley & McNeil 1982).
      expect(r.sampleSize.perGroup).toBe(10);
      expect(r.sampleSize.total).toBe(20);
      expect(r.method).toMatch(/AUC/);
      expect(r.method).toMatch(/Hanley/i);
    },
  );

  it('does not ask for sensitivity, a field an ROC design does not carry', () => {
    let thrown: unknown = null;
    try {
      engine.compute(auc);
    } catch (err) {
      thrown = err;
    }
    expect(thrown).toBeNull();
  });

  it('carries the expected AUC and its interval through to the result', () => {
    const r = engine.computeEnhanced(auc);
    expect(r.diagnosticMetrics?.auc).toBe(0.85);
    expect(r.diagnosticMetrics?.aucCI?.lower).toBeGreaterThan(0.5);
    expect(r.diagnosticMetrics?.aucCI?.upper).toBeLessThanOrEqual(1);
  });

  it('still refuses an AUC design with no target AUC, naming that field', () => {
    expect(() => engine.compute({ ...base, endpointType: 'auc_roc' } as StatisticalInput)).toThrow(/aucTarget/);
  });

  it('records the null AUC it used when none was given', () => {
    const r = engine.compute({ ...base, endpointType: 'auc_roc', aucTarget: 0.85 } as StatisticalInput);
    expect(r.method).toMatch(/chance level/i);
  });
});
