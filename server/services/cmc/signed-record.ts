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

/**
 * The action a signed record's retirement records on the chain. Exported so the
 * one place that writes it and the one place that labels it for a reader
 * (`register-history.ts`) cannot drift into two spellings of one act.
 */
export const CMC_REGISTER_RETIRE_SIGNED = 'cmc.register.retire_signed' as const;

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
    | 'manufacturing_processes'
    | 'analytical_methods'
    | 'process_validation'
    | 'cmc_comparability_assessments'
    | 'stability_studies';
  /** The status column, snake_case. */
  statusColumn: 'status' | 'validation_status';
  /** The same column as the request body names it. */
  statusField: 'status' | 'validationStatus';
  /**
   * The word the register's own status column holds when the record is signed,
   * in the register's own casing: the stability register's vocabulary is
   * upper-case (DRAFT, ACTIVE, PAUSED, COMPLETED), and writing a lower-case
   * word into it would leave one row disagreeing with the other three hundred
   * — and lose the status chip's tone, which compares the word exactly
   * (CmcModule.tsx). Every comparison against it lowercases BOTH sides.
   */
  signedValue: 'qualified' | 'validated' | 'approved' | 'COMPLETED';
  /** The two columns the signature writes, snake_case, then as a body names them. */
  signedByColumn: string;
  signedAtColumn: string;
  signedByField: string;
  signedAtField: string;
  /**
   * What goes INTO the signer column. Every register but one holds a
   * `users.id` reference; `cmc_comparability_assessments.reviewed_by` is free
   * TEXT with no FK, and §3.2.P.8 prints it as the *Reviewed By* name — so a
   * signature that wrote the id there would make the composed dossier read
   * "Reviewed By: 3". The ceremony resolves the signer's printed name for a
   * `name` column, through the same `resolveSignerIdentity` the §11.50 row
   * uses, so the two cannot name different people.
   */
  signedByKind?: 'userId' | 'name';
  /**
   * The register's own segment under /api/cmc, and the segment that performs
   * the signature. Together they are the path a refusal tells the caller to
   * POST to, so the message can never name an endpoint that does not exist.
   */
  registerPath: string;
  signPath: 'qualify' | 'validate' | 'approve' | 'close-out';
  /** What a refusal calls the act — the subject of "X is a governed action". */
  verb: string;
  /** What the audit row and the messages call the record. */
  noun: string;
  idKind: 'integer' | 'uuid';
}

/**
 * One row per register that has a signed state. This is the ONLY place the
 * answer to "which word does this register sign with, into which columns, at
 * which path" is written down: the create refusal, the edit refusal, the
 * signing ceremony and the client's status control all read it from here.
 *
 * Until 2026-10-18 the answer was split three ways — `QUALIFICATION_VOCAB` /
 * `PROCESS_VOCAB` passed in at each call site, the `signing` block each
 * ceremony declared, and this table — and five registers had the rule while
 * eight more offered their signed word on a plain dropdown
 * (docs/evidence/CMC-M3-GA/2026-10-18/05-ungoverned-signed-states/).
 */
