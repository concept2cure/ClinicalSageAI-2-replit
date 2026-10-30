/**
 * Governed tenant offboarding — request, cancel, purge.
 *
 * ── What this replaces ────────────────────────────────────────────────────────
 * `DELETE /api/tenants/:id` used to run an immediate cascade delete of the
 * organization and its child rows inside one transaction. One authenticated
 * call, no export, no waiting period, no way back. For a platform holding IND
 * applications, 510(k) submissions and clinical protocols that is the wrong
 * shape of control in three separate ways:
 *
 *   • 21 CFR Part 11 §11.10(e) requires record changes — including deletion —
 *     to be captured in a secure, computer-generated audit trail that does not
 *     obscure previously recorded information. A cascade delete destroys the
 *     evidence along with the record.
 *   • Every enterprise MSA on this product commits to a data-return window
 *     before destruction. Deleting first makes that unmeetable.
 *   • Sponsors are subject to their own record-retention obligations (ICH E6
 *     (R2) §5.5.11 and 21 CFR 312.62(c) both run to years after a study
 *     closes). A vendor that can irrecoverably delete on an API call is a
 *     finding in the sponsor's own audit.
 *
 * ── The lifecycle ─────────────────────────────────────────────────────────────
 *   requestDeletion()  active          → pending_deletion  (read-only, exportable)
 *   cancelDeletion()   pending_deletion → active
 *   purgeTenant()      pending_deletion → purged           (only after the window)
 *
 * `pending_deletion` is enforced by the lifecycle guard as READ-ONLY, not as a
 * denial: the customer keeps sight of, and can export, their own regulatory
 * record for the whole retention window. That is the entire point of the state.
 *
 * ── Purge is deliberately not a scheduled job ─────────────────────────────────
 * `purge_eligible_at` records when destruction *becomes permissible*, and
 * nothing acts on it automatically. Irreversible destruction of regulated
 * records stays an explicit, attributable operator action with its own audit
 * entry. A cron that quietly destroyed tenants on a timer would be a far worse
 * control than the hard delete this replaces, because it would do it unattended.
 *
 * @module server/services/tenant/tenant-offboarding
 */

import type { Pool, PoolClient } from 'pg';
import { createScopedLogger } from '../../utils/logger';
import { invalidateTenantPosture } from './tenant-lifecycle';
import { invalidateOrgMembershipCache } from '../../middleware/orgMembership';
import { COMPLETE_EXPORT_SCOPES, findExportReceipt, type ExportReceipt } from '../tenant-export/tenant-full-export.service';
import { readLockedCompanyDocumentSettings, readCompanyDocumentsExportEnvelope, companyDocumentsExportDescriptor,
  type CompanyDocumentsExportDescriptor } from '../tenant-export/company-document-envelope';
import { PURGE_PARENT_SCOPED } from './purge-parent-scope';
import { PURGE_PLATFORM_RECORDS, PURGE_REFERRER_TABLES, PURGE_REFERRERS_NOT_ERASED } from './purge-referrers';
import { HELD_RECORD_DOORS } from './purge-held-doors';
import { recordOffboardingCertificate, type OffboardingCertificate } from './offboarding-certificate';
import { getStorageProviderFor } from '../storage';
import { recordPurge, type PurgeAuditContext } from './tenant-purge-audit';
import { reserveSourceReadReceiptPurge } from './tenant-source-read-receipt-purge';
import { disposeCompanyDesigns } from '../tenant-export/company-design-disposal';
import { custodyForPurge } from './offboarding-custody';

const logger = createScopedLogger('tenant-offboarding');

/**
 * Default retention window between a deletion request and the earliest
 * permissible purge. Thirty days is the shortest window that appears in this
 * product's standard MSA; longer contractual windows are passed explicitly by
 * the caller. Configurable so a sovereign/on-prem deployment can lengthen it,
 * but never shortenable below the floor below.
 */
export const DEFAULT_RETENTION_DAYS = 30;

/**
 * Hard floor on the retention window. A caller cannot request a purge sooner
 * than this no matter what it passes — the point of the window is that it is not
 * negotiable in the heat of an offboarding conversation.
 */
export const MINIMUM_RETENTION_DAYS = 7;

export class OffboardingStateError extends Error {
  readonly code: string;
  constructor(code: string, message: string) {
    super(message);
    this.name = 'OffboardingStateError';
    this.code = code;
  }
}

export interface OffboardingRecord {
  organizationId: number;
  name: string;
  status: string;
  deletionRequestedAt: Date | null;
  deletionRequestedBy: number | null;
  deletionReason: string | null;
  purgeEligibleAt: Date | null;
  purgedAt: Date | null;
  finalExportDigest: string | null;
}

function resolveRetentionDays(requested?: number): number {
  if (requested === undefined || !Number.isFinite(requested)) return DEFAULT_RETENTION_DAYS;
  return Math.max(MINIMUM_RETENTION_DAYS, Math.trunc(requested));
}

async function readOrganization(
  pool: Pool,
  organizationId: number
): Promise<OffboardingRecord | null> {
  const { rows } = await pool.query(
    `SELECT id, name, status,
            deletion_requested_at, deletion_requested_by, deletion_reason,
            purge_eligible_at, purged_at, final_export_digest
       FROM organizations
      WHERE id = $1`,
    [organizationId]
  );
  if (!rows.length) return null;
  const r = rows[0];
  return {
    organizationId: r.id,
    name: r.name,
    status: r.status,
    deletionRequestedAt: r.deletion_requested_at,
    deletionRequestedBy: r.deletion_requested_by,
    deletionReason: r.deletion_reason,
    purgeEligibleAt: r.purge_eligible_at,
    purgedAt: r.purged_at,
    finalExportDigest: r.final_export_digest,
  };
}

/**
 * Stop the organisation's live AnA runs with `session_ended` (AnA detach
 * §2.9). Lazy, so offboarding does not load run control until it needs it;
 * never throws (stopRunsFor logs its own failure).
 */
async function stopOrganisationRuns(
  pool: Pool,
  organizationId: number,
  cause: 'deletion_requested' | 'purge',
  byUserId: number,
): Promise<void> {
  const { stopRunsFor } = await import('../ana/run-control.js');
  await stopRunsFor(pool, { organizationId }, { cause, byUserId });
}

/**
 * Move an active organization into `pending_deletion` and start the retention
 * clock. Idempotent for an organization already pending deletion: the original
 * request time and eligibility instant are preserved, so re-requesting cannot be
 * used to shorten the window.
 */
export async function requestDeletion(
  pool: Pool,
  params: {
    organizationId: number;
    requestedByUserId: number;
    reason: string;
    retentionDays?: number;
  }
): Promise<OffboardingRecord> {
  const { organizationId, requestedByUserId, reason } = params;
  const retentionDays = resolveRetentionDays(params.retentionDays);

  const existing = await readOrganization(pool, organizationId);
  if (!existing) {
    throw new OffboardingStateError('TENANT_NOT_FOUND', 'Organization not found');
  }
  if (existing.status === 'purged' || existing.purgedAt) {
    throw new OffboardingStateError(
      'TENANT_ALREADY_PURGED',
      'This organization has already been purged'
    );
  }
  if (existing.status === 'pending_deletion') {
    // Already counting down. Returning the existing record rather than
    // re-stamping it is what stops a second request from resetting — or, worse,
    // shortening — a window that a customer is relying on.
    logger.info('Deletion re-requested for an organization already pending deletion; no change', {
      organizationId,
      purgeEligibleAt: existing.purgeEligibleAt,
    });
    return existing;
  }

  const { rows } = await pool.query(
    `UPDATE organizations
        SET status                = 'pending_deletion',
            deletion_requested_at = NOW(),
            deletion_requested_by = $2,
            deletion_reason       = $3,
            purge_eligible_at     = NOW() + ($4 || ' days')::interval,
            updated_at            = NOW()
      WHERE id = $1
      RETURNING id, name, status, deletion_requested_at, deletion_requested_by,
                deletion_reason, purge_eligible_at, purged_at, final_export_digest`,
    [organizationId, requestedByUserId, reason, String(retentionDays)]
  );

  invalidateTenantPosture(organizationId);
  // A deleting organisation is read-only: its live AnA runs stop now, not at
  // their next round (AnA detach §2.9, session_ended). Never throws.
  await stopOrganisationRuns(pool, organizationId, 'deletion_requested', requestedByUserId);

  const r = rows[0];
  logger.warn('Tenant offboarding requested', {
    organizationId,
    requestedByUserId,
    retentionDays,
    purgeEligibleAt: r.purge_eligible_at,
  });

  return {
    organizationId: r.id,
    name: r.name,
    status: r.status,
    deletionRequestedAt: r.deletion_requested_at,
    deletionRequestedBy: r.deletion_requested_by,
    deletionReason: r.deletion_reason,
    purgeEligibleAt: r.purge_eligible_at,
    purgedAt: r.purged_at,
    finalExportDigest: r.final_export_digest,
  };
}

