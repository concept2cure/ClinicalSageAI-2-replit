/**
 * Nightly audit-log archive job.
 *
 * Moves rows older than the hot retention window (default 24 months) out of
 * `audit_logs` into a cold-storage archive, then deletes them from the hot
 * table. Per `docs/operations/audit-log-retention-policy.md`.
 *
 * Design contract:
 *   1. Read a batch of rows past the cutoff, ordered by created_at ASC.
 *   2. Compute SHA-256 over the batch (canonical JSON).
 *   3. Hand the batch + checksum to the archive sink (S3 in prod; filesystem
 *      in dev; in-memory in tests).
 *   4. Verify the sink wrote successfully (sink returns the stored checksum).
 *   5. Only then remove the batch from `audit_logs` — through the database's
 *      one DELETE door, `public.audit_logs_archive_delete(ids, locator,
 *      sha256, cutoff)` (db/migrations/20260617_audit_logs_immutability.sql).
 *      The door is a SECURITY DEFINER function owned by a NOLOGIN role; the
 *      BEFORE DELETE trigger admits nothing else. It records the batch in
 *      `public.audit_log_archives` (the deletion's own audit record) and
 *      refuses — the whole batch, atomically — a row newer than the cutoff,
 *      a cutoff inside the 24-month hot window, an empty or malformed
 *      locator/checksum, or a row that is no longer present.
 *
 * Failures abort the batch — the rows stay in the hot table. A refusal by the
 * door is counted in `deleteRefusals` and reported in `errors`; it is never
 * swallowed. The job is idempotent: re-running picks up where it left off
 * because the cutoff is a date, not a watermark.
 *
 * History: until 2026-09-25 this file opened the trigger with
 * `SET LOCAL app.audit_archive_bypass = 'on'`. Any session can set a custom
 * GUC, so the runtime role could delete audit rows at will (security audit
 * 2026-09-24, DP-04; plan P0-8a). The GUC is no longer read by anything.
 *
 * Tenant safety: the archive preserves `tenant_id` on every row so
 * downstream queries against the cold archive can still filter by org.
 */

import crypto from 'crypto';
import { promises as fs } from 'fs';
import path from 'path';
import type { Pool, PoolClient } from 'pg';
import { stableStringify } from '../../../shared/canonical-json.js';
import {
  S3Client,
  PutObjectCommand,
  GetObjectCommand,
  HeadObjectCommand,
  type S3ClientConfig,
} from '@aws-sdk/client-s3';

export interface ArchiveSink {
  /**
   * Persist a batch and return the checksum the sink stored. The caller
   * compares it against the locally-computed checksum and aborts on mismatch.
   */
  writeBatch(args: {
    batchId: string;
    rows: Array<Record<string, unknown>>;
    sha256: string;
  }): Promise<{ storedSha256: string; locator: string }>;
}

export interface ArchiveOptions {
  /** Rows older than this date move to cold storage. Default: now - 24mo. */
  olderThan?: Date;
  /** Max rows per batch. Larger batches reduce overhead but raise memory. */
  batchSize?: number;
  /** Stop after N batches. Useful for nightly time-boxing. Default: unlimited. */
  maxBatches?: number;
  /** Where the archive lands. Required. */
  sink: ArchiveSink;
}

export interface ArchiveRunResult {
  rowsArchived: number;
  batches: number;
  /**
   * Batches the database's archive door refused after the sink had already
   * stored them. Their rows remain in the hot table; the cold copy is inert.
   * Each refusal also appears in `errors`.
   */
  deleteRefusals: number;
  startedAt: string;
  finishedAt: string;
  cutoff: string;
  errors: string[];
}

const DEFAULT_BATCH_SIZE = 1_000;
/**
 * Default cutoff: the hot window of docs/operations/audit-log-retention-policy.md
 * is 24 months, and the archive door refuses any cutoff later than
 * `now() - interval '24 months'`. 24 calendar months is at most 731 days, so a
 * 731-day default can never fall inside the floor; the previous 720-day
 * approximation could, and the door would have refused every default run.
 */
