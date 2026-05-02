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
 *   5. Only then delete the batch from `audit_logs`.
 *
 * Failures abort the batch — the rows stay in the hot table. The job is
 * idempotent: re-running picks up where it left off because the cutoff is
 * a date, not a watermark.
 *
 * Tenant safety: the archive preserves `tenant_id` on every row so
 * downstream queries against the cold archive can still filter by org.
 */

import crypto from 'crypto';
import type { Pool, PoolClient } from 'pg';

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
  startedAt: string;
  finishedAt: string;
  cutoff: string;
  errors: string[];
}

const DEFAULT_BATCH_SIZE = 1_000;
const DEFAULT_HOT_WINDOW_MS = 24 * 30 * 24 * 60 * 60 * 1000; // 24 months ≈ 720 days

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
    startedAt: new Date().toISOString(),
    finishedAt: '',
    cutoff: cutoff.toISOString(),
    errors: [],
  };

  while (result.batches < maxBatches) {
    const { rows } = await client.query<Record<string, unknown>>(
      `SELECT * FROM audit_logs
       WHERE created_at < $1
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

    // Only after the sink confirms the bytes landed do we delete from hot.
    const ids = rows.map(r => (r as any).id);
    await client.query(`DELETE FROM audit_logs WHERE id = ANY($1::int[])`, [ids]);

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

function canonicalJSON(value: unknown): string {
  if (Array.isArray(value)) return '[' + value.map(canonicalJSON).join(',') + ']';
  if (value && typeof value === 'object') {
    const obj = value as Record<string, unknown>;
    const keys = Object.keys(obj).sort();
    return '{' + keys.map(k => JSON.stringify(k) + ':' + canonicalJSON(obj[k])).join(',') + '}';
  }
  if (value instanceof Date) return JSON.stringify(value.toISOString());
  return JSON.stringify(value);
}

// ─── Filesystem sink (dev/CI; production overrides with S3) ────────────────

import { promises as fs } from 'fs';
import path from 'path';

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

import {
  S3Client,
  PutObjectCommand,
  GetObjectCommand,
  HeadObjectCommand,
  type S3ClientConfig,
} from '@aws-sdk/client-s3';

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
