/**
 * An unstated immunogenicity risk factor is not assessed. It is never scored
 * as its most favourable value (audit finding 3, 2026-10-15).
 *
 * What the code used to do: assessImmunogenicityRisk filled every unstated
 * factor with a default (aggregation 'low', glycosylation 'human_like', route
 * IV, frequency 'intermittent', immune status 'immunocompetent') and scored it
 * as an observation, while the absent booleans (impurities, formulation,
 * endogenous counterpart, concomitant immunosuppression) contributed 0 and
 * were listed nowhere. `{ productType: 'human_recombinant' }` alone came back
 * tier LOW, score 18, and because the tier was low the NAb assay was dropped
 * from requiredStudies. AnA served that as `status: 'computed'` with "Report
 * these numbers verbatim". An unrecognised route or frequency was scored as a
 * "moderate assumption", and an unrecognised product type as a default
 * foreignness.
 */
import { describe, expect, it } from 'vitest';
import {
  assessImmunogenicityRisk,
  type ImmunogenicityRiskParams,
} from '../immunogenicity-knowledge';
import { getToolHandler } from '../../ana/AnaToolExecutor.js';

const ALL_STATED: ImmunogenicityRiskParams = {
  productType: 'human_recombinant',
  hasEndogenousCounterpart: false,
  aggregationLevel: 'low',
  glycosylation: 'human_like',
  hasImmunogenicImpurities: false,
  formulationRisk: false,
  route: 'intravenous',
  doseFrequency: 'intermittent',
  immuneStatus: 'immunocompetent',
  concomitantImmunosuppression: false,
};

const FACTOR_INPUTS = [
  'aggregationLevel',
  'concomitantImmunosuppression',
  'doseFrequency',
  'formulationRisk',
  'glycosylation',
  'hasEndogenousCounterpart',
  'hasImmunogenicImpurities',
  'immuneStatus',
  'route',
];

const NAB = 'Neutralizing antibody (NAb) assay';

function thrown(fn: () => unknown): { name?: string; code?: string; field?: string } | undefined {
  try {
    fn();
  } catch (err) {
    return err as { name?: string; code?: string; field?: string };
  }
  return undefined;
}

describe('assessImmunogenicityRisk: an unstated factor is not assessed', () => {
  it('productType alone gives no tier and no score, and lists every unstated factor', () => {
    const r = assessImmunogenicityRisk({ productType: 'human_recombinant' });

    expect(r.overallTier).toBe('undetermined');
    expect(r.riskScore).toBeNull();
    expect(r.notAssessed.map((n) => n.input).sort()).toEqual(FACTOR_INPUTS);
    expect(r.summary).toMatch(/UNDETERMINED/);
    expect(r.summary).not.toMatch(/\bLOW\b/);
  });

  it('scores no default as an observation', () => {
    const r = assessImmunogenicityRisk({ productType: 'human_recombinant' });

    expect(r.factorContributions.map((c) => c.factor)).toEqual(['Sequence foreignness']);
    expect(r.factorContributions.map((c) => c.observation).join('\n')).not.toMatch(
      /Aggregation level|Glycosylation status|Route:|Frequency:|Immune status/,
    );
  });

  it('keeps the NAb assay, because a low tier was never established', () => {
    const r = assessImmunogenicityRisk({ productType: 'human_recombinant' });
    expect(r.requiredStudies.map((s) => s.study)).toContain(NAB);
  });

  it('lists an absent boolean as not assessed; a stated false is assessed', () => {
    const missingOne = assessImmunogenicityRisk({ ...ALL_STATED, hasImmunogenicImpurities: undefined });
    expect(missingOne.notAssessed.map((n) => n.input)).toEqual(['hasImmunogenicImpurities']);
    expect(missingOne.overallTier).toBe('undetermined');
    expect(missingOne.riskScore).toBeNull();

    const stated = assessImmunogenicityRisk(ALL_STATED);
    expect(stated.notAssessed).toEqual([]);
    expect(
      stated.factorContributions.find((c) => c.factor === 'Process-related impurities')?.scoreContribution,
    ).toBe(0);
  });

  it('does not weigh a stated counterpart as redundant when redundancy was not stated', () => {
    const r = assessImmunogenicityRisk({ ...ALL_STATED, hasEndogenousCounterpart: true });

    expect(r.notAssessed.map((n) => n.input)).toEqual(['endogenousNonRedundant']);
    expect(r.riskScore).toBeNull();
    expect(r.factorContributions.find((c) => c.factor === 'Endogenous counterpart')).toBeUndefined();
    expect(r.requiredStudies.map((s) => s.study)).toContain(NAB);
  });

  it('gives a tier and a score once every factor is stated', () => {
    const r = assessImmunogenicityRisk(ALL_STATED);

    expect(r.overallTier).toBe('low');
    expect(r.riskScore).toBe(18);
    expect(r.requiredStudies.map((s) => s.study)).not.toContain(NAB);
  });

  it('refuses a missing productType and any value it cannot score, naming the field', () => {
    expect(thrown(() => assessImmunogenicityRisk({} as unknown as ImmunogenicityRiskParams))).toMatchObject({
      name: 'ComputationRefusal',
      code: 'missing_input',
      field: 'productType',
    });
    expect(
      thrown(() => assessImmunogenicityRisk({ productType: 'antibody_drug_conjugate' } as unknown as ImmunogenicityRiskParams)),
    ).toMatchObject({ name: 'ComputationRefusal', code: 'invalid_input', field: 'productType' });
    expect(
      thrown(() => assessImmunogenicityRisk({ ...ALL_STATED, route: 'nasal' } as unknown as ImmunogenicityRiskParams)),
    ).toMatchObject({ name: 'ComputationRefusal', code: 'invalid_input', field: 'route' });
    expect(
      thrown(() =>
        assessImmunogenicityRisk({ ...ALL_STATED, formulationRisk: 'no' } as unknown as ImmunogenicityRiskParams),
      ),
    ).toMatchObject({ name: 'ComputationRefusal', code: 'invalid_input', field: 'formulationRisk' });
  });
});

describe('assess_immunogenicity_risk through AnA', () => {
  const call = async (input: Record<string, unknown>) =>
    JSON.parse(await getToolHandler('assess_immunogenicity_risk')!(input as never, {} as never));

  it('serves productType alone as an undetermined tier with a null score', async () => {
    const out = await call({ productType: 'human_recombinant' });

    expect(out.status).toBe('computed');
    expect(out.result.overallTier).toBe('undetermined');
    expect(out.result.riskScore).toBeNull();
    expect(out.result.notAssessed.length).toBe(FACTOR_INPUTS.length);
  });

  it('relays a value it cannot score as needs_parameters naming the field', async () => {
    const out = await call({ ...ALL_STATED, route: 'nasal' });

    expect(out.status).toBe('needs_parameters');
    expect(out.field).toBe('route');
    expect(out).not.toHaveProperty('result');
  });
});
