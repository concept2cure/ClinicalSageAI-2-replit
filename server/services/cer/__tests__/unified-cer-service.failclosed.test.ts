/**
 * Regression — EU MDR/IVDR CER: real generation + real conformance validation,
 * but never fabricated.
 *
 * - validateCerConformance() checks the stored report (columns AND cer_sections
 *   rows, each named by its heading) against the canonical CER structure
 *   (market-specs/cer-structure.ts): a structurally complete report passes, a
 *   missing MANDATORY section fails closed, an unrecorded equivalence claim
 *   never passes silently, and empty values never count. (Until 2026-10-05 the
 *   first case here asserted that a report with every cer_reports column filled
 *   was valid — the defect: scope, appraisal, evaluator qualification, PMCF and
 *   references live only in cer_sections rows. See
 *   cer-conformance-canonical.test.ts.)
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

/** The canonical CER sections that have no cer_reports column — stored as rows under their headings. */
function completeMdrSections() {
  return [
    { sectionId: 'scope', title: 'Scope of the Clinical Evaluation', content: { text: 'scope' } },
    { sectionId: 'appraisal', title: 'Appraisal of the Clinical Data', content: { text: 'appraisal' } },
    { sectionId: 'pmcf', title: 'PMCF Considerations', content: { text: 'pmcf' } },
    { sectionId: 'evaluators', title: 'Qualification of the Evaluators', content: { text: 'cv' } },
    { sectionId: 'refs', title: 'References and Appendices', content: { text: 'refs' } },
  ];
}

describe('validateCerConformance — canonical CER structure', () => {
  it('a column-complete report with no section rows is NOT valid (the old checklist called it valid)', () => {
    const r = validateCerConformance(completeMdrReport());
    expect(r.valid).toBe(false);
    expect(r.summary.mandatoryFailed).toBeGreaterThan(0);
  });

  it('a structurally complete MDR report passes all mandatory checks', () => {
    const r = validateCerConformance(completeMdrReport(), completeMdrSections(), {
      equivalenceClaimed: false,
    });
    expect(r.valid).toBe(true);
    expect(r.summary.mandatoryFailed).toBe(0);
    expect(r.checks.every(c => c.status === 'pass')).toBe(true);
  });

  it('a missing mandatory section fails closed (never auto-valid)', () => {
    const report = completeMdrReport();
    delete report.conclusions; // the only source of the canonical Conclusions section
    const r = validateCerConformance(report, completeMdrSections());
    expect(r.valid).toBe(false);
    expect(r.checks.find(c => c.id === 'conclusions')?.status).toBe('fail');
    expect(r.summary.mandatoryFailed).toBeGreaterThan(0);
  });

  it('an unrecorded equivalence claim is a recommended failure, not a silent pass', () => {
    const r = validateCerConformance(completeMdrReport(), completeMdrSections());
    expect(r.valid).toBe(true);
    const eq = r.checks.find(c => c.id === 'equivalence');
    expect(eq?.severity).toBe('recommended');
    expect(eq?.status).toBe('fail');
  });

  it('empty objects and blank strings do not count as content', () => {
    const report = completeMdrReport();
    report.conclusions = {};
    report.executiveSummary = '   ';
    const r = validateCerConformance(report, completeMdrSections());
    expect(r.valid).toBe(false);
    expect(r.checks.find(c => c.id === 'conclusions')?.status).toBe('fail');
    expect(r.checks.find(c => c.id === 'summary')?.status).toBe('fail');
  });

  it('is deterministic for the same input (ignoring the checkedAt timestamp)', () => {
    const a = validateCerConformance(completeMdrReport(), completeMdrSections());
    const b = validateCerConformance(completeMdrReport(), completeMdrSections());
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