/**
 * Return a `pending_deletion` organization to `active`. Available at any point
 * before the purge actually runs — a retention window that cannot be called off
 * is a window that turns a mistaken click into a lost customer.
 */
export async function cancelDeletion(
  pool: Pool,
  params: { organizationId: number; cancelledByUserId: number }
): Promise<OffboardingRecord> {
  const { organizationId, cancelledByUserId } = params;

  const existing = await readOrganization(pool, organizationId);
  if (!existing) {
    throw new OffboardingStateError('TENANT_NOT_FOUND', 'Organization not found');
  }
  if (existing.purgedAt || existing.status === 'purged') {
    throw new OffboardingStateError(
      'TENANT_ALREADY_PURGED',
      'This organization has been purged and cannot be restored'
    );
  }
  if (existing.status !== 'pending_deletion') {
    throw new OffboardingStateError(
      'TENANT_NOT_PENDING_DELETION',
      'This organization is not scheduled for deletion'
    );
  }

  const { rows } = await pool.query(
    `UPDATE organizations
        SET status                = 'active',
            deletion_requested_at = NULL,
            deletion_requested_by = NULL,
            deletion_reason       = NULL,
            purge_eligible_at     = NULL,
            updated_at            = NOW()
      WHERE id = $1
      RETURNING id, name, status, deletion_requested_at, deletion_requested_by,
                deletion_reason, purge_eligible_at, purged_at, final_export_digest`,
    [organizationId]
  );

  invalidateTenantPosture(organizationId);
  logger.warn('Tenant offboarding cancelled', { organizationId, cancelledByUserId });

  const r = rows[0];
  return {
    organizationId: r.id,
    name: r.name,
    status: r.status,
    deletionRequestedAt: r.deletion_requested_at,
    deletionRequestedBy: r.deletion_requested_by,
    deletionReason: r.deletion_reason,
    purgeEligibleAt: r.purge_eligible_at,
    purgedAt: r.purged_at,
    finalExportDigest: r.final_export_digest,
  };
}

export interface PurgePreconditions {
  /**
   * Digest of the full export handed to the customer. Required, and VERIFIED:
   * `assertPurgePermitted` looks it up in `tenant_export_receipts` scoped to this
   * organization, so a fabricated string — or a real digest belonging to a
   * different tenant — does not open the gate.
   *
   * Obtain it from `GET /api/tenant-export/full`, which returns it in the body
   * and in the `X-Export-Digest` response header.
   */
  finalExportDigest: string;
  /**
   * Set only for a purge that must run before the retention window closes —
   * a regulator-ordered or customer-demanded immediate destruction. Recorded in
   * the audit entry so the exception is visible, never silent.
   */
  overrideRetentionWindowReason?: string;
}

/**
 * Who purged is the first thing the purge's audit row records. The route
 * resolved a missing user id to 0, which the purge accepted and stamped as
 * `purged_by`: an irreversible destruction attributed to nobody.
 */
function assertPurgeAttributable(purgedByUserId: number): void {
  if (!Number.isSafeInteger(purgedByUserId) || purgedByUserId <= 0) {
    throw new OffboardingStateError(
      'PURGE_ACTOR_REQUIRED',
      'A purge must be attributable to an authenticated person; this request carries no user id.'
    );
  }
}

/**
 * Every reason a purge may not proceed, checked before a single row is touched.
 * Throws `OffboardingStateError`; returns the organization and the export
 * receipt that authorizes the purge (which the purge's audit row records).
 */
/**
 * P-58's data return (2026-10-29): an export read in the platform scope returned
 * none of the organization's Vault documents or knowledge graph, and nothing
 * failed. Only an export read in the organization's own scope (or unrestricted)
 * records its scope on its receipt; a receipt recorded before then records none.
 */
function assertCompleteExportScope(receipt: ExportReceipt): void {
  if (COMPLETE_EXPORT_SCOPES.includes(String(receipt.exportScope ?? ''))) return;
  throw new OffboardingStateError(
    'EXPORT_SCOPE_UNVERIFIED',
    "That export's receipt does not show it was read in the organization's own scope, so it may hold " +
      'none of its Vault documents or knowledge graph. Produce a new full export (GET /api/tenant-export/full), ' +
      'sign custody of it, and purge with its digest. Nothing was purged.'
  );
}

async function assertPurgePermitted(
  pool: Pool,
  organizationId: number,
  purgedByUserId: number,
  preconditions: PurgePreconditions
): Promise<{ existing: OffboardingRecord; receipt: ExportReceipt }> {
  assertPurgeAttributable(purgedByUserId);

  const digest = preconditions.finalExportDigest?.trim();
  if (!digest) {
    throw new OffboardingStateError(
      'EXPORT_EVIDENCE_REQUIRED',
      'A final export digest is required before a tenant may be purged'
    );
  }

  // VERIFY the digest, do not merely require one.
  //
  // An earlier revision accepted any non-empty string here. That is the failure
  // mode this whole module exists to prevent, reproduced in miniature: a control
  // that reads as evidence and checks nothing. The receipt is written by the full
  // export (services/tenant-export/tenant-full-export.service.ts) and is scoped to
  // the organization, so a digest from a DIFFERENT tenant's export is rejected
  // too — which is the mistake an operator running several offboardings in one
  // afternoon would actually make.
  const receipt = await findExportReceipt(pool, organizationId, digest);
  if (!receipt) {
    throw new OffboardingStateError(
      'EXPORT_EVIDENCE_UNVERIFIED',
      'No export receipt matches that digest for this organization. Produce a full ' +
        'export (GET /api/tenant-export/full) and purge with the digest it returns.'
    );
  }
  assertCompleteExportScope(receipt);

  const existing = await readOrganization(pool, organizationId);
  if (!existing) {
    throw new OffboardingStateError('TENANT_NOT_FOUND', 'Organization not found');
  }
  if (existing.purgedAt || existing.status === 'purged') {
    throw new OffboardingStateError('TENANT_ALREADY_PURGED', 'This organization is already purged');
  }
  if (existing.status !== 'pending_deletion') {
    throw new OffboardingStateError(
      'TENANT_NOT_PENDING_DELETION',
      'A tenant must be scheduled for deletion before it can be purged'
    );
  }

  const eligibleAt = existing.purgeEligibleAt ? new Date(existing.purgeEligibleAt).getTime() : null;
  const windowClosed = eligibleAt !== null && Date.now() >= eligibleAt;
  if (!windowClosed && !preconditions.overrideRetentionWindowReason?.trim()) {
    throw new OffboardingStateError(
      'RETENTION_WINDOW_OPEN',
      `The retention window has not closed. Purge becomes permissible at ` +
        `${existing.purgeEligibleAt?.toISOString() ?? 'an unset time'}.`
    );
  }

  return { existing, receipt };
}

/* Which vault documents belong to a tenant: see ./vault-tenancy, shared with
   the tenant export so the two cannot disagree about what an erasure destroys. */

/**
 * Tenant-owned tables that are NOT purged by the uniform `organization_id = $1`,
 * with the predicate that scopes them to a tenant instead: ./purge-parent-scope,
 * the one map the tenant export reads too.
 *
 * `vault.document_chunks` is keyed only by document_id — it inherits its tenancy
 * from the document it belongs to. Purging it with the uniform predicate raised
 * 42703 (undefined_column), which purgeChildTable treats as "not in this
 * deployment's schema" and skips silently, so a purge left every chunk of every
 * deleted document in place. The legacy children named there since 2026-10-29
 * had the same gap, and their keys stopped the purge at the parent.
 */
export { PURGE_PARENT_SCOPED };

/**
 * Empty one tenant-owned table and return how many rows it deleted, or null
 * when this deployment's schema has no such table. Other errors abort.
 */
