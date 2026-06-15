/**
 * Tests for the global regulatory pathway / strategy advisor.
 */

import { describe, it, expect } from 'vitest';
import { recommendPathway, type Market, type ProductType } from '../regulatory-pathway-advisor';

describe('recommendPathway', () => {
  it('small_molecule_nce + [US] → IND + NDA 505(b)(1), agency FDA', () => {
    const out = recommendPathway({ productType: 'small_molecule_nce', targetMarkets: ['US'] });
    expect(out.recommendations).toHaveLength(1);
    const us = out.recommendations[0];
    expect(us.market).toBe('US');
    expect(us.agency).toBe('FDA');
    expect(us.clinicalTrialPathway).toContain('IND');
    expect(us.marketingApplication).toContain('NDA 505(b)(1)');
  });

  it('biologic + [US, EU] → BLA 351(a) and centralised MAA', () => {
    const out = recommendPathway({ productType: 'biologic', targetMarkets: ['US', 'EU'] });
    const us = out.recommendations.find((r) => r.market === 'US')!;
    const eu = out.recommendations.find((r) => r.market === 'EU')!;
    expect(us.marketingApplication).toContain('BLA 351(a)');
    expect(us.agency).toBe('FDA');
    expect(eu.marketingApplication).toContain('Centralised');
    expect(eu.marketingApplication).toContain('726/2004');
    expect(eu.agency).toBe('EMA');
  });

  it('biosimilar + [US] → BLA 351(k)', () => {
    const out = recommendPathway({ productType: 'biosimilar', targetMarkets: ['US'] });
    expect(out.recommendations[0].marketingApplication).toContain('BLA 351(k)');
    expect(out.recommendations[0].agency).toBe('FDA');
  });

  it('generic + [US] → ANDA (no IND typically)', () => {
    const out = recommendPathway({ productType: 'generic', targetMarkets: ['US'] });
    const us = out.recommendations[0];
    expect(us.marketingApplication).toContain('ANDA');
    expect(us.marketingApplication).toContain('505(j)');
    expect(us.clinicalTrialPathway).toMatch(/No IND/i);
  });

  it('cell_gene_therapy + [EU] → ATMP / centralised', () => {
    const out = recommendPathway({ productType: 'cell_gene_therapy', targetMarkets: ['EU'] });
    const eu = out.recommendations[0];
    expect(eu.marketingApplication).toContain('ATMP');
    expect(eu.marketingApplication).toContain('Centralised');
    expect(eu.marketingApplication).toContain('1394/2007');
    expect(eu.agency).toContain('EMA');
  });

  it('cell_gene_therapy + [US] → BLA 351(a) (CBER)', () => {
    const out = recommendPathway({ productType: 'cell_gene_therapy', targetMarkets: ['US'] });
    expect(out.recommendations[0].marketingApplication).toContain('BLA 351(a)');
    expect(out.recommendations[0].clinicalTrialPathway).toContain('IND');
  });

  it('recommendations preserve target-market order (stable)', () => {
    const order: Market[] = ['JP', 'AU', 'US', 'CA', 'UK', 'EU'];
    const out = recommendPathway({ productType: 'small_molecule_nce', targetMarkets: order });
    expect(out.recommendations.map((r) => r.market)).toEqual(order);
  });

  it('covers every market for every product type with a real agency', () => {
    const products: ProductType[] = [
      'small_molecule_nce',
      'biologic',
      'biosimilar',
      'generic',
      'vaccine',
      'cell_gene_therapy',
    ];
    const markets: Market[] = ['US', 'EU', 'JP', 'CA', 'UK', 'AU'];
    const agencyByMarket: Record<Market, string> = {
      US: 'FDA',
      EU: 'EMA',
      JP: 'PMDA',
      CA: 'Health Canada',
      UK: 'MHRA',
      AU: 'TGA',
    };
    for (const p of products) {
      const out = recommendPathway({ productType: p, targetMarkets: markets });
      expect(out.recommendations).toHaveLength(markets.length);
      for (const rec of out.recommendations) {
        expect(rec.agency).toContain(agencyByMarket[rec.market]);
        expect(rec.clinicalTrialPathway.length).toBeGreaterThan(0);
        expect(rec.marketingApplication.length).toBeGreaterThan(0);
      }
    }
  });

  it('JP cell_gene_therapy mentions the regenerative-medicine framework', () => {
    const out = recommendPathway({ productType: 'cell_gene_therapy', targetMarkets: ['JP'] });
    expect(out.recommendations[0].marketingApplication.toLowerCase()).toContain('regenerative');
  });

  it('CA generic → ANDS', () => {
    const out = recommendPathway({ productType: 'generic', targetMarkets: ['CA'] });
    expect(out.recommendations[0].marketingApplication).toContain('ANDS');
  });

  it('UK pathway mentions the International Recognition Procedure', () => {
    const out = recommendPathway({ productType: 'small_molecule_nce', targetMarkets: ['UK'] });
    expect(out.recommendations[0].marketingApplication).toContain('International Recognition Procedure');
  });

  it('AU pathway registers on the ARTG', () => {
    const out = recommendPathway({ productType: 'biologic', targetMarkets: ['AU'] });
    expect(out.recommendations[0].marketingApplication).toContain('ARTG');
  });

  it('unknown product/market combo yields a consult-agency note rather than throwing', () => {
    // Cast to exercise the defensive branch without changing the public types.
    const out = recommendPathway({
      productType: 'unknown_product' as unknown as ProductType,
      targetMarkets: ['US', 'XX' as unknown as Market],
    });
    expect(out.recommendations).toHaveLength(2);
    for (const rec of out.recommendations) {
      expect(rec.agency).toBe('Consult agency');
      expect(rec.notes ?? '').toMatch(/consult/i);
    }
  });

  it('empty target markets → empty recommendations but general notes present', () => {
    const out = recommendPathway({ productType: 'biologic', targetMarkets: [] });
    expect(out.recommendations).toEqual([]);
    expect(out.generalNotes.length).toBeGreaterThan(0);
  });

  it('is deterministic — identical inputs yield identical output', () => {
    const input = {
      productType: 'biologic' as ProductType,
      targetMarkets: ['US', 'EU', 'JP', 'CA', 'UK', 'AU'] as Market[],
      developmentPhase: 'phase2' as const,
    };
    const a = recommendPathway(input);
    const b = recommendPathway(input);
    expect(JSON.stringify(a)).toEqual(JSON.stringify(b));
  });

  it('developmentPhase refines general notes', () => {
    const preclinical = recommendPathway({ productType: 'small_molecule_nce', targetMarkets: ['US'], developmentPhase: 'preclinical' });
    const filed = recommendPathway({ productType: 'small_molecule_nce', targetMarkets: ['US'], developmentPhase: 'filed' });
    expect(preclinical.generalNotes.some((n) => /preclinical/i.test(n))).toBe(true);
    expect(filed.generalNotes.some((n) => /filed/i.test(n))).toBe(true);
  });
});
