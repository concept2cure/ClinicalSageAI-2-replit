/**
 * Local Filesystem Storage Provider
 *
 * Development-only implementation that stores files under storage/vault/.
 * Implements the IStorageProvider interface for local filesystem.
 *
 * @module server/services/storage/local-provider
 */

import * as fs from 'fs';
import * as path from 'path';

/**
 * Version ids are `randomUUID()` (see storage-provider.generateVersionId), so an
 * exact shape check is available — and an exact check is what makes this a
 * whitelist rather than a traversal blocklist. Ids reach here from request
 * payloads, including model-authored AI action payloads.
 */
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
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

const VAULT_ROOT = path.resolve(process.cwd(), 'storage', 'vault');

interface VersionMeta {
  vaultFileId: string;
  vaultVersionId: string;
  filename: string;
  mime: string;
  sizeBytes: number;
  sha256: string;
  metadata: Record<string, string>;
  storedAt: string;
}

function ensureDir(dirPath: string): void {
  if (!fs.existsSync(dirPath)) {
    fs.mkdirSync(dirPath, { recursive: true });
  }
}

export class LocalStorageProvider implements IStorageProvider {
  readonly name = 'local';

  async put(opts: StoragePutOptions): Promise<StoragePutResult> {
    const { orgId, projectId, filename, bytes, mime, metadata = {} } = opts;

    const sha256 = computeSha256(bytes);
    const sizeBytes = bytes.length;
    const vaultVersionId = generateVersionId();
    const vaultFileId = buildVaultFileId(orgId, projectId, filename);

    const safeProject = sanitizeProjectId(projectId);
    const verDir = path.join(VAULT_ROOT, String(orgId), safeProject, 'versions', vaultVersionId);
    ensureDir(verDir);

    // Write file
    fs.writeFileSync(path.join(verDir, filename), bytes);

    // Write metadata sidecar
    const meta: VersionMeta = {
      vaultFileId,
      vaultVersionId,
      filename,
      mime,
      sizeBytes,
      sha256,
      metadata: { ...metadata, orgId: String(orgId), projectId },
      storedAt: new Date().toISOString(),
    };
    fs.writeFileSync(path.join(verDir, '_meta.json'), JSON.stringify(meta, null, 2), 'utf8');

    return { vaultFileId, vaultVersionId, sizeBytes, sha256, provider: 'local' };
  }

  async get(vaultVersionId: string, orgId: number): Promise<StorageGetResult | null> {
    const verPath = this.findVersionDir(vaultVersionId, orgId);
    if (!verPath) return null;

    const metaPath = path.join(verPath, '_meta.json');
    if (!fs.existsSync(metaPath)) return null;

    const meta: VersionMeta = JSON.parse(fs.readFileSync(metaPath, 'utf8'));
    const filePath = path.join(verPath, meta.filename);
    if (!fs.existsSync(filePath)) return null;

    const bytes = fs.readFileSync(filePath);
    return {
      bytes,
      sizeBytes: bytes.length,
      sha256: meta.sha256,
      mime: meta.mime,
      filename: meta.filename,
    };
  }

  async delete(vaultVersionId: string, orgId: number): Promise<boolean> {
    const verPath = this.findVersionDir(vaultVersionId, orgId);
    if (!verPath) return false;

    fs.rmSync(verPath, { recursive: true, force: true });
    return true;
  }

  async list(orgId: number, projectId: string): Promise<Array<{
    vaultFileId: string;
    vaultVersionId: string;
    filename: string;
    sizeBytes: number;
    sha256: string;
    storedAt: string;
  }>> {
    const safeProject = sanitizeProjectId(projectId);
    const versionsDir = path.join(VAULT_ROOT, String(orgId), safeProject, 'versions');
    if (!fs.existsSync(versionsDir)) return [];

    const results: Array<{
      vaultFileId: string;
      vaultVersionId: string;
      filename: string;
      sizeBytes: number;
      sha256: string;
      storedAt: string;
    }> = [];

    const versionDirs = fs.readdirSync(versionsDir, { withFileTypes: true })
      .filter(d => d.isDirectory());

    for (const dir of versionDirs) {
      const metaPath = path.join(versionsDir, dir.name, '_meta.json');
      if (fs.existsSync(metaPath)) {
        const meta: VersionMeta = JSON.parse(fs.readFileSync(metaPath, 'utf8'));
        results.push({
          vaultFileId: meta.vaultFileId,
          vaultVersionId: meta.vaultVersionId,
          filename: meta.filename,
          sizeBytes: meta.sizeBytes,
          sha256: meta.sha256,
          storedAt: meta.storedAt,
        });
      }
    }

    return results.sort((a, b) => b.storedAt.localeCompare(a.storedAt));
  }

  async getSignedUrl(
    vaultVersionId: string,
    orgId: number,
    ttlSeconds = 900
  ): Promise<StorageSignedUrlResult> {
    // Local provider generates a local path-based "URL" — not truly signed
    const expiresAt = new Date(Date.now() + ttlSeconds * 1000);
    return {
      url: `/api/vault/download/${vaultVersionId}`,
      expiresAt,
    };
  }

  async isAvailable(): Promise<boolean> {
    try {
      ensureDir(VAULT_ROOT);
      return true;
    } catch {
      return false;
    }
  }

  /**
   * Resolve a version id to a directory **within one organization's subtree**.
   *
   * This used to iterate over every org directory under VAULT_ROOT and return
   * the first match, which made `get`/`delete` cross-tenant by construction: any
   * caller holding a version id reached any tenant's bytes. The search is now
   * rooted at the caller's org, so a foreign id simply does not resolve and is
   * indistinguishable from one that never existed.
   *
   * `vaultVersionId` is validated before it is joined onto a path. It arrives
   * from request payloads (including model-authored AI action payloads), and
   * `path.join(root, '../../etc/passwd')` escapes the org root — a traversal that
   * the old whole-vault search made irrelevant but this org-rooted one would
   * otherwise expose. Version ids are randomUUIDs, so the pattern is exact
   * rather than a blocklist.
   */
  private findVersionDir(vaultVersionId: string, orgId: number): string | null {
    if (!UUID_RE.test(vaultVersionId)) return null;
    if (!Number.isSafeInteger(orgId) || orgId <= 0) return null;
    if (!fs.existsSync(VAULT_ROOT)) return null;

    const orgPath = path.join(VAULT_ROOT, String(orgId));
    if (!fs.existsSync(orgPath)) return null;

    const projects = fs.readdirSync(orgPath, { withFileTypes: true }).filter(d => d.isDirectory());
    for (const proj of projects) {
      const verPath = path.join(orgPath, proj.name, 'versions', vaultVersionId);
      if (fs.existsSync(verPath)) return verPath;
    }
    return null;
  }
}
