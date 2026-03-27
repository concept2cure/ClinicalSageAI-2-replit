import { describe, expect, it } from 'vitest';
import { summarizeMedicalWritingChecklist } from '../../services/evals/medicalWritingCoverage';

describe('summarizeMedicalWritingChecklist', () => {
  it('summarizes required sections and controls across domains', () => {
    const summary = summarizeMedicalWritingChecklist({
      domains: {
        fda_510k: {
          required_sections: ['a', 'b', 'c', 'd'],
          required_quality_controls: ['x', 'y', 'z'],
        },
        eu_cer: {
          required_sections: ['a', 'b', 'c', 'd'],
          required_quality_controls: ['x', 'y', 'z'],
        },
      },
    });

    expect(summary.domainCount).toBe(2);
    expect(summary.totalRequiredSections).toBe(8);
    expect(summary.totalRequiredControls).toBe(6);
  });
});
