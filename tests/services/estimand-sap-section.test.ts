/**
 * Estimand → SAP section renderer (ICH E9(R1)) tests.
 *
 * Covers the GA acceptance trio for this workstream:
 *  - reproducibility: same input ⇒ identical rendered text
 *  - correctness: the five ICH E9(R1) attributes + strategies are rendered,
 *    and completeness is computed against the same bar the engine validates to
 *  - honesty: no estimand ⇒ an explicit deferral, never a fabricated estimand
 *
 * Plus an integration check that SapGeneratorService splices the section into
 * the plan and renumbers around it.
 */

import { describe, it, expect } from 'vitest';
import {
  renderEstimandSection,
  ESTIMAND_STRATEGIES,
  type EstimandInput,
} from '../../server/services/estimand-sap-section';
import SapGeneratorService from '../../server/services/sap-generator-service';

const COMPLETE_ESTIMAND: EstimandInput = {
  endpointName: 'HbA1c change from baseline at week 24',
  population: 'All randomized patients (intent-to-treat)',
  variable: 'Change from baseline in HbA1c (%) at week 24',
  summaryMeasure: 'Difference in means between treatment arms',
  strategy: 'treatment_policy',
  treatmentCondition: 'Semaglutide 1.0 mg weekly versus placebo',
  intercurrentEvents: [
    {
      name: 'Treatment discontinuation',
      description: 'Patient stops study drug before week 24',
      strategy: 'treatment_policy',
      justification: 'Effect of treatment policy regardless of adherence is of interest',
    },
    {
      name: 'Rescue medication',
      description: 'Initiation of additional glucose-lowering therapy',
      strategy: 'hypothetical',
      justification: 'Estimate the effect had rescue medication not been available',
    },
  ],
};

const SECOND_ESTIMAND: EstimandInput = {
  endpointName: 'Time to first major adverse cardiovascular event',
  population: 'All randomized patients (intent-to-treat)',
  variable: 'Time from randomization to first adjudicated MACE',
  summaryMeasure: 'Hazard ratio',
  strategy: 'while_on_treatment',
  intercurrentEvents: [
    { name: 'Death from non-cardiovascular causes', strategy: 'while_on_treatment' },
  ],
};

describe('renderEstimandSection — reproducibility', () => {
  it('produces identical text for identical input', () => {
    const a = renderEstimandSection([COMPLETE_ESTIMAND]);
    const b = renderEstimandSection([COMPLETE_ESTIMAND]);
    expect(a.text).toBe(b.text);
    expect(a).toEqual(b);
  });

  it('does not depend on a clock or any nondeterministic source', () => {
    // Two calls separated in time must match byte-for-byte.
    const first = renderEstimandSection([COMPLETE_ESTIMAND, SECOND_ESTIMAND]).text;
    const second = renderEstimandSection([COMPLETE_ESTIMAND, SECOND_ESTIMAND]).text;
    expect(first).toBe(second);
  });
});