async function purgeChildTable(
  client: PoolClient,
  table: string,
  organizationId: number
): Promise<number | null> {
  /* Table names come from the frozen constant below, never from a caller's
     string, so interpolation here cannot be influenced by request input. The
     regex is a belt-and-braces assertion on that invariant.

     It now admits an optional SCHEMA QUALIFIER, and that is the fix for a real
     gap rather than a generalisation for its own sake: the list carried
     `vault_documents` and `document_chunks`, which resolve to
     `public.vault_documents` and `public.document_chunks`. Neither exists — the
     real tables are `vault.documents` and `vault.document_chunks` — so both
     raised 42P01 and were skipped, silently, while the list read as though the
     vault were covered. A dot could not be written before this, because the old
     regex rejected it. */
  if (!/^[a-z_][a-z0-9_]*(\.[a-z_][a-z0-9_]*)?$/.test(table)) {
    throw new OffboardingStateError('INVALID_PURGE_TABLE', `Unsafe table name: ${table}`);
  }
  /* OWN-KEY lookup, not a bare index. `PURGE_PARENT_SCOPED[table]` reaches
     Object.prototype, so a table legitimately named `constructor` or
     `toString` — both of which the name regex above admits — would yield a
     FUNCTION as the predicate and interpolate it into the DELETE. This
     codebase has been bitten by exactly this twice and fixed it the same way
     each time: see `externalDocumentTableReason` in
     server/services/ectd/leaf-document-tables.ts and `vaultStatus` in
     client/src/concept2cure/v2/fixtures/vault-data.ts. */
  const predicate = Object.prototype.hasOwnProperty.call(PURGE_PARENT_SCOPED, table)
    ? PURGE_PARENT_SCOPED[table]
    : 'organization_id = $1';
  // Each table behind a savepoint. Inside a real transaction any error aborts
  // it, so "skip a table this schema lacks" is only possible by rolling back to
  // just before that one statement; without the savepoint the skip left the
  // transaction dead and every later statement failed.
  await client.query('SAVEPOINT purge_table');
  try {
    const result = await client.query(`DELETE FROM ${table} WHERE ${predicate}`, [organizationId]);
    await client.query('RELEASE SAVEPOINT purge_table');
    return result.rowCount ?? 0;
  } catch (error) {
    // A table absent from this deployment's schema is expected — the schema
    // varies by edition. A different error is not, and must abort the purge
    // rather than leave the tenant half-destroyed.
    const code = (error as { code?: string }).code;
    if (code === '42P01' || code === '42703') {
      await client.query('ROLLBACK TO SAVEPOINT purge_table');
      logger.debug('Purge skipped a table not present in this schema', { table });
      return null;
    }
    throw error;
  }
}

/**
 * Refuse while any legal hold on the tenant is active. A record under hold may
 * not be destroyed by anyone, whatever the retention clock says
 * (migrations/20260906b_vault_legal_holds.sql). The purge consulted none.
 *
 * Read inside the purge's transaction, so a hold placed after the preflight
 * checks is still seen. A deployment without the vault schema has no hold
 * table, and so no holds; any other failure to read aborts the purge.
 */
async function assertNoActiveLegalHold(client: PoolClient, organizationId: number, strict = false): Promise<void> {
  const present = await client.query(`SELECT to_regclass('vault.legal_holds') IS NOT NULL AS present`);
  if (strict) requireKnownHoldPresence(present.rows);
  if (!present.rows[0]?.present) return;
  const { rows } = await client.query(
    `SELECT count(*)::int AS active
       FROM vault.legal_holds
      WHERE organization_id = $1 AND lifted_at IS NULL`,
    [organizationId]
  );
  const active = strict ? confirmedActiveHoldCount(rows) : rows[0]?.active ?? 0;
  if (active > 0) {
    throw new OffboardingStateError(
      'LEGAL_HOLD_ACTIVE',
      `${active} legal hold(s) on this organization are active. Records under hold cannot be ` +
        'destroyed; lift each hold, with a reason, before purging.'
    );
  }
}

function assertPendingPurgeOrganization(organization: { status: string; purged_at: Date | null } | undefined): void {
  if (!organization) throw new OffboardingStateError('TENANT_NOT_FOUND', 'Organization not found');
  if (organization.status === 'purged' || organization.purged_at) {
    throw new OffboardingStateError('TENANT_ALREADY_PURGED', 'This organization is already purged');
  }
  if (organization.status !== 'pending_deletion') {
    throw new OffboardingStateError('TENANT_NOT_PENDING_DELETION', 'A tenant must remain scheduled for deletion before it can be purged');
  }
}

/**
 * These immutable stores contain regulated content, including signed prose and
 * private frozen inputs. No reviewed erasure path exists yet. A populated
 * tenant must remain pending deletion, with its export available, rather than
 * receive a purge success while retaining content or failing midway on an FK.
 *
 * The organization lock conflicts with the stores' FK insertion locks. An
 * insertion already in flight settles before these fresh reads; the lock stays
 * on the same transaction through any permitted purge. New governed writes to
 * pending-deletion organizations are refused by the lifecycle boundary.
 */
async function assertRegulatedContentDisposition(client: PoolClient, organizationId: number): Promise<void> {
  const locked = await client.query<{ status: string; purged_at: Date | null }>(
    'SELECT id, status, purged_at FROM organizations WHERE id = $1 FOR UPDATE',
    [organizationId],
  );
  assertPendingPurgeOrganization(locked.rows[0]);

  try {
    const present = await client.query<{ qms_versions: boolean; frozen_inputs: boolean }>(
      `SELECT to_regclass('public.qms_document_versions') IS NOT NULL AS qms_versions,
              to_regclass('public.submission_orchestrator_inputs') IS NOT NULL AS frozen_inputs`,
    );
    if (present.rows[0]?.qms_versions !== true || present.rows[0]?.frozen_inputs !== true) {
      throw new OffboardingStateError('REGULATED_RETENTION_CHECK_UNAVAILABLE', 'Regulated-content retention could not be verified. Restore the required stores before retrying. Nothing was purged.');
    }
    const retained = await client.query<{ qms_versions: boolean; frozen_inputs: boolean }>(
      `SELECT EXISTS (SELECT 1 FROM public.qms_document_versions WHERE organization_id = $1) AS qms_versions,
              EXISTS (SELECT 1 FROM public.submission_orchestrator_inputs WHERE organization_id = $1) AS frozen_inputs`,
      [organizationId],
    );
    const content = retained.rows[0];
    if (typeof content?.qms_versions !== 'boolean' || typeof content?.frozen_inputs !== 'boolean') {
      throw new OffboardingStateError('REGULATED_RETENTION_CHECK_UNAVAILABLE', 'Regulated-content retention could not be verified. Retry after the retained stores can be read. Nothing was purged.');
    }
    if (content.qms_versions || content.frozen_inputs) {
      throw new OffboardingStateError(
        'REGULATED_CONTENT_RETENTION_REVIEW_REQUIRED',
        'Controlled QMS versions or frozen submission inputs require governed retention review before physical erasure. This organization remains pending deletion and exportable. Nothing was purged.',
      );
    }
  } catch (error) {
    if (error instanceof OffboardingStateError) throw error;
    logger.warn('Regulated retention preflight unavailable', { organizationId });
    throw new OffboardingStateError('REGULATED_RETENTION_CHECK_UNAVAILABLE', 'Regulated-content retention could not be verified. Retry after the retained stores can be read. Nothing was purged.');
  }
}

function requireKnownHoldPresence(rows: any[]): void {
  if (rows.length !== 1 || rows[0]?.present !== true) {
    throw new OffboardingStateError('SOURCE_READ_RECEIPT_PURGE_UNAVAILABLE', 'The legal-hold state could not be verified. Nothing was purged.');
  }
}

function confirmedActiveHoldCount(rows: any[]): number {
  if (rows.length !== 1 || typeof rows[0]?.active !== 'number' || !Number.isSafeInteger(rows[0].active) || rows[0].active < 0) {
    throw new OffboardingStateError('SOURCE_READ_RECEIPT_PURGE_UNAVAILABLE', 'The active legal-hold count could not be verified. Nothing was purged.');
  }
  return rows[0].active;
}

/** What the purge did to the vault's stored bytes, which live outside the database. */
export interface StorageErasure {
  /** Provider-backed vault objects the tenant held when the purge committed. */
  objects: number;
  deleted: number;
  /** Version ids whose bytes were not deleted: missing, or the store refused.
   *  Residue to act on, reported rather than implied away. */
  notDeleted: string[];
}

interface StoredObject {
  versionId: string;
  provider: string | null;
}

/**
 * Delete the tenant's vault versions (and their chunks) through the one door
 * the database leaves open, and return how many versions it deleted and where
 * each one's bytes are stored (VR-07,
 * migrations/20260926_vault_documents_record_immutability.sql).
 *
 * vault.documents refuses DELETE from anyone but its owner.
 * public.purge_tenant_vault_records runs as that owner. It refuses unless the
 * caller is in the platform scope and the organization is pending deletion
 * with no active legal hold, then deletes with VAULT_DOCUMENT_TENANCY's
 * predicate. A generic DELETE from here matched nothing on the purge route's
 * own connection (the runtime role in the platform scope: the Vault's policies
 * have no platform arm), nor did the read of the bytes' addresses. So a purged
 * tenant kept its versions and their bytes while the purge reported success.
 *
 * A deployment without the vault schema has nothing to delete (null: the
 * table is absent). One with the table but not the function is refused: its
 * versions would survive.
 */
