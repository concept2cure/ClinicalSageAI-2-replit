/**
 * A failed CMS Coverage search is reported on the suggestion, not shown as an
 * item with zero candidate citations.
 *
 * What the code used to do: suggestItemClassifications caught any CMS Coverage
 * search failure (and a client that could not be loaded) and set
 * `candidateCitations = []` — the same answer as a search that ran and found no
 * NCD for the item. Now a failed search gives `candidateCitations: null` and
 * `citationSearchError` saying why; [] means the search ran and matched nothing.
 * The CMS client is real; only `fetch` and the pool are stubbed.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const db = vi.hoisted(() => ({
  query: vi.fn(async (sql: string) => {
    if (sql.includes('FROM coverage_analyses')) return { rows: [{ qualifying_determination: 'qualifying' }] };
    if (sql.includes('FROM coverage_analysis_items')) {
      return { rows: [{ id: 1, item_description: 'Computed tomography', is_standard_of_care: true, sponsor_paid_in_budget: false }] };
    }
    return { rows: [] };
  }),
}));
vi.mock('../../../db', () => ({ pool: db, getPool: () => db }));

import { suggestItemClassifications } from '../coverage-service';

const realFetch = globalThis.fetch;
let answer: () => Response;
const json = (body: unknown) =>
  new Response(JSON.stringify(body), { status: 200, headers: { 'content-type': 'application/json' } });

beforeEach(() => {
  globalThis.fetch = vi.fn(async () => answer()) as typeof fetch;
});
afterEach(() => {
  globalThis.fetch = realFetch;
});

describe('coverage suggestions: a failed citation search is not zero citations', () => {
  it('reports a CMS failure on the item instead of an empty citation list', async () => {
    answer = () => new Response('unavailable', { status: 503 });
    const { suggestions } = await suggestItemClassifications(7, 1);
    expect(suggestions[0].candidateCitations, 'a failed CMS search was shown as zero citations').toBeNull();
    expect(suggestions[0].citationSearchError).toMatch(/HTTP 503/);
    // The deterministic designation does not depend on the search.
    expect(suggestions[0].suggestedBillingDesignation).toBeTruthy();
  });

  it('control: a search that ran and matched nothing is an empty list, with no error', async () => {
    answer = () => json({ data: [] });
    const { suggestions } = await suggestItemClassifications(7, 1);
    expect(suggestions[0].candidateCitations).toEqual([]);
    expect(suggestions[0].citationSearchError).toBeUndefined();
  });

  it('control: matches are attached', async () => {
    answer = () => json({ data: [{ document_display_id: '220.1', document_id: 176, title: 'Computed Tomography', document_version: 1 }] });
    const { suggestions } = await suggestItemClassifications(7, 1);
    expect(suggestions[0].candidateCitations).toEqual([
      expect.objectContaining({ documentId: '220.1', title: 'Computed Tomography' }),
    ]);
  });
});
