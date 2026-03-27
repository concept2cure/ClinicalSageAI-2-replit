import { describe, expect, it } from 'vitest';
import { runConcept2CureMedicalWritingRules } from '../../server/services/documentQuality/rules/concept2cureMedicalWritingRules';

describe('runConcept2CureMedicalWritingRules', () => {
  it('flags missing 510k predicate and percentage claims without CI', () => {
    const issues = runConcept2CureMedicalWritingRules('Clinical success rate was 95% in trial cohort.', '510k');

    expect(issues.some((issue) => issue.ruleId === 'C2C_510K_PREDICATE_001')).toBe(true);
    expect(issues.some((issue) => issue.ruleId === 'C2C_STATS_CI_001')).toBe(true);
  });

  it('flags missing clinical endpoint/population cues for clinical class', () => {
    const issues = runConcept2CureMedicalWritingRules('Study overview only.', 'clinical');

    expect(issues.some((issue) => issue.ruleId === 'C2C_CLIN_ENDPOINT_001')).toBe(true);
    expect(issues.some((issue) => issue.ruleId === 'C2C_CLIN_POPULATION_001')).toBe(true);
  });
});