const DEFAULT_HOT_WINDOW_MS = 731 * 24 * 60 * 60 * 1000;

/**
 * The one statement that removes rows from audit_logs. Kept as a single
 * literal because the PGlite contract test reads it from this source
 * (server/services/audit/__tests__/audit-archive-delete-door.pglite.integration.test.ts).
 */
const ARCHIVE_DELETE_SQL = `SELECT public.audit_logs_archive_delete($1::uuid[], $2, $3, $4::timestamptz) AS deleted`;

export async function runAuditArchive(
  client: Pool | PoolClient,
  opts: ArchiveOptions,
): Promise<ArchiveRunResult> {
  const cutoff = opts.olderThan ?? new Date(Date.now() - DEFAULT_HOT_WINDOW_MS);
  const batchSize = opts.batchSize ?? DEFAULT_BATCH_SIZE;
  const maxBatches = opts.maxBatches ?? Infinity;

  const result: ArchiveRunResult = {
    rowsArchived: 0,
    batches: 0,
    deleteRefusals: 0,
    startedAt: new Date().toISOString(),
    finishedAt: '',
    cutoff: cutoff.toISOString(),
    errors: [],
  };

  while (result.batches < maxBatches) {
    const { rows } = await client.query<Record<string, unknown>>(
      `SELECT * FROM audit_logs
       WHERE created_at < $1::timestamptz
       ORDER BY created_at ASC
       LIMIT $2`,
      [cutoff, batchSize],
    );

    if (rows.length === 0) break;

    const batchId = crypto.randomUUID();
    const sha256 = computeBatchHash(rows);

    let stored: { storedSha256: string; locator: string };
    try {
      stored = await opts.sink.writeBatch({ batchId, rows, sha256 });
    } catch (err) {
      result.errors.push(
        `Sink write failed (batch ${batchId}): ${
          err instanceof Error ? err.message : 'unknown'
        }`,
      );
      break;
    }

    if (stored.storedSha256 !== sha256) {
      result.errors.push(
        `Checksum mismatch (batch ${batchId}): sink stored ${stored.storedSha256}, expected ${sha256}. Aborting; rows remain in hot table.`,
      );
      break;
    }

    // Only after the sink confirms the bytes landed do we remove the batch from
    // hot — and only through the database's archive door.
    //
    // audit_logs has a BEFORE DELETE immutability trigger
    // (db/migrations/20260617_audit_logs_immutability.sql) that aborts every
    // DELETE except one issued from inside public.audit_logs_archive_delete(),
    // a SECURITY DEFINER function owned by the NOLOGIN role audit_archiver. We
    // hand it the ids, the sink's locator, the checksum the sink stored (equal
    // to ours — checked above) and the cutoff. It re-checks every row against
    // the cutoff and the retention floor, writes the archive record, deletes
    // exactly those rows and returns the count, all in one statement and so in
    // one transaction: there is nothing to BEGIN, SET or COMMIT on our side.
    //
    // Because it is a single statement, it needs no dedicated connection: on a
    // Pool it runs on whichever connection the pool hands out, on a caller-owned
    // PoolClient it runs on that connection, and nothing is checked out or
    // released here. (The former SET LOCAL bypass needed one connection for
    // BEGIN / SET LOCAL / DELETE / COMMIT; that requirement went with it.)
    //
    // `audit_logs.id` is uuid (migrations/0000_sweet_joseph.sql, shared/schema.ts),
    // hence the ::uuid[] cast — an earlier ::int[] made every batch fail with a
    // type error and archival silently became "archive and retain forever".
    const ids = rows.map(r => String((r as { id: unknown }).id));
    let deleted: number;
    try {
      const res = await client.query<{ deleted: number | string }>(ARCHIVE_DELETE_SQL, [
        ids,
        stored.locator,
        stored.storedSha256,
        cutoff,
      ]);
      deleted = Number(res.rows[0]?.deleted);
    } catch (err) {
      // The door refused (AUDIT_ARCHIVE_REFUSED / IMMUTABILITY_VIOLATION) or the
      // statement failed. Either way nothing was deleted: the door is atomic.
      result.deleteRefusals += 1;
      result.errors.push(
        `Archive delete refused (batch ${batchId}, ${ids.length} rows, locator ${stored.locator}): ${
          err instanceof Error ? err.message : 'unknown'
        }. Rows remain in hot table (already safely archived to cold).`,
      );
      break;
    }

    if (deleted !== ids.length) {
      // The door raises on a count mismatch, so this is reachable only through a
      // stand-in client; report it the same way rather than trust the count.
      result.deleteRefusals += 1;
      result.errors.push(
        `Archive delete returned ${deleted} for a batch of ${ids.length} (batch ${batchId}, locator ${stored.locator}). Aborting; treat the batch as not archived.`,
      );
      break;
    }

    result.rowsArchived += rows.length;
    result.batches += 1;

    // Stop if we drained below the batch size — no more rows past cutoff.
    if (rows.length < batchSize) break;
  }

  result.finishedAt = new Date().toISOString();
  return result;
}

