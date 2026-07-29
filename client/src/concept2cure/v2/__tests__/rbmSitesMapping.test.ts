// @vitest-environment jsdom
/**
 * v2 Clinical-ops surface — live rbm_site_risk_scores → RbmSite mapping.
 *
 * GET /api/mdx/rbm-site-risk returns raw score rows (DB columns: site_number,
 * site_name, composite_risk, monitoring_tier, drivers) plus country_code joined
 * from site_intel.sites. The RBM board renders labelled RbmSites. This locks
 * the bridge so an org's real site-risk roster loads instead of the board
 * silently staying on its Sample fixture, and asserts it fails closed to that
 * fixture on anything that isn't a clean, non-empty score list.
 */
import { describe, it, expect } from 'vitest';
import { mapRbmSites } from '../surfaces/ClinicalOps';

// A rbm_site_risk_scores row (+ joined country_code) as the endpoint returns it.
const DB_ROW = {
  id: 12,
  organization_id: 7,
  program_id: '2f1d9e4a-0000-4000-8000-000000000001',
  site_id: 'S-1101',
  site_number: '1101',
  site_name: 'Mercy Research Institute',
  composite_risk: '72.50', // numeric arrives as a string from pg
  enrollment_risk: '40.00',
  quality_risk: '55.00',
  operational_risk: '61.00',
  monitoring_tier: 'enhanced',
  drivers: ['enrollment lag', 'query aging'],
  country_code: 'US',
};

describe('mapRbmSites — live rbm_site_risk_scores adoption', () => {
  it('maps a score row onto the RbmSite display contract', () => {
    const out = mapRbmSites([DB_ROW]);
    expect(out).not.toBeNull();
    expect(out).toHaveLength(1);
    const s = out![0];
    expect(s.n).toBe('1101');
    expect(s.name).toBe('Mercy Research Institute');
    expect(s.country).toBe('US');
    expect(s.composite).toBe(72.5); // numeric string → number
    expect(s.tier).toBe('enhanced');
    expect(s.drivers).toEqual(['enrollment lag', 'query aging']);
  });

  it('fills sensible defaults for missing optional columns', () => {
    const s = mapRbmSites([
      { site_number: '1102', composite_risk: null, monitoring_tier: null, country_code: null },
    ])![0];
    expect(s.name).toBe('1102'); // falls back to the site number
    expect(s.country).toBe('');
    expect(s.composite).toBe(0);
    expect(s.tier).toBe('standard');
    expect(s.drivers).toEqual([]);
  });

  // ── fail-closed: anything not a clean score list → null → keep fixture ──
  it('rejects an empty list', () => {
    expect(mapRbmSites([])).toBeNull();
  });

  it('rejects the display fixture shape (has n/composite, not the DB columns)', () => {
    const fixtureRow = { n: '1101', name: 'X', country: 'US', composite: 72, tier: 'enhanced' };
    expect(mapRbmSites([fixtureRow])).toBeNull();
  });

  it('rejects the whole batch if any row is not a score row', () => {
    expect(mapRbmSites([DB_ROW, { site_name: 'no number' }])).toBeNull();
  });

  it('unwraps the { data } envelope and rejects non-list / nullish payloads', () => {
    expect(mapRbmSites({ data: [DB_ROW] })).toHaveLength(1);
    expect(mapRbmSites(null)).toBeNull();
    expect(mapRbmSites({})).toBeNull();
    expect(mapRbmSites('nope')).toBeNull();
  });
});
