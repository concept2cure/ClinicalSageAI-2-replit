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

import type { Pool } from 'pg';
import { createScopedLogger } from '../../utils/logger';
import { invalidateTenantPosture } from './tenant-lifecycle';
import { invalidateOrgMembershipCache } from '../../middleware/orgMembership';
import { findExportReceipt } from '../tenant-export/tenant-full-export.service';

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
 * Destroy a tenant's data.
 *
 * Refuses unless ALL of the following hold:
 *   1. the organization is in `pending_deletion`;
 *   2. `purge_eligible_at` has passed, OR an explicit override reason is given;
 *   3. a final export digest is supplied.
 *
 * The organization ROW SURVIVES, in status `purged`, carrying the offboarding
 * evidence — who requested it, when, why, which export was handed over, who
 * executed the purge. Destroying that row too would delete the audit trail of
 * the deletion, which is precisely what Part 11 §11.10(e) forbids. The tenant's
 * *content* is gone; the *record that it existed and was removed* is not.
 */
/**
 * Every reason a purge may not proceed, checked before a single row is touched.
 * Throws `OffboardingStateError`; returns the organization when all hold.
 */
async function assertPurgePermitted(
  pool: Pool,
  organizationId: number,
  preconditions: PurgePreconditions
): Promise<OffboardingRecord> {
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

  return existing;
}

/** Empty one tenant-owned table. Absent tables are skipped; other errors abort. */
async function purgeChildTable(
  pool: Pool,
  table: string,
  organizationId: number
): Promise<void> {
  // Table names come from the frozen constant below, never from a caller's
  // string, so interpolation here cannot be influenced by request input. The
  // regex is a belt-and-braces assertion on that invariant.
  if (!/^[a-z_][a-z0-9_]*$/.test(table)) {
    throw new OffboardingStateError('INVALID_PURGE_TABLE', `Unsafe table name: ${table}`);
  }
  try {
    await pool.query(`DELETE FROM ${table} WHERE organization_id = $1`, [organizationId]);
  } catch (error) {
    // A table absent from this deployment's schema is expected — the schema
    // varies by edition. A different error is not, and must abort the purge
    // rather than leave the tenant half-destroyed.
    const code = (error as { code?: string }).code;
    if (code === '42P01' || code === '42703') {
      logger.debug('Purge skipped a table not present in this schema', { table });
      return;
    }
    throw error;
  }
}

export async function purgeTenant(
  pool: Pool,
  params: {
    organizationId: number;
    purgedByUserId: number;
    preconditions: PurgePreconditions;
    /** Tables purged, in FK-safe order. Injected so callers/tests can narrow it. */
    childTables?: readonly string[];
  }
): Promise<OffboardingRecord> {
  const { organizationId, purgedByUserId, preconditions } = params;

  await assertPurgePermitted(pool, organizationId, preconditions);

  const childTables = params.childTables ?? PURGE_CHILD_TABLES;

  await pool.query('BEGIN');
  try {
    for (const table of childTables) {
      await purgeChildTable(pool, table, organizationId);
    }

    await pool.query(
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
              updated_at             = NOW()
        WHERE id = $1`,
      [organizationId, purgedByUserId, preconditions.finalExportDigest]
    );

    await pool.query('COMMIT');
  } catch (error) {
    await pool.query('ROLLBACK').catch(() => {});
    throw error;
  }

  invalidateTenantPosture(organizationId);
  invalidateOrgMembershipCache(undefined, organizationId);

  logger.warn('Tenant purged', {
    organizationId,
    purgedByUserId,
    retentionOverride: preconditions.overrideRetentionWindowReason ?? null,
    finalExportDigest: preconditions.finalExportDigest,
  });

  const after = await readOrganization(pool, organizationId);
  // The row is guaranteed to exist — the purge updates it rather than deleting
  // it, precisely so the deletion remains auditable.
  return after as OffboardingRecord;
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
  // Access requests contain the member's free-text business justification and
  // the administrator's decision reason. The canonical audit event survives;
  // this tenant-owned working record does not.
  'module_access_requests',
  // CMC/project workflow payloads are customer plans and assignments. Delete
  // them before their project parents; workflow_tasks cascade where the
  // canonical FK is present, while editions without this table/column are
  // safely skipped by purgeChildTable.
  'project_workflows',
  'organization_users',
  'client_workspaces',
  'projects',
  'documents',
  'vault_documents',
  'document_chunks',
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
]);
