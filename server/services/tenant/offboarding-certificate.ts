/**
 * The offboarding certificate: the one record the platform keeps of a purged
 * tenant (P-58, D6, 2026-10-29; migrations/20261029k_tenant_offboarding_custody.sql;
 * docs/evidence/D6-OFFBOARDING-CUSTODY/2026-10-29/).
 *
 * One row per purged tenant, written by the purge on its own transaction after
 * the deletes and the status change, before its chained audit row and COMMIT:
 * the export's digest and counts (the receipt the purge ran on), the rows
 * erased per table, the held records erased per store, the custody signature
 * the purge relied on, who purged and when, and the SHA-256 of those fields.
 * Counts, identifiers, digests and times: no customer content.
 *
 * It survives the purge by construction. The purge lists no such table, it is
 * append-only for every role (the database refuses UPDATE, DELETE and
 * TRUNCATE), and its keys to the organization (whose row survives, purged) and
 * to the custody signature (which the signed-records door keeps) have no
 * delete action. ci:purge-coverage reads it as a platform record, not residue
 * (PURGE_PLATFORM_RECORDS, ./purge-referrers.ts).
 *
 * A database without the table is refused, not skipped: a purge must not
 * complete with no certificate of itself.
 *
 * @module server/services/tenant/offboarding-certificate
 */
import type { PoolClient } from 'pg';
import { sha256CanonicalJson } from '../part11/signature-persistence';

export interface OffboardingCertificateInput {
  organizationId: number;
  export: { digest: string; tableCount: number; rowCount: number };
  deletedRows: Record<string, number>;
  tablesAbsent: string[];
  heldRecords: Record<string, number>;
  custodySignatureId: number | null;
  purgedBy: number;
  /** The instant organizations.purged_at records; a certificate is never dated by anything else. */
  purgedAt: Date | string | null;
}

export interface OffboardingCertificate {
  id: string;
  certificateSha256: string;
}

/** The certified fields, as hashed: what an inspector re-derives from the row. */
export function certifiedFields(c: OffboardingCertificateInput) {
  return {
    version: 1,
    organizationId: c.organizationId,
    exportDigest: c.export.digest,
    exportTableCount: c.export.tableCount,
    exportRowCount: c.export.rowCount,
    deletedRows: c.deletedRows,
    tablesAbsent: [...c.tablesAbsent].sort(),
    heldRecords: c.heldRecords,
    heldRecordTotal: Object.values(c.heldRecords).reduce((n, x) => n + x, 0),
    custodySignatureId: c.custodySignatureId,
    purgedBy: c.purgedBy,
    purgedAt: new Date(c.purgedAt as Date).toISOString(),
  };
}

/**
 * Write the certificate on the purge's transaction client. Null, and nothing
 * written, when this database has no certificate table or the purge instant
 * was not recorded: the purge then refuses.
 */
export async function recordOffboardingCertificate(client: PoolClient, c: OffboardingCertificateInput): Promise<OffboardingCertificate | null> {
  if (c.purgedAt == null || !Number.isFinite(new Date(c.purgedAt).getTime())) return null;
  const present = await client.query(`SELECT to_regclass('public.tenant_offboarding_certificates') IS NOT NULL AS present`);
  if (present.rows[0]?.present !== true) return null;
  const fields = certifiedFields(c);
  const certificateSha256 = sha256CanonicalJson(fields);
  const { rows } = await client.query(
    `INSERT INTO tenant_offboarding_certificates
       (organization_id, export_digest, export_table_count, export_row_count, deleted_rows, tables_absent,
        held_records, held_record_total, custody_signature_id, purged_by, purged_at, certificate_sha256)
     VALUES ($1, $2, $3, $4, $5::jsonb, $6::jsonb, $7::jsonb, $8, $9, $10, $11, $12)
     RETURNING id::text AS id`,
    [c.organizationId, fields.exportDigest, fields.exportTableCount, fields.exportRowCount, JSON.stringify(fields.deletedRows),
      JSON.stringify(fields.tablesAbsent), JSON.stringify(fields.heldRecords), fields.heldRecordTotal, c.custodySignatureId,
      c.purgedBy, fields.purgedAt, certificateSha256],
  );
  return { id: String(rows[0].id), certificateSha256 };
}
