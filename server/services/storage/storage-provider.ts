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

  /**
   * Retrieve a file by version ID, **scoped to the owning organization**.
   *
   * ── Why orgId is required and not optional ────────────────────────────────
   * Object storage sits entirely outside Postgres RLS. The database policy that
   * isolates every other table does nothing for bytes on a disk or in a bucket,
   * so the ONLY tenant boundary here is the one this interface enforces.
   *
   * It previously took the version id alone. The local provider resolved it by
   * walking EVERY organization's directory looking for a matching id, and the S3
   * provider read the org out of the object's own metadata and then fetched it —
   * so both returned any tenant's bytes to any caller holding an id, and both
   * `delete()`s destroyed them. `vaultVersionId` is a randomUUID, which makes it
   * unguessable but not an authorization control: ids leak through logs,
   * provenance records, exports and AI context, and an unguessable capability is
   * still a capability.
   *
   * Made REQUIRED rather than optional on purpose. An optional tenant argument
   * is a control that is only on where someone remembered it — the same defect
   * as a hand-maintained allowlist, and this codebase has been bitten by that
   * repeatedly. A required parameter makes the boundary impossible to omit,
   * because the compiler asks.
   *
   * A file belonging to another organization must be reported as MISSING (null),
   * never as forbidden — "403" on a foreign id confirms the id exists, which is
   * an enumeration oracle. Matches `ana/uploaded-file-access.ts`.
   */
  get(vaultVersionId: string, orgId: number): Promise<StorageGetResult | null>;

  /** Delete a specific version, scoped to the owning organization. */
  delete(vaultVersionId: string, orgId: number): Promise<boolean>;

  /** List files for an org/project */
  list(orgId: number, projectId: string): Promise<Array<{
    vaultFileId: string;
    vaultVersionId: string;
    filename: string;
    sizeBytes: number;
    sha256: string;
    storedAt: string;
  }>>;

  /**
   * Generate a signed/pre-signed download URL, scoped to the owning org.
   *
   * Scoped for the same reason as `get`, and more urgently: a pre-signed URL is
   * a bearer token for the object that outlives the request and carries no
   * further authorization. Minting one for another tenant's file hands out
   * their bytes to anyone the link reaches.
   */
  getSignedUrl(
    vaultVersionId: string,
    orgId: number,
    ttlSeconds?: number
  ): Promise<StorageSignedUrlResult>;

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
