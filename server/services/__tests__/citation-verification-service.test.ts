/**
 * Tests for the Citation Verification Service.
 *
 * Validates the verification decision logic against mocked PubMed (NCBI
 * E-utilities) and CrossRef responses — exact-identifier resolution, title
 * matching with the similarity threshold, not-found, unverifiable, and the
 * fail-loud error path. No real network calls are made.
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { verifyCitation, verifyCitations } from '../citation-verification-service';

const WATSON_CRICK_TITLE =
  'Molecular structure of nucleic acids; a structure for deoxyribose nucleic acid';

function jsonResponse(body: any, status = 200) {
  return {
    ok: status >= 200 && status < 300,
    status,
    json: async () => body,
    text: async () => JSON.stringify(body),
  } as Response;
}

/** Route a mocked fetch by URL so each branch gets a realistic payload. */
function mockFetch(url: string): Promise<Response> {
  if (url.includes('esummary.fcgi')) {
    return Promise.resolve(
      jsonResponse({
        result: {
          '14907713': {
            uid: '14907713',
            title: WATSON_CRICK_TITLE,
            fulljournalname: 'Nature',
            pubdate: '1953 Apr',
            authors: [{ name: 'Watson JD' }, { name: 'Crick FH' }],
            elocationid: 'doi: 10.1038/171737a0',
          },
        },
      })
    );
  }
  if (url.includes('esearch.fcgi')) {
    return Promise.resolve(jsonResponse({ esearchresult: { idlist: ['14907713'] } }));
  }
  if (url.includes('api.crossref.org/works/')) {
    // Single-DOI lookup. The "fake" DOI path is handled by the test that
    // overrides fetch to return 404.
    return Promise.resolve(
      jsonResponse({
        message: {
          DOI: '10.1038/171737a0',
          title: [WATSON_CRICK_TITLE],
          'container-title': ['Nature'],
          issued: { 'date-parts': [[1953]] },
          author: [{ given: 'J. D.', family: 'Watson' }],
          URL: 'https://doi.org/10.1038/171737a0',
        },
      })
    );
  }
  if (url.includes('api.crossref.org/works?')) {
    return Promise.resolve(jsonResponse({ message: { items: [] } }));
  }
  return Promise.resolve(jsonResponse({}, 404));
}

describe('citation-verification-service', () => {
  beforeEach(() => {
    vi.stubGlobal('fetch', vi.fn((url: string) => mockFetch(String(url))));
  });
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it('verifies a citation by PMID (exact identifier)', async () => {
    const r = await verifyCitation({ id: 'a', pmid: '14907713' });
    expect(r.status).toBe('verified');
    expect(r.exists).toBe(true);
    expect(r.confidence).toBe(1);
    expect(r.match?.source).toBe('pubmed');
    expect(r.match?.pmid).toBe('14907713');
  });

  it('verifies a citation by DOI (exact identifier)', async () => {
    const r = await verifyCitation({ id: 'b', doi: '10.1038/171737a0' });
    expect(r.status).toBe('verified');
    expect(r.exists).toBe(true);
    expect(r.match?.source).toBe('crossref');
    expect(r.match?.doi).toBe('10.1038/171737a0');
  });

  it('extracts a PMID from a raw reference string', async () => {
    const r = await verifyCitation({ id: 'c', raw: 'Watson & Crick, Nature 1953. PMID: 14907713' });
    expect(r.status).toBe('verified');
    expect(r.match?.pmid).toBe('14907713');
  });

  it('verifies by title when no identifier is present', async () => {
    const r = await verifyCitation({ id: 'd', title: WATSON_CRICK_TITLE });
    expect(r.status).toBe('verified');
    expect(r.exists).toBe(true);
    expect((r.confidence ?? 0)).toBeGreaterThanOrEqual(0.8);
    expect(r.match?.source).toBe('pubmed');
  });

  it('reports not_found when a supplied identifier does not resolve', async () => {
    vi.stubGlobal('fetch', vi.fn(() => Promise.resolve(jsonResponse({}, 404))));
    const r = await verifyCitation({ id: 'e', doi: '10.9999/nope.0001' });
    expect(r.status).toBe('not_found');
    expect(r.exists).toBe(false);
  });

  it('reports not_found when a title has no confident match', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn((url: string) => {
        const u = String(url);
        if (u.includes('esearch.fcgi')) return Promise.resolve(jsonResponse({ esearchresult: { idlist: [] } }));
        if (u.includes('api.crossref.org/works?')) return Promise.resolve(jsonResponse({ message: { items: [] } }));
        return Promise.resolve(jsonResponse({}, 404));
      })
    );
    const r = await verifyCitation({ id: 'f', title: 'Quantum entanglement of regulatory unicorns in teleportation trials' });
    expect(r.status).toBe('not_found');
    expect(r.exists).toBe(false);
  });

  it('reports unverifiable when there is nothing resolvable to check', async () => {
    const r = await verifyCitation({ id: 'g', authors: 'Smith J' } as any);
    expect(r.status).toBe('unverifiable');
    expect(r.exists).toBeNull();
  });

  it('fails loud (error, exists=null) when the upstream API throws — never fabricates', async () => {
    vi.stubGlobal('fetch', vi.fn(() => Promise.reject(new Error('network down'))));
    const r = await verifyCitation({ id: 'h', pmid: '14907713' });
    expect(r.status).toBe('error');
    expect(r.exists).toBeNull();
    expect(r.match).toBeNull();
  });

  it('verifies a batch and preserves input order', async () => {
    const results = await verifyCitations([
      { id: '1', pmid: '14907713' },
      { id: '2', doi: '10.1038/171737a0' },
    ]);
    expect(results.map(r => r.id)).toEqual(['1', '2']);
    expect(results.every(r => r.status === 'verified')).toBe(true);
  });

  it('flags a retracted publication while still confirming it exists', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn((url: string) => {
        if (String(url).includes('esummary.fcgi')) {
          return Promise.resolve(
            jsonResponse({
              result: {
                '99999999': {
                  uid: '99999999',
                  title: 'A study later retracted',
                  fulljournalname: 'Journal of Retractions',
                  pubdate: '2015',
                  pubtype: ['Journal Article', 'Retracted Publication'],
                },
              },
            })
          );
        }
        return Promise.resolve(jsonResponse({}, 404));
      })
    );
    const r = await verifyCitation({ id: 'retracted', pmid: '99999999' });
    expect(r.status).toBe('verified');
    expect(r.exists).toBe(true);
    expect(r.retracted).toBe(true);
    expect(r.detail).toMatch(/RETRACTED/);
  });

  it('flags a year discrepancy on an otherwise-verified citation', async () => {
    const r = await verifyCitation({ id: 'yr', doi: '10.1038/171737a0', year: 1999 });
    expect(r.status).toBe('verified');
    expect(r.discrepancies?.length).toBeGreaterThanOrEqual(1);
    expect(r.discrepancies?.join(' ')).toMatch(/1999/);
  });

  it('flags when an identifier resolves to a different article than the cited title', async () => {
    const r = await verifyCitation({
      id: 'mismatch',
      pmid: '14907713',
      title: 'An entirely unrelated paper about marine biology in the Pacific',
    });
    expect(r.status).toBe('verified');
    expect(r.discrepancies?.join(' ')).toMatch(/different article/i);
  });
});
