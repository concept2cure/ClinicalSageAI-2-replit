import { describe, it, expect } from 'vitest';
import { getToolHandler } from '../AnaToolExecutor.js';
import { ALL_ANA_TOOLS } from '../AnaToolDefinitions.js';

const names = ALL_ANA_TOOLS.map(t => t.name);

describe('deepening tools — registration', () => {
  it.each(['assess_batch_poolability', 'assess_benefit_risk'])('%s is defined and registered', (name) => {
    expect(names).toContain(name);
    expect(typeof getToolHandler(name)).toBe('function');
  });
});

describe('assess_batch_poolability', () => {
  it('decides poolability and a shelf life', async () => {
    const out = JSON.parse(await getToolHandler('assess_batch_poolability')!({
      batches: [
        { batchId: 'A', data: [{ time: 0, value: 101.2 }, { time: 6, value: 98.7 }, { time: 12, value: 97.3 }, { time: 18, value: 95.2 }] },
        { batchId: 'B', data: [{ time: 0, value: 100.6 }, { time: 6, value: 99.3 }, { time: 12, value: 96.8 }, { time: 18, value: 95.6 }] },
      ],
      specLimit: 95, direction: 'decreasing',
    }));
    expect(out.status).toBe('computed');
    expect(['pooled', 'minimum-of-batches']).toContain(out.result.decision);
    expect(out.result.slopeTest).toHaveProperty('pValue');
  });
  it('requires ≥2 batches', async () => {
    const out = JSON.parse(await getToolHandler('assess_batch_poolability')!({ batches: [{ batchId: 'A', data: [{ time: 0, value: 1 }, { time: 1, value: 1 }, { time: 2, value: 1 }] }], specLimit: 0, direction: 'decreasing' }));
    expect(out.status).toBe('needs_parameters');
  });
});

describe('assess_benefit_risk', () => {
  it('computes a structured benefit-risk result', async () => {
    const out = JSON.parse(await getToolHandler('assess_benefit_risk')!({
      benefits: [{ name: 'Efficacy', weight: 3, score: 80 }],
      risks: [{ name: 'AEs', weight: 1, score: 30 }],
    }));
    expect(out.status).toBe('computed');
    expect(out.result.favorability).toBe('favorable');
    expect(out.result.disclaimer).toMatch(/decision aid/i);
  });
  it('validates inputs', async () => {
    const out = JSON.parse(await getToolHandler('assess_benefit_risk')!({ benefits: [], risks: [{ name: 'R', weight: 1, score: 1 }] }));
    expect(out.status).toBe('needs_parameters');
  });
});
