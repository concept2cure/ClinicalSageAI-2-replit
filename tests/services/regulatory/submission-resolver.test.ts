import { describe, it, expect } from 'vitest';
import {
  resolveSubmissionPlan,
  submissionCoverageMatrix,
  pickRegionalEntry,
  CORE_REGIONS,
} from '../../../server/services/regulatory/submission-resolver';

describe('submission resolver — per-region plan (FDA/EMA/PMDA)', () => {
  it('resolves a biologic marketing filing to all three regions with gateways', () => {
    const plan = resolveSubmissionPlan({ filingType: 'BLA' });
    expect(plan.perRegion).toHaveLength(3);

    const us = plan.perRegion.find((r) => r.region === 'US')!;
    const eu = plan.perRegion.find((r) => r.region === 'EU')!;
    const jp = plan.perRegion.find((r) => r.region === 'JP')!;

    expect(us.agency).toBe('FDA');
    expect(us.gateway).toEqual({ region: 'fda', name: 'esg' });
    expect(us.module1Path).toContain('/m1/us/');
    expect(us.buildSupported && us.submitSupported).toBe(true);

    expect(eu.agency).toBe('EMA');
    expect(eu.gateway).toEqual({ region: 'ema', name: 'cesp' });
    expect(eu.buildSupported && eu.submitSupported).toBe(true);

    expect(jp.agency).toBe('PMDA');
    expect(jp.gateway).toEqual({ region: 'pmda', name: 'pmda_gateway' });
    expect(jp.buildSupported && jp.submitSupported).toBe(true);

    expect(plan.coverage).toBe('complete');
    expect(plan.gaps).toHaveLength(0);
  });

  it('routes by product class — BLA and NDA pick different US filings', () => {
    const bla = resolveSubmissionPlan({ filingType: 'BLA' });
    const nda = resolveSubmissionPlan({ filingType: 'NDA' });
    const blaUs = bla.perRegion.find((r) => r.region === 'US')!.filing!;
    const ndaUs = nda.perRegion.find((r) => r.region === 'US')!.filing!;
    expect(blaUs.id).not.toBe(ndaUs.id);
    // Both are US marketing applications.
    expect(blaUs.family).toBe('marketing_authorization');
    expect(ndaUs.family).toBe('marketing_authorization');
  });

  it('honours an explicit region subset', () => {
    const plan = resolveSubmissionPlan({ filingType: 'MAA', regions: ['EU'] });
    expect(plan.perRegion).toHaveLength(1);
    expect(plan.perRegion[0].region).toBe('EU');
  });
});

describe('submission resolver — coverage matrix', () => {
  it('every core (filing × region) combination supports build + submit', () => {
    const matrix = submissionCoverageMatrix();
    expect(matrix.regions).toEqual(CORE_REGIONS);
    for (const row of matrix.rows) {
      for (const cell of row.cells) {
        expect(cell.buildSupported).toBe(true);
        expect(cell.submitSupported).toBe(true);
      }
      expect(row.fullyCovered).toBe(true);
    }
    expect(matrix.summary).toMatch(/support both region-correct build and gateway submission/);
  });
});

describe('submission resolver — registry lookups', () => {
  it('picks a regional entry by family + product class', () => {
    const usBio = pickRegionalEntry('US', 'marketing_authorization', 'biologic');
    expect(usBio).toBeDefined();
    expect(usBio!.region).toBe('US');
    expect(usBio!.applicationFamily).toBe('marketing_authorization');
  });
});
