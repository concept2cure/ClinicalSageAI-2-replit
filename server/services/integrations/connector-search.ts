/**
 * Connected-repository search for AnA.
 *
 * Thin orchestration over the existing data-connector framework
 * (server/services/connectors): resolves the org's connected document
 * repositories (Google Drive, Box, OneDrive, SharePoint, Veeva Vault), fans a
 * keyword search across them through their stored, encrypted, per-org
 * credentials, and returns flat, citeable results. Lets AnA pull source
 * documents from the client's own connected systems instead of only the
 * project corpus.
 *
 * Repositories only (AnA Summary S2, 2026-10-08). With `connectors` omitted it
 * used to search every catalog entry, and the credential-free public sources
 * (PubMed, ClinicalTrials.gov, Drugs@FDA, EMA, …) count as configured, so a
 * client's query left for public APIs whatever the tenant's
 * `publicSourceEgress` said. A public source is now refused, asked for or
 * not; AnA reaches those through search_literature and the agency lookups.
 *
 * Registry calls are injected (deps) so the orchestration is unit-testable
 * without a database or live connectors.
 *
 * @module server/services/integrations/connector-search
 */

import {
  canonicalConnectorId,
  isRepositoryConnector,
  REPOSITORY_CONNECTOR_IDS,
  type ConnectorResult,
} from '../connectors/connector-interface.js';
import {
  getConnectorCatalog as realGetConnectorCatalog,
  searchConnectors as realSearchConnectors,
} from '../connectors/connector-registry.js';

const DEFAULT_LIMIT = 8;
const MAX_LIMIT = 25;

export interface ConnectorSearchParams {
  query: string;
  /**
   * Restrict to these repositories (e.g. ['google_drive']; 'google-drive' names
   * the same one). Default: every repository connected for the organisation.
   * A public source is refused either way.
   */
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

const NOT_CONNECTED = 'not connected for this organization';
const UNHEALTHY = 'credentials invalid or connector unhealthy';

/** Why a catalog entry that is not one of the repositories is not searched. */
const NOT_A_REPOSITORY =
  "not one of the organisation's document repositories, so this tool never sends it a query; " +
  'for public sources use search_literature or the agency lookups';

type Skipped = Array<{ connector: string; reason: string }>;

/**
 * Which requested connectors to search; the rest go to `skipped` with why.
 * Ids are matched in their canonical spelling, and reported in the registry's.
 */
function partitionRequested(
  requested: string[],
  byCanonicalId: Map<string, CatalogEntry>,
  skipped: Skipped,
): CatalogEntry[] {
  const toSearch: CatalogEntry[] = [];
  const seen = new Set<string>();
  for (const asked of requested) {
    const canonical = canonicalConnectorId(asked);
    if (seen.has(canonical)) continue;
    seen.add(canonical);
    const entry = byCanonicalId.get(canonical);
    if (!entry) {
      skipped.push({ connector: asked, reason: 'unknown connector' });
    } else if (entry.available === false) {
      skipped.push({ connector: entry.id, reason: 'no search is connected for this source on the platform' });
    } else if (!isRepositoryConnector(entry.id)) {
      skipped.push({ connector: entry.id, reason: NOT_A_REPOSITORY });
    } else if (!entry.configured) {
      skipped.push({ connector: entry.id, reason: NOT_CONNECTED });
    } else if (!entry.healthy) {
      skipped.push({ connector: entry.id, reason: UNHEALTHY });
    } else {
      toSearch.push(entry);
    }
  }
  return toSearch;
}

/**
 * What AnA tells the user about the systems it could not search. A repository
 * asked for by name and not connected gets its own sentence ("Google Drive is
 * not connected for your organisation."); a refused public source names the
 * tools that search public sources.
 */
function noteFor(
  explicit: boolean,
  searchedAny: boolean,
  skipped: Skipped,
  byCanonicalId: Map<string, CatalogEntry>,
): string | undefined {
  const sentences: string[] = [];
  if (explicit) {
    for (const s of skipped) {
      if (s.reason !== NOT_CONNECTED) continue;
      const name = byCanonicalId.get(canonicalConnectorId(s.connector))?.name || s.connector;
      sentences.push(`${name} is not connected for your organisation.`);
    }
  }
  if (skipped.some((s) => s.reason === NOT_A_REPOSITORY)) {
    sentences.push(
      `This tool searches only the organisation's own document repositories (${REPOSITORY_CONNECTOR_IDS.join(', ')}). ` +
        'For public sources use search_literature or the agency lookups.',
    );
  }
  if (!searchedAny) {
    // Nothing was searched. Unless the only refusals were public sources (whose
    // sentence above says where to go), the remedy is connecting a repository.
    const repositoryMissing = !explicit || skipped.some((s) => s.reason === NOT_CONNECTED || s.reason === UNHEALTHY);
    if (!explicit) sentences.push('No document repository is connected for your organisation.');
    if (repositoryMissing || sentences.length === 0) {
      sentences.push('Ask the user to connect a data source (e.g. Google Drive) in Settings → Connectors.');
    }
  }
  return sentences.length > 0 ? sentences.join(' ') : undefined;
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
  const skipped: Skipped = [];

  const catalog = await deps.getConnectorCatalog(organizationId);
  const byCanonicalId = new Map(catalog.map(c => [canonicalConnectorId(c.id), c]));

  // The requested connectors, or every repository in the catalog. Never the
  // whole catalog: that is where the public sources are.
  const explicit = !!params.connectors?.length;
  const requested = explicit
    ? (params.connectors as string[])
    : catalog.filter(c => isRepositoryConnector(c.id)).map(c => c.id);

  const toSearch = partitionRequested(requested, byCanonicalId, skipped).map(c => c.id);
  const note = noteFor(explicit, toSearch.length > 0, skipped, byCanonicalId);

  if (toSearch.length === 0) {
    return {
      source: 'Connected Repositories',
      searched: [],
      skipped,
      resultCount: 0,
      documents: [],
      ...(note ? { note } : {}),
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
    ...(note ? { note } : {}),
  };
}
