import { describe, expect, it } from 'vitest';
import { getToolHandler } from '../AnaToolExecutor';
import { NARRATE_STATISTICAL_RESULT } from '../evidence-literature-tool-defs';
import { narrateStatisticalResult, type StatResultInput } from '../statistical-narrator';

const context = {
  method: 'frequentist', hypothesis: 'superiority', sidedness: 'two_sided',
  alpha: 0.05, prespecified: true, exploratory: false,
};
const values = { endpoint: 'prespecified endpoint', analysisType: 'continuous' as const, measure: 'mean difference' as const, estimate: 1.234567891, ciLower: 0.123456789, ciUpper: 2.345678912, ciLevel: 95, pValue: 0.0000123456789 };
const supported = { ...values, ...context, multiplicityControlled: true };
const call = async (input: Record<string, unknown>) => {
  const handler = getToolHandler('narrate_statistical_result');
  expect(handler).toBeDefined();
  return JSON.parse(await handler!(input, {} as never) as string);
};
const wire = {
  ...context, analysis_type: 'continuous', endpoint: values.endpoint, measure: values.measure,
  estimate: values.estimate, ci_lower: values.ciLower, ci_upper: values.ciUpper, ci_level: 95,
  p_value: values.pValue, multiplicity_controlled: true,
};

describe('the actual statistical narration tool preserves source precision and standing', () => {
  it('preserves every finite supplied value without rounding or replacing a small p-value with a threshold', async () => {
    const out = await call(wire);
    for (const value of [values.estimate, values.ciLower, values.ciUpper, values.pValue]) expect(out.narrative).toContain(String(value));
    expect(out.narrative).not.toContain('p<0.001');
    expect(out.significant).toBe(true);
    expect(out.statementStrength).toBe('confirmatory');
    expect(out.figureSource).toBe('as-given');
    expect(out.figureSourceNote).toContain('None was read from a retained analysis run');
    expect(out.figureSourceNote).toContain('scientific review');
  });

  it('keeps an otherwise significant legacy call descriptive when method and hypothesis were not supplied', async () => {
    const out = await call({ endpoint: 'response', analysis_type: 'binary', measure: 'OR', estimate: 1.8, ci_lower: 1.1, ci_upper: 3.0, p_value: 0.02 });
    expect(out.significant).toBeNull();
    expect(out.statementStrength).toBe('descriptive');
    expect(out.flags.join(' ')).toMatch(/method.*hypothesis|analysis context/i);
  });

  it.each([
    ['Bayesian', { method: 'bayesian', hypothesis: 'superiority' }],
    ['noninferiority', { hypothesis: 'non_inferiority' }],
    ['equivalence', { hypothesis: 'equivalence' }],
    ['one-sided', { sidedness: 'one_sided' }],
    ['unrecognized', { method: 'unrecognized-method' }],
  ])('does not turn %s analysis into a superiority conclusion', async (_name, patch) => {
    const out = await call({ ...wire, ...patch });
    expect(out.significant).toBeNull();
    expect(out.statementStrength).toBe('descriptive');
    expect(out.narrative).not.toMatch(/reached statistical significance|demonstrated.*difference/i);
    expect(out.flags.join(' ')).toMatch(/unsupported|not supported|not assessed/i);
  });

  it('does not privilege an interval over a contradictory p-value', async () => {
    const out = await call({ ...wire, p_value: 0.3 });
    expect(out.significant).toBeNull();
    expect(out.statementStrength).toBe('descriptive');
    expect(out.flags.join(' ')).toMatch(/conflict|inconsisten/i);
  });

  it('does not relabel a Bayesian interval as a confidence interval', async () => {
    const out = await call({ ...wire, method: 'bayesian' });
    expect(out.narrative).not.toMatch(/95% CI|confidence interval/i);
    expect(out.narrative).toContain('95% reported interval');
    expect(out.narrative).toContain(String(values.ciLower));
    expect(out.narrative).toContain(String(values.ciUpper));
    expect(out.significant).toBeNull();
    expect(out.flags.join(' ')).toMatch(/unsupported/i);
  });

  it('does not judge an unsupported noninferiority result by superiority CI and p-value criteria', async () => {
    const out = await call({ ...wire, hypothesis: 'non_inferiority', sidedness: 'one_sided',
      estimate: 0.1, ci_lower: -0.2, ci_upper: 0.4, ci_level: 95, p_value: 0.01, alpha: 0.025 });
    expect(out.significant).toBeNull();
    expect(out.statementStrength).toBe('descriptive');
    expect(out.flags.join(' ')).toMatch(/unsupported/i);
    expect(out.flags.join(' ')).not.toMatch(/conflicting superiority|interval level and alpha are inconsistent/i);
  });

  it('does not use a 95% interval as the decision rule at a stricter alpha', async () => {
    const out = await call({ ...wire, alpha: 0.01 });
    expect(out.significant).toBeNull();
    expect(out.statementStrength).toBe('descriptive');
    expect(out.flags.join(' ')).toMatch(/interval.*alpha|confidence.*alpha/i);
  });

  it.each([
    ['uncontrolled multiplicity', { multiplicity_controlled: false }],
    ['unknown multiplicity', { multiplicity_controlled: undefined }],
    ['post hoc', { prespecified: false }],
    ['unknown prespecification', { prespecified: undefined }],
    ['unknown exploratory standing', { exploratory: undefined }],
  ])('does not grant confirmatory standing for %s', async (_name, patch) => {
    const out = await call({ ...wire, ...patch });
    expect(out.statementStrength).not.toBe('confirmatory');
    expect(out.narrative).not.toContain('reached statistical significance');
  });

  it('does not infer lack of clinical meaningfulness from a nonsignificant p-value', async () => {
    const out = await call({ ...wire, estimate: 0.4, ci_lower: -0.2, ci_upper: 1, p_value: 0.2 });
    expect(out.significant).toBe(false);
    expect(out.narrative).not.toContain('a clinically meaningful effect cannot be concluded');
    expect(out.flags.join(' ')).toMatch(/clinical relevance/i);
  });

  it('describes supported inference and unassessed methods in its callable definition', () => {
    expect(NARRATE_STATISTICAL_RESULT.description).toMatch(/two.sided.*superiority/i);
    expect(NARRATE_STATISTICAL_RESULT.description).toMatch(/descriptive|not assessed/i);
    for (const key of ['method', 'hypothesis', 'sidedness', 'prespecified']) expect(NARRATE_STATISTICAL_RESULT.input_schema.properties).toHaveProperty(key);
  });
});

