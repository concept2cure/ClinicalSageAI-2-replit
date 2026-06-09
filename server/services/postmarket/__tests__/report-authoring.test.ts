/**
 * Post-market report authoring tests (eMDR, MIR, FSN, PSUR).
 */

import { describe, it, expect } from 'vitest';
import { buildEmdr, buildMir, buildFsn, buildPsur } from '../report-authoring';

describe('buildEmdr', () => {
  it('valid when required fields present', () => {
    const r = buildEmdr({
      reportType: 'initial',
      manufacturerName: 'Acme Dx',
      deviceBrandName: 'AcmeTest',
      eventType: 'malfunction',
      becameAwareDate: '2026-06-01',
      eventDescription: 'No result produced.',
    });
    expect(r.valid).toBe(true);
    expect(r.payload.form).toBe('FDA-3500A');
  });

  it('invalid without becameAwareDate', () => {
    const r = buildEmdr({
      reportType: 'initial',
      manufacturerName: 'Acme',
      deviceBrandName: 'T',
      eventType: 'death',
      becameAwareDate: '',
      eventDescription: 'x',
    });
    expect(r.valid).toBe(false);
    expect(r.missing).toContain('becameAwareDate');
  });
});

describe('buildMir', () => {
  it('valid MIR payload', () => {
    const r = buildMir({
      manufacturerName: 'Acme Dx',
      deviceName: 'AcmeTest',
      incidentType: 'serious_incident',
      becameAwareDate: '2026-06-01',
      incidentDescription: 'Erroneous result led to delayed care.',
    });
    expect(r.valid).toBe(true);
    expect(r.payload.form).toBe('EU-MIR-v7.2');
  });
});

describe('buildFsn', () => {
  it('requires affected lots', () => {
    const r = buildFsn({
      manufacturerName: 'Acme',
      deviceName: 'T',
      affectedLots: [],
      actionType: 'recall',
      reasonForAction: 'bias',
      riskToHealth: 'false negatives',
      recommendedUserAction: 'quarantine',
      contactDetails: 'safety@acme.com',
    });
    expect(r.valid).toBe(false);
    expect(r.missing).toContain('affectedLots');
  });
});

describe('buildPsur', () => {
  it('computes incident rate and validates period', () => {
    const r = buildPsur({
      deviceName: 'AcmeTest',
      riskClass: 'C',
      reportingPeriodStart: '2025-01-01',
      reportingPeriodEnd: '2025-12-31',
      unitsSold: 100000,
      complaintCount: 40,
      seriousIncidentCount: 5,
      fscaCount: 1,
      signalsDetected: 2,
      benefitRiskConclusion: 'Benefit continues to outweigh residual risk.',
    });
    expect(r.valid).toBe(true);
    expect(r.payload.incidentRate).toBeCloseTo(5 / 100000, 6);
  });

  it('invalid when end precedes start', () => {
    const r = buildPsur({
      deviceName: 'T',
      riskClass: 'B',
      reportingPeriodStart: '2025-12-31',
      reportingPeriodEnd: '2025-01-01',
      complaintCount: 0,
      seriousIncidentCount: 0,
      fscaCount: 0,
      signalsDetected: 0,
      benefitRiskConclusion: 'ok',
    });
    expect(r.valid).toBe(false);
  });
});
