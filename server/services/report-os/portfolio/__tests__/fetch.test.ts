import { describe, it, expect } from 'vitest';
import { riskFromBlockers, toMemberInsight } from '../fetch';
import type { RunComputationResult } from '../../orchestrator';

function computed(over: Partial<RunComputationResult>): RunComputationResult {
  return {
    providers: [],
    confidence: 80,
    blockers: [],
    criticalBlockers: [],
    summary: {},
    ...over,
  };
}

describe('riskFromBlockers', () => {
  it('escalates with the count of critical blockers', () => {
    expect(riskFromBlockers(0)).toBe('low');
    expect(riskFromBlockers(1)).toBe('medium');
    expect(riskFromBlockers(2)).toBe('high');
    expect(riskFromBlockers(3)).toBe('critical');
    expect(riskFromBlockers(9)).toBe('critical');
  });
});

describe('toMemberInsight', () => {
  /* Status is the evaluator's verdict (the run's submission_readiness row), not
     `confidence >= 70` (QA 2026-10-08, j8: a program whose readiness was not
     computed read "ready"). */
  const readiness = (status: 'ready' | 'partial' | 'missing') => [
    { provider: 'submission_readiness', observedAt: '2026-10-08T00:00:00Z', status },
  ];

  it('maps a healthy run to a ready member, readiness from the evaluation, not the confidence', () => {
    const m = toMemberInsight(7, 'BX-204', computed({ confidence: 85, providers: readiness('ready'), summary: { regulatory: { readinessScore: 72 } } }));
    expect(m).toMatchObject({
      projectId: 7,
      name: 'BX-204',
      readinessScore: 72,
      confidence: 85,
      status: 'ready',
      criticalBlockerCount: 0,
      riskLevel: 'low',
    });
  });

  it('never claims "ready" while a critical blocker is open', () => {
    const m = toMemberInsight(1, 'P', computed({ confidence: 95, criticalBlockers: ['missing IB'] }));
    expect(m.status).toBe('missing');
    expect(m.criticalBlockerCount).toBe(1);
    expect(m.riskLevel).toBe('medium');
  });

  it('maps a partial evaluation with no critical blockers to partial', () => {
    expect(toMemberInsight(1, 'P', computed({ confidence: 40, providers: readiness('partial') })).status).toBe('partial');
  });

  it('is not "ready" when readiness was not computed, whatever the confidence says', () => {
    const m = toMemberInsight(1, 'C2C-001', computed({ confidence: 75, providers: readiness('missing') }));
    expect(m.status).toBe('missing');
    expect(toMemberInsight(1, 'No row', computed({ confidence: 95 })).status).toBe('missing');
  });

  it('carries no confidence when the run measured none', () => {
    expect(toMemberInsight(1, 'P', computed({ confidence: null })).confidence).toBeNull();
  });

  it('clamps confidence and readiness into 0..100 and surfaces up to 3 blocker themes', () => {
    const m = toMemberInsight(1, 'P', computed({
      confidence: 130,
      blockers: ['a', 'b', 'c', 'd'],
      summary: { regulatory: { readinessScore: 130 } },
    }));
    expect(m.confidence).toBe(100);
    expect(m.readinessScore).toBe(100);
    expect(m.topBlockers).toEqual(['a', 'b', 'c']);
  });

  /* Reporting review 2026-10-01: readinessScore was the run's confidence, a
     blocker count clamped to [25, 95], so a program with nothing in it read
     "25% ready" on the canvas, the regional comparison and the portfolio rings. */
  it('reads no readiness when the run evaluated none, whatever its confidence', () => {
    expect(toMemberInsight(1, 'Empty', computed({ confidence: 25 })).readinessScore).toBeNull();
    expect(toMemberInsight(1, 'Busy', computed({ confidence: 95 })).readinessScore).toBeNull();
  });
});
