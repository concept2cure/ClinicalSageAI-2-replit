/**
 * A generic/biosimilar claimed with a pediatric extension gets no months for it:
 * the extension is 'not_assessed' for that class, with the reason (2026-10-15).
 *
 * What the code used to do: computeExclusivity applied the market's pediatric rule
 * to any class, so `{ market: 'FDA', productClass: 'generic_or_biosimilar',
 * pediatricExtension: true }` came back binding 6 months ("No originator exclusivity
 * (generic/biosimilar) + pediatric extension", base 0 + 6) and an LOE date 6 months
 * after approval; and buildStrategyBrief listed that +6 months as potential for a
 * generic or biosimilar with pediatric development declared. This repository holds
 * no basis for pediatric exclusivity attaching to this class.
 */
import { describe, it, expect } from 'vitest';
import { computeExclusivity, type ExclusivityMarket } from '../exclusivity-periods';
import { buildStrategyBrief } from '../regulatory-strategy-brief';

const MARKETS: ExclusivityMarket[] = ['FDA', 'EMA', 'PMDA'];

describe('computeExclusivity — pediatric extension for a generic/biosimilar', () => {
  it('adds no months and reports the extension not assessed, with the reason', () => {
    for (const market of MARKETS) {
      const r = computeExclusivity({ market, productClass: 'generic_or_biosimilar', pediatricExtension: true, approvalDate: '2026-03-10' });
      expect(r.bindingMonths, `${market}: a generic was given the pediatric extension`).toBe(0);
      expect(r.lossOfExclusivityDate).toBe('2026-03-10');
      expect(r.components.some((c) => /pediatric/i.test(c.type))).toBe(false);
      expect(r.bindingType).not.toMatch(/pediatric/);
      expect(r.pediatricExtension?.status).toBe('not_assessed');
      expect(r.pediatricExtension?.note).toMatch(/no basis on file/);
    }
  });

  it('an originator class still gets the FDA extension, reported applied', () => {
    const r = computeExclusivity({ market: 'FDA', productClass: 'new_chemical_entity', pediatricExtension: true });
    expect(r.bindingMonths).toBe(66);
    expect(r.pediatricExtension?.status).toBe('applied');
  });

  it('reports no extension status when none was claimed', () => {
    expect(computeExclusivity({ market: 'FDA', productClass: 'generic_or_biosimilar' }).pediatricExtension).toBeNull();
  });
});

describe('strategy brief — no potential pediatric extension for a generic or biosimilar', () => {
  it('lists none as potential, and says it was not assessed', () => {
    for (const productType of ['generic', 'biosimilar'] as const) {
      const brief = buildStrategyBrief({ productType, targetMarkets: ['US', 'EU'], pediatricDevelopment: true });
      for (const m of brief.markets) {
        expect(m.potentialExclusivity, `${productType} ${m.agency}: +6 months listed as potential`).toEqual([]);
        expect(m.potentialExclusivityNotAssessed).toEqual([expect.stringMatching(/Pediatric extension.*not assessed.*no basis on file/)]);
      }
    }
  });

  it('an NCE with pediatric development still lists the FDA extension as potential', () => {
    const brief = buildStrategyBrief({ productType: 'small_molecule_nce', targetMarkets: ['US'], pediatricDevelopment: true });
    expect(brief.markets[0].potentialExclusivity!.map((c) => [c.type, c.months])).toEqual([['Pediatric extension', 6]]);
    expect(brief.markets[0].potentialExclusivityNotAssessed).toEqual([]);
  });
});
