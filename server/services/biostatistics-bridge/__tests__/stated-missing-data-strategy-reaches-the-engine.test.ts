/**
 * A design that STATES its missing-data strategy is not told it stated none (T2-F9).
 *
 * The study design records its strategy in its own words
 * (`statisticalPlan.missingDataStrategy`). The adapter mapped those words onto
 * the engine's five modelled methods (MMRM, multiple imputation, pattern-mixture,
 * LOCF, complete case) and, when none matched, passed NOTHING. So a design whose
 * strategy is non-responder imputation — the usual one for a binary responder
 * endpoint, and the seeded LMN-201's: "Participants with a missing week-12
 * assessment counted as not cured" — reached the judgment engine with no method,
 * and was told:
 *
 *   - Missing Data Risk: "No method specified", with a score penalty;
 *   - SAP §7: "Missing data handling method should be pre-specified in the SAP";
 *   - AnA's guidance: "Missing data handling method should be pre-specified".
 *
 * …while the design's own review table, two inches away, read "Missing data ·
 * Low · A pre-specified … strategy aligned with the estimand". Found by the
 * 2026-11-10 sales rehearsal.
 *
 * The strategy is now carried as stated. The engine still does not model it, and
 * says so: it computes no power for a method it has no model of.
 */
import { describe, expect, it } from 'vitest';

import type { StudyDesign } from '../../study-design/study-design-types';
import { computationEngine } from '../../ana-biostats/computation-engine';
import { judgmentEngine } from '../../ana-biostats/judgment-engine';
import { domainAdapter } from '../../ana-biostats/domain-adapter';
import { documentGenerator } from '../../ana-biostats/document-generator';
import { inputNormalizer } from '../../ana-biostats/input-normalizer';
import { toBiostatsInput } from '../../ana-biostats/request-input';
import { smeRouter } from '../../ana-biostats/sme-router';
import type { StatisticalDocumentType, StatisticalInput } from '../../ana-biostats/types';
import { studyDesignToStatisticalInput } from '../design-adapter';

const NRI = 'Participants with a missing week-12 assessment counted as not cured';

/** A phase 3 two-arm responder study, complete enough for the engine to size. */
function design(missingDataStrategy: string | undefined): StudyDesign {
  return {
    title: 'A phase 3 study of Drug X in plaque psoriasis',
    phase: '3',
    indication: 'plaque psoriasis',
    productType: 'drug',
    targetRegions: ['US'],
    objectives: [{ level: 'primary', order: 1, text: 'Demonstrate superiority on PASI 75', endpointName: 'PASI 75 at week 12' }],
    estimands: [{
      endpointName: 'PASI 75 at week 12', treatmentCondition: 'Drug X versus placebo', population: 'all randomized (ITT)',
      variable: 'PASI 75 response at week 12', summaryMeasure: 'difference in proportions', strategy: 'composite',
      intercurrentEvents: [{ name: 'discontinuation', strategy: 'composite', justification: 'non-response' }],
    }],
    endpoints: [{ name: 'PASI 75 at week 12', role: 'primary', type: 'binary', definition: 'PASI 75 response at week 12' }],
    framework: { inferentialFrame: 'superiority', structuralDesign: 'parallel_group', controlType: 'placebo' },
    population: {
      targetDescription: 'adults with moderate-to-severe plaque psoriasis', eligibility: [{ type: 'inclusion', text: 'PASI ≥ 12' }],
      analysisPopulations: [{ kind: 'ITT', definition: 'all randomized', isPrimaryAnalysisSet: true }, { kind: 'Safety', definition: 'all treated' }],
    },
    arms: [{ name: 'Drug X', interventions: [{ name: 'Drug X', role: 'investigational' }] }, { name: 'Placebo', interventions: [{ name: 'Placebo', role: 'placebo' }] }],
    randomization: { ratio: [1, 1], allocationMethod: 'stratified', blinding: 'double' },
    statisticalPlan: {
      alpha: 0.05, power: 0.9, plannedSampleSize: 300, dropoutRate: 0.1,
      plannedAnalyses: [{ endpointName: 'PASI 75 at week 12', method: 'CMH' }],
      multiplicity: { method: 'none' },
      ...(missingDataStrategy === undefined ? {} : { missingDataStrategy }),
      sensitivityAnalysesSpecified: true,
      powerAssumptions: { effectSize: 0.2, eventRate: 0.1, evidence: [{ kind: 'prior_data', source: 'Phase 2' }] },
    },
  } as unknown as StudyDesign;
}

const assess = (strategy: string | undefined) => {
  const adapter = studyDesignToStatisticalInput(design(strategy));
  if (!adapter.input) throw new Error('the design did not reach the engine: ' + JSON.stringify(adapter.gaps));
  const input = adapter.input;
  const computation = computationEngine.compute(input);
  const judgment = judgmentEngine.judge(input, computation);
  const dimension = judgment.dimensions.find((d) => d.name === 'Missing Data Risk')!;
  const document = (type: StatisticalDocumentType) => documentGenerator.generate(
    type, input, computation, judgment, domainAdapter.adapt(input, computation, judgment), undefined,
    { projectId: 1, organizationId: 1, userId: 1 },
  ).content;
  return { adapter, input, computation, judgment, dimension, document };
};

