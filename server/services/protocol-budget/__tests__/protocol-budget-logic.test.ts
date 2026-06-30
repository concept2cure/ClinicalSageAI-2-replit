/**
 * Protocol Budget pure logic — per-subject roll-up, F&A, feasibility. Pure, no DB/LLM.
 */

import { describe, it, expect } from 'vitest';
import { computeProtocolBudget, type BudgetItemView } from '../protocol-budget-logic';

const items: BudgetItemView[] = [
  { category: 'personnel', unitCost: 100, quantityPerSubject: 5 }, // 500
  { category: 'lab', unitCost: 50, quantityPerSubject: 4 }, // 200
  { category: 'procedure', unitCost: 300, quantityPerSubject: 1 }, // 300
];

describe('computeProtocolBudget', () => {
  it('rolls per-subject direct cost by category and applies F&A', () => {
    const s = computeProtocolBudget(items, { targetEnrollment: 100, sponsorPaymentPerSubject: 1500, indirectRatePct: 30 });
    expect(s.directPerSubject).toBe(1000); // 500+200+300
    expect(s.indirectPerSubject).toBe(300); // 30%
    expect(s.totalPerSubject).toBe(1300);
    expect(s.totalStudyCost).toBe(130000); // ×100
    expect(s.sponsorRevenue).toBe(150000); // 1500×100
    expect(s.margin).toBe(20000);
    expect(s.feasibility).toBe('funded');
    // categories sorted by per-subject desc
    expect(s.categories[0].category).toBe('personnel');
    expect(s.basis).toMatch(/2 CFR 200\.414/);
  });

  it('flags under_funded when sponsor revenue < total cost', () => {
    const s = computeProtocolBudget(items, { targetEnrollment: 10, sponsorPaymentPerSubject: 800, indirectRatePct: 30 });
    expect(s.totalPerSubject).toBe(1300);
    expect(s.margin).toBe((800 - 1300) * 10);
    expect(s.feasibility).toBe('under_funded');
  });

  it('is unknown when enrollment or sponsor payment is unset', () => {
    expect(computeProtocolBudget(items, { targetEnrollment: 0, sponsorPaymentPerSubject: 1500 }).feasibility).toBe('unknown');
    expect(computeProtocolBudget(items, { targetEnrollment: 50 }).feasibility).toBe('unknown');
    expect(computeProtocolBudget(items, { targetEnrollment: 50, sponsorPaymentPerSubject: null }).margin).toBeNull();
  });

  it('treats a missing F&A rate as 0% indirect', () => {
    const s = computeProtocolBudget(items, { targetEnrollment: 5, sponsorPaymentPerSubject: 1000 });
    expect(s.indirectPerSubject).toBe(0);
    expect(s.totalPerSubject).toBe(1000);
    expect(s.feasibility).toBe('funded'); // 1000 == 1000, margin 0 → funded
  });
});
