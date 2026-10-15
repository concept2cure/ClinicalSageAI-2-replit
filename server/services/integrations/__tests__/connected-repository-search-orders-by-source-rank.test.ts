/**
 * Connected-repository search hands AnA each document's position in its own
 * repository's response (`sourceRank`) — never a relevance score — and merges
 * repositories by that position.
 *
 * It copied each connector's `relevanceScore` into the tool output and sorted
 * every repository's documents together by it. That number was the list
 * position on a per-connector slope (Google Drive 0.01 per place, Veeva Vault
 * 0.05), so the merged top-N favoured the connector with the shallowest slope,
 * and the model was handed a position labelled as a relevance.
 */
import { describe, expect, it, vi } from 'vitest';
import { searchConnectedRepositories, type ConnectorSearchDeps } from '../connector-search';

const doc = (connector: string, rank: number) => ({
  id: `${connector}-${rank}`,
  sourceConnector: connector,
  title: `${connector} #${rank}`,
  summary: 's',
  sourceRank: rank,
  metadata: {},
});

function deps(): ConnectorSearchDeps {
  return {
    getConnectorCatalog: vi.fn().mockResolvedValue([
      { id: 'google_drive', name: 'Google Drive', configured: true, healthy: true },
      { id: 'veeva_vault', name: 'Veeva Vault', configured: true, healthy: true },
    ]),
    searchConnectors: vi.fn().mockResolvedValue([
      { connectorId: 'google_drive', results: [doc('google_drive', 1), doc('google_drive', 2), doc('google_drive', 3)] },
      { connectorId: 'veeva_vault', results: [doc('veeva_vault', 1), doc('veeva_vault', 2)] },
    ]),
  } as unknown as ConnectorSearchDeps;
}

describe('searchConnectedRepositories: position in the source, not a relevance score', () => {
  it("each document carries its repository's position, and no relevance score", async () => {
    const res = await searchConnectedRepositories(1, { query: 'protocol' }, deps());
    for (const d of res.documents) {
      expect(d).not.toHaveProperty('relevanceScore');
      expect(typeof (d as unknown as { sourceRank?: unknown }).sourceRank).toBe('number');
    }
  });

  it("merges repositories by each one's own order, so no repository crowds out another", async () => {
    const res = await searchConnectedRepositories(1, { query: 'protocol', limit: 4 }, deps());
    expect(res.documents.map((d) => d.title)).toEqual([
      'google_drive #1',
      'veeva_vault #1',
      'google_drive #2',
      'veeva_vault #2',
    ]);
  });
});