async function purgeVaultVersions(
  client: PoolClient,
  organizationId: number
): Promise<{ deleted: number; stored: StoredObject[] } | null> {
  const present = await client.query(
    `SELECT to_regclass('vault.documents') IS NOT NULL AS present,
            to_regprocedure('public.purge_tenant_vault_records(integer)') IS NOT NULL AS door`
  );
  if (!present.rows[0]?.present) return null;
  if (!present.rows[0]?.door) {
    throw new OffboardingStateError(
      'VAULT_PURGE_UNAVAILABLE',
      'This database has the vault but not public.purge_tenant_vault_records; run node scripts/db/deploy-migrate.mjs. Nothing was purged.'
    );
  }
  // One row per version deleted (the function's RETURN QUERY … RETURNING).
  const { rows } = await client.query(
    'SELECT storage_version_id, storage_provider FROM public.purge_tenant_vault_records($1)',
    [organizationId]
  );
  const stored = rows
    .filter((r: { storage_version_id: string | null }) => r.storage_version_id)
    .map((r: { storage_version_id: string; storage_provider: string | null }) => ({
      versionId: r.storage_version_id,
      provider: r.storage_provider,
    }));
  return { deleted: rows.length, stored };
}

/** What the purge erased of the tenant's AnA turn records. */
export interface TurnRecordErasure {
  records: number;
  blobs: number;
}

/** What the purge erased of the tenant's live AnA run-event mirror (public.ana_run_events). */
export interface RunEventErasure {
  events: number;
}

/** Tenant-owned exact-source host-admission metadata erased through its door. */
export interface SourceReadReceiptErasure { receipts: number; }

/** What the purge erased of the tenant's artifact signatures and lock snapshots. */
export interface ArtifactRecordErasure {
  signatures: number;
  snapshots: number;
}

/** What the Vault seal door erased (public.purge_tenant_vault_seals). */
export interface VaultSealErasure {
  seals: number;
}

/**
 * Tables that refuse a plain DELETE from every role, each group erased by one
 * SECURITY DEFINER door that restates this purge's preconditions at the
 * database (the platform scope, pending_deletion, no active legal hold) and
 * deletes as the one NOLOGIN role its append-only trigger lets through.
 *
 * What a door erases is Customer Data, returned in the tenant export the purge
 * requires. Its audit-trail record is a chained audit_logs row, which the
 * purge keeps (MSA §10.2), so the exported copy stays verifiable.
 *
 *   - AnA turn records: public.purge_tenant_turn_records, as ana_record_purger
 *     (migrations/20260926_ana_turn_records.sql, amended 2026-10-01).
 *   - An artifact's signatures and lock snapshots:
 *     public.purge_tenant_artifact_records, as artifact_record_purger
 *     (migrations/20260929_concept2cure_signatures_append_only.sql, amended
 *     2026-10-01). It runs before `projects`, whose cascade to the artifacts
 *     those triggers refuse.
 *   - The live mirror of AnA turns: public.purge_tenant_run_events, as
 *     ana_run_events_purger (migrations/20261008f_ana_run_events.sql, AnA
 *     detach DT1). It runs before `ana_runs`, which its rows reference. Working
 *     data, not a record; the sealed turn record is erased by the first door.
 *
 * A deployment without a door's tables has nothing to erase. One with the
 * tables but not the door is refused: their records would survive.
 */
export const PURGE_DOORS = Object.freeze([
  {
    tables: ['ana_source_read_receipts'],
    fn: 'purge_tenant_source_read_receipts',
    columns: ['receipts'],
    erasure: 'sourceReadReceiptErasure',
    unavailable: 'SOURCE_READ_RECEIPT_PURGE_UNAVAILABLE',
  },
  {
    tables: ['ana_turn_records', 'ana_record_blobs'],
    fn: 'purge_tenant_turn_records',
    columns: ['records', 'blobs'],
    erasure: 'turnRecordErasure',
    unavailable: 'TURN_RECORD_PURGE_UNAVAILABLE',
  },
  {
    tables: ['ana_run_events'],
    fn: 'purge_tenant_run_events',
    columns: ['events'],
    erasure: 'runEventErasure',
    unavailable: 'RUN_EVENT_PURGE_UNAVAILABLE',
  },
  {
    tables: ['concept2cure_signatures', 'concept2cure_submission_snapshots'],
    fn: 'purge_tenant_artifact_records',
    columns: ['signatures', 'snapshots'],
    erasure: 'artifactRecordErasure',
    unavailable: 'ARTIFACT_RECORD_PURGE_UNAVAILABLE',
  },
  // A Vault seal is append-only and refuses a plain DELETE from every role
  // (migrations/20261029d_vault_data_room_seals.sql); its door has the Vault
  // purge's preconditions. It runs before `regulatory_programs`, which seals
  // reference without an ON DELETE action.
  {
    tables: ['vault_data_room_seals'],
    fn: 'purge_tenant_vault_seals',
    columns: ['seals'],
    erasure: 'vaultSealErasure',
    unavailable: 'VAULT_SEAL_PURGE_UNAVAILABLE',
  },
  // The held records (P-58): signatures and the audit trail, lineage, the IVDR
  // histories, reg_questions and the review routes (./purge-held-doors.ts).
  ...HELD_RECORD_DOORS,
] as const);
type PurgeDoor = (typeof PURGE_DOORS)[number];

/** Erase a door's tables for the tenant; the counts it returns, by column. */
async function eraseThroughDoor(client: PoolClient, door: PurgeDoor, organizationId: number): Promise<Record<string, number> | null> {
  const present = await client.query(
    'SELECT to_regclass($1) IS NOT NULL AS present, to_regprocedure($2) IS NOT NULL AS door',
    [`public.${door.tables[0]}`, `public.${door.fn}(integer)`]
  );
  const strict = door.fn === 'purge_tenant_source_read_receipts';
  if (strict && (present.rows.length !== 1 || typeof present.rows[0].present !== 'boolean' || typeof present.rows[0].door !== 'boolean')) {
    throw new OffboardingStateError(door.unavailable, 'The source receipt purge schema could not be verified. Nothing was purged.');
  }
  if (!present.rows[0]?.present) return strict ? null : Object.fromEntries(door.columns.map((c) => [c, 0]));
  if (!present.rows[0]?.door) {
    throw new OffboardingStateError(
      door.unavailable,
      `This database has ${door.tables.join(' and ')} but not public.${door.fn}; run node scripts/db/deploy-migrate.mjs. Nothing was purged.`
    );
  }
  // Identifiers from the frozen list above, never from input.
  const { rows } = await client.query(`SELECT ${door.columns.join(', ')} FROM public.${door.fn}($1)`, [organizationId]);
  if (strict && (rows.length !== 1 || !confirmedDoorCount(rows[0]?.receipts))) {
    throw new OffboardingStateError('SOURCE_READ_RECEIPT_PURGE_UNCONFIRMED', 'Source receipt erasure could not be confirmed. Nothing was purged.');
  }
  return Object.fromEntries(door.columns.map((c) => [c, Number(rows[0]?.[c] ?? 0)]));
}

function confirmedDoorCount(value: unknown): boolean {
  return (typeof value === 'number' || (typeof value === 'string' && /^\d+$/.test(value)))
    && Number.isSafeInteger(Number(value)) && Number(value) >= 0;
}

/**
 * Delete the bytes of a committed purge, each from the store it was saved in.
 * After COMMIT, never before: deleting first and then rolling back would leave
 * a tenant that was not purged with records whose bytes are gone.
 */
async function eraseStoredObjects(objects: StoredObject[], organizationId: number): Promise<StorageErasure> {
  const notDeleted: string[] = [];
  let deleted = 0;
  for (const o of objects) {
    try {
      if (await getStorageProviderFor(o.provider).delete(o.versionId, organizationId)) deleted++;
      else notDeleted.push(o.versionId);
    } catch {
      notDeleted.push(o.versionId);
    }
  }
  return { objects: objects.length, deleted, notDeleted };
}

