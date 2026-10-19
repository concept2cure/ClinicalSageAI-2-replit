/**
 * What met a regulatory commitment (rows D2 and D5, 2026-10-19; decision P-40).
 *
 * ── The record ───────────────────────────────────────────────────────────────
 * A commitment's fulfilment names the dispatched eCTD sequence the agency
 * received (dispatch status sent or acknowledged), the Vault version that met
 * it (pinned at its sha256), or both, with who recorded it and when
 * (regulatory_commitments.fulfilment_*, migrations/20261019_commitment_
 * fulfilment_evidence.sql). For a PMR, PMC or REMS the fulfilment is a Part 11
 * signed act and names at least one (ha-logic.ts fulfilmentRule); for a meeting
 * commitment or other it is a governed write and may name one.
 *
 * ── What may be named, in this order ─────────────────────────────────────────
 * A sequence: one of this organisation's, not removed; on a project's door, one
 * of that project's program; on the organisation's door, one in a program this
 * person can open (or in no program). Access is checked before anything about
 * the sequence is said, so a sequence in a program the person cannot open
 * reads exactly as one that does not exist. Then: under the commitment's own
 * submission when it has one, and received by the agency.
 * A Vault version: through lockLiveVaultVersion (the same rule a document
 * relationship names a version by), its hash 64 hex characters, and its data
 * not withdrawn (document_data_dispositions remove_data or supersede).
 *
 * resolveFulfilmentEvidenceTx runs twice per fulfilment: read-only before the
 * signer's password is checked (so a refusal spends none of their attempts),
 * and under lock inside the signing transaction, where the decision is made.
 *
 * ── Reading it back ──────────────────────────────────────────────────────────
 * commitmentsForViewer is the one projection both doors list through. It emits
 * an explicit allow-list per row: no raw fulfilment column reaches a reader.
 * Evidence in a program the reader cannot open is `{ readable: false }`, with
 * no id, number, title or hash. Whether the signature still matches is
 * computed from readCommitmentFulfilmentContent, the reader the binder used.
 *
 * RULE 2: every verdict here is computed from the record; no model is called.
 *
 * @module server/services/ha-interactions/commitment-fulfilment
 */
import { resolveOpenProgram } from '../c2c/program-access';
import {
  getCurrentAccessibleProgramScope,
  ProgramReadAccessError,
  requireCurrentProgramAccess,
  requireProgramScopeStillCurrent,
  type CurrentAccessibleProgramScope,
  type ProgramAccessExecutor,
} from '../c2c/current-program-access';
import { isVerificationUnavailable } from '../../lib/verification-outcome';
import { lockLiveVaultVersion } from '../vault/vault-version-lock';
import { supersededSql } from '../vault/vault-version-family.js';
import { vaultDataEligibleSql } from '../document-data-disposition/eligibility.js';
import { FILED_DISPATCH_STATUSES, isFiledDispatchStatus } from '../submission-service/filed-dispatch';
import { BINDING_BASIS, isSignatureWithdrawn } from '../part11/signature-persistence';
import { readCommitmentFulfilmentContent } from './fulfilment-record';
import {
  commitmentFulfilmentDigest,
  deriveCommitmentStatus,
  fulfilmentRecordState,
  fulfilmentRule,
  summarizeCommitmentPortfolio,
  type CommitmentFulfilmentContent,
  type FulfilmentRecordState,
  type FulfilmentRule,
  type PortfolioSummary,
} from './ha-logic';
import { HaError, type CommitmentForFulfilment, type CommitmentScope } from './ha-service';

type Queryable = ProgramAccessExecutor;

/** Each fulfilment refusal and its status, on both doors and in the signing ceremony. */
export const FULFILMENT_CODE_STATUS: Readonly<Record<string, number>> = Object.freeze({
  NOT_FOUND: 404, BAD_INPUT: 400, INVALID_STATE: 409,
  EVIDENCE_REQUIRED: 400, FULFILMENT_DATE_REQUIRED: 400, SIGNATURE_NOT_TAKEN: 400,
  SEQUENCE_NOT_FOUND: 404, SEQUENCE_NOT_FILED: 409, SEQUENCE_OTHER_SUBMISSION: 409,
  VAULT_VERSION_NOT_FOUND: 404, VAULT_VERSION_UNHASHED: 409, VAULT_VERSION_WITHDRAWN: 409,
  VAULT_TENANT_RECONCILIATION_REQUIRED: 409, PROJECT_NOT_LINKED: 409, EVIDENCE_ACCESS_UNAVAILABLE: 503,
});

