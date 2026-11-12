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
/* The one validation vocabulary, which lives with the record whose field it
   interprets (services/cmc/analytical-method-source.ts). */
import { METHOD_SUITABLE, METHOD_VALIDATED } from './analytical-method-source.js';

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
  /**
   * The outcomes this register's signed act may record, where it records more
   * than one. Absent means one: `signedValue`.
   *
   * Only the analytical-method register has two (P-110 item 1, 2026-11-09).
   * FDA asks at phase 1 for procedures that are scientifically sound and fit
   * for their use, with full validation by the pivotal phase (21 CFR
   * 312.23(a)(7); ICH Q2(R2) and Q14) — so the act records WHICH of the two
   * the signer is attesting, through the same ceremony, audit and route. There
   * is no second endpoint.
   */
  signedOutcomes?: readonly SignedOutcome[];
  /**
   * Status words this register's act alone may write, beyond the outcomes'
   * own values — so an ordinary edit cannot type one in.
   *
   * The analytical-method register needs this because the specification
   * approval gate honours a vocabulary wider than the words the act writes
   * (`METHOD_VALIDATED` and `METHOD_SUITABLE`,
   * `services/cmc/analytical-method-source.ts`). P-110: "a word typed into a
   * GxP register must not unlock an approval that validation reaches only by
   * signature", including as an interim. Every word the gate would honour is
   * therefore refused on an edit.
   */
  governedValues?: readonly string[];
}

/**
 * One outcome a register's signed act may record.
 *
 * `value` is what the status column holds afterwards; it is NOT narrowed to
 * `signedValue`'s union, because an outcome's word is the register's own
 * vocabulary rather than the one default word every register has.
 */
export interface SignedOutcome {
  /** The word the request names, matched trimmed and lower-cased. */
  outcome: string;
  /** The status the register's column holds once the act commits. */
  value: string;
  /** What the §11.50 compliance statement says was attested. */
  attests: string;
  /** True when the signer must also state the phase the record is fit for. */
  requiresPhase?: boolean;
  /**
   * How much the outcome attests, for refusing a signed step DOWN. A method
   * validated in full is not returned to "suitable for the phase" by a second
   * signature: that would leave the register claiming less than someone has
   * already attested, with no record of the retraction.
   */
  rank: number;
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
/**
 * Which outcome a signing request records, or why it is refused.
 *
 * Pure, and in this module because the answer is the descriptor's own: the
 * ceremony in `server/api/cmc/routes.ts` asks, it does not decide. Keeping it
 * here also keeps that handler under its complexity cap.
 *
 * A request that names no outcome gets the register's first — `validated` for
 * the analytical-method register, which is what every caller sent before
 * P-110, so nothing that worked stops working.
 */
/** The answer for a register whose act records exactly one outcome. */
function soleOutcome(
  register: SignedRegister,
  asked: string,
  sent: unknown,
): { value: string; attests: string; phase: null } | { refusal: string } {
  if (asked && asked !== register.signedValue.toLowerCase()) {
    return {
      refusal:
        `${register.verb} records one outcome, ${register.signedValue}, so "${String(sent)}" is not an ` +
        'outcome it can sign for. Omit the outcome.',
    };
  }
  return { value: register.signedValue, attests: register.verb, phase: null };
}

/**
 * Why a signed step DOWN is refused, or null.
 *
 * The register would end up claiming less than someone has already attested,
 * with the earlier signature overwritten rather than retracted. A status that
 * is not one of the outcomes (`development`, `retired`) holds no rank, so
 * neither side of the comparison fires.
 */
function stepDownRefusal(
  register: SignedRegister,
  outcomes: readonly SignedOutcome[],
  chosen: SignedOutcome,
  storedStatus: unknown,
): string | null {
  const stored = String(storedStatus ?? '').trim().toLowerCase();
  const held = outcomes.find((o) => o.value.toLowerCase() === stored);
  if (!held || held.rank <= chosen.rank) return null;
  return (
    `This ${register.noun} is already recorded as ${held.value}, which attests ${held.attests}. Signing ` +
    `"${chosen.outcome}" would record less than that under a second signature, overwriting the first rather ` +
    'than retracting it. Record a new assessment instead.'
  );
}

export function resolveSignedOutcome(
  register: SignedRegister,
  body: { outcome?: unknown; phase?: unknown },
  storedStatus: unknown,
): { value: string; attests: string; phase: string | null } | { refusal: string } {
  const asked = String(body.outcome ?? '').trim().toLowerCase();
  const outcomes = register.signedOutcomes;
  if (!outcomes || outcomes.length === 0) return soleOutcome(register, asked, body.outcome);

  const chosen = asked
    ? outcomes.find((o) => o.outcome.toLowerCase() === asked)
    : outcomes[0];
  if (!chosen) {
    return {
      refusal:
        `"${String(body.outcome)}" is not an outcome ${register.verb} can sign for. It records ` +
        `${outcomes.map((o) => `"${o.outcome}"`).join(' or ')}.`,
    };
  }

  const phase = String(body.phase ?? '').trim();
  if (chosen.requiresPhase && !phase) {
    return {
      refusal:
        `Signing "${chosen.outcome}" attests ${chosen.attests}, so it is recorded against a phase: a procedure is ` +
        'suitable FOR something. State the phase this attestation covers.',
    };
  }

  const down = stepDownRefusal(register, outcomes, chosen, storedStatus);
  if (down) return { refusal: down };

  return { value: chosen.value, attests: chosen.attests, phase: chosen.requiresPhase ? phase : (phase || null) };
}

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
    /* P-110 item 1. `validated` is first, so a caller that names no outcome
       gets today's behaviour unchanged. */
    signedOutcomes: [
      { outcome: 'validated', value: 'validated', attests: 'full validation to ICH Q2(R2)', rank: 2 },
      {
        outcome: 'phase-appropriate',
        value: 'phase-appropriate',
        attests: 'suitability for the stated development phase, short of full validation',
        requiresPhase: true,
        rank: 1,
      },
    ],
    /* Every word the specification approval gate honours. Imported rather than
       restated: a second copy is how two surfaces of one product come to
       disagree about whether a method is validated. */
    governedValues: [...METHOD_VALIDATED, ...METHOD_SUITABLE],
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
  return signedStateOf(register, storedStatus) !== null;
}

