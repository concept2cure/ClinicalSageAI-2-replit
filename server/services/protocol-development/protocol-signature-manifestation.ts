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
import { BINDING_BASIS, GOVERNED_REVOCATION_SIGNATURE_TYPE, deriveGovernedTargetBinding, isSignatureWithdrawn, manifestSignatureHash, type SignatureDbClient } from '../part11/signature-persistence';
import { setTenantContextTx } from '../tenant/governed-tenant-context';

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
  | { state: 'changed'; signature: PdevSignature; historicalIntegrity: 'verified' }
  | { state: 'unverified'; signature: PdevSignature; historicalIntegrity: 'verified' | 'unverified' }
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
/** A coherent read belongs to one transaction. The explicit-executor caller
 * owns its transaction; standalone workspace/export reads open a restricted,
 * tenant-scoped repeatable-read snapshot and never mutate retained records. */
const snapshotBrand = Symbol('protocol-read-snapshot');
export type ProtocolReadSnapshot = { executor: SignatureDbClient; coherent: boolean; readonly [snapshotBrand]: true };

async function explicitSnapshotIsCoherent(executor: SignatureDbClient): Promise<boolean> {
  try {
    const row = (await executor.query(`SELECT current_setting('transaction_isolation') AS transaction_isolation,
      (SELECT xact_start < query_start FROM pg_stat_activity WHERE pid=pg_backend_pid()) AS active_transaction`)).rows[0];
    return row?.active_transaction === true
      && (row.transaction_isolation === 'repeatable read' || row.transaction_isolation === 'serializable');
  } catch { return false; }
}

export async function withProtocolReadSnapshot<T>(orgId: number, executor: SignatureDbClient | undefined, read: (client: SignatureDbClient, snapshot: ProtocolReadSnapshot) => Promise<T>): Promise<T> {
  if (executor) return read(executor, { executor, coherent: await explicitSnapshotIsCoherent(executor), [snapshotBrand]: true });
  const client = await pool.connect();
  try {
    await client.query('BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY');
    await setTenantContextTx(client, orgId);
    const result = await read(client, { executor: client, coherent: true, [snapshotBrand]: true });
    await client.query('COMMIT');
    return result;
  } catch (error) {
    await client.query('ROLLBACK').catch(() => undefined);
    throw error;
  } finally { client.release(); }
}

function historicalSignature(row: Record<string, unknown>): PdevSignature {
  const at = row.signed_at == null ? NaN : new Date(row.signed_at as string).getTime();
  const manifest = row.signature_manifest as Record<string, unknown> | null;
  const act = manifest?.act as Record<string, unknown> | undefined;
  return {
    signerName: str(row.signer_name),
    signedAt: Number.isNaN(at) ? '' : new Date(at).toISOString(),
    meaning: str(row.signature_meaning),
    reason: str(row.signature_purpose),
    recordedOnBehalfOf: act?.recordedOnBehalfOf ? str(act.recordedOnBehalfOf) : null,
  };
}

/** Verify the exact persisted manifest with the writer's recipe. A ledger-only
 * signature, unreadable manifest, contradictory binding or attribution is not
 * promoted into a protocol-content attestation. No retained field is repaired. */
function verifiedHistoricalManifest(row: Record<string, unknown>, orgId: number, target: string): boolean {
  const manifest = row.signature_manifest;
  if (!manifest || typeof manifest !== 'object' || Array.isArray(manifest)) return false;
  const m = manifest as Record<string, unknown>;
  const fieldsMatch = [
    [m.kind, 'governed-sign'], [m.command, 'sign'], [m.target, target], [m.organizationId, orgId],
    [m.signerId, row.signer_id], [m.signerName, row.signer_name], [m.signerEmail, row.signer_email],
    [m.meaning, row.signature_meaning], [m.reason, row.signature_purpose],
    [m.bindingBasis, BINDING_BASIS.PROTOCOL_DOCUMENT_CONTENT], [row.binding_basis, m.bindingBasis],
    [m.boundPayloadDigest, row.bound_payload_digest], [m.signedAt, historicalSignature(row).signedAt],
  ].every(([manifestValue, storedValue]) => manifestValue === storedValue);
  return fieldsMatch
    && typeof row.bound_payload_digest === 'string' && /^[a-f0-9]{64}$/.test(row.bound_payload_digest)
    && typeof row.signature_hash === 'string' && manifestSignatureHash(manifest) === row.signature_hash;
}

async function boundFacet(client: SignatureDbClient, orgId: number, target: string, row: Record<string, unknown>, coherent: boolean): Promise<PdevSignatureFacet> {
  const signature = historicalSignature(row);
  if (isSignatureWithdrawn(row)) return { state: 'revoked', signature };
  const validHistory = verifiedHistoricalManifest(row, orgId, target);
  const unverified: PdevSignatureFacet = { state: 'unverified', signature, historicalIntegrity: validHistory ? 'verified' : 'unverified' };
  if (!validHistory || !coherent) return unverified;
  try {
    const current = await deriveGovernedTargetBinding(client, target, orgId);
    if (current.basis !== BINDING_BASIS.PROTOCOL_DOCUMENT_CONTENT || !current.digest) return unverified;
    return current.digest === row.bound_payload_digest
      ? { state: 'signed', signature }
      : { state: 'changed', signature, historicalIntegrity: 'verified' };
  } catch { return unverified; }
}

async function readFacetsOnSnapshot(orgId: number, targets: string[], executor: SignatureDbClient, coherent: boolean): Promise<(target: string) => PdevSignatureFacet> {
  let rows: Array<Record<string, unknown>>;
  try {
    rows = (await executor.query(
      `SELECT id, signed_target, signer_id, signer_name, signer_email, signed_at, signature_meaning, signature_purpose,
              is_valid, superseded_by, verification_status, signature_hash, signature_manifest,
              binding_basis, bound_payload_digest
         FROM electronic_signatures
        WHERE organization_id = $1 AND signed_target = ANY($2) AND signature_type <> $3
        ORDER BY signed_at DESC, id DESC`,
      [orgId, targets, GOVERNED_REVOCATION_SIGNATURE_TYPE],
    )).rows;
  } catch { return () => ({ state: 'unavailable' }); }
  const byTarget = new Map<string, Record<string, unknown>>();
  for (const row of rows) {
    const target = str(row.signed_target);
    const held = byTarget.get(target);
    if (!held || (isSignatureWithdrawn(held) && !isSignatureWithdrawn(row))) byTarget.set(target, row);
  }
  const facets = new Map<string, PdevSignatureFacet>();
  // Sequential on the same snapshot client; a failed binding remains unverified.
  for (const [target, row] of byTarget) facets.set(target, await boundFacet(executor, orgId, target, row, coherent));
  return (target) => facets.get(target) ?? { state: 'none' };
}

export async function readSignatureFacets(orgId: number, targets: string[], executor?: SignatureDbClient, snapshot?: ProtocolReadSnapshot): Promise<(target: string) => PdevSignatureFacet> {
  if (targets.length === 0) return () => ({ state: 'none' });
  // The private brand can only come from this module's transaction wrapper;
  // an API body or arbitrary executor cannot assert a coherent snapshot.
  if (executor && snapshot?.executor === executor && snapshot[snapshotBrand] === true) return readFacetsOnSnapshot(orgId, targets, executor, snapshot.coherent);
  try {
    return await withProtocolReadSnapshot(orgId, executor, (client, current) => readFacetsOnSnapshot(orgId, targets, client, current.coherent));
  } catch { return () => ({ state: 'unavailable' }); }
}
