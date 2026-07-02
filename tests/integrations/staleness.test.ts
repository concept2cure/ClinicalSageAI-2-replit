/**
 * Staleness signaling — unit tests.
 *
 * Every top-level integration result now carries additive freshness metadata so
 * the model can reason about how current the evidence is:
 *   - `retrievedAt`     ISO-8601 timestamp of when the data was fetched.
 *   - `cacheAgeSeconds` age of the data in seconds (0 for a fresh fetch).
 *   - `stale`           true once `cacheAgeSeconds` exceeds the per-source
 *                       `STALE_AFTER_SECONDS` threshold.
 *
 * Staleness threshold (documented, per source):
 *   - ClinicalTrials.gov: 1 hour
 *   - PubMed:             6 hours
 *   - ChEMBL:            24 hours (release-versioned, effectively static)
 *   - openFDA labels:    12 hours
 *
 * Caching is bypassed under the test runner, so a mocked fetch always yields a
 * FRESH result here; the threshold logic itself is covered directly via
 * computeStaleness().
 */
import { describe, it, expect, afterEach, vi } from 'vitest';
import {
  searchTrials,
  computeStaleness,
  STALE_AFTER_SECONDS as CTGOV_STALE_AFTER,
} from '../../server/services/integrations/clinicaltrials-client';
import { searchPubmed } from '../../server/services/integrations/pubmed-client';
import { searchChemblCompounds } from '../../server/services/integrations/chembl-client';
import { searchDrugLabels } from '../../server/services/integrations/drug-label-client';

const ISO_RE = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d+)?Z$/;

describe('computeStaleness', () => {
  it('marks a just-fetched item fresh (age ~0, not stale)', () => {
    const s = computeStaleness(Date.now());
    expect(s.cacheAgeSeconds).toBeLessThanOrEqual(1);
    expect(s.stale).toBe(false);
    expect(s.retrievedAt).toMatch(ISO_RE);
  });

  it('flags data older than the threshold as stale', () => {
    const old = Date.now() - (CTGOV_STALE_AFTER + 10) * 1000;
    const s = computeStaleness(old);
    expect(s.cacheAgeSeconds).toBeGreaterThan(CTGOV_STALE_AFTER);
    expect(s.stale).toBe(true);
  });

  it('keeps data just under the threshold fresh', () => {
    const recent = Date.now() - (CTGOV_STALE_AFTER - 10) * 1000;
    const s = computeStaleness(recent);
    expect(s.stale).toBe(false);
  });
});

describe('client results carry additive freshness fields (fresh fetch)', () => {
  const realFetch = global.fetch;
  afterEach(() => {
    global.fetch = realFetch;
    vi.restoreAllMocks();
  });

  function expectFresh(result: {
    retrievedAt?: string;
    cacheAgeSeconds?: number;
    stale?: boolean;
  }): void {
    expect(result.retrievedAt).toBeDefined();
    expect(result.retrievedAt).toMatch(ISO_RE);
    expect(result.cacheAgeSeconds).toBe(0);
    expect(result.stale).toBe(false);
  }

  it('ClinicalTrials.gov: searchTrials', async () => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        studies: [{ protocolSection: { identificationModule: { nctId: 'NCT01' } } }],
        totalCount: 1,
      }),
    }) as any;
    const result = await searchTrials({ condition: 'NSCLC' });
    expect(result.trials).toHaveLength(1);
    expectFresh(result);
  });

  it('PubMed: searchPubmed', async () => {
    global.fetch = vi
      .fn()
      .mockResolvedValueOnce({ ok: true, json: async () => ({ esearchresult: { idlist: ['1'], count: '1' } }) })
      .mockResolvedValueOnce({ ok: true, json: async () => ({ result: { '1': { title: 'T' } } }) }) as any;
    const result = await searchPubmed({ query: 'x' });
    expect(result.articles).toHaveLength(1);
    expectFresh(result);
  });

  it('PubMed: empty result path is still fresh', async () => {
    global.fetch = vi
      .fn()
      .mockResolvedValueOnce({ ok: true, json: async () => ({ esearchresult: { idlist: [], count: '0' } }) }) as any;
    const result = await searchPubmed({ query: 'zzz' });
    expect(result.articles).toEqual([]);
    expectFresh(result);
  });

  it('ChEMBL: searchChemblCompounds', async () => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ molecules: [{ molecule_chembl_id: 'CHEMBL25' }], page_meta: { total_count: 1 } }),
    }) as any;
    const result = await searchChemblCompounds('aspirin');
    expect(result.molecules).toHaveLength(1);
    expectFresh(result);
  });

  it('openFDA: searchDrugLabels', async () => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        results: [{ openfda: { brand_name: ['Keytruda'] } }],
        meta: { results: { total: 1 } },
      }),
    }) as any;
    const result = await searchDrugLabels({ brandName: 'Keytruda' });
    expect(result.labels).toHaveLength(1);
    expectFresh(result);
  });

  it('openFDA: 404 (no match) empty path is still fresh', async () => {
    global.fetch = vi.fn().mockResolvedValue({ ok: false, status: 404 }) as any;
    const result = await searchDrugLabels({ brandName: 'nope' });
    expect(result.total).toBe(0);
    expectFresh(result);
  });

  it('validation fallback: malformed body degrades gracefully, still fresh', async () => {
    global.fetch = vi.fn().mockResolvedValue({ ok: true, json: async () => 'not-an-object' }) as any;
    const result = await searchTrials({ condition: 'x' });
    expect(result.trials).toEqual([]);
    expect(result.totalCount).toBe(0);
    expectFresh(result);
  });
});
