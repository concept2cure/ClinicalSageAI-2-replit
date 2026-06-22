import { describe, it, expect } from 'vitest';
import { getToolHandler } from '../AnaToolExecutor.js';
import { ALL_ANA_TOOLS } from '../AnaToolDefinitions.js';

describe('assess_analytical_method_validation tool', () => {
  it('is defined and registered', () => {
    expect(ALL_ANA_TOOLS.map(t => t.name)).toContain('assess_analytical_method_validation');
    expect(typeof getToolHandler('assess_analytical_method_validation')).toBe('function');
  });

  it('computes linearity + precision + acceptance', async () => {
    const out = JSON.parse(await getToolHandler('assess_analytical_method_validation')!({
      linearity: [{ nominal: 0, response: 0 }, { nominal: 50, response: 100 }, { nominal: 100, response: 200 }],
      precision: [100, 101, 99],
    }));
    expect(out.status).toBe('computed');
    expect(out.result.linearity.r2).toBe(1);
    expect(out.result.assessed).toEqual(expect.arrayContaining(['linearity', 'precision']));
  });

  it('returns needs_parameters when nothing is supplied', async () => {
    const out = JSON.parse(await getToolHandler('assess_analytical_method_validation')!({}));
    expect(out.status).toBe('needs_parameters');
  });
});
