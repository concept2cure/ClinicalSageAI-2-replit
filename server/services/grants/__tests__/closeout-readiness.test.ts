/**
 * assembleCloseoutReadiness (orchestration) — pure, no DB/LLM.
 * readyToClose is stricter than the finalize gate: it also requires no overdue
 * milestones, cost share met, and spending within the award.
 */

import { describe, it, expect } from 'vitest';
import { assembleCloseoutReadiness, evaluateCloseout, costShareStatus, type CloseoutReadinessInputs } from '../grants-logic';

const today = '2026-06-10';

function base(overrides: Partial<CloseoutReadinessInputs> = {}): CloseoutReadinessInputs {
  return {
    closeout: evaluateCloseout({ finalRpprSubmitted: true, finalFfrSubmitted: true, equipmentInventoryReturned: true, finalInvoicesReconciled: true }, '2026-01-01', today),
    outstandingMilestones: { count: 0, overdue: 0 },
    reportingObligations: [],
    costShare: costShareStatus(0, []),
    budget: { riskLevel: 'low', totalBudgeted: 100000, totalActual: 80000, overAllocated: false },
    ...overrides,
  };
}

describe('assembleCloseoutReadiness', () => {
  it('is ready to close when all items done, no overdue milestones, cost share met, spend within budget', () => {
    const r = assembleCloseoutReadiness(base());
    expect(r.readyToClose).toBe(true);
    expect(r.blockers).toEqual([]);
  });

  it('blocks on outstanding 2 CFR 200.344 items', () => {
    const r = assembleCloseoutReadiness(base({
      closeout: evaluateCloseout({ finalRpprSubmitted: false, finalFfrSubmitted: true, equipmentInventoryReturned: true, finalInvoicesReconciled: true }, '2026-01-01', today),
    }));
    expect(r.readyToClose).toBe(false);
    expect(r.blockers.some((b) => /Closeout item outstanding/.test(b))).toBe(true);
  });

  it('blocks on overdue milestones and on a cost-share shortfall', () => {
    const r = assembleCloseoutReadiness(base({
      outstandingMilestones: { count: 2, overdue: 1 },
      costShare: costShareStatus(50000, [{ amount: 20000 }]),
    }));
    expect(r.readyToClose).toBe(false);
    expect(r.blockers.some((b) => /overdue milestone/.test(b))).toBe(true);
    expect(r.blockers.some((b) => /Cost-share commitment not met/.test(b))).toBe(true);
  });

  it('warns (does not block) on over-budget spend', () => {
    const r = assembleCloseoutReadiness(base({ budget: { riskLevel: 'medium', totalBudgeted: 100000, totalActual: 120000, overAllocated: false } }));
    expect(r.readyToClose).toBe(true); // a warning, not a blocker
    expect(r.warnings.some((w) => /exceed budget/.test(w))).toBe(true);
  });
});
