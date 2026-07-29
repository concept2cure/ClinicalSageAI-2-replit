/**
 * Regression — EU MDR/IVDR CER: real generation + real conformance validation,
 * but never fabricated.
 *
 * - validateCerConformance() is a deterministic MEDDEV 2.7/1 rev 4 / Annex I
 *   GSPR / Annex XIV checklist run against actual report content: a complete
 *   report passes, a missing MANDATORY element fails closed, a missing
 *   recommended element does not invalidate, and empty values never count.
 * - UnifiedCERService fails closed on errors (non-existent device / report) and
 *   never returns a fabricated success or an auto-"valid".
 */

import { describe, it, expect } from 'vitest';
import UnifiedCERService from '../index';
import { validateCerConformance } from '../cerConformanceValidator';

function completeMdrReport(): Record<string, unknown> {
  return {
    regulatoryFramework: 'MDR_2017_745',
    deviceName: 'Acme Infusion Pump',
    deviceClass: 'IIb',
    executiveSummary: { summary: 'evaluation summary' },
    deviceDescription: { description: 'pump', intendedPurpose: 'infusion' },
    essentialRequirements: { gspr: ['I.1', 'I.2'] },
    clinicalBackground: { stateOfArt: 'established' },
    clinicalEvidence: { studies: [{ id: 1 }] },
    literatureReview: { searches: ['pubmed'] },
    riskBenefitAnalysis: { ratio: 'favorable' },
    conclusions: { conclusion: 'acceptable benefit-risk' },
  };
}

describe('validateCerConformance — deterministic GSPR/Annex checklist', () => {
  it('a complete MDR report passes all mandatory checks', () => {
    const r = validateCerConformance(completeMdrReport());
    expect(r.valid).toBe(true);
    expect(r.summary.mandatoryFailed).toBe(0);
    expect(r.checks.every(c => c.status === 'pass')).toBe(true);
  });

  it('a missing mandatory element fails closed (never auto-valid)', () => {
    const report = completeMdrReport();
    delete report.clinicalEvidence; // mandatory
    const r = validateCerConformance(report);
    expect(r.valid).toBe(false);
    expect(r.checks.find(c => c.id === 'clinical_evidence')?.status).toBe('fail');
    expect(r.summary.mandatoryFailed).toBeGreaterThan(0);
  });

  it('a missing recommended element does not invalidate the report', () => {
    const report = completeMdrReport();
    delete report.literatureReview; // recommended only
    const r = validateCerConformance(report);
    expect(r.valid).toBe(true);
    expect(r.checks.find(c => c.id === 'literature_review')?.status).toBe('fail');
  });

  it('empty objects and blank strings do not count as content', () => {
    const report = completeMdrReport();
    report.conclusions = {};
    report.executiveSummary = '   ';
    const r = validateCerConformance(report);
    expect(r.valid).toBe(false);
    expect(r.checks.find(c => c.id === 'conclusions')?.status).toBe('fail');
    expect(r.checks.find(c => c.id === 'executive_summary')?.status).toBe('fail');
  });

  it('is deterministic for the same input (ignoring the checkedAt timestamp)', () => {
    const a = validateCerConformance(completeMdrReport());
    const b = validateCerConformance(completeMdrReport());
    expect({ ...a, checkedAt: '' }).toEqual({ ...b, checkedAt: '' });
  });
});

describe('UnifiedCERService — wired but never fabricates', () => {
  const svc = new UnifiedCERService({
    organizationId: 1,
    deviceId: 999_999_999, // intentionally non-existent
    userId: 1,
    regulatoryFramework: 'MDR_2017_745',
  });

  it('generateReport fails closed for a non-existent device instead of fabricating success', async () => {
    const result = await svc.generateReport();
    expect(result.status).toBe('failed');
    expect(result.sections).toEqual([]);
    expect(result.reportId).toBe('');
  });

  it('validateReport never certifies a missing/unvalidatable report as valid', async () => {
    const result = await svc.validateReport('does-not-exist');
    // Fails closed whether the report is absent or the store is unavailable.
    expect(result.valid).toBe(false);
    expect(result.issues.length).toBeGreaterThan(0);
  });
});
