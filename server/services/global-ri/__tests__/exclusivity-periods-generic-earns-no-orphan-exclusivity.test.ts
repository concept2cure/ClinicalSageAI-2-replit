/**
 * A generic/biosimilar earns no orphan exclusivity, so none is computed for it
 * and the strategy brief lists none as potential.
 *
 * Until 2026-10-15 computeExclusivity added the market's orphan rule for any
 * product class, so `{ productClass: 'generic_or_biosimilar', orphan: true }` came
 * back binding 84 months "Orphan Drug exclusivity" (FDA) or 120 months (EMA, PMDA),
 * against the class's own rule ("does not itself earn new-product exclusivity" /
 * "does not earn new data/market exclusivity" / "does not earn a new
 * re-examination period"); and buildStrategyBrief listed that orphan exclusivity
 * as potential for a generic whose orphan screen was met. Served via POST
 * /api/global-ri/exclusivity/compute, /strategy-brief and the AnA tools
 * global_ri_exclusivity and global_ri_strategy_brief.
 */

import { describe, it, expect } from 'vitest';
import { computeExclusivity, getExclusivityRules, type ExclusivityMarket } from '../exclusivity-periods';
import { buildStrategyBrief } from '../regulatory-strategy-brief';

const MARKETS: ExclusivityMarket[] = ['FDA', 'EMA', 'PMDA'];

describe('computeExclusivity — orphan exclusivity does not attach to a generic/biosimilar', () => {
  it('no orphan component and no binding months, with the class rule given as the reason', () => {
    for (const market of MARKETS) {
      const r = computeExclusivity({ market, productClass: 'generic_or_biosimilar', orphan: true });
      expect(r.bindingMonths).toBe(0);
      expect(r.components.some((c) => /orphan/i.test(c.type))).toBe(false);
      const classRule = getExclusivityRules(market)!.byClass.generic_or_biosimilar.description;
      expect(r.notes).toEqual(expect.arrayContaining([`Orphan exclusivity not added: ${classRule}`]));
    }
  });

  it('an originator class still gets its orphan exclusivity', () => {
    const r = computeExclusivity({ market: 'FDA', productClass: 'new_chemical_entity', orphan: true });
    expect(r.bindingMonths).toBe(84);
  });
});

describe('strategy brief — no potential orphan exclusivity for a generic or biosimilar', () => {
  it('lists none although the US and EU orphan screens are met', () => {
    for (const productType of ['generic', 'biosimilar'] as const) {
      const brief = buildStrategyBrief({
        productType,
        targetMarkets: ['US', 'EU'],
        disease: { usPrevalence: 150000, euPrevalencePer10k: 3, seriousOrLifeThreatening: true, noSatisfactoryTreatment: true },
      });
      for (const m of brief.markets) {
        expect(m.designations!.orphan.eligible).toBe(true);
        expect(m.potentialExclusivity).toEqual([]);
      }
    }
  });

  it('an NCE with the same screens still lists orphan exclusivity as potential', () => {
    const brief = buildStrategyBrief({
      productType: 'small_molecule_nce',
      targetMarkets: ['US'],
      disease: { usPrevalence: 150000 },
    });
    expect(brief.markets[0].potentialExclusivity!.map((c) => c.type)).toEqual(['Orphan Drug exclusivity']);
  });
});
