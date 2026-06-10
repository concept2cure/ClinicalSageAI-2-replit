/**
 * Program-plan orchestrator + scenario comparison tests.
 */

import { describe, it, expect } from 'vitest';
import { buildProgramPlan, compareProgramScenarios } from '../program-plan';
import { getEntry } from '../../ivd-knowledge/knowledge.service';

describe('buildProgramPlan', () => {
  it('chains classification, study design, review, sensitivity, and timeline', () => {
    const plan = buildProgramPlan({
      deviceName: 'AcmeDx PD-L1',
      pathway: 'pma',
      assayType: 'ihc',
      intendedUse: 'cdx',
      biomarker: 'PD-L1',
      classification: { intendedPurpose: 'companion diagnostic for therapy X', isCompanionDiagnostic: true },
      seed: 1,
    });
    expect(plan.classification.classification).toBe('C'); // CDx ⇒ Rule 3 Class C
    expect(plan.cdx).toBeDefined();
    expect(plan.studyProgram.sequencedPhases).toHaveLength(2);
    expect(plan.review.readinessScore).toBeGreaterThanOrEqual(0);
    expect(plan.timeToMarket.p50Weeks).toBeGreaterThan(0);
    expect(plan.executiveSummary.estimatedCalendarWeeksP90).toBeGreaterThanOrEqual(plan.executiveSummary.estimatedCalendarWeeksP50);
    expect(plan.executiveSummary.totalRemainingCostUsd).toBeGreaterThan(0);
    expect(plan.citations.length).toBeGreaterThan(0);
  });

  it('executive summary top next actions come from the sensitivity tornado', () => {
    const plan = buildProgramPlan({ pathway: '510k', assayType: 'quantitative', intendedUse: 'diagnosis', seed: 2 });
    expect(plan.executiveSummary.topNextActions.length).toBeGreaterThan(0);
    expect(plan.executiveSummary.topNextActions.length).toBeLessThanOrEqual(3);
    expect(plan.executiveSummary.topNextActions[0].readinessGain).toBeGreaterThan(0);
  });

  it('a complete dossier yields a high readiness summary', () => {
    const plan = buildProgramPlan({
      pathway: '510k', assayType: 'quantitative', intendedUse: 'diagnosis', seed: 3,
      evidence: {
        analyticalPrecision: true, detectionCapability: true, linearity: true, interference: true,
        methodComparison: true, stability: true, traceability: true, clinicalPerformance: true,
        scientificValidity: true, intendedUseMatchesPredicate: true,
      },
    });
    expect(plan.executiveSummary.readinessScore).toBe(100);
    expect(plan.executiveSummary.topNextActions).toHaveLength(0);
  });

  it('all aggregated citations resolve to real corpus entries', () => {
    const plan = buildProgramPlan({ pathway: 'eu_ivdr', assayType: 'ngs', intendedUse: 'cdx', biomarker: 'EGFR', seed: 4 });
    for (const c of plan.citations) expect(getEntry(c.id), `citation ${c.id}`).not.toBeNull();
  });
});

describe('compareProgramScenarios', () => {
  it('ranks a well-evidenced scenario above a bare one', () => {
    const result = compareProgramScenarios([
      {
        name: 'Fully evidenced',
        input: {
          pathway: '510k', assayType: 'quantitative', intendedUse: 'diagnosis', seed: 1,
          evidence: {
            analyticalPrecision: true, detectionCapability: true, linearity: true, interference: true,
            methodComparison: true, stability: true, traceability: true, clinicalPerformance: true,
            scientificValidity: true, intendedUseMatchesPredicate: true,
          },
        },
      },
      { name: 'Bare', input: { pathway: '510k', assayType: 'quantitative', intendedUse: 'diagnosis', seed: 1 } },
    ]);
    expect(result.scenarios).toHaveLength(2);
    expect(result.recommended?.name).toBe('Fully evidenced');
    expect(result.ranked[0].compositeScore).toBeGreaterThanOrEqual(result.ranked[1].compositeScore);
  });
});