/** What the purge's transaction deleted, table by table. */
interface PurgeTally {
  /** Rows deleted per listed table, as the database counted them. */
  deletedRows: Record<string, number>;
  /** Listed tables this deployment's schema does not have (nothing to delete). */
  tablesAbsent: string[];
  /** The deleted vault versions' stored bytes, erased after COMMIT. */
  storedObjects: StoredObject[];
  /** What each door erased (PURGE_DOORS): AnA turn records; the run-event mirror; artifact signatures and lock snapshots. */
  turnRecordErasure: TurnRecordErasure;
  runEventErasure: RunEventErasure;
  sourceReadReceiptErasure: SourceReadReceiptErasure;
  artifactRecordErasure: ArtifactRecordErasure;
  vaultSealErasure: VaultSealErasure;
  /** The one record the platform keeps of the purge (P-58, ./offboarding-certificate.ts). */
  certificate?: OffboardingCertificate;
}

/** Run every listed table's delete on the transaction client, counting as it goes. */
async function deleteTenantRows(
  client: PoolClient,
  organizationId: number,
  childTables: readonly string[]
): Promise<PurgeTally> {
  const tally: PurgeTally = {
    deletedRows: {},
    tablesAbsent: [],
    storedObjects: [],
    turnRecordErasure: { records: 0, blobs: 0 },
    runEventErasure: { events: 0 },
    sourceReadReceiptErasure: { receipts: 0 },
    artifactRecordErasure: { signatures: 0, snapshots: 0 },
    vaultSealErasure: { seals: 0 },
  };
  const opened = new Set<string>();
  for (const table of childTables) {
    if (table === 'company_document_designs') {
      const disposed = await disposeCompanyDesigns(client, organizationId);
      if (disposed) {
        tally.deletedRows.company_document_designs = disposed.designs;
        tally.deletedRows.c2c_template_specs = disposed.templates;
      } else tally.tablesAbsent.push(table);
      continue;
    }
    // Tables that refuse a plain DELETE from every role go through their door,
    // once per door; the door's counts are its tables' counts.
    const door = PURGE_DOORS.find((d) => (d.tables as readonly string[]).includes(table));
    if (door) {
      if (!opened.has(door.fn)) {
        opened.add(door.fn);
        const counts = await eraseThroughDoor(client, door, organizationId);
        if (counts === null) {
          tally.tablesAbsent.push(...door.tables);
          continue;
        }
        Object.assign(tally, { [door.erasure]: counts });
        door.tables.forEach((t, k) => {
          tally.deletedRows[t] = counts[door.columns[k]] ?? 0;
        });
      }
      continue;
    }
    if (table === 'vault.documents') {
      // The bytes' addresses come back from the rows actually deleted, and
      // only when those rows are purged: bytes whose records survive must
      // survive too.
      const vault = await purgeVaultVersions(client, organizationId);
      if (vault === null) {
        tally.tablesAbsent.push(table);
      } else {
        tally.deletedRows[table] = vault.deleted;
        tally.storedObjects = vault.stored;
      }
      continue;
    }
    const deleted = await purgeChildTable(client, table, organizationId);
    if (deleted === null) tally.tablesAbsent.push(table);
    else tally.deletedRows[table] = deleted;
  }
  return tally;
}

/** Mark the organization purged; returns the purge instant the row records. */
async function markPurged(
  client: PoolClient,
  organizationId: number,
  purgedByUserId: number,
  digest: string,
  confirmStatus = false
): Promise<Date | null> {
  const { rows, rowCount } = await client.query(
    `UPDATE organizations
        SET status                 = 'purged',
            purged_at              = NOW(),
            purged_by              = $2,
            final_export_digest    = $3,
            final_export_at        = NOW(),
            -- Clear commercial identifiers so a purged tenant cannot be
            -- re-billed and cannot hold a slug or API key hostage.
            api_key                = NULL,
            stripe_subscription_id = NULL,
            settings               = CASE WHEN jsonb_typeof(settings::jsonb)='object'
                                       THEN (settings::jsonb - 'companyDocuments')::json ELSE settings::json END,
            updated_at             = NOW()
      WHERE id = $1
      RETURNING purged_at`,
    [organizationId, purgedByUserId, digest]
  );
  if (confirmStatus) return confirmedPurgedStatus(rows, rowCount);
  return rows[0]?.purged_at ?? null;
}

function confirmedPurgedStatus(rows: any[], rowCount: number | null): Date {
  const value = rows[0]?.purged_at;
  const isTimestamp = value instanceof Date || typeof value === 'string';
  const instant = isTimestamp ? new Date(value).getTime() : Number.NaN;
  if (rowCount !== 1 || rows.length !== 1 || !Number.isFinite(instant)) {
    throw new OffboardingStateError('SOURCE_READ_RECEIPT_PURGE_STATUS_UNCONFIRMED', 'Tenant purge status persistence could not be confirmed. Nothing was purged.');
  }
  return new Date(instant);
}

function isDocumentDispositionRetentionConflict(error: unknown): boolean {
  if (typeof error !== 'object' || error === null) return false;
  const failure = error as { code?: unknown; message?: unknown };
  return failure.code === '55000' && typeof failure.message === 'string'
    && failure.message.startsWith('DOCUMENT_DISPOSITION_WRITE_REFUSED:');
}

/** The locked current metadata, not a stale preflight, must match the data return. */
/** The receipt re-read under the purge's lock still binds what it bound: the company documents, and the export's scope. */
function sameReceiptEvidence(held: ExportReceipt, receipt: ExportReceipt): boolean {
  return (held.companyDocumentsVersion ?? null) === (receipt.companyDocumentsVersion ?? null)
    && (held.companyDocumentsSha256 ?? null) === (receipt.companyDocumentsSha256 ?? null)
    && (held.exportScope ?? null) === (receipt.exportScope ?? null);
}

async function verifyCompanyDocumentReturn(client: PoolClient, organizationId: number,
  receipt: ExportReceipt): Promise<CompanyDocumentsExportDescriptor> {
  await client.query("SET LOCAL TIME ZONE 'UTC'");
  const { rows } = await readLockedCompanyDocumentSettings(client, organizationId);
  if (rows.length !== 1) throw new OffboardingStateError('TENANT_NOT_FOUND', 'Organization not found. Nothing was purged.');
  const envelope = await readCompanyDocumentsExportEnvelope(client, organizationId, rows[0]);
  const held = await findExportReceipt(client, organizationId, receipt.digest, { hold: true });
  if (!held || !sameReceiptEvidence(held, receipt)) {
    throw new OffboardingStateError('EXPORT_EVIDENCE_UNVERIFIED', 'The final export receipt changed during this request. Produce a current full export. Nothing was purged.');
  }
  if (envelope.present || held.companyDocumentsVersion != null || held.companyDocumentsSha256 != null) {
    if (held.companyDocumentsVersion !== 1 || held.companyDocumentsSha256 !== envelope.sha256) {
      throw new OffboardingStateError('COMPANY_DOCUMENTS_EXPORT_UNVERIFIED', 'The current company identity, letterhead and legal registry are not bound to this export receipt. Produce a new full export before purging. Nothing was purged.');
    }
  }
  return companyDocumentsExportDescriptor(envelope);
}

/**
 * The purge's transaction erases in the organization's own tenant id and
 * organization uuid (P-58, 2026-10-29), set LOCAL after its BEGIN, as the
 * export reads (services/tenant-export/company-export-snapshot.ts). The role
 * stays the platform role the purge runs in, which every door checks
 * (tenant_purge_door_preconditions); P-72 moves the doors. Under the platform
 * scope alone (tenant '0', no uuid) a policy that admits only its own tenant
 * showed the DELETE none of the organization's rows: citation_chains,
 * knowledge_graph_nodes, knowledge_graph_edges and lumen_knowledge_graph_edges
 * survived a purge whose certificate counted them erased.
 */
async function enterOrganizationScope(client: PoolClient, organizationId: number): Promise<void> {
  // By to_jsonb, so a schema whose organizations carry no uuid (a test fixture) reads none rather than fail.
  const { rows } = await client.query("SELECT to_jsonb(o)->>'uuid' AS uuid FROM organizations o WHERE o.id = $1", [organizationId]);
  await client.query(
    "SELECT set_config('app.current_tenant_id', $1, true), set_config('app.current_org_id', $2, true)",
    [String(organizationId), rows[0]?.uuid ? String(rows[0].uuid) : ''],
  );
}

/**
 * The legal-hold check, the deletes, the status change and the purge's audit
 * row, on ONE checked-out client: all of it commits, or none of it does.
 *
 * BEGIN, COMMIT and ROLLBACK once went through `pool.query`, which may run each
 * statement on a different connection: the deletes were not in the transaction
 * the BEGIN opened, and a failure part-way left the tenant half-destroyed with
 * a ROLLBACK that undid nothing (docs/evidence/D6/2026-09-24-purge/).
 */
