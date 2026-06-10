/**
 * Executive-brief generator tests.
 */

import { describe, it, expect } from 'vitest';
import { buildProgramPlan } from '../program-plan';
import { generateExecutiveBrief } from '../executive-brief';

describe('generateExecutiveBrief', () => {
  const plan = buildProgramPlan({
    deviceName: 'AcmeDx EGFR',
    pathway: 'pma', assayType: 'ngs', intendedUse: 'cdx', biomarker: 'EGFR', seed: 7,
  });

  it('produces Markdown with the device title and the core sections', () => {
    const brief = generateExecutiveBrief(plan);
    expect(brief.device).toBe('AcmeDx EGFR');
    expect(brief.markdown).toContain('# IVD Program Brief — AcmeDx EGFR');
    const titles = brief.sections.map(s => s.title);
    expect(titles).toContain('Executive summary');
    expect(titles).toContain('Classification');
    expect(titles).toContain('Study program');
    // The exec summary mentions class and readiness.
    const exec = brief.sections.find(s => s.title === 'Executive summary')!;
    expect(exec.body).toMatch(/IVDR class/i);
    expect(exec.body).toMatch(/readiness/i);
  });

  it('renders next actions for an incomplete dossier and sources', () => {
    const brief = generateExecutiveBrief(plan);
    expect(brief.markdown).toContain('Recommended next actions');
    expect(brief.markdown.length).toBeGreaterThan(500);
  });

  it('a complete dossier reports no further evidence required', () => {
    const completePlan = buildProgramPlan({
      pathway: '510k', assayType: 'quantitative', intendedUse: 'diagnosis', seed: 1,
      evidence: {
        analyticalPrecision: true, detectionCapability: true, linearity: true, interference: true,
        methodComparison: true, stability: true, traceability: true, clinicalPerformance: true,
        scientificValidity: true, intendedUseMatchesPredicate: true,
      },
    });
    const brief = generateExecutiveBrief(completePlan);
    expect(brief.markdown).toMatch(/No further evidence is required/i);
  });
});
