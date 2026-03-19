/**
 * Storage Provider Interface
 *
 * Abstracts file storage behind a common interface so the platform
 * can swap between local filesystem (dev), S3, Azure Blob, or GCS.
 *
 * Selected via STORAGE_PROVIDER env var: 'local' | 's3' | 'azure' | 'gcs'
 *
 * @module server/services/storage/storage-provider
 */

import { createHash, randomUUID } from 'crypto';

// ── Interface ───────────────────────────────────────────────────────────────

export interface StoragePutOptions {
  orgId: number;
  projectId: string;
  filename: string;
  bytes: Buffer;
  mime: string;
  metadata?: Record<string, string>;
}

export interface StoragePutResult {
  vaultFileId: string;
  vaultVersionId: string;
  sizeBytes: number;
  sha256: string;
  provider: string;
}

export interface StorageGetResult {
  bytes: Buffer;
  sizeBytes: number;
  sha256: string;
  mime: string;
  filename: string;
}

export interface StorageSignedUrlResult {
  url: string;
  expiresAt: Date;
}

export interface IStorageProvider {
  /** Provider name (local, s3, azure, gcs) */
  readonly name: string;

  /** Store bytes, return file ID and metadata */
  put(opts: StoragePutOptions): Promise<StoragePutResult>;

  /** Retrieve file by version ID */
  get(vaultVersionId: string): Promise<StorageGetResult | null>;

  /** Delete a specific version */
  delete(vaultVersionId: string): Promise<boolean>;

  /** List files for an org/project */
  list(orgId: number, projectId: string): Promise<Array<{
    vaultFileId: string;
    vaultVersionId: string;
    filename: string;
    sizeBytes: number;
    sha256: string;
    storedAt: string;
  }>>;

  /** Generate a signed/pre-signed download URL (for cloud providers) */
  getSignedUrl(vaultVersionId: string, ttlSeconds?: number): Promise<StorageSignedUrlResult>;

  /** Health check */
  isAvailable(): Promise<boolean>;
}

// ── Utilities ───────────────────────────────────────────────────────────────

export function computeSha256(data: Buffer): string {
  return createHash('sha256').update(data).digest('hex');
}

export function generateVersionId(): string {
  return randomUUID();
}

export function sanitizeProjectId(projectId: string): string {
  return projectId.replace(/[^a-zA-Z0-9_-]/g, '_');
}

export function buildVaultFileId(orgId: number, projectId: string, filename: string): string {
  return `vault://${orgId}/${sanitizeProjectId(projectId)}/${filename}`;
}
