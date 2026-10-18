/**
 * The ICH M7 tools hand an unstated input back to the user instead of turning
 * it into a verdict AnA reports verbatim.
 *
 * Until 2026-10-15 classify_mutagenic_impurity({}) came back status 'computed',
 * engine 'deterministic', "Report these numbers verbatim", with Class 4 and "No
 * mutagenic impurity controls required"; assess_nitrosamine_risk({}) came back
 * 'computed' with overallRiskLevel 'no_risk'; design_purge_study with nine
 * downstream steps and no purge data came back 19,683×. The dispatcher only
 * records a missing required input (AnaToolExecutor registerToolHandler), so
 * the engines' own refusals are what stop it; runStatsTool relays a
 * ComputationRefusal as needs_parameters.
 */
import { describe, expect, it } from 'vitest';

import { getToolHandler } from '../AnaToolExecutor.js';
import { CLASSIFY_MUTAGENIC_IMPURITY, CONTROL_MUTAGENIC_IMPURITY, DESIGN_PURGE_STUDY } from '../mutagenicImpurityTools';

async function call(name: string, input: Record<string, unknown>): Promise<Record<string, unknown>> {
  const handler = getToolHandler(name);
  if (!handler) throw new Error(`no handler registered for ${name}`);
  return JSON.parse(await handler(input)) as Record<string, unknown>;
}

describe('ICH M7 tools — an unstated input goes back to the user, not into a verdict', () => {
  it('classify_mutagenic_impurity({}) asks for the Ames result instead of computing Class 4', async () => {
    const out = await call('classify_mutagenic_impurity', {});
    expect(out.status).toBe('needs_parameters');
    expect(String(out.message)).toMatch(/amesMutagenicity is required/);
  });

  it('control_mutagenic_impurity without a cohort-of-concern statement asks for it', async () => {
    const out = await call('control_mutagenic_impurity', {
      impurityClass: 2,
      drugProductType: 'tablet',
      maxDailyDoseG: 1,
      treatmentDuration: 'lifetime',
      developmentPhase: 'commercial',
    });
    expect(out.status).toBe('needs_parameters');
    expect(out.field).toBe('compoundClass');
  });

  it('assess_nitrosamine_risk({}) reports "not assessed" with the missing inputs, never no_risk', async () => {
    const out = await call('assess_nitrosamine_risk', {});
    expect(out.status).toBe('computed');
    const result = out.result as { overallRiskLevel: string; missingInputs: string[] };
    expect(result.overallRiskLevel).toBe('not_assessed');
    expect(result.missingInputs).toContain('drugSubstanceContainsAmines');
  });

  it('design_purge_study with nine downstream steps and no purge data reports the single-step estimate', async () => {
    const out = await call('design_purge_study', { syntheticStep: 'early', numberOfDownstreamSteps: 9 });
    const result = out.result as { overallPurgeFactorEstimate: number; unquantifiedDownstreamSteps: number };
    expect(result.overallPurgeFactorEstimate).toBe(1);
    expect(result.unquantifiedDownstreamSteps).toBe(9);
  });

  it('the schemas require what the engines refuse without, and offer per-step purge factors', () => {
    expect(CLASSIFY_MUTAGENIC_IMPURITY.input_schema.required).toContain('cohortOfConcernStructure');
    expect(CONTROL_MUTAGENIC_IMPURITY.input_schema.required).toContain('compoundClass');
    expect(Object.keys(DESIGN_PURGE_STUDY.input_schema.properties)).toContain('downstreamStepPurgeFactors');
  });
});
