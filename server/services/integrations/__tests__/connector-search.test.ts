/**
 * Connected-repository search — unit tests.
 * Registry calls are injected, so this verifies the orchestration (catalog
 * resolution, configured/unhealthy/unknown skipping, fan-out, flattening, sort,
 * limit) without a DB or live connectors.
 */
import { describe, it, expect, vi } from 'vitest';
import {
  searchConnectedRepositories,
  type ConnectorSearchDeps,
} from '../connector-search';

const catalog = [
  { id: 'google-drive', name: 'Google Drive', configured: true, healthy: true },
  { id: 'box', name: 'Box', configured: false, healthy: true },
  { id: 'veeva-vault', name: 'Veeva Vault', configured: true, healthy: false },
];

function makeDeps(over: Partial<ConnectorSearchDeps> = {}): ConnectorSearchDeps {
  return {
    getConnectorCatalog: vi.fn().mockResolvedValue(catalog),
    searchConnectors: vi.fn().mockResolvedValue([
      {
        connectorId: 'google-drive',
        results: [
          { id: '1', sourceConnector: 'google-drive', title: 'Protocol v3', summary: 'Final protocol', url: 'https://drive/1', relevanceScore: 0.9, metadata: {} },
          { id: '2', sourceConnector: 'google-drive', title: 'Old draft', summary: 'Draft', url: 'https://drive/2', relevanceScore: 0.4, metadata: {} },
        ],
      },
    ]),
    ...over,
  };
}

describe('searchConnectedRepositories', () => {
  it('searches only configured+healthy connectors and reports the rest as skipped', async () => {
    const deps = makeDeps();
    const res = await searchConnectedRepositories(42, { query: 'protocol' }, deps);

    expect(deps.searchConnectors).toHaveBeenCalledWith(42, ['google-drive'], {
      keywords: ['protocol'],
      limit: 8,
    });
    expect(res.searched).toEqual(['google-drive']);
    expect(res.skipped).toEqual(
      expect.arrayContaining([
        { connector: 'box', reason: 'not connected for this organization' },
        { connector: 'veeva-vault', reason: 'credentials invalid or connector unhealthy' },
      ])
    );
    // Results flattened + sorted by relevance desc.
    expect(res.documents.map(d => d.title)).toEqual(['Protocol v3', 'Old draft']);
    expect(res.documents[0].url).toBe('https://drive/1');
  });

  it('flags unknown requested connectors and short-circuits when none are usable', async () => {
    const deps = makeDeps();
    const res = await searchConnectedRepositories(42, { query: 'x', connectors: ['box', 'nope'] }, deps);

    expect(deps.searchConnectors).not.toHaveBeenCalled();
    expect(res.documents).toEqual([]);
    expect(res.note).toMatch(/connect a data source/i);
    expect(res.skipped).toEqual(
      expect.arrayContaining([
        { connector: 'box', reason: 'not connected for this organization' },
        { connector: 'nope', reason: 'unknown connector' },
      ])
    );
  });

  it('surfaces per-connector errors as skipped and clamps the limit', async () => {
    const deps = makeDeps({
      getConnectorCatalog: vi.fn().mockResolvedValue([
        { id: 'google-drive', configured: true, healthy: true },
        { id: 'onedrive', configured: true, healthy: true },
      ]),
      searchConnectors: vi.fn().mockResolvedValue([
        { connectorId: 'google-drive', results: [{ id: '1', sourceConnector: 'google-drive', title: 'Doc', summary: 's', relevanceScore: 1, metadata: {} }] },
        { connectorId: 'onedrive', results: [], error: 'token expired' },
      ]),
    });
    const res = await searchConnectedRepositories(7, { query: 'x', limit: 999 }, deps);

    expect(deps.searchConnectors).toHaveBeenCalledWith(7, ['google-drive', 'onedrive'], {
      keywords: ['x'],
      limit: 25, // clamped
    });
    expect(res.resultCount).toBe(1);
    expect(res.skipped).toEqual([{ connector: 'onedrive', reason: 'token expired' }]);
  });
});