const SEQUENCE_NOT_HERE = 'That sequence is not one this commitment can name. Nothing was recorded.';
const VERSION_NOT_HERE = 'That Vault version is not one this commitment can name. Nothing was recorded.';
const ACCESS_UNAVAILABLE = 'Your access to what met this commitment could not be verified. Nothing was recorded.';
const NOT_LINKED = 'This project is not linked to a program, so no sequence or Vault document of it can be named. Nothing was recorded.';
const SEQUENCE_ROW_LIMIT = 200;

export interface ResolvedSequence {
  id: number; sequenceNumber: string; submissionId: number; submissionTitle: string | null; dispatchStatus: string;
}
export interface ResolvedVaultVersion {
  id: string;
  title: string | null;
  version: string | null;
  programId: string;
  sha256: string;
}
export interface ResolvedEvidence {
  sequence: ResolvedSequence | null;
  vaultVersion: ResolvedVaultVersion | null;
}

/** "Could not be verified" stays a 503; it is never a not-found or a 500. */
function unavailable(err: unknown): HaError | null {
  if (isVerificationUnavailable(err)) return new HaError('EVIDENCE_ACCESS_UNAVAILABLE', ACCESS_UNAVAILABLE);
  if (err instanceof ProgramReadAccessError && err.status === 503) return new HaError('EVIDENCE_ACCESS_UNAVAILABLE', ACCESS_UNAVAILABLE);
  return null;
}

/** On a project's door, the project's program (null when it has none); on the organisation's, no single program. */
async function projectProgramOf(client: Queryable, orgId: number, scope: CommitmentScope): Promise<string | null> {
  if (scope.projectId == null) return null;
  try {
    return await resolveOpenProgram(client, { organizationId: orgId, projectId: scope.projectId });
  } catch (err) {
    throw unavailable(err) ?? err;
  }
}

async function resolveSequence(
  client: Queryable,
  p: { orgId: number; userId: number; projectDoor: boolean; projectProgramId: string | null; commitment: CommitmentForFulfilment; sequenceId: number; lock: boolean },
): Promise<ResolvedSequence> {
  // The org predicate on both tables, as actions.ts reads a sequence.
  const { rows } = p.lock
    ? await client.query(
        `SELECT s.id, s.sequence_number, s.dispatch_status, sub.id AS submission_id, sub.title AS submission_title,
                sub.program_id::text AS program_id
           FROM ectd_sequences s
           JOIN submissions sub ON sub.id = s.submission_id AND sub.organization_id = s.organization_id AND sub.deleted_at IS NULL
          WHERE s.id = $1 AND s.organization_id = $2 AND s.deleted_at IS NULL
          FOR SHARE OF s`,
        [p.sequenceId, p.orgId],
      )
    : await client.query(
        `SELECT s.id, s.sequence_number, s.dispatch_status, sub.id AS submission_id, sub.title AS submission_title,
                sub.program_id::text AS program_id
           FROM ectd_sequences s
           JOIN submissions sub ON sub.id = s.submission_id AND sub.organization_id = s.organization_id AND sub.deleted_at IS NULL
          WHERE s.id = $1 AND s.organization_id = $2 AND s.deleted_at IS NULL`,
        [p.sequenceId, p.orgId],
      );
  const r = rows[0];
  if (!r) throw new HaError('SEQUENCE_NOT_FOUND', SEQUENCE_NOT_HERE);
  const programId = r.program_id == null ? null : String(r.program_id);
  // Access first: nothing about a sequence is said to someone who may not open it.
  if (p.projectDoor) {
    if (programId !== p.projectProgramId) throw new HaError('SEQUENCE_NOT_FOUND', SEQUENCE_NOT_HERE);
  } else if (programId !== null) {
    try {
      await requireCurrentProgramAccess(client, { organizationId: p.orgId, userId: p.userId, programId, forShare: p.lock });
    } catch (err) {
      throw unavailable(err) ?? new HaError('SEQUENCE_NOT_FOUND', SEQUENCE_NOT_HERE);
    }
  }
  const number = String(r.sequence_number);
  if (p.commitment.submissionId != null && Number(r.submission_id) !== p.commitment.submissionId) {
    throw new HaError(
      'SEQUENCE_OTHER_SUBMISSION',
      `Sequence ${number} belongs to ${r.submission_title ?? 'another submission'}, not to the submission this commitment was made under. Nothing was recorded.`,
    );
  }
  if (!isFiledDispatchStatus(r.dispatch_status)) {
    const state = r.dispatch_status == null ? 'it was never dispatched' : `dispatch status ${String(r.dispatch_status)}`;
    throw new HaError(
      'SEQUENCE_NOT_FILED',
      `Sequence ${number} has not reached the agency (${state}). Only a sequence sent to or acknowledged by the agency can have met a commitment; one transmitted outside the platform is named by its Vault document. Nothing was recorded.`,
    );
  }
  return {
    id: Number(r.id),
    sequenceNumber: number,
    submissionId: Number(r.submission_id),
    submissionTitle: r.submission_title == null ? null : String(r.submission_title),
    dispatchStatus: String(r.dispatch_status),
  };
}

