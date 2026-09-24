
/**
 * AWS S3 Storage Provider
 *
 * Production-ready implementation using AWS S3 for file storage.
 * Requires: AWS_S3_BUCKET, AWS_REGION, AWS_ACCESS_KEY_ID, AWS_SECRET_ACCESS_KEY
 *
 * Features:
 * - Server-side encryption (AES-256)
 * - Pre-signed URLs with configurable TTL
 * - Structured key paths: {orgId}/{projectId}/versions/{versionId}/{filename}
 *
 * @module server/services/storage/s3-provider
 */

import {
  IStorageProvider,
  StoragePutOptions,
  StoragePutResult,
  StorageGetResult,
  StorageSignedUrlResult,
  computeSha256,
  generateVersionId,
  sanitizeProjectId,
  buildVaultFileId,
} from './storage-provider';
// Static imports. These were `require()` calls inside a try/catch, which cannot
// work in this ESM package: the production bundle turns them into a shim that
// throws, the catch reported the SDK as "not installed", and S3 could never be
// selected in a deployed build (storage-provider-production-bundle.test.ts).
import {
  S3Client,
  PutObjectCommand,
  GetObjectCommand,
  DeleteObjectCommand,
  ListObjectsV2Command,
} from '@aws-sdk/client-s3';
import { getSignedUrl as getSignedUrlFn } from '@aws-sdk/s3-request-presigner';

/**
 * Does this stored object belong to the organization making the request?
 *
 * The object's metadata carries the org that wrote it. Both read paths used to
 * read that value purely to RECONSTRUCT the key — answering "which org owns
 * this?" and then fetching, never asking whether that was the org asking. This
 * is the comparison that was missing.
 *
 * Strict integer equality on both sides: `meta.metadata.orgId` is a string in S3
 * metadata, so `==` coercion or a bare `Number()` on one side only would let
 * '' / NaN slip through as a match. A metadata blob with no org is NOT owned by
 * anyone and is refused rather than treated as public.
 */
function ownsObject(meta: any, orgId: number): boolean {
  const owner = Number(meta?.metadata?.orgId);
  return Number.isSafeInteger(owner) && Number.isSafeInteger(orgId) && owner > 0 && owner === orgId;
}

export class S3StorageProvider implements IStorageProvider {
  readonly name = 's3';
  private client: any;
  private bucket: string;

  constructor() {
    const bucket = process.env.AWS_S3_BUCKET;
    const region = process.env.AWS_REGION || 'us-east-1';

    if (!bucket) {
      throw new Error('S3StorageProvider: AWS_S3_BUCKET environment variable required');
    }

    this.bucket = bucket;
    this.client = new S3Client({ region });
  }

  private keyPath(orgId: number, projectId: string, versionId: string, filename: string): string {
    return `${orgId}/${sanitizeProjectId(projectId)}/versions/${versionId}/${filename}`;
  }

  private metaKeyPath(orgId: number, projectId: string, versionId: string): string {
    return `${orgId}/${sanitizeProjectId(projectId)}/versions/${versionId}/_meta.json`;
  }

  /**
   * Where a version's metadata can be read knowing only the org and the version
   * id, which is all `get`, `delete` and `getSignedUrl` are given. Without it
   * the only way to find an object was to list keys until one matched.
   */
  private indexKeyPath(orgId: number, versionId: string): string {
    return `${orgId}/_index/versions/${versionId}.json`;
  }

