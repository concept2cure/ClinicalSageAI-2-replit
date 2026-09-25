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

/**
 * A stored object's provider cannot be opened here: the recorded name is one
 * this server does not implement, or that provider is not configured (S3 with
 * no bucket). Distinct from "not found": the bytes may well exist.
 */
export class RecordedProviderUnavailable extends Error {
  constructor(
    readonly recorded: string,
    reason: string,
  ) {
    super(`storage provider '${recorded}' cannot be opened: ${reason}`);
    this.name = 'RecordedProviderUnavailable';
  }
}

const _byName = new Map<'local' | 's3', IStorageProvider>();

/**
 * The provider that holds an object, from the name recorded when it was
 * written (vault.documents.storage_provider). Readers used to ask whichever
 * provider is configured now, so the day a deployment moved from local disk to
 * S3 every document stored before read as missing. No recorded name (a row
 * older than the column) means the configured provider. An unimplemented or
 * unopenable one throws RecordedProviderUnavailable, and the configured store
 * is NOT asked in its place.
 */
export function getStorageProviderFor(recorded: string | null | undefined): IStorageProvider {
  if (recorded === null || recorded === undefined || recorded.trim() === '') return getStorageProvider();
  let name: 'local' | 's3';
  try {
    name = resolveStorageProviderName({ STORAGE_PROVIDER: recorded } as NodeJS.ProcessEnv);
  } catch {
    throw new RecordedProviderUnavailable(recorded, 'not a provider this server implements');
  }
  let configured: 'local' | 's3' | null;
  try {
    configured = resolveStorageProviderName();
  } catch {
    configured = null;
  }
  try {
    if (configured === name) return getStorageProvider();
    const cached = _byName.get(name);
    if (cached) return cached;
    const opened = name === 's3' ? new S3StorageProvider() : new LocalStorageProvider();
    _byName.set(name, opened);
    return opened;
  } catch (err) {
    throw new RecordedProviderUnavailable(recorded, err instanceof Error ? err.message : 'unknown');
  }
}

/** Reset singleton (for testing) */
export function resetStorageProvider(): void {
  _instance = null;
  _byName.clear();
}

// Re-export types
export type {
  IStorageProvider,
  StoragePutOptions,
  StoragePutResult,
  StorageGetResult,
  StorageSignedUrlResult,
} from './storage-provider';