async function purgeInOneTransaction(
  pool: Pool,
  input: {
    existing: OffboardingRecord;
    receipt: ExportReceipt;
    purgedByUserId: number;
    preconditions: PurgePreconditions;
    childTables: readonly string[];
    auditContext?: PurgeAuditContext;
  }
): Promise<PurgeTally> {
  const organizationId = input.existing.organizationId;
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    try {
      await enterOrganizationScope(client, organizationId);
      const receiptPurgeReserved = await reserveSourceReadReceiptPurge(client, {
        organizationId, childTables: input.childTables, receipt: input.receipt, preconditions: input.preconditions,
      });
      await assertRegulatedContentDisposition(client, organizationId);
      await assertNoActiveLegalHold(client, organizationId, receiptPurgeReserved);
      const companyDocuments = await verifyCompanyDocumentReturn(client, organizationId, input.receipt);
      // P-58: a held record (a signature, an audit trail, a sealed report, a
      // ledger) is erased only once the customer signed custody of this very
      // export, attesting to the records held now (./offboarding-custody.ts).
      const custody = await custodyForPurge(client, organizationId, input.receipt.digest);
      if (custody.refusal) throw new OffboardingStateError(custody.refusal.code, custody.refusal.message);
      const tally = await deleteTenantRows(client, organizationId, input.childTables);
      const purgedAt = await markPurged(client, organizationId, input.purgedByUserId, input.receipt.digest, receiptPurgeReserved || companyDocuments.present);
      if (!purgedAt) throw new OffboardingStateError('PURGE_STATUS_UNCONFIRMED', 'The status change was not confirmed, so the offboarding certificate cannot be dated. Nothing was purged.');
      const certificate = await recordOffboardingCertificate(client, {
        organizationId, export: { digest: input.receipt.digest, tableCount: Number(input.receipt.tableCount), rowCount: Number(input.receipt.rowCount) },
        deletedRows: tally.deletedRows, tablesAbsent: tally.tablesAbsent, heldRecords: custody.heldRecords,
        custodySignatureId: custody.signature?.id ?? null, purgedBy: input.purgedByUserId, purgedAt,
      });
      if (!certificate) throw new OffboardingStateError('OFFBOARDING_CERTIFICATE_UNAVAILABLE', 'This database has no tenant_offboarding_certificates; run node scripts/db/deploy-migrate.mjs. Nothing was purged.');
      tally.certificate = certificate;
      await recordPurge(client, {
        existing: input.existing,
        receipt: input.receipt,
        purgedByUserId: input.purgedByUserId,
        purgedAt,
        deletedRows: tally.deletedRows,
        tablesAbsent: tally.tablesAbsent,
        vaultObjectsToErase: tally.storedObjects.length,
        retentionOverrideReason: input.preconditions.overrideRetentionWindowReason,
        auditContext: input.auditContext,
        companyDocumentsDisposition: { ...companyDocuments, disposition: companyDocuments.present ? 'erased' : 'absent' },
      });
      await client.query('COMMIT');
      return tally;
    } catch (error) {
      await client.query('ROLLBACK').catch(() => {});
      if (isDocumentDispositionRetentionConflict(error)) {
        throw new OffboardingStateError(
          'DOCUMENT_DISPOSITION_RETENTION_CONFLICT',
          'Document disposition retention prevents this tenant purge. Request governed retention review before retrying physical erasure. Nothing was purged.'
        );
      }
      throw error;
    }
  } finally {
    client.release();
  }
}

/**
 * Destroy a tenant's data.
 *
 * Refuses unless ALL of the following hold:
 *   1. the purge is attributable to a person (a positive user id);
 *   2. the organization is in `pending_deletion`;
 *   3. `purge_eligible_at` has passed, OR an explicit override reason is given;
 *   4. a final export digest is supplied and matches this tenant's receipt;
 *   5. no legal hold on the tenant is active.
 *   6. no controlled QMS versions or frozen submission inputs await retention review.
 *   7. a tenant holding a held record has a valid custody signature on this
 *      export, attesting to the records it holds now (P-58, ./offboarding-custody.ts).
 *
 * The organization ROW SURVIVES, in status `purged`, carrying the offboarding
 * evidence — who requested it, when, why, which export was handed over, who
 * executed the purge. Destroying that row too would delete the audit trail of
 * the deletion, which is precisely what Part 11 §11.10(e) forbids. The tenant's
 * *content* is gone; the *record that it existed and was removed* is not — and
 * that record is also one chained audit_logs row (./tenant-purge-audit.ts),
 * committed in the same transaction as the deletes or not at all.
 */
export async function purgeTenant(
  pool: Pool,
  params: {
    organizationId: number;
    purgedByUserId: number;
    preconditions: PurgePreconditions;
    /** Tables purged, in FK-safe order. Injected so callers/tests can narrow it. */
    childTables?: readonly string[];
    /** Where the request came from, for the audit row. */
    auditContext?: PurgeAuditContext;
  }
): Promise<
  OffboardingRecord & {
    storageErasure: StorageErasure;
    deletedRows: Record<string, number>;
    turnRecordErasure: TurnRecordErasure;
    runEventErasure: RunEventErasure;
    sourceReadReceiptErasure: SourceReadReceiptErasure;
    artifactRecordErasure: ArtifactRecordErasure;
    vaultSealErasure: VaultSealErasure;
    offboardingCertificate: OffboardingCertificate | null;
  }
> {
  const { organizationId, purgedByUserId, preconditions } = params;
  const childTables = params.childTables ?? PURGE_CHILD_TABLES;
  assertNoRetainedRecords(childTables);

  const { existing, receipt } = await assertPurgePermitted(pool, organizationId, purgedByUserId, preconditions);

  // AnA's live runs stop FIRST, before any table is purged (AnA detach §2.9):
  // a turn still running would go on writing rows the purge is removing.
  await stopOrganisationRuns(pool, organizationId, 'purge', purgedByUserId);

  const tally = await purgeInOneTransaction(pool, {
    existing,
    receipt,
    purgedByUserId,
    preconditions,
    childTables,
    auditContext: params.auditContext,
  });

  invalidateTenantPosture(organizationId);
  invalidateOrgMembershipCache(undefined, organizationId);

  const storageErasure = await eraseStoredObjects(tally.storedObjects, organizationId);
  if (storageErasure.notDeleted.length > 0) {
    logger.error('Tenant purged; some stored vault objects were not deleted', {
      organizationId,
      notDeleted: storageErasure.notDeleted,
    });
  }

  logger.warn('Tenant purged', {
    organizationId,
    purgedByUserId,
    retentionOverride: preconditions.overrideRetentionWindowReason ?? null,
    finalExportDigest: receipt.digest,
    deletedRows: tally.deletedRows,
    turnRecordErasure: tally.turnRecordErasure,
    runEventErasure: tally.runEventErasure,
    sourceReadReceiptErasure: tally.sourceReadReceiptErasure,
    artifactRecordErasure: tally.artifactRecordErasure,
    vaultSealErasure: tally.vaultSealErasure,
  });

  const after = await readOrganization(pool, organizationId);
  // The row is guaranteed to exist — the purge updates it rather than deleting
  // it, precisely so the deletion remains auditable.
  return {
    ...(after as OffboardingRecord),
    storageErasure,
    deletedRows: tally.deletedRows,
    turnRecordErasure: tally.turnRecordErasure,
    runEventErasure: tally.runEventErasure,
    sourceReadReceiptErasure: tally.sourceReadReceiptErasure,
    artifactRecordErasure: tally.artifactRecordErasure,
    vaultSealErasure: tally.vaultSealErasure,
    offboardingCertificate: tally.certificate ?? null,
  };
}

/** Exact records that the generic tenant purge cannot erase.
 * Disposition receipts contain hashes and audit evidence, retained under
 * POLICY-DR-007 section 1. Controlled QMS versions and frozen submission inputs
 * contain actual regulated content; their erasure needs governed review and an
 * approved disposition path. Nonempty content stores block purge completion.
 * No injected or accidentally expanded table list may bypass either policy.
 * The coverage gate reads this same literal policy; keep it JSON-shaped.
 */