describe('renderEstimandSection — correctness (ICH E9(R1) attributes)', () => {
  it('renders the section header and the five labelled attributes', () => {
    const { text } = renderEstimandSection([COMPLETE_ESTIMAND]);
    expect(text).toContain('ESTIMAND FRAMEWORK (ICH E9(R1))');
    expect(text).toContain('A. Treatment condition:');
    expect(text).toContain('B. Population:');
    expect(text).toContain('C. Variable (endpoint):');
    expect(text).toContain('D. Intercurrent-event handling');
    expect(text).toContain('E. Population-level summary measure:');
  });

  it('renders the supplied attribute values', () => {
    const { text } = renderEstimandSection([COMPLETE_ESTIMAND]);
    expect(text).toContain('Semaglutide 1.0 mg weekly versus placebo');
    expect(text).toContain('All randomized patients (intent-to-treat)');
    expect(text).toContain('Change from baseline in HbA1c (%) at week 24');
    expect(text).toContain('Difference in means between treatment arms');
  });

  it('renders each intercurrent event with a human-readable strategy label', () => {
    const { text } = renderEstimandSection([COMPLETE_ESTIMAND]);
    expect(text).toContain('Treatment discontinuation');
    expect(text).toContain('Rescue medication');
    expect(text).toContain('Strategy: Treatment policy');
    expect(text).toContain('Strategy: Hypothetical');
    expect(text).toContain('Rationale: Effect of treatment policy');
  });

  it('marks a fully specified estimand as complete with all five attributes', () => {
    const result = renderEstimandSection([COMPLETE_ESTIMAND]);
    expect(result.estimandCount).toBe(1);
    expect(result.attributeCompleteness).toHaveLength(1);
    const c = result.attributeCompleteness[0];
    expect(c.complete).toBe(true);
    expect(c.missing).toEqual([]);
    expect(c.warnings).toEqual([]);
    expect(c.attributesSpecified).toBe(5);
    expect(c.totalAttributes).toBe(5);
    expect(result.text).toContain('5/5 attributes specified (ICH E9(R1) complete)');
  });

  it('renders multiple estimands in order', () => {
    const { text, estimandCount } = renderEstimandSection([COMPLETE_ESTIMAND, SECOND_ESTIMAND]);
    expect(estimandCount).toBe(2);
    expect(text).toContain('Estimand 1: HbA1c change from baseline at week 24');
    expect(text).toContain('Estimand 2: Time to first major adverse cardiovascular event');
    expect(text.indexOf('Estimand 1:')).toBeLessThan(text.indexOf('Estimand 2:'));
    expect(text).toContain('Strategy: While on treatment');
    expect(text).toContain('Hazard ratio');
  });

  it('exposes exactly the five ICH E9(R1) strategies', () => {
    expect([...ESTIMAND_STRATEGIES].sort()).toEqual(
      ['composite', 'hypothetical', 'principal_stratum', 'treatment_policy', 'while_on_treatment'].sort(),
    );
  });
});

describe('renderEstimandSection — honesty (incomplete / missing)', () => {
  it('flags every missing attribute rather than inventing one', () => {
    const sparse: EstimandInput = {
      endpointName: 'Endpoint X',
      population: '',
      variable: '',
      summaryMeasure: '',
      strategy: 'treatment_policy',
      intercurrentEvents: [],
    };
    const result = renderEstimandSection([sparse]);
    expect(result.attributeCompleteness[0].complete).toBe(false);
    expect(result.attributeCompleteness[0].missing).toEqual(
      expect.arrayContaining([
        'population',
        'variable (endpoint)',
        'population-level summary measure',
        'intercurrent-event handling',
      ]),
    );
    expect(result.attributeCompleteness[0].attributesSpecified).toBe(0);
    expect(result.text).toContain('incomplete, missing');
    expect(result.text).toContain('0/5 attributes specified');
    expect(result.text).toContain('not specified');
  });

  it('counts 4/5 and warns (not errors) when the treatment condition is omitted', () => {
    const noTreatment: EstimandInput = { ...COMPLETE_ESTIMAND, treatmentCondition: undefined };
    const result = renderEstimandSection([noTreatment]);
    const c = result.attributeCompleteness[0];
    // Treatment is captured implicitly via the protocol arms, so its omission is
    // a defensibility warning — structurally still complete, but only 4/5 explicit.
    expect(c.complete).toBe(true);
    expect(c.missing).toEqual([]);
    expect(c.attributesSpecified).toBe(4);
    expect(c.warnings.some(w => w.includes('treatment condition not restated'))).toBe(true);
    expect(result.text).toContain('4/5 attributes specified');
    expect(result.text).toContain('Defensibility warnings:');
    // The treatment line still renders the protocol-arms default rather than a gap.
    expect(result.text).toContain('as specified in the protocol');
  });

  it('warns when an intercurrent-event strategy is stated without a rationale', () => {
    const noRationale: EstimandInput = {
      ...COMPLETE_ESTIMAND,
      intercurrentEvents: [
        { name: 'Treatment discontinuation', strategy: 'treatment_policy' },
      ],
    };
    const result = renderEstimandSection([noRationale]);
    const c = result.attributeCompleteness[0];
    // Missing rationale is a warning, not a structural error.
    expect(c.complete).toBe(true);
    expect(c.missing).toEqual([]);
    expect(c.warnings.some(w => w.includes('without a rationale'))).toBe(true);
  });

  it('flags an unrecognized strategy', () => {
    const bad = {
      ...COMPLETE_ESTIMAND,
      strategy: 'made_up_strategy' as EstimandInput['strategy'],
    };
    const result = renderEstimandSection([bad]);
    expect(result.attributeCompleteness[0].complete).toBe(false);
    expect(result.attributeCompleteness[0].missing).toContain('a recognized ICH E9(R1) strategy');
    expect(result.text).toContain('unrecognized');
  });

  it('renders an explicit deferral when no estimand is supplied', () => {
    for (const input of [undefined, []] as const) {
      const result = renderEstimandSection(input as EstimandInput[] | undefined);
      expect(result.estimandCount).toBe(0);
      expect(result.attributeCompleteness).toEqual([]);
      expect(result.text).toContain('No estimand was supplied');
      expect(result.text).toContain('does not assert an estimand that has not been defined');
      // It must list what the statistician has to specify — the five attributes.
      expect(result.text).toContain('A. Treatment condition');
      expect(result.text).toContain('E. Population-level summary measure');
    }
  });

  it('warns when an estimand has no intercurrent events', () => {
    const noIce: EstimandInput = { ...COMPLETE_ESTIMAND, intercurrentEvents: [] };
    const { text } = renderEstimandSection([noIce]);
    expect(text).toContain('No intercurrent events were specified');
  });
});

