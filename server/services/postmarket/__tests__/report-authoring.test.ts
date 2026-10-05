/**
 * Post-market report authoring tests (eMDR, MIR, FSN), and the PSUR's single
 * canonical builder.
 */

import { describe, it, expect } from 'vitest';
import * as authoring from '../report-authoring';
import { buildEmdr, buildMir, buildFsn } from '../report-authoring';
import { buildPsurContent, computePsurIncidentRate } from '../../gspr-postmarket/post-market-authoring';
import { DRAFT_SENTINEL } from '../../gspr-postmarket/scaffold-sentinel';
import { BUILD_POSTMARKET_REPORT } from '../../ana/ivdLifecycleTools';
import { getToolHandler } from '../../ana/AnaToolExecutor';

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

// One PSUR builder. report-authoring.ts used to carry a second, parallel PSUR
// (buildPsur) with its own field set, reachable from AnA build_postmarket_report
// and POST /api/ivd-lifecycle/authoring/psur, accepting any class string. The
// canonical PSUR is server/services/gspr-postmarket/post-market-authoring.ts
// authorPostMarketDocument (POST /api/post-market/programs/:id/documents/psur/generate;
// AnA command post_market.document.create), validated by validatePsur. Its one
// deterministic figure, the serious-incident rate, now lives there.
describe('PSUR: one builder', () => {
  it('report-authoring no longer exports a parallel PSUR builder', () => {
    expect(Object.keys(authoring)).not.toContain('buildPsur');
  });

  it('the AnA build_postmarket_report tool no longer offers psur', () => {
    const reportType = (BUILD_POSTMARKET_REPORT.input_schema as any).properties.reportType;
    expect(reportType.enum).toEqual(['emdr', 'mir', 'fsn']);
  });

  it('a psur request to build_postmarket_report is pointed at the canonical command, not built', async () => {
    const handler = getToolHandler('build_postmarket_report');
    expect(handler).toBeTypeOf('function');
    const out = JSON.parse(
      await handler!(
        {
          reportType: 'psur',
          fields: {
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
          },
        },
        { organizationId: 1, userId: 1 } as any
      )
    );
    expect(out.status).toBe('needs_parameters');
    expect(out.message).toContain('post_market.document.create');
    expect(out.message).toContain('/api/post-market/programs/:programId/documents/psur/generate');
    expect(out).not.toHaveProperty('result');
  });

  it('POST /api/ivd-lifecycle/authoring/psur is no longer mounted', async () => {
    const { default: router } = await import('../../../routes/ivd-lifecycle');
    const paths = (router as any).stack
      .filter((l: any) => l.route)
      .map((l: any) => l.route.path as string);
    expect(paths).toContain('/authoring/mir'); // the router really loaded
    expect(paths).not.toContain('/authoring/psur');
  });
});

describe('canonical PSUR serious-incident rate (moved from buildPsur)', () => {
  it('computes serious incidents per unit placed on the market', () => {
    expect(computePsurIncidentRate({ unitsPlacedOnMarket: 100000, seriousIncidentCount: 5 })).toBe(5 / 100000);
  });

  it('does not round a small rate to zero (buildPsur rounded to 1e-6)', () => {
    const rate = computePsurIncidentRate({ unitsPlacedOnMarket: 10_000_000, seriousIncidentCount: 1 });
    expect(rate).toBe(1e-7);
    expect(rate).toBeGreaterThan(0);
  });

  it('returns null, not zero, when no units were placed on the market', () => {
    expect(computePsurIncidentRate({ unitsPlacedOnMarket: 0, seriousIncidentCount: 0 })).toBeNull();
  });

  it('refuses a figure that is not a non-negative integer', () => {
    for (const bad of [
      { unitsPlacedOnMarket: -1, seriousIncidentCount: 0 },
      { unitsPlacedOnMarket: 10.5, seriousIncidentCount: 0 },
      { unitsPlacedOnMarket: 100, seriousIncidentCount: Number.NaN },
      { unitsPlacedOnMarket: 100, seriousIncidentCount: -2 },
    ]) {
      expect(() => computePsurIncidentRate(bad)).toThrow(expect.objectContaining({ code: 'PM_BAD_INPUT' }));
    }
  });

  it('the canonical PSUR carries supplied figures and the computed rate', () => {
    const content = buildPsurContent({
      deviceName: 'AcmeTest',
      deviceClass: 'C',
      regulation: 'IVDR',
      psurExposure: { unitsPlacedOnMarket: 100000, seriousIncidentCount: 5 },
    });
    expect(content.volumeOfSales).toContain('100000');
    expect(content.volumeOfSales).not.toContain(DRAFT_SENTINEL);
    expect(content.seriousIncidentRate).toContain('5 serious incidents');
    expect(content.seriousIncidentRate).toContain('0.05 per 1,000 units');
  });

  it('a single serious incident reads in the singular, with and without a rate', () => {
    const withRate = buildPsurContent({
      deviceName: 'AcmeTest',
      deviceClass: 'C',
      regulation: 'IVDR',
      psurExposure: { unitsPlacedOnMarket: 1000, seriousIncidentCount: 1 },
    });
    expect(withRate.seriousIncidentRate).toContain('1 serious incident over 1000 units');
    expect(withRate.seriousIncidentRate).toContain('1 per 1,000 units');
    const noUnits = buildPsurContent({
      deviceName: 'AcmeTest',
      deviceClass: 'C',
      regulation: 'IVDR',
      psurExposure: { unitsPlacedOnMarket: 0, seriousIncidentCount: 1 },
    });
    expect(noUnits.seriousIncidentRate).toContain('1 serious incident in the reporting period');
    const none = buildPsurContent({
      deviceName: 'AcmeTest',
      deviceClass: 'C',
      regulation: 'IVDR',
      psurExposure: { unitsPlacedOnMarket: 1000, seriousIncidentCount: 0 },
    });
    expect(none.seriousIncidentRate).toContain('0 serious incidents over 1000 units');
  });

  it('without supplied figures the canonical PSUR keeps the factual placeholder and states no rate', () => {
    const content = buildPsurContent({ deviceName: 'AcmeTest', deviceClass: 'C', regulation: 'IVDR' });
    expect(content.volumeOfSales).toContain(DRAFT_SENTINEL);
    expect(content).not.toHaveProperty('seriousIncidentRate');
  });
});
