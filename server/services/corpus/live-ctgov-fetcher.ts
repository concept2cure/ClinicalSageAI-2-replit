/**
 * Default ClinicalTrials.gov fetcher — live API v2 wiring for the corpus
 * ingestion pipeline.
 *
 * This is the production implementation of CtgovFetcher. It returns raw
 * `CtgovStudy` objects (full protocolSection), which the normalizer then maps —
 * unlike the connector's `search()`, which returns trimmed ConnectorResults.
 * Network only; no parsing logic lives here so it stays thin and the mapping
 * stays unit-tested in the normalizer.
 */

import type { CtgovFetcher, CtgovIngestQuery } from './ingest-ctgov';
import type { CtgovStudy, CtgovStudiesResponse } from './ctgov-types';

const CTGOV_API = 'https://clinicaltrials.gov/api/v2';

function mapPhaseFilter(phase: string | undefined): string | null {
  if (!phase) return null;
  const m = phase.match(/([1-4])/);
  return m ? `PHASE${m[1]}` : null;
}

export class LiveCtgovFetcher implements CtgovFetcher {
  constructor(private readonly baseUrl: string = CTGOV_API) {}

  async fetchStudies(query: CtgovIngestQuery): Promise<CtgovStudy[]> {
    const params = new URLSearchParams({
      format: 'json',
      pageSize: String(Math.min(query.limit ?? 50, 1000)),
    });
    if (query.indication) params.set('query.cond', query.indication);
    if (query.intervention) params.set('query.intr', query.intervention);
    if (query.sponsor) params.set('query.spons', query.sponsor);
    const phaseEnum = mapPhaseFilter(query.phase);
    if (phaseEnum) params.set('filter.advanced', `AREA[Phase]${phaseEnum}`);

    const res = await fetch(`${this.baseUrl}/studies?${params.toString()}`, {
      headers: { Accept: 'application/json' },
      signal: AbortSignal.timeout(20000),
    });
    if (!res.ok) {
      throw new Error(`ClinicalTrials.gov returned ${res.status} ${res.statusText}`);
    }
    const data = (await res.json()) as CtgovStudiesResponse;
    return data.studies ?? [];
  }
}
