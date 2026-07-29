/**
 * Preprint client — unit tests (fetch mocked; live Europe PMC unreachable from CI).
 * Lock in query construction (SRC:PPR + server filter), normalization with a
 * citeable DOI/URL and server derivation, total count, and graceful errors.
 */
import { describe, it, expect, afterEach, vi } from 'vitest';
import {
  buildSearchUrl,
  serverFilterFragment,
  deriveServer,
  normalizePreprint,
  searchPreprints,
} from '../preprint-client';

describe('preprint-client', () => {
  const realFetch = global.fetch;
  afterEach(() => {
    global.fetch = realFetch;
    delete process.env.EUROPEPMC_API_BASE_URL;
    vi.restoreAllMocks();
  });

  describe('serverFilterFragment', () => {
    it('narrows to bioRxiv / medRxiv, or nothing for any', () => {
      expect(serverFilterFragment('biorxiv')).toMatch(/bioRxiv/);
      expect(serverFilterFragment('medrxiv')).toMatch(/medRxiv/);
      expect(serverFilterFragment('any')).toBe('');
      expect(serverFilterFragment(undefined)).toBe('');
    });
  });

  describe('buildSearchUrl', () => {
    it('restricts to preprints and clamps page size', () => {
      const url = buildSearchUrl({ query: 'tau propagation', maxResults: 99 });
      // URLSearchParams encodes spaces as '+', which decodeURIComponent does not restore.
      const decoded = decodeURIComponent(url).replace(/\+/g, ' ');
      expect(decoded).toContain('SRC:PPR');
      expect(decoded).toContain('(tau propagation)');
      expect(url).toContain('pageSize=25'); // clamped to MAX_RESULTS
    });

    it('adds the server filter when requested and honors base-URL override', () => {
      process.env.EUROPEPMC_API_BASE_URL = 'https://proxy.internal/epmc';
      const url = buildSearchUrl({ query: 'amyloid', server: 'biorxiv' });
      expect(url).toMatch(/^https:\/\/proxy\.internal\/epmc\/search\?/);
      expect(decodeURIComponent(url)).toMatch(/bioRxiv/);
    });
  });

  describe('deriveServer', () => {
    it('identifies bioRxiv / medRxiv from journal or DOI prefix', () => {
      expect(deriveServer({ journalTitle: 'bioRxiv' })).toBe('bioRxiv');
      expect(deriveServer({ publisher: 'medRxiv' })).toBe('medRxiv');
      expect(deriveServer({ doi: '10.1101/2024.01.01.123456' })).toBe('bioRxiv/medRxiv');
      expect(deriveServer({})).toBe('preprint');
    });
  });

  describe('normalizePreprint', () => {
    it('builds a citeable DOI URL and flags non-peer-review', () => {
      const rec = normalizePreprint({
        id: 'PPR123',
        source: 'PPR',
        title: 'A preprint',
        authorString: 'Doe J, Roe R',
        journalTitle: 'bioRxiv',
        doi: '10.1101/2024.01.01.123456',
        firstPublicationDate: '2024-01-02',
      });
      expect(rec.url).toBe('https://doi.org/10.1101/2024.01.01.123456');
      expect(rec.server).toBe('bioRxiv');
      expect(rec.isPreprint).toBe(true);
      expect(rec.postedDate).toBe('2024-01-02');
    });

    it('falls back to a Europe PMC URL when no DOI', () => {
      const rec = normalizePreprint({ id: 'PPR9', source: 'PPR', title: 'X' });
      expect(rec.url).toContain('europepmc.org/article/PPR/PPR9');
    });
  });

  describe('searchPreprints', () => {
    it('returns normalized preprints and total count', async () => {
      global.fetch = vi.fn().mockResolvedValue(
        new Response(
          JSON.stringify({
            hitCount: 1,
            resultList: {
              result: [
                {
                  id: 'PPR123',
                  source: 'PPR',
                  title: 'Tau propagation preprint',
                  authorString: 'Doe J',
                  journalTitle: 'bioRxiv',
                  doi: '10.1101/2024.01.01.123456',
                  firstPublicationDate: '2024-01-02',
                },
              ],
            },
          }),
          { status: 200, headers: { 'Content-Type': 'application/json' } }
        )
      ) as unknown as typeof fetch;

      const result = await searchPreprints({ query: 'tau propagation' });
      expect(result.source).toBe('Europe PMC (preprints)');
      expect(result.totalCount).toBe(1);
      expect(result.preprints).toHaveLength(1);
      expect(result.preprints[0].server).toBe('bioRxiv');
      expect(result.caveat).toMatch(/not peer-reviewed/i);
    });

    it('returns empty for a blank query without calling the network', async () => {
      const spy = vi.fn();
      global.fetch = spy as unknown as typeof fetch;
      const result = await searchPreprints({ query: '   ' });
      expect(result.preprints).toHaveLength(0);
      expect(spy).not.toHaveBeenCalled();
    });

    it('throws on HTTP error so the caller can degrade', async () => {
      global.fetch = vi.fn().mockResolvedValue(new Response('', { status: 502 })) as unknown as typeof fetch;
      await expect(searchPreprints({ query: 'amyloid' })).rejects.toThrow(/HTTP 502/);
    });
  });
});
