/**
 * A nitrosamine risk level is stated only when the inputs that decide it were.
 *
 * Until 2026-10-15 assessNitrosamineRisk({}) returned overallRiskLevel
 * 'no_risk', the finding "No amine functionalities identified in the drug
 * substance" and "No confirmatory testing required based on the current risk
 * assessment" — with no structure, amine, reagent, equipment or packaging input
 * at all. Amines stated present with no type gave the same "no amine" finding,
 * because the type defaulted to 'none'. Separately, an excipient concern on top
 * of a degradation risk LOWERED the cross-contamination level from medium to
 * low, so a secondary-amine API dropped from high to medium overall when one
 * more risk factor was reported.
 */
import { describe, expect, it } from 'vitest';

import { assessNitrosamineRisk, type NitrosamineRiskInput } from '../mutagenic-impurity-knowledge';

const ALL_RULED_OUT: NitrosamineRiskInput = {
  drugSubstanceContainsAmines: false,
  nitriteReagentsUsed: false,
  synthesisUsesNitrosatingConditions: false,
  sharedEquipment: false,
  packagingContainsRubber: false,
  excipientsConcern: [],
  drugSubstanceDegradationRisk: false,
};

describe('assessNitrosamineRisk — no verdict from inputs nobody stated', () => {
  it('reports an empty input as not assessed, naming every unstated input, never "no_risk"', () => {
    const r = assessNitrosamineRisk({});
    expect(r.overallRiskLevel, 'assessNitrosamineRisk({}) must not conclude a risk level').toBe('not_assessed');
    expect(r.missingInputs).toEqual([
      'drugSubstanceContainsAmines',
      'nitriteReagentsUsed',
      'synthesisUsesNitrosatingConditions',
      'sharedEquipment',
      'packagingContainsRubber',
      'excipientsConcern',
      'drugSubstanceDegradationRisk',
    ]);
    expect(r.riskAssessmentSteps.map((s) => s.riskContribution)).toEqual(['not_assessed', 'not_assessed', 'not_assessed']);
    expect(r.rootCauses.every((c) => c.identified === null)).toBe(true);
    const text = JSON.stringify(r);
    expect(text).not.toMatch(/No amine functionalities identified/);
    expect(text).not.toMatch(/No confirmatory testing required/);
    expect(r.regulatorySummary).toMatch(/Overall risk level: NOT ASSESSED/);
  });

  it('gives no_risk only when every factor is ruled out, including an explicit "no amine present"', () => {
    expect(assessNitrosamineRisk(ALL_RULED_OUT).overallRiskLevel).toBe('no_risk');
    const aminesUnstated = assessNitrosamineRisk({ ...ALL_RULED_OUT, drugSubstanceContainsAmines: undefined });
    expect(aminesUnstated.overallRiskLevel).toBe('not_assessed');
    expect(aminesUnstated.missingInputs).toEqual(['drugSubstanceContainsAmines']);
    expect(assessNitrosamineRisk({ ...ALL_RULED_OUT, drugSubstanceContainsAmines: undefined, amineType: 'none' }).overallRiskLevel).toBe('no_risk');
  });

  it('does not report "no amine functionalities" when amines are stated present but their type is not', () => {
    const r = assessNitrosamineRisk({ ...ALL_RULED_OUT, drugSubstanceContainsAmines: true });
    expect(r.riskAssessmentSteps[0].riskContribution).toBe('not_assessed');
    expect(r.riskAssessmentSteps[0].finding).not.toMatch(/No amine functionalities/);
    expect(r.missingInputs).toEqual(['amineType']);
    expect(r.overallRiskLevel).toBe('not_assessed');
  });

  it('states a level the unstated inputs cannot change: secondary amine with sodium nitrite is high', () => {
    const r = assessNitrosamineRisk({ drugSubstanceContainsAmines: true, amineType: 'secondary', nitriteReagentsUsed: true });
    expect(r.overallRiskLevel).toBe('high');
    expect(r.missingInputs).toEqual([
      'synthesisUsesNitrosatingConditions',
      'sharedEquipment',
      'packagingContainsRubber',
      'excipientsConcern',
      'drugSubstanceDegradationRisk',
    ]);
  });

  it('refuses contradictory amine inputs rather than picking one', () => {
    expect(() => assessNitrosamineRisk({ drugSubstanceContainsAmines: true, amineType: 'none' })).toThrow(
      /amineType must be primary, secondary or tertiary/,
    );
    expect(() => assessNitrosamineRisk({ drugSubstanceContainsAmines: false, amineType: 'secondary' })).toThrow(
      /drugSubstanceContainsAmines must be true/,
    );
  });

  it('an additional risk factor never lowers the level (excipient concern on top of a degradation risk)', () => {
    const base: NitrosamineRiskInput = {
      ...ALL_RULED_OUT,
      drugSubstanceContainsAmines: true,
      amineType: 'secondary',
      drugSubstanceDegradationRisk: true,
    };
    expect(assessNitrosamineRisk(base).overallRiskLevel).toBe('high');
    expect(assessNitrosamineRisk({ ...base, excipientsConcern: ['povidone'] }).overallRiskLevel).toBe('high');
  });
});