async function resolveVaultVersion(
  client: Queryable,
  p: { orgId: number; userId: number; projectProgramId: string | null; vaultDocumentId: string; lock: boolean },
): Promise<ResolvedVaultVersion> {
  let v;
  try {
    v = await lockLiveVaultVersion(client, {
      documentId: p.vaultDocumentId, organizationId: p.orgId, userId: p.userId, programId: p.projectProgramId ?? undefined, lock: p.lock,
    });
  } catch (err) {
    if (err instanceof ProgramReadAccessError && err.code === 'VAULT_TENANT_RECONCILIATION_REQUIRED') {
      throw new HaError('VAULT_TENANT_RECONCILIATION_REQUIRED', `${err.message} Nothing was recorded.`);
    }
    throw unavailable(err) ?? new HaError('VAULT_VERSION_NOT_FOUND', VERSION_NOT_HERE);
  }
  if (!v) throw new HaError('VAULT_VERSION_NOT_FOUND', VERSION_NOT_HERE);
  const named = `${v.title ?? v.document_code ?? 'That document'} v${v.version ?? '?'}`;
  if (!/^[0-9a-f]{64}$/.test(v.content_hash)) {
    throw new HaError('VAULT_VERSION_UNHASHED', `${named} has no recorded sha256, so what it held cannot be pinned. Nothing was recorded.`);
  }
  const eligible = await client.query(
    `SELECT ${vaultDataEligibleSql('d')} AS data_eligible FROM vault.documents d WHERE d.id = $1 AND d.organization_id = $2`,
    [v.id, p.orgId],
  );
  if (eligible.rows[0]?.data_eligible !== true) {
    throw new HaError('VAULT_VERSION_WITHDRAWN', `The data of ${named} was withdrawn from use, so it cannot be named as what met a commitment. Nothing was recorded.`);
  }
  return { id: v.id, title: v.title, version: v.version, programId: v.program_id, sha256: v.content_hash };
}

/**
 * What met this commitment, checked as described in the header. Throws a coded
 * HaError (FULFILMENT_CODE_STATUS) for every refusal. `lock` holds the sequence,
 * the Vault version and the program admission to COMMIT.
 */
export async function resolveFulfilmentEvidenceTx(
  client: Queryable,
  p: {
    orgId: number;
    userId: number;
    scope: CommitmentScope;
    commitment: CommitmentForFulfilment;
    evidence: { sequenceId: number | null; vaultDocumentId: string | null };
    lock: boolean;
  },
): Promise<ResolvedEvidence> {
  const named = p.evidence.sequenceId != null || p.evidence.vaultDocumentId != null;
  if (!named) return { sequence: null, vaultVersion: null };
  const projectDoor = p.scope.projectId != null;
  const projectProgramId = await projectProgramOf(client, p.orgId, p.scope);
  if (projectDoor && projectProgramId === null) throw new HaError('PROJECT_NOT_LINKED', NOT_LINKED);
  const sequence = p.evidence.sequenceId == null ? null : await resolveSequence(client, {
    orgId: p.orgId, userId: p.userId, projectDoor, projectProgramId, commitment: p.commitment, sequenceId: p.evidence.sequenceId, lock: p.lock,
  });
  const vaultVersion = p.evidence.vaultDocumentId == null ? null : await resolveVaultVersion(client, {
    orgId: p.orgId, userId: p.userId, projectProgramId, vaultDocumentId: p.evidence.vaultDocumentId, lock: p.lock,
  });
  return { sequence, vaultVersion };
}