describe('SapGeneratorService — estimand section is threaded into the SAP', () => {
  const sap = SapGeneratorService;

  const baseRequest = {
    indication: 'Type 2 diabetes',
    phase: 'Phase 3',
    sample_size: 400,
    primary_endpoint: 'HbA1c change from baseline at week 24',
    secondary_endpoints: ['Body weight change at week 24'],
  };

  it('renders the estimand section (Section 2) and renumbers later sections', async () => {
    const result = await sap.generateSAP({ ...baseRequest, estimands: [COMPLETE_ESTIMAND] });
    expect(result.sapContent).toContain('2. ESTIMAND FRAMEWORK (ICH E9(R1))');
    // Threading evidence: the estimand attributes appear in the plan body.
    expect(result.sapContent).toContain('Semaglutide 1.0 mg weekly versus placebo');
    // Renumbering: design/sample-size/methods shifted by one, ending at 13.
    expect(result.sapContent).toContain('3. STUDY DESIGN');
    expect(result.sapContent).toContain('4. SAMPLE SIZE JUSTIFICATION');
    expect(result.sapContent).toContain('5. STATISTICAL METHODS');
    expect(result.sapContent).toContain('13. AMENDMENTS TO THE SAP');
    // Metadata surfaced on the result.
    expect(result.estimandSection?.estimandCount).toBe(1);
    expect(result.estimandSection?.attributeCompleteness[0].complete).toBe(true);
  });

  it('renders the deferral in the SAP when no estimand is supplied', async () => {
    const result = await sap.generateSAP({ ...baseRequest });
    expect(result.sapContent).toContain('2. ESTIMAND FRAMEWORK (ICH E9(R1))');
    expect(result.sapContent).toContain('No estimand was supplied');
    expect(result.estimandSection?.estimandCount).toBe(0);
    // The plan still completes and stays well-formed through to section 13.
    expect(result.sapContent).toContain('13. AMENDMENTS TO THE SAP');
  });

  it('is deterministic at the SAP level for the estimand section', async () => {
    const a = await sap.generateSAP({ ...baseRequest, estimands: [COMPLETE_ESTIMAND] });
    const b = await sap.generateSAP({ ...baseRequest, estimands: [COMPLETE_ESTIMAND] });
    // The estimand section text is pure, so it must match across runs.
    expect(a.estimandSection?.text).toBe(b.estimandSection?.text);
  });
});
