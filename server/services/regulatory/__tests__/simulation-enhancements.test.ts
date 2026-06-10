/**
 * Enhancement coverage for the IVD simulation engines — the richer scoring,
 * risk-tiering, sequencing, and decision-support fields added on top of the
 * original deficiency/recommendation output.
 */

import { describe, it, expect } from 'vitest';
import { simulateIvdReview } from '../reviewer-simulation-ivd';
import { designIvdStudyProgram } from '../cdx-study-design';
import { pairCompanionDiagnostic } from '../cdx-pairing';
import { classifyIvdrAnnexVIII } from '../ivdr-classification';

describe('reviewer simulation enhancements', () => {
  it('emits a readiness score, strengths, cycles, roadmap, and risk tier', () => {
    const r = simulateIvdReview({
      pathway: '510k', assayType: 'quantitative', intendedUse: 'diagnosis',
      evidence: { analyticalPrecision: true, detectionCapability: true, interference: true, stability: true, traceability: true },
    });
    expect(r.readinessScore).toBeGreaterThanOrEqual(0);
    expect(r.readinessScore).toBeLessThanOrEqual(100);
    expect(r.strengths.length).toBeGreaterThan(0);
    expect(r.estimatedReviewCycles).toBeGreaterThanOrEqual(1);
    expect(r.riskTier).toBe('standard');
    // Roadmap is severity-prioritized and excludes info items.
    expect(r.remediationRoadmap.every(s => s.severity !== 'info')).toBe(true);
    if (r.remediationRoadmap.length > 1) {
      const order = ['major', 'deficiency', 'minor'];
      const idx = r.remediationRoadmap.map(s => order.indexOf(s.severity));
      expect(idx).toEqual([...idx].sort((a, b) => a - b));
    }
  });

  it('a complete dossier scores high', () => {
    const r = simulateIvdReview({
      pathway: '510k', assayType: 'quantitative', intendedUse: 'diagnosis',
      evidence: {
        analyticalPrecision: true, detectionCapability: true, linearity: true, interference: true,
        methodComparison: true, stability: true, traceability: true, clinicalPerformance: true,
        scientificValidity: true, intendedUseMatchesPredicate: true,
      },
    });
    expect(r.readinessScore).toBe(100);
    expect(r.estimatedReviewCycles).toBe(1);
  });

  it('PMA is highest risk tier and demands manufacturing + benefit-risk', () => {
    const r = simulateIvdReview({ pathway: 'pma', assayType: 'quantitative', intendedUse: 'diagnosis' });
    expect(r.riskTier).toBe('highest');
    expect(r.findings.some(f => f.area.includes('manufacturing') || f.area.includes('QS'))).toBe(true);
    expect(r.findings.some(f => f.area.includes('benefit-risk'))).toBe(true);
  });

  it('De Novo demands proposed special controls', () => {
    const r = simulateIvdReview({ pathway: 'de_novo', assayType: 'quantitative', intendedUse: 'diagnosis' });
    expect(r.findings.some(f => f.area.includes('special controls'))).toBe(true);
  });
});

describe('study-design enhancements', () => {
  it('attaches sample-size guidance + effort and a 2-phase sequenced plan', () => {
    const r = designIvdStudyProgram({ assayType: 'quantitative', intendedUse: 'diagnosis' });
    expect(r.analyticalStudies.every(s => typeof s.estimatedEffortWeeks === 'number')).toBe(true);
    expect(r.analyticalStudies.some(s => (s.sampleSizeGuidance ?? '').length > 0)).toBe(true);
    expect(r.sequencedPhases).toHaveLength(2);
    expect(r.sequencedPhases[0].name).toMatch(/analytical/i);
    expect(r.totalSequentialEffortWeeks).toBeGreaterThan(0);
    // Calendar (parallel within phase) is no greater than sequential sum.
    expect(r.estimatedCalendarWeeks).toBeLessThanOrEqual(r.totalSequentialEffortWeeks);
  });

  it('EP09 method comparison carries the ≥40-sample guidance', () => {
    const r = designIvdStudyProgram({ assayType: 'quantitative', intendedUse: 'diagnosis' });
    const mc = r.analyticalStudies.find(s => s.standard === 'CLSI EP09');
    expect(mc?.sampleSizeGuidance).toMatch(/40/);
  });
});

describe('cdx-pairing enhancements', () => {
  it('high confidence + strong score for a recognized, linked CDx pair', () => {
    const r = pairCompanionDiagnostic({
      biomarker: 'PD-L1', therapeuticProduct: 'pembrolizumab',
      elements: { diagnosticDeviceIdentified: true, intendedUseAlignment: true },
    });
    expect(r.readinessScore).toBeGreaterThan(50);
    expect(r.confidence).toBe('high');
    expect(r.dualPath.fdaScore).toBeGreaterThanOrEqual(r.dualPath.euScore);
  });

  it('low confidence for an unrecognized biomarker with no linkage', () => {
    const r = pairCompanionDiagnostic({ biomarker: 'mystery-marker' });
    expect(r.confidence).toBe('low');
    expect(r.readinessScore).toBeLessThan(50);
  });
});

describe('ivdr-classification enhancements', () => {
  it('high confidence when a strong rule matches; maps to an FDA pathway', () => {
    const r = classifyIvdrAnnexVIII({ intendedPurpose: 'companion diagnostic', isCompanionDiagnostic: true });
    expect(r.confidence).toBe('high');
    expect(r.fdaEquivalentPathway).toMatch(/PMA|510|De Novo/);
    expect(r.conformityRoute.length).toBeGreaterThan(0);
  });

  it('low confidence + ambiguity note when defaulting to Class A with no inputs', () => {
    const r = classifyIvdrAnnexVIII({ intendedPurpose: 'general laboratory buffer' });
    expect(r.classification).toBe('A');
    expect(r.confidence).toBe('low');
    expect(r.ambiguityNotes.length).toBeGreaterThan(0);
  });
});
