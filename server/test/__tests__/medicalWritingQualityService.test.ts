import { describe, expect, it } from 'vitest';
import { assessMedicalWritingDraft } from '../../services/evals/medicalWritingQualityService';

describe('assessMedicalWritingDraft', () => {
  const checklist = {
    requiredSections: [
      'objective',
      'regulatory context',
      'methods',
      'results',
      'benefit-risk',
      'limitations',
      'references',
    ],
    requiredQualityFlags: ['claim_citation_linked'],
    forbiddenPatterns: ['without evidence', 'always safe'],
  };

  it('passes when required sections are present and forbidden terms absent', () => {
    const draft = `
      objective\nregulatory context\nmethods\nresults\nbenefit-risk\nlimitations\nreferences
    `;

    const result = assessMedicalWritingDraft(draft, checklist);
    expect(result.passed).toBe(true);
    expect(result.forbiddenPatternHits).toEqual([]);
  });

  it('fails when forbidden phrases are present', () => {
    const draft = `objective methods results always safe references`;
    const result = assessMedicalWritingDraft(draft, checklist);
    expect(result.passed).toBe(false);
    expect(result.forbiddenPatternHits.length).toBeGreaterThan(0);
  });
});
