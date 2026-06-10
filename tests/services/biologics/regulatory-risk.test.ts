import { describe, it, expect } from 'vitest';
import { assessBlaFilingRisk } from '../../../server/services/biologics/regulatory-risk';

describe('BLA filing-risk — RTF (administrative)', () => {
  it('a missing Form 356h triggers an RTF blocker', () => {
    const out = assessBlaFilingRisk({ administrative: { form356h: false } });
    const f = out.findings.find((x) => x.id === 'rtf_form_356h')!;
    expect(f.status).toBe('triggered');
    expect(f.severity).toBe('rtf');
    expect(out.rtfRisk === 'high' || out.rtfRisk === 'critical').toBe(true);
    expect(out.blockers).toContain('FDA Form 356h present');
  });

  it('two missing RTF items make RTF risk critical', () => {
    const out = assessBlaFilingRisk({ administrative: { form356h: false, module3CmcComplete: false } });
    expect(out.rtfRisk).toBe('critical');
  });
});

describe('BLA filing-risk — CRL (engine conclusions feed in)', () => {
  it('analytical similarity not demonstrated triggers a CRL-major finding', () => {
    const out = assessBlaFilingRisk({ analyticalSimilarity: 'not_demonstrated' });
    const f = out.findings.find((x) => x.id === 'crl_analytical_similarity')!;
    expect(f.status).toBe('triggered');
    expect(out.blockers).toContain('Analytical characterization / similarity established');
    expect(out.crlRisk === 'medium' || out.crlRisk === 'high' || out.crlRisk === 'critical').toBe(true);
  });

  it('comparability only applies when a manufacturing change is in scope', () => {
    const without = assessBlaFilingRisk({ comparability: 'not_comparable' });
    expect(without.findings.find((x) => x.id === 'crl_comparability')).toBeUndefined();

    const withChange = assessBlaFilingRisk({ manufacturingChange: true, comparability: 'not_comparable' });
    expect(withChange.findings.find((x) => x.id === 'crl_comparability')!.status).toBe('triggered');
  });

  it('high immunogenicity risk triggers a clinical CRL finding', () => {
    const out = assessBlaFilingRisk({ immunogenicityRisk: 'high' });
    expect(out.findings.find((x) => x.id === 'crl_immunogenicity_risk')!.status).toBe('triggered');
  });

  it('stability below the required shelf life triggers', () => {
    const out = assessBlaFilingRisk({ readiness: { stabilityMonths: 6, requiredShelfLifeMonths: 24 } });
    expect(out.findings.find((x) => x.id === 'crl_stability')!.status).toBe('triggered');
  });
});

describe('BLA filing-risk — watch vs triggered vs ok', () => {
  it('unknown signals surface as watch, not silent pass', () => {
    const out = assessBlaFilingRisk({ productType: 'biologic' });
    expect(out.counts.watch).toBeGreaterThan(0);
    // No explicit failures supplied, so nothing should be a hard trigger.
    expect(out.counts.triggered).toBe(0);
  });

  it('a fully-ready program reads low risk with no blockers', () => {
    const out = assessBlaFilingRisk({
      productType: 'biologic',
      analyticalSimilarity: 'similar',
      immunogenicityRisk: 'low',
      readiness: {
        potencyAssayValidated: true,
        viralClearanceValidated: true,
        adventitiousAgentTesting: true,
        cellBankCharacterized: true,
        stabilityMonths: 24,
        requiredShelfLifeMonths: 24,
        processValidationComplete: true,
        containerClosureQualified: true,
        inspectionReady: true,
      },
      administrative: {
        form356h: true,
        coverLetter: true,
        module3CmcComplete: true,
        clinicalSummaries: true,
        immunogenicityData: true,
        cdiscDatasets: true,
      },
    });
    expect(out.rtfRisk).toBe('low');
    expect(out.crlRisk).toBe('low');
    expect(out.blockers).toHaveLength(0);
    expect(out.counts.triggered).toBe(0);
  });
});
