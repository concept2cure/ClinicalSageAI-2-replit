/**
 * Tests for the device readiness scorecard — proves the weighted scoring, levels,
 * and gap surfacing, plus the blueprint adapter.
 */
import { describe, it, expect } from 'vitest';
import { computeDeviceReadinessScorecard, scorecardFromBlueprint } from '../device-readiness-scorecard';
import { buildDeviceBlueprint } from '../device-blueprint';

describe('readiness scorecard — pure scorer', () => {
  it('is 100 / ready when everything is complete', () => {
    const sc = computeDeviceReadinessScorecard({
      classificationKnown: true,
      requirements: { present: 5, total: 5 },
      evidence: [
        { id: 'risk_management', label: 'RMF', applicable: true, ready: true },
        { id: 'clinical_evaluation', label: 'CER', applicable: true, ready: true },
      ],
    });
    expect(sc.score).toBe(100);
    expect(sc.level).toBe('ready');
    expect(sc.topGaps).toHaveLength(0);
  });

  it('is not_ready / low when nothing is done, and surfaces gaps', () => {
    const sc = computeDeviceReadinessScorecard({
      classificationKnown: false,
      requirements: { present: 0, total: 5 },
      evidence: [{ id: 'risk_management', label: 'RMF', applicable: true, ready: false }],
    });
    expect(sc.score).toBeLessThan(40);
    expect(sc.level).toBe('not_ready');
    expect(sc.topGaps.some((g) => /classification/i.test(g))).toBe(true);
    expect(sc.topGaps.some((g) => /required document/i.test(g))).toBe(true);
  });

  it('scores partial evidence via present/total', () => {
    const sc = computeDeviceReadinessScorecard({
      classificationKnown: true,
      evidence: [{ id: 'cer', label: 'CER', applicable: true, present: 6, total: 12 }],
    });
    // classification 100 (w10) + CER 50 (w60) → (1000+3000)/70 ≈ 57 → 'early'.
    expect(sc.dimensions.find((d) => d.id === 'evidence:cer')?.score).toBe(50);
    expect(sc.score).toBe(57);
    expect(sc.level).toBe('early');
  });

  it('weights normalise when a dimension is absent (no requirements assessed)', () => {
    const sc = computeDeviceReadinessScorecard({
      classificationKnown: true,
      evidence: [{ id: 'rmf', label: 'RMF', applicable: true, ready: true }],
    });
    // classification (10) + rmf (60), both 100 → 100.
    expect(sc.score).toBe(100);
    expect(sc.dimensions.some((d) => d.id === 'required_documents')).toBe(false);
  });
});

describe('readiness scorecard — from blueprint', () => {
  it('derives the scorecard from a blueprint (CER partially authored)', () => {
    const bp = buildDeviceBlueprint({
      submissionType: 'mdr_td',
      classification: { framework: 'mdr', facts: { implantable: true } },
      present: { cerSectionIds: ['summary', 'scope'], rmfSectionIds: ['plan'] },
    });
    const sc = scorecardFromBlueprint(bp);
    expect(sc.score).toBeGreaterThan(0);
    expect(sc.score).toBeLessThan(100);
    // CER + RMF appear as evidence dimensions; biocompatibility is excluded from scoring.
    expect(sc.dimensions.some((d) => d.id === 'evidence:clinical_evaluation')).toBe(true);
    expect(sc.dimensions.some((d) => d.id === 'evidence:biocompatibility')).toBe(false);
    expect(sc.topGaps.length).toBeGreaterThan(0);
  });

  it('credits a fully-authored CER', () => {
    const all = ['summary', 'scope', 'clinical_background', 'device_description', 'clinical_data', 'appraisal', 'analysis', 'pmcf', 'conclusions', 'evaluator_qualification', 'references'];
    const rmfAll = ['plan', 'analysis', 'evaluation', 'control', 'overall_residual_risk', 'review', 'report', 'post_production'];
    const bp = buildDeviceBlueprint({
      submissionType: 'mdr_td',
      classification: { framework: 'mdr', facts: { implantable: true } },
      present: { cerSectionIds: all, rmfSectionIds: rmfAll },
    });
    const sc = scorecardFromBlueprint(bp);
    expect(sc.dimensions.find((d) => d.id === 'evidence:clinical_evaluation')?.status).toBe('ready');
    expect(sc.dimensions.find((d) => d.id === 'evidence:risk_management')?.status).toBe('ready');
  });
});