export const PURGE_RETAINED_RECORDS: Readonly<Record<string, string>> = Object.freeze({
  "document_data_dispositions": "Immutable attributed disposition receipts retained with the audit trail under POLICY-DR-007 section 1; UPDATE, DELETE and TRUNCATE are refused by the 20261006 migration.",
  "qms_document_versions": "Immutable controlled-document snapshots contain signed prose or legacy registry content. Physical erasure requires governed retention review; a populated tenant is refused before any purge write.",
  "qms_job_roles": "Training requirement record (who was required to train on which controlled document, set by whom and when), retained with the qms_training_records receipts it gives meaning to; erased with them when QMS retention is decided.",
  "qms_job_role_members": "Training requirement record (who was required to train on which controlled document, set by whom and when), retained with the qms_training_records receipts it gives meaning to; erased with them when QMS retention is decided.",
  "qms_training_assignments": "Training requirement record (who was required to train on which controlled document, set by whom and when), retained with the qms_training_records receipts it gives meaning to; erased with them when QMS retention is decided.",
  "submission_orchestrator_inputs": "Private immutable input snapshots and suspended outputs contain frozen submission and clinical content. Physical erasure requires governed retention review; a populated tenant is refused before any purge write.",
});

/* Tables the purge does not erase although a row of theirs can name a row it
   deletes (none since P-58), and the platform's own records of a purge:
   ./purge-referrers, with each one's reason. */
export { PURGE_REFERRERS_NOT_ERASED, PURGE_PLATFORM_RECORDS };

function assertNoRetainedRecords(tables: readonly string[]): void {
  for (const table of tables) {
    const name = table.replace(/^public\./, '');
    if (Object.prototype.hasOwnProperty.call(PURGE_RETAINED_RECORDS, name)) {
      throw new OffboardingStateError('PURGE_RETAINED_RECORD', `Tenant purge cannot erase retained evidence: ${table}`);
    }
    if (Object.prototype.hasOwnProperty.call(PURGE_REFERRERS_NOT_ERASED, name)) {
      throw new OffboardingStateError('PURGE_RETAINED_RECORD', `Tenant purge does not erase ${table} until its retention is decided`);
    }
    if (Object.prototype.hasOwnProperty.call(PURGE_PLATFORM_RECORDS, name)) {
      throw new OffboardingStateError('PURGE_RETAINED_RECORD', `Tenant purge never erases the platform's record of it: ${table}`);
    }
  }
}

/**
 * Tenant-owned tables emptied by a purge, in foreign-key-safe order (children
 * before parents). Frozen and module-local: a purge must never accept a table
 * list derived from request input.
 *
 * This list is deliberately conservative — it names the tables that hold
 * customer content. Cross-tenant reference data, the audit trail, and billing
 * history are NOT here: the audit trail must outlive the tenant (Part 11), and
 * billing records are needed for revenue recognition after the account closes.
 */
