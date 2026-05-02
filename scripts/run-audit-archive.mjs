#!/usr/bin/env node
/**
 * run-audit-archive.mjs — nightly audit-log archive runner.
 *
 * Invokes `runAuditArchive` against the configured database and ships the
 * archived batches to either the filesystem (default; useful for dev) or a
 * future S3 sink wired by env var.
 *
 * Cron entry (production):
 *   0 3 * * *   node scripts/run-audit-archive.mjs >> /var/log/audit-archive.log 2>&1
 *
 * Required env:
 *   DATABASE_URL or DATABASE_NEON_NEW_SECRET
 *
 * Required env (sink selection):
 *   AUDIT_ARCHIVE_SINK       'fs' (default) or 's3'
 *
 * Filesystem-sink env:
 *   AUDIT_ARCHIVE_DIR        directory for the filesystem sink (default: ./.audit-archive)
 *
 * S3-sink env:
 *   AUDIT_ARCHIVE_S3_BUCKET  bucket name (required when sink=s3)
 *   AUDIT_ARCHIVE_S3_PREFIX  key prefix (default: audit-archive)
 *   AUDIT_ARCHIVE_S3_REGION  AWS region (default: $AWS_REGION)
 *   AUDIT_ARCHIVE_S3_STORAGE_CLASS  STANDARD_IA | GLACIER | DEEP_ARCHIVE (default: STANDARD_IA)
 *   AUDIT_ARCHIVE_S3_SSE     AES256 | aws:kms (recommended)
 *   AUDIT_ARCHIVE_S3_KMS_KEY KMS key id when SSE=aws:kms
 *
 * Common env:
 *   AUDIT_ARCHIVE_BATCH_SIZE rows per batch (default: 1000)
 *   AUDIT_ARCHIVE_MAX_BATCHES safety stop (default: unlimited)
 *   AUDIT_ARCHIVE_OLDER_THAN ISO date; rows older than this archive (default: now - 24mo)
 */
import pg from 'pg';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

const { Pool } = pg;

function getDbUrl() {
  const raw = process.env.DATABASE_NEON_NEW_SECRET || process.env.DATABASE_URL;
  if (!raw) {
    console.error('ERROR: Set DATABASE_URL or DATABASE_NEON_NEW_SECRET');
    process.exit(1);
  }
  let url = raw;
  if (url.startsWith('psql ')) url = url.substring(5);
  return url.trim();
}

async function main() {
  const dbUrl = getDbUrl();
  const isNeon = dbUrl.includes('neon.tech') || dbUrl.includes('sslmode=require');
  const pool = new Pool({
    connectionString: dbUrl,
    ssl: isNeon ? { rejectUnauthorized: false } : false,
  });

  // Dynamic import — the archive service is TS, compiled at runtime by tsx.
  // Operators who run this directly can compile the server first; in dev we
  // expect the user to invoke via `npm run audit:archive` which uses tsx.
  const moduleUrl = pathToFileURL(
    path.resolve(process.cwd(), 'server/services/audit/audit-archive.service.ts'),
  ).href;
  let runAuditArchive;
  let FilesystemArchiveSink;
  let S3ArchiveSink;
  try {
    ({ runAuditArchive, FilesystemArchiveSink, S3ArchiveSink } = await import(moduleUrl));
  } catch (err) {
    console.error('Failed to import archive service. Run via `npm run audit:archive`.');
    console.error(err);
    process.exit(1);
  }

  const sinkKind = (process.env.AUDIT_ARCHIVE_SINK || 'fs').toLowerCase();
  const archiveDir = process.env.AUDIT_ARCHIVE_DIR || '.audit-archive';
  const batchSize = parseInt(process.env.AUDIT_ARCHIVE_BATCH_SIZE || '1000', 10);
  const maxBatches = process.env.AUDIT_ARCHIVE_MAX_BATCHES
    ? parseInt(process.env.AUDIT_ARCHIVE_MAX_BATCHES, 10)
    : undefined;
  const olderThan = process.env.AUDIT_ARCHIVE_OLDER_THAN
    ? new Date(process.env.AUDIT_ARCHIVE_OLDER_THAN)
    : undefined;

  let sink;
  if (sinkKind === 's3') {
    const bucket = process.env.AUDIT_ARCHIVE_S3_BUCKET;
    if (!bucket) {
      console.error('ERROR: AUDIT_ARCHIVE_S3_BUCKET is required when AUDIT_ARCHIVE_SINK=s3');
      process.exit(1);
    }
    sink = new S3ArchiveSink({
      bucket,
      prefix: process.env.AUDIT_ARCHIVE_S3_PREFIX,
      region: process.env.AUDIT_ARCHIVE_S3_REGION,
      storageClass: process.env.AUDIT_ARCHIVE_S3_STORAGE_CLASS,
      serverSideEncryption: process.env.AUDIT_ARCHIVE_S3_SSE,
      sseKmsKeyId: process.env.AUDIT_ARCHIVE_S3_KMS_KEY,
    });
    console.log('[audit-archive] starting');
    console.log(`[audit-archive]   sink      = s3://${bucket}/${process.env.AUDIT_ARCHIVE_S3_PREFIX || 'audit-archive'}`);
  } else {
    sink = new FilesystemArchiveSink(archiveDir);
    console.log('[audit-archive] starting');
    console.log(`[audit-archive]   sink      = fs:${archiveDir}`);
  }
  console.log(`[audit-archive]   batchSize = ${batchSize}`);
  console.log(`[audit-archive]   olderThan = ${olderThan?.toISOString() ?? '(default 24mo)'}`);

  const result = await runAuditArchive(pool, {
    sink,
    batchSize,
    maxBatches,
    olderThan,
  });

  console.log('[audit-archive] result:');
  console.log(JSON.stringify(result, null, 2));

  await pool.end();

  if (result.errors.length > 0) {
    console.error(`[audit-archive] ${result.errors.length} error(s); exiting 1`);
    process.exit(1);
  }
}

main().catch(err => {
  console.error('[audit-archive] fatal:', err);
  process.exit(1);
});
