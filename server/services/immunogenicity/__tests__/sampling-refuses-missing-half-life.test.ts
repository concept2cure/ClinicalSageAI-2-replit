/**
 * The immunogenicity sampling plan refuses to run without a stated half-life,
 * and it defaults no other input (audit finding 11, 2026-10-15).
 *
 * What the code used to do: `params.halfLife_days > 0 ? params.halfLife_days
 * : 1`. A missing, zero, negative or non-numeric half-life became 1 day, and
 * the washout (5 d), the follow-up (28 d) and a six-draw schedule were
 * computed from it and stated as fact. `{}` and `{ halfLife_days: -3 }` both
 * returned "Washout/trough basis = 5 days (5×t½ of 1 d)". riskTier
 * ('moderate'), doseFrequency ('intermittent'), treatmentDuration_weeks (12),
 * drawVolume_mL (5) and endogenousNonRedundant (false) were also defaulted,
 * and the result never said so. The AnA schema marks halfLife_days required,
 * but runStatsTool does not validate it, so AnA served the plan as computed.
 */
import { describe, expect, it } from 'vitest';
import {
  planImmunogenicitySampling,
  type ImmunogenicitySamplingParams,
} from '../immunogenicity-knowledge';
import { getToolHandler } from '../../ana/AnaToolExecutor.js';

function thrown(fn: () => unknown): { name?: string; code?: string; field?: string } | undefined {
  try {
    fn();
  } catch (err) {
    return err as { name?: string; code?: string; field?: string };
  }
  return undefined;
}

const plan = (p: Record<string, unknown>) =>
  planImmunogenicitySampling(p as unknown as ImmunogenicitySamplingParams);

describe('planImmunogenicitySampling: the half-life is required', () => {
  it('refuses a missing half-life instead of using 1 day', () => {
    expect(thrown(() => plan({}))).toMatchObject({
      name: 'ComputationRefusal',
      code: 'missing_input',
      field: 'halfLife_days',
    });
  });

  it.each([[-3], [0], [Number.NaN], ['21']])('refuses half-life %s', (halfLife) => {
    expect(thrown(() => plan({ halfLife_days: halfLife }))).toMatchObject({
      name: 'ComputationRefusal',
      code: 'invalid_input',
      field: 'halfLife_days',
    });
  });
});

// 2026-10-15 (later the same day): this block used to pin the defaults echoed
// in `assumed` (riskTier 'moderate', doseFrequency 'intermittent', 12 weeks,
// 5 mL, endogenousNonRedundant false). Echoing a default did not stop it from
// setting the follow-up, the draw count and the blood volume, so the defaults
// are gone: the inputs that set the schedule are refused when unstated, and
// the blood volume is null without a draw volume. See
// sampling-schedule-refuses-unstated-drivers.test.ts.
describe('planImmunogenicitySampling: no other input is defaulted', () => {
  it('refuses the inputs that set the schedule instead of assuming them', () => {
    expect(thrown(() => plan({ halfLife_days: 21 }))).toMatchObject({
      name: 'ComputationRefusal',
      code: 'missing_input',
      field: 'riskTier',
    });
  });

  it('assumes nothing when every input is stated', () => {
    const r = plan({
      halfLife_days: 21,
      riskTier: 'high',
      doseFrequency: 'chronic_weekly',
      treatmentDuration_weeks: 24,
      drawVolume_mL: 4,
      endogenousNonRedundant: false,
    });

    expect(r).not.toHaveProperty('assumed');
    expect(r.summary).not.toMatch(/Assumed/);
    expect(r.washout_days).toBe(105);
  });

  it('refuses a stated value it cannot use rather than defaulting it', () => {
    expect(thrown(() => plan({ halfLife_days: 21, drawVolume_mL: -5 }))).toMatchObject({
      code: 'invalid_input',
      field: 'drawVolume_mL',
    });
    expect(thrown(() => plan({ halfLife_days: 21, riskTier: 'undetermined' }))).toMatchObject({
      code: 'invalid_input',
      field: 'riskTier',
    });
  });
});

describe('plan_immunogenicity_sampling through AnA', () => {
  const call = async (input: Record<string, unknown>) =>
    JSON.parse(await getToolHandler('plan_immunogenicity_sampling')!(input as never, {} as never));

  it('relays a missing half-life as needs_parameters naming the field, with no schedule', async () => {
    const out = await call({});

    expect(out.status).toBe('needs_parameters');
    expect(out.field).toBe('halfLife_days');
    expect(out).not.toHaveProperty('result');
    expect(JSON.stringify(out)).not.toMatch(/5×t½ of 1 d/);
  });
});