export interface SequenceOption {
  id: number; sequenceNumber: string; region: string; type: string; dispatchStatus: string;
  submission: { id: number; title: string | null; applicationType: string | null };
}

/**
 * The submission an organisation commitment was made under, when it names one:
 * the list is then that submission's sequences only, and the screen says so.
 * Named only when the person can open its program; otherwise `{ readable:
 * false }`, as the list projects evidence.
 */
export type CommitmentSubmissionView = { readable: true; id: number; title: string | null } | { readable: false };

export interface SequenceOptions {
  /** False on a project's door when the project has no program. */
  projectLinked: boolean;
  /** The one program a Vault version must come from, or null when any program the person can open may. */
  programId: string | null;
  /** The commitment's own submission (organisation's door), or null when it names none. */
  submission: CommitmentSubmissionView | null;
  /** Newest first (the most recently recorded sequence), at most 200. */
  sequences: SequenceOption[];
  truncated: boolean;
}

function toOption(r: any): SequenceOption {
  return {
    id: Number(r.id), sequenceNumber: String(r.sequence_number), region: String(r.region), type: String(r.type),
    dispatchStatus: String(r.dispatch_status),
    submission: { id: Number(r.submission_id), title: r.submission_title ?? null, applicationType: r.application_type ?? null },
  };
}

/**
 * The sequences this commitment can name: received by the agency, live, in the
 * project's program (project door), under the commitment's submission when it
 * has one, and in a program the person can open (organisation's door). The
 * filed list is bound, not retyped (FILED_DISPATCH_STATUSES). Three literal
 * statements, each newest first (ectd_sequences.id, the order sequences are
 * recorded in): at most 200 rows, so a cut list keeps the most recent and
 * `truncated` says there were more.
 */
export async function listFulfilmentSequenceOptions(
  client: Queryable,
  p: { orgId: number; userId: number; scope: CommitmentScope; commitment: CommitmentForFulfilment },
): Promise<SequenceOptions> {
  const filed = [...FILED_DISPATCH_STATUSES];
  let rows: any[];
  let programId: string | null = null;
  let submission: CommitmentSubmissionView | null = null;
  if (p.scope.projectId != null) {
    programId = await projectProgramOf(client, p.orgId, p.scope);
    if (programId === null) return { projectLinked: false, programId: null, submission: null, sequences: [], truncated: false };
    rows = (await client.query(
      `SELECT s.id, s.sequence_number, s.region, s.type, s.dispatch_status,
              sub.id AS submission_id, sub.title AS submission_title, sub.application_type
         FROM ectd_sequences s
         JOIN submissions sub ON sub.id = s.submission_id AND sub.organization_id = s.organization_id AND sub.deleted_at IS NULL
        WHERE s.organization_id = $1 AND s.deleted_at IS NULL AND s.dispatch_status = ANY($2::text[])
          AND sub.program_id = $3::uuid
        ORDER BY s.id DESC
        LIMIT 201`,
      [p.orgId, filed, programId],
    )).rows;
  } else {
    const identity = { organizationId: p.orgId, userId: p.userId };
    const access = await accessibleScope(client, identity);
    if (p.commitment.submissionId != null) {
      const own = (await client.query(
        `SELECT sub.id, sub.title, sub.program_id::text AS program_id FROM submissions sub WHERE sub.id = $1 AND sub.organization_id = $2`,
        [p.commitment.submissionId, p.orgId],
      )).rows[0];
      const openable = !!own && (own.program_id == null || access.programIds.includes(String(own.program_id)));
      submission = openable ? { readable: true, id: Number(own.id), title: text(own.title) } : { readable: false };
    }
    rows = p.commitment.submissionId != null
      ? (await client.query(
          `SELECT s.id, s.sequence_number, s.region, s.type, s.dispatch_status,
                  sub.id AS submission_id, sub.title AS submission_title, sub.application_type
             FROM ectd_sequences s
             JOIN submissions sub ON sub.id = s.submission_id AND sub.organization_id = s.organization_id AND sub.deleted_at IS NULL
            WHERE s.organization_id = $1 AND s.deleted_at IS NULL AND s.dispatch_status = ANY($2::text[])
              AND sub.id = $3 AND (sub.program_id IS NULL OR sub.program_id = ANY($4::uuid[]))
            ORDER BY s.id DESC
            LIMIT 201`,
          [p.orgId, filed, p.commitment.submissionId, access.programIds],
        )).rows
      : (await client.query(
          `SELECT s.id, s.sequence_number, s.region, s.type, s.dispatch_status,
                  sub.id AS submission_id, sub.title AS submission_title, sub.application_type
             FROM ectd_sequences s
             JOIN submissions sub ON sub.id = s.submission_id AND sub.organization_id = s.organization_id AND sub.deleted_at IS NULL
            WHERE s.organization_id = $1 AND s.deleted_at IS NULL AND s.dispatch_status = ANY($2::text[])
              AND (sub.program_id IS NULL OR sub.program_id = ANY($3::uuid[]))
            ORDER BY s.id DESC
            LIMIT 201`,
          [p.orgId, filed, access.programIds],
        )).rows;
    await stillCurrent(client, identity, access);
  }
  return {
    projectLinked: true,
    programId,
    submission,
    sequences: rows.slice(0, SEQUENCE_ROW_LIMIT).map(toOption),
    truncated: rows.length > SEQUENCE_ROW_LIMIT,
  };
}

