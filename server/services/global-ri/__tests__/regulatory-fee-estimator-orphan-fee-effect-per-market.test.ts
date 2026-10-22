/**
 * Fee estimator: an orphan (or small-business) status waives only the fees the
 * estimator's reference holds it waives — FDA's. Elsewhere its fee effect is not
 * modelled: the fee is charged in full and the estimate says so.
 *
 * Until 2026-10-15 estimateFees waived the marketing-application fee and the
 * annual fee in EVERY market for `orphan: true` — EMA, PMDA and Health Canada
 * came back total 0, "Waived — orphan-designated product" — though EMA grants
 * orphan medicinal products fee reductions, not a waiver, and the estimator holds
 * no orphan rule for PMDA or Health Canada. `orphanScreenMet` (the strategy brief)
 * labelled every market's lines "Would be waived if orphan-designated". And
 * `smallBusiness: true` waived the application fee in every market, against the
 * estimator's own input note ("EMA SME fee reductions"). Served via POST
 * /api/global-ri/fees/estimate, /submission-economics, the AnA tools
 * global_ri_fee_estimate and global_ri_strategy_brief.
 */

import { describe, it, expect } from 'vitest';
import { estimateFees, FEE_SCHEDULE, type FeeMarket } from '../regulatory-fee-estimator';

const UNMODELLED: FeeMarket[] = ['EMA', 'PMDA', 'HEALTH_CANADA'];
const NAME: Record<FeeMarket, string> = { FDA: 'FDA', EMA: 'EMA', PMDA: 'PMDA', HEALTH_CANADA: 'Health Canada' };
const notModelled = (status: string, market: FeeMarket) =>
  `fee effect of ${status} status not modelled for ${NAME[market]}`.toLowerCase();

describe('orphan — the fee effect per market', () => {
  it('FDA: the application and program fees are waived (the effect the reference holds)', () => {
    const e = estimateFees({ market: 'FDA', orphan: true });
    expect(e.lineItems.map((li) => li.waived)).toEqual([true, true]);
    expect(e.total).toBe(0);
  });

  it('EMA: nothing is waived — orphan status brings reductions, not a waiver, and they are not modelled', () => {
    const e = estimateFees({ market: 'EMA', orphan: true });
    expect(e.lineItems.map((li) => li.waived)).toEqual([false, false]);
    expect(e.total).toBe(FEE_SCHEDULE.EMA.applicationWithClinicalData + FEE_SCHEDULE.EMA.annualProgramFee);
    for (const li of e.lineItems) {
      expect(li.note).toMatch(/fee effect of orphan status not modelled for EMA/i);
      expect(li.note).toMatch(/reductions, not a waiver/i);
      expect(li.note).not.toMatch(/^Waived/);
    }
    expect(e.caveats).toEqual(expect.arrayContaining([expect.stringMatching(/fee effect of orphan status not modelled for EMA/i)]));
  });

  it('PMDA and Health Canada: nothing is waived and the estimate says the orphan effect is not modelled', () => {
    for (const market of ['PMDA', 'HEALTH_CANADA'] as const) {
      const e = estimateFees({ market, orphan: true });
      expect(e.lineItems.every((li) => li.waived === false)).toBe(true);
      expect(e.total).toBe(FEE_SCHEDULE[market].applicationWithClinicalData + FEE_SCHEDULE[market].annualProgramFee);
      expect(e.caveats.map(c => c.toLowerCase())).toEqual(expect.arrayContaining([expect.stringContaining(notModelled('orphan', market))]));
    }
  });

  it('a met orphan screen (no designation) says "would be waived" only where a designation waives the fee', () => {
    expect(estimateFees({ market: 'FDA', orphanScreenMet: true }).lineItems[0].note).toMatch(/would be waived if orphan-designated/i);
    for (const market of UNMODELLED) {
      const e = estimateFees({ market, orphanScreenMet: true });
      for (const li of e.lineItems) {
        expect(li.waived).toBe(false);
        expect(li.note ?? '').not.toMatch(/would be waived/i);
        expect(li.note?.toLowerCase()).toContain(notModelled('orphan', market));
      }
    }
  });

  it('no orphan status stated: no orphan note or caveat', () => {
    const e = estimateFees({ market: 'EMA' });
    expect(e.lineItems.every((li) => !/orphan/i.test(li.note ?? ''))).toBe(true);
    expect(e.caveats.some((c) => /not modelled/i.test(c))).toBe(false);
  });
});

describe('small business / SME — the fee effect per market', () => {
  it('FDA: the application fee is waived, the program fee is not', () => {
    const e = estimateFees({ market: 'FDA', smallBusiness: true });
    expect(e.lineItems.map((li) => li.waived)).toEqual([true, false]);
  });

  it('EMA, PMDA, Health Canada: nothing is waived and the estimate says the SME effect is not modelled', () => {
    for (const market of UNMODELLED) {
      const e = estimateFees({ market, smallBusiness: true, programYears: 0 });
      expect(e.lineItems[0].waived).toBe(false);
      expect(e.total).toBe(FEE_SCHEDULE[market].applicationWithClinicalData);
      expect(e.lineItems[0].note?.toLowerCase()).toContain(notModelled('small-business / SME', market));
    }
    expect(estimateFees({ market: 'EMA', smallBusiness: true }).lineItems[0].note).toMatch(/reductions, not a waiver/i);
  });
});
