/**
 * The stored copy of an upload the vault refused, or of a same-bytes retry
 * whose record keeps the copy it already names (vault-reupload.ts).
 *
 * `ingestVaultDocument` stores the bytes before it writes the record — the
 * record carries the storage version id, so it cannot come first — and every
 * refusal after that point used to leave the file in the tenant's storage under
 * no record, while telling the user nothing was saved. This module is the one
 * place that decides what happens to such a copy. It is separate from the
 * ingest only so the ingest module stays within its size limit; nothing else
 * should call it.
 */
import { pool } from '../../db.js';
import { createScopedLogger } from '../../utils/logger.js';
import { getStorageProvider } from '../storage/index.js';

const logger = createScopedLogger('vault-ingest');

/** The last sentence of a refusal that is only true once the stored copy is gone. */
export const NOTHING_SAVED = 'Nothing was saved.';

/**
 * A refusal's message, made true of what happened to the stored copy. When the
 * copy is gone (or was never stored) the refusal stands as written; otherwise
 * "Nothing was saved." is no longer true, and the message says what is.
 */
export function refusalAfterDiscard(
  message: string,
  fate: 'none' | 'discarded' | 'referenced' | 'retained',
): string {
  if (fate === 'retained') {
    return (
      `${message.replace(NOTHING_SAVED, 'No record was created.')} ` +
      'The uploaded file itself could not be removed from storage and is still held there, ' +
      'referenced by no record.'
    );
  }
  if (fate === 'referenced') {
    return (
      `${message.replace(NOTHING_SAVED, 'Whether it was recorded could not be confirmed.')} ` +
      'A vault record refers to the uploaded file, so it was kept — check the Vault before ' +
      'uploading it again.'
    );
  }
  return message;
}

/** What the admission put in storage, and whether a committed record now holds it. */
export interface StoredUpload {
  versionId: string | null;
  orgId: number | null;
  committed: boolean;
}

/**
 * Remove a stored copy that no committed record holds.
 *
 *   'none'       nothing was stored, or a record committed with it
 *   'discarded'  the copy is gone
 *   'referenced' a record refers to it after all, so it was kept
 *   'retained'   it could not be removed, or it could not be shown unreferenced
 *
 * Before deleting, it asks the database whether any record points at the
 * version. A COMMIT whose acknowledgement is lost leaves the row committed
 * while the caller sees an error, and deleting then would produce the one
 * state worse than a leak: a governed record whose bytes are gone. When that
 * question cannot be answered, the copy stays — a leak is recoverable, a
 * record pointing at nothing is not.
 */
export async function discardUnrecordedBytes(
  stored: StoredUpload,
): Promise<'none' | 'discarded' | 'referenced' | 'retained'> {
  if (!stored.versionId || stored.orgId === null || stored.committed) return 'none';
  const { versionId, orgId } = stored;
  try {
    if (await storedVersionIsReferenced(versionId, orgId)) {
      logger.error('Vault ingest reported a failure, but a record holds its stored bytes — kept', {
        versionId,
        orgId,
      });
      return 'referenced';
    }
  } catch (err) {
    logger.error('Vault ingest could not check whether refused bytes are referenced — kept', {
      versionId,
      orgId,
      err: err instanceof Error ? err.message : 'unknown',
    });
    return 'retained';
  }
  let removed: boolean;
  try {
    removed = await getStorageProvider().delete(versionId, orgId);
  } catch (err) {
    logger.error('Vault ingest could not remove refused bytes from storage', {
      versionId,
      orgId,
      err: err instanceof Error ? err.message : 'unknown',
    });
    return 'retained';
  }
  if (!removed) {
    logger.error('Vault ingest could not remove refused bytes from storage', { versionId, orgId });
    return 'retained';
  }
  logger.info('Vault ingest: a stored copy no record holds was removed', { versionId, orgId });
  return 'discarded';
}

/**
 * Whether any vault record in the organization points at this stored version.
 * Runs as the caller, under RLS — which is why the database suite proves it
 * sees an admitted record: a check that RLS blinded would answer "no" every
 * time, and the discard would then delete a record's bytes.
 */
export async function storedVersionIsReferenced(versionId: string, orgId: number): Promise<boolean> {
  const held = await pool.query(
    `SELECT 1 FROM vault.documents
      WHERE storage_version_id = $1 AND organization_id = $2 LIMIT 1`,
    [versionId, orgId],
  );
  return (held.rowCount ?? 0) > 0;
}
