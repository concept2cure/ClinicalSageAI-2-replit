/**
 * S5b: the IVD traceability, scientific-validity and stability calculators, the QMS readiness check and the
 * designation eligibility check read no omitted or malformed input as an answer, and refuse it by field.
 *
 * What the code did before this change: none of the five engines checked a value. assess_iso17511_traceability
 * turned an omitted fact into a gap nobody stated and read commutabilityDemonstrated 'false' (text) as true, so the
 * chain was valid. assess_scientific_validity dropped an item with no directlyOnTarget, counted 'false' as on
 * target, scored an unknown source as nothing and crashed on evidence that was not a list. assess_shelf_life_stability
 * with no maxPercentChange returned shelfLife null ("no measurable degradation") and "out of spec", and read '10',
 * '30' and two points at one time as given. assess_accelerated_stability with no threshold or storage temperature
 * returned null, and storageTemperatureC '4' gave a shelf-life of 0. assess_qms counted 'CAPA' as no clause and
 * reported the QMS not ready. assess_pathway_eligibility called a designation with an unanswered criterion not
 * eligible (false) and read a criterion answered 'true' (text) as unanswered.
 */
import { describe, expect, it } from 'vitest';
import { assessTraceability } from '../../regulatory/iso-17511-traceability';
import { assessScientificValidity } from '../../regulatory/scientific-validity';
import { assessRealTimeStability, assessAcceleratedStability } from '../../stats/analytical-performance-extensions';
import { assessQmsReadiness, QMS_CLAUSES } from '../../market-specs/quality-system';
import { assessEligibility } from '../../market-specs/pathway-eligibility';
import { getToolHandler } from '../AnaToolExecutor';
import { IVD_LIFECYCLE_TOOLS } from '../ivdLifecycleTools';
import { ASSESS_PATHWAY_ELIGIBILITY, ASSESS_QMS } from '../submission-center-tool-defs';

/** ai-gateway/gateway.ts trims a longer tool description to this many characters for OpenAI-compatible providers. */
const OPENAI_MAX_TOOL_DESCRIPTION_CHARS = 1024;

const chain = {
  tier: 'si_unit', certifiedReferenceMaterial: true, referenceMeasurementProcedure: true, commutabilityDemonstrated: true,
  uncertaintyBudgetDocumented: true, unbrokenChain: true,
} satisfies Parameters<typeof assessTraceability>[0];
const CHAIN_FACTS = ['certifiedReferenceMaterial', 'referenceMeasurementProcedure', 'commutabilityDemonstrated',
  'uncertaintyBudgetDocumented', 'unbrokenChain'];
const validity = {
  analyte: 'PD-L1', clinicalCondition: 'NSCLC', intendedPurpose: 'patient selection',
  evidence: [
    { source: 'guidelines_consensus', reference: 'NCCN', directlyOnTarget: true },
    { source: 'peer_reviewed_studies', reference: 'doi:1', directlyOnTarget: true },
  ],
} satisfies Parameters<typeof assessScientificValidity>[0];
const realTime = {
  points: [{ time: 0, value: 100 }, { time: 30, value: 99 }, { time: 60, value: 98 }, { time: 90, value: 97 }],
  initialValue: 100, maxPercentChange: 10,
} satisfies Parameters<typeof assessRealTimeStability>[0];
const accelerated = {
  points: [{ temperatureC: 25, rateConstant: 0.001 }, { temperatureC: 37, rateConstant: 0.004 }, { temperatureC: 50, rateConstant: 0.02 }],
  storageTemperatureC: 4, degradationThreshold: 0.1,
} satisfies Parameters<typeof assessAcceleratedStability>[0];
const ALL_CLAUSES = QMS_CLAUSES.map(c => c.id);

function changed(input: object, overrides: Record<string, unknown>): never {
  return { ...input, ...overrides } as never;
}

async function run(tool: string, input: object) {
  const handler = getToolHandler(tool);
  expect(handler, tool).toBeTypeOf('function');
  // No user: the private-rule gate (governed-tool-gate.ts) needs a membership row the unit harness does not have.
  return JSON.parse(await handler!(input as Record<string, unknown>, { organizationId: 101 } as never));
}

