/**
 * Storage Provider Factory
 *
 * Selects the storage backend based on STORAGE_PROVIDER env var.
 * Unset means 'local', for development; an unrecognised value is refused.
 *
 * Usage:
 *   import { getStorageProvider } from '../services/storage';
 *   const storage = getStorageProvider();
 *   await storage.put({ orgId, projectId, filename, bytes, mime });
 *
 * Environment:
 *   STORAGE_PROVIDER=local   → Local filesystem (default, dev only)
 *   STORAGE_PROVIDER=s3      → AWS S3 (requires AWS_S3_BUCKET, AWS_REGION)
 *
 * @module server/services/storage
 */

import { IStorageProvider } from './storage-provider';
import { LocalStorageProvider } from './local-provider';
import { S3StorageProvider } from './s3-provider';
import { createScopedLogger } from '../../utils/logger.js';
const log = createScopedLogger('storage');

let _instance: IStorageProvider | null = null;

/**
 * The provider STORAGE_PROVIDER names. Unset means local disk.
 *
 * Any other value is refused. It used to fall through to local disk: a typo,
 * or a provider this module does not implement, sent every vault byte to the
 * container's own disk, with nothing said. On Fargate that disk belongs to one
 * task and disappears with it, so the vault's database rows would outlive the
 * documents they describe.
 */
export function resolveStorageProviderName(env: NodeJS.ProcessEnv = process.env): 'local' | 's3' {
  const raw = env.STORAGE_PROVIDER;
  if (raw === undefined || raw.trim() === '') return 'local';
  const name = raw.trim().toLowerCase();
  if (name === 'local') return 'local';
  if (name === 's3' || name === 'aws') return 's3';
  throw new Error(
    `STORAGE_PROVIDER '${raw}' is not a storage provider this server implements ` +
      `(local, s3). Refusing to fall back to local disk.`,
  );
}

export function getStorageProvider(): IStorageProvider {
  if (_instance) return _instance;

  if (resolveStorageProviderName() === 's3') {
    _instance = new S3StorageProvider();
    log.debug('Using S3 provider', { bucket: process.env.AWS_S3_BUCKET });
  } else {
    _instance = new LocalStorageProvider();
    log.debug('[Storage] Using local filesystem provider (storage/vault/)');
  }

  return _instance;
}

/** Reset singleton (for testing) */
export function resetStorageProvider(): void {
  _instance = null;
}

// Re-export types
export type {
  IStorageProvider,
  StoragePutOptions,
  StoragePutResult,
  StorageGetResult,
  StorageSignedUrlResult,
} from './storage-provider';
