/**
 * Vault Storage Service
 *
 * Provides file storage for IVDR pack artifacts.
 * Uses local filesystem storage under `storage/vault/` with structured paths:
 *   storage/vault/{orgId}/{projectId}/{filename}
 *
 * Each stored file gets:
 *   - vaultFileId: deterministic path-based ID
 *   - vaultVersionId: UUID (unique per upload)
 *   - sha256: content hash verified on read
 *   - sizeBytes: file size
 *
 * When a real vault (S3, Azure Blob, etc.) is available, swap this implementation
 * while keeping the same interface.
 *
 * @module server/services/vaultService
 */

import { createHash, randomUUID } from 'crypto';
import * as fs from 'fs';
import * as path from 'path';

// ── Storage root ────────────────────────────────────────────────────────────

const VAULT_ROOT = path.resolve(process.cwd(), 'storage', 'vault');

// ── Types ───────────────────────────────────────────────────────────────────

export interface VaultPutResult {
  vaultFileId: string;
  vaultVersionId: string;
  sizeBytes: number;
  sha256: string;
}

export interface VaultStreamResult {
  stream: fs.ReadStream;
  sizeBytes: number;
  sha256: string;
  mime: string;
  filename: string;
}

export interface VaultPutOptions {
  orgId: number;
  projectId: string;
  filename: string;
  bytes: Buffer;
  mime: string;
  metadata?: Record<string, string>;
}

// ── Helpers ─────────────────────────────────────────────────────────────────

function computeSha256(data: Buffer): string {
  return createHash('sha256').update(data).digest('hex');
}

function ensureDir(dirPath: string): void {
  if (!fs.existsSync(dirPath)) {
    fs.mkdirSync(dirPath, { recursive: true });
  }
}

/**
 * Build the directory path for a given org + project.
 */
function vaultDir(orgId: number, projectId: string): string {
  // Sanitize projectId for filesystem safety
  const safeProject = projectId.replace(/[^a-zA-Z0-9_-]/g, '_');
  return path.join(VAULT_ROOT, String(orgId), safeProject);
}

/**
 * Build the versioned directory path (each version in its own subdir).
 */
function versionDir(orgId: number, projectId: string, versionId: string): string {
  return path.join(vaultDir(orgId, projectId), 'versions', versionId);
}

// ── Metadata store (JSON sidecar per version) ───────────────────────────────

interface VaultVersionMeta {
  vaultFileId: string;
  vaultVersionId: string;
  filename: string;
  mime: string;
  sizeBytes: number;
  sha256: string;
  metadata: Record<string, string>;
  storedAt: string;
}

function writeMetadata(metaPath: string, meta: VaultVersionMeta): void {
  fs.writeFileSync(metaPath, JSON.stringify(meta, null, 2), 'utf8');
}

/** Parse vault metadata JSON, returning null on malformed content (never throws). */
export function parseVaultMetadata(raw: string): VaultVersionMeta | null {
  try {
    return JSON.parse(raw) as VaultVersionMeta;
  } catch {
    return null;
  }
}

function readMetadata(metaPath: string): VaultVersionMeta | null {
  if (!fs.existsSync(metaPath)) return null;
  try {
    return parseVaultMetadata(fs.readFileSync(metaPath, 'utf8'));
  } catch {
    // I/O error (e.g., file removed mid-read) — degrade gracefully.
    return null;
  }
}

// ── Public API ──────────────────────────────────────────────────────────────

/**
 * Store bytes in the vault.
 * Returns file ID, version ID, size, and content hash.
 */
export async function putBytes(opts: VaultPutOptions): Promise<VaultPutResult> {
  const { orgId, projectId, filename, bytes, mime, metadata = {} } = opts;

  const sha256 = computeSha256(bytes);
  const sizeBytes = bytes.length;
  const vaultVersionId = randomUUID();
  const vaultFileId = `vault://${orgId}/${projectId.replace(/[^a-zA-Z0-9_-]/g, '_')}/${filename}`;

  // Write bytes
  const verDir = versionDir(orgId, projectId, vaultVersionId);
  ensureDir(verDir);

  const filePath = path.join(verDir, filename);
  fs.writeFileSync(filePath, bytes);

  // Write metadata sidecar
  const meta: VaultVersionMeta = {
    vaultFileId,
    vaultVersionId,
    filename,
    mime,
    sizeBytes,
    sha256,
    metadata: {
      ...metadata,
      orgId: String(orgId),
      projectId,
    },
    storedAt: new Date().toISOString(),
  };
  writeMetadata(path.join(verDir, '_meta.json'), meta);

  console.log(
    `[VaultService] Stored ${filename} (${sizeBytes} bytes, sha256=${sha256.substring(0, 16)}…) → ${vaultVersionId}`
  );

  return { vaultFileId, vaultVersionId, sizeBytes, sha256 };
}

