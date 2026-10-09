/**
 * Who signed a protocol, when, and as what: the §11.50 manifestation of the
 * protocol workspace's two signed acts (finalization, a reviewer's
 * disposition), read back from the electronic_signatures rows the signing
 * routes write (periodic review 2026-09-28, editor family, P11-C-2).
 *
 * Read side only. The rows are written by protocol-signature.ts through the
 * shared writer; the workspace read model (pdev-view-assembler.ts) and the
 * protocol export (protocol-export-service.ts) both read them here, so the
 * screen and the printout cannot disagree about who signed.
 *
 * @module server/services/protocol-development/protocol-signature-manifestation
 */
import { pool } from '../../db';
import { GOVERNED_REVOCATION_SIGNATURE_TYPE, isSignatureWithdrawn } from '../part11/signature-persistence';

const str = (v: unknown): string => (v == null ? '' : String(v));

/**
 * One signed act as its electronic_signatures row records it. The printed name
 * is `signer_name`, captured at signing: re-resolving the account at read time
 * would let a later rename rewrite who signed.
 */
export interface PdevSignature {
  signerName: string;
  /** ISO 8601, UTC. */
  signedAt: string;
  /** The declared §11.50(a)(3) meaning, as stored (authorship, review, …). */
  meaning: string;
  reason: string;
  /** Set when the signer recorded the decision of a reviewer with no account. */
  recordedOnBehalfOf: string | null;
}

/**
 * What the signature store says about one signed act. `none` is a read that
 * found no row; `unavailable` is a store that could not be read, which is not
 * the same thing and must never be shown as unsigned.
 */
export type PdevSignatureFacet =
  | { state: 'signed' | 'revoked'; signature: PdevSignature }
  | { state: 'none' }
  | { state: 'unavailable' };

/** The targets the two signing routes sign under (routes/protocol-development.ts
 *  finalize, routes/protocol-reviews.ts disposition). */
export const finalizationTarget = (docId: number | string): string => `protocol-document:${docId}`;
export const dispositionTarget = (assignmentId: number | string): string => `protocol-review-assignment:${assignmentId}`;

/**
 * The signature facet of each target, in one org-scoped query (periodic review
 * 2026-09-28, editor family, P11-C-2: finalization and dispositions were signed
 * and then shown nowhere). Joined on `signed_target`, which the signing routes
 * write; each act is signed once (finalize and setDispositionTx refuse a second
 * signing), so a live row wins and otherwise the newest withdrawn one is shown
 * as revoked. A missing table stays on this facet: reaching the route's 42P01
 * branch would blank the whole workspace.
 */
export async function readSignatureFacets(orgId: number, targets: string[]): Promise<(target: string) => PdevSignatureFacet> {
  if (targets.length === 0) return () => ({ state: 'none' });
  let rows: Array<Record<string, unknown>>;
  try {
    rows = (await pool.query(
      `SELECT signed_target, signer_name, signed_at, signature_meaning, signature_purpose,
              is_valid, superseded_by, verification_status,
              signature_manifest->'act'->>'recordedOnBehalfOf' AS recorded_on_behalf_of
         FROM electronic_signatures
        WHERE organization_id = $1 AND signed_target = ANY($2) AND signature_type <> $3
        ORDER BY signed_at DESC, id DESC`,
      [orgId, targets, GOVERNED_REVOCATION_SIGNATURE_TYPE],
    )).rows as Array<Record<string, unknown>>;
  } catch (err) {
    if ((err as { code?: string } | null)?.code === '42P01') return () => ({ state: 'unavailable' });
    throw err;
  }
  const byTarget = new Map<string, Record<string, unknown>>();
  for (const row of rows) {
    const held = byTarget.get(str(row.signed_target));
    if (!held || (isSignatureWithdrawn(held) && !isSignatureWithdrawn(row))) byTarget.set(str(row.signed_target), row);
  }
  return (target) => {
    const row = byTarget.get(target);
    if (!row) return { state: 'none' };
    const at = row.signed_at == null ? NaN : new Date(row.signed_at as string).getTime();
    return {
      state: isSignatureWithdrawn(row) ? 'revoked' : 'signed',
      signature: {
        signerName: str(row.signer_name),
        signedAt: Number.isNaN(at) ? '' : new Date(at).toISOString(),
        meaning: str(row.signature_meaning),
        reason: str(row.signature_purpose),
        recordedOnBehalfOf: row.recorded_on_behalf_of ? str(row.recorded_on_behalf_of) : null,
      },
    };
  };
}
