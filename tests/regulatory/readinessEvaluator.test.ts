/**
 * Tests for the Registry-aware Readiness Evaluator.
 */

import { describe, it, expect } from 'vitest';
import { evaluateReadiness } from '../../server/services/regulatory/readinessEvaluator';

describe('Readiness Evaluator', () => {
  it('returns low readiness for empty project', () => {
    const result = evaluateReadiness({
      registryIdOrLegacy: 'IND',
      sections: [],
      artifacts: [],
    });

    expect(result.score).toBeLessThanOrEqual(10);
    expect(result.level).toBe('not_ready');
    expect(result.applicationDisplayName).toContain('Investigational');
    expect(result.dossierStandard).toBe('eCTD');
  });

  it('returns higher readiness with some completed sections', () => {
    const result = evaluateReadiness({
      registryIdOrLegacy: 'US_IND',
      sections: [
        { code: '1.1', title: 'Cover Letter', status: 'approved', artifactCount: 1 },
        { code: '1.2', title: 'Administrative Forms', status: 'approved', artifactCount: 1 },
        { code: '2.3', title: 'Quality Overall Summary', status: 'approved', artifactCount: 1 },
        { code: '2.4', title: 'Nonclinical Overview', status: 'approved', artifactCount: 1 },
        { code: '2.5', title: 'Clinical Overview', status: 'approved', artifactCount: 1 },
      ],
      artifacts: [
        { type: 'cover_letter', status: 'approved' },
        { type: 'form_1571', status: 'approved' },
        { type: 'clinical_overview', status: 'approved' },
      ],
    });

    expect(result.score).toBeGreaterThan(0);
    expect(result.sectionReadiness.completed).toBeGreaterThan(0);
    expect(result.artifactReadiness.present).toBeGreaterThan(0);
  });

  it('identifies gaps for missing required sections', () => {
    const result = evaluateReadiness({
      registryIdOrLegacy: 'US_NDA',
      sections: [],
      artifacts: [],
    });

    expect(result.gaps.length).toBeGreaterThan(0);
    expect(result.gaps.some(g => g.severity === 'critical')).toBe(true);
  });

  it('identifies missing required artifacts', () => {
    const result = evaluateReadiness({
      registryIdOrLegacy: 'US_IND',
      sections: [],
      artifacts: [],
    });

    expect(result.artifactReadiness.missing.length).toBeGreaterThan(0);
    expect(result.artifactReadiness.completionPercent).toBe(0);
  });

  it('adds regional warnings for EU submissions', () => {
    const result = evaluateReadiness({
      registryIdOrLegacy: 'EU_MAA',
      sections: [],
      artifacts: [],
    });

    expect(result.regionalWarnings.length).toBeGreaterThan(0);
    expect(result.regionalWarnings.some(w => w.includes('RMP'))).toBe(true);
  });

  it('handles legacy submission types', () => {
    const result = evaluateReadiness({
      registryIdOrLegacy: '510K',
      sections: [],
      artifacts: [],
    });

    expect(result.applicationDisplayName).toContain('510(k)');
    expect(result.dossierStandard).toBe('eSTAR');
  });

  it('handles unknown types gracefully', () => {
    const result = evaluateReadiness({
      registryIdOrLegacy: 'UNKNOWN_TYPE',
      sections: [
        { code: 's1', title: 'Section 1', status: 'not_started', artifactCount: 0 },
      ],
      artifacts: [],
    });

    expect(result.level).toBe('early');
    expect(result.score).toBe(0);
  });

  it('returns ready for fully completed project', () => {
    // Simulate a fully completed 510K project
    const result = evaluateReadiness({
      registryIdOrLegacy: 'US_510K',
      sections: [
        { code: '1', title: 'Cover Letter', status: 'approved', artifactCount: 1 },
        { code: '2', title: 'Indications for Use', status: 'approved', artifactCount: 1 },
        { code: '3', title: 'Device Description', status: 'approved', artifactCount: 1 },
        { code: '4', title: 'Substantial Equivalence', status: 'approved', artifactCount: 1 },
        { code: '5', title: 'Performance Testing', status: 'approved', artifactCount: 1 },
        { code: '8', title: 'Labeling', status: 'approved', artifactCount: 1 },
        { code: '10', title: 'Summary', status: 'approved', artifactCount: 1 },
      ],
      artifacts: [
        { type: 'cover_letter', status: 'approved' },
        { type: 'device_description', status: 'approved' },
        { type: 'predicate_comparison', status: 'approved' },
        { type: 'performance_testing', status: 'approved' },
        { type: 'labeling', status: 'approved' },
      ],
    });

    expect(result.score).toBeGreaterThanOrEqual(70);
    expect(['nearly_ready', 'ready']).toContain(result.level);
  });
});
