/**
 * routeEvidenceRequest literature_first — canonical PubMed client re-point.
 *
 * The ad-hoc runLiteratureSearch E-utilities implementation was deleted
 * (D11e); the literature-first route now runs through
 * server/services/integrations/pubmed-client.ts (the same client AnA's
 * search_literature tool and /api/cerv2/literature/search use), while
 * keeping the historical result contract its two consumers
 * (routes/external-evidence.ts, routes/ana-ri/chat.ts) read:
 * { provider, summary, results: [{ pmid, title, pubdate, source }] }.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

const { mockSearchPubmed } = vi.hoisted(() => ({
  mockSearchPubmed: vi.fn(),
}));

vi.mock('../services/integrations/pubmed-client', () => ({
  searchPubmed: mockSearchPubmed,
}));

import { routeEvidenceRequest } from '../services/research-intelligence/routeEvidenceRequest';

const LITERATURE_PROMPT = 'Find biomarker clinical evidence in PubMed';

describe('routeEvidenceRequest literature_first', () => {
  beforeEach(() => vi.clearAllMocks());

  it('routes through the canonical PubMed client with the legacy result contract', async () => {
    mockSearchPubmed.mockResolvedValueOnce({
      source: 'PubMed',
      totalCount: 2,
      articles: [
        { pmid: '1', title: 'A', authors: '', journal: 'J1', pubDate: '2024 Jan', doi: null, url: 'u1' },
        { pmid: '2', title: 'B', authors: '', journal: 'J2', pubDate: '2023 Feb', doi: null, url: 'u2' },
      ],
    });

    const result = await routeEvidenceRequest(LITERATURE_PROMPT);

    expect(result.route).toBe('literature_first');
    expect(mockSearchPubmed).toHaveBeenCalledWith({
      query: LITERATURE_PROMPT,
      maxResults: 5,
    });
    expect(result.data).toEqual({
      provider: 'PubMed',
      summary: 'Literature-first route returned 2 PubMed results.',
      results: [
        { pmid: '1', title: 'A', pubdate: '2024 Jan', source: 'J1' },
        { pmid: '2', title: 'B', pubdate: '2023 Feb', source: 'J2' },
      ],
    });
  });

  it('degrades honestly when PubMed is unreachable — zero results, reason in summary', async () => {
    mockSearchPubmed.mockRejectedValueOnce(new Error('HTTP 429'));

    const result = await routeEvidenceRequest(LITERATURE_PROMPT);

    expect(result.route).toBe('literature_first');
    expect((result.data as any).results).toEqual([]);
    expect((result.data as any).summary).toMatch(/PubMed lookup failed — HTTP 429/);
  });

  it('reports an honest empty summary for zero hits', async () => {
    mockSearchPubmed.mockResolvedValueOnce({ source: 'PubMed', totalCount: 0, articles: [] });

    const result = await routeEvidenceRequest(LITERATURE_PROMPT);
    expect((result.data as any).summary).toMatch(/No PubMed hits/);
  });
});
