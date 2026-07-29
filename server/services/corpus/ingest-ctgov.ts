/**
 * ClinicalTrials.gov corpus ingestion.
 *
 * Orchestrates: fetch (injected) → normalize → idempotent upsert (injected).
 * The orchestration logic — dedupe, counting, per-record error isolation — is
 * separated from the IO so it can be unit-tested with fakes, while the default
 * wiring uses the live connector and a Drizzle-backed writer.
 *
 * Idempotency: studies are keyed by NCT id. Re-ingesting the same study updates
 * the existing report rather than creating a duplicate, so the pipeline can be
 * run repeatedly (snapshot + incremental) without polluting the corpus.
 */

import type { CtgovStudy } from './ctgov-types';
import {
  normalizeCtgovStudy,
  type NormalizedStudy,
} from './ctgov-normalizer';

export type NormalizedStudyWriteResult = 'inserted' | 'updated';

export interface IngestSummary {
  fetched: number;
  normalized: number;
  inserted: number;
  updated: number;
  skipped: number;
  errors: number;
  /** NCT ids that failed to write, with the error message, for diagnosis. */
  failures: Array<{ nctId: string | null; error: string }>;
}

/**
 * Persists normalized studies. Implementations decide insert-vs-update by NCT
 * id. Returns which path was taken so the orchestrator can count accurately.
 */
export interface CorpusWriter {
  upsert(study: NormalizedStudy): Promise<NormalizedStudyWriteResult>;
}

/** Fetches raw CT.gov studies for a query. Injected so tests avoid the network. */
export interface CtgovFetcher {
  fetchStudies(query: CtgovIngestQuery): Promise<CtgovStudy[]>;
}

export interface CtgovIngestQuery {
  indication?: string;
  intervention?: string;
  sponsor?: string;
  phase?: string;
  limit?: number;
}

/**
 * Run an ingestion pass. Each study is normalized and written independently;
 * one bad record never aborts the batch. The summary is exact and honest about
 * what was skipped (un-normalizable) versus what errored (write failure).
 */
export async function ingestCtgov(
  query: CtgovIngestQuery,
  deps: { fetcher: CtgovFetcher; writer: CorpusWriter }
): Promise<IngestSummary> {
  const summary: IngestSummary = {
    fetched: 0,
    normalized: 0,
    inserted: 0,
    updated: 0,
    skipped: 0,
    errors: 0,
    failures: [],
  };

  const studies = await deps.fetcher.fetchStudies(query);
  summary.fetched = studies.length;

  for (const raw of studies) {
    const normalized = normalizeCtgovStudy(raw);
    if (!normalized) {
      summary.skipped++;
      continue;
    }
    summary.normalized++;

    try {
      const result = await deps.writer.upsert(normalized);
      if (result === 'inserted') summary.inserted++;
      else summary.updated++;
    } catch (err) {
      summary.errors++;
      summary.failures.push({
        nctId: normalized.nctId,
        error: err instanceof Error ? err.message : String(err),
      });
    }
  }

  return summary;
}