export function computeBatchHash(rows: Array<Record<string, unknown>>): string {
  // Canonical JSON: sort keys, no whitespace. Same scheme as the attestation
  // signature so any external verifier needs only one canonicalizer.
  const canon = '[' + rows.map(canonicalJSON).join(',') + ']';
  return crypto.createHash('sha256').update(canon).digest('hex');
}

/**
 * Canonical form for the batch checksum. The sink echoes back what it stored
 * and the caller compares within the same call, so both sides move together —
 * no stored digest is recomputed against (see the migration note).
 */
function canonicalJSON(value: unknown): string {
  return stableStringify(value);
}

// ─── Filesystem sink (dev/CI; production overrides with S3) ────────────────

export class FilesystemArchiveSink implements ArchiveSink {
  constructor(private dir: string) {}

  async writeBatch(args: {
    batchId: string;
    rows: Array<Record<string, unknown>>;
    sha256: string;
  }): Promise<{ storedSha256: string; locator: string }> {
    await fs.mkdir(this.dir, { recursive: true });
    const filePath = path.join(this.dir, `${args.batchId}.json`);
    const body = JSON.stringify({
      batchId: args.batchId,
      sha256: args.sha256,
      writtenAt: new Date().toISOString(),
      rows: args.rows,
    });
    await fs.writeFile(filePath, body, 'utf8');
    // Re-read + re-hash so the verification step is end-to-end, not just
    // "trust this in-memory variable".
    const reread = await fs.readFile(filePath, 'utf8');
    const parsed = JSON.parse(reread);
    const storedSha256 = computeBatchHash(parsed.rows);
    return { storedSha256, locator: filePath };
  }
}

// ─── S3 sink (production) ──────────────────────────────────────────────────

export interface S3ArchiveSinkConfig {
  /** S3 bucket name. The bucket should live in a separate AWS account
   *  with a one-way trust per the retention policy. */
  bucket: string;
  /** Prefix inside the bucket. Date-partitioned per write to ease lifecycle. */
  prefix?: string;
  /** AWS region. Default: process.env.AWS_REGION. */
  region?: string;
  /** Storage class. Default: STANDARD_IA for hot archive, set
   *  GLACIER_DEEP_ARCHIVE for the long-term tier. */
  storageClass?: 'STANDARD' | 'STANDARD_IA' | 'GLACIER' | 'DEEP_ARCHIVE';
  /** SSE config — pass 'aws:kms' + key id for KMS, or 'AES256' for SSE-S3. */
  serverSideEncryption?: 'AES256' | 'aws:kms';
  sseKmsKeyId?: string;
  /** Optional client overrides (test injection). */
  clientConfig?: S3ClientConfig;
}