/** The programs this person can open now; "could not be verified" is a 503, never an empty list. */
async function accessibleScope(client: Queryable, identity: { organizationId: number; userId: number | undefined }): Promise<CurrentAccessibleProgramScope> {
  try {
    return await getCurrentAccessibleProgramScope(client, identity);
  } catch (err) {
    throw unavailable(err) ?? err;
  }
}
async function stillCurrent(client: Queryable, identity: { organizationId: number; userId: number | undefined }, scope: CurrentAccessibleProgramScope): Promise<void> {
  try {
    await requireProgramScopeStillCurrent(client, identity, scope);
  } catch (err) {
    throw unavailable(err) ?? err;
  }
}

// ─── The list, as each reader may see it ─────────────────────────────────────

export type SequenceView =
  | { readable: false }
  | {
      readable: true;
      id: number;
      sequenceNumber: string;
      region: string | null;
      dispatchStatus: string | null;
      /** The agency has it now (sent or acknowledged). */
      filed: boolean;
      removed: boolean;
      submissionId: number | null;
      submissionTitle: string | null;
      applicationType: string | null;
      programId: string | null;
    };
export type VaultVersionView =
  | { readable: false }
  | {
      readable: true;
      id: string;
      title: string | null;
      version: string | null;
      programId: string;
      /** The sha256 the fulfilment pinned. */
      sha256: string | null;
      superseded: boolean;
      removed: boolean;
      dataWithdrawn: boolean;
    };
export interface FulfilmentView {
  rule: FulfilmentRule;
  state: FulfilmentRecordState;
  recordedBy: { id: number; name: string | null } | null;
  recordedAt: string | null;
  sequence: SequenceView | null;
  vaultVersion: VaultVersionView | null;
  signature: { signatureId: number; signerName: string; signedAt: string; meaning: string | null; bindsRecord: boolean } | null;
}
export interface CommitmentListRow {
  id: number;
  submission_id: number | null;
  source_interaction_id: number | null;
  commitment_type: string;
  description: string;
  status: string;
  regulatory_basis: string | null;
  due_date: string | null;
  fulfilled_date: string | null;
  project_id: number | null;
  source_communication_event_id: string | null;
  source_question_id: number | null;
  source_communication_type: string | null;
  source_visibility_tier: string | null;
  source_question_ref: string | null;
  effectiveStatus: string;
  fulfilment: FulfilmentView;
}

const int = (v: unknown): number | null => (v == null ? null : Number(v));
const text = (v: unknown): string | null => (v == null ? null : String(v));
const iso = (v: unknown): string | null => {
  if (v == null) return null;
  const t = v instanceof Date ? v : new Date(String(v));
  return Number.isNaN(t.getTime()) ? String(v) : t.toISOString();
};

interface EvidenceRead {
  readablePrograms: ReadonlySet<string>;
  sequences: Map<number, any>;
  versions: Map<string, any>;
}

/**
 * The sequences and Vault versions these rows name, and the programs this
 * reader can open, in one batched read per kind. The scope is re-checked
 * after the reads: a permission change during the read refuses the answer.
 */