  async put(opts: StoragePutOptions): Promise<StoragePutResult> {
    const { orgId, projectId, filename, bytes, mime, metadata = {} } = opts;

    const sha256 = computeSha256(bytes);
    const sizeBytes = bytes.length;
    const vaultVersionId = generateVersionId();
    const vaultFileId = buildVaultFileId(orgId, projectId, filename);

    // Upload file with server-side encryption
    await this.client.send(new PutObjectCommand({
      Bucket: this.bucket,
      Key: this.keyPath(orgId, projectId, vaultVersionId, filename),
      Body: bytes,
      ContentType: mime,
      ServerSideEncryption: 'AES256',
      Metadata: {
        ...metadata,
        'x-vault-file-id': vaultFileId,
        'x-vault-version-id': vaultVersionId,
        'x-sha256': sha256,
        'x-org-id': String(orgId),
        'x-project-id': projectId,
      },
    }));

    // Upload metadata sidecar
    const metaJson = JSON.stringify({
      vaultFileId,
      vaultVersionId,
      filename,
      mime,
      sizeBytes,
      sha256,
      metadata: { ...metadata, orgId: String(orgId), projectId },
      storedAt: new Date().toISOString(),
    });

    await this.client.send(new PutObjectCommand({
      Bucket: this.bucket,
      Key: this.metaKeyPath(orgId, projectId, vaultVersionId),
      Body: Buffer.from(metaJson, 'utf8'),
      ContentType: 'application/json',
      ServerSideEncryption: 'AES256',
    }));

    // Written last: a version is findable by id only once its bytes and
    // sidecar are both in place.
    await this.client.send(new PutObjectCommand({
      Bucket: this.bucket,
      Key: this.indexKeyPath(orgId, vaultVersionId),
      Body: Buffer.from(metaJson, 'utf8'),
      ContentType: 'application/json',
      ServerSideEncryption: 'AES256',
    }));

    return { vaultFileId, vaultVersionId, sizeBytes, sha256, provider: 's3' };
  }

  async get(vaultVersionId: string, orgId: number): Promise<StorageGetResult | null> {
    try {
      // Metadata first: it names the object's key and the org that wrote it.
      const meta = await this.getMeta(vaultVersionId, orgId);
      if (!meta) return null;

      // The object's OWN metadata names its org. Trusting that alone is what made
      // this cross-tenant: it answered "which org owns this?" and then fetched,
      // never asking whether that was the org doing the asking. A mismatch is
      // reported as MISSING, not forbidden — a distinguishable "forbidden" turns
      // a version id into an existence oracle.
      if (!ownsObject(meta, orgId)) return null;
      const projectId = meta.metadata.projectId;

      const response = await this.client.send(new GetObjectCommand({
        Bucket: this.bucket,
        Key: this.keyPath(orgId, projectId, vaultVersionId, meta.filename),
      }));

      const chunks: Buffer[] = [];
      for await (const chunk of response.Body) {
        chunks.push(Buffer.from(chunk));
      }
      const bytes = Buffer.concat(chunks);

      return {
        bytes,
        sizeBytes: bytes.length,
        sha256: meta.sha256,
        mime: meta.mime,
        filename: meta.filename,
      };
    } catch (err: any) {
      if (err.name === 'NoSuchKey') return null;
      throw err;
    }
  }

  async delete(vaultVersionId: string, orgId: number): Promise<boolean> {
    try {
      const meta = await this.getMeta(vaultVersionId, orgId);
      if (!meta) return false;

      // A cross-tenant DELETE is strictly worse than a cross-tenant read: the
      // read leaks a regulatory record, this destroys one. The shadowed local
      // `const orgId = Number(meta.metadata.orgId)` that used to sit here is
      // exactly how the parameter would have been silently ignored.
      if (!ownsObject(meta, orgId)) return false;

      const projectId = meta.metadata.projectId;

      await this.client.send(new DeleteObjectCommand({
        Bucket: this.bucket,
        Key: this.keyPath(orgId, projectId, vaultVersionId, meta.filename),
      }));
      await this.client.send(new DeleteObjectCommand({
        Bucket: this.bucket,
        Key: this.metaKeyPath(orgId, projectId, vaultVersionId),
      }));
      await this.client.send(new DeleteObjectCommand({
        Bucket: this.bucket,
        Key: this.indexKeyPath(orgId, vaultVersionId),
      }));

      return true;
    } catch {
      return false;
    }
  }

  async list(orgId: number, projectId: string): Promise<Array<{
    vaultFileId: string;
    vaultVersionId: string;
    filename: string;
    sizeBytes: number;
    sha256: string;
    storedAt: string;
  }>> {
    const prefix = `${orgId}/${sanitizeProjectId(projectId)}/versions/`;

    const metaFiles = (await this.listKeys(prefix)).filter((key) => key.endsWith('/_meta.json'));

    const results: Array<{
      vaultFileId: string;
      vaultVersionId: string;
      filename: string;
      sizeBytes: number;
      sha256: string;
      storedAt: string;
    }> = [];

    for (const metaKey of metaFiles) {
      try {
        const getResp = await this.client.send(new GetObjectCommand({
          Bucket: this.bucket,
          Key: metaKey,
        }));
        const chunks: Buffer[] = [];
        for await (const chunk of getResp.Body) {
          chunks.push(Buffer.from(chunk));
        }
        const meta = JSON.parse(Buffer.concat(chunks).toString('utf8'));
        results.push({
          vaultFileId: meta.vaultFileId,
          vaultVersionId: meta.vaultVersionId,
          filename: meta.filename,
          sizeBytes: meta.sizeBytes,
          sha256: meta.sha256,
          storedAt: meta.storedAt,
        });
      } catch {
        // Skip unreadable metadata
      }
    }

    return results.sort((a, b) => b.storedAt.localeCompare(a.storedAt));
  }