export const SIGNED_REGISTERS = {
  containerClosures: {
    table: 'cmc_container_closures', statusColumn: 'status', statusField: 'status',
    signedValue: 'qualified', signedByColumn: 'qualified_by', signedAtColumn: 'qualification_date',
    signedByField: 'qualifiedBy', signedAtField: 'qualificationDate',
    registerPath: 'container-closures', signPath: 'qualify', verb: 'Qualification',
    noun: 'container closure system', idKind: 'integer',
  },
  referenceStandards: {
    table: 'cmc_reference_standards', statusColumn: 'status', statusField: 'status',
    signedValue: 'qualified', signedByColumn: 'qualified_by', signedAtColumn: 'qualification_date',
    signedByField: 'qualifiedBy', signedAtField: 'qualificationDate',
    registerPath: 'reference-standards', signPath: 'qualify', verb: 'Qualification',
    noun: 'reference standard', idKind: 'integer',
  },
  impurityProfiles: {
    table: 'cmc_impurity_profiles', statusColumn: 'status', statusField: 'status',
    signedValue: 'qualified', signedByColumn: 'qualified_by', signedAtColumn: 'qualification_date',
    signedByField: 'qualifiedBy', signedAtField: 'qualificationDate',
    registerPath: 'impurity-profiles', signPath: 'qualify', verb: 'Qualification',
    noun: 'impurity profile', idKind: 'integer',
  },
  characterizationStudies: {
    table: 'cmc_characterization_studies', statusColumn: 'status', statusField: 'status',
    signedValue: 'qualified', signedByColumn: 'qualified_by', signedAtColumn: 'qualification_date',
    signedByField: 'qualifiedBy', signedAtField: 'qualificationDate',
    registerPath: 'characterization-studies', signPath: 'qualify', verb: 'Qualification',
    noun: 'characterization study', idKind: 'integer',
  },
  manufacturingProcesses: {
    table: 'manufacturing_processes', statusColumn: 'validation_status', statusField: 'validationStatus',
    signedValue: 'validated', signedByColumn: 'validated_by', signedAtColumn: 'validation_date',
    signedByField: 'validatedBy', signedAtField: 'validationDate',
    registerPath: 'manufacturing-processes', signPath: 'validate', verb: 'Process validation',
    noun: 'manufacturing process', idKind: 'uuid',
  },
  /* ── Added 2026-10-18. Each of these three already had the two signature
     columns and no signature: the status word, the signer and the date were
     all request-body fields, and the composer, the ICH engines and the
     contradiction sweep read the result as a completed governance act. ── */
  analyticalMethods: {
    table: 'analytical_methods', statusColumn: 'status', statusField: 'status',
    /* §3.2.S.4.3's 'Validation Status' column, the ICH Q2 engine's VALIDATED
       set, and the sweep's method_validation_gap all turn on this word. */
    signedValue: 'validated', signedByColumn: 'validated_by', signedAtColumn: 'validation_date',
    signedByField: 'validatedBy', signedAtField: 'validationDate',
    registerPath: 'analytical-methods', signPath: 'validate', verb: 'Method validation (ICH Q2)',
    noun: 'analytical method', idKind: 'integer',
  },
  processValidation: {
    table: 'process_validation', statusColumn: 'status', statusField: 'status',
    signedValue: 'approved', signedByColumn: 'approved_by', signedAtColumn: 'approval_date',
    signedByField: 'approvedBy', signedAtField: 'approvalDate',
    registerPath: 'process-validation', signPath: 'approve',
    verb: 'Approval of a process-validation record',
    noun: 'process validation record', idKind: 'integer',
  },
  comparabilityAssessments: {
    table: 'cmc_comparability_assessments', statusColumn: 'status', statusField: 'status',
    /* `reviewed_by` is free TEXT with no FK (shared/schema/regulatory-atoms.ts)
       and is printed as §3.2.P.8's 'Reviewed By'. The ceremony writes the
       signer's own id into it; it is no longer a field a caller can name. */
    signedValue: 'approved', signedByColumn: 'reviewed_by', signedAtColumn: 'approved_at',
    signedByField: 'owner', signedAtField: 'approvedAt', signedByKind: 'name',
    registerPath: 'comparability-studies', signPath: 'approve',
    verb: 'Approval of a comparability assessment (ICH Q5E)',
    /* uuid, not serial (shared/schema/regulatory-atoms.ts: the atom tables are
       uuid-keyed). Declared 'integer' at first, which made every approval
       answer "A comparability assessment id is required" — found by running
       the ceremony against the register rather than by reading it. */
    noun: 'comparability assessment', idKind: 'uuid',
  },
  /* ── Added 2026-10-19: the last ungoverned signed state. ──────────────────
     The shelf life §3.2.S.7.1 / §3.2.P.8.1 prints as the dossier's claim, and
     the value the ICH Q1E rule judges a programme against, was set by an
     ordinary PUT together with the terminal status:
     `{"shelfLife":"36 months at 25C/60%RH","status":"COMPLETED"}` answered 200
     with no signature row, no reason and no re-authentication
     (docs/evidence/CMC-M3-GA/2026-10-19/11-stability-close-out/).

     The two signature columns are new (the sibling registers already had
     theirs): migrations/20261019_stability_shelf_life_signature.sql. */
  stabilityStudies: {
    table: 'stability_studies', statusColumn: 'status', statusField: 'status',
    signedValue: 'COMPLETED', signedByColumn: 'shelf_life_signed_by', signedAtColumn: 'shelf_life_signed_at',
    signedByField: 'shelfLifeSignedBy', signedAtField: 'shelfLifeSignedAt',
    registerPath: 'stability-studies', signPath: 'close-out',
    verb: 'Closing out a stability study with its shelf life',
    noun: 'stability study', idKind: 'integer',
  },
} as const satisfies Record<string, SignedRegister>;

/** The register that owns an /api/cmc path segment, or undefined. */
export function signedRegisterByPath(registerPath: string): SignedRegister | undefined {
  return Object.values(SIGNED_REGISTERS).find((r) => r.registerPath === registerPath);
}

/**
 * Strip the two signature columns from a patch or an insert, whichever pair
 * this register uses. Who signed, and when, is written only by the ceremony.
 */
export function withoutSignatureFields<T extends Record<string, unknown>>(
  register: SignedRegister,
  data: T,
): Record<string, unknown> {
  const rest: Record<string, unknown> = { ...data };
  delete rest[register.signedByField];
  delete rest[register.signedAtField];
  delete rest.organizationId;
  return rest;
}

/** Whether the stored status is the register's signed state. */
export function isSigned(register: SignedRegister, storedStatus: unknown): boolean {
  return String(storedStatus ?? '').trim().toLowerCase() === register.signedValue.toLowerCase();
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
    /* Both sides lowercased — see `isSigned`: a register keeps its own casing
       (the stability vocabulary is upper-case), and a raw comparison here would
       refuse to retire a closed-out stability study with "that study is not
       COMPLETED" while it plainly is. */
    if (String(row.status ?? '').toLowerCase() !== signedValue.toLowerCase()) {
      return refuse(409, 'NOT_SIGNED', `That ${noun} is not ${signedValue}; retire it with an ordinary edit.`);
    }
    await client.query(
      `UPDATE ${table} SET ${statusColumn} = 'retired', updated_at = NOW() WHERE id = $1 AND organization_id = $2`,
      [a.id, a.organizationId],
    );
    await writeChainedAuditRow(client, {
      tenantId: a.organizationId,
      userId: a.userId,
      action: CMC_REGISTER_RETIRE_SIGNED,
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
