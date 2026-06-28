import { describe, it, expect } from 'vitest';
import { getToolHandler } from '../AnaToolExecutor.js';
import { ALL_ANA_TOOLS } from '../AnaToolDefinitions.js';

describe('estimate_shelf_life tool', () => {
  it('is defined and registered', () => {
    expect(ALL_ANA_TOOLS.map(t => t.name)).toContain('estimate_shelf_life');
    expect(typeof getToolHandler('estimate_shelf_life')).toBe('function');
  });

  it('computes a shelf life for declining potency', async () => {
    const out = JSON.parse(await getToolHandler('estimate_shelf_life')!({
      data: [{ time: 0, value: 101 }, { time: 6, value: 99 }, { time: 12, value: 97 }, { time: 18, value: 95.6 }],
      specLimit: 95, direction: 'decreasing',
    }));
    expect(out.status).toBe('computed');
    expect(out.result.regression.slope).toBeLessThan(0);
    expect(out.result.shelfLife).toBeGreaterThan(0);
  });

  it('returns needs_parameters on bad input', async () => {
    const out = JSON.parse(await getToolHandler('estimate_shelf_life')!({ data: [{ time: 0, value: 1 }], specLimit: 0, direction: 'decreasing' }));
    expect(out.status).toBe('needs_parameters');
  });
});
