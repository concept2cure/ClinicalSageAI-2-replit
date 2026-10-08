/**
 * The PMDA and NMPA connectors return nothing they did not find.
 *
 * Both answered every search with one result built from the query itself —
 * "PMDA Approved Drugs: <query>", relevanceScore 0.8 (NMPA 0.7) — which
 * search_connected_repositories merged and ranked beside real PubMed and
 * ClinicalTrials.gov hits and told the model to cite "by its title and source
 * system", and which deep research filed as primary-authority regulatory
 * intelligence. Neither has a search behind it. Each now refuses with where
 * to search by hand, and the caller reports it as skipped, not as a result.
 */
import { describe, it, expect, vi, afterEach } from 'vitest';

const { query } = vi.hoisted(() => ({ query: vi.fn(async () => ({ rows: [] })) }));
vi.mock('../../../db.js', () => ({ pool: { query }, getPool: () => ({ query }) }));
vi.mock('../../../db', () => ({ pool: { query }, getPool: () => ({ query }) }));

import { PMDAConnector } from '../pmda-reviews.js';
import { NMPACDEConnector } from '../nmpa-cde.js';
import { CONNECTOR_CATALOG } from '../connector-interface.js';
import { searchConnectedRepositories } from '../../integrations/connector-search.js';
import { getConnectorCatalog } from '../connector-registry.js';

afterEach(() => vi.restoreAllMocks());

describe.each([
  ['PMDA', () => new PMDAConnector(), 'pmda_reviews', /pmda\.go\.jp/],
  ['NMPA', () => new NMPACDEConnector(), 'nmpa_cde', /cde\.org\.cn|nmpa\.gov\.cn/],
])('%s connector', (_name, make, id, url) => {
  it('refuses a search instead of returning the query as a scored result', async () => {
    await expect(make().search({ keywords: ['pembrolizumab'], indication: 'NSCLC' })).rejects.toThrow(/no .* search is connected/i);
    await expect(make().search({ keywords: ['pembrolizumab'] })).rejects.toThrow(url);
  });

  it('refuses a fetch instead of returning a placeholder document', async () => {
    await expect(make().fetch('anything')).rejects.toThrow(/no .* search is connected/i);
  });

  it('reports itself unavailable, without reaching out to test a web page', async () => {
    const fetchSpy = vi.spyOn(globalThis, 'fetch');
    const health = await make().status();
    expect(health.status).toBe('unavailable');
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it('does not promise search, scraping or translation in the catalog', () => {
    const entry = CONNECTOR_CATALOG.find((c) => c.id === id)!;
    const text = JSON.stringify(entry);
    expect(text).not.toMatch(/machine translation|machine-translated|is scraped|Search by (INN|product)/i);
    expect(entry.description).toMatch(/not connected/i);
  });

  it('is not offered as connected: the catalog says unavailable, so nothing preselects or lists it', async () => {
    expect(CONNECTOR_CATALOG.find((c) => c.id === id)?.available).toBe(false);
    const entry = (await getConnectorCatalog(7)).find((c) => c.id === id)!;
    expect(entry).toMatchObject({ configured: false, available: false });
  });

  it('is skipped by the repository search as not connected, and never listed as searched', async () => {
    const out = await searchConnectedRepositories(7, { query: 'pembrolizumab', connectors: [id] });
    expect(out.searched).toEqual([]);
    expect(out.skipped).toEqual([{ connector: id, reason: expect.stringMatching(/no search is connected/i) }]);
  });

  it('is reported as skipped by the repository search, never as a document', async () => {
    // Even from a catalog that calls it configured and healthy. Since AnA
    // Summary S2 (2026-10-08) the repository search refuses every source that
    // is not one of the five repositories before any search runs, so the
    // connector's own refusal is never reached: the reason is the repository
    // refusal, and nothing is searched.
    const searchConnectors = vi.fn(async (_org: number, ids: string[], query: { keywords?: string[] }) =>
      Promise.all(ids.map(async (connectorId) => {
        try {
          return { connectorId, results: await make().search(query) };
        } catch (err) {
          return { connectorId, results: [], error: (err as Error).message };
        }
      })));
    const out = await searchConnectedRepositories(
      7,
      { query: 'pembrolizumab', connectors: [id] },
      {
        getConnectorCatalog: async () => [{ id, configured: true, healthy: true }] as never,
        searchConnectors,
      },
    );
    expect(out.documents).toEqual([]);
    expect(searchConnectors).not.toHaveBeenCalled();
    expect(out.skipped).toEqual([{ connector: id, reason: expect.stringMatching(/search_literature or the agency lookups/) }]);
  });
});