describe('invalid or incomplete statistical values never become confident authoring conclusions', () => {
  it.each([
    ['infinite estimate', { estimate: Infinity }],
    ['NaN estimate', { estimate: NaN }],
    ['negative p-value', { pValue: -0.1 }],
    ['p-value above one', { pValue: 1.1 }],
    ['reversed interval', { ciLower: 3, ciUpper: 2 }],
    ['missing interval end', { ciUpper: undefined }],
    ['invalid confidence level', { ciLevel: 105 }],
    ['invalid alpha', { alpha: 0 }],
    ['point outside interval', { estimate: 8 }],
  ])('%s is explicit and unassessed', (_name, patch) => {
    const out = narrateStatisticalResult({ ...supported, ...patch } as StatResultInput);
    expect(out.significant).toBeNull();
    expect(out.statementStrength).toBe('descriptive');
    expect(out.flags.join(' ')).toMatch(/invalid|incomplete|outside/i);
    expect(out.narrative).not.toMatch(/Infinity|NaN|reached statistical significance/);
  });

  it('does not invent a 95% confidence level when no level was reported', () => {
    const out = narrateStatisticalResult({ ...supported, ciLevel: undefined });
    expect(out.significant).toBeNull();
    expect(out.narrative).not.toContain('95%');
    expect(out.flags.join(' ')).toMatch(/confidence level|interval level/i);
  });

  it('reports valid p-only inference only when the decision context is explicit', () => {
    const out = narrateStatisticalResult({ ...context, endpoint: 'response', analysisType: 'binary', pValue: 0.0034, multiplicityControlled: true });
    expect(out.significant).toBe(true);
    expect(out.narrative).toContain('p=0.0034');
    expect(out.statementStrength).toBe('confirmatory');
  });
});
