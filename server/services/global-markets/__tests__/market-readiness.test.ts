import { describe, it, expect } from 'vitest';
import {
  assessMarketReadiness,
  tryAssessMarketReadiness,
  bandForScore,
} from '../market-readiness';
import { getMarket, listMarkets } from '../market-registry';

describe('bandForScore', () => {
  it('maps scores to bands at the boundaries', () => {
    expect(bandForScore(0)).toBe('not-started');
    expect(bandForScore(1)).toBe('minimal');
    expect(bandForScore(39)).toBe('minimal');
    expect(bandForScore(40)).toBe('partial');
    expect(bandForScore(74)).toBe('partial');
    expect(bandForScore(75)).toBe('substantial');
    expect(bandForScore(99)).toBe('substantial');
    expect(bandForScore(100)).toBe('ready');
  });
});

describe('assessMarketReadiness — full / partial / empty', () => {
  it('full artifact set scores 100, band ready, complete=true', () => {
    const market = getMarket('ca-health-canada')!;
    const result = assessMarketReadiness(market.id, market.requiredDossierElements);
    expect(result.score).toBe(100);
    expect(result.band).toBe('ready');
    expect(result.complete).toBe(true);
    expect(result.missingElements).toEqual([]);
    expect(result.presentElements.sort()).toEqual([...market.requiredDossierElements].sort());
  });

  it('partial artifact set scores between 0 and 100 with present+missing split', () => {
    const market = getMarket('eu-mdr-ivdr')!;
    const half = market.requiredDossierElements.slice(0, Math.ceil(market.requiredDossierElements.length / 2));
    const result = assessMarketReadiness(market.id, half);
    expect(result.score).toBeGreaterThan(0);
    expect(result.score).toBeLessThan(100);
    expect(result.complete).toBe(false);
    expect(result.presentElements.sort()).toEqual([...half].sort());
    expect(result.missingElements.length).toBe(
      market.requiredDossierElements.length - half.length,
    );
    // present + missing reconstruct the required set
    expect([...result.presentElements, ...result.missingElements].sort()).toEqual(
      [...market.requiredDossierElements].sort(),
    );
  });

  it('empty artifact set scores 0, band not-started, everything missing', () => {
    const market = getMarket('jp-pmda')!;
    const result = assessMarketReadiness(market.id, []);
    expect(result.score).toBe(0);
    expect(result.band).toBe('not-started');
    expect(result.complete).toBe(false);
    expect(result.presentElements).toEqual([]);
    expect(result.missingElements.sort()).toEqual([...market.requiredDossierElements].sort());
  });

  it('defaults availableArtifacts to empty when omitted', () => {
    const result = assessMarketReadiness('mdsap');
    expect(result.score).toBe(0);
    expect(result.presentElements).toEqual([]);
  });

  it('ignores artifacts that are not part of the required set', () => {
    const market = getMarket('au-tga')!;
    const result = assessMarketReadiness(market.id, [
      ...market.requiredDossierElements,
      'irrelevant_artifact',
      'another_unrelated_doc',
    ]);
    expect(result.score).toBe(100);
    expect(result.complete).toBe(true);
    expect(result.presentElements).not.toContain('irrelevant_artifact');
  });
});

describe('assessMarketReadiness — honest blockers', () => {
  it('always includes a cannot-transmit blocker for every market', () => {
    for (const m of listMarkets()) {
      const result = assessMarketReadiness(m.id, m.requiredDossierElements);
      const hasTransmitBlocker = result.blockers.some((b) =>
        b.includes('cannot transmit') && b.includes(m.authorityShort),
      );
      expect(hasTransmitBlocker, `${m.id} must report a cannot-transmit blocker`).toBe(true);
    }
  });

  it('adds a cannot-assemble blocker only for non-assembler markets', () => {
    const cn = assessMarketReadiness('cn-nmpa', getMarket('cn-nmpa')!.requiredDossierElements);
    expect(cn.blockers.some((b) => b.includes('cannot assemble'))).toBe(true);

    const us = assessMarketReadiness('us-fda', getMarket('us-fda')!.requiredDossierElements);
    expect(us.blockers.some((b) => b.includes('cannot assemble'))).toBe(false);
  });

  it('adds a local-representative blocker where required', () => {
    const cn = assessMarketReadiness('cn-nmpa', getMarket('cn-nmpa')!.requiredDossierElements);
    expect(cn.blockers.some((b) => b.includes('local in-country representative'))).toBe(true);

    // Health Canada does not require a local rep in this registry
    const ca = assessMarketReadiness('ca-health-canada', getMarket('ca-health-canada')!.requiredDossierElements);
    expect(ca.blockers.some((b) => b.includes('local in-country representative'))).toBe(false);
  });

  it('lists each missing element as a blocker', () => {
    const market = getMarket('in-cdsco')!;
    const result = assessMarketReadiness(market.id, []);
    for (const el of market.requiredDossierElements) {
      expect(result.blockers).toContain(`missing required dossier element: ${el}`);
    }
  });

  it('a complete set still carries the honest transmit blocker (never zero blockers)', () => {
    const result = assessMarketReadiness('us-fda', getMarket('us-fda')!.requiredDossierElements);
    expect(result.complete).toBe(true);
    expect(result.blockers.length).toBeGreaterThan(0);
  });
});

describe('assessMarketReadiness — unknown market handling', () => {
  it('throws on an unknown market id', () => {
    expect(() => assessMarketReadiness('xx-unknown', [])).toThrow(/unknown market/i);
  });

  it('tryAssessMarketReadiness returns null for unknown market', () => {
    expect(tryAssessMarketReadiness('xx-unknown', [])).toBeNull();
    expect(tryAssessMarketReadiness('', [])).toBeNull();
  });

  it('tryAssessMarketReadiness returns a result for a known market', () => {
    const r = tryAssessMarketReadiness('br-anvisa', []);
    expect(r).not.toBeNull();
    expect(r!.marketId).toBe('br-anvisa');
  });
});

describe('assessMarketReadiness — result shape', () => {
  it('returns authority short code and the assessed marketId', () => {
    const r = assessMarketReadiness('uk-mhra', []);
    expect(r.marketId).toBe('uk-mhra');
    expect(r.authority).toBe('MHRA');
  });
});
