/**
 * What a lifecycle sign-off is bound to (VR-12, row D5).
 *
 * A review or approval on the governed document pipeline used to be a
 * `csig:<uuid>` JSON object on the canonical row: no electronic_signatures row,
 * no printed name, bound to nothing. Each one is now a governed-action ledger
 * pair and one electronic_signatures row, written by the lifecycle route
 * (server/routes/document-lifecycle.ts, recordLifecycleSignature) next to the
 * re-verification that precedes it, on the transaction that records the
 * lifecycle change. This module holds what that write is bound to, and why:
 *
 *   - a document made from a Vault version binds that version's
 *     vault.documents.content_hash, read FOR SHARE (VAULT_DOCUMENT_VERSION);
 *   - a document naming no source the server can read binds the governed
 *     action's audit chain hash (GOVERNED_ACTION_LEDGER), labelled as not a
 *     content hash.
 *
 * Never a value from the request.
 *
 * @module server/services/regulatory/lifecycle-signature
 */
import { BINDING_BASIS, type SignatureDbClient } from '../part11/signature-persistence';
import type { ProjectionInput } from './documentLifecycleOrchestrator';

/**
 * The audit and signature target for a lifecycle document. The same string the
 * org-wide transition rows carry, so a document's history reads as one target.
 */
export const lifecycleTarget = (canonicalId: string): string => `canonical_document:${canonicalId}`;

/** electronic_signatures.signature_type and manifest kind of a lifecycle sign-off. */
export const LIFECYCLE_SIGNATURE_TYPE = 'regulated-document-lifecycle';

/** The §11.50(a)(3) meaning each lifecycle sign-off declares (GOVERNED_SIGN_MEANINGS). */
export const LIFECYCLE_DECLARED_MEANING = { reviewed: 'REVIEWED', approved: 'APPROVED' } as const;

/** A signature the document's source refuses, with the status the route answers. */
export class LifecycleSignatureRefusal extends Error {
  constructor(
    readonly code: 'VAULT_SOURCE_NOT_FOUND' | 'VAULT_SOURCE_UNREADABLE' | 'CONTENT_CHANGED',
    readonly status: 409 | 422,
    message: string,
  ) {
    super(message);
    this.name = 'LifecycleSignatureRefusal';
  }
}

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * The Vault version a document's sources name: its id, `null` when they name
 * none, or `'invalid'` when they name one that is not a version id.
 */
export function vaultSourceId(sources: unknown): string | null | 'invalid' {
  const ref = (sources as { vault_documents?: { nativeId?: unknown } } | null | undefined)?.vault_documents;
  if (ref == null) return null;
  const id = ref.nativeId;
  return typeof id === 'string' && UUID_RE.test(id) ? id : 'invalid';
}

export interface VaultSource {
  id: string;
  contentHash: string;
  createdBy: number | null;
}

/**
 * Read one Vault version of this organization that is not deleted, or null.
 * `lock` takes FOR SHARE, so the row cannot change under a signature over it
 * (its hash is frozen anyway: migrations/20260926_vault_documents_record_immutability.sql).
 */
export async function readVaultSource(
  client: SignatureDbClient,
  organizationId: number,
  vaultId: string,
  opts: { lock?: boolean } = {},
): Promise<VaultSource | null> {
  const { rows } = await client.query(
    `SELECT id::text AS id, content_hash, created_by
       FROM vault.documents
      WHERE id = $1::uuid AND organization_id = $2 AND deleted_at IS NULL${opts.lock ? '\n      FOR SHARE' : ''}`,
    [vaultId, organizationId],
  );
  const row = rows[0] as { id: string; content_hash: string; created_by: number | null } | undefined;
  if (!row) return null;
  return { id: row.id, contentHash: String(row.content_hash).trim(), createdBy: row.created_by ?? null };
}

/** What a lifecycle signature is bound to, and the content hash it covers. */
export interface LifecycleBinding {
  /** null ⇒ the audit chain hash is bound (GOVERNED_ACTION_LEDGER). */
  digest: string | null;
  basis: string;
  note: string;
  /** The content hash the sign-off covers (ApprovalSignature.boundContentHash). */
  contentHash: string;
}

/**
 * Derive the binding for a signature on `doc`, on the signing transaction.
 * Refuses when the document's Vault version cannot be read, or its hash is no
 * longer the one the document recorded: there is then no content to sign.
 */
export async function deriveLifecycleBinding(client: SignatureDbClient, doc: ProjectionInput): Promise<LifecycleBinding> {
  const vaultId = vaultSourceId(doc.sources);
  if (vaultId === null) {
    return {
      digest: null,
      basis: BINDING_BASIS.GOVERNED_ACTION_LEDGER,
      note:
        'The document names no source whose content the server can read, so no content digest is bound. The digest is the ' +
        "governed action's audit sha256 chain hash. It is not a content hash.",
      contentHash: doc.contentHash,
    };
  }
  const source = vaultId === 'invalid' ? null : await readVaultSource(client, doc.organizationId, vaultId, { lock: true });
  if (!source) {
    throw new LifecycleSignatureRefusal(
      'VAULT_SOURCE_UNREADABLE',
      409,
      'The Vault version this document was made from cannot be read in this organization, so there is no content to sign. Nothing was signed.',
    );
  }
  if (source.contentHash !== doc.contentHash) {
    throw new LifecycleSignatureRefusal(
      'CONTENT_CHANGED',
      409,
      "The Vault version's content hash is not the one this document recorded. Nothing was signed.",
    );
  }
  return {
    digest: source.contentHash,
    basis: BINDING_BASIS.VAULT_DOCUMENT_VERSION,
    note: `sha256 of Vault version ${source.id} (vault.documents.content_hash), read FOR SHARE in the signing transaction.`,
    contentHash: source.contentHash,
  };
}

/** Who is signing: the authenticated, authorized, re-verified user. */
export interface LifecycleSigner {
  userId: number;
  /** The server's reading of the signer's role, recorded on the canonical copy. */
  role: string;
  /** The factors reverifySigner verified, never more. */
  authenticationMethod: string;
  secondFactorVerified: boolean;
  ipAddress?: string | null;
}
