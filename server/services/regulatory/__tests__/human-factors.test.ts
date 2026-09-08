/**
 * Human factors (IEC 62366-1) — HFE/UE completeness and use-related risk.
 */

import { describe, it, expect } from 'vitest';
import { assessHfeCompleteness, analyzeUseRelatedRisk } from '../human-factors';

describe('assessHfeCompleteness', () => {
  it('all elements present → complete, score 1', () => {
    const r = assessHfeCompleteness({
      useSpecification: true,
      userProfiles: true,
      useEnvironments: true,
      userInterfaceCharacteristics: true,
      knownUseProblems: true,
      hazardRelatedUseScenarios: true,
      criticalTasks: true,
      formativeEvaluation: true,
      summativeEvaluation: true,
      hfeUeReport: true,
    });
    expect(r.complete).toBe(true);
    expect(r.completenessScore).toBeCloseTo(1, 10);
  });

  it('missing summative evaluation lowers the score and lists the gap', () => {
    const r = assessHfeCompleteness({
      useSpecification: true,
      userProfiles: true,
      useEnvironments: true,
      userInterfaceCharacteristics: true,
      knownUseProblems: true,
      hazardRelatedUseScenarios: true,
      criticalTasks: true,
      formativeEvaluation: true,
      // summativeEvaluation missing
      hfeUeReport: true,
    });
    expect(r.complete).toBe(false);
    expect(r.gaps).toEqual(['summativeEvaluation']);
    expect(r.completenessScore).toBeCloseTo(9 / 10, 8);
  });
});

describe('analyzeUseRelatedRisk', () => {
  const scenarios = [
    { task: 'Set dose', useError: 'Enters 10× dose', potentialHarmSeverity: 'critical' as const, mitigated: true },
    { task: 'Confirm patient', useError: 'Wrong patient', potentialHarmSeverity: 'serious' as const, mitigated: false },
    { task: 'Read label', useError: 'Misreads units', potentialHarmSeverity: 'minor' as const, mitigated: false },
  ];

  it('identifies critical tasks and flags unmitigated ones', () => {
    const r = analyzeUseRelatedRisk(scenarios);
    expect(r.criticalTaskCount).toBe(2); // critical + serious
    expect(r.unmitigatedCriticalTasks).toBe(1); // the serious one is unmitigated
    expect(r.criticalTaskGate).toBe('blocked');
    expect(r.criticalTasks.map(t => t.task)).toEqual(['Set dose', 'Confirm patient']);
  });

  it('critical-task gate is clear when all critical tasks are mitigated', () => {
    const r = analyzeUseRelatedRisk([
      { task: 'Set dose', useError: 'x', potentialHarmSeverity: 'critical', mitigated: true },
      { task: 'Read label', useError: 'y', potentialHarmSeverity: 'minor', mitigated: false },
    ]);
    expect(r.criticalTaskGate).toBe('clear');
    expect(r.criticalTaskCount).toBe(1);
  });

  /**
   * The state the old `residualRiskAcceptable: unmitigatedCriticalTasks === 0`
   * got wrong, and the reason this contract changed.
   *
   * `unmitigatedCriticalTasks` counts a filter over a filter over the scenarios
   * passed in. With no scenarios recorded both filters are vacuously empty, the
   * count is 0, and the old field reported `true` — "residual use-related risk
   * is acceptable" — for an HFE/UE file nothing had ever examined, in a result
   * object that is served straight through to an HFE/UE report. `not-assessed`
   * is the honest reading, and no acceptability is reported in ANY state: under
   * IEC 62366-1 that is a documented manufacturer determination, not a count.
   */
  it('reports NOT-ASSESSED, never acceptability, when no scenarios are recorded', () => {
    const r = analyzeUseRelatedRisk([]);
    // Asserted FIRST: this is the claim the old boolean got wrong, and it must
    // not be masked by a later assertion failing on the new field.
    expect(r).not.toHaveProperty('residualRiskAcceptable');
    expect(r.criticalTaskGate).toBe('not-assessed');
    expect(r.totalScenarios).toBe(0);
    expect(r.unmitigatedCriticalTasks).toBe(0); // vacuously — which is the whole point
  });

  it('never reports residual-risk acceptability, even with the gate clear', () => {
    const r = analyzeUseRelatedRisk([
      { task: 'Set dose', useError: 'x', potentialHarmSeverity: 'critical', mitigated: true },
    ]);
    expect(r.criticalTaskGate).toBe('clear');
    expect(r).not.toHaveProperty('residualRiskAcceptable');
  });

  /** The regulatory citation on the result is unchanged — asserted, not edited. */
  it('carries the unchanged IEC 62366-1 / FDA HFE framework label', () => {
    expect(analyzeUseRelatedRisk([]).framework).toBe('IEC 62366-1 / FDA HFE');
  });
});
