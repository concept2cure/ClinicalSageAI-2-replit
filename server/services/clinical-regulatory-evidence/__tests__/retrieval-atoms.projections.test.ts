/**
 * CRE retrieval atoms — pure projection unit tests (no DB).
 *
 * Proves the nine CRE entities map to the nine lower_snake_case atom types with
 * the right identity (sourceRef), tags and provenance-honest confidence, and that
 * the eligibility rules hold (design lessons must be human-approved; a requested
 * action / safety role / missingness spawns the right extra atom).
 */

import { describe, it, expect } from 'vitest';
import {
  projectFinding, projectOutcome, projectDesignLesson, projectDesignFeature, projectResultObservation,
  toPgTextArray, toVectorLiteral, CRE_ATOM_TYPES, type CreAtomType,
} from '../retrieval-atoms.service';
import type {
  RegulatoryFinding, RegulatoryOutcome, DesignLesson, StudyDesignFeature, StudyResultObservation,
} from '../types';

// ─── factories (all interface fields present; overridable) ────────────────────

function finding(over: Partial<RegulatoryFinding> = {}): RegulatoryFinding {
  return {
    id: 1, organizationId: null, visibilityClass: 'global_public', sourceId: 10,
    applicationIdentifier: 'BLA-761111', relatedStudyIds: [5], findingDomain: 'clinical',
    findingCategory: 'inadequate_efficacy', findingSubcategory: null, fdaReviewDiscipline: 'clinical',
    findingText: 'A single trial does not establish effectiveness.', normalizedSummary: 'Single-trial efficacy insufficient.',
    requestedAction: 'Conduct a confirmatory trial.', severity: 'major', affectedCtdSection: '2.7.3',
    affectedIchE3Section: '11.4', affectedProtocolElement: null, affectedSapElement: null,
    affectedStudyDesignFeature: 'primary_endpoint', sourcePage: 3, sourceExcerpt: 'a single trial…',
    explicitOrInferred: 'explicit', extractionConfidence: 0.95, verificationStatus: 'unverified',
    metadata: {}, createdAt: '2026-01-01', updatedAt: '2026-01-01', ...over,
  };
}

function outcome(over: Partial<RegulatoryOutcome> = {}): RegulatoryOutcome {
  return {
    id: 2, organizationId: null, visibilityClass: 'global_public', sourceId: 10,
    applicationIdentifier: 'BLA-761111', outcomeType: 'crl', outcomeDate: '2026-02-14', approvalDate: null,
    timeToResolutionDays: null, evidenceNote: 'CRL issued citing efficacy.', verificationStatus: 'verified',
    linkedSubmissionOutcomeId: null, linkedPrecedentId: null, metadata: {},
    createdAt: '2026-01-01', updatedAt: '2026-01-01', ...over,
  };
}

function lesson(over: Partial<DesignLesson> = {}): DesignLesson {
  return {
    id: 3, organizationId: null, visibilityClass: 'global_public',
    lessonStatement: 'Single-arm efficacy packages draw efficacy deficiencies in this setting.',
    applicablePopulation: 'NSCLC', applicablePhase: '3', modality: 'small_molecule', endpointType: 'ORR',
    supportingSourceIds: [10, 11], contradictingSourceIds: [], minimumEvidenceCount: 2,
    evidenceQualityScore: 0.7, confidenceInterval: null, derivationMethod: 'precedent_aggregation',
    modelVersion: 'cre-1', humanReviewStatus: 'approved', lastRecalculatedAt: null, metadata: {},
    createdAt: '2026-01-01', updatedAt: '2026-01-01', ...over,
  };
}

function feature(over: Partial<StudyDesignFeature> = {}): StudyDesignFeature {
  return {
    studyId: 5, featureKey: 'primary_endpoint', value: 'overall survival', sourceId: 10,
    sourceLocation: 'csr_details.primary_endpoint', extractionMethod: 'deterministic',
    extractionConfidence: 1, explicitOrInferred: 'explicit', verificationStatus: 'unverified', ...over,
  };
}

function observation(over: Partial<StudyResultObservation> = {}): StudyResultObservation {
  return {
    studyId: 5, endpoint: 'overall survival', endpointRole: 'primary', estimand: null,
    analysisPopulation: 'ITT', effectMeasure: 'hazard_ratio', effectValue: 0.82, standardError: null,
    ciLower: 0.7, ciUpper: 0.96, pValue: 0.02, directionOfBenefit: 'positive', timepoint: '24m',
    sampleSize: 400, missingness: null, subgroup: null, multiplicityStatus: 'controlled', sourceLocation: 'csr.efficacy', ...over,
  };
}

