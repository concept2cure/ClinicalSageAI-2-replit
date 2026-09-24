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
import { resolveStorageProviderName } from './provider-name';
import { createScopedLogger } from '../../utils/logger.js';
const log = createScopedLogger('storage');

let _instance: IStorageProvider | null = null;

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

export { resolveStorageProviderName };

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
