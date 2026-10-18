/**
 * A response with no results key is an error, not zero results.
 *
 * What the code used to do: searchPubmed, searchTrials and searchMedicareCoverage
 * logged a shape mismatch (or not even that) and fell back to an empty list. An
 * NCBI esearch body carrying `esearchresult.ERROR`, a ClinicalTrials.gov body with
 * no `studies` array, and a CMS body in an envelope the client did not recognise
 * all came back as "PubMed: 0 articles" / zero trials / zero coverage documents —
 * a search that failed read exactly like a search that found nothing. AnA's
 * search tools and the regulatory-landscape briefing then reported the absence.
 *
 * Each client now throws when the key it reads results from is absent, so its
 * callers report the source as unavailable (the AnA tools and landscape.ts
 * already handle a throw that way). A genuine zero — an empty list in the
 * expected key — is still zero.
 */
import { describe, it, expect, afterEach, vi } from 'vitest';
import { searchPubmed } from '../pubmed-client';
import { searchTrials } from '../clinicaltrials-client';
import { searchMedicareCoverage } from '../cms-coverage-client';

const ok = (json: unknown) => ({ ok: true, status: 200, json: async () => json }) as any;

describe('an unexpected response shape is an error, not zero results', () => {
  const realFetch = global.fetch;
  afterEach(() => {
    global.fetch = realFetch;
    vi.restoreAllMocks();
  });

  describe('PubMed', () => {
    it('an esearch body carrying NCBI ERROR is an error naming it', async () => {
      global.fetch = vi.fn().mockResolvedValue(ok({ esearchresult: { ERROR: 'Invalid query syntax' } })) as any;
      await expect(searchPubmed({ query: 'x[[' }), 'an NCBI error body was read as zero articles').rejects.toThrow(
        /Invalid query syntax/,
      );
    });

    it('an esearch body without esearchresult is an error', async () => {
      global.fetch = vi.fn().mockResolvedValue(ok({ header: { type: 'esearch' } })) as any;
      await expect(searchPubmed({ query: 'x' })).rejects.toThrow(/idlist|esearchresult/);
    });

    it('an esummary body without a result map is an error, not blank articles', async () => {
      global.fetch = vi
        .fn()
        .mockResolvedValueOnce(ok({ esearchresult: { idlist: ['38000001'], count: '1' } }))
        .mockResolvedValueOnce(ok({ error: 'unexpected' })) as any;
      await expect(searchPubmed({ query: 'x' })).rejects.toThrow(/esummary/);
    });

    it('a genuine zero (empty idlist) is still zero articles', async () => {
      global.fetch = vi.fn().mockResolvedValue(ok({ esearchresult: { idlist: [], count: '0' } })) as any;
      const r = await searchPubmed({ query: 'zzzz' });
      expect(r.articles).toEqual([]);
      expect(r.totalCount).toBe(0);
    });
  });

  describe('ClinicalTrials.gov', () => {
    it.each([
      [{ message: 'unexpected envelope' }],
      [{ studies: 'not-a-list', totalCount: 3 }],
    ])('a body without a studies array (%j) is an error', async (body) => {
      global.fetch = vi.fn().mockResolvedValue(ok(body)) as any;
      await expect(searchTrials({ condition: 'NSCLC' }), 'an unrecognised body was read as zero trials').rejects.toThrow(
        /studies/,
      );
    });

    it('a genuine zero (empty studies) is still zero trials', async () => {
      global.fetch = vi.fn().mockResolvedValue(ok({ studies: [], totalCount: 0 })) as any;
      const r = await searchTrials({ condition: 'zzzz' });
      expect(r.trials).toEqual([]);
      expect(r.totalCount).toBe(0);
    });
  });

  describe('CMS Coverage', () => {
    it.each([[{ nope: true }], [null]])('a body with no items array (%j) is an error', async (body) => {
      global.fetch = vi.fn().mockResolvedValue(ok(body)) as any;
      await expect(
        searchMedicareCoverage({ keyword: 'stent' }),
        'an unrecognised envelope was read as zero coverage documents',
      ).rejects.toThrow(/items/);
    });

    it('a genuine zero (empty items) is still zero documents', async () => {
      global.fetch = vi.fn().mockResolvedValue(ok({ result: { items: [] } })) as any;
      const r = await searchMedicareCoverage({ keyword: 'stent' });
      expect(r.documents).toEqual([]);
      expect(r.matched).toBe(0);
    });
  });
});
