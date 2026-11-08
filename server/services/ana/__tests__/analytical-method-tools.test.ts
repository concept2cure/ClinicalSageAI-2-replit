import { describe, it, expect } from 'vitest';
import { getToolHandler } from '../AnaToolExecutor.js';
import { ALL_ANA_TOOLS } from '../AnaToolDefinitions.js';
import { shortfallOf } from '../tool-outcome.js';

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

describe('analytical precision cannot return an undefined numerical pass', () => {
  it.each([[-1, 1], [0, 0]])('asks for usable precision inputs for %j', async (...precision) => {
    const out = JSON.parse(await getToolHandler('assess_analytical_method_validation')!({
      linearity: [{ nominal: 0, response: 0 }, { nominal: 50, response: 100 }, { nominal: 100, response: 200 }],
      accuracy: { MID: 100 }, precision,
    }));
    expect(out).toEqual({ status: 'needs_parameters', message: expect.stringMatching(/precision.*mean.*non-zero.*RSD/i) });
    expect(shortfallOf(JSON.stringify(out))).toMatchObject({ kind: 'needs_input' });
  });

  it.each([
    [Number.MAX_VALUE, Number.MAX_VALUE], [1e307, 1e307],
    [1e200, 2e200], [1e-200, 2e-200], [1, -1, Number.MIN_VALUE * 3],
  ])('refuses unrepresentable precision %j without a computed or null-filled result', async (...precision) => {
    const out = JSON.parse(await getToolHandler('assess_analytical_method_validation')!({ precision }));
    expect(out).toEqual({ status: 'needs_parameters', message: expect.stringMatching(/precision.*must be/i) });
  });
});
