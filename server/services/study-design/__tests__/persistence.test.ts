/**
 * Tests for the pure pieces of persistence and CSR grounding: the StudyDesign ↔ CDISC
 * PRM row mapping (which must round-trip losslessly through `metadata`) and the
 * conservative CSR effect extractor (which must pull a number only when one is present
 * in a machine-readable field, never from prose). No database.
 */

import { describe, it, expect } from 'vitest';
import {
  studyDesignToRows,
  rowsToStudyDesign,
  STUDY_DESIGN_META_KIND,
} from '../study-design-repository';
import { extractEffectObservation } from '../csr-evidence-source';
import { type StudyDesign } from '../study-design-types';

function design(overrides: Partial<StudyDesign> = {}): StudyDesign {
  return {
    title: 'A study of Drug X',
    phase: '3',
    indication: 'type 2 diabetes',
    objectives: [
      { level: 'primary', order: 1, text: 'Superiority on HbA1c', endpointName: 'HbA1c' },
      { level: 'secondary', order: 1, text: 'Weight', endpointName: 'Weight' },
    ],
    estimands: [],
    endpoints: [
      { name: 'HbA1c', role: 'primary', type: 'continuous', definition: 'change at week 24', timepoint: 'week 24' },
      { name: 'Weight', role: 'secondary', type: 'continuous', definition: 'change in weight' },
    ],
    framework: { inferentialFrame: 'superiority', structuralDesign: 'parallel_group', controlType: 'placebo' },
    population: {
      targetDescription: 'adults with T2D',
      analysisPopulations: [{ kind: 'ITT', definition: 'all randomized' }],
      eligibility: [],
    },
    arms: [
      { name: 'Drug X', interventions: [{ name: 'Drug X', role: 'investigational', dose: '10 mg' }] },
      { name: 'Placebo', interventions: [{ name: 'Placebo', role: 'placebo' }] },
    ],
    randomization: { ratio: [2, 1], allocationMethod: 'stratified', blinding: 'double' },
    statisticalPlan: {
      plannedSampleSize: 300,
      plannedAnalyses: [{ endpointName: 'HbA1c', method: 'MMRM' }],
    },
    status: 'draft',
    ...overrides,
  };
}

describe('studyDesignToRows / rowsToStudyDesign', () => {
  it('projects the design onto PRM columns and stores the canonical object in metadata', () => {
    const rows = studyDesignToRows(design(), { tenantId: 1, userId: 7 });
    expect(rows.study.protocolTitle).toBe('A study of Drug X');
    expect(rows.study.studyPhase).toBe('3');
    expect(rows.study.indication).toBe('type 2 diabetes');
    expect(rows.study.primaryObjective).toBe('Superiority on HbA1c');
    expect(rows.study.blindingSchema).toBe('double');
    expect(rows.study.plannedSubjects).toBe(300);
    expect((rows.study.metadata as any).kind).toBe(STUDY_DESIGN_META_KIND);
  });

  it('classifies arm types and splits subjects by the allocation ratio', () => {
    const rows = studyDesignToRows(design(), { tenantId: 1, userId: 7 });
    expect(rows.arms.map(a => a.armType)).toEqual(['Treatment', 'Placebo']);
    // 300 split 2:1 → 200 / 100
    expect(rows.arms.map(a => a.plannedSubjects)).toEqual([200, 100]);
    expect(rows.arms[0].armCode).toBe('A1');
  });

  it('maps endpoint role and measurement type, and pulls the analysis method', () => {
    const rows = studyDesignToRows(design(), { tenantId: 1, userId: 7 });
    expect(rows.endpoints[0].endpointType).toBe('Primary');
    expect(rows.endpoints[0].measurementType).toBe('Continuous');
    expect(rows.endpoints[0].analysisMethod).toBe('MMRM');
    expect(rows.endpoints[1].endpointType).toBe('Secondary');
  });

  it('generates a study id when absent and preserves a supplied one', () => {
    const generated = studyDesignToRows(design(), { tenantId: 1, userId: 7 });
    expect(generated.study.studyId).toMatch(/^sd_/);
    const supplied = studyDesignToRows(design({ id: 'sd_fixed' }), { tenantId: 1, userId: 7 });
    expect(supplied.study.studyId).toBe('sd_fixed');
  });

  it('round-trips losslessly through metadata', () => {
    const original = design({ id: 'sd_rt' });
    const rows = studyDesignToRows(original, { tenantId: 1, userId: 7 });
    const restored = rowsToStudyDesign({ studyId: 'sd_rt', metadata: rows.study.metadata });
    expect(restored).not.toBeNull();
    expect(restored!.title).toBe(original.title);
    expect(restored!.endpoints).toHaveLength(2);
    expect(restored!.framework.inferentialFrame).toBe('superiority');
    expect(restored!.id).toBe('sd_rt');
  });

  it('returns null for a row that is not a design spine', () => {
    expect(rowsToStudyDesign({ studyId: 'x', metadata: { kind: 'something-else' } })).toBeNull();
    expect(rowsToStudyDesign({ studyId: 'x', metadata: null })).toBeNull();
  });
});

describe('extractEffectObservation', () => {
  const report = { reportTitle: 'NCT-A CSR', indication: 'type 2 diabetes', phase: '3', nctId: 'NCT-A', sampleSize: 240 };

  it('extracts a primaryEffect object with a standard error', () => {
    const obs = extractEffectObservation(report, { results: { primaryEffect: { value: 0.32, standardError: 0.08 } } });
    expect(obs).not.toBeNull();
    expect(obs!.effect).toBeCloseTo(0.32);
    expect(obs!.standardError).toBeCloseTo(0.08);
    expect(obs!.source.ref).toBe('NCT-A');
    expect(obs!.n).toBe(240);
  });

  it('derives the standard error from a confidence interval', () => {
    const obs = extractEffectObservation(report, { results: { primaryEffect: { value: 0.3, ci: [0.1, 0.5] } } });
    expect(obs).not.toBeNull();
    // SE = (0.5 - 0.1) / (2 * 1.96) ≈ 0.102
    expect(obs!.standardError).toBeCloseTo(0.102, 2);
  });

  it('converts a hazard ratio to a benefit-oriented log effect when lower is better', () => {
    const obs = extractEffectObservation(
      report,
      { results: { hazardRatio: 0.7, ci: [0.55, 0.9] } },
      { direction: 'decrease' },
    );
    expect(obs).not.toBeNull();
    // benefit = -log(0.7) > 0
    expect(obs!.effect).toBeCloseTo(-Math.log(0.7), 5);
    expect(obs!.effect).toBeGreaterThan(0);
  });

  it('returns null when no machine-readable effect is present', () => {
    const obs = extractEffectObservation(report, { results: { efficacyNarrative: 'the drug worked well' } });
    expect(obs).toBeNull();
  });

  it('down-weights evidence from a different indication', () => {
    const obs = extractEffectObservation(
      { ...report, indication: 'hypertension' },
      { results: { effectSize: 0.3, standardError: 0.08 } },
      { targetIndication: 'type 2 diabetes' },
    );
    expect(obs).not.toBeNull();
    expect(obs!.relevance!).toBeLessThan(1);
  });
});
