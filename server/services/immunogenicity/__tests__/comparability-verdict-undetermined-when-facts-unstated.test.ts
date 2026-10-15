/**
 * An immunogenicity comparability verdict is decided only by stated facts; an
 * unstated fact is listed in notAssessed, never assumed (2026-10-15).
 *
 * What the code used to do: `analyticalComparable ?? false`,
 * `productRiskTier ?? 'moderate'` and `comparativeClinicalStudyPlanned ?? true`,
 * and each unstated affects* trigger counted as "does not affect".
 * `{ context: 'manufacturing_change' }` came back change impact MAJOR, a
 * clinical immunogenicity study required, the trigger "Analytical/structural
 * comparability not yet demonstrated" and "rests on pending analytical
 * comparability", none of it stated. Add `analyticalComparable: true` and the
 * same unstated triggers and tier read MINOR, no study needed. A biosimilar
 * with no stated plan was told the study IS recommended. A missing context
 * crashed with a TypeError (AnA: "failed"), and an unknown one was assessed as
 * an ICH Q5E change.
 */
import { describe, expect, it } from 'vitest';
import {
  assessImmunogenicityComparability,
  type ComparabilityParams,
} from '../immunogenicity-knowledge';
import { getToolHandler } from '../../ana/AnaToolExecutor.js';

const NO_TRIGGERS = {
  affectsAggregation: false,
  affectsGlycosylation: false,
  affectsFormulation: false,
  affectsImpurities: false,
};

const assess = (p: Record<string, unknown>) =>
  assessImmunogenicityComparability(p as unknown as ComparabilityParams);

const inputs = (r: { notAssessed: Array<{ input: string }> }) => r.notAssessed.map((n) => n.input).sort();

function thrown(fn: () => unknown): { name?: string; code?: string; field?: string } | undefined {
  try {
    fn();
  } catch (err) {
    return err as { name?: string; code?: string; field?: string };
  }
  return undefined;
}

describe('assessImmunogenicityComparability: an unstated fact decides no verdict', () => {
  it('context alone gives no impact and no study verdict, and lists every unstated input', () => {
    const r = assess({ context: 'manufacturing_change' });

    expect(r.changeImpact).toBe('undetermined');
    expect(r.clinicalImmunogenicityStudyRequired).toBeNull();
    expect(inputs(r)).toEqual([
      'affectsAggregation',
      'affectsFormulation',
      'affectsGlycosylation',
      'affectsImpurities',
      'analyticalComparable',
      'productRiskTier',
    ]);
    expect(r.riskFactorsTriggered).toEqual([]);
    expect(r.summary).toMatch(/UNDETERMINED/);
    expect(r.summary).not.toMatch(/MAJOR|MINOR|pending analytical comparability/);
  });

  it('does not read unstated triggers and tier as absent once analytical comparability is stated', () => {
    const r = assess({ context: 'manufacturing_change', analyticalComparable: true });

    expect(r.changeImpact).toBe('undetermined');
    expect(r.clinicalImmunogenicityStudyRequired).toBeNull();
    expect(r.studyRecommendation).not.toMatch(/no dedicated clinical immunogenicity study is anticipated/);
  });

  it('keeps a stated false visible, and decides MAJOR when nothing unstated can change it', () => {
    const r = assess({ context: 'manufacturing_change', analyticalComparable: false });

    expect(r.changeImpact).toBe('major');
    expect(r.clinicalImmunogenicityStudyRequired).toBe(true);
    expect(r.riskFactorsTriggered).toContain('Analytical/structural comparability not yet demonstrated.');
    expect(inputs(r)).toEqual([
      'affectsAggregation',
      'affectsFormulation',
      'affectsGlycosylation',
      'affectsImpurities',
      'productRiskTier',
    ]);

    const escalated = assess({ context: 'scale_up', analyticalComparable: true, affectsAggregation: true, productRiskTier: 'high' });
    expect(escalated.changeImpact).toBe('major');
    expect(escalated.clinicalImmunogenicityStudyRequired).toBe(true);
  });

  it('decides the study verdict when every reading of the unstated tier agrees, but not the impact', () => {
    const r = assess({ context: 'formulation_change', analyticalComparable: true, ...NO_TRIGGERS });

    expect(r.changeImpact).toBe('undetermined');
    expect(r.clinicalImmunogenicityStudyRequired).toBe(false);
    expect(inputs(r)).toEqual(['productRiskTier']);
  });

  it('gives the same verdicts as before once every input is stated', () => {
    const minor = assess({ context: 'site_transfer', analyticalComparable: true, ...NO_TRIGGERS, productRiskTier: 'low' });
    expect(minor.changeImpact).toBe('minor');
    expect(minor.clinicalImmunogenicityStudyRequired).toBe(false);
    expect(minor.notAssessed).toEqual([]);

    const moderate = assess({ context: 'site_transfer', analyticalComparable: true, ...NO_TRIGGERS, affectsImpurities: true, productRiskTier: 'moderate' });
    expect(moderate.changeImpact).toBe('moderate');
    expect(moderate.clinicalImmunogenicityStudyRequired).toBe(false);
  });

  it('does not assume a biosimilar study is planned; a stated plan stays decisive', () => {
    const unstated = assess({ context: 'biosimilar' });
    expect(unstated.changeImpact).toBe('major');
    expect(unstated.clinicalImmunogenicityStudyRequired).toBeNull();
    expect(inputs(unstated)).toContain('comparativeClinicalStudyPlanned');
    expect(unstated.summary).not.toMatch(/IS recommended/);

    expect(assess({ context: 'biosimilar', comparativeClinicalStudyPlanned: true }).clinicalImmunogenicityStudyRequired).toBe(true);
    expect(assess({ context: 'biosimilar', comparativeClinicalStudyPlanned: false }).clinicalImmunogenicityStudyRequired).toBe(false);
  });

  it('refuses a missing or unknown context and any value it cannot use, naming the field', () => {
    expect(thrown(() => assess({}))).toMatchObject({ name: 'ComputationRefusal', code: 'missing_input', field: 'context' });
    expect(thrown(() => assess({ context: 'tech_transfer' }))).toMatchObject({ code: 'invalid_input', field: 'context' });
    expect(thrown(() => assess({ context: 'scale_up', productRiskTier: 'undetermined' }))).toMatchObject({
      code: 'invalid_input',
      field: 'productRiskTier',
    });
    expect(thrown(() => assess({ context: 'scale_up', affectsAggregation: 'yes' }))).toMatchObject({
      code: 'invalid_input',
      field: 'affectsAggregation',
    });
  });
});

describe('assess_immunogenicity_comparability through AnA', () => {
  const call = async (input: Record<string, unknown>) =>
    JSON.parse(await getToolHandler('assess_immunogenicity_comparability')!(input as never, {} as never));

  it('serves context alone as an undetermined impact with no study verdict', async () => {
    const out = await call({ context: 'manufacturing_change' });

    expect(out.status).toBe('computed');
    expect(out.result.changeImpact).toBe('undetermined');
    expect(out.result.clinicalImmunogenicityStudyRequired).toBeNull();
  });

  it('relays a missing context as needs_parameters naming the field', async () => {
    const out = await call({});

    expect(out.status).toBe('needs_parameters');
    expect(out.field).toBe('context');
  });
});