function refusal(f: () => unknown): { name?: string; code?: string; field?: string } {
  try {
    f();
  } catch (e) {
    return e as { name?: string; code?: string; field?: string };
  }
  return {};
}

/** The IVD handlers relay a refusal through ivdError: needs_parameters with a message naming the field. */
async function asksFor(tool: string, input: object, field: string) {
  const out = await run(tool, input);
  expect(out).toMatchObject({ status: 'needs_parameters' });
  expect(String(out.message)).toContain(field);
  expect(out).not.toHaveProperty('basis');
}

describe('the stated answers are kept', () => {
  it('a complete chain is valid, and a stated gap is still a gap', async () => {
    expect(await run('assess_iso17511_traceability', chain)).toMatchObject({ status: 'computed', basis: 'stated', result: { valid: true } });
    const out = assessTraceability(changed(chain, { commutabilityDemonstrated: false }));
    expect(out.valid).toBe(false);
    expect(out.gaps.join(' ')).toMatch(/Commutability/);
  });

  it('established scientific validity stays established', async () => {
    expect(await run('assess_scientific_validity', validity)).toMatchObject({ status: 'computed', result: { verdict: 'established' } });
  });

  it('a declining series and an ordinary Arrhenius study keep their shelf-lives', async () => {
    expect(await run('assess_shelf_life_stability', realTime)).toMatchObject({ status: 'computed', result: { shelfLife: 300, withinSpecAcrossWindow: true } });
    const out = assessAcceleratedStability(accelerated);
    expect(out.predictedShelfLife).toBeGreaterThan(0);
    expect(assessAcceleratedStability(changed(accelerated, {
      points: [{ temperatureC: 180, rateConstant: 1e-3 }, { temperatureC: 200, rateConstant: 1e300 }], storageTemperatureC: 25,
    })).predictedShelfLife).toBeNull();
  });

  it('QMS readiness and designation eligibility keep their stated answers', () => {
    expect(assessQmsReadiness(ALL_CLAUSES).ready).toBe(true);
    expect(assessQmsReadiness([])).toMatchObject({ ready: false, presentCount: 0 });
    expect(assessEligibility('fda_breakthrough', { serious: true, preliminary_substantial: true })!.eligible).toBe(true);
    expect(assessEligibility('fda_breakthrough', { serious: false })!.eligible).toBe(false);
  });
});

describe('assess_iso17511_traceability reads no omitted or malformed fact as false', () => {
  it.each(CHAIN_FACTS)('%s omitted or null is refused by name, not a gap', async field => {
    for (const absent of [undefined, null]) {
      expect(refusal(() => assessTraceability(changed(chain, { [field]: absent })))).toMatchObject({ code: 'missing_input', field });
      await asksFor('assess_iso17511_traceability', changed(chain, { [field]: absent }), field);
    }
  });

  it.each(CHAIN_FACTS)('%s malformed is refused by name', async field => {
    for (const value of ['false', 'true', 0, 1]) {
      expect(refusal(() => assessTraceability(changed(chain, { [field]: value })))).toMatchObject({ code: 'invalid_input', field });
      await asksFor('assess_iso17511_traceability', changed(chain, { [field]: value }), field);
    }
  });

  it('refuses a tier outside the ISO 17511 tiers', () => {
    expect(refusal(() => assessTraceability(changed(chain, { tier: 'SI' })))).toMatchObject({ code: 'invalid_input', field: 'tier' });
  });
});

describe('assess_scientific_validity scores no item whose source or target is unstated or malformed', () => {
  const item = (o: Record<string, unknown>) => changed(validity, { evidence: [{ ...validity.evidence[0], ...o }] });

  it.each([
    { o: { directlyOnTarget: undefined }, field: 'evidence[0].directlyOnTarget', code: 'missing_input' },
    { o: { directlyOnTarget: 'false' }, field: 'evidence[0].directlyOnTarget', code: 'invalid_input' },
    { o: { source: 'Guidelines' }, field: 'evidence[0].source', code: 'invalid_input' },
  ])('refuses $field = $o', async ({ o, field, code }) => {
    expect(refusal(() => assessScientificValidity(item(o)))).toMatchObject({ code, field });
    await asksFor('assess_scientific_validity', item(o), field);
  });

  it('refuses evidence that is not a list, or an item that is not an object', async () => {
    expect(refusal(() => assessScientificValidity(changed(validity, { evidence: 'NCCN guideline' }))))
      .toMatchObject({ code: 'invalid_input', field: 'evidence' });
    await asksFor('assess_scientific_validity', changed(validity, { evidence: 'NCCN guideline' }), 'evidence');
    expect(refusal(() => assessScientificValidity(changed(validity, { evidence: undefined }))))
      .toMatchObject({ name: 'ComputationRefusal', code: 'missing_input', field: 'evidence' });
    expect(refusal(() => assessScientificValidity(changed(validity, { evidence: [null] }))))
      .toMatchObject({ code: 'missing_input', field: 'evidence[0].source' });
  });
});

