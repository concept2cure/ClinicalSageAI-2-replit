/**
 * Custody of a tenant's export, laid down as the platform ceremony leaves it,
 * for the dbtests whose subject is something else the purge does (P-58, D6,
 * 2026-10-29; docs/evidence/D6-OFFBOARDING-CUSTODY/2026-10-29/).
 *
 * Since P-58 a purge of a tenant that holds a regulated record (a signature,
 * an audit trail, a sealed report, a ledger, a review route) runs only on an
 * export receipt one of its administrators signed custody of. The ceremony
 * itself (POST /api/tenant-export/custody, signGovernedAct) is exercised end to
 * end by tenant-offboarding-custody.dbtest.ts. Here the signature is written
 * directly, in the shape custodyForPurge and the purge doors read: a
 * governed-action signature on the receipt's custody target, meaning
 * responsibility, whose manifest is the attestation (the held records, store by
 * store, counted now) and whose hash is the manifest's.
 *
 * A purged tenant keeps its offboarding certificate (a platform record the
 * database refuses to change or remove). A test that purges the same tenant
 * twice, or removes its organization afterwards, removes the certificate first
 * with forgetOffboardingCertificate: as the table owner with replication
 * triggers off, a teardown step and never a product path.
 */
import type { Pool, PoolClient } from 'pg';
import { countHeldRecords } from '../../server/services/tenant/held-records';
import { custodyTarget } from '../../server/services/tenant/offboarding-custody';
import { manifestSignatureHash } from '../../server/services/part11/signature-persistence';

type Db = Pool | PoolClient;

/** The custody signature's id. */
export async function signCustody(db: Db, organizationId: number, signerId: number, digest: string): Promise<number> {
  const act = {
    kind: 'tenant-export-custody', version: 1, organizationId, exportDigest: digest,
    heldRecords: await countHeldRecords(db, organizationId),
  };
  const manifest = { kind: 'governed-action', target: custodyTarget(digest), organizationId, meaning: 'responsibility', act };
  const { rows } = await db.query(
    `INSERT INTO electronic_signatures (organization_id, signed_target, signature_type, signature_purpose, signature_meaning,
       signer_id, signer_name, signer_email, authentication_method, authentication_timestamp, signature_hash, signature_manifest,
       is_valid, signed_at, binding_basis, bound_payload_digest)
     VALUES ($1, $2, 'governed-action', 'tenant export custody', 'responsibility', $3, 'Custody fixture', 'custody@example.invalid',
             'password', now(), $4, $5::json, true, now(), 'governed-action-sha256-chain', $6)
     RETURNING id`,
    [organizationId, manifest.target, signerId, manifestSignatureHash(manifest), JSON.stringify(manifest), 'c'.repeat(64)]);
  return Number(rows[0].id);
}

/** Teardown only: the organization's certificate and its custody signatures, past their guards. */
export async function forgetOffboardingCertificate(owner: Pool, organizationId: number): Promise<void> {
  const c = await owner.connect();
  try {
    await c.query("SET session_replication_role = 'replica'");
    const present = await c.query(`SELECT to_regclass('public.tenant_offboarding_certificates') IS NOT NULL AS present`);
    if (present.rows[0].present) {
      await c.query('DELETE FROM tenant_offboarding_certificates WHERE organization_id = $1', [organizationId]);
    }
    await c.query(`DELETE FROM electronic_signatures WHERE organization_id = $1 AND signed_target LIKE 'tenant-export-custody:%'`, [organizationId]);
  } finally {
    await c.query("SET session_replication_role = 'origin'").catch(() => undefined);
    c.release();
  }
}
