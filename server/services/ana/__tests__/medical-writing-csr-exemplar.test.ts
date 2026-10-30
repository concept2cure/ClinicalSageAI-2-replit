import { describe, expect, it } from 'vitest';
import { composeMedicalWritingGuidance } from '../medical-writing';

describe('AnA CSR exemplar intelligence safeguards', () => {
  const guidance = () => composeMedicalWritingGuidance({
    documentType: 'csr', therapeuticArea: 'infectious disease', region: 'fda',
  }).brief;

  it('distinguishes full reports from synopses and external evidence from client results', () => {
    const brief = guidance();
    expect(brief).toContain('full CSR, redacted CSR, synopsis, regulatory review');
    expect(brief).toContain('not evidence of the client');
  });

  it('requires denominators, SAP-defined analysis and scientific uncertainty', () => {
    const brief = guidance();
    expect(brief).toContain('numerator, denominator and analysis set');
    expect(brief).toContain('Bayesian and frequentist methods');
    expect(brief).toContain('governing protocol and SAP versions');
  });

  it('does not instruct AnA to fabricate frequentist estimates for Bayesian studies', () => {
    const brief = guidance();
    expect(brief).toContain('never invent or demand absent statistics');
    expect(brief).toContain('never back-calculate');
    expect(brief).not.toContain('Quantify everything: effect sizes with 95% CIs and p-values');
  });

  it('requires safety distinctions, error detection and evidence retention', () => {
    const brief = guidance();
    expect(brief).toContain('all-cause AEs/SAEs');
    expect(brief).toContain('figure legends, footnotes');
    expect(brief).toContain('Retain source originals and derivatives');
  });

  it('does not apply CSR-only exemplar requirements to unrelated documents', () => {
    const brief = composeMedicalWritingGuidance({ documentType: 'protocol' }).brief;
    expect(brief).not.toContain('## CSR exemplar intelligence and error controls');
  });
  it('requires structured numerical claim receipts instead of citation-only prose', () => {
    const brief = guidance();
    expect(brief).toContain('structured claim-to-evidence receipt');
    expect(brief).toContain('A prose citation alone does not prove numerical reconciliation');
    expect(brief).toContain('withhold review-ready status');
  });

});
