/**
 * Grounding guard for the Safety Narrative Generation Service.
 *
 * server/services/safety-narrative-service.ts turns ai.chat() output into
 * verbatim CSR/IB/CER/DSUR filing prose (aggregate safety narratives, SAE
 * narratives, benefit-risk narratives). Nothing sat between the model and
 * the filing to catch an invented incidence rate, subject count, or lab
 * value. This suite proves the grounding guard added to close that gap:
 *
 *   - A narrative containing a number NOT present in the source safety data
 *     is REFUSED — the service returns a deterministic, source-grounded
 *     fallback (never the fabricated AI prose), for both the plain-string
 *     narrative methods (generateSAENarrative) and the JSON-structured
 *     method (generateAggregateSafetyNarrative).
 *   - A narrative whose numbers are all traceable to the source data passes
 *     through unchanged.
 *
 * The `ai.chat` mock lets each test control exactly what the model
 * "hallucinates" without a live provider. `../../db` is mocked too so the
 * unused `db` import at the top of the service module can't reach for a
 * real Postgres connection.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

const chatMock = vi.fn();

vi.mock('../../db', () => ({ db: {}, pool: {} }));
vi.mock('../../lib/unified-ai-client', () => ({
  ai: { chat: (...args: unknown[]) => chatMock(...args) },
}));

import { safetyNarrativeService } from '../safety-narrative-service';
import type { AggregateSafetyRequest, SAECaseData } from '../safety-narrative-service';

beforeEach(() => {
  chatMock.mockReset();
});

// ---------------------------------------------------------------------------
// generateSAENarrative — plain-string narrative
// ---------------------------------------------------------------------------

const baseSaeCase: SAECaseData = {
  caseId: 'SAE-2024-0007',
  patientAge: 54,
  patientSex: 'female',
  relevantMedicalHistory: ['hypertension'],
  treatmentArm: 'Arm A',
  drugName: 'StudyDrugX',
  dose: '50 mg',
  eventTerm: 'acute pancreatitis',
  eventDescription: 'Sudden onset of severe abdominal pain radiating to the back.',
  onsetDate: '15-JAN-2024',
  onsetStudyDay: 42,
  seriousnessCriteria: ['hospitalization'],
  severity: 'severe',
  actionTaken: 'drug_withdrawn',
  outcome: 'recovered',
  causalityAssessment: 'possibly related',
};

describe('generateSAENarrative — grounding guard', () => {
  it('withholds an AI narrative that introduces a number not present in the input case data', async () => {
    // "15600" (a fabricated white cell count) never appears anywhere in
    // baseSaeCase — the only 4+ digit tokens available are "2024"/"0007"
    // from the case id / onset date.
    chatMock.mockResolvedValue({
      content:
        'The subject, a 54-year-old female (Case SAE-2024-0007), experienced acute pancreatitis. ' +
        'Laboratory studies revealed a white blood cell count of 15600 cells/mm3, confirming the diagnosis. ' +
        'The investigator assessed the event as possibly related to study treatment.',
      model: 'test-model',
    });

    const narrative = await safetyNarrativeService.generateSAENarrative(baseSaeCase);

    // The fabricated figure must never reach filing prose.
    expect(narrative).not.toContain('15600');
    // Old (pre-fix) code returned aiResult.content verbatim, which would
    // equal the mocked text above and thus fail both assertions here.
    expect(narrative.toLowerCase()).toContain('ai narrative withheld');
    // The honest fallback is built straight from the input, so the case id
    // and event term the operator actually submitted are still present.
    expect(narrative).toContain('SAE-2024-0007');
    expect(narrative).toContain('acute pancreatitis');
  });

  it('passes through an AI narrative whose numbers are all grounded in the input case data', async () => {
    // Every digit run here (2024, 0007, 42, 50, 54) traces back to
    // baseSaeCase — no unknown numeric or identifier token is introduced.
    const grounded =
      'The subject, a 54-year-old female (Case SAE-2024-0007), experienced acute pancreatitis while ' +
      'receiving StudyDrugX 50 mg in Arm A. Onset occurred on 15-JAN-2024 (Study Day 42). ' +
      'The investigator assessed the event as possibly related to study treatment. Study drug was ' +
      'permanently discontinued and the event resolved.';

    chatMock.mockResolvedValue({ content: grounded, model: 'test-model' });

    const narrative = await safetyNarrativeService.generateSAENarrative(baseSaeCase);

    expect(narrative).toBe(grounded);
    expect(narrative.toLowerCase()).not.toContain('ai narrative withheld');
  });
});

// ---------------------------------------------------------------------------
// generateAggregateSafetyNarrative — JSON-structured narrative
// ---------------------------------------------------------------------------

const baseAggregateRequest: AggregateSafetyRequest = {
  studyId: 'STUDY-3301',
  studyTitle: 'A Phase 2 Study of StudyDrugX',
  indication: 'Oncology',
  narrativeType: 'csr',
  treatmentArms: [
    { armName: 'Drug A', armType: 'experimental', nSubjects: 120, exposureDuration: '12 weeks' },
    { armName: 'Placebo', armType: 'placebo', nSubjects: 118, exposureDuration: '12 weeks' },
  ],
  teaeData: [
    {
      preferredTerm: 'headache',
      systemOrganClass: 'Nervous system disorders',
      armCounts: { 'Drug A': { n: 34, percent: 28.3 }, Placebo: { n: 20, percent: 16.9 } },
      seriousness: 'non_serious',
    },
  ],
  saeData: [],
  deaths: [],
  discontinuationsDueToAE: {},
};

function jsonResult(sections: Array<{ sectionCode: string; title: string; content: string }>) {
  return {
    content: JSON.stringify({ sections, keyFindings: [], regulatoryConcerns: [] }),
    model: 'test-model',
  };
}

describe('generateAggregateSafetyNarrative — grounding guard', () => {
  it('withholds an AI narrative whose section content introduces an ungrounded number', async () => {
    // "4120" never appears anywhere in baseAggregateRequest (arm sizes are
    // 120/118, both 3-digit; studyId contributes only "3301").
    chatMock.mockResolvedValue(
      jsonResult([
        {
          sectionCode: '12.0',
          title: 'Safety Overview',
          content:
            'A total of 4120 subjects were enrolled in Study STUDY-3301 across two treatment arms.',
        },
        {
          sectionCode: '12.2',
          title: 'Treatment-Emergent Adverse Events',
          content: 'Headache was the most frequently reported TEAE.',
        },
      ]),
    );

    const result = await safetyNarrativeService.generateAggregateSafetyNarrative(baseAggregateRequest);

    // Old (pre-fix) code built fullNarrative directly from the parsed AI
    // sections and would contain "4120" — this must not.
    expect(result.fullNarrative).not.toContain('4120');
    expect(result.aiNarrativeWithheld).toBe(true);
    // The deterministic fallback is source-grounded and honest about its status.
    expect(result.fullNarrative.toLowerCase()).toContain('ai narrative withheld');
    expect(result.fullNarrative).toContain('STUDY-3301');
  });

  it('passes through an AI narrative whose section content is fully grounded', async () => {
    chatMock.mockResolvedValue(
      jsonResult([
        {
          sectionCode: '12.0',
          title: 'Safety Overview',
          content:
            'Study STUDY-3301 enrolled subjects into Drug A and Placebo arms with a 12-week exposure period.',
        },
        {
          sectionCode: '12.2',
          title: 'Treatment-Emergent Adverse Events',
          content: 'Headache was reported in the Drug A arm (34 subjects, 28.3%) and the Placebo arm (20 subjects, 16.9%).',
        },
      ]),
    );

    const result = await safetyNarrativeService.generateAggregateSafetyNarrative(baseAggregateRequest);

    expect(result.aiNarrativeWithheld).toBeUndefined();
    expect(result.fullNarrative).toContain('Headache was reported in the Drug A arm');
    expect(result.fullNarrative.toLowerCase()).not.toContain('ai narrative withheld');
  });
});