/**
 * Stream a version's content from the vault.
 * Used by download endpoints.
 *
 * `orgId` IS REQUIRED, and is not a courtesy parameter. This function used to
 * take a version id alone and, as its own comment said, "search for version
 * directory across all orgs/projects" — so possession of a version id was
 * possession of the bytes, whoever owned them.
 *
 * That was never reachable as a cross-tenant read: both callers in
 * server/routes/ivdr-binder-routes.ts load the pack with
 * `WHERE id = $1 AND organization_id = $2` first and take the version ids off
 * THAT row, so a caller can only name versions their own org already owns.
 * The hole was in the shape, not the traffic — one future caller passing a
 * client-supplied version id would have made it real, with nothing in this
 * function to stop it, in a vault holding regulatory submissions.
 *
 * So the tenant gate is structural rather than a check that can be forgotten:
 * the path is BUILT under the caller's org, and a version belonging to anyone
 * else is simply not found. That also makes it a direct lookup instead of a
 * scan of every org on the box. The sidecar's recorded owner is re-asserted
 * afterwards, which is what the S3 provider already does, so a version
 * relocated under the wrong org directory still refuses.
 *
 * This mirrors the safe sibling, `getStorageProvider().get(versionId, orgId)`,
 * whose orgId is likewise required — object storage sits outside Postgres RLS,
 * so the argument is the only tenant boundary the bytes get.
 */
export async function streamVersion(
  vaultVersionId: string,
  orgId: number,
): Promise<VaultStreamResult | null> {
  if (!Number.isInteger(orgId) || orgId <= 0) return null;

  const verPath = findVersionDir(vaultVersionId, orgId);
  if (!verPath) return null;

  const metaPath = path.join(verPath, '_meta.json');
  const meta = readMetadata(metaPath);
  if (!meta) return null;

  // The owner putBytes stamped on the sidecar must agree with the caller's.
  if (meta.metadata?.orgId !== String(orgId)) return null;

  // `filename` is read back from a sidecar on disk, so it is not trusted to be
  // a plain name: a traversing value would resolve outside the version dir and
  // serve an arbitrary file. Refuse anything that is not its own basename.
  if (!meta.filename || path.basename(meta.filename) !== meta.filename) return null;

  const filePath = path.join(verPath, meta.filename);
  if (!fs.existsSync(filePath)) return null;

  const stat = fs.statSync(filePath);

  return {
    stream: fs.createReadStream(filePath),
    sizeBytes: stat.size,
    sha256: meta.sha256,
    mime: meta.mime,
    filename: meta.filename,
  };
}

/**
 * Find a version directory WITHIN ONE ORG's subtree.
 *
 * Scoped by construction: the walk starts at VAULT_ROOT/{orgId} and cannot
 * leave it, so another tenant's version is not findable rather than merely
 * not returned. It previously walked every org directory on the box.
 *
 * The version id is still checked for traversal because it is appended to a
 * path: a value containing separators or `..` could otherwise climb back out
 * of the org directory the scoping just established.
 */
function findVersionDir(vaultVersionId: string, orgId: number): string | null {
  if (!vaultVersionId || path.basename(vaultVersionId) !== vaultVersionId) return null;

  const orgPath = path.join(VAULT_ROOT, String(orgId));
  if (!fs.existsSync(orgPath)) return null;

  const projects = fs.readdirSync(orgPath, { withFileTypes: true }).filter(d => d.isDirectory());
  for (const proj of projects) {
    const versionsPath = path.join(orgPath, proj.name, 'versions', vaultVersionId);
    if (fs.existsSync(versionsPath)) return versionsPath;
  }

  return null;
}

/**
 * Check if vault storage is available.
 */
export function isVaultAvailable(): boolean {
  try {
    ensureDir(VAULT_ROOT);
    return true;
  } catch {
    return false;
  }
}
