/**
 * Connected-repository search for AnA.
 *
 * Thin orchestration over the existing data-connector framework
 * (server/services/connectors): resolves the org's configured connectors
 * (Google Drive, Box, OneDrive, SharePoint, Veeva Vault, …), fans a keyword
 * search across them through their stored, encrypted, per-org credentials, and
 * returns flat, citeable results. Lets AnA pull source documents from the
 * client's own connected systems instead of only the project corpus.
 *
 * Registry calls are injected (deps) so the orchestration is unit-testable
 * without a database or live connectors.
 *
 * @module server/services/integrations/connector-search
 */

import type { ConnectorResult } from '../connectors/connector-interface.js';
import {
  getConnectorCatalog as realGetConnectorCatalog,
  searchConnectors as realSearchConnectors,
} from '../connectors/connector-registry.js';

const DEFAULT_LIMIT = 8;
const MAX_LIMIT = 25;

export interface ConnectorSearchParams {
  query: string;
  /** Restrict to specific connector ids (e.g. ['google-drive']); default: all configured. */
  connectors?: string[];
  limit?: number;
}

interface CatalogEntry {
  id: string;
  name?: string;
  configured: boolean;
  healthy: boolean;
  /** false: nothing searches this connector on the platform (connector-interface.ts). */
  available?: false;
}

export interface ConnectorSearchDeps {
  getConnectorCatalog: (orgId: number) => Promise<CatalogEntry[]>;
  searchConnectors: (
    orgId: number,
    connectorIds: string[],
    query: { keywords?: string[]; limit?: number }
  ) => Promise<{ connectorId: string; results: ConnectorResult[]; error?: string }[]>;
}

export interface ConnectorSearchResponse {
  source: 'Connected Repositories';
  searched: string[];
  skipped: Array<{ connector: string; reason: string }>;
  resultCount: number;
  documents: Array<{
    connector: string;
    title: string;
    summary: string;
    url?: string;
    relevanceScore: number;
  }>;
  note?: string;
}

const defaultDeps: ConnectorSearchDeps = {
  getConnectorCatalog: realGetConnectorCatalog as unknown as ConnectorSearchDeps['getConnectorCatalog'],
  searchConnectors: realSearchConnectors as unknown as ConnectorSearchDeps['searchConnectors'],
};

/**
 * Which requested connectors to search; the rest go to `skipped` with why.
 */
function partitionRequested(
  requested: string[],
  byId: Map<string, CatalogEntry>,
  skipped: Array<{ connector: string; reason: string }>,
): string[] {
  const toSearch: string[] = [];
  for (const id of requested) {
    const entry = byId.get(id);
    if (!entry) {
      skipped.push({ connector: id, reason: 'unknown connector' });
    } else if (entry.available === false) {
      skipped.push({ connector: id, reason: 'no search is connected for this source on the platform' });
    } else if (!entry.configured) {
      skipped.push({ connector: id, reason: 'not connected for this organization' });
    } else if (!entry.healthy) {
      skipped.push({ connector: id, reason: 'credentials invalid or connector unhealthy' });
    } else {
      toSearch.push(id);
    }
  }
  return toSearch;
}

/**
 * Search the organization's connected repositories. Never throws — connector or
 * credential problems are reported in `skipped` so AnA can tell the user which
 * systems need connecting.
 */
export async function searchConnectedRepositories(
  organizationId: number,
  params: ConnectorSearchParams,
  deps: ConnectorSearchDeps = defaultDeps
): Promise<ConnectorSearchResponse> {
  const limit = Math.min(Math.max(Math.trunc(params.limit ?? DEFAULT_LIMIT), 1), MAX_LIMIT);
  const skipped: Array<{ connector: string; reason: string }> = [];

  const catalog = await deps.getConnectorCatalog(organizationId);
  const byId = new Map(catalog.map(c => [c.id, c]));

  // Resolve the requested connectors (or all in the catalog).
  const requested = params.connectors?.length
    ? params.connectors
    : catalog.map(c => c.id);

  const toSearch = partitionRequested(requested, byId, skipped);

  if (toSearch.length === 0) {
    return {
      source: 'Connected Repositories',
      searched: [],
      skipped,
      resultCount: 0,
      documents: [],
      note: 'No connected repositories are available. Ask the user to connect a data source (e.g. Google Drive) in Settings → Connectors.',
    };
  }

  const perConnector = await deps.searchConnectors(organizationId, toSearch, {
    keywords: [params.query],
    limit,
  });

  const documents: ConnectorSearchResponse['documents'] = [];
  const failed = new Set<string>();
  for (const c of perConnector) {
    if (c.error) {
      // A failed search is not a search that found nothing: it is reported
      // as skipped, and not listed in `searched`.
      skipped.push({ connector: c.connectorId, reason: c.error });
      failed.add(c.connectorId);
      continue;
    }
    for (const r of c.results) {
      documents.push({
        connector: r.sourceConnector || c.connectorId,
        title: r.title,
        summary: r.summary,
        url: r.url,
        relevanceScore: typeof r.relevanceScore === 'number' ? r.relevanceScore : 0,
      });
    }
  }

  documents.sort((a, b) => b.relevanceScore - a.relevanceScore);
  const top = documents.slice(0, limit);

  return {
    source: 'Connected Repositories',
    searched: toSearch.filter((id) => !failed.has(id)),
    skipped,
    resultCount: top.length,
    documents: top,
  };
}