  async getSignedUrl(
    vaultVersionId: string,
    orgId: number,
    ttlSeconds = 900
  ): Promise<StorageSignedUrlResult> {
    const meta = await this.getMeta(vaultVersionId, orgId);
    if (!meta) throw new Error(`S3: version ${vaultVersionId} not found`);

    // A pre-signed URL is a bearer token for the object that outlives this
    // request and carries no further authorization, so the ownership check
    // matters more here than on a direct read, not less. Same "not found"
    // wording as a genuinely absent version.
    if (!ownsObject(meta, orgId)) throw new Error(`S3: version ${vaultVersionId} not found`);
    const projectId = meta.metadata.projectId;

    const command = new GetObjectCommand({
      Bucket: this.bucket,
      Key: this.keyPath(orgId, projectId, vaultVersionId, meta.filename),
      ResponseContentDisposition: `attachment; filename="${meta.filename}"`,
    });

    const url = await getSignedUrlFn(this.client, command, { expiresIn: ttlSeconds });
    const expiresAt = new Date(Date.now() + ttlSeconds * 1000);

    return { url, expiresAt };
  }

  async isAvailable(): Promise<boolean> {
    try {
      await this.client.send(new ListObjectsV2Command({
        Bucket: this.bucket,
        MaxKeys: 1,
      }));
      return true;
    } catch {
      return false;
    }
  }

  /** Every key under `prefix`, following S3's continuation tokens to the end. */
  private async listKeys(prefix: string): Promise<string[]> {
    const keys: string[] = [];
    let token: string | undefined;
    do {
      const page = await this.client.send(new ListObjectsV2Command({
        Bucket: this.bucket,
        Prefix: prefix,
        ContinuationToken: token,
      }));
      for (const obj of page.Contents || []) if (obj.Key) keys.push(obj.Key);
      token = page.IsTruncated ? page.NextContinuationToken : undefined;
    } while (token);
    return keys;
  }

  private async readJson(key: string): Promise<any> {
    const resp = await this.client.send(new GetObjectCommand({ Bucket: this.bucket, Key: key }));
    const chunks: Buffer[] = [];
    for await (const chunk of resp.Body) chunks.push(Buffer.from(chunk));
    return JSON.parse(Buffer.concat(chunks).toString('utf8'));
  }

  /**
   * A version's metadata, looked up only under the requesting org's prefix.
   *
   * This listed the whole bucket once, 1000 keys and no continuation, and
   * returned null on ANY error. Past roughly 500 documents bucket-wide, reads
   * reported stored documents as missing, and a refused credential read as
   * "no such document". Now: the index key written by `put` is one GET; a
   * version stored before the index existed is found by a paginated listing of
   * the org's own keys; null means only "not found"; every other failure
   * propagates.
   */
  private async getMeta(vaultVersionId: string, orgId: number): Promise<any | null> {
    // A version id is a uuid (generateVersionId). Anything else cannot name
    // one of ours, and must not be allowed to shape a key or a prefix.
    if (!/^[A-Za-z0-9-]{1,64}$/.test(vaultVersionId) || !Number.isSafeInteger(orgId) || orgId <= 0) {
      return null;
    }
    try {
      return await this.readJson(this.indexKeyPath(orgId, vaultVersionId));
    } catch (err: any) {
      if (err?.name !== 'NoSuchKey') throw err;
    }
    const suffix = `/versions/${vaultVersionId}/_meta.json`;
    const metaKey = (await this.listKeys(`${orgId}/`)).find((key) => key.endsWith(suffix));
    return metaKey ? this.readJson(metaKey) : null;
  }
}
