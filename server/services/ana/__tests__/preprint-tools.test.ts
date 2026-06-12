/**
 * Preprint discovery AnA tool (search_preprints) — registration + input guard +
 * the non-network blank-query path. Live Europe PMC is not called from CI.
 */
import { describe, it, expect, afterEach, vi } from 'vitest';
import { getToolHandler } from '../AnaToolExecutor';
import { ALL_ANA_TOOLS } from '../AnaToolDefinitions.js';

describe('search_preprints AnA tool', () => {
  const realFetch = global.fetch;
  afterEach(() => {
    global.fetch = realFetch;
    vi.restoreAllMocks();
  });

  it('is registered and defined', () => {
    expect(typeof getToolHandler('search_preprints')).toBe('function');
    expect(ALL_ANA_TOOLS.some(t => t.name === 'search_preprints')).toBe(true);
  });

  it('requires a non-empty query and makes no network call', async () => {
    const spy = vi.fn();
    global.fetch = spy as unknown as typeof fetch;
    const out = JSON.parse(await getToolHandler('search_preprints')!({ query: '  ' }, {} as any));
    expect(out.error).toMatch(/query/i);
    expect(spy).not.toHaveBeenCalled();
  });

  it('returns preprints with the non-peer-review caveat on success', async () => {
    global.fetch = vi.fn().mockResolvedValue(
      new Response(
        JSON.stringify({
          hitCount: 1,
          resultList: {
            result: [
              {
                id: 'PPR1',
                source: 'PPR',
                title: 'Emerging amyloid mechanism',
                authorString: 'Doe J',
                journalTitle: 'bioRxiv',
                doi: '10.1101/2024.05.05.000001',
                firstPublicationDate: '2024-05-06',
              },
            ],
          },
        }),
        { status: 200, headers: { 'Content-Type': 'application/json' } }
      )
    ) as unknown as typeof fetch;

    const out = JSON.parse(await getToolHandler('search_preprints')!({ query: 'amyloid', server: 'biorxiv' }, {} as any));
    expect(out.resultCount).toBe(1);
    expect(out.preprints[0].server).toBe('bioRxiv');
    expect(out.caveat).toMatch(/not peer-reviewed/i);
    // Unified provenance envelope: preliminary, not peer-reviewed, citeable.
    expect(out.provenance).toHaveLength(1);
    expect(out.provenance[0].sourceId).toBe('biorxiv_medrxiv');
    expect(out.provenance[0].peerReviewed).toBe(false);
    expect(out.provenance[0].authority).toBe('preliminary');
    expect(out.provenance[0].citation.identifier).toBe('10.1101/2024.05.05.000001');
  });
});
