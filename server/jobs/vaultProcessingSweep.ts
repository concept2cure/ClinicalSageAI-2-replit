/**
 * The Vault's processing sweep: it reads the text of every version the upload
 * request left pending (MR-08 Stage 3 step 5,
 * docs/work-orders/MR-08-vault-upload-safety-and-document-control.md).
 *
 * Ingest reads a text layer only (`vault-inline-extraction.ts`). A scanned PDF,
 * an image, a file over the request's size or one that took too long is
 * recorded `extraction_pending`, and this sweep reads it:
 *
 *   - Every 15 s, and at once when an ingest in this process leaves something
 *     pending. Organisations are listed in the system scope, and each one's
 *     pending documents are read in that organisation's own tenant scope, so
 *     row security filters every Vault query.
 *   - Each document is claimed with a session advisory lock on a client held
 *     for the work, and re-read under it. Two processes cannot read one
 *     document twice, and a process that dies releases its claim.
 *   - The bytes are read through the one verified reader, so a stored file
 *     that does not match its recorded hash is never read as the version.
 *   - The text is read with OCR, within the platform's one automatic OCR
 *     budget, inside a conversion slot.
 *   - The text, the catalog outcome and a chained `vault.document.extracted`
 *     audit row are written in one transaction. The passages are then indexed
 *     through the one chunking path ingest uses.
 *   - A file that cannot be read is recorded `extraction_failed` with the
 *     reason, so it is never left pending forever and never read as empty.
 */
import { createScopedLogger } from '../utils/logger.js';
import { pool } from '../db.js';
import { runWithSystemTenantScope, runWithTenantScope } from '../db/tenantStore.js';

const logger = createScopedLogger('vault-processing-sweep');
const CALLER = 'vault-processing-sweep';
export const VAULT_PROCESSING_INTERVAL_MS = 15_000;
/** Documents read per organisation per run; the rest wait for the next run. */
const PER_ORGANIZATION_LIMIT = 10;

export interface VaultProcessingReport {
  organizations: number;
  examined: number;
  extracted: number;
  failed: number;
  /** Claimed by another process, already read, or no conversion slot free: still pending, or done elsewhere. */
  skipped: number;
}

type Outcome = 'extracted' | 'failed' | 'skipped';

let timer: NodeJS.Timeout | null = null;
let running = false;
let again = false;
let lastRun: { at: Date; report: VaultProcessingReport } | null = null;

function disabled(): boolean {
  return process.env.NODE_ENV === 'test' || process.env.VAULT_PROCESSING_SWEEP_DISABLED === 'true';
}

interface PendingRow {
  id: string; program_id: string; content_hash: string; mime_type: string | null; file_name: string | null;
  storage_version_id: string | null; s3_key: string | null; storage_provider: string | null; page_count: number | null;
}

/** Read one pending version's text, with OCR; record, audit and index it. Claimed by advisory lock. */
async function processDocument(organizationId: number, documentId: string): Promise<Outcome> {
  const client = await pool.connect();
  let claimed = false;
  try {
    claimed = (await client.query(
      `SELECT pg_try_advisory_lock(hashtextextended('vault-extract:' || $1, 0)) AS claimed`, [documentId],
    )).rows[0]?.claimed === true;
    if (!claimed) return 'skipped';
    // Re-read through the scoped pool: the held client applies the tenant scope
    // only inside a transaction, and the claim is all it holds between them.
    const { rows } = await pool.query<PendingRow>(
      `SELECT d.id::text AS id, d.program_id::text AS program_id, d.content_hash, d.mime_type, d.file_name,
              d.storage_version_id, d.s3_key, d.storage_provider, d.page_count
         FROM vault.documents d JOIN vault.document_catalog c ON c.document_id = d.id
        WHERE d.id = $1::uuid AND c.catalog_status = 'extraction_pending' AND d.deleted_at IS NULL`,
      [documentId],
    );
    if (!rows.length) return 'skipped'; // read by another process since it was listed
    return await readAndRecord(client, organizationId, rows[0]);
  } finally {
    if (claimed) await client.query(`SELECT pg_advisory_unlock(hashtextextended('vault-extract:' || $1, 0))`, [documentId]).catch(() => undefined);
    client.release();
  }
}

