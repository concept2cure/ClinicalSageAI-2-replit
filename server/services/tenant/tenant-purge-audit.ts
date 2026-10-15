/**
 * The tenant purge's own audit row (P1-23 part, DP-10 residual).
 *
 * `purgeTenant` (./tenant-offboarding.ts) destroys a tenant's content. Until
 * this, the only record a purge wrote of itself was a logger line: nothing in
 * the audit trail named who purged which organisation, when, on the strength of
 * which export, or what it deleted. A log line is not an audit trail (21 CFR
 * Part 11 §11.10(e)): it is not chained, not sealed, and not retained with the
 * records.
 *
 * `recordPurge` writes ONE sha256-chained audit_logs row through
 * writeChainedAuditRow, on the purge's TRANSACTION client, after the deletes and
 * the status change and before COMMIT. A refused row throws, and the purge rolls
 * everything back: a purge with no record of itself does not happen.
 *
 * Which organisation, and why it survives. The row goes on the purged
 * organisation's own chain (tenant_id = that id). audit_logs is keyed by
 * tenant_id, not organization_id, so the purge's uniform predicate cannot match
 * it; it is in no purge list (PURGE_CHILD_TABLES keeps the audit trail out on
 * purpose); and its no-delete trigger refuses a DELETE from anyone. The
 * organizations row it names survives too, in status `purged`. The route runs
 * in the platform scope, whose super-admin arm is what audit_logs' FORCE RLS
 * admits for another organisation's row (tests/db/tenant-purge-audit.dbtest.ts
 * runs it that way).
 */
import type { PoolClient } from 'pg';
import { writeChainedAuditRow } from '../auditService';
import type { ExportReceipt } from '../tenant-export/tenant-full-export.service';
import type { OffboardingRecord } from './tenant-offboarding';

/** The audit action a purge writes. */
export const TENANT_PURGED_ACTION = 'tenant_purged';

/** Where the purge request came from. Set by the route. */
export interface PurgeAuditContext {
  ipAddress?: string;
  userAgent?: string;
}

export interface PurgeRecord {
  /** The organization as the purge's preconditions read it, before the purge. */
  existing: OffboardingRecord;
  /** The verified export receipt that authorized the purge. */
  receipt: ExportReceipt;
  purgedByUserId: number;
  /** The instant the organizations row records as purged_at. */
  purgedAt: Date | null;
  /** Rows deleted per listed table, as the database counted them. */
  deletedRows: Record<string, number>;
  /** Listed tables this deployment's schema does not have. */
  tablesAbsent: string[];
  /** Stored vault objects whose bytes are erased after COMMIT. */
  vaultObjectsToErase: number;
  retentionOverrideReason?: string;
  auditContext?: PurgeAuditContext;
}

const isoOrNull = (d: Date | null | undefined): string | null => (d ? new Date(d).toISOString() : null);

/** Write the purge's chained audit row on the caller's transaction client. Throws when refused. */
export async function recordPurge(client: PoolClient, purge: PurgeRecord): Promise<void> {
  const { existing, receipt } = purge;
  const totalRowsDeleted = Object.values(purge.deletedRows).reduce((n, c) => n + c, 0);
  await writeChainedAuditRow(client, {
    tenantId: existing.organizationId,
    userId: purge.purgedByUserId,
    action: TENANT_PURGED_ACTION,
    resourceType: 'organizations',
    resourceId: String(existing.organizationId),
    reason: existing.deletionReason ?? undefined,
    ipAddress: purge.auditContext?.ipAddress,
    userAgent: purge.auditContext?.userAgent,
    details: {
      organizationId: existing.organizationId,
      organizationName: existing.name,
      purgedBy: purge.purgedByUserId,
      purgedAt: isoOrNull(purge.purgedAt),
      deletionRequestedAt: isoOrNull(existing.deletionRequestedAt),
      deletionRequestedBy: existing.deletionRequestedBy,
      deletionReason: existing.deletionReason,
      purgeEligibleAt: isoOrNull(existing.purgeEligibleAt),
      retentionOverrideReason: purge.retentionOverrideReason?.trim() || null,
      exportManifest: {
        digest: receipt.digest,
        tableCount: receipt.tableCount,
        rowCount: Number(receipt.rowCount),
        exportedAt: isoOrNull(receipt.createdAt),
        exportedBy: receipt.createdBy,
      },
      deletedRows: purge.deletedRows,
      tablesAbsent: purge.tablesAbsent,
      totalRowsDeleted,
      vaultObjectsToErase: purge.vaultObjectsToErase,
    },
  });
}
