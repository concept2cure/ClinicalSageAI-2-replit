/** Reservations for the new receipt store in the canonical tenant purge.
 * Source barriers precede actor/status rows, matching the receipt writer. */
import type { PoolClient } from 'pg';
import { OffboardingStateError, type PurgePreconditions } from './tenant-offboarding';
import { findExportReceipt, type ExportReceipt } from '../tenant-export/tenant-full-export.service';

const STORE = 'ana_source_read_receipts';

async function relationPresent(q: PoolClient, relation: string): Promise<boolean> {
  const { rows } = await q.query('SELECT to_regclass($1) IS NOT NULL AS present', [relation]);
  if (rows.length !== 1 || typeof rows[0].present !== 'boolean') {
    throw new OffboardingStateError('SOURCE_READ_RECEIPT_PURGE_UNAVAILABLE', 'The source receipt purge schema could not be verified. Nothing was purged.');
  }
  return rows[0].present;
}

async function reserveCurrentStatus(q: PoolClient, organizationId: number, preconditions: PurgePreconditions): Promise<void> {
  const { rows } = await q.query('SELECT status, purge_eligible_at, purged_at FROM organizations WHERE id=$1 FOR UPDATE', [organizationId]);
  if (rows.length !== 1) throw new OffboardingStateError('TENANT_NOT_FOUND', 'Organization not found');
  const row = rows[0];
  if (row.status !== 'pending_deletion' || row.purged_at) {
    throw new OffboardingStateError('TENANT_NOT_PENDING_DELETION', 'The tenant is no longer pending deletion. Nothing was purged.');
  }
  const eligibleAt = row.purge_eligible_at == null ? Number.NaN : new Date(row.purge_eligible_at).getTime();
  if ((!Number.isFinite(eligibleAt) || Date.now() < eligibleAt) && !preconditions.overrideRetentionWindowReason?.trim()) {
    throw new OffboardingStateError('RETENTION_WINDOW_OPEN', 'The current retention window has not closed. Nothing was purged.');
  }
}

function exportIdentity(receipt: ExportReceipt): string {
  return JSON.stringify([receipt.organizationId, receipt.digest, String(receipt.tableCount), String(receipt.rowCount),
    new Date(receipt.createdAt).toISOString(), receipt.createdBy]);
}

/** True only when the participating store exists and its barriers are held. */
export async function reserveSourceReadReceiptPurge(q: PoolClient, input: {
  organizationId: number; childTables: readonly string[]; receipt: ExportReceipt; preconditions: PurgePreconditions;
}): Promise<boolean> {
  if (!input.childTables.includes(STORE) || !await relationPresent(q, `public.${STORE}`)) return false;
  // Fixed identifiers, never request/body identifiers. ROW EXCLUSIVE conflicts
  // with a receipt writer's SHARE and permits this transaction's later DELETE.
  if (await relationPresent(q, 'vault.document_catalog')) await q.query('LOCK TABLE vault.document_catalog IN ROW EXCLUSIVE MODE');
  if (await relationPresent(q, 'vault.documents')) await q.query('LOCK TABLE vault.documents IN ROW EXCLUSIVE MODE');
  await reserveCurrentStatus(q, input.organizationId, input.preconditions);
  if (!await relationPresent(q, 'vault.legal_holds')) {
    throw new OffboardingStateError('SOURCE_READ_RECEIPT_PURGE_UNAVAILABLE', 'The legal-hold state required to purge source receipts is unavailable. Nothing was purged.');
  }
  await q.query('LOCK TABLE vault.legal_holds IN SHARE MODE');
  const current = await findExportReceipt(q, input.organizationId, input.receipt.digest, { hold: true });
  if (!current || exportIdentity(current) !== exportIdentity(input.receipt)) {
    throw new OffboardingStateError('EXPORT_EVIDENCE_UNVERIFIED', 'The verified final export changed during this purge request. Nothing was purged.');
  }
  return true;
}
