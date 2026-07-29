/**
 * Document-level authorization for the CRDT collaboration socket.
 *
 * Hocuspocus multiplexes documents over one connection and hands the
 * authenticator a `documentName` chosen entirely by the client. Before this
 * module existed the name was accepted verbatim — the authenticator checked
 * only that the JWT was signed, then let the connection open whatever it
 * asked for. Any authenticated user of any tenant could open any other
 * tenant's document by knowing (or guessing) its id.
 *
 * A documentName is therefore parsed into a typed resource before anything
 * else happens, and a name that does not match the grammar is refused. Failing
 * closed on an unrecognised resource kind is deliberate: a future collaborative
 * surface must add its authorization rule here to work at all, rather than
 * silently inheriting "anyone may open it".
 *
 * GRAMMAR
 *   authoring:<documentUuid>                   — the whole authored document
 *   authoring:<documentUuid>:<sectionUuid>     — one section of it
 *
 * Both ids are validated as UUIDs before reaching Postgres, so a malformed name
 * is a 4xx-class refusal rather than a 22P02 from the driver.
 */

import { pool } from '../../db';
import { createScopedLogger } from '../../utils/logger';

const log = createScopedLogger('collab-authz');

/** Postgres "undefined_table" — the authoring lineage is not provisioned. */
const UNDEFINED_TABLE = '42P01';

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export interface AuthoringDocumentResource {
  kind: 'authoring-document';
  documentId: string;
  sectionId: string | null;
}

export type CollabResource = AuthoringDocumentResource;

/**
 * Parse a client-supplied documentName. Returns null for anything that is not
 * a recognised, well-formed resource — the caller must refuse the connection.
 */
export function parseDocumentName(documentName: string): CollabResource | null {
  if (typeof documentName !== 'string' || documentName.length === 0) return null;
  const parts = documentName.split(':');
  if (parts[0] !== 'authoring') return null;

  if (parts.length === 2) {
    const [, documentId] = parts;
    if (!UUID_RE.test(documentId)) return null;
    return { kind: 'authoring-document', documentId, sectionId: null };
  }

  if (parts.length === 3) {
    const [, documentId, sectionId] = parts;
    if (!UUID_RE.test(documentId) || !UUID_RE.test(sectionId)) return null;
    return { kind: 'authoring-document', documentId, sectionId };
  }

  return null;
}

/**
 * The authoring document id a resource belongs to, for cascade bookkeeping in
 * the state store. Null when the resource kind has no authoring document.
 */
export function authoringDocIdOf(resource: CollabResource): string | null {
  return resource.kind === 'authoring-document' ? resource.documentId : null;
}

/**
 * `unavailable` means the check itself could not be performed — the authoring
 * tables are missing, or the query failed. Callers must treat it exactly like
 * `denied`; it is reported separately only so the operator sees a provisioning
 * fault instead of a stream of apparent permission errors.
 */
export type AuthorizationResult = 'authorized' | 'denied' | 'unavailable';

/**
 * Authorize a parsed resource against a tenant.
 *
 * Fails CLOSED on every uncertainty, which is a different policy from the HTTP
 * org-membership re-check (that one fails open so a database blip cannot take
 * the whole API down). The asymmetry is intentional: a request that fails open
 * on membership is still constrained by the tenant filters in the handler it
 * reaches, whereas a collaboration socket that opens without this check has
 * unmediated read AND write access to the document's full CRDT state for the
 * life of the connection. There is no downstream guard behind it.
 */
export async function authorizeResource(
  resource: CollabResource,
  tenantId: number
): Promise<AuthorizationResult> {
  try {
    const { rows } = await pool.query(
      `SELECT 1
         FROM authoring_documents
        WHERE id = $1::uuid AND tenant_id = $2
        LIMIT 1`,
      [resource.documentId, tenantId]
    );
    if (rows.length === 0) return 'denied';

    if (resource.sectionId) {
      const section = await pool.query(
        `SELECT 1
           FROM authoring_sections
          WHERE id = $1::uuid AND doc_id = $2::uuid AND tenant_id = $3
          LIMIT 1`,
        [resource.sectionId, resource.documentId, tenantId]
      );
      if (section.rows.length === 0) return 'denied';
    }

    return 'authorized';
  } catch (error) {
    if (
      typeof error === 'object' &&
      error !== null &&
      (error as { code?: string }).code === UNDEFINED_TABLE
    ) {
      log.error('authoring tables are not provisioned — refusing all collaboration', {
        documentId: resource.documentId,
      });
      return 'unavailable';
    }
    log.error('collaboration authorization query failed — refusing the connection', {
      documentId: resource.documentId,
      error: error instanceof Error ? error.message : String(error),
    });
    return 'unavailable';
  }
}