/**
 * The signed word the record holds, or null when it holds none.
 *
 * Every word the register's ACT writes counts, not only `signedValue`
 * (P-110 item 1, 2026-11-09). The analytical-method act records two outcomes,
 * and a record signed as `phase-appropriate` is as signed as one recorded
 * `validated`: a signature over a procedure's suitability sits on the same
 * content and is stranded by the same edit. Comparing only against
 * `signedValue` would have introduced a second signed state and left it
 * unprotected — which is the hole this decision exists to close, one level
 * down.
 */
export function signedStateOf(register: SignedRegister, storedStatus: unknown): string | null {
  const stored = String(storedStatus ?? '').trim().toLowerCase();
  if (!stored) return null;
  if (stored === register.signedValue.toLowerCase()) return register.signedValue;
  for (const o of register.signedOutcomes ?? []) {
    if (stored === o.value.toLowerCase()) return o.value;
  }
  return null;
}

/**
 * Every state this register counts as signed, for a refusal to name. One word
 * for eight of the nine registers; analytical methods have two, because P-110
 * made suitability a signed outcome of its own ("validated or
 * phase-appropriate").
 */
export function signedStateNames(register: SignedRegister): string {
  const names = [register.signedValue, ...(register.signedOutcomes ?? []).map((o) => o.value)]
    .filter((v, i, all) => all.indexOf(v) === i);
  if (names.length === 1) return names[0];
  return names.slice(0, -1).join(', ') + ' or ' + names[names.length - 1];
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
  const signed = signedStateOf(register, storedStatus);
  if (!signed) return null;
  if (isRetirement(register, patch)) return null;
  return (
    `This ${register.noun} is ${signed} under a recorded signature, so its content cannot be ` +
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
  const { table, statusColumn, noun } = a.register;
  return inRefusableTransaction(async (client: PoolClient) => {
    const { rows } = await client.query(
      `SELECT id, project_id, ${statusColumn} AS status FROM ${table}
        WHERE id = $1 AND organization_id = $2 FOR UPDATE`,
      [a.id, a.organizationId],
    );
    const row = rows[0];
    if (!row) return refuse(404, 'NOT_FOUND', `That ${noun} was not found.`);
    /* Through `signedStateOf`, which lowercases both sides and reads EVERY
       signed outcome, not just `signedValue`. Lowercasing: a register keeps its
       own casing (the stability vocabulary is upper-case), and a raw comparison
       would refuse to retire a closed-out stability study with "that study is
       not COMPLETED" while it plainly is. Every outcome: P-110 made suitability
       a signed outcome of its own, so a method signed `phase-appropriate` is as
       signed as a `validated` one — comparing to `signedValue` alone refused to
       retire it, leaving it with no way out of its signature at all. */
    const signed = signedStateOf(a.register, row.status);
    if (!signed) {
      return refuse(409, 'NOT_SIGNED',
        `That ${noun} is not ${signedStateNames(a.register)}; retire it with an ordinary edit.`);
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
      details: { projectId: row.project_id ?? null, from: signed, to: 'retired', reason: reason.reason },
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