export class S3ArchiveSink implements ArchiveSink {
  private client: S3Client;
  private bucket: string;
  private prefix: string;
  private storageClass: 'STANDARD' | 'STANDARD_IA' | 'GLACIER' | 'DEEP_ARCHIVE';
  private sse?: 'AES256' | 'aws:kms';
  private sseKmsKeyId?: string;

  constructor(cfg: S3ArchiveSinkConfig) {
    this.client = new S3Client({
      region: cfg.region ?? process.env.AWS_REGION,
      ...cfg.clientConfig,
    });
    this.bucket = cfg.bucket;
    this.prefix = (cfg.prefix ?? 'audit-archive').replace(/\/+$/, '');
    this.storageClass = cfg.storageClass ?? 'STANDARD_IA';
    this.sse = cfg.serverSideEncryption;
    this.sseKmsKeyId = cfg.sseKmsKeyId;
  }

  async writeBatch(args: {
    batchId: string;
    rows: Array<Record<string, unknown>>;
    sha256: string;
  }): Promise<{ storedSha256: string; locator: string }> {
    // Date-partitioned key: 2026/05/01/<batchId>.json. Makes lifecycle
    // rules trivial (transition to Glacier after N days; expire never).
    const ts = new Date();
    const yyyy = ts.getUTCFullYear();
    const mm = String(ts.getUTCMonth() + 1).padStart(2, '0');
    const dd = String(ts.getUTCDate()).padStart(2, '0');
    const key = `${this.prefix}/${yyyy}/${mm}/${dd}/${args.batchId}.json`;

    const body = JSON.stringify({
      batchId: args.batchId,
      sha256: args.sha256,
      writtenAt: new Date().toISOString(),
      rows: args.rows,
    });

    // Use S3's ContentMD5 + ChecksumSHA256 so the upload itself is
    // verified end-to-end. Mismatch causes PutObject to throw.
    const checksumSHA256 = sha256OfStringBase64(body);

    const put = new PutObjectCommand({
      Bucket: this.bucket,
      Key: key,
      Body: body,
      ContentType: 'application/json',
      StorageClass: this.storageClass,
      ChecksumSHA256: checksumSHA256,
      Metadata: {
        'batch-id': args.batchId,
        'rows-sha256': args.sha256,
        'row-count': String(args.rows.length),
      },
      ...(this.sse ? { ServerSideEncryption: this.sse } : {}),
      ...(this.sseKmsKeyId ? { SSEKMSKeyId: this.sseKmsKeyId } : {}),
    });
    await this.client.send(put);

    // Re-read the object and re-compute the rows hash. This is the
    // production analog of the filesystem sink's re-read check —
    // confirms the bytes that landed at S3 are the bytes we sent.
    const get = new GetObjectCommand({ Bucket: this.bucket, Key: key });
    const got = await this.client.send(get);
    const reread = await streamToString(got.Body as NodeJS.ReadableStream);
    const parsed = JSON.parse(reread);
    const storedSha256 = computeBatchHash(parsed.rows);

    return {
      storedSha256,
      locator: `s3://${this.bucket}/${key}`,
    };
  }

  /**
   * Verify that an archive object exists and its rows hash matches the
   * given expectation. Used by audit / restore flows.
   */
  async verifyBatch(locator: string, expectedSha256: string): Promise<boolean> {
    const m = locator.match(/^s3:\/\/([^/]+)\/(.+)$/);
    if (!m) throw new Error(`Invalid s3 locator: ${locator}`);
    const head = new HeadObjectCommand({ Bucket: m[1], Key: m[2] });
    const meta = await this.client.send(head);
    const recorded = meta.Metadata?.['rows-sha256'];
    return recorded === expectedSha256;
  }
}

function sha256OfStringBase64(s: string): string {
  return crypto.createHash('sha256').update(s, 'utf8').digest('base64');
}

async function streamToString(stream: NodeJS.ReadableStream): Promise<string> {
  const chunks: Buffer[] = [];
  for await (const chunk of stream) {
    chunks.push(typeof chunk === 'string' ? Buffer.from(chunk) : chunk);
  }
  return Buffer.concat(chunks).toString('utf8');
}
