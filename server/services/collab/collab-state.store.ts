/**
 * Durable store for CRDT collaboration state.
 *
 * Backs the Hocuspocus `onLoadDocument` / `onStoreDocument` hooks, which
 * previously only logged. Everything here is keyed on (tenant, documentName)
 * — the composite primary key of `collab_document_state` — so a load can never
 * return another tenant's document even if a caller passed the wrong tenant.
 *
 * `state` is the raw Y.js update from `Y.encodeStateAsUpdate`. This module
 * moves those bytes and never interprets them: decoding belongs to the caller
 * that owns a Y.Doc.
 *
 * Provisioning: the table ships in
 * db/migrations/20260727_collab_document_state.sql. When it is absent every
 * function here reports that distinctly (`missing`) rather than behaving like
 * an empty document — a collaboration server that silently starts every
 * document blank because its table was never created would look identical to
 * one working correctly right up until the first reconnect.
 */

import { pool } from '../../db';
import { createScopedLogger } from '../../utils/logger';

const log = createScopedLogger('collab-state');

/** Postgres "undefined_table" — the store has not been provisioned. */
const UNDEFINED_TABLE = '42P01';

export interface CollabDocumentState {
  state: Buffer;
  stateVector: Buffer | null;
  sizeBytes: number;
  updatedAt: Date;
  updatedBy: string | null;
}

/**
 * Outcome of a load. `missing` (table not provisioned) is deliberately distinct
 * from `absent` (provisioned, no row yet — a genuinely new document), because
 * the first is an operational fault and the second is normal.
 */
export type LoadResult =
  | { status: 'found'; document: CollabDocumentState }
  | { status: 'absent' }
  | { status: 'missing' };

export type StoreResult = { status: 'stored' } | { status: 'missing' };

function isUndefinedTable(error: unknown): boolean {
  return (
    typeof error === 'object' &&
    error !== null &&
    (error as { code?: string }).code === UNDEFINED_TABLE
  );
}

/**
 * Read the persisted CRDT state for one document.
 */
export async function loadCollabState(
  tenantId: number,
  documentName: string
): Promise<LoadResult> {
  try {
    const { rows } = await pool.query(
      `SELECT state, state_vector, size_bytes, updated_at, updated_by
         FROM collab_document_state
        WHERE tenant_id = $1 AND document_name = $2
        LIMIT 1`,
      [tenantId, documentName]
    );
    if (rows.length === 0) return { status: 'absent' };
    const row = rows[0];
    return {
      status: 'found',
      document: {
        state: row.state as Buffer,
        stateVector: (row.state_vector as Buffer | null) ?? null,
        sizeBytes: Number(row.size_bytes ?? 0),
        updatedAt: row.updated_at as Date,
        updatedBy: (row.updated_by as string | null) ?? null,
      },
    };
  } catch (error) {
    if (isUndefinedTable(error)) {
      log.error('collab_document_state is not provisioned — collaboration cannot persist', {
        documentName,
      });
      return { status: 'missing' };
    }
    throw error;
  }
}

/**
 * Write the CRDT state for one document, replacing whatever was there.
 *
 * An UPSERT rather than an append: Y.encodeStateAsUpdate already returns the
 * complete document including its history, so the newest write supersedes the
 * previous row by construction. Hocuspocus debounces these calls (2s, 10s max),
 * so this is not on the per-keystroke path.
 */
export async function storeCollabState(params: {
  tenantId: number;
  documentName: string;
  state: Buffer;
  stateVector: Buffer | null;
  authoringDocId: string | null;
  updatedBy: string | null;
}): Promise<StoreResult> {
  const { tenantId, documentName, state, stateVector, authoringDocId, updatedBy } = params;
  try {
    await pool.query(
      `INSERT INTO collab_document_state
         (tenant_id, document_name, state, state_vector, size_bytes, authoring_doc_id, updated_by, updated_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7, NOW())
       ON CONFLICT (tenant_id, document_name) DO UPDATE
         SET state = EXCLUDED.state,
             state_vector = EXCLUDED.state_vector,
             size_bytes = EXCLUDED.size_bytes,
             authoring_doc_id = EXCLUDED.authoring_doc_id,
             updated_by = EXCLUDED.updated_by,
             updated_at = NOW()`,
      [
        tenantId,
        documentName,
        state,
        stateVector,
        state.byteLength,
        authoringDocId,
        updatedBy,
      ]
    );
    return { status: 'stored' };
  } catch (error) {
    if (isUndefinedTable(error)) {
      log.error('collab_document_state is not provisioned — edits are NOT being persisted', {
        documentName,
      });
      return { status: 'missing' };
    }
    throw error;
  }
}
