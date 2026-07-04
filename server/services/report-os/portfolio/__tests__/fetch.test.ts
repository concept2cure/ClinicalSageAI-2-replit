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
  it('maps a healthy run to a ready member', () => {
    const m = toMemberInsight(7, 'BX-204', computed({ confidence: 85 }));
    expect(m).toMatchObject({
      projectId: 7,
      name: 'BX-204',
      readinessScore: 85,
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

  it('maps mid confidence with no critical blockers to partial', () => {
    expect(toMemberInsight(1, 'P', computed({ confidence: 40 })).status).toBe('partial');
  });

  it('clamps confidence into 0..100 and surfaces up to 3 blocker themes', () => {
    const m = toMemberInsight(1, 'P', computed({
      confidence: 130,
      blockers: ['a', 'b', 'c', 'd'],
    }));
    expect(m.readinessScore).toBe(100);
    expect(m.topBlockers).toEqual(['a', 'b', 'c']);
  });
});
