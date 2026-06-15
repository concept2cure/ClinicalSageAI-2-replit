import { describe, it, expect } from 'vitest';
import {
  MARKET_DESCRIPTORS,
  MARKET_IDS,
  getMarket,
  listMarkets,
  marketsByRegion,
  mdsapLeverageMarkets,
  marketRegistrySummary,
} from '../market-registry';
import type { MarketId } from '../types';

const EXPECTED_MARKETS: MarketId[] = [
  'us-fda',
  'eu-mdr-ivdr',
  'uk-mhra',
  'jp-pmda',
  'cn-nmpa',
  'ca-health-canada',
  'au-tga',
  'br-anvisa',
  'kr-mfds',
  'ch-swissmedic',
  'in-cdsco',
  'sg-hsa',
  'tw-tfda',
  'sa-sfda',
  'za-sahpra',
  'mdsap',
];

describe('global-markets registry — coverage', () => {
  it('covers all required markets', () => {
    expect(MARKET_IDS.sort()).toEqual([...EXPECTED_MARKETS].sort());
    expect(listMarkets()).toHaveLength(EXPECTED_MARKETS.length);
  });

  it('every market id resolves to a descriptor with a matching id', () => {
    for (const id of EXPECTED_MARKETS) {
      const m = getMarket(id);
      expect(m, `market ${id} should resolve`).toBeDefined();
      expect(m!.id).toBe(id);
      // descriptor key matches its own id field
      expect(MARKET_DESCRIPTORS[id].id).toBe(id);
    }
  });

  it('listMarkets returns descriptors in canonical order', () => {
    expect(listMarkets().map((m) => m.id)).toEqual(MARKET_IDS);
  });
});

describe('global-markets registry — field population', () => {
  it('classification, pathways, dossier, QMS and localization fields are populated', () => {
    for (const m of listMarkets()) {
      expect(m.name, `${m.id} name`).toBeTruthy();
      expect(m.authority, `${m.id} authority`).toBeTruthy();
      expect(m.authorityShort, `${m.id} authorityShort`).toBeTruthy();
      expect(m.jurisdictions.length, `${m.id} jurisdictions`).toBeGreaterThan(0);

      expect(m.classificationScheme, `${m.id} classificationScheme`).toBeTruthy();
      expect(m.dossierStandard, `${m.id} dossierStandard`).toBeTruthy();
      expect(m.dossierFormatName, `${m.id} dossierFormatName`).toBeTruthy();
      expect(m.ivdSupport, `${m.id} ivdSupport`).toBeTruthy();

      expect(m.devicePathways.length, `${m.id} devicePathways`).toBeGreaterThan(0);
      expect(m.ivdPathways.length, `${m.id} ivdPathways`).toBeGreaterThan(0);

      expect(m.qmsExpectation, `${m.id} qmsExpectation`).toBeTruthy();
      expect(m.localization.primaryLanguage, `${m.id} primaryLanguage`).toBeTruthy();
      expect(m.localization.labellingLanguages, `${m.id} labellingLanguages`).toBeTruthy();
      expect(typeof m.localization.translationRequired, `${m.id} translationRequired`).toBe('boolean');

      expect(m.requiredDossierElements.length, `${m.id} requiredDossierElements`).toBeGreaterThan(0);
      // element ids are unique within a market
      expect(new Set(m.requiredDossierElements).size).toBe(m.requiredDossierElements.length);

      expect(m.citations.length, `${m.id} citations`).toBeGreaterThan(0);
      expect(typeof m.assembleNote, `${m.id} assembleNote`).toBe('string');
      expect(m.assembleNote.length).toBeGreaterThan(0);
    }
  });

  it('IVD-specific markets describe IVD handling distinctly', () => {
    // spot checks that IVD support notes are meaningful, not placeholders
    expect(getMarket('eu-mdr-ivdr')!.ivdSupport).toMatch(/IVDR/i);
    expect(getMarket('cn-nmpa')!.ivdSupport).toMatch(/type testing/i);
    expect(getMarket('kr-mfds')!.ivdSupport).toMatch(/IVD/i);
  });
});

describe('global-markets registry — honest capability invariants', () => {
  it('canTransmit is FALSE for every market (honest invariant)', () => {
    for (const m of listMarkets()) {
      expect(m.canTransmit, `${m.id} must not claim transmission`).toBe(false);
    }
    expect(marketRegistrySummary().transmitCapable).toEqual([]);
  });

  it('canAssemble is true only where an assembler genuinely exists', () => {
    const assembleCapable = listMarkets().filter((m) => m.canAssemble).map((m) => m.id);
    // eCTD/eSTAR (us-fda), CE technical documentation/CER (EU, UK, CH)
    expect(assembleCapable.sort()).toEqual(
      ['ch-swissmedic', 'eu-mdr-ivdr', 'uk-mhra', 'us-fda'].sort(),
    );
  });

  it('markets without an assembler honestly say so', () => {
    for (const m of listMarkets()) {
      if (!m.canAssemble) {
        expect(m.assembleNote.toLowerCase()).toMatch(/no |descriptive|readiness only/);
      }
    }
  });
});

describe('global-markets registry — derived projections', () => {
  it('marketsByRegion partitions all markets', () => {
    const regions = ['north-america', 'europe', 'asia-pacific', 'south-america', 'middle-east', 'africa', 'cross-market'] as const;
    const total = regions.reduce((acc, r) => acc + marketsByRegion(r).length, 0);
    expect(total).toBe(MARKET_IDS.length);
    expect(marketsByRegion('europe').map((m) => m.id)).toContain('eu-mdr-ivdr');
    expect(marketsByRegion('cross-market').map((m) => m.id)).toEqual(['mdsap']);
  });

  it('mdsapLeverageMarkets includes Canada, Brazil and the MDSAP construct itself', () => {
    const ids = mdsapLeverageMarkets().map((m) => m.id);
    expect(ids).toContain('ca-health-canada');
    expect(ids).toContain('br-anvisa');
    expect(ids).toContain('mdsap');
  });

  it('marketRegistrySummary totals are consistent', () => {
    const s = marketRegistrySummary();
    expect(s.total).toBe(MARKET_IDS.length);
    const regionSum = Object.values(s.byRegion).reduce((a, b) => a + b, 0);
    expect(regionSum).toBe(MARKET_IDS.length);
    expect(s.assembleCapable.length).toBeGreaterThan(0);
    expect(s.transmitCapable).toEqual([]);
  });
});

describe('global-markets registry — unknown market', () => {
  it('getMarket returns undefined for an unknown id', () => {
    expect(getMarket('xx-unknown')).toBeUndefined();
    expect(getMarket('')).toBeUndefined();
  });
});
