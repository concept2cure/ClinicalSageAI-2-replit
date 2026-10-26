/** Canonical four report bindings; no title/default/market expansion. */
import { describe, expect, it } from 'vitest';
import { readRecordedRegionalFiling, regionalFilingApplicability, unavailableRegionalFilingContext } from '../filing-applicability';
import { REGIONAL_FILING_TYPES } from '../filing-types';
const region = { US: 'USA_FDA', EU: 'EU_EMA', JP: 'JP_PMDA' };
const accepted: Record<string, string[]> = {
  US_IND: ['usa_fda.ind_safety_readiness'], US_NDA: ['usa_fda.nda_bla_filing_readiness'], US_BLA: ['usa_fda.nda_bla_filing_readiness'],
  EU_MAA: ['ema.maa_readiness_assessment'], JP_MKT_APPROVAL: ['japan_pmda.jnda_shonin_readiness'], US_ANDA: [], US_510K: [],
};
describe('the same strict current filing validator feeds overview and engine', () => {
  for (const [registryId, enabled] of Object.entries(accepted)) {
    it.each(Object.entries(REGIONAL_FILING_TYPES))(`${registryId} enables only its exact binding: %s`, (typeId, binding) => {
      const result = regionalFilingApplicability(typeId, { region: region[binding.jurisdiction] }, readRecordedRegionalFiling({ registryId }));
      expect(result.runnable).toBe(enabled.includes(typeId));
      expect(result.availabilityState).toBe(enabled.includes(typeId) ? 'available' : 'not-applicable');
      if (!enabled.includes(typeId)) expect(result.reasonCode).toMatch(/^REGIONAL_(REPORT_(MARKET|KIND)_MISMATCH|FILING_NOT_MODELED)$/);
    });
  }
  it.each([{}, null, undefined])('requires a recorded filing for absent metadata (%j)', metadata => {
    expect(regionalFilingApplicability('usa_fda.ind_safety_readiness', { region: 'USA_FDA' }, readRecordedRegionalFiling(metadata)))
      .toMatchObject({ runnable: false, availabilityState: 'filing-context-required', reasonCode: 'REGIONAL_FILING_CONTEXT_REQUIRED', availabilityReason: 'Record the project’s filing type before running this market readiness assessment. No market readiness was assessed.' });
  });
  it.each(['{broken', '[]', 4, [], { registryId: null }, { registryId: '' }, { registryId: 123 }, { submissionType: {} }, { registryId: 'UNKNOWN', submissionType: 'NDA' }, { registryId: 'EU_MAA', submissionType: 'NDA' }, { registryId: 'EU_MAA', applicationNumber: true }])('refuses malformed/conflicting context (%j)', metadata => {
    const context = readRecordedRegionalFiling(metadata);
    expect(context.state).toBe('context-unavailable');
    expect(regionalFilingApplicability('ema.maa_readiness_assessment', { region: 'EU_EMA' }, context).runnable).toBe(false);
  });
  it('never replaces an unknown explicit registry with a valid legacy type', () => {
    expect(readRecordedRegionalFiling({ registryId: 'NOT-RECORDED', submissionType: 'MAA' }).state).toBe('context-unavailable');
  });
  it('resolves only the canonical submission-type bridge and allows agreeing dual fields', () => {
    expect(readRecordedRegionalFiling({ submissionType: 'NDA' })).toMatchObject({ state: 'recorded', filing: { registryId: 'US_NDA' } });
    expect(readRecordedRegionalFiling({ registryId: 'EU_MAA', submissionType: 'MAA' })).toMatchObject({ state: 'recorded', filing: { registryId: 'EU_MAA' } });
  });
  it('distinguishes a deployed region drift from wrong current filing', () => {
    expect(regionalFilingApplicability('usa_fda.ind_safety_readiness', { region: 'EU_EMA' }, readRecordedRegionalFiling({ registryId: 'US_IND' })))
      .toMatchObject({ availabilityState: 'context-unavailable', runnable: false, reasonCode: 'REGIONAL_TYPE_MARKET_INCONSISTENT' });
  });
  it('keeps storage failure unavailable, never missing or a different market', () => {
    expect(regionalFilingApplicability('ema.maa_readiness_assessment', { region: 'EU_EMA' }, unavailableRegionalFilingContext()))
      .toMatchObject({ availabilityState: 'context-unavailable', reasonCode: 'REGIONAL_FILING_CONTEXT_UNAVAILABLE' });
  });
  it('preserves the recorded agency/label and does not infer from a title', () => {
    expect(readRecordedRegionalFiling({ registryId: 'EU_MAA', title: 'FDA IND candidate' })).toMatchObject({ state: 'recorded', filing: { registryId: 'EU_MAA', agency: 'EMA', kind: 'maa', jurisdiction: 'EU' } });
  });
});
