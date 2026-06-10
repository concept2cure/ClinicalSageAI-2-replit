/**
 * Safety-narrative writer — unit tests. Deterministic; verifies prose assembly,
 * seriousness detection, completeness flags, and the never-invent rule.
 */
import { describe, it, expect } from 'vitest';
import { composeSafetyNarrative } from '../safety-narrative';

describe('composeSafetyNarrative', () => {
  it('assembles a complete serious-AE narrative in order with no missing fields', () => {
    const r = composeSafetyNarrative({
      subjectId: '1001',
      age: 67,
      sex: 'Male',
      studyId: 'ABC-301',
      treatmentArm: 'pembrolizumab',
      studyDrug: 'pembrolizumab',
      dose: '200 mg Q3W',
      firstDoseDate: '2025-02-01',
      medicalHistory: ['hypertension', 'type 2 diabetes'],
      concomitantMeds: ['metformin'],
      event: {
        term: 'immune-mediated pneumonitis',
        dayOnStudy: 45,
        severity: 'grade 3',
        seriousnessCriteria: ['hospitalization'],
        causality: 'related',
        actionTaken: 'drug withdrawn',
        treatment: 'high-dose corticosteroids',
        dechallenge: 'positive',
        outcome: 'recovered',
      },
    });
    expect(r.serious).toBe(true);
    expect(r.missingFields).toEqual([]);
    expect(r.narrative).toContain('Subject 1001, a 67-year-old male subject');
    expect(r.narrative).toContain('pembrolizumab arm in study ABC-301');
    expect(r.narrative).toContain('Relevant medical history included hypertension, type 2 diabetes');
    expect(r.narrative).toContain('On study day 45, the subject experienced grade 3 immune-mediated pneumonitis');
    expect(r.narrative).toContain('assessed as serious (criteria: hospitalization)');
    expect(r.narrative).toContain('Action taken with study drug: drug withdrawn');
    expect(r.narrative).toContain('dechallenge was positive');
    expect(r.narrative).toContain('outcome was reported as recovered');
    expect(r.narrative).toContain('investigator assessed the event as related to pembrolizumab');
  });

  it('flags missing required fields and never fabricates them', () => {
    const r = composeSafetyNarrative({
      subjectId: '2002',
      event: { term: 'syncope' },
    });
    expect(r.serious).toBe(false);
    expect(r.missingFields).toEqual(
      expect.arrayContaining([
        'medicalHistory', 'studyDrug', 'event.severity', 'event.seriousnessCriteria',
        'event.actionTaken', 'event.outcome', 'event.causality',
      ]),
    );
    // No invented seriousness/causality/outcome text.
    expect(r.narrative).not.toMatch(/serious \(criteria/);
    expect(r.narrative).not.toMatch(/outcome was reported/);
    expect(r.narrative).toContain('the subject experienced syncope');
  });

  it('uses onset date when day-on-study is absent and closes with causality vs study drug', () => {
    const r = composeSafetyNarrative({
      subjectId: '3003',
      studyDrug: 'drug X',
      event: { term: 'rash', onsetDate: '2025-03-10', causality: 'possibly related', outcome: 'recovering' },
    });
    expect(r.narrative).toContain('On 2025-03-10, the subject experienced rash');
    expect(r.narrative).toContain('possibly related to drug X');
  });
});
