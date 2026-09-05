/**
 * Backfill the vault passage index for documents ingested before chunking.
 *
 * Chunking runs at ingest, so every document uploaded before the
 * `ana.vault_chunking` flag was flipped for a tenant sits outside passage
 * retrieval: its catalog row carries no `chunk_status`, which is the honest
 * "never attempted" state and exactly the set this sweep closes.
 *
 * One tenant per run, dry-run unless applied, and resumable: the candidate
 * query excludes anything already chunked, so a rerun picks up where the last
 * left off and a re-run after completion examines nothing.
 *
 * What it deliberately does NOT do:
 *   • invent coverage — a document whose extraction failed has no text to
 *     index and is reported as skipped with that reason, never counted as done;
 *   • hide failures — a document whose embedding or write fails is counted,
 *     named, and left with `chunk_failed` on its ledger, so the next run
 *     retries it rather than treating the corpus as complete;
 *   • cross a tenant — every statement reaches vault.documents through
 *     regulatory_programs.organization_id, the same join the writer uses.
 *
 * @module server/services/vault/document-chunking-backfill.service
 */

import { pool } from '../../db.js';
import { createScopedLogger } from '../../utils/logger.js';
import { chunkAndEmbedDocument, recordChunkOutcome } from './document-chunking.service.js';

const logger = createScopedLogger('document-chunking-backfill');

/** Minimal query surface, so a test can drive the sweep without a database. */
export interface Queryable {
  query<T = any>(text: string, values?: unknown[]): Promise<{ rows: T[]; rowCount: number | null }>;
}

export interface BackfillOptions {
  /** Write chunks. Omitted or false → report only, nothing is written. */
  apply?: boolean;
  /** Documents examined per run (default 50, max 500). */
  limit?: number;
  /** Also retry documents whose previous chunking attempt failed. */
  retryFailed?: boolean;
  exec?: Queryable;
}

export interface BackfillSkip {
  documentId: string;
  fileName: string | null;
  reason: string;
}

export interface BackfillReport {
  /** Candidates this run looked at (equal to the limit ⇒ more may remain). */
  examined: number;
  /** Documents whose passages are now indexed (0 on a dry run). */
  indexed: number;
  /** Chunks written across those documents (0 on a dry run). */
  chunksWritten: number;
  /** Documents with nothing indexable — each with the reason, never silent. */
  skipped: BackfillSkip[];
  /** Documents that were indexable but failed; their ledger says so. */
  failed: BackfillSkip[];
  /** True when nothing was written because this was a report-only run. */
  dryRun: boolean;
}

interface CandidateRow {
  id: string;
  file_name: string | null;
  extracted_text: string | null;
  catalog_status: string | null;
  chunk_status: string | null;
}

/**
 * Index the tenant's un-chunked vault documents, oldest first.
 *
 * Oldest first is deliberate: a tenant's backlog is worked in the order the
 * documents arrived, so a partial sweep leaves a comprehensible boundary
 * rather than a random scatter of indexed and unindexed files.
 */
export async function backfillVaultChunks(
  organizationId: number,
  opts: BackfillOptions = {},
): Promise<BackfillReport> {
  const exec = opts.exec ?? (pool as unknown as Queryable);
  const apply = opts.apply === true;
  const limit = Math.max(1, Math.min(opts.limit ?? 50, 500));

  /* Candidates: this org's live documents that have text and are not already
     indexed. `chunk_status IS NULL` is "never attempted"; 'chunk_failed' joins
     the set only when a retry is asked for, so an ordinary rerun does not
     re-burn embedding spend on documents that already failed for a stated
     reason. The predicate is what makes the sweep resumable — anything
     indexed drops out of the candidate set on the next run. */
  const statusFilter = opts.retryFailed
    ? `(c.chunk_status IS NULL OR c.chunk_status = 'chunk_failed')`
    : `c.chunk_status IS NULL`;

  const { rows: candidates } = await exec.query<CandidateRow>(
    `SELECT d.id, d.file_name, d.extracted_text, c.catalog_status, c.chunk_status
       FROM vault.documents d
       JOIN regulatory_programs p ON p.id = d.program_id
       LEFT JOIN vault.document_catalog c ON c.document_id = d.id
      WHERE p.organization_id = $1
        AND d.deleted_at IS NULL
        AND ${statusFilter}
      ORDER BY d.created_at ASC
      LIMIT $2`,
    [organizationId, limit],
  );

  const report: BackfillReport = {
    examined: candidates.length,
    indexed: 0,
    chunksWritten: 0,
    skipped: [],
    failed: [],
    dryRun: !apply,
  };

  for (const doc of candidates) {
    const text = (doc.extracted_text ?? '').trim();
    if (text.length === 0) {
      /* No text is not a chunking failure — it is an EXTRACTION outcome, and
         the catalog already records it (or records nothing, for a document
         that predates the catalog entirely). Saying so here keeps the two
         apart: re-running the sweep will never make this document indexable,
         only re-ingesting it will. */
      report.skipped.push({
        documentId: doc.id,
        fileName: doc.file_name,
        reason:
          doc.catalog_status === 'extraction_failed'
            ? 'Extraction failed for this document; there is no text to index. Re-ingest it.'
            : 'No extracted text is stored for this document. Re-ingest it to extract and index.',
      });
      continue;
    }

    if (!apply) {
      // A dry run reports what WOULD be indexed and writes nothing — no
      // embedding spend, no rows.
      report.indexed += 0;
      continue;
    }

    const result = await chunkAndEmbedDocument({ documentId: doc.id, organizationId, text });
    await recordChunkOutcome({ documentId: doc.id, organizationId, result });
    if (result.ok) {
      report.indexed += 1;
      report.chunksWritten += result.chunkCount;
    } else {
      report.failed.push({
        documentId: doc.id,
        fileName: doc.file_name,
        reason: result.error ?? 'chunking failed',
      });
    }
  }

  logger.info('Vault chunk backfill run complete', {
    organizationId,
    examined: report.examined,
    indexed: report.indexed,
    skipped: report.skipped.length,
    failed: report.failed.length,
    dryRun: report.dryRun,
  });
  return report;
}
