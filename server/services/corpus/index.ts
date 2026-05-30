/**
 * Trial corpus ingestion — public surface.
 *
 * Pieces:
 *   - normalizeCtgovStudy / normalizeCtgovStudies — pure CT.gov v2 → CSR mapping
 *   - ingestCtgov — IO-free orchestration (fetch → normalize → upsert)
 *   - LiveCtgovFetcher — production fetcher (CT.gov API v2)
 *   - DrizzleCorpusWriter — production writer (csr_reports + csr_details)
 *
 * The orchestrator depends only on the CtgovFetcher / CorpusWriter interfaces,
 * so it is unit-tested with fakes and runs against real services in production.
 */

export * from './ctgov-types';
export * from './ctgov-normalizer';
export * from './ingest-ctgov';
export { LiveCtgovFetcher } from './live-ctgov-fetcher';
export { DrizzleCorpusWriter } from './drizzle-corpus-writer';

import { ingestCtgov, type CtgovIngestQuery, type IngestSummary } from './ingest-ctgov';
import { LiveCtgovFetcher } from './live-ctgov-fetcher';
import { DrizzleCorpusWriter } from './drizzle-corpus-writer';

/**
 * Production convenience: ingest a CT.gov query into the corpus using the live
 * fetcher and the Drizzle writer. Returns an honest count summary.
 */
export async function ingestCtgovToCorpus(
  query: CtgovIngestQuery,
  organizationId?: number
): Promise<IngestSummary> {
  return ingestCtgov(query, {
    fetcher: new LiveCtgovFetcher(),
    writer: new DrizzleCorpusWriter(organizationId),
  });
}
