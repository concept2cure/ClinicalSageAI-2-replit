/**
 * The immunogenicity sampling plan computes no figure from an input nobody
 * stated: it refuses the inputs that set the schedule, and leaves the blood
 * volume null without a draw volume (2026-10-15).
 *
 * What the code used to do: SAMPLING_DEFAULTS filled riskTier 'moderate',
 * doseFrequency 'intermittent', treatmentDuration_weeks 12,
 * endogenousNonRedundant false and drawVolume_mL 5, and computed the
 * follow-up, the extended follow-up sample, the on-treatment draw count and
 * the blood volume from them. `{ halfLife_days: 21 }` came back "6 nominal ADA
 * draws (≈ 30 mL total at 5 mL/draw) … follow-up extends to ≈ 105 days". The
 * defaults were echoed in `assumed`, but every figure beside them was still
 * one nobody stated; a high tier or a non-redundant counterpart would have
 * given a longer follow-up and more draws.
 */
import { describe, expect, it } from 'vitest';
import {
  planImmunogenicitySampling,
  type ImmunogenicitySamplingParams,
} from '../immunogenicity-knowledge';
import { getToolHandler } from '../../ana/AnaToolExecutor.js';

const STATED = {
  halfLife_days: 21,
  riskTier: 'high',
  doseFrequency: 'chronic_weekly',
  treatmentDuration_weeks: 24,
  endogenousNonRedundant: false,
  drawVolume_mL: 4,
};

const plan = (p: Record<string, unknown>) =>
  planImmunogenicitySampling(p as unknown as ImmunogenicitySamplingParams);

function thrown(fn: () => unknown): { name?: string; code?: string; field?: string; message?: string } | undefined {
  try {
    fn();
  } catch (err) {
    return err as { name?: string; code?: string; field?: string; message?: string };
  }
  return undefined;
}

describe('planImmunogenicitySampling: the inputs that set the schedule are not assumed', () => {
  it('refuses a half-life alone, naming every unstated input that sets the schedule', () => {
    const err = thrown(() => plan({ halfLife_days: 21 }));

    expect(err).toMatchObject({ name: 'ComputationRefusal', code: 'missing_input', field: 'riskTier' });
    for (const input of ['riskTier', 'doseFrequency', 'treatmentDuration_weeks', 'endogenousNonRedundant']) {
      expect(err?.message).toContain(input);
    }
  });

  it.each(['riskTier', 'doseFrequency', 'treatmentDuration_weeks', 'endogenousNonRedundant'])(
    'refuses when only %s is unstated',
    (input) => {
      expect(thrown(() => plan({ ...STATED, [input]: undefined }))).toMatchObject({ code: 'missing_input', field: input });
    },
  );

  it('does not need a treatment duration for a single dose', () => {
    const r = plan({ ...STATED, doseFrequency: 'single', treatmentDuration_weeks: undefined, riskTier: 'low' });

    expect(r.totalNominalDraws).toBe(4);
  });

  it('leaves the blood volume null, not 5 mL a draw, when the draw volume is unstated', () => {
    const r = plan({ ...STATED, drawVolume_mL: undefined });

    expect(r.totalNominalDraws).toBe(9);
    expect(r.totalBloodVolume_mL).toBeNull();
    expect(r.summary).toMatch(/blood volume not computed: drawVolume_mL not stated/);
  });

  it('computes the same plan as before once every input is stated, with nothing assumed', () => {
    const r = plan(STATED);

    expect(r).toMatchObject({ washout_days: 105, followUpDuration_days: 168, totalNominalDraws: 9, totalBloodVolume_mL: 36 });
    expect(r).not.toHaveProperty('assumed');
    expect(r.summary).not.toMatch(/Assumed/);
  });
});

describe('plan_immunogenicity_sampling through AnA', () => {
  const call = async (input: Record<string, unknown>) =>
    JSON.parse(await getToolHandler('plan_immunogenicity_sampling')!(input as never, {} as never));

  it('relays a half-life alone as needs_parameters, with no schedule', async () => {
    const out = await call({ halfLife_days: 21 });

    expect(out.status).toBe('needs_parameters');
    expect(out.field).toBe('riskTier');
    expect(out).not.toHaveProperty('result');
  });
});