/** A pending version's read: its text, or why its stored file could not be read. */
type PendingRead = { error: string } | { extracted: import('../services/ocr/index.js').ExtractedDocumentText };

async function extractFrom(organizationId: number, doc: PendingRow): Promise<PendingRead> {
  const { readVerifiedVaultBytes } = await import('../routes/c2c/project-vault.js');
  const read = await readVerifiedVaultBytes({
    storageVersionId: doc.storage_version_id, storageKey: doc.s3_key, storageProvider: doc.storage_provider, organizationId,
  }, doc.content_hash, doc.id);
  if (!read.ok) return { error: read.message ?? 'The stored file could not be read.' };
  const [{ extractDocumentText, AUTOMATIC_PDF_OCR_BUDGET }, { withConversionSlot }] = await Promise.all([
    import('../services/ocr/index.js'), import('../services/conversion-slots.js'),
  ]);
  const extracted = await withConversionSlot('vault-ocr', () =>
    extractDocumentText(read.bytes, doc.mime_type ?? undefined, doc.file_name ?? '', { pdfOcrBudget: AUTOMATIC_PDF_OCR_BUDGET }));
  return { extracted };
}

/** What a read comes to: the text to store (none when empty), the catalog outcome, and the page count. */
function outcomeOf(
  read: PendingRead,
  doc: PendingRow,
  build: typeof import('../services/vault/document-catalog.service.js').buildExtractionOutcome,
) {
  if ('error' in read) return { text: null, outcome: build({ text: null, method: 'none', error: read.error }), pageCount: doc.page_count };
  const { extracted } = read;
  return {
    text: extracted.text.trim() ? extracted.text : null,
    outcome: build({ text: extracted.text, method: extracted.method, confidence: extracted.confidence }),
    pageCount: extracted.coverage?.pageCount ?? doc.page_count,
  };
}

async function readAndRecord(client: import('pg').PoolClient, organizationId: number, doc: PendingRow): Promise<Outcome> {
  const { buildExtractionOutcome, recordExtractionOutcome } = await import('../services/vault/document-catalog.service.js');
  const { isConversionCapacityError } = await import('../services/conversion-slots.js');
  let read: PendingRead;
  try {
    read = await extractFrom(organizationId, doc);
  } catch (err) {
    if (isConversionCapacityError(err)) return 'skipped'; // still pending: the next run takes it
    throw err;
  }
  const { text, outcome, pageCount } = outcomeOf(read, doc, buildExtractionOutcome);
  const { writeChainedAuditRow } = await import('../services/auditService.js');
  await client.query('BEGIN');
  try {
    if (text) {
      await client.query(
        `UPDATE vault.documents SET extracted_text = $2, word_count = $3, page_count = COALESCE(page_count, $4), updated_at = NOW()
          WHERE id = $1::uuid`,
        [doc.id, text, text.trim().split(/\s+/).length, pageCount],
      );
    }
    await recordExtractionOutcome(client, { documentId: doc.id, contentHash: doc.content_hash, outcome, pageCount });
    await writeChainedAuditRow(client, {
      tenantId: organizationId,
      action: 'vault.document.extracted',
      resourceType: 'vault_document',
      resourceId: doc.id,
      details: {
        programId: doc.program_id, contentHash: doc.content_hash, outcome: outcome.status, method: outcome.method,
        charCount: outcome.charCount, pageCount, error: outcome.error,
        ...('extracted' in read && read.extracted.coverage ? { coverage: read.extracted.coverage } : {}),
      },
    });
    await client.query('COMMIT');
  } catch (err) {
    await client.query('ROLLBACK').catch(() => undefined);
    throw err;
  }
  if (text && 'extracted' in read) {
    const { isVaultChunkingEnabled, chunkDocumentForIngest } = await import('../services/vault/document-chunking.service.js');
    await chunkDocumentForIngest(doc.id, organizationId, text, read.extracted.pageSpans, { embed: await isVaultChunkingEnabled(organizationId) });
  }
  return outcome.status === 'extracted' ? 'extracted' : 'failed';
}

