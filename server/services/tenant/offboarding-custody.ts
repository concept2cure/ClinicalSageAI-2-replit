/**
 * Custody of a departing tenant's export is a signed act (P-58, D6,
 * 2026-10-29; docs/evidence/D6-OFFBOARDING-CUSTODY/2026-10-29/).
 *
 * Retention is the sponsor's and the manufacturer's obligation (21 CFR 312.57
 * and 312.62, 21 CFR 820.180, ISO 13485 §4.2.5, EU GMP Annex 11 §17); the
 * platform is their processor. So before the purge erases a held record
 * (./held-records.ts), the customer's administrator signs that they received
 * the export and took custody of it, and where the organisation's retention
 * period has not ended for a record, the attestation lists it and states that
 * the customer accepts the obligation to keep it.
 *
 *   custodyAttestation   what is signed: the export (digest, receipt, and the
 *                        scope it was read in, which must be the
 *                        organization's own: P-58's data return), the
 *                        retention period in force (the Records retention
 *                        card's, services/vault/retention-period.ts), every
 *                        held record by store, those inside the period by id,
 *                        and the statement. Deterministic; its SHA-256 is what
 *                        the signer saw.
 *   custodyAct           the act, for the platform's one ceremony
 *                        (routes/governed-signed-act.ts signGovernedAct):
 *                        password, second factor where enrolled, the meaning
 *                        `responsibility`, a reason, the signing authority of
 *                        the membership role, the ledger pair and the
 *                        electronic_signatures row on one transaction. Target
 *                        'tenant-export-custody:<digest>'; the manifest's act
 *                        is the attestation.
 *   custodyForPurge      the purge's check, inside its transaction: a tenant
 *                        holding any held record is refused unless a valid
 *                        custody signature names the very receipt the purge
 *                        runs on, its manifest hashes to its signature_hash,
 *                        and the records it attested to are the records held
 *                        now (none added, none gone).
 *
 * @module server/services/tenant/offboarding-custody
 */
import type { SignedAct } from '../../routes/governed-signed-act';
import { CUSTODY_ACT_MEANINGS, CUSTODY_DOMAIN, CUSTODY_TARGET_PREFIX } from '../part11/custody-signature';
import { manifestSignatureHash, sha256CanonicalJson } from '../part11/signature-persistence';
import { COMPLETE_EXPORT_SCOPES, findExportReceipt } from '../tenant-export/tenant-full-export.service';
import { presentRetentionPeriod, readRetentionPeriod } from '../vault/retention-period';
import { countHeldRecords, heldRecordsWithinRetention, type RecordsWithinRetention } from './held-records';

type Queryable = { query: (sql: string, params?: unknown[]) => Promise<{ rows: any[] }> };

export { CUSTODY_ACT_MEANINGS };
export const custodyTarget = (digest: string) => `${CUSTODY_TARGET_PREFIX}${digest}`;
export const EXPORT_DIGEST = /^sha256:[0-9a-f]{64}$/;
/** The customer's administrators: the roles that may return a tenant's data (routes/tenant-export.ts). */
const CUSTODIAN_ROLES = new Set(['owner', 'admin']);

/** A refusal with nothing written; `status` is the HTTP answer. */
export class CustodyRefusal extends Error {
  constructor(readonly status: number, readonly code: string, message: string) {
    super(message);
    this.name = 'CustodyRefusal';
  }
}

export interface CustodyAttestation {
  kind: 'tenant-export-custody';
  version: 1;
  organizationId: number;
  organizationName: string;
  exportDigest: string;
  exportedAt: string | null;
  exportTableCount: number;
  exportRowCount: number;
  /** The scope the export was read in (COMPLETE_EXPORT_SCOPES): its own organization's, so its digest covers every row. */
  exportScope: string;
  retention: { years: number; isDefault: boolean; governingRule: string | null; reason: string | null };
  /** Every held record the export carries and the purge will erase, by store. */
  heldRecords: Record<string, number>;
  heldRecordTotal: number;
  /** The held records inside the retention period, every one by id. */
  withinRetention: RecordsWithinRetention[];
  withinRetentionTotal: number;
  statement: string;
}

const day = (v: unknown): string | null => (v == null ? null : new Date(v as string).toISOString().slice(0, 10));

function statementOf(a: Omit<CustodyAttestation, 'statement'>): string {
  const exported = `The undersigned, an administrator of ${a.organizationName}, has received the complete export of ` +
    `${a.organizationName}'s data with digest ${a.exportDigest}` + (a.exportedAt ? `, produced on ${a.exportedAt}` : '') +
    `, and has taken custody of it on ${a.organizationName}'s behalf. It holds ${a.heldRecordTotal} regulated records ` +
    'that the platform erases with the tenant once this is signed.';
  const period = `${a.retention.years} ${a.retention.years === 1 ? 'year' : 'years'}`;
  if (a.withinRetentionTotal === 0) return `${exported} None of them is inside ${a.organizationName}'s retention period of ${period}.`;
  const last = a.withinRetention.map((r) => r.retainUntil.last).filter((d): d is string => !!d).sort().pop();
  return `${exported} ${a.withinRetentionTotal} of them, listed in this attestation, are inside ${a.organizationName}'s ` +
    `retention period of ${period} and have not reached its end; ${a.organizationName} accepts the obligation to retain ` +
    `them, from this copy, until the end of each one's period${last ? ` (the last on ${last})` : ''}.`;
}

