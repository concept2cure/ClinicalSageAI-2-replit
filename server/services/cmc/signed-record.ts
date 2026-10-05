/**
 * A signed CMC record is not changed under its signature.
 *
 * The register, specification and batch signatures (qualify, validate,
 * approve, release) bind the governed-action ledger hash, not a digest of the
 * record's content. So a content edit after signing left the signature in
 * place over values nobody signed, and nothing on the signature showed it:
 *
 * - an approved specification's acceptance criteria could be rewritten and it
 *   stayed `approved`;
 * - a qualified reference standard, container closure, impurity profile or
 *   characterization study, or a validated manufacturing process, could have
 *   its content changed while keeping its status;
 * - a released batch's release testing could be overwritten by a plain PUT,
 *   and a batch could be given a disposition with no signature at all.
 *
 * One rule per record kind, stated here once:
 *
 * - **Specification.** Editing an approved specification WITHDRAWS its
 *   approval: the record returns to draft and must be approved again. The edit
 *   needs a governed reason, recorded on a chained audit row. (A specification
 *   is revised in place; the same record is re-approved.)
 * - **Qualified register record / validated process.** Its content is closed to
 *   ordinary edits. It can be retired, with a governed reason, and a new
 *   record is recorded and signed.
 * - **Batch.** A disposition is only ever the signed release. Once a batch
 *   carries a signed disposition its record is closed to ordinary edits;
 *   `released` and `rejected` are final.
 *
 * @module server/services/cmc/signed-record
 */
import type { PoolClient } from 'pg';
import { writeChainedAuditRow } from '../auditService.js';
import { requireGovernedReason } from '../../routes/governed-reason';
import { type Refusal, refuse, inRefusableTransaction } from '../vault/vault-refusal.js';

/* ─── Specifications ───────────────────────────────────────────────────────── */

export function isApprovedSpecification(stored: { approval_status?: unknown }): boolean {
  return String(stored.approval_status ?? '').trim().toLowerCase() === 'approved';
}

/* ─── Qualified register records ───────────────────────────────────────────── */

export interface SignedRegister {
  /** Literal table name from a closed set — never caller input. */
  table:
    | 'cmc_container_closures'
    | 'cmc_reference_standards'
    | 'cmc_impurity_profiles'
    | 'cmc_characterization_studies'
    | 'manufacturing_processes';
  /** The status column, snake_case. */
  statusColumn: 'status' | 'validation_status';
  /** The same column as the request body names it. */
  statusField: 'status' | 'validationStatus';
  signedValue: 'qualified' | 'validated';
  /** What the audit row and the messages call the record. */
  noun: string;
  idKind: 'integer' | 'uuid';
}

export const SIGNED_REGISTERS = {
  containerClosures: {
    table: 'cmc_container_closures', statusColumn: 'status', statusField: 'status',
    signedValue: 'qualified', noun: 'container closure system', idKind: 'integer',
  },
  referenceStandards: {
    table: 'cmc_reference_standards', statusColumn: 'status', statusField: 'status',
    signedValue: 'qualified', noun: 'reference standard', idKind: 'integer',
  },
  impurityProfiles: {
    table: 'cmc_impurity_profiles', statusColumn: 'status', statusField: 'status',
    signedValue: 'qualified', noun: 'impurity profile', idKind: 'integer',
  },
  characterizationStudies: {
    table: 'cmc_characterization_studies', statusColumn: 'status', statusField: 'status',
    signedValue: 'qualified', noun: 'characterization study', idKind: 'integer',
  },
  manufacturingProcesses: {
    table: 'manufacturing_processes', statusColumn: 'validation_status', statusField: 'validationStatus',
    signedValue: 'validated', noun: 'manufacturing process', idKind: 'uuid',
  },
} as const satisfies Record<string, SignedRegister>;

/** Whether the stored status is the register's signed state. */
export function isSigned(register: SignedRegister, storedStatus: unknown): boolean {
  return String(storedStatus ?? '').trim().toLowerCase() === register.signedValue;
}

/** Whether a patch asks only to retire the record (with or without a reason). */
export function isRetirement(register: SignedRegister, patch: Record<string, unknown>): boolean {
  const keys = Object.keys(patch).filter((k) => k !== 'reason' && patch[k] !== undefined);
  return keys.length === 1 && keys[0] === register.statusField
    && String(patch[register.statusField] ?? '').trim().toLowerCase() === 'retired';
}

