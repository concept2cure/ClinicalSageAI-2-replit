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

// S3 client types — uses @aws-sdk/client-s3 if available
let S3Client: any;
let PutObjectCommand: any;
let GetObjectCommand: any;
let DeleteObjectCommand: any;
let ListObjectsV2Command: any;
let getSignedUrlFn: any;

try {
  const s3Module = require('@aws-sdk/client-s3');
  S3Client = s3Module.S3Client;
  PutObjectCommand = s3Module.PutObjectCommand;
  GetObjectCommand = s3Module.GetObjectCommand;
  DeleteObjectCommand = s3Module.DeleteObjectCommand;
  ListObjectsV2Command = s3Module.ListObjectsV2Command;

  const presigner = require('@aws-sdk/s3-request-presigner');
  getSignedUrlFn = presigner.getSignedUrl;
} catch {
  console.warn('[S3Provider] AWS SDK not installed — S3 provider unavailable');
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
    if (!S3Client) {
      throw new Error('S3StorageProvider: @aws-sdk/client-s3 package not installed');
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

    return { vaultFileId, vaultVersionId, sizeBytes, sha256, provider: 's3' };
  }

  async get(vaultVersionId: string): Promise<StorageGetResult | null> {
    try {
      // First find the metadata to get the actual file path
      // In production, this would use a DB index; here we rely on known structure
      const meta = await this.getMeta(vaultVersionId);
      if (!meta) return null;

      const orgId = Number(meta.metadata.orgId);
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

  async delete(vaultVersionId: string): Promise<boolean> {
    try {
      const meta = await this.getMeta(vaultVersionId);
      if (!meta) return false;

      const orgId = Number(meta.metadata.orgId);
      const projectId = meta.metadata.projectId;

      await this.client.send(new DeleteObjectCommand({
        Bucket: this.bucket,
        Key: this.keyPath(orgId, projectId, vaultVersionId, meta.filename),
      }));
      await this.client.send(new DeleteObjectCommand({
        Bucket: this.bucket,
        Key: this.metaKeyPath(orgId, projectId, vaultVersionId),
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

    const response = await this.client.send(new ListObjectsV2Command({
      Bucket: this.bucket,
      Prefix: prefix,
    }));

    const metaFiles = (response.Contents || [])
      .filter((obj: any) => obj.Key?.endsWith('/_meta.json'));

    const results: Array<{
      vaultFileId: string;
      vaultVersionId: string;
      filename: string;
      sizeBytes: number;
      sha256: string;
      storedAt: string;
    }> = [];

    for (const metaObj of metaFiles) {
      try {
        const getResp = await this.client.send(new GetObjectCommand({
          Bucket: this.bucket,
          Key: metaObj.Key,
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

  async getSignedUrl(vaultVersionId: string, ttlSeconds = 900): Promise<StorageSignedUrlResult> {
    if (!getSignedUrlFn) {
      throw new Error('S3: @aws-sdk/s3-request-presigner not installed');
    }

    const meta = await this.getMeta(vaultVersionId);
    if (!meta) throw new Error(`S3: version ${vaultVersionId} not found`);

    const orgId = Number(meta.metadata.orgId);
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

  private async getMeta(vaultVersionId: string): Promise<any | null> {
    // In production, use DB index. For now, scan is acceptable for this provider.
    // The caller should maintain a DB mapping of vaultVersionId → orgId/projectId
    try {
      const response = await this.client.send(new ListObjectsV2Command({
        Bucket: this.bucket,
        Prefix: '',
        MaxKeys: 1000,
      }));

      const metaKey = (response.Contents || [])
        .find((obj: any) => obj.Key?.includes(`/versions/${vaultVersionId}/_meta.json`));

      if (!metaKey) return null;

      const getResp = await this.client.send(new GetObjectCommand({
        Bucket: this.bucket,
        Key: metaKey.Key,
      }));

      const chunks: Buffer[] = [];
      for await (const chunk of getResp.Body) {
        chunks.push(Buffer.from(chunk));
      }
      return JSON.parse(Buffer.concat(chunks).toString('utf8'));
    } catch {
      return null;
    }
  }
}
