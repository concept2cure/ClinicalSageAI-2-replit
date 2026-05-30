import { describe, it, expect } from 'vitest';
import {
  normalizeCtgovStudy,
  normalizeCtgovStudies,
  normalizePhase,
  statusToSuccessHint,
  splitEligibility,
} from '../../server/services/corpus/ctgov-normalizer';
import type { CtgovStudy } from '../../server/services/corpus/ctgov-types';

const fullStudy: CtgovStudy = {
  protocolSection: {
    identificationModule: {
      nctId: 'NCT01234567',
      briefTitle: 'A Study of Drug X in Heart Failure',
      officialTitle: 'A Phase 3 RCT of Drug X',
    },
    statusModule: {
      overallStatus: 'COMPLETED',
      startDateStruct: { date: '2019-01-01' },
      completionDateStruct: { date: '2020-01-01' },
    },
    sponsorCollaboratorsModule: { leadSponsor: { name: 'Acme Pharma' } },
    descriptionModule: { briefSummary: 'Evaluates efficacy and safety of Drug X.' },
    designModule: {
      phases: ['PHASE3'],
      studyType: 'INTERVENTIONAL',
      enrollmentInfo: { count: 450 },
      designInfo: {
        allocation: 'RANDOMIZED',
        interventionModel: 'PARALLEL',
        primaryPurpose: 'TREATMENT',
        maskingInfo: { masking: 'DOUBLE' },
      },
    },
    conditionsModule: { conditions: ['Heart Failure'] },
    armsInterventionsModule: {
      armGroups: [
        { label: 'Drug X', type: 'EXPERIMENTAL', description: 'Drug X 10mg' },
        { label: 'Placebo', type: 'PLACEBO_COMPARATOR', description: 'Matching placebo' },
      ],
    },
    outcomesModule: {
      primaryOutcomes: [{ measure: 'Change in LVEF at 12 months' }],
      secondaryOutcomes: [{ measure: 'Time to first HF hospitalization' }, { measure: 'NYHA class' }],
    },
    eligibilityModule: {
      eligibilityCriteria:
        'Inclusion Criteria:\n- Age >= 18\n- LVEF <= 40%\n\nExclusion Criteria:\n- Pregnancy\n- eGFR < 30',
    },
  },
};

describe('normalizePhase', () => {
  it('maps PHASE3 to Phase 3', () => {
    expect(normalizePhase(['PHASE3'])).toBe('Phase 3');
  });
  it('joins multiple phases', () => {
    expect(normalizePhase(['PHASE1', 'PHASE2'])).toBe('Phase 1/Phase 2');
  });
  it('handles NA and empty', () => {
    expect(normalizePhase(['NA'])).toBe('Not applicable');
    expect(normalizePhase([])).toBe('Not specified');
    expect(normalizePhase(undefined)).toBe('Not specified');
  });
});

describe('statusToSuccessHint', () => {
  it('completed -> 1', () => expect(statusToSuccessHint('COMPLETED')).toBe(1));
  it('terminated/withdrawn/suspended -> 0', () => {
    expect(statusToSuccessHint('TERMINATED')).toBe(0);
    expect(statusToSuccessHint('WITHDRAWN')).toBe(0);
    expect(statusToSuccessHint('SUSPENDED')).toBe(0);
  });
  it('ongoing/unknown -> null (not assessable)', () => {
    expect(statusToSuccessHint('RECRUITING')).toBeNull();
    expect(statusToSuccessHint('UNKNOWN')).toBeNull();
    expect(statusToSuccessHint(undefined)).toBeNull();
  });
});

describe('splitEligibility', () => {
  it('splits inclusion and exclusion', () => {
    const r = splitEligibility('Inclusion Criteria:\n- A\n\nExclusion Criteria:\n- B');
    expect(r.inclusion).toContain('- A');
    expect(r.exclusion).toContain('- B');
    expect(r.inclusion).not.toContain('Exclusion');
  });
  it('handles inclusion only', () => {
    const r = splitEligibility('Inclusion Criteria:\n- A');
    expect(r.inclusion).toContain('- A');
    expect(r.exclusion).toBeNull();
  });
  it('handles empty', () => {
    expect(splitEligibility(undefined)).toEqual({ inclusion: null, exclusion: null });
  });
});

describe('normalizeCtgovStudy', () => {
  it('maps a full study deterministically', () => {
    const a = normalizeCtgovStudy(fullStudy);
    const b = normalizeCtgovStudy(fullStudy);
    expect(a).toEqual(b); // deterministic
    expect(a).not.toBeNull();
    if (!a) return;
    expect(a.nctId).toBe('NCT01234567');
    expect(a.report.title).toBe('A Study of Drug X in Heart Failure');
    expect(a.report.sponsor).toBe('Acme Pharma');
    expect(a.report.indication).toBe('Heart Failure');
    expect(a.report.phase).toBe('Phase 3');
    expect(a.successHint).toBe(1);
    expect(a.details.sampleSize).toBe(450);
    expect(a.details.endpoints?.primary).toEqual(['Change in LVEF at 12 months']);
    expect(a.details.endpoints?.secondary).toHaveLength(2);
    expect(a.details.treatmentArms).toHaveLength(2);
    expect(a.details.studyDesign).toContain('randomized');
    expect(a.details.studyDesign).toContain('double masking');
    expect(a.details.inclusionCriteria).toContain('LVEF');
    expect(a.details.exclusionCriteria).toContain('Pregnancy');
    expect(a.details.studyDuration).toBe('52 weeks');
  });

  it('never fabricates missing fields', () => {
    const sparse: CtgovStudy = {
      protocolSection: {
        identificationModule: { nctId: 'NCT99999999', briefTitle: 'Sparse study' },
      },
    };
    const n = normalizeCtgovStudy(sparse);
    expect(n).not.toBeNull();
    if (!n) return;
    expect(n.report.sponsor).toBe('Unknown sponsor');
    expect(n.report.indication).toBe('Not specified');
    expect(n.report.phase).toBe('Not specified');
    expect(n.details.sampleSize).toBeNull();
    expect(n.details.endpoints).toBeNull();
    expect(n.details.treatmentArms).toBeNull();
    expect(n.details.statisticalMethods).toBeNull(); // never invented
    expect(n.successHint).toBeNull();
  });

  it('returns null when there is no usable identification', () => {
    expect(normalizeCtgovStudy({})).toBeNull();
    expect(normalizeCtgovStudy({ protocolSection: {} })).toBeNull();
  });

  it('drops zero/negative enrollment rather than storing it', () => {
    const study: CtgovStudy = {
      protocolSection: {
        identificationModule: { nctId: 'NCT1', briefTitle: 't' },
        designModule: { enrollmentInfo: { count: 0 } },
      },
    };
    expect(normalizeCtgovStudy(study)?.details.sampleSize).toBeNull();
  });
});

describe('normalizeCtgovStudies', () => {
  it('drops un-normalizable studies from a batch', () => {
    const out = normalizeCtgovStudies([fullStudy, {}, { protocolSection: {} }]);
    expect(out).toHaveLength(1);
    expect(out[0].nctId).toBe('NCT01234567');
  });
});