async function readEvidence(client: Queryable, orgId: number, userId: number | null, rows: any[]): Promise<EvidenceRead> {
  const seqIds = [...new Set(rows.map((r) => int(r.fulfilment_sequence_id)).filter((v): v is number => v != null))];
  const vaultIds = [...new Set(rows.map((r) => text(r.fulfilment_vault_document_id)).filter((v): v is string => v != null))];
  const out: EvidenceRead = { readablePrograms: new Set(), sequences: new Map(), versions: new Map() };
  if (seqIds.length === 0 && vaultIds.length === 0) return out;
  const identity = { organizationId: orgId, userId: userId ?? undefined };
  const scope = await accessibleScope(client, identity);
  out.readablePrograms = new Set(scope.programIds);
  if (seqIds.length > 0) {
    const r = await client.query(
      `SELECT s.id, s.sequence_number, s.region, s.dispatch_status, s.deleted_at IS NOT NULL AS removed,
              sub.id AS submission_id, sub.title AS submission_title, sub.application_type, sub.program_id::text AS program_id
         FROM ectd_sequences s
         LEFT JOIN submissions sub ON sub.id = s.submission_id AND sub.organization_id = s.organization_id
        WHERE s.organization_id = $1 AND s.id = ANY($2::int[])`,
      [orgId, seqIds],
    );
    for (const row of r.rows) out.sequences.set(Number(row.id), row);
  }
  if (vaultIds.length > 0) {
    const r = await client.query(
      `SELECT d.id::text AS id, COALESCE(d.document_title, d.title, d.file_name, d.filename) AS title, d.version,
              d.program_id::text AS program_id, d.deleted_at IS NOT NULL AS removed,
              ${supersededSql('d')} AS superseded, ${vaultDataEligibleSql('d')} AS data_eligible
         FROM vault.documents d
        WHERE d.organization_id = $1 AND d.id = ANY($2::uuid[])`,
      [orgId, vaultIds],
    );
    for (const row of r.rows) out.versions.set(String(row.id), row);
  }
  await stillCurrent(client, identity, scope);
  return out;
}

interface SignatureRead {
  live: Map<number, any>;
  withdrawn: Set<number>;
}

/**
 * The fulfilment signatures on the recorded fulfilments of signed types, split
 * by the canonical withdrawal rule (isSignatureWithdrawn): only the basis the
 * database accepts is read, so a ledger-basis signature never counts.
 */
async function readSignatures(client: Queryable, orgId: number, rows: any[]): Promise<SignatureRead> {
  const out: SignatureRead = { live: new Map(), withdrawn: new Set() };
  const ids = rows
    .filter((r) => r.fulfilment_recorded_at != null && fulfilmentRule(String(r.commitment_type)).signatureRequired)
    .map((r) => Number(r.id));
  if (ids.length === 0) return out;
  const r = await client.query(
    `SELECT id, signed_target, bound_payload_digest, signer_name, signed_at, signature_meaning,
            superseded_by, is_valid, verification_status
       FROM electronic_signatures
      WHERE organization_id = $1 AND signed_target = ANY($2::text[])
        AND signature_type = 'governed-action' AND binding_basis = $3
      ORDER BY id`,
    [orgId, ids.map((id) => `regulatory-commitment:${id}`), BINDING_BASIS.COMMITMENT_FULFILMENT_CONTENT],
  );
  for (const sig of r.rows) {
    const cid = Number(String(sig.signed_target).slice('regulatory-commitment:'.length));
    if (isSignatureWithdrawn(sig)) out.withdrawn.add(cid);
    else out.live.set(cid, sig);
  }
  return out;
}

/** A sequence as this reader may see it: { readable: false } names nothing of it. */
function sequenceView(evidence: EvidenceRead, id: number | null): SequenceView | null {
  if (id == null) return null;
  const s = evidence.sequences.get(id);
  const programId = s ? text(s.program_id) : null;
  if (!s || (programId !== null && !evidence.readablePrograms.has(programId))) return { readable: false };
  return {
    readable: true,
    id,
    sequenceNumber: String(s.sequence_number),
    region: text(s.region),
    dispatchStatus: text(s.dispatch_status),
    filed: isFiledDispatchStatus(s.dispatch_status),
    removed: s.removed === true,
    submissionId: int(s.submission_id),
    submissionTitle: text(s.submission_title),
    applicationType: text(s.application_type),
    programId,
  };
}

