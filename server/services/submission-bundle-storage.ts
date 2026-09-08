/**
 * Durable storage for assembled eCTD submission bundles.
 *
 * Local-first by design: the assemble route always persists the zip to local
 * disk under SUBMISSION_BUNDLE_DIR. This module adds an OPTIONAL, env-gated
 * durable copy to S3 so bundles survive ephemeral-container recycles between
 * assemble and transmit (multi-node / serverless deploys).
 *
 * Gating: enabled ONLY when SUBMISSION_BUNDLE_S3_BUCKET is set. This is a
 * dedicated env (NOT S3_VAULT_BUCKET) so the durable path stays disabled in
 * tests/CI, where no AWS env vars are present. Importing this module has zero
 * side effects when disabled — the S3Client is constructed lazily inside the
 * functions, never at module load.
 *
 * Client/config construction mirrors server/services/s3-storage.ts (region from
 * AWS_REGION, optional static credentials, SSE AES256, ContentMD5). This module
 * is intentionally separate from s3-storage.ts (which is evidence-vault-specific:
 * vault-raw/ keys, documentId, extension guessing) and owns only bundle keys.
 */
import { createHash } from 'crypto';
import { Readable } from 'stream';
import { promises as fsp } from 'fs';

/**
 * The dedicated bucket env. When unset, all durable-storage operations are
 * disabled and the assemble route falls back to local-only persistence.
 */
function bundleBucket(): string | undefined {
  return process.env.SUBMISSION_BUNDLE_S3_BUCKET || undefined;
}

/** True only when a dedicated bundle bucket is configured. */
export function isBundleStorageEnabled(): boolean {
  return !!bundleBucket();
}

/** The configured bucket name (throws if called while disabled). */
export function bundleStorageBucket(): string {
  const bucket = bundleBucket();
  if (!bucket) throw new Error('SUBMISSION_BUNDLE_S3_BUCKET is not configured');
  return bucket;
}

/** Filesystem-/key-safe slug for a packageId, mirroring the route's leafSlug. */
function slugifyPackageId(packageId: string): string {
  return (
    (packageId || '')
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '')
      .slice(0, 80) || 'package'
  );
}

/**
 * Deterministic object key for a bundle, keyed by packageId slug + content hash.
 * `submission-bundles/<slug>/<sha256>.zip`.
 */
export function bundleStorageKey(packageId: string, sha256: string): string {
  return `submission-bundles/${slugifyPackageId(packageId)}/${sha256}.zip`;
}

/**
 * Lazily construct an S3 client. Only called when storage is enabled, so the
 * AWS SDK client is never instantiated in tests/CI. Mirrors s3-storage.ts.
 */
async function makeClient() {
  const { S3Client } = await import('@aws-sdk/client-s3');
  return new S3Client({
    region: process.env.AWS_REGION || 'us-east-1',
    credentials: process.env.AWS_ACCESS_KEY_ID
      ? {
          accessKeyId: process.env.AWS_ACCESS_KEY_ID,
          secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY || '',
        }
      : undefined,
  });
}

/**
 * Upload a bundle zip to durable storage with server-side encryption (AES256)
 * and a ContentMD5 integrity header. Throws on failure; callers fall back to
 * local-only persistence (the local file is always written first).
 */
export async function putBundle(key: string, body: Buffer): Promise<void> {
  const { PutObjectCommand } = await import('@aws-sdk/client-s3');
  const client = await makeClient();
  const md5 = createHash('md5').update(body).digest('base64');
  await client.send(
    new PutObjectCommand({
      Bucket: bundleStorageBucket(),
      Key: key,
      Body: body,
      ContentType: 'application/zip',
      ContentMD5: md5,
      ServerSideEncryption: 'AES256',
    }),
  );
}

/**
 * Remove a bundle zip from durable storage. Used ONLY for a bundle that was
 * never stored on its package — an assembly discarded because the package's
 * identifiers changed while it was being built. A bundle that was stored (and
 * may have been transmitted) is never deleted: it is the record.
 */
export async function deleteBundle(key: string): Promise<void> {
  const { DeleteObjectCommand } = await import('@aws-sdk/client-s3');
  const client = await makeClient();
  await client.send(new DeleteObjectCommand({ Bucket: bundleStorageBucket(), Key: key }));
}

/**
 * Download a bundle zip from durable storage, collecting the body stream into a
 * Buffer. Used by the transmit route to rematerialize a bundle whose local file
 * was lost to a container recycle.
 */
export async function getBundle(key: string): Promise<Buffer> {
  const { GetObjectCommand } = await import('@aws-sdk/client-s3');
  const client = await makeClient();
  const result = await client.send(
    new GetObjectCommand({
      Bucket: bundleStorageBucket(),
      Key: key,
    }),
  );
  const stream = result.Body as Readable;
  const chunks: Buffer[] = [];
  for await (const chunk of stream) {
    chunks.push(chunk as Buffer);
  }
  return Buffer.concat(chunks);
}

/**
 * Read the raw bytes of an assembled bundle from its descriptor. Reads the local
 * file at `descriptor.path` first (the local copy is always written at assemble).
 * If the local file is missing AND the descriptor records a durable S3 copy
 * (`storage.provider === 's3'` with a `storage.key`), rematerialize it from S3.
 * Throws when neither source is available.
 */
export async function readBundleBytes(descriptor: {
  path: string;
  storage?: { provider?: string; key?: string };
}): Promise<Buffer> {
  try {
    return await fsp.readFile(descriptor.path);
  } catch (localErr) {
    if (descriptor.storage?.provider === 's3' && descriptor.storage.key) {
      return getBundle(descriptor.storage.key);
    }
    throw new Error(
      `Bundle bytes are unavailable: local file missing at ${descriptor.path} and no durable S3 copy is recorded` +
        (localErr instanceof Error ? ` (${localErr.message})` : ''),
    );
  }
}
