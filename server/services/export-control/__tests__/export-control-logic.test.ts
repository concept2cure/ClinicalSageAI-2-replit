/**
 * Unit tests for the pure Export Control logic (Capability C2C-26).
 */

import { describe, it, expect } from 'vitest';
import { evaluateExportControl, evaluateExportReviewReadiness } from '../export-control-logic';

describe('evaluateExportControl', () => {
  it('applies the FRE to unrestricted EAR research information', () => {
    const a = evaluateExportControl({ jurisdiction: 'ear', hasPublicationRestrictions: false, hasProprietaryRestrictions: false });
    expect(a.freApplies).toBe(true);
    expect(a.licenseRequired).toBe('no');
    expect(a.citations).toContain('15 CFR 730–774');
  });

  it('defeats the FRE when publication restrictions exist', () => {
    const a = evaluateExportControl({ jurisdiction: 'ear', classification: '3A001', hasPublicationRestrictions: true });
    expect(a.freApplies).toBe(false);
    expect(a.licenseRequired).toBe('yes');
  });

  it('requires a license for ITAR with foreign nationals (deemed export)', () => {
    const a = evaluateExportControl({ jurisdiction: 'itar', involvesForeignNationals: true });
    expect(a.licenseRequired).toBe('yes');
    expect(a.citations).toContain('22 CFR 120–130');
    expect(a.findings.some((f) => f.severity === 'critical')).toBe(true);
  });

  it('treats EAR99 with no foreign-national concern as no license', () => {
    const a = evaluateExportControl({ jurisdiction: 'ear', classification: 'EAR99', hasPublicationRestrictions: true, involvesForeignNationals: false });
    // restricted defeats FRE, but EAR99 with no foreign national → no license
    expect(a.licenseRequired).toBe('no');
  });

  it('requires a license for a listed ECCN to a foreign national', () => {
    const a = evaluateExportControl({ jurisdiction: 'ear', classification: '5A002', hasProprietaryRestrictions: true, involvesForeignNationals: true });
    expect(a.licenseRequired).toBe('yes');
  });

  it('always requires a license for OFAC-sanctioned involvement', () => {
    const a = evaluateExportControl({ jurisdiction: 'ofac' });
    expect(a.licenseRequired).toBe('yes');
  });

  it('returns no license required when not subject', () => {
    const a = evaluateExportControl({ jurisdiction: 'not_subject' });
    expect(a.licenseRequired).toBe('no');
  });

  it('is unknown while jurisdiction is pending', () => {
    const a = evaluateExportControl({ jurisdiction: 'pending' });
    expect(a.licenseRequired).toBe('unknown');
  });

  it('never lets FRE cover a physical export', () => {
    const a = evaluateExportControl({ jurisdiction: 'ear', involvesPhysicalExport: true, hasPublicationRestrictions: false });
    expect(a.freApplies).toBe(false);
  });
});

describe('evaluateExportReviewReadiness', () => {
  it('blocks while jurisdiction is pending', () => {
    const r = evaluateExportReviewReadiness({ jurisdiction: 'pending' });
    expect(r.readyToDetermine).toBe(false);
    expect(r.blockers.some((b) => /pending/i.test(b))).toBe(true);
  });

  it('blocks a subject review with no classification', () => {
    const r = evaluateExportReviewReadiness({ jurisdiction: 'ear' });
    expect(r.readyToDetermine).toBe(false);
    expect(r.blockers.some((b) => /classification|ECCN/i.test(b))).toBe(true);
  });

  it('blocks foreign-national involvement without listed countries', () => {
    const r = evaluateExportReviewReadiness({ jurisdiction: 'itar', classification: 'USML XI', involvesForeignNationals: true, foreignCountries: null });
    expect(r.readyToDetermine).toBe(false);
    expect(r.blockers.some((b) => /countries/i.test(b))).toBe(true);
  });

  it('is ready for a clean not-subject review', () => {
    const r = evaluateExportReviewReadiness({ jurisdiction: 'not_subject' });
    expect(r.readyToDetermine).toBe(true);
    expect(r.blockers).toHaveLength(0);
  });

  it('is ready for an EAR99 review with a definite outcome', () => {
    const r = evaluateExportReviewReadiness({ jurisdiction: 'ear', classification: 'EAR99', involvesForeignNationals: false });
    expect(r.readyToDetermine).toBe(true);
  });
});
