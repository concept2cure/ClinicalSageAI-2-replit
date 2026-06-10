/**
 * Tests for the market submission specification registry — proves the per-market
 * governance/formatting datasheet is internally consistent and queryable, and that
 * its cross-references to the rule corpus and region codes line up.
 */
import { describe, it, expect } from 'vitest';
import {
  MARKET_SUBMISSION_SPECS,
  getMarketSpec,
  specsForMarket,
  specsForFamily,
  specsForRegion,
  markets,
  marketSpecSummary,
} from '../market-submission-specs';
import { rulesForRegion } from '../../ectd/validation-rule-corpus';

describe('market submission specs — internal consistency', () => {
  it('has unique ids scoped to their market and required fields', () => {
    const ids = MARKET_SUBMISSION_SPECS.map((s) => s.id);
    expect(new Set(ids).size).toBe(ids.length);
    for (const s of MARKET_SUBMISSION_SPECS) {
      expect(s.id.startsWith(`${s.market}-`)).toBe(true);
      expect(s.authority).toBeTruthy();
      expect(s.gateway).toBeTruthy();
      expect(s.productScope.length).toBeGreaterThan(0);
      expect(s.formatting.fileFormats.length).toBeGreaterThan(0);
      expect(s.governance.eSignature.basis).toBeTruthy();
      expect(s.sources.length).toBeGreaterThan(0);
    }
  });

  it('summary counts are internally consistent', () => {
    const sum = marketSpecSummary();
    expect(sum.total).toBe(MARKET_SUBMISSION_SPECS.length);
    const byFamilyTotal = Object.values(sum.byFamily).reduce((a, b) => a + b, 0);
    expect(byFamilyTotal).toBe(MARKET_SUBMISSION_SPECS.length);
    expect(sum.markets).toEqual(markets());
  });

  it('covers the formats the Submission Center operates', () => {
    for (const id of ['us-ectd', 'eu-ectd', 'jp-ectd', 'ca-ectd', 'us-estar', 'eu-mdr', 'eu-ivdr', 'eu-ctis']) {
      expect(getMarketSpec(id), `${id} missing`).toBeTruthy();
    }
  });
});

describe('market submission specs — eCTD invariants', () => {
  it('every eCTD family spec has an index.xml backbone, regional XML, 4-digit sequencing, and lifecycle ops', () => {
    for (const s of specsForFamily('ectd')) {
      expect(s.backbone?.indexXml).toBe(true);
      expect(s.backbone?.regionalXmlPath).toMatch(/regional\.xml$/);
      expect(s.governance.sequenceNumbering).toMatch(/[Ff]our-digit/);
      expect(s.governance.lifecycleOperations).toEqual(['new', 'replace', 'append', 'delete']);
      expect(s.formatting.checksumAlgorithm).toBe('MD5');
    }
  });

  it('device/portal families correctly carry no eCTD backbone', () => {
    for (const s of [...specsForFamily('estar'), ...specsForFamily('eu_mdr'), ...specsForFamily('eu_ivdr'), ...specsForFamily('ctis')]) {
      expect(s.backbone?.indexXml).toBe(false);
    }
  });
});

describe('market submission specs — cross-references', () => {
  it('an eCTD spec ruleCorpusRegion resolves to corpus rules', () => {
    const us = getMarketSpec('us-ectd')!;
    expect(us.ruleCorpusRegion).toBe('fda');
    expect(rulesForRegion(us.ruleCorpusRegion!).length).toBeGreaterThan(0);
  });

  it('region-coded specs map to the system region codes (fda|eu|jp)', () => {
    expect(specsForRegion('fda').some((s) => s.id === 'us-ectd')).toBe(true);
    expect(specsForRegion('eu').some((s) => s.id === 'eu-ctis')).toBe(true);
    expect(specsForRegion('jp').map((s) => s.id)).toContain('jp-ectd');
  });

  it('scopes by market', () => {
    const eu = specsForMarket('eu');
    expect(eu.length).toBeGreaterThanOrEqual(4); // ectd, mdr, ivdr, ctis
    expect(eu.every((s) => s.market === 'eu')).toBe(true);
  });
});
