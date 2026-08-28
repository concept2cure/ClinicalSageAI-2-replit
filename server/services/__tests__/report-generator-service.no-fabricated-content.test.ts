/**
 * Regression guard: several persona report generators used to emit
 * hardcoded/fabricated specifics (named companies, market shares, invented
 * guidance dates, invented sample sizes) regardless of any real source data,
 * labeled "simulated"/"for demonstration" in comments but never surfaced to
 * the API caller as such. Report callers received a confident, specific
 * report grounded in nothing.
 *
 * This mirrors the fix already applied to
 * InvestorReportGenerator.generateSuccessProbability (see
 * FORENSIC_CODE_AUDIT_2026-05-29.md HI-2): when the specifics are not
 * derived from real source records, the affected sections must report
 * `available: false` with an honest note instead of fabricated literals.
 *
 * These assertions fail against the pre-fix code, which always returned the
 * named companies / invented dates / invented sample sizes with no
 * `available` flag at all.
 */
import { describe, it, expect, vi } from 'vitest';

vi.mock('../../db', () => ({
  db: {},
  pool: {},
  getPool: () => ({}),
  getDb: () => ({}),
  query: vi.fn(),
  transaction: vi.fn(),
}));

vi.mock('../../statistics-service', () => ({
  statisticsService: {
    getIndication: vi.fn(async () => null),
  },
}));

import { getReportGenerator } from '../report-generator-service';

function findComponent(components: any[], type: string) {
  const c = components.find((c: any) => c.type === type);
  expect(c, `expected a "${type}" component`).toBeTruthy();
  return c;
}

describe('report-generator-service — no fabricated specifics', () => {
  it('InvestorReportGenerator market analysis no longer names Pfizer/Novartis/Roche or invented patent dates', async () => {
    const generator = getReportGenerator('investor');
    const report = await generator.generateReport({ indication: 'Oncology' });

    const marketAnalysis = findComponent(report.components, 'market_analysis');
    const serialized = JSON.stringify(marketAnalysis.content);

    expect(marketAnalysis.content.available).toBe(false);
    expect(serialized).not.toContain('Pfizer');
    expect(serialized).not.toContain('Novartis');
    expect(serialized).not.toContain('Roche');
    expect(serialized).not.toContain('2026-05');
    expect(serialized).not.toContain('2028-11');
  });

  it('RegulatoryReportGenerator no longer emits invented FDA/EMA guidance titles or dates', async () => {
    const generator = getReportGenerator('regulatory');
    const report = await generator.generateReport({ indication: 'Oncology' });

    const requirements = findComponent(report.components, 'regulatory_requirements');
    const recentGuidances = requirements.content.recentGuidances;
    const serialized = JSON.stringify(recentGuidances);

    expect(recentGuidances.available).toBe(false);
    expect(serialized).not.toContain('2023-08');
    expect(serialized).not.toContain('2023-06');
    expect(serialized).not.toContain('Drug Development');
  });

  it('BiostatsReportGenerator no longer emits invented sample-size numbers', async () => {
    const generator = getReportGenerator('biostats');
    const report = await generator.generateReport({ indication: 'Oncology' });

    const sampleSize = findComponent(report.components, 'sample_size_analysis');
    const serialized = JSON.stringify(sampleSize.content);

    expect(sampleSize.content.available).toBe(false);
    // The previously-hardcoded recommended sample size and its sensitivity
    // variants must not appear anywhere in the payload.
    expect(serialized).not.toContain('"n":320');
    expect(serialized).not.toContain('"n":265');
    expect(serialized).not.toContain('"n":506');

    const designRecs = findComponent(report.components, 'trial_design_recommendations');
    const designSerialized = JSON.stringify(designRecs.content);
    // The old code declared a design "Highly Recommended" for Oncology
    // specifically, as if backed by real trial-specific analysis.
    expect(designSerialized).not.toContain('Highly Recommended');
    expect(designSerialized).toContain('Not available');
  });

  it('CeoReportGenerator strategic overview no longer names Pfizer/Novartis/Roche/BioXcel/Moderna or invented market size', async () => {
    const generator = getReportGenerator('ceo');
    const report = await generator.generateReport({ indication: 'Oncology' });

    const overview = findComponent(report.components, 'strategic_overview');
    const serialized = JSON.stringify(overview.content);

    expect(overview.content.available).toBe(false);
    expect(serialized).not.toContain('Pfizer');
    expect(serialized).not.toContain('Novartis');
    expect(serialized).not.toContain('Roche');
    expect(serialized).not.toContain('BioXcel');
    expect(serialized).not.toContain('Moderna');
    expect(serialized).not.toContain('$4.3B');
  });
});
