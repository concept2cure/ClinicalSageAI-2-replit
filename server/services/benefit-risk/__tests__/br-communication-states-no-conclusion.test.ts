/**
 * Rule 2 S3: plan_br_communication states no benefit-risk conclusion of its own
 * (2026-10-26).
 *
 * Until this change planBRCommunication defaulted an unstated verdict to
 * favourable_with_conditions, and with no key messages its core message read
 * "provides the demonstrated benefit in the indicated population, with
 * manageable, characterized risks; the overall benefit-risk balance is
 * favourable subject to risk management". AnA is told to report that message
 * verbatim, and every audience's materials must restate it. The tool's verdict
 * property advertised the default. The conclusion is the sponsor's, so an
 * unstated verdict is refused (needs_parameters through the tool), an absent
 * message is named as not stated, and the property says not to choose one.
 *
 * Every case fails on the pre-fix code except the two marked "still".
 */
import { describe, it, expect } from 'vitest';
import { planBRCommunication } from '../benefit-risk-knowledge';
import { getToolHandler } from '../../ana/AnaToolExecutor.js';
import { PLAN_BR_COMMUNICATION } from '../../ana/benefitRiskTools';

type Refusal = { name?: string; code?: string; field?: string; message?: string };

function refusal(params: unknown): Refusal | undefined {
  try {
    planBRCommunication(params as never);
  } catch (e) {
    return e as Refusal;
  }
  return undefined;
}

const BASE = { productName: 'DrugX', indication: 'metastatic NSCLC' };

describe("planBRCommunication: the benefit-risk conclusion is the sponsor's", () => {
  it('refuses an unstated verdict rather than planning a favourable one', () => {
    expect(refusal(BASE)).toMatchObject({ name: 'ComputationRefusal', code: 'missing_input', field: 'verdict' });
    expect(refusal({})?.message).toMatch(/the benefit-risk conclusion is the sponsor's/);
  });

  it('refuses a verdict outside the vocabulary rather than carrying it through', () => {
    expect(refusal({ ...BASE, verdict: 'positive' })).toMatchObject({
      name: 'ComputationRefusal',
      code: 'invalid_input',
      field: 'verdict',
    });
  });

  it('names absent key messages as not stated instead of inventing a benefit and a risk profile', () => {
    const r = planBRCommunication({ ...BASE, verdict: 'indeterminate' });
    expect(r.coreBenefitRiskMessage).not.toMatch(/demonstrated benefit/i);
    expect(r.coreBenefitRiskMessage).not.toMatch(/manageable, characterized risks/i);
    expect(r.coreBenefitRiskMessage).toMatch(/provides \[key benefit messages not stated\]/);
    expect(r.coreBenefitRiskMessage).toMatch(/principal risks being \[key risk messages not stated\]/);
    expect(r.notStated).toEqual(['keyBenefitMessages', 'keyRiskMessages']);
  });

  it('treats a blank message as not stated, not as the word "benefit"', () => {
    const r = planBRCommunication({
      ...BASE,
      verdict: 'favourable',
      keyBenefitMessages: ['   '],
      keyRiskMessages: ['interstitial lung disease'],
    });
    expect(r.coreBenefitRiskMessage).toMatch(/provides \[key benefit messages not stated\]/);
    expect(r.coreBenefitRiskMessage).toMatch(/principal risks being interstitial lung disease;/);
    expect(r.notStated).toEqual(['keyBenefitMessages']);
  });

  it('still plans from a stated verdict and stated messages, unchanged', () => {
    const r = planBRCommunication({
      ...BASE,
      verdict: 'favourable_with_conditions',
      keyBenefitMessages: ['longer overall survival than docetaxel'],
      keyRiskMessages: ['interstitial lung disease'],
    });
    expect(r.verdict).toBe('favourable_with_conditions');
    expect(r.coreBenefitRiskMessage).toBe(
      'In metastatic NSCLC, DrugX provides longer overall survival than docetaxel, with the principal risks ' +
        'being interstitial lung disease; the overall benefit-risk balance is favourable subject to risk management. ' +
        'All audience-specific materials must restate this same core balance without strengthening the benefit or ' +
        'softening the risk.',
    );
    expect(r.audiencePlans).toHaveLength(6);
  });
});

describe('plan_br_communication: AnA asks for the conclusion', () => {
  const call = async (input: Record<string, unknown>) =>
    JSON.parse(await getToolHandler('plan_br_communication')!(input as never, {} as never));

  it('returns needs_parameters naming verdict, with no plan and no core message', async () => {
    const out = await call(BASE);
    expect(out.status).toBe('needs_parameters');
    expect(out.field).toBe('verdict');
    expect(out.message).toMatch(/the benefit-risk conclusion is the sponsor's/);
    expect(out).not.toHaveProperty('result');
    expect(out).not.toHaveProperty('error');
    expect(JSON.stringify(out)).not.toMatch(/favourable subject to risk management|manageable, characterized risks/);
  });

  it('still computes once the verdict is stated', async () => {
    const out = await call({ ...BASE, verdict: 'unfavourable' });
    expect(out.status).toBe('computed');
    expect(out.result.verdict).toBe('unfavourable');
  });

  it('its verdict property names no default and tells the model not to choose one', () => {
    const props = PLAN_BR_COMMUNICATION.input_schema.properties as Record<string, { description: string }>;
    expect(props.verdict.description).not.toMatch(/default/i);
    expect(props.verdict.description).toMatch(/sponsor's/);
    expect(props.verdict.description).toMatch(/do not choose or infer one/);
    // Schema-required would push the model to supply a verdict to satisfy the schema: the invention removed here.
    expect(PLAN_BR_COMMUNICATION.input_schema.required ?? []).not.toContain('verdict');
  });
});
