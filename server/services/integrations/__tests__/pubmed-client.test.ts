/**
 * PubMed client — unit tests (fetch mocked; live E-utilities unreachable from CI).
 * Lock in esearch param construction (study-type + date-range filters),
 * esummary normalization with citeable URLs, total count, and graceful errors.
 */
import { describe, it, expect, afterEach, vi } from 'vitest';
import {
  buildEsearchParams,
  studyTypeFilter,
  parseDateRange,
  searchPubmed,
} from '../pubmed-client';

describe('pubmed-client', () => {
  const realFetch = global.fetch;
  afterEach(() => {
    global.fetch = realFetch;
    delete process.env.PUBMED_EUTILS_BASE_URL;
    delete process.env.NCBI_API_KEY;
    vi.restoreAllMocks();
  });

  describe('studyTypeFilter', () => {
    it('maps known study types to publication-type fragments', () => {
      expect(studyTypeFilter('rct')).toBe('randomized controlled trial[pt]');
      expect(studyTypeFilter('systematic_review')).toContain('meta-analysis[pt]');
      expect(studyTypeFilter('observational')).toBe('observational study[pt]');
      expect(studyTypeFilter('case_report')).toBe('case reports[pt]');
      expect(studyTypeFilter('any')).toBe('');
      expect(studyTypeFilter(undefined)).toBe('');
    });
  });

  describe('parseDateRange', () => {
    it('parses ranges and single years', () => {
      expect(parseDateRange('2020-2025')).toEqual({ mindate: '2020', maxdate: '2025' });
      expect(parseDateRange('2023')).toEqual({ mindate: '2023', maxdate: '2023' });
      expect(parseDateRange('last five years')).toBeNull();
      expect(parseDateRange(undefined)).toBeNull();
    });
  });

  describe('buildEsearchParams', () => {
    it('composes term with study-type filter and date range', () => {
      const qs = buildEsearchParams({
        query: 'pembrolizumab NSCLC',
        studyType: 'rct',
        dateRange: '2020-2025',
        maxResults: 8,
      });
      expect(qs.get('term')).toBe('(pembrolizumab NSCLC) AND randomized controlled trial[pt]');
      expect(qs.get('retmax')).toBe('8');
      expect(qs.get('datetype')).toBe('pdat');
      expect(qs.get('mindate')).toBe('2020');
      expect(qs.get('maxdate')).toBe('2025');
      expect(qs.get('sort')).toBe('relevance');
    });

    it('clamps retmax and omits filters when not provided', () => {
      const qs = buildEsearchParams({ query: 'x', maxResults: 999 });
      expect(qs.get('retmax')).toBe('20');
      expect(qs.get('term')).toBe('x');
      expect(qs.get('mindate')).toBeNull();
    });

    it('includes api_key when NCBI_API_KEY is set', () => {
      process.env.NCBI_API_KEY = 'secret-key';
      expect(buildEsearchParams({ query: 'x' }).get('api_key')).toBe('secret-key');
    });
  });

  describe('searchPubmed', () => {
    it('returns normalized, citeable articles + totalCount', async () => {
      const esearch = { esearchresult: { idlist: ['38000001'], count: '342' } };
      const esummary = {
        result: {
          '38000001': {
            title: 'Pembrolizumab in NSCLC',
            authors: [{ name: 'Smith J' }, { name: 'Doe A' }, { name: 'Roe B' }, { name: 'Extra C' }],
            fulljournalname: 'Journal of Clinical Oncology',
            pubdate: '2024 Jan',
            elocationid: 'doi: 10.1200/JCO.24.00001',
          },
        },
      };
      global.fetch = vi.fn()
        .mockResolvedValueOnce({ ok: true, json: async () => esearch })
        .mockResolvedValueOnce({ ok: true, json: async () => esummary }) as any;

      const result = await searchPubmed({ query: 'pembrolizumab' });
      expect(result.totalCount).toBe(342);
      expect(result.articles).toHaveLength(1);
      const a = result.articles[0];
      expect(a.pmid).toBe('38000001');
      expect(a.authors).toBe('Smith J, Doe A, Roe B'); // capped at 3
      expect(a.journal).toBe('Journal of Clinical Oncology');
      expect(a.doi).toBe('doi: 10.1200/JCO.24.00001');
      expect(a.url).toBe('https://pubmed.ncbi.nlm.nih.gov/38000001/');
    });

    it('returns empty (no esummary call) when no ids match', async () => {
      const fetchMock = vi.fn().mockResolvedValueOnce({
        ok: true,
        json: async () => ({ esearchresult: { idlist: [], count: '0' } }),
      });
      global.fetch = fetchMock as any;
      const result = await searchPubmed({ query: 'zzzznotathing' });
      expect(result.articles).toEqual([]);
      expect(result.totalCount).toBe(0);
      expect(fetchMock).toHaveBeenCalledTimes(1); // esearch only
    });

    it('honors PUBMED_EUTILS_BASE_URL and throws on HTTP error', async () => {
      process.env.PUBMED_EUTILS_BASE_URL = 'https://eutils-proxy.internal/eutils/';
      const fetchMock = vi.fn().mockResolvedValue({ ok: false, status: 429 });
      global.fetch = fetchMock as any;
      await expect(searchPubmed({ query: 'x' })).rejects.toThrow(/HTTP 429/);
      expect((fetchMock.mock.calls[0][0] as string).startsWith(
        'https://eutils-proxy.internal/eutils/esearch.fcgi?'
      )).toBe(true);
    });
  });
});