describe('assess_shelf_life_stability computes nothing from a missing or malformed number', () => {
  it.each([
    { o: { maxPercentChange: undefined }, field: 'maxPercentChange', code: 'missing_input' },
    { o: { maxPercentChange: '10' }, field: 'maxPercentChange', code: 'invalid_input' },
    { o: { maxPercentChange: Number.NaN }, field: 'maxPercentChange', code: 'invalid_input' },
    { o: { maxPercentChange: 0 }, field: 'maxPercentChange', code: 'invalid_input' },
    { o: { initialValue: '100' }, field: 'initialValue', code: 'invalid_input' },
    { o: { initialValue: 0 }, field: 'initialValue', code: 'invalid_input' },
    { o: { points: 'abc' }, field: 'points', code: 'invalid_input' },
    { o: { points: [{ time: 0, value: 100 }, { time: '30', value: 99 }] }, field: 'points[1].time', code: 'invalid_input' },
    { o: { points: [{ time: 0, value: 100 }, { time: 30 }] }, field: 'points[1].value', code: 'missing_input' },
    { o: { points: [{ time: -1, value: 100 }, { time: 30, value: 99 }] }, field: 'points[0].time', code: 'invalid_input' },
    { o: { points: [{ time: 30, value: 100 }, { time: 30, value: 99 }] }, field: 'points', code: 'invalid_input' },
  ])('refuses $field ($o)', async ({ o, field, code }) => {
    expect(refusal(() => assessRealTimeStability(changed(realTime, o)))).toMatchObject({ code, field });
    await asksFor('assess_shelf_life_stability', changed(realTime, o), field);
  });

  it('says when the regression intercept stood in for an omitted initial value', () => {
    expect(assessRealTimeStability(changed(realTime, { initialValue: undefined })).initialValueSource).toBe('regression_intercept');
    expect(assessRealTimeStability(realTime).initialValueSource).toBe('stated');
  });
});

describe('assess_accelerated_stability projects nothing from a missing or malformed number', () => {
  it.each([
    { o: { degradationThreshold: undefined }, field: 'degradationThreshold', code: 'missing_input' },
    { o: { degradationThreshold: '0.1' }, field: 'degradationThreshold', code: 'invalid_input' },
    { o: { degradationThreshold: 1 }, field: 'degradationThreshold', code: 'invalid_input' },
    { o: { storageTemperatureC: undefined }, field: 'storageTemperatureC', code: 'missing_input' },
    { o: { storageTemperatureC: '4' }, field: 'storageTemperatureC', code: 'invalid_input' },
    { o: { points: [{ temperatureC: '40', rateConstant: 0.004 }, { temperatureC: 50, rateConstant: 0.02 }] }, field: 'points[0].temperatureC', code: 'invalid_input' },
    { o: { points: [{ temperatureC: -300, rateConstant: 0.004 }, { temperatureC: 50, rateConstant: 0.02 }] }, field: 'points[0].temperatureC', code: 'invalid_input' },
    { o: { points: [{ temperatureC: 40, rateConstant: '0.004' }, { temperatureC: 50, rateConstant: 0.02 }] }, field: 'points[0].rateConstant', code: 'invalid_input' },
    { o: { points: [{ temperatureC: 40, rateConstant: 0 }, { temperatureC: 50, rateConstant: 0.02 }] }, field: 'points[0].rateConstant', code: 'invalid_input' },
    { o: { points: [{ temperatureC: 40, rateConstant: 0.004 }, { temperatureC: 40, rateConstant: 0.005 }] }, field: 'points', code: 'invalid_input' },
  ])('refuses $field ($o)', async ({ o, field, code }) => {
    expect(refusal(() => assessAcceleratedStability(changed(accelerated, o)))).toMatchObject({ code, field });
    await asksFor('assess_accelerated_stability', changed(accelerated, o), field);
  });
});