/** What a custody signature on `digest` attests, as of now, and its SHA-256. */
export async function custodyAttestation(db: Queryable, organizationId: number, digest: string): Promise<{ attestation: CustodyAttestation; attestationSha256: string }> {
  const receipt = EXPORT_DIGEST.test(digest) ? await findExportReceipt(db as never, organizationId, digest) : null;
  if (!receipt) {
    throw new CustodyRefusal(404, 'CUSTODY_RECEIPT_NOT_FOUND', 'No complete export of this organization has that digest. Produce a full export, then sign custody of it. Nothing was signed.');
  }
  // P-58's data return (2026-10-29): custody is signed only of an export read in the organization's
  // own scope. One read in the platform scope held none of its Vault documents or knowledge graph.
  if (!COMPLETE_EXPORT_SCOPES.includes(String(receipt.exportScope ?? ''))) {
    throw new CustodyRefusal(409, 'CUSTODY_EXPORT_SCOPE_UNVERIFIED', "That export's receipt does not show it was read in the organization's own scope, so it may hold none of its Vault documents or knowledge graph. Produce a new full export, then sign custody of it. Nothing was signed.");
  }
  const org = (await db.query('SELECT name FROM organizations WHERE id = $1', [organizationId])).rows[0];
  const period = presentRetentionPeriod(await readRetentionPeriod(db, organizationId));
  const heldRecords = await countHeldRecords(db, organizationId);
  const withinRetention = await heldRecordsWithinRetention(db, organizationId, period.years);
  const body: Omit<CustodyAttestation, 'statement'> = {
    kind: 'tenant-export-custody',
    version: 1,
    organizationId,
    organizationName: String(org?.name ?? `Organization ${organizationId}`),
    exportDigest: receipt.digest,
    exportedAt: day(receipt.createdAt),
    exportTableCount: Number(receipt.tableCount),
    exportRowCount: Number(receipt.rowCount),
    exportScope: String(receipt.exportScope),
    retention: { years: period.years, isDefault: period.isDefault, governingRule: period.governingRule, reason: period.reason },
    heldRecords,
    heldRecordTotal: Object.values(heldRecords).reduce((n, c) => n + c, 0),
    withinRetention,
    withinRetentionTotal: withinRetention.reduce((n, r) => n + r.count, 0),
  };
  const attestation = { ...body, statement: statementOf(body) };
  return { attestation, attestationSha256: sha256CanonicalJson(attestation) };
}

/** The signer is an administrator of the organisation, by the membership row. */
async function assertCustodian(db: Queryable, organizationId: number, userId: number): Promise<void> {
  const { rows } = await db.query(
    `SELECT ou.role FROM organization_users ou JOIN users u ON u.id = ou.user_id
      WHERE ou.organization_id = $1 AND ou.user_id = $2 AND u.status = 'active'`,
    [organizationId, userId],
  );
  if (rows.length !== 1 || !CUSTODIAN_ROLES.has(String(rows[0].role ?? '').trim().toLowerCase())) {
    throw new CustodyRefusal(403, 'CUSTODY_SIGNER_NOT_ADMIN', "Custody of an organization's export is signed by one of its administrators. Nothing was signed.");
  }
}

const CODE_STATUS = Object.freeze({
  CUSTODY_RECEIPT_NOT_FOUND: 404,
  CUSTODY_EXPORT_SCOPE_UNVERIFIED: 409,
  CUSTODY_SIGNER_NOT_ADMIN: 403,
  CUSTODY_TENANT_NOT_OFFBOARDING: 409,
  CUSTODY_ALREADY_SIGNED: 409,
  CUSTODY_ATTESTATION_CHANGED: 409,
});

/** Valid custody signatures on `digest` for the organisation, newest first; none where this database keeps no signatures. */
async function custodySignatures(db: Queryable, organizationId: number, digest: string) {
  // From the catalog first: inside the purge's transaction a failed statement would abort it.
  const present = await db.query(
    `SELECT EXISTS (SELECT 1 FROM pg_attribute WHERE attrelid = to_regclass('public.electronic_signatures')
                      AND attname = 'signed_target' AND NOT attisdropped) AS present`);
  if (present.rows[0]?.present !== true) return [];
  const { rows } = await db.query(
    `SELECT id, signer_id, signed_at, signature_meaning, signature_hash, signature_manifest
       FROM electronic_signatures
      WHERE organization_id = $1 AND signed_target = $2 AND signature_type = 'governed-action'
        AND superseded_by IS NULL AND is_valid IS DISTINCT FROM false
        AND COALESCE(verification_status, '') NOT IN ('revoked', 'voided')
      ORDER BY id DESC`,
    [organizationId, custodyTarget(digest)],
  );
  return rows as Array<{ id: number; signer_id: number; signed_at: Date; signature_meaning: string; signature_hash: string; signature_manifest: { act?: CustodyAttestation } | null }>;
}