describe('the adapter carries the strategy the design states', () => {
  it('a strategy with no engine analogue is passed as stated, with a note saying what the engine does with it', () => {
    const { adapter, input } = assess(NRI);
    expect(input.missingDataMethod).toBeUndefined();
    expect(input.missingDataStrategyStated).toBe(NRI);
    const gap = adapter.gaps.find((g) => g.designPath === 'statisticalPlan.missingDataStrategy');
    expect(gap).toMatchObject({ field: 'missingDataMethod', severity: 'note' });
    expect(gap!.message).toContain(NRI);
    expect(gap!.message).toMatch(/not computed/);
  });

  it('a strategy the engine models is mapped as before, and carries no second copy', () => {
    const { adapter, input } = assess('MMRM under missing at random; tipping-point sensitivity analysis');
    expect(input.missingDataMethod).toBe('MMRM');
    expect(input.missingDataStrategyStated).toBeUndefined();
    expect(adapter.gaps.find((g) => g.designPath === 'statisticalPlan.missingDataStrategy')).toBeUndefined();
  });

  it('a design that states none passes none', () => {
    const { input } = assess(undefined);
    expect(input.missingDataMethod).toBeUndefined();
    expect(input.missingDataStrategyStated).toBeUndefined();
  });
});

describe('the judgment does not call a stated strategy unstated', () => {
  it('quotes the design and takes no "not specified" penalty', () => {
    const stated = assess(NRI).dimension;
    const none = assess(undefined).dimension;
    expect(stated.rationale).not.toMatch(/No method specified/);
    expect(stated.rationale).toContain(`Handling as stated on the design: "${NRI}"`);
    expect(stated.flags.join(' ')).not.toMatch(/not specified|No missing data handling method/i);
    expect(stated.flags.join(' ')).toMatch(/The engine has no model of this method/);
    expect(stated.score).toBeGreaterThan(none.score);
  });

  it('a design that states none is still told so', () => {
    const none = assess(undefined).dimension;
    expect(none.rationale).toMatch(/No method specified/);
    expect(none.flags.join(' ')).toMatch(/No missing data handling method specified for Phase III/);
  });
});

describe('the documents quote the strategy instead of asking for one', () => {
  it('SAP section draft §7', () => {
    const sap = assess(NRI).document('sap_section_draft');
    const s7 = sap.slice(sap.indexOf('## 7. Missing Data Handling'), sap.indexOf('## 8.'));
    expect(s7).toContain(NRI);
    expect(s7).not.toMatch(/should be pre-specified/);
    expect(s7).toMatch(/does not model this method/);
  });

  it('the full SAP §9', () => {
    const sap = assess(NRI).document('full_statistical_analysis_plan');
    const s9 = sap.slice(sap.indexOf('## 9. Missing Data'), sap.indexOf('## 10.'));
    expect(s9).toContain(NRI);
    expect(s9).not.toMatch(/Pre-specify the missing-data approach/);
  });

  it('CSR §9.7.3 states what the plan says', () => {
    const csr = assess(NRI).document('statistical_methods_section');
    const s = csr.slice(csr.indexOf('## 9.7.3 Handling of Missing Data'), csr.indexOf('## 9.7.4'));
    expect(s).toContain(NRI);
  });

  it('a design that states none is still asked for one', () => {
    const sap = assess(undefined).document('sap_section_draft');
    expect(sap.slice(sap.indexOf('## 7. Missing Data Handling'), sap.indexOf('## 8.'))).toMatch(/should be pre-specified/);
  });
});

describe('AnA’s guidance does not ask for what the design already states', () => {
  /* The SAP strategy specialist's guidance is merged into what AnA tells the person (orchestrator.ts, layer 10). */
  const guidance = (strategy: string | undefined) => {
    const { input, computation, judgment } = assess(strategy);
    return smeRouter.enhance('sap_analysis_strategy', input, computation, judgment, domainAdapter.adapt(input, computation, judgment), undefined)
      .additionalGuidance.join(' | ');
  };
  it('still asks a design that states none', () => {
    expect(guidance(undefined)).toMatch(/Missing data handling method should be pre-specified/);
  });
  it('says nothing about pre-specifying a method that is stated', () => {
    expect(guidance(NRI)).not.toMatch(/Missing data handling method should be pre-specified/);
  });
});

describe('the field survives the request path', () => {
  it('the normalizer keeps it, trimmed', () => {
    const { input } = assess(NRI);
    const normalized = inputNormalizer.normalize({ ...input, missingDataStrategyStated: `  ${NRI}  ` } as Partial<StatisticalInput>);
    expect(normalized.valid).toBe(true);
    expect(normalized.normalizedInput!.missingDataStrategyStated).toBe(NRI);
  });

  it('an AnA tool’s request keeps it; a blank one is dropped', () => {
    expect(toBiostatsInput({ missingDataStrategyStated: NRI }).missingDataStrategyStated).toBe(NRI);
    expect(toBiostatsInput({ missingDataStrategyStated: '' }).missingDataStrategyStated).toBeUndefined();
  });
});