describe('assess_qms refuses a clause id it does not know, instead of counting the clause missing', () => {
  it('refuses an unknown or non-text id by index', async () => {
    expect(refusal(() => assessQmsReadiness([...ALL_CLAUSES.filter(id => id !== 'capa'), 'CAPA'])))
      .toMatchObject({ code: 'invalid_input', field: 'presentClauseIds[9]' });
    expect(refusal(() => assessQmsReadiness([1, 2] as never))).toMatchObject({ code: 'invalid_input', field: 'presentClauseIds[0]' });
    // The handler returns the refusal as its error (AnaToolExecutor.ts assess_qms); it reports no readiness.
    const out = await run('assess_qms', { present_clause_ids: ['CAPA'] });
    expect(JSON.stringify(out)).toMatch(/presentClauseIds\[0\] must be a clause id/);
    expect(out).not.toHaveProperty('assessment');
  });
});

describe('assess_pathway_eligibility calls nothing ineligible from an unanswered criterion', () => {
  it('leaves eligibility null while a criterion is unanswered and none is false', async () => {
    expect(assessEligibility('fda_orphan', {})).toMatchObject({ eligible: null, unanswered: ['rare'] });
    expect(assessEligibility('fda_breakthrough', { serious: true, preliminary_substantial: null } as never)!.eligible).toBeNull();
    expect((await run('assess_pathway_eligibility', { designation: 'fda_orphan', answers: {} })).assessment.eligible).toBeNull();
  });

  it('refuses an answer that is not true or false, by criterion', async () => {
    expect(refusal(() => assessEligibility('fda_breakthrough', { serious: 'true', preliminary_substantial: true } as never)))
      .toMatchObject({ code: 'invalid_input', field: 'answers.serious' });
    expect(refusal(() => assessEligibility('fda_orphan', [true] as never))).toMatchObject({ code: 'invalid_input', field: 'answers' });
    const out = await run('assess_pathway_eligibility', { designation: 'fda_breakthrough', answers: { serious: 'true', preliminary_substantial: true } });
    expect(JSON.stringify(out)).toMatch(/answers\.serious must be true or false/);
    expect(out).not.toHaveProperty('assessment');
  });
});

describe('the definitions say what is refused, within the trimmed length', () => {
  const ivd = (name: string) => IVD_LIFECYCLE_TOOLS.find(t => t.name === name)!;
  const props = (def: { input_schema: unknown }) => (def.input_schema as { properties: Record<string, { description?: string }> }).properties;

  it.each(['assess_iso17511_traceability', 'assess_scientific_validity', 'assess_shelf_life_stability', 'assess_accelerated_stability'])(
    '%s says a missing or malformed input is refused', name => {
      expect(ivd(name).description.length).toBeLessThanOrEqual(OPENAI_MAX_TOOL_DESCRIPTION_CHARS);
      expect(ivd(name).description).toMatch(/refused by (name|field)/);
    });

  it('says what an omitted initial value means, and which inputs are not read', () => {
    expect(props(ivd('assess_shelf_life_stability')).initialValue.description).toMatch(/regression intercept/);
    expect(props(ivd('assess_shelf_life_stability')).initialValue.description).not.toMatch(/first point/);
    expect(props(ivd('assess_scientific_validity')).intendedPurpose.description).toMatch(/Not read/);
  });

  it('says an unanswered criterion is null and a malformed answer or clause id is refused', () => {
    expect(ASSESS_PATHWAY_ELIGIBILITY.description.length).toBeLessThanOrEqual(OPENAI_MAX_TOOL_DESCRIPTION_CHARS);
    expect(ASSESS_PATHWAY_ELIGIBILITY.description).toMatch(/null \(undetermined\)/);
    expect(props(ASSESS_PATHWAY_ELIGIBILITY).answers.description).toMatch(/refused/);
    expect(ASSESS_QMS.description).toMatch(/not a clause id is refused/);
  });
});
