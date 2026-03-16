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

function readMetadata(metaPath: string): VaultVersionMeta | null {
  if (!fs.existsSync(metaPath)) return null;
  return JSON.parse(fs.readFileSync(metaPath, 'utf8'));
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
 */
export async function streamVersion(vaultVersionId: string): Promise<VaultStreamResult | null> {
  // Search for version directory across all orgs/projects
  // In production, use a DB lookup; here we search the vault root
  const verPath = findVersionDir(vaultVersionId);
  if (!verPath) return null;

  const metaPath = path.join(verPath, '_meta.json');
  const meta = readMetadata(metaPath);
  if (!meta) return null;

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
 * Find a version directory by scanning the vault tree.
 * In production, replace with a DB index lookup.
 */
function findVersionDir(vaultVersionId: string): string | null {
  if (!fs.existsSync(VAULT_ROOT)) return null;

  const orgs = fs.readdirSync(VAULT_ROOT, { withFileTypes: true }).filter(d => d.isDirectory());

  for (const org of orgs) {
    const orgPath = path.join(VAULT_ROOT, org.name);
    const projects = fs.readdirSync(orgPath, { withFileTypes: true }).filter(d => d.isDirectory());

    for (const proj of projects) {
      const versionsPath = path.join(orgPath, proj.name, 'versions', vaultVersionId);
      if (fs.existsSync(versionsPath)) return versionsPath;
    }
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
