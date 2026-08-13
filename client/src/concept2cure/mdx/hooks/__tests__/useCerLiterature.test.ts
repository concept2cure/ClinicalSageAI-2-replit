/**
 * @vitest-environment jsdom
 */
/**
 * useCerLiterature — the PubMed search contract.
 *
 * Two properties matter: the server's honest { available:false,
 * unavailableReason } degradation passes through untouched (a down PubMed
 * must never render as "no results"), and a request that cannot be usefully
 * made — sub-2-character query — refuses locally without touching the
 * network.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  literatureSearchUrl,
  searchCerLiterature,
  articleToRecordEntry,
  recordCerLiterature,
} from '../useCerLiterature';
import type { CerLiteratureArticle } from '../useCerLiterature';

vi.mock('@/utils/authToken', () => ({
  getAuthToken: () => 'test-token',
  getOrgId: () => '7',
}));

let fetchMock: ReturnType<typeof vi.fn>;
beforeEach(() => {
  fetchMock = vi.fn();
  vi.stubGlobal('fetch', fetchMock);
});
afterEach(() => vi.unstubAllGlobals());

const jsonResponse = (body: unknown, ok = true, status = 200) => ({
  ok,
  status,
  json: async () => body,
});

describe('literatureSearchUrl (query contract)', () => {
  it('builds and encodes the query with optional filters', () => {
    expect(
      literatureSearchUrl({ q: 'EGFR CDx', years: '2020-2026', studyType: 'rct', max: 10 }),
    ).toBe('/api/cerv2/literature/search?q=EGFR+CDx&max=10&years=2020-2026&studyType=rct');
  });

  it('omits the studyType filter for "any" and skips blank years', () => {
    expect(literatureSearchUrl({ q: 'stent', studyType: 'any', years: '  ' })).toBe(
      '/api/cerv2/literature/search?q=stent',
    );
  });

  it('is null under 2 characters — the server would 400 it', () => {
    expect(literatureSearchUrl({ q: 'x' })).toBeNull();
    expect(literatureSearchUrl({ q: '  ' })).toBeNull();
  });
});

describe('searchCerLiterature', () => {
  it('refuses a too-short query locally without a request', async () => {
    const result = await searchCerLiterature({ q: 'x' });
    expect(result?.available).toBe(false);
    expect(result?.unavailableReason).toMatch(/at least 2 characters/);
    expect(result?.articles).toEqual([]);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('sends auth headers and returns the payload on success', async () => {
    fetchMock.mockResolvedValue(
      jsonResponse({
        available: true,
        recorded: false,
        source: 'PubMed',
        totalCount: 2,
        articles: [
          { pmid: '1', title: 'A', authors: '', journal: 'J', pubDate: '2025', doi: null, url: 'u1' },
          { pmid: '2', title: 'B', authors: '', journal: 'J', pubDate: '2024', doi: null, url: 'u2' },
        ],
      }),
    );
    const result = await searchCerLiterature({ q: 'glucose monitor' });
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe('/api/cerv2/literature/search?q=glucose+monitor');
    expect(init.credentials).toBe('include');
    const headers = init.headers as Record<string, string>;
    expect(headers.Authorization).toBe('Bearer test-token');
    expect(headers['x-organization-id']).toBe('7');
    expect(result?.available).toBe(true);
    expect(result?.recorded).toBe(false);
    expect(result?.articles).toHaveLength(2);
  });

  it('passes the honest degradation payload through untouched', async () => {
    fetchMock.mockResolvedValue(
      jsonResponse({
        available: false,
        recorded: false,
        unavailableReason: 'PubMed search unavailable — HTTP 429',
        source: 'PubMed',
        totalCount: 0,
        articles: [],
      }),
    );
    const result = await searchCerLiterature({ q: 'stent thrombosis' });
    expect(result?.available).toBe(false);
    expect(result?.unavailableReason).toMatch(/HTTP 429/);
    expect(result?.articles).toEqual([]);
  });

  it('returns null when the request itself fails — never fabricated results', async () => {
    fetchMock.mockRejectedValueOnce(new Error('network down'));
    expect(await searchCerLiterature({ q: 'stent' })).toBeNull();

    fetchMock.mockResolvedValueOnce(jsonResponse({ error: 'boom' }, false, 500));
    expect(await searchCerLiterature({ q: 'stent' })).toBeNull();
  });
});

const ARTICLE: CerLiteratureArticle = {
  pmid: '38012345',
  title: 'CGM outcomes in adults',
  authors: 'Smith J, Lee K',
  journal: 'Diabetes Care',
  pubDate: '2023 Mar 15',
  doi: '10.1000/x',
  url: 'https://pubmed.ncbi.nlm.nih.gov/38012345/',
};

describe('articleToRecordEntry (record payload contract)', () => {
  it('derives the year from the leading pubDate digits', () => {
    expect(articleToRecordEntry(ARTICLE)).toEqual({
      pmid: '38012345',
      title: 'CGM outcomes in adults',
      journal: 'Diabetes Care',
      year: 2023,
      authors: 'Smith J, Lee K',
      doi: '10.1000/x',
      url: 'https://pubmed.ncbi.nlm.nih.gov/38012345/',
    });
  });

  it('records no year when the pubDate has none — never an invented date', () => {
    expect(articleToRecordEntry({ ...ARTICLE, pubDate: '' }).year).toBeNull();
    expect(articleToRecordEntry({ ...ARTICLE, pubDate: 'Spring' }).year).toBeNull();
  });
});

describe('recordCerLiterature', () => {
  it('POSTs the entries with auth headers and passes the outcome through', async () => {
    fetchMock.mockResolvedValue(
      jsonResponse({
        recorded: true,
        created: 1,
        updated: 0,
        entries: [{ pmid: '38012345', id: 'lit-1', outcome: 'created' }],
        notes: ['entries are stored unscreened'],
      }),
    );
    const outcome = await recordCerLiterature([articleToRecordEntry(ARTICLE)], 'prog-1');

    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe('/api/cerv2/literature/record');
    expect(init.method).toBe('POST');
    const headers = init.headers as Record<string, string>;
    expect(headers.Authorization).toBe('Bearer test-token');
    expect(headers['x-organization-id']).toBe('7');
    expect(headers['Content-Type']).toBe('application/json');
    const body = JSON.parse(String(init.body));
    expect(body.programId).toBe('prog-1');
    expect(body.entries).toHaveLength(1);
    expect(outcome.recorded).toBe(true);
    expect(outcome.created).toBe(1);
  });

  it('omits programId when none is given', async () => {
    fetchMock.mockResolvedValue(jsonResponse({ recorded: true, created: 1, updated: 0, entries: [] }));
    await recordCerLiterature([articleToRecordEntry(ARTICLE)]);
    const body = JSON.parse(String((fetchMock.mock.calls[0] as [string, RequestInit])[1].body));
    expect(body).not.toHaveProperty('programId');
  });

  it('surfaces the server failure text — never an optimistic success', async () => {
    fetchMock.mockResolvedValueOnce(
      jsonResponse({ recorded: false, error: 'Failed to record literature entries — boom' }, false, 500),
    );
    const failed = await recordCerLiterature([articleToRecordEntry(ARTICLE)]);
    expect(failed.recorded).toBe(false);
    expect(failed.error).toMatch(/boom/);

    fetchMock.mockRejectedValueOnce(new Error('network down'));
    const offline = await recordCerLiterature([articleToRecordEntry(ARTICLE)]);
    expect(offline.recorded).toBe(false);
    expect(offline.error).toMatch(/could not be reached/);
  });
});
