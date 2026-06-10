/**
 * IVD reviewer-simulation engine tests.
 */

import { describe, it, expect } from 'vitest';
import { simulateIvdReview } from '../reviewer-simulation-ivd';
import { getEntry } from '../../ivd-knowledge/knowledge.service';

describe('simulateIvdReview', () => {
  it('an empty-evidence quantitative 510(k) is not substantially complete with majors', () => {
    const r = simulateIvdReview({ pathway: '510k', assayType: 'quantitative', intendedUse: 'diagnosis' });
    expect(r.counts.major).toBeGreaterThan(0);
    expect(r.verdict).toBe('not_substantially_complete');
    expect(r.findings.some(f => f.area.includes('precision'))).toBe(true);
    expect(r.findings.some(f => f.area === 'Substantial equivalence')).toBe(true);
  });

  it('a complete quantitative dossier reaches likely acceptance', () => {
    const r = simulateIvdReview({
      pathway: '510k', assayType: 'quantitative', intendedUse: 'diagnosis',
      evidence: {
        analyticalPrecision: true, detectionCapability: true, linearity: true, interference: true,
        methodComparison: true, stability: true, traceability: true, clinicalPerformance: true,
        scientificValidity: true, intendedUseMatchesPredicate: true,
      },
    });
    expect(r.counts.major).toBe(0);
    expect(r.counts.deficiency).toBe(0);
    expect(r.verdict).toBe('likely_acceptance');
  });

  it('IVDR pathway flags a missing PMPF plan', () => {
    const r = simulateIvdReview({
      pathway: 'eu_ivdr', assayType: 'quantitative', intendedUse: 'diagnosis',
      evidence: { analyticalPrecision: true, detectionCapability: true, interference: true, stability: true, traceability: true, clinicalPerformance: true, scientificValidity: true },
    });
    expect(r.findings.some(f => f.area.includes('Post-market'))).toBe(true);
    expect(r.verdict).toBe('additional_information_likely');
  });

  it('NGS assay flags bioinformatics + software + cybersecurity', () => {
    const r = simulateIvdReview({ pathway: 'de_novo', assayType: 'ngs', intendedUse: 'cdx', hasSoftware: true });
    const areas = r.findings.map(f => f.area);
    expect(areas).toContain('Bioinformatics');
    expect(areas).toContain('Software lifecycle');
    expect(areas).toContain('Cybersecurity');
    expect(areas).toContain('Companion diagnostic');
  });

  it('a recognized biomarker downgrades the scientific-validity finding to minor', () => {
    const r = simulateIvdReview({
      pathway: '510k', assayType: 'ihc', intendedUse: 'cdx', biomarker: 'PD-L1',
      evidence: {
        analyticalPrecision: true, interference: true, stability: true, cutoffValidation: true,
        clinicalPerformance: true, intendedUseMatchesPredicate: true,
      },
    });
    const sv = r.findings.find(f => f.area === 'Scientific validity');
    expect(sv?.severity).toBe('minor');
  });

  it('every finding cites a real corpus entry', () => {
    const r = simulateIvdReview({ pathway: 'pma', assayType: 'molecular', intendedUse: 'diagnosis' });
    for (const f of r.findings) {
      expect(getEntry(f.knowledgeRef), `ref ${f.knowledgeRef}`).not.toBeNull();
    }
    expect(r.citations.length).toBeGreaterThan(0);
  });
});