export const PURGE_CHILD_TABLES: readonly string[] = Object.freeze([
  'company_document_designs',
  'company_legal_registry',
  // Company presentation snapshots and delegated grants are customer data.
  // The revision store retains its canonical pending-deletion/hold purge gate.
  'company_document_revisions',
  'company_document_grants',
  'company_document_identity_reviews',
  // Immutable customer admission metadata, erased through its narrow door
  // before the actor/programme/source parents. Its audit/export history stays.
  'ana_source_read_receipts',
  // Per-member read/archive state is ordinary customer data. Its notice parent
  // has a restrictive FK, so erase these children before the shared notices.
  'mdx_notification_receipts',
  'mdx_notifications',
  // The deployed feedback store holds tenant-owned ratings and comments;
  // canonical audit receipts remain in the retained audit trail.
  'ai_feedback',
  // Access requests contain the member's free-text business justification and
  // the administrator's decision reason. The canonical audit event survives;
  // this tenant-owned working record does not.
  'module_access_requests',
  // An administrator's on/off for each platform AnA skill, with the stated
  // reason (2026-10-22). The reason and the change are in the chained audit
  // row, which is retained; this is the tenant's working configuration.
  'organization_skill_settings',
  // A project's 'always' or 'off' for one AnA skill, with the reason
  // (2026-10-22). The audit row is retained; this is working configuration.
  'project_skill_settings',
  // A tenant's AnA run-control records: the pauses, steers and stops their
  // people issued mid-turn. Tenant-owned working data, not the audit trail —
  // the Part 11 rows for those actions live elsewhere and outlive the account.
  //
  // Its live timeline mirror first, through its PURGE_DOORS entry (AnA detach
  // DT1): the rows reference ana_runs, and the table refuses a plain DELETE
  // from every role, so purgeChildTable could not erase them.
  'ana_run_events',
  'ana_runs',
  // CMC/project workflow payloads are customer plans and assignments. Delete
  // them before their project parents; workflow_tasks cascade where the
  // canonical FK is present, while editions without this table/column are
  // safely skipped by purgeChildTable.
  'project_workflows',
  'organization_users',
  /* An artifact's signatures and lock snapshots, through their door, BEFORE
     `projects`: they refuse the cascade from deleting an artifact
     (20260929_concept2cure_signatures_append_only.sql), so until 2026-10-01 the
     purge of any tenant that had approved or locked an artifact failed here.
     Each signing's chained ledger row is its audit-trail record and stays. */
  'concept2cure_signatures',
  'concept2cure_submission_snapshots',
  /* Answers to agency letters and the commitments made in them (2026-10-18,
     migrations/20261018b_agency_response_questions.sql), BEFORE `projects`:
     each names its project with no cascade, and a commitment names the
     question it came from. Milestones before their commitment; commitments
     before the questions they cite; the questions then take their response
     history with them (ON DELETE CASCADE, run as the owner through the
     append-only ceiling). A response's signatures and ledger rows are the audit
     trail and stay. Since 2026-10-19 a fulfilled commitment also names the
     sequence and the Vault version that met it (NO ACTION keys,
     migrations/20261019_commitment_fulfilment_evidence.sql), so it goes before
     vault.documents below too; sequences are not purged. Its fulfilment
     signature stays with the others. */
  'commitment_milestones',
  'regulatory_commitments',
  'agency_communication_questions',
  /* ── Every table that names a project, a workspace, a document or a program
     with no delete action (D6, 2026-10-29), children before their parents and
     all before `projects`: ./purge-referrers says which and why. */
  ...PURGE_REFERRER_TABLES,
  /* `projects` BEFORE `client_workspaces` (fixed 2026-10-01): a project
     references its workspace with no cascade, so deleting the workspaces first
     failed with 23503 for every tenant that had a project, which is every real
     tenant. The suites that purge passed narrowed lists, so the real order had
     not run against a tenant with a workspace and a project. */
  'projects',
  'client_workspaces',
  /* SCHEMA-QUALIFIED, and chunks BEFORE documents.
     These were `vault_documents` and `document_chunks` — names that resolve to
     public.* tables which do not exist, so both were skipped as 42P01 while the
     list read as though the vault were purged. The vault holds the customer's
     actual regulatory documents; leaving them was the largest hole in this list.
     Chunks are ordered first because their scoping predicate reads
     vault.documents, so they must be deleted while their parents still exist.

     The stored object BYTES live outside the database. purgeTenant reads their
     addresses before these rows go and, after COMMIT, deletes each from the
     store it was saved in (storage_provider), returning what was and was not
     deleted (StorageErasure). Rows written before the storage provider (a
     legacy `uploads/` path in s3_key, no storage_version_id) are not reached;
     rendered_leaf_files holds version ids with no recorded provider. */
  'vault.document_chunks',
  'vault.documents',
  /* One row per deterministic engine run whose figure a tenant's document or
     report cites: its inputs, its outputs and their hashes
     (migrations/20261008f_stats_computation_runs.sql). Customer content — the
     inputs are the tenant's own study and program data. Its organization_id FK
     carries no CASCADE, and its program and study FKs are ON DELETE SET NULL,
     so nothing erased it: a purged tenant kept every run here. Before
     regulatory_programs and cdisc_prm_studies, the two it references. */
  'stats_computation_runs',
  /* The ISO 14971 risk file and the nonconformance log (D6, 2026-10-29), BEFORE
     regulatory_programs. risk_items.program_id REFERENCES regulatory_programs(id)
     with NO ACTION (migrations/20260507_mdx_beta_surfaces.sql), and since
     20261029c risk_items_program_same_org_fk is NO ACTION on that lineage too,
     so until this entry the purge of any tenant with one hazard filed under a
     project failed at regulatory_programs with 23503 and rolled back
     (tenant-purge-device-records.pglite.test.ts). Controls before the hazard
     they control: risk_controls.risk_item_id cascades today, but the list must
     not depend on that, and new_risk_item_id has no delete action.
     qms_nonconforming_products names its project by an ON DELETE SET NULL
     (program_id) key (20261029d), so it never blocked; it is the tenant's
     content and nothing else reaches it. */
  'risk_controls',
  'risk_items',
  'qms_nonconforming_products',
  // Vault seals (VR-19), through their door: they reference the project.
  'vault_data_room_seals',
  // Saved queries and Vault saved views (P-46): the tenant's own search
  // parameters. Before regulatory_programs, whose delete would cascade project
  // views; library views and precedent rows have no cascade and are reached
  // only here.
  'saved_precedent_queries',
  'regulatory_programs',
  'file_uploads',
  // Digital-twin simulations. Customer content: each row stores the tenant's
  // submission_profile — submission type, therapeutic area, target agencies.
  // It only became tenant-owned in db/migrations/20260821_regulatory_twin_simulations_tenant_scope.sql;
  // before that the table had no organization_id at all, so a purge could not
  // have reached it even in principle. A leaf (its only FK is to organizations,
  // which a purge updates rather than deletes), so its position here is free.
  'regulatory_twin_simulations',
  /* The container closure and reference standard registers. Customer content
     in full — the extractables/leachables package behind a packaging system and
     the Certificate of Analysis of a reference standard are the tenant's data,
     not ours. Both are leaves (their only FKs are to organizations, which a
     purge updates rather than deletes, and users), so their position here is
     free; they are listed so a purge ERASES them rather than leaving them as
     residue for the coverage ratchet to baseline. */
  'cmc_container_closures',
  'cmc_reference_standards',
  /* The impurity and dissolution registers, for the same reason: an impurity
     profile with its qualification basis and a dissolution profile with its
     per-unit results are the tenant's data. Leaves, like the two above. */
  'cmc_impurity_profiles',
  'cmc_dissolution_profiles',
  /* The material specifications and the formulation record: supplier names,
     grades, batch formulae and overages are the tenant's own. Leaves. */
  'cmc_material_specs',
  'cmc_formulation_records',
  /* The characterisation register, same shape and same reason. */
  'cmc_characterization_studies',
  /* manufacturing_processes has an FK child (cmc_process_steps, ON DELETE
     CASCADE) so it is not a leaf, but it is org-keyed and it now holds the
     tenant's synthetic route, batch sizes and equipment: purged, not left as
     residue. */
  'manufacturing_processes',
  /* The guided CMC interview's sessions: every answer a staffer gave AnA
     about their drug substance and product, plus the register ids the commit
     produced. Tenant content in full. A leaf (FKs to organizations and
     users only). */
  'cmc_interview_sessions',
  /* The rendered-leaf register: the per-leaf PDF bytes a sequence was built
     from, addressed by vault version and pinned by sha256/md5. That is the
     tenant's own submission content and its integrity record — a tenant that
     asks to be erased must not keep the fingerprints of its filing here. A
     leaf (its only FKs are to organizations, which a purge updates rather than
     deletes, and users), so its position at the end is free. */
  'rendered_leaf_files',
  /* The assumptions and decisions register behind the resolution subsystem.
     Customer content in full: an assumption row carries the value the tenant
     assumed, their rationale and the source they took it from; a decision row
     carries the recommendation, who approved it and why it was rejected. Both
     are org-keyed and both are true leaves — neither declares a foreign key in
     either direction, which is precisely why a purge could not reach them: with
     no FK there is no cascade path, so nothing but this list can erase them.
     Position is therefore free. */
  'assumption_records',
  'decision_records',
  /* The lifecycle log of those governed decisions: every review, approval,
     rejection and escalation, with the actor, reason and notes. The same
     customer content as decision_records, one row per state change. A leaf
     since 2026-09-28: its only FK is to organizations (which a purge updates,
     never deletes), so with no cascade path nothing but this list reaches it.
     It joined the deploy set that day and ci:purge-coverage first ran over it
     on 2026-10-01 (CI run 12751), as the one new org-keyed table the purge
     could not reach. */
  'governed_decision_transitions',
  /* The co-authoring roster (af217590c, 2026-10-01): who is in which
     document, with their display name and e-mail. Personal data, so an
     erasure must remove it. Org-keyed with no foreign key in either direction,
     so no cascade reaches it and only this list does. */
  'collab_presence',
  /* AnA Command's project readiness snapshots (af217590c, 2026-10-01): the
     tenant's readiness score and state per project, over time. Tenant content,
     and a leaf for the same reason. Both were found by ci:purge-coverage on the
     blank-database job of CI run 12756. */
  'project_continuity_snapshots',
  /* Per-organization scheduled-job claims (U19, 4b1583a2c): one row per
     (organization, job, window), so a job runs once per window across processes.
     An operational record, but org-keyed with no foreign key, so it outlived a
     purge. A purge deletes only this tenant's claims; the estate-wide jobs
     claim under organization 0, which no tenant purge touches. Found by
     ci:purge-coverage on CI run 12804. */
  'scheduled_job_claims',
  /* The CMC workflow subsystem. All five are org-keyed with organization_id
     NOT NULL, so every row belongs to exactly one tenant — there is no
     platform-template population here for a purge to spare. What they hold is
     the tenant's own work: the commands, drug names and AI results of
     cmc_ai_tool_executions; the project names, teams and progress of the
     checklist and workflow instances; the task names, assignees and due dates
     under them; and the names, descriptions and template_data of cmc_workflows.

     Tasks before instances. cmc_workflow_tasks DOES cascade from
     cmc_workflow_instances today, so listing the parent alone would reach it —
     but the deletion then depends on a foreign key staying ON DELETE CASCADE,
     and this list is the thing that must not quietly stop reaching a table. */
  'cmc_workflow_tasks',
  'cmc_workflow_instances',
  'cmc_checklist_instances',
  'cmc_ai_tool_executions',
  'cmc_workflows',
  /* The organisation's own retention period (P1-22; ADR-0014 §6): its years,
     the reason and governing rule for a shorter one, and the user who set it.
     Each change's history is the chained audit row it wrote, which a purge
     keeps. The table's only FK is to organizations ON DELETE CASCADE, and a
     purge updates that row rather than deleting it, so the cascade never fires
     and nothing but this list erases it. A leaf, so its position is free. */
  'organization_retention_settings',
  /* AnA turn records and the texts they reference (rows D5/D6, 2026-10-01).
     A turn record's body is Customer Data: the person's question, the files
     and passages AnA was given, its tool inputs and its answer. The tenant
     export returns it, and the purge erases it. Its audit-trail record, the
     turn's chained audit_logs row, is kept with the rest of the audit trail
     (MSA §10.2, DPA §3.5). Both tables refuse a plain DELETE from every role;
     deleteTenantRows erases both, once, through their PURGE_DOORS entry, and
     a door opens only for a table on this list. The 3938f0659 merge dropped
     these two entries, so a purge kept every turn record until they were
     restored (tenant-purge-artifact-records.dbtest.ts). Leaves, so their
     position is free. */
  'ana_turn_records',
  'ana_record_blobs',
  /* Four org-keyed tables no foreign key reaches, so only this list does.
     Found by ci:purge-coverage on the blank-database job of run 37245632351
     (2026-10-05). Leaves, so their positions are free.
     - organization_gateway_accounts (D7, 20261001g): the account each agency
       gateway transmits under, and for a client account the credentials the
       organisation supplied, encrypted. An erased tenant must not leave its
       gateway credentials behind. Who sent what under which identity stays on
       each transmittal record, which is not purged here.
     - session_activity (20261001e): sign-in session state shared across
       processes (last activity, superseded markers). Operational, and the
       sign-in audit rows are kept elsewhere; the estate's organisation-0 rows
       are not this tenant's and are not touched.
     - coordination_leases (20261001f): the per-organisation lock and
       concurrency leases of AnA governed actions. Operational. */
  'organization_gateway_accounts',
  'session_activity',
  'coordination_leases',
  /* study_pivotal_declarations (20261029e): the sponsor's per-study pivotal
     declaration that Module 2 reads. Append-only to the application (UPDATE
     and TRUNCATE refused); DELETE is this purge's. No foreign key, so a leaf. */
  'study_pivotal_declarations',
  /* submission_filed_baselines (20261029g): signed declarations of the US
     sequences a submission filed outside the platform. Append-only to the
     application (UPDATE and TRUNCATE refused); DELETE is this purge's. No
     foreign key, so a leaf. */
  'submission_filed_baselines',
  'estar_submission_events', // a tracked filing's history (20261030, fold F5): append-only, DELETE is this purge's; its key cascades from estar_submissions
  /* citation_chains: which of the tenant's documents cite which. It became
     org-keyed in 15af6bc4 (20260813_knowledge_graph_tenant_keys.sql, amended
     2026-10-12), and ci:purge-coverage then failed every Blank DB run: an
     erased tenant kept its citation rows. No foreign key, so a leaf. Rows the
     backfill could not attribute stay NULL and belong to no tenant, so a purge
     does not touch them (2026-10-13). */
  'citation_chains',
]);