describe('projectFinding', () => {
  it('emits a finding atom and a requested-action atom when an action is present', () => {
    const drafts = projectFinding(finding());
    const types = drafts.map((d) => d.atomType);
    expect(types).toContain('fda_regulatory_finding');
    expect(types).toContain('fda_requested_action');
    const f = drafts.find((d) => d.atomType === 'fda_regulatory_finding')!;
    expect(f.sourceRef).toBe('finding:1');
    expect(f.tags).toContain('fda');
    expect(f.confidence).toBeCloseTo(0.95);
    expect(drafts.find((d) => d.atomType === 'fda_requested_action')!.sourceRef).toBe('finding:1:action');
  });
  it('emits only the finding atom when there is no requested action', () => {
    const drafts = projectFinding(finding({ requestedAction: null }));
    expect(drafts.map((d) => d.atomType)).toEqual(['fda_regulatory_finding']);
  });
  it('falls back to findingText when normalizedSummary is absent', () => {
    const drafts = projectFinding(finding({ normalizedSummary: null }));
    expect(drafts[0].content).toMatch(/single trial/i);
  });
});

describe('projectOutcome', () => {
  it('emits one regulatory_outcome atom that is explicitly a record, not a prediction', () => {
    const [d] = projectOutcome(outcome());
    expect(d.atomType).toBe('regulatory_outcome');
    expect(d.sourceRef).toBe('outcome:2');
    expect(d.content).toMatch(/not a prediction/i);
    expect(d.confidence).toBe(0.9); // verified
  });
});

describe('projectDesignLesson', () => {
  it('atomizes an approved lesson (and no contradictory atom without contradicting sources)', () => {
    const drafts = projectDesignLesson(lesson());
    expect(drafts.map((d) => d.atomType)).toEqual(['design_lesson']);
    expect(drafts[0].content).toMatch(/not a prediction of acceptance/i);
  });
  it('adds a contradictory_precedent atom when the lesson carries contradicting sources', () => {
    const drafts = projectDesignLesson(lesson({ contradictingSourceIds: [99, 100] }));
    expect(drafts.map((d) => d.atomType)).toEqual(['design_lesson', 'contradictory_precedent']);
    expect(drafts[1].sourceRef).toBe('design_lesson:3:contradiction');
  });
  it('never atomizes an unreviewed or rejected lesson', () => {
    expect(projectDesignLesson(lesson({ humanReviewStatus: 'pending' }))).toHaveLength(0);
    expect(projectDesignLesson(lesson({ humanReviewStatus: 'rejected' }))).toHaveLength(0);
  });
});

describe('projectDesignFeature', () => {
  it('emits a csr_design_feature atom carrying provenance', () => {
    const [d] = projectDesignFeature(feature(), { indication: 'NSCLC', phase: '3' });
    expect(d.atomType).toBe('csr_design_feature');
    expect(d.content).toMatch(/overall survival/);
    expect(d.structuredData.explicitOrInferred).toBe('explicit');
  });
  it('drops a feature with no value', () => {
    expect(projectDesignFeature(feature({ value: null }))).toHaveLength(0);
    expect(projectDesignFeature(feature({ value: '' }))).toHaveLength(0);
  });
});

describe('projectResultObservation', () => {
  it('is a result observation by default', () => {
    expect(projectResultObservation(observation()).map((d) => d.atomType)).toEqual(['csr_result_observation']);
  });
  it('is a safety signal when the endpoint role is safety', () => {
    expect(projectResultObservation(observation({ endpointRole: 'safety' })).map((d) => d.atomType)).toEqual(['csr_safety_signal']);
  });
  it('adds an execution-limitation atom when missingness is recorded', () => {
    const drafts = projectResultObservation(observation({ missingness: 0.18 }));
    expect(drafts.map((d) => d.atomType)).toEqual(['csr_result_observation', 'csr_execution_limitation']);
    expect(drafts[1].sourceRef).toMatch(/:limitation$/);
  });
});

describe('coverage + pure helpers', () => {
  it('the projections collectively cover all nine CRE atom types', () => {
    const produced = new Set<CreAtomType>();
    projectFinding(finding()).forEach((d) => produced.add(d.atomType));
    projectOutcome(outcome()).forEach((d) => produced.add(d.atomType));
    projectDesignLesson(lesson({ contradictingSourceIds: [1] })).forEach((d) => produced.add(d.atomType));
    projectDesignFeature(feature()).forEach((d) => produced.add(d.atomType));
    projectResultObservation(observation({ endpointRole: 'safety' })).forEach((d) => produced.add(d.atomType));
    projectResultObservation(observation({ missingness: 0.1 })).forEach((d) => produced.add(d.atomType));
    expect([...produced].sort()).toEqual([...CRE_ATOM_TYPES].sort());
  });
  it('toPgTextArray escapes and brackets', () => {
    expect(toPgTextArray(['a', 'b'])).toBe('{"a","b"}');
    expect(toPgTextArray([])).toBe('{}');
    expect(toPgTextArray(['a"x', ''])).toBe('{"a\\"x"}');
  });
  it('toVectorLiteral renders the pgvector literal', () => {
    expect(toVectorLiteral([0.1, 0.2, 0.3])).toBe('[0.1,0.2,0.3]');
  });
});