async function processOrganization(organizationId: number, report: VaultProcessingReport): Promise<void> {
  const { rows } = await pool.query<{ id: string }>(
    `SELECT d.id::text AS id
       FROM vault.documents d
       JOIN vault.document_catalog c ON c.document_id = d.id
       JOIN public.regulatory_programs p ON p.id = d.program_id
      WHERE p.organization_id = $1 AND c.catalog_status = 'extraction_pending' AND d.deleted_at IS NULL
      ORDER BY d.created_at, d.id
      LIMIT $2`,
    [organizationId, PER_ORGANIZATION_LIMIT],
  );
  for (const { id } of rows) {
    report.examined += 1;
    try {
      report[await processDocument(organizationId, id)] += 1;
    } catch (err) {
      // Left pending: the next run tries again. Logged, never read as empty.
      report.skipped += 1;
      logger.error('vault processing: a document could not be processed', { documentId: id, err: err instanceof Error ? err.message : String(err) });
    }
  }
}

/**
 * One pass over every organisation the lifecycle lets background work touch.
 * Exported for tests and operators.
 *
 * The Vault's row security admits a program through the organisation's UUID,
 * so each organisation is read in its own full tenant scope, as the chunk
 * backfill reads it. No estate-wide read of the Vault is needed, or made: the
 * system scope lists organisations only. That is one indexed query per
 * organisation per run.
 */
export async function runVaultProcessingOnce(): Promise<VaultProcessingReport> {
  const report: VaultProcessingReport = { organizations: 0, examined: 0, extracted: 0, failed: 0, skipped: 0 };
  const organizations = await runWithSystemTenantScope(CALLER, async () => {
    const { rows } = await pool.query<{ id: number; uuid: string }>(
      `SELECT id, uuid::text AS uuid FROM public.organizations WHERE uuid IS NOT NULL ORDER BY id LIMIT 5000`,
    );
    const { filterTenantsForBackgroundWork } = await import('../services/tenant/tenant-lifecycle.js');
    const allowed = await filterTenantsForBackgroundWork(rows.map((r) => Number(r.id)));
    return rows.filter((r) => allowed.has(Number(r.id)));
  });
  for (const org of organizations) {
    report.organizations += 1;
    await runWithTenantScope(
      { tenantId: String(org.id), orgUuid: org.uuid, role: null, source: 'job', caller: CALLER },
      () => processOrganization(Number(org.id), report),
    );
  }
  return report;
}

async function tick(): Promise<void> {
  if (running) { again = true; return; }
  running = true;
  try {
    do {
      again = false;
      const report = await runVaultProcessingOnce();
      lastRun = { at: new Date(), report };
      if (report.examined) logger.info('vault processing sweep', { ...report });
    } while (again);
  } catch (err) {
    logger.error('vault processing sweep failed', { err: err instanceof Error ? err.message : String(err) });
  } finally {
    running = false;
  }
}

/** Start the sweep. Idempotent; a no-op in tests or when VAULT_PROCESSING_SWEEP_DISABLED is set. */
export function startVaultProcessingSweep(): boolean {
  if (timer) return false;
  if (disabled()) {
    logger.info('disabled', { controlledBy: 'VAULT_PROCESSING_SWEEP_DISABLED', test: process.env.NODE_ENV === 'test' });
    return false;
  }
  timer = setInterval(() => void tick(), VAULT_PROCESSING_INTERVAL_MS);
  timer.unref?.();
  logger.info('scheduled', { intervalMs: VAULT_PROCESSING_INTERVAL_MS });
  return true;
}

/** Run soon, because an ingest just left a version pending. Only where the sweep was started. */
export function nudgeVaultProcessing(): void {
  if (!timer) return;
  setTimeout(() => void tick(), 0);
}

export function stopVaultProcessingSweep(): void {
  if (timer) { clearInterval(timer); timer = null; }
}

/** Introspection for health surfaces. */
export function getVaultProcessingSweepStatus(): { running: boolean; lastRun: typeof lastRun } {
  return { running: timer != null, lastRun };
}
