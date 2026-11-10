/**
 * Where an upload's bytes are durably kept (LX-02, 2026-11-05). Split from
 * uploaded-file-access.ts, the one module that resolves an upload id to bytes,
 * which reads and writes through these.
 *
 * Every upload used to live only at `process.cwd()/<storage_path>`, the serving
 * task's own container disk. Production runs two API tasks with no volume
 * there, so one task could not read the other's uploads, and each deploy erased
 * them all while their rows kept a checksum (finding DR-ANA-11,
 * docs/design/LINEAGE_END_TO_END_PLAN_2026-09-25.md hop A1). An organization's
 * upload now also goes to the one byte store vault ingest and rendered leaves
 * use (server/services/storage), recorded in file_uploads.storage_provider and
 * storage_object_id (migrations/20261105_file_uploads_durable_object.sql), and
 * loadUploadedFile reads it from there.
 *
 * storage_path stays the tenancy key, and the file at it stays as the task's
 * working copy, because AnA's path-based tools (document-workspace.ts) hand
 * that path to their workers. A row with no object recorded, written before
 * this or with no organization, is read from storage_path as before.
 */
import { createHash } from 'node:crypto';
import { createScopedLogger } from '../../utils/logger';

const logger = createScopedLogger('ana-upload-objects');

export interface UploadObject {
  /** The provider's name as getStorageProviderFor reads it ('local' | 's3'). */
  provider: string;
  /** The object's version id in that provider. */
  objectId: string;
}

/** The bucket path upload objects are kept under, beside 'rendered-leaves'. */
const UPLOAD_OBJECT_PROJECT = 'uploads';

/**
 * The organization that owns an upload's durable copy: one that resolves to a
 * positive integer id, the rule the upload route's source identity applies.
 * Anything else has no durable copy and is kept at its local path only.
 */
export function durableOrganizationId(value: unknown): number | null {
  if (value === null || value === undefined || value === '') return null;
  const id = Number(value);
  return Number.isSafeInteger(id) && id > 0 ? id : null;
}

/**
 * Store an upload's bytes in the configured byte store. Named by the server's
 * own file id, never the person's file name (the store refuses a name with a
 * path in it; the name stays in original_name). Throws when the store cannot
 * take them, or records other bytes than these: the caller refuses the upload.
 */
export async function putUploadObject(
  organizationId: number,
  fileId: string,
  mimeType: string,
  bytes: Buffer,
): Promise<UploadObject> {
  if (durableOrganizationId(organizationId) === null) {
    throw new Error('An upload is stored in the byte store only for an identified organization.');
  }
  const { getStorageProvider } = await import('../storage/index.js');
  const put = await getStorageProvider().put({
    orgId: organizationId,
    projectId: UPLOAD_OBJECT_PROJECT,
    filename: fileId,
    bytes,
    mime: mimeType,
    metadata: { fileUploadId: fileId },
  });
  const sha256 = createHash('sha256').update(bytes).digest('hex');
  if (put.sha256 !== sha256 || put.sizeBytes !== bytes.length) {
    throw new Error('The byte store recorded different bytes than the upload received.');
  }
  return { provider: put.provider, objectId: put.vaultVersionId };
}

/**
 * Remove an object this request stored, when the rows naming it were never
 * committed. Best effort: an orphaned object names no record and serves no one.
 */
export async function discardUploadObject(object: UploadObject, organizationId: number): Promise<void> {
  try {
    const { getStorageProviderFor } = await import('../storage/index.js');
    await getStorageProviderFor(object.provider).delete(object.objectId, organizationId);
  } catch (err) {
    logger.warn('upload object cleanup failed', { objectId: object.objectId, err: err instanceof Error ? err.message : String(err) });
  }
}

/** The object a file_uploads row records, or null for a row read from its local path. */
export function recordedUploadObject(row: { storage_provider?: string | null; storage_object_id?: string | null }): UploadObject | null {
  const provider = typeof row.storage_provider === 'string' ? row.storage_provider.trim() : '';
  const objectId = typeof row.storage_object_id === 'string' ? row.storage_object_id.trim() : '';
  return provider && objectId ? { provider, objectId } : null;
}

export type UploadObjectRead =
  | { ok: true; bytes: Buffer }
  /** No such object for this organization. */
  | { ok: false; code: 'missing' }
  /** The store's own record of the object does not match its bytes. */
  | { ok: false; code: 'integrity'; cause: unknown }
  /** The store could not be read now; the bytes may well exist. */
  | { ok: false; code: 'unavailable'; cause: unknown };

/**
 * Read an upload's bytes from the provider that recorded them, scoped to the
 * owning organization. A missing object and an unreadable store are different
 * answers: the second may succeed on retry and is never reported as the first.
 */
export async function readUploadObject(object: UploadObject, organizationId: number): Promise<UploadObjectRead> {
  const [{ getStorageProviderFor }, { StorageIntegrityError }] = await Promise.all([
    import('../storage/index.js'),
    import('../storage/storage-provider.js'),
  ]);
  try {
    const got = await getStorageProviderFor(object.provider).get(object.objectId, organizationId);
    return got ? { ok: true, bytes: got.bytes } : { ok: false, code: 'missing' };
  } catch (cause) {
    return cause instanceof StorageIntegrityError
      ? { ok: false, code: 'integrity', cause }
      : { ok: false, code: 'unavailable', cause };
  }
}