/**
 * The custody act on `digest`, for signGovernedAct. `attestationSha256` is the
 * SHA-256 of the attestation the signer read (GET …/custody): the act refuses
 * when what it would sign is no longer that.
 */
export function custodyAct(digest: string, attestationSha256: string): SignedAct {
  const target = custodyTarget(digest);
  return {
    domain: CUSTODY_DOMAIN,
    target,
    meanings: CUSTODY_ACT_MEANINGS,
    codeStatus: CODE_STATUS,
    // The final export is taken once the tenant is frozen in pending_deletion,
    // and custody belongs on it: the one act signed from such an organisation.
    signerOrganizationStatuses: ['pending_deletion'],
    // Before the signing authority and the password: a member is refused without spending a guess.
    precheck: (client, orgId, userId) => assertCustodian(client as unknown as Queryable, orgId, userId),
    run: async (client, orgId, userId) => {
      const db = client as unknown as Queryable;
      const org = (await db.query('SELECT status FROM organizations WHERE id = $1 FOR UPDATE', [orgId])).rows[0];
      if (org?.status !== 'pending_deletion') {
        throw new CustodyRefusal(409, 'CUSTODY_TENANT_NOT_OFFBOARDING', 'Custody is signed for an organization scheduled for deletion. Nothing was signed.');
      }
      await assertCustodian(db, orgId, userId);
      if ((await custodySignatures(db, orgId, digest)).length > 0) {
        throw new CustodyRefusal(409, 'CUSTODY_ALREADY_SIGNED', 'Custody of this export is already signed. Nothing was signed.');
      }
      const now = await custodyAttestation(db, orgId, digest);
      if (now.attestationSha256 !== attestationSha256) {
        throw new CustodyRefusal(409, 'CUSTODY_ATTESTATION_CHANGED', 'The attestation changed since you read it. Read it again before signing. Nothing was signed.');
      }
      const a = now.attestation;
      return {
        target,
        payload: a as unknown as Record<string, unknown>,
        body: { custody: { digest: a.exportDigest, attestationSha256: now.attestationSha256, heldRecordTotal: a.heldRecordTotal, withinRetentionTotal: a.withinRetentionTotal } },
      };
    },
  };
}

export interface PurgeCustody {
  heldRecords: Record<string, number>;
  heldRecordTotal: number;
  /** The custody signature the purge relies on; null when the tenant holds no held record and none was signed. */
  signature: { id: number; signerId: number; signedAt: Date } | null;
  refusal?: { code: string; message: string };
}

/** The records attested to are the records held now, store by store. */
function staleStore(attested: Record<string, number> | undefined, now: Record<string, number>): string | null {
  const keys = new Set([...Object.keys(attested ?? {}), ...Object.keys(now)]);
  for (const k of keys) if (Number(attested?.[k] ?? 0) !== Number(now[k] ?? 0)) return `${k}: attested ${attested?.[k] ?? 0}, held now ${now[k] ?? 0}`;
  return null;
}

/**
 * The purge's custody check, on its own transaction client. A refusal is
 * returned, not thrown, so the purge raises it with its own error type.
 */
export async function custodyForPurge(db: Queryable, organizationId: number, digest: string): Promise<PurgeCustody> {
  const heldRecords = await countHeldRecords(db, organizationId);
  const heldRecordTotal = Object.values(heldRecords).reduce((n, c) => n + c, 0);
  const found = (await custodySignatures(db, organizationId, digest)).find((s) =>
    (CUSTODY_ACT_MEANINGS as readonly string[]).includes(s.signature_meaning)
    && manifestSignatureHash(s.signature_manifest) === s.signature_hash
    && s.signature_manifest?.act?.exportDigest === digest
    && Number(s.signature_manifest?.act?.organizationId) === organizationId);
  const signature = found ? { id: Number(found.id), signerId: Number(found.signer_id), signedAt: found.signed_at } : null;
  if (heldRecordTotal === 0) return { heldRecords, heldRecordTotal, signature };
  if (!found) {
    return { heldRecords, heldRecordTotal, signature, refusal: { code: 'CUSTODY_ATTESTATION_REQUIRED', message:
      `This organization holds ${heldRecordTotal} regulated records (signatures, audit trails, sealed reports, ledgers). ` +
      "One of its administrators signs custody of the export the purge runs on (POST /api/tenant-export/custody) before they are erased. Nothing was purged." } };
  }
  const stale = staleStore(found.signature_manifest?.act?.heldRecords, heldRecords);
  if (stale) {
    return { heldRecords, heldRecordTotal, signature, refusal: { code: 'CUSTODY_ATTESTATION_STALE', message:
      `The organization's held records changed after custody was signed (${stale}). Produce a new export, sign custody of it, and purge with its digest. Nothing was purged.` } };
  }
  return { heldRecords, heldRecordTotal, signature };
}
