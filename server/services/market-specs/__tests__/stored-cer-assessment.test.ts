/**
 * Tests for the stored-CER mapper — proves the cer_reports JSON columns and
 * free-form cer_sections rows map deterministically onto the canonical CER
 * structure. (The DB orchestrator is exercised by the runtime runbook.)
 */
import { describe, it, expect } from 'vitest';
import { mapStoredCerToCanonicalSections } from '../stored-cer-assessment';
import { assessCerStructure } from '../cer-structure';

describe('stored CER mapping — report columns', () => {
  it('maps populated JSON columns to canonical sections', () => {
    const m = mapStoredCerToCanonicalSections(
      {
        executiveSummary: { text: 'x' },
        deviceDescription: { text: 'x' },
        clinicalBackground: { text: 'x' },
        clinicalEvidence: { studies: [1] },
        riskBenefitAnalysis: { text: 'x' },
        conclusions: { text: 'x' },
      },
      []
    );
    expect(m.present).toEqual(expect.arrayContaining(['summary', 'device_description', 'clinical_background', 'clinical_data', 'analysis', 'conclusions']));
    expect(m.sources['clinical_data']).toContain('column:clinicalEvidence');
  });

  it('treats null/empty columns as absent', () => {
    const m = mapStoredCerToCanonicalSections({ executiveSummary: {}, deviceDescription: null, conclusions: '' }, []);
    expect(m.present).toHaveLength(0);
  });
});

describe('stored CER mapping — section rows', () => {
  it('matches free-form section ids/titles by keyword', () => {
    const m = mapStoredCerToCanonicalSections({}, [
      { sectionId: 'sec-1', title: 'Scope of the Evaluation' },
      { sectionId: 'equivalence', title: 'Equivalent device justification' },
      { sectionId: 'lit-review', title: 'Literature Review' },
      { sectionId: 'pmcf', title: 'Post-Market Clinical Follow-up plan' },
    ]);
    expect(m.present).toEqual(expect.arrayContaining(['scope', 'equivalence', 'clinical_data', 'pmcf']));
  });

  it('combines columns + rows and feeds the canonical assessment', () => {
    const m = mapStoredCerToCanonicalSections(
      {
        executiveSummary: { t: 1 },
        deviceDescription: { t: 1 },
        clinicalBackground: { t: 1 },
        clinicalEvidence: { t: 1 },
        riskBenefitAnalysis: { t: 1 },
        conclusions: { t: 1 },
      },
      [
        { sectionId: 'scope', title: 'Scope' },
        { sectionId: 'appraisal', title: 'Appraisal of clinical data' },
        { sectionId: 'pmcf', title: 'PMCF' },
        { sectionId: 'evaluators', title: 'Evaluator qualification' },
        { sectionId: 'refs', title: 'References' },
      ]
    );
    // Equivalence not claimed → ready when all required non-equivalence sections present.
    const assessment = assessCerStructure(m.present, { equivalenceClaimed: false });
    expect(assessment.ready).toBe(true);
    expect(assessment.missingRequiredSections).toHaveLength(0);
  });

  it('reports the missing required sections for a sparse stored CER', () => {
    const m = mapStoredCerToCanonicalSections({ executiveSummary: { t: 1 } }, [{ sectionId: 's', title: 'Scope' }]);
    const a = assessCerStructure(m.present);
    expect(a.ready).toBe(false);
    expect(a.missingRequiredSections).toEqual(expect.arrayContaining(['analysis', 'conclusions', 'clinical_data']));
  });
});
