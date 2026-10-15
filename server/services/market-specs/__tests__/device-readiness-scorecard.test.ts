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
    // classification 100 (w10) + required documents not assessed 0 (w30)
    // + CER 50 (w60) → (1000+0+3000)/100 = 40 → 'early'.
    expect(sc.dimensions.find((d) => d.id === 'evidence:cer')?.score).toBe(50);
    expect(sc.score).toBe(40);
    expect(sc.level).toBe('early');
  });

  /* This was 'weights normalise when a dimension is absent (no requirements
     assessed)', and it asserted 100: a determined class and one ready module,
     with the required documents never looked at, scored 'ready'. The
     /device/blueprint route and AnA's tool never pass a requirements
     assessment, so every scorecard they served was normalised that way
     (2026-10-15). */
  it('counts a dimension nothing assessed as not assessed — not as absent', () => {
    const sc = computeDeviceReadinessScorecard({
      classificationKnown: true,
      evidence: [{ id: 'rmf', label: 'RMF', applicable: true, ready: true }],
    });
    // classification 100 (w10) + required documents 0 (w30) + rmf 100 (w60) → 70.
    expect(sc.score).toBe(70);
    expect(sc.level).toBe('in_progress');
    expect(sc.dimensions.find((d) => d.id === 'required_documents')).toMatchObject({ status: 'not_assessed', score: 0, weight: 30 });
    expect(sc.topGaps).toContain('Required documents not assessed.');
  });

  it('keeps an applicable evidence module nothing has assessed, as not assessed', () => {
    const sc = computeDeviceReadinessScorecard({
      classificationKnown: true,
      requirements: { present: 5, total: 5 },
      evidence: [{ id: 'cer', label: 'CER', applicable: true }],
    });
    // It used to be dropped, leaving classification + documents: 100, 'ready'.
    expect(sc.dimensions.find((d) => d.id === 'evidence:cer')).toMatchObject({ status: 'not_assessed', score: 0, weight: 60 });
    expect(sc.score).toBe(40);
    expect(sc.level).not.toBe('ready');
    expect(sc.topGaps).toContain('CER is not assessed.');
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
      // Without this an unrecorded claim read as "not claimed" and the CER scored ready (2026-10-15).
      equivalenceClaimed: false,
    });
    const sc = scorecardFromBlueprint(bp);
    expect(sc.dimensions.find((d) => d.id === 'evidence:clinical_evaluation')?.status).toBe('ready');
    expect(sc.dimensions.find((d) => d.id === 'evidence:risk_management')?.status).toBe('ready');
  });
});

describe('readiness scorecard — a class the engine could not determine is not "determined"', () => {
  // The MDR/IVDR engine returns class null with the facts it needs (963c2167). A
  // classification object that carries no class is not a determined classification.
  it('scores an MDR classification with a missing deciding fact as not started, naming the fact', () => {
    const bp = buildDeviceBlueprint({
      submissionType: 'mdr_td',
      classification: { framework: 'mdr', facts: { surgicallyInvasive: true } },
    });
    const sc = scorecardFromBlueprint(bp);
    const dim = sc.dimensions.find((d) => d.id === 'classification')!;
    expect(dim.status).toBe('not_started');
    expect(dim.score).toBe(0);
    expect(sc.topGaps.join(' ')).toMatch(/classification not yet determined[\s\S]*duration/i);
  });

  it('scores an IVDR classification with a missing deciding fact as not started', () => {
    const bp = buildDeviceBlueprint({
      submissionType: 'ivdr_td',
      classification: { framework: 'ivdr', facts: { bloodGrouping: true } },
    });
    const sc = scorecardFromBlueprint(bp);
    expect(sc.dimensions.find((d) => d.id === 'classification')?.status).toBe('not_started');
  });

  it('still credits a determined class', () => {
    const bp = buildDeviceBlueprint({
      submissionType: 'mdr_td',
      classification: { framework: 'mdr', facts: { implantable: true } },
    });
    expect(scorecardFromBlueprint(bp).dimensions.find((d) => d.id === 'classification')?.status).toBe('ready');
  });
});