/** A Vault version as this reader may see it, with the sha256 the fulfilment pinned. */
function vaultView(evidence: EvidenceRead, id: string | null, pinned: string | null): VaultVersionView | null {
  if (id == null) return null;
  const v = evidence.versions.get(id);
  if (!v || !evidence.readablePrograms.has(String(v.program_id))) return { readable: false };
  return {
    readable: true,
    id,
    title: text(v.title),
    version: text(v.version),
    programId: String(v.program_id),
    sha256: pinned,
    superseded: v.superseded === true,
    removed: v.removed === true,
    dataWithdrawn: v.data_eligible !== true,
  };
}

/** One row's fulfilment, as this reader may see it, and the server's verdict on its signature. */
function fulfilmentView(r: any, evidence: EvidenceRead, signatures: SignatureRead, content: Map<number, { content: CommitmentFulfilmentContent }>): FulfilmentView {
  const id = Number(r.id);
  const rule = fulfilmentRule(String(r.commitment_type));
  const sig = signatures.live.get(id);
  const record = content.get(id);
  const signature = sig
    ? {
        signatureId: Number(sig.id),
        signerName: String(sig.signer_name),
        signedAt: iso(sig.signed_at) ?? '',
        meaning: text(sig.signature_meaning),
        bindsRecord: !!record && String(sig.bound_payload_digest ?? '') === commitmentFulfilmentDigest(record.content),
      }
    : null;
  return {
    rule,
    state: fulfilmentRecordState({
      status: String(r.status),
      signatureRequired: rule.signatureRequired,
      recorded: r.fulfilment_recorded_at != null,
      liveSignature: signature ? { bindsRecord: signature.bindsRecord } : null,
      withdrawnSignature: signatures.withdrawn.has(id),
    }),
    recordedBy: r.fulfilment_recorded_by == null ? null : { id: Number(r.fulfilment_recorded_by), name: text(r.fulfilment_recorded_by_name) },
    recordedAt: iso(r.fulfilment_recorded_at),
    sequence: sequenceView(evidence, int(r.fulfilment_sequence_id)),
    vaultVersion: vaultView(evidence, text(r.fulfilment_vault_document_id), text(r.fulfilment_vault_sha256)),
    signature,
  };
}

/**
 * The rows listCommitments read, projected for this reader: effective status,
 * the portfolio summary, and each fulfilment as FulfilmentView, through an
 * explicit allow-list (no raw fulfilment column is sent). One batched read
 * per kind (sequences, Vault versions, signatures, digest inputs), only for
 * the rows that need it. Fails rather than shortening the list: a program
 * scope that could not be verified, or that changed during the read, refuses
 * the whole answer (ProgramReadAccessError or EVIDENCE_ACCESS_UNAVAILABLE).
 */
export async function commitmentsForViewer(
  client: Queryable,
  p: { orgId: number; userId: number | null; rows: any[]; today: string },
): Promise<{ commitments: CommitmentListRow[]; summary: PortfolioSummary }> {
  const evidence = await readEvidence(client, p.orgId, p.userId, p.rows);
  const signatures = await readSignatures(client, p.orgId, p.rows);
  const content = await readCommitmentFulfilmentContent(client, p.orgId, [...signatures.live.keys()]);
  const commitments: CommitmentListRow[] = p.rows.map((r) => ({
    id: Number(r.id),
    submission_id: int(r.submission_id),
    source_interaction_id: int(r.source_interaction_id),
    commitment_type: String(r.commitment_type),
    description: String(r.description),
    status: String(r.status),
    regulatory_basis: text(r.regulatory_basis),
    due_date: text(r.due_date),
    fulfilled_date: text(r.fulfilled_date),
    project_id: int(r.project_id),
    source_communication_event_id: text(r.source_communication_event_id),
    source_question_id: int(r.source_question_id),
    source_communication_type: text(r.source_communication_type),
    source_visibility_tier: text(r.source_visibility_tier),
    source_question_ref: text(r.source_question_ref),
    effectiveStatus: deriveCommitmentStatus({ status: r.status, dueDate: r.due_date, fulfilledDate: r.fulfilled_date }, p.today),
    fulfilment: fulfilmentView(r, evidence, signatures, content),
  }));
  const summary = summarizeCommitmentPortfolio(p.rows.map((r) => ({ status: r.status, dueDate: r.due_date, fulfilledDate: r.fulfilled_date })), p.today);
  return { commitments, summary };
}