/**
 * Why an ordinary edit of a signed register record is refused, or null.
 * Applies only when the stored record is in its signed state; retirement is
 * the one change admitted, and it goes through `retireSignedRecord`.
 */
export function signedRegisterEditRefusal(
  register: SignedRegister,
  storedStatus: unknown,
  patch: Record<string, unknown>,
): string | null {
  if (!isSigned(register, storedStatus)) return null;
  if (isRetirement(register, patch)) return null;
  return (
    `This ${register.noun} is ${register.signedValue} under a recorded signature, so its content cannot be ` +
    `changed by an ordinary edit: the signature would stay on values nobody signed. ` +
    `Retire it with a reason, then record and sign a new one.`
  );
}

/**
 * Retire a signed register record with a governed reason: the status and a
 * chained audit row in one transaction. Returns the id on success.
 */
export async function retireSignedRecord(a: {
  register: SignedRegister;
  id: string;
  organizationId: number;
  userId: number;
  reason: unknown;
  ipAddress?: string;
  userAgent?: string;
}): Promise<{ ok: true } | Refusal> {
  const reason = requireGovernedReason(a.reason);
  if (!reason.ok) return refuse(422, 'REASON_REQUIRED', reason.error);
  const { table, statusColumn, signedValue, noun } = a.register;
  return inRefusableTransaction(async (client: PoolClient) => {
    const { rows } = await client.query(
      `SELECT id, project_id, ${statusColumn} AS status FROM ${table}
        WHERE id = $1 AND organization_id = $2 FOR UPDATE`,
      [a.id, a.organizationId],
    );
    const row = rows[0];
    if (!row) return refuse(404, 'NOT_FOUND', `That ${noun} was not found.`);
    if (String(row.status ?? '').toLowerCase() !== signedValue) {
      return refuse(409, 'NOT_SIGNED', `That ${noun} is not ${signedValue}; retire it with an ordinary edit.`);
    }
    await client.query(
      `UPDATE ${table} SET ${statusColumn} = 'retired', updated_at = NOW() WHERE id = $1 AND organization_id = $2`,
      [a.id, a.organizationId],
    );
    await writeChainedAuditRow(client, {
      tenantId: a.organizationId,
      userId: a.userId,
      action: 'cmc.register.retire_signed',
      resourceType: table,
      resourceId: String(row.id),
      ipAddress: a.ipAddress,
      userAgent: a.userAgent,
      details: { projectId: row.project_id ?? null, from: signedValue, to: 'retired', reason: reason.reason },
    });
    return { ok: true as const };
  });
}

/* ─── Batch records ────────────────────────────────────────────────────────── */

/** A status that states a disposition. Only the signed release writes one. */
const DISPOSITION_STATUSES = new Set(['released', 'conditional-release', 'rejected', 'pending-review', 'approved']);

/** Dispositions after which no further disposition is signed. */
export const FINAL_BATCH_DISPOSITIONS = new Set(['released', 'rejected']);

/** Why a batch create or edit is refused, or null. `stored` is absent on create. */
export function batchWriteRefusal(
  patch: Record<string, unknown>,
  stored?: { release_status?: unknown; batch_number?: unknown },
): string | null {
  if (Object.prototype.hasOwnProperty.call(patch, 'releaseTesting')) {
    return 'Release testing is recorded with the batch disposition, under a signature: ' +
      'POST /api/cmc/batch-records/:id/release with a reason and re-authentication.';
  }
  const status = String(patch.status ?? '').trim().toLowerCase();
  if (status && DISPOSITION_STATUSES.has(status)) {
    return `"${status}" is a batch disposition, and a disposition is only ever the signed release: ` +
      'POST /api/cmc/batch-records/:id/release with a reason and re-authentication.';
  }
  const disposed = String(stored?.release_status ?? '').trim().toLowerCase();
  if (stored && disposed) {
    return `Batch ${String(stored.batch_number ?? '')} carries a signed disposition (${disposed}), so its record ` +
      'cannot be changed by an ordinary edit: the signature would stay on values nobody signed.';
  }
  return null;
}

/** Why a further disposition is refused, or null. */
export function batchReleaseRefusal(stored: { release_status?: unknown; batch_number?: unknown }): string | null {
  const disposed = String(stored.release_status ?? '').trim().toLowerCase();
  if (FINAL_BATCH_DISPOSITIONS.has(disposed)) {
    return `Batch ${String(stored.batch_number ?? '')} is already ${disposed} under a recorded signature. ` +
      'That disposition is final.';
  }
  return null;
}
