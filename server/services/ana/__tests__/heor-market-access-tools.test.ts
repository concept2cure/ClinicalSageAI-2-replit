/**
 * Verifies the two HEOR / market-access tools are (a) registered as AnA tool
 * handlers and (b) wired to the comparator-mix engine
 * (server/services/heor/market-access-models.ts) with correct argument mapping,
 * by exercising each through the public getToolHandler() seam and checking the
 * deterministic envelope. Mirrors statistical-design-tools.test.ts.
 */
import { describe, it, expect } from 'vitest';

import { getToolHandler } from '../AnaToolExecutor';
import { HEOR_MARKET_ACCESS_TOOLS } from '../heorTools';

const ctx = {} as any;

async function call(name: string, input: Record<string, unknown>) {
  const handler = getToolHandler(name);
  expect(handler, `handler for ${name} must be registered`).toBeTruthy();
  const raw = await handler!(input, ctx);
  return JSON.parse(raw as string);
}

describe('HEOR market-access tools — registration', () => {
  it('every defined tool has a registered handler', () => {
    for (const tool of HEOR_MARKET_ACCESS_TOOLS) {
      expect(getToolHandler(tool.name), `${tool.name} handler`).toBeTruthy();
    }
    expect(HEOR_MARKET_ACCESS_TOOLS).toHaveLength(2);
  });
});

describe('HEOR market-access tools — budget impact (comparator mix)', () => {
  it('returns the hand-computable cumulative net budget impact', async () => {
    // 10,000 eligible; uptake 10/20/30%; new $12,000; comparator mix blends to
    // $2,000 → net per year = newPatients × (12,000 − 2,000) = newPatients × 10,000.
    // Y1 1,000×10k = 10M; Y2 2,000×10k = 20M; Y3 3,000×10k = 30M; cumulative 60M.
    const out = await call('model_budget_impact_mix', {
      eligiblePopulation: 10_000,
      uptakeCurve: [0.1, 0.2, 0.3],
      newPerPatientCost: 12_000,
      comparatorMix: [
        { name: 'A', share: 0.5, perPatientCost: 1_000 },
        { name: 'B', share: 0.5, perPatientCost: 3_000 },
      ],
    });
    expect(out.status).toBe('computed');
    expect(out.engine).toBe('deterministic');
    expect(out.result.blendedComparatorCost).toBe(2_000);
    expect(out.result.perYear).toHaveLength(3);
    expect(out.result.perYear[0].netBudgetImpact).toBe(10_000_000);
    expect(out.result.perYear[1].netBudgetImpact).toBe(20_000_000);
    expect(out.result.perYear[2].netBudgetImpact).toBe(30_000_000);
    expect(out.result.cumulativeNetBudgetImpact).toBe(60_000_000);
    // Undiscounted: discounted total equals the undiscounted total.
    expect(out.result.cumulativeDiscountedNetBudgetImpact).toBe(60_000_000);
  });

  it('reports cost saving (negative cumulative) when the new world is cheaper', async () => {
    const out = await call('model_budget_impact_mix', {
      eligiblePopulation: 1_000,
      uptakeCurve: [0.5],
      newPerPatientCost: 500,
      comparatorMix: [{ share: 1, perPatientCost: 2_000 }],
    });
    expect(out.status).toBe('computed');
    // 500 patients × (500 − 2,000) = −750,000.
    expect(out.result.cumulativeNetBudgetImpact).toBe(-750_000);
  });

  it('relays an out-of-balance comparator mix as needs_parameters', async () => {
    const out = await call('model_budget_impact_mix', {
      eligiblePopulation: 1_000,
      uptakeCurve: [0.5],
      newPerPatientCost: 500,
      comparatorMix: [{ share: 0.4, perPatientCost: 2_000 }], // shares ≠ 1
    });
    expect(out.status).toBe('needs_parameters');
    expect(typeof out.message).toBe('string');
  });
});

describe('HEOR market-access tools — cost-effectiveness (NMB)', () => {
  it('computes ICER = incrementalCost / incrementalEffect for known inputs', async () => {
    const out = await call('model_cost_effectiveness_nmb', {
      interventionCost: 50_000,
      interventionEffectiveness: 5,
      comparatorCost: 30_000,
      comparatorEffectiveness: 4,
      willingnessToPay: 50_000,
    });
    expect(out.status).toBe('computed');
    expect(out.engine).toBe('deterministic');
    expect(out.result.incrementalCost).toBe(20_000);
    expect(out.result.incrementalEffectiveness).toBe(1);
    expect(out.result.icer).toBe(20_000); // 20,000 / 1
    // NMB = 50,000 × 1 − 20,000 = 30,000 (> 0 ⇒ cost-effective at this WTP).
    expect(out.result.netMonetaryBenefit).toBe(30_000);
    expect(out.result.costEffective).toBe(true);
    expect(out.result.dominant).toBe(false);
    expect(out.result.dominated).toBe(false);
  });

  it('flags a dominant intervention (cheaper AND more effective)', async () => {
    const out = await call('model_cost_effectiveness_nmb', {
      interventionCost: 20_000,
      interventionEffectiveness: 6,
      comparatorCost: 30_000,
      comparatorEffectiveness: 4,
      willingnessToPay: 50_000,
    });
    expect(out.status).toBe('computed');
    expect(out.result.dominant).toBe(true);
    expect(out.result.dominated).toBe(false);
    expect(out.result.costEffective).toBe(true);
  });

  it('NMB sign flips around the WTP threshold (ICER = 40,000)', async () => {
    const base = {
      interventionCost: 80_000,
      interventionEffectiveness: 5,
      comparatorCost: 40_000,
      comparatorEffectiveness: 4,
    }; // ΔC = 40,000; ΔE = 1; ICER = 40,000.
    const below = await call('model_cost_effectiveness_nmb', { ...base, willingnessToPay: 30_000 });
    const above = await call('model_cost_effectiveness_nmb', { ...base, willingnessToPay: 50_000 });
    // WTP < ICER ⇒ NMB < 0 (not cost-effective); WTP > ICER ⇒ NMB > 0.
    expect(below.result.netMonetaryBenefit).toBeLessThan(0);
    expect(below.result.costEffective).toBe(false);
    expect(above.result.netMonetaryBenefit).toBeGreaterThan(0);
    expect(above.result.costEffective).toBe(true);
  });

  it('reports a null ICER when effects are equal', async () => {
    const out = await call('model_cost_effectiveness_nmb', {
      interventionCost: 20_000,
      interventionEffectiveness: 4,
      comparatorCost: 10_000,
      comparatorEffectiveness: 4,
      willingnessToPay: 50_000,
    });
    expect(out.status).toBe('computed');
    expect(out.result.icer).toBeNull();
  });

  it('relays an invalid input as needs_parameters (does not throw)', async () => {
    const out = await call('model_cost_effectiveness_nmb', {
      interventionCost: 50_000,
      interventionEffectiveness: 5,
      comparatorCost: 30_000,
      comparatorEffectiveness: 4,
      willingnessToPay: -1, // invalid
    });
    expect(out.status).toBe('needs_parameters');
    expect(typeof out.message).toBe('string');
  });
});
