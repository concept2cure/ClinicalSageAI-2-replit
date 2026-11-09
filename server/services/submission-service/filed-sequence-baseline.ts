/**
 * Declare the US sequences a submission's application filed outside the
 * platform, and which of them opened its Original Application (D7, W5,
 * 2026-10-29; docs/design/FILED_ELSEWHERE_BASELINE_2026-10-29.md).
 *
 * An IND that already holds sequences filed with another tool could not
 * continue here: the Submission Center's first sequence was 0000, an Original
 * Application, and an amendment with no Original Application held on the
 * platform is refused (sequence-spine-fda-identity.ts). MR-10 Stage 9 allows
 * a submission to continue "from a declared baseline the user signs as
 * cumulative". This is that declaration. The import of the sequences
 * themselves (their leaves, for replace, append and delete) is still Stage 9's.
 *
 * The act runs inside the platform's signing ceremony
 * (routes/governed-signed-act.ts signGovernedAct). The signature binds the
 * declaration and its evidence (filedBaselineDigest), and the database refuses
 * a row without that signature at COMMIT. Refused by name, with nothing
 * written:
 *   - another organization's submission, one that is not for the US, or one
 *     with no project (NOT_FOUND, NOT_US_SUBMISSION, UNANCHORED_SUBMISSION);
 *   - a signer who is not the project's lead or an organization manager, the
 *     market application number's gate (FORBIDDEN);
 *   - a malformed number, or an original after the last sequence (VALIDATION);
 *   - evidence that is not a retained Vault document of this organization
 *     (EVIDENCE_NOT_FOUND);
 *   - a US sequence of this submission that is frozen or dispatched: its
 *     number and submission-id were signed under the declaration in force,
 *     and the sequence signature does not bind it (BASELINE_FIXED);
 *   - a US sequence numbered at or below the last one, or typed 'original',
 *     that holds content (PLATFORM_SEQUENCE_WITHIN_BASELINE). An empty draft
 *     of that kind (a "Start sequence 0000" that was never used) is removed by
 *     the act, and the signed record names it;
 *   - a declaration the same as the current one (BASELINE_UNCHANGED).
 *
 * @module server/services/submission-service/filed-sequence-baseline
 */
import { canonicalRegionOf } from '../../../shared/regulatory/region-identity';
import { isFiledDispatchStatus } from './filed-dispatch';
import { canMutateProgram } from '../c2c/program-access';
import { resolveSignerOrgRole } from '../part11/resolve-signer-role';
import { readVaultSource } from '../regulatory/lifecycle-signature';
import {
  FILED_BASELINE_REGION,
  FILED_BASELINE_TARGET_PREFIX,
  readCurrentFiledBaseline,
  type BaselineQueryable,
  type FiledBaseline,
} from './filed-sequence-baseline-content';

export const FILED_BASELINE_CODE_STATUS = {
  NOT_FOUND: 404,
  NOT_US_SUBMISSION: 422,
  UNANCHORED_SUBMISSION: 422,
  FORBIDDEN: 403,
  VALIDATION: 422,
  EVIDENCE_NOT_FOUND: 422,
  BASELINE_FIXED: 409,
  PLATFORM_SEQUENCE_WITHIN_BASELINE: 409,
  BASELINE_UNCHANGED: 409,
} as const;
export type FiledBaselineRefusalCode = keyof typeof FILED_BASELINE_CODE_STATUS;

export class FiledBaselineRefusal extends Error {
  constructor(readonly code: FiledBaselineRefusalCode, message: string) {
    super(message);
    this.name = 'FiledBaselineRefusal';
  }
}

const SEQUENCE_RE = /^\d{4}$/;
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const SHA256_RE = /^[0-9a-f]{64}$/;

export interface FiledBaselineDeclaration {
  /** The new row's id, minted by the caller: the signature's target names it. */
  id: string;
  submissionId: number;
  lastFiledSequence: string;
  originalSequence: string;
  evidenceDocumentId: string;
  reason: string;
}

const SUBMISSION = 'SELECT program_id, primary_region FROM submissions WHERE id = $1 AND organization_id = $2 AND deleted_at IS NULL';
const SUBMISSION_LOCKED = 'SELECT program_id, primary_region FROM submissions WHERE id = $1 AND organization_id = $2 AND deleted_at IS NULL FOR UPDATE';

/**
 * The submission, its market and the signer's standing on its project. Asked
 * before the password (precheck) and again under the submission's row lock.
 */
export async function assertMayDeclare(
  q: BaselineQueryable, orgId: number, userId: number, submissionId: number, lock = false,
): Promise<void> {
  const row = (await q.query(lock ? SUBMISSION_LOCKED : SUBMISSION, [submissionId, orgId])).rows[0] as { program_id?: string | null; primary_region?: string } | undefined;
  if (!row) throw new FiledBaselineRefusal('NOT_FOUND', 'Submission not found for this organization. Nothing was signed.');
  if (canonicalRegionOf(row.primary_region) !== FILED_BASELINE_REGION) {
    throw new FiledBaselineRefusal('NOT_US_SUBMISSION',
      'Sequences filed outside the platform can be declared only for a US (FDA) submission. Nothing was signed.');
  }
  if (!row.program_id) {
    throw new FiledBaselineRefusal('UNANCHORED_SUBMISSION',
      'This submission is not anchored to a project. Anchor it first. Nothing was signed.');
  }
  const program = (await q.query(
    `SELECT lead_user_id FROM regulatory_programs WHERE id = $1 AND organization_id = $2 AND deleted_at IS NULL`,
    [row.program_id, orgId],
  )).rows[0] as { lead_user_id?: unknown } | undefined;
  if (!program) throw new FiledBaselineRefusal('NOT_FOUND', 'Project not found for this organization. Nothing was signed.');
  const orgRole = await resolveSignerOrgRole(userId, orgId, q);
  const leadUserId = program.lead_user_id == null ? null : Number(program.lead_user_id);
  if (!canMutateProgram({ actor: { userId, orgRole }, program: { leadUserId } })) {
    throw new FiledBaselineRefusal('FORBIDDEN',
      "Only the project's lead or an organization manager can declare the sequences filed outside the platform. Nothing was signed.");
  }
}

function assertNumbers(d: FiledBaselineDeclaration): void {
  if (!SEQUENCE_RE.test(d.lastFiledSequence) || !SEQUENCE_RE.test(d.originalSequence)) {
    throw new FiledBaselineRefusal('VALIDATION', 'Sequence numbers are four digits, for example 0000 or 0041. Nothing was signed.');
  }
  if (d.originalSequence > d.lastFiledSequence) {
    throw new FiledBaselineRefusal('VALIDATION',
      `The Original Application's sequence (${d.originalSequence}) is after the last sequence filed (${d.lastFiledSequence}). Nothing was signed.`);
  }
}

interface PlatformSequence { id: number; sequence_number: string; type: string; fixed: boolean; leaves: number }

/** The submission's US sequences, locked to COMMIT so a freeze waits for the declaration, or the declaration for it. */
async function lockUsSequences(q: BaselineQueryable, orgId: number, submissionId: number): Promise<PlatformSequence[]> {
  const { rows } = await q.query(
    `SELECT s.id, s.sequence_number, s.type, s.region,
            (s.status IN ('frozen', 'dispatched') OR s.frozen_at IS NOT NULL OR s.dispatch_status IS NOT NULL) AS fixed,
            (SELECT COUNT(*)::int FROM submission_leaves l WHERE l.sequence_id = s.id) AS leaves
       FROM ectd_sequences s
      WHERE s.organization_id = $1 AND s.submission_id = $2 AND s.deleted_at IS NULL
      ORDER BY s.sequence_number
      FOR UPDATE OF s`,
    [orgId, submissionId],
  );
  return rows
    .filter((r) => canonicalRegionOf(String(r.region)) === FILED_BASELINE_REGION)
    .map((r) => ({ id: Number(r.id), sequence_number: String(r.sequence_number), type: String(r.type ?? ''),
      fixed: r.fixed === true, leaves: Number(r.leaves ?? 0) }));
}

/** The empty drafts the declaration replaces; refuses one that is fixed or holds content. */
function draftsReplaced(sequences: PlatformSequence[], last: string): PlatformSequence[] {
  const fixed = sequences.find((s) => s.fixed);
  if (fixed) {
    throw new FiledBaselineRefusal('BASELINE_FIXED',
      `Sequence ${fixed.sequence_number} of this submission is frozen or dispatched under the sequences declared when it was, ` +
      'so they are not changed here. Nothing was signed.');
  }
  const covered = sequences.filter((s) => s.sequence_number <= last || s.type.toLowerCase() === 'original');
  const used = covered.find((s) => s.leaves > 0);
  if (used) {
    throw new FiledBaselineRefusal('PLATFORM_SEQUENCE_WITHIN_BASELINE',
      `Sequence ${used.sequence_number} on the platform holds content and is ` +
      (used.sequence_number <= last ? `numbered within the sequences filed elsewhere (0000–${last})` : "typed as the Original Application") +
      '. Move its content to a sequence after them, and remove it, first. Nothing was signed.');
  }
  return covered;
}

/**
 * The declaration, on the signing transaction. Returns what the ceremony signs:
 * the target, the attested facts (they reach the ledger payload and the
 * signature manifest's act, which the database checks against the row), and
 * the response body.
 */
export async function declareFiledBaseline(q: BaselineQueryable, orgId: number, userId: number, d: FiledBaselineDeclaration) {
  assertNumbers(d);
  await assertMayDeclare(q, orgId, userId, d.submissionId, true);
  const evidence = UUID_RE.test(d.evidenceDocumentId)
    ? await readVaultSource(q as never, orgId, d.evidenceDocumentId, { lock: true })
    : null;
  const evidenceSha256 = evidence?.contentHash.toLowerCase() ?? '';
  if (!evidence || !SHA256_RE.test(evidenceSha256)) {
    throw new FiledBaselineRefusal('EVIDENCE_NOT_FOUND',
      "The evidence is not a retained document in your organization's Vault. Upload the agency's acknowledgment of the last " +
      'sequence filed to the Vault, and name that document. Nothing was signed.');
  }
  const replaced = draftsReplaced(await lockUsSequences(q, orgId, d.submissionId), d.lastFiledSequence);
  const previous = await readCurrentFiledBaseline(q, orgId, d.submissionId);
  if (previous && previous.lastFiledSequence === d.lastFiledSequence && previous.originalSequence === d.originalSequence
      && previous.evidenceSha256 === evidenceSha256) {
    throw new FiledBaselineRefusal('BASELINE_UNCHANGED', 'That is the declaration already in force. Nothing was signed.');
  }
  await q.query(
    `INSERT INTO public.submission_filed_baselines
       (id, organization_id, submission_id, region, last_filed_sequence, original_sequence,
        evidence_vault_document_id, evidence_sha256, reason, declared_by)
     VALUES ($1::uuid, $2, $3, $4, $5, $6, $7::uuid, $8, $9, $10)`,
    [d.id, orgId, d.submissionId, FILED_BASELINE_REGION, d.lastFiledSequence, d.originalSequence,
      evidence.id, evidenceSha256, d.reason, userId],
  );
  if (replaced.length > 0) {
    const removal = liveSetRemoval(orgId, replaced.map((s) => s.id));
    await q.query(removal.text, removal.params);
  }
  const facts = {
    submissionId: String(d.submissionId),
    region: FILED_BASELINE_REGION,
    lastFiledSequence: d.lastFiledSequence,
    originalSequence: d.originalSequence,
    evidenceDocumentId: evidence.id,
    evidenceSha256,
    previous: previous ? { lastFiledSequence: previous.lastFiledSequence, originalSequence: previous.originalSequence } : null,
    removedDraftSequences: replaced.map((s) => s.sequence_number),
  };
  return {
    target: `${FILED_BASELINE_TARGET_PREFIX}:${d.id}`,
    payload: facts,
    body: { baseline: { id: d.id, ...facts, submissionId: d.submissionId } },
  };
}

/**
 * Why a new sequence may not be created under a declaration, or null.
 * createSequence asks it for both creators (the Submission Center and IND
 * Lifecycle). `type` is as the caller sent it: omitted means 'original'.
 */
export function sequenceCreationRefusal(
  baseline: FiledBaseline | null, region: string, seq: { sequenceNumber: string; type?: string | null },
): string | null {
  if (!baseline || canonicalRegionOf(region) !== FILED_BASELINE_REGION) return null;
  if (seq.sequenceNumber <= baseline.lastFiledSequence) {
    return `Sequences 0000–${baseline.lastFiledSequence} of this application were filed outside the platform, so ` +
      `sequence ${seq.sequenceNumber} is taken. The next is ${nextAfter(baseline.lastFiledSequence)}. Nothing was created.`;
  }
  if ((seq.type ?? 'original').toLowerCase() === 'original') {
    return `Sequence ${baseline.originalSequence}, filed outside the platform, opened this application's Original Application. ` +
      'A later sequence is an amendment, a response, an annual report or a withdrawal: name its type. Nothing was created.';
  }
  return null;
}

/** The number after `sequence`, four digits. */
export function nextAfter(sequence: string): string {
  return String(Number.parseInt(sequence, 10) + 1).padStart(4, '0');
}

// ── P-86: a sequence that was never filed may be retired, by signature ─────────
//
// The founder, 2026-11-01 (docs/LAUNCH_DEFINITION_OF_DONE.md, P-86): such a
// sequence "may be retired by a signed, audited act, which frees its number,
// only while no production send is bound to it and it is not filed. The act
// reuses the filed-elsewhere baseline's existing removal of drafts." The rules
// live here, beside that removal (the coordinating session's ruling of
// 2026-11-02: no new module); submission-service.ts runs the act
// (retireSequence) on the sequence's own signing chain. Design:
// docs/evidence/RIM/2026-11-08-designs/p86-retire-unfiled-sequence.design.md.

/** The intent a retirement's signature declares (Gate 1). */
export const SEQUENCE_RETIREMENT_INTENT = 'retire' as const;
/** The audit row that records a retirement and spends its signature. */
export const ECTD_SEQUENCE_RETIRED_ACTION = 'ECTD_SEQUENCE_RETIRED';

/**
 * The one way a sequence leaves the live set: the drafts a filed-elsewhere
 * declaration replaces, and a retired sequence (P-86). `at` is the instant a
 * retirement takes after its locks, so the row's deleted_at equals its sealed
 * audit time; the declaration passes none and keeps NOW().
 * migrations/20261109_ectd_sequence_removal_guard.sql admits only these two.
 */
export function liveSetRemoval(organizationId: number, ids: readonly number[], at: string | null = null) {
  return {
    text: `UPDATE ectd_sequences
              SET deleted_at = COALESCE($3::timestamptz, NOW()), updated_at = COALESCE($3::timestamptz, NOW())
            WHERE organization_id = $1 AND id = ANY($2::int[]) AND deleted_at IS NULL
        RETURNING id, deleted_at`,
    params: [organizationId, [...ids], at] as unknown[],
  };
}

/** What the signer states, word for word: the platform cannot see an export or a courier, so the signer answers for them. */
export function retirementStatement(sequenceNumber: string): string {
  return `Sequence ${sequenceNumber} has not been filed with the agency by any route: not by a send from this sequence, ` +
    'not as a package sent from this platform, not from an export, and not by courier or any other route.';
}

/** A retirement is signed with the meaning responsibility, and only it. */
export function retirementMeaningRefusal(meaning: unknown): string | null {
  return meaning === 'responsibility' ? null : 'retiring a sequence is signed with the meaning responsibility';
}

/**
 * Who may sign the retirement, as the precheck tells it before anyone signs (C2): the answer of
 * separation-of-duties.ts signerIndependenceOf, which the act's own check gives too. A creator who cannot be
 * resolved, or a check that failed, is said so; neither is taken as independence, nor called authorship.
 */
export function retirementSignerRefusal(sequenceNumber: string, state: 'independent' | 'author' | 'unresolved' | 'unverified'): string | null {
  if (state === 'independent') return null;
  if (state === 'author') {
    return `You created sequence ${sequenceNumber}, so you cannot sign its retirement. Another person with signing authority signs it.`;
  }
  if (state === 'unresolved') {
    return `Who created sequence ${sequenceNumber} cannot be resolved from its record, so no one can be shown to be independent of its creator, ` +
      'and its retirement cannot be signed.';
  }
  return `Whether you created sequence ${sequenceNumber} could not be checked, so its retirement cannot be signed now. Try again.`;
}

/** Gate 1's payload check: the signature carries the statement for this sequence, exactly. */
export function retirementPayloadRefusal(sequenceNumber: string) {
  const statement = retirementStatement(sequenceNumber);
  return (payload: Record<string, unknown> | null): string | null =>
    payload?.notFiledElsewhere === true && payload?.statement === statement
      ? null
      : `the signature does not carry the statement for sequence ${sequenceNumber}, word for word: "${statement}"`;
}

/** The facts about one sequence that keep its number, read on one queryable. */
export interface RetirementSequence {
  id: number;
  submissionId: number;
  sequenceNumber: string;
  region: string;
  dispatchStatus: string | null;
}
interface SendOnRecord { at: string | null; environmentNamed: boolean }
interface KeptFacts {
  sequenceNumber: string;
  dispatchStatus: string | null;
  /** Check 3 or 4: a send bound to it, or recorded as transmitted, outside staging, and not proven blocked. */
  productionSend: SendOnRecord | null;
  /** Check 3b: its number sent to production as a package for the same application. */
  packageSend: boolean;
  /** Check 6: IND records filed in it, by kind. */
  filedIndRecords: { safetyReports: number; amendments: number; annualReports: number };
}
export interface RetirementFacts extends KeptFacts {
  /** Check 5: the live sequences numbered after it, with what keeps each (null: none). */
  later: Array<{ sequenceNumber: string; kept: string | null }>;
  /** Check 5b: a filed sequence of the same number whose record is read from compiles. */
  compileReadTwin: boolean;
  stagingTransmittalIds: number[];
  /** The same sends, by the UTC day each was recorded, for the precheck to show (C2). */
  stagingSends: Array<{ sentOn: string }>;
  numberFreed: boolean;
}

const day = (v: unknown): string => (v ? new Date(String(v)).toISOString().slice(0, 10) : 'an unrecorded date');

/** Check 3, under P-108 2(a) (the coordinating session, 2026-11-09): a non-staging transmittal bound to the sequence
 *  blocks retirement unless a chained TRANSMIT_BLOCKED with transmitted false names that attempt's signature. A
 *  missing environment counts as production, and a blocked row naming no signature proves nothing. When P-92's
 *  "released as not received" is built, checks 3 and 4 exclude a released attempt too. */
async function boundProductionSend(q: BaselineQueryable, org: number, id: number): Promise<SendOnRecord | null> {
  const { rows } = await q.query(
    `SELECT t.created_at, t.metadata->>'environment' AS environment FROM submission_transmittals t
      WHERE t.organization_id = $1 AND t.metadata->'dispatchBinding'->>'sequenceId' = $2::text
        AND COALESCE(t.metadata->>'environment', '') <> 'staging'
        AND NOT EXISTS (SELECT 1 FROM audit_logs a
              WHERE a.tenant_id = $1 AND a.table_name = 'ectd_sequence' AND a.record_id = $2::text
                AND a.action = 'TRANSMIT_BLOCKED' AND a.new_values::jsonb->>'transmitted' = 'false'
                AND a.new_values::jsonb->>'signatureActionId' IS NOT NULL
                AND a.new_values::jsonb->>'signatureActionId' = t.metadata->'dispatchBinding'->>'signatureActionId')
      ORDER BY t.id LIMIT 1`,
    [org, id],
  );
  if (rows[0]) return { at: rows[0].created_at as string | null, environmentNamed: rows[0].environment != null };
  // Check 4: a send recorded as transmitted before sends carried a binding.
  const sent = await q.query(
    `SELECT occurred_at, new_values::jsonb->>'environment' AS environment FROM audit_logs
      WHERE tenant_id = $1 AND table_name = 'ectd_sequence' AND record_id = $2::text AND action = 'ECTD_TRANSMITTED'
        AND COALESCE(new_values::jsonb->>'environment', '') <> 'staging'
      ORDER BY occurred_at LIMIT 1`,
    [org, id],
  );
  return sent.rows[0] ? { at: sent.rows[0].occurred_at as string | null, environmentNamed: sent.rows[0].environment != null } : null;
}

/** Check 3b, failing closed (the coordinating session, 2026-11-09): a package-spine production attempt naming this
 *  number for this application keeps it, because nothing on that spine records that the agency did not receive it. */
async function packageSpineSend(q: BaselineQueryable, org: number, s: RetirementSequence): Promise<boolean> {
  const identity = await q.query(
    `SELECT s.program_id::text AS program_id, p.application_number FROM submissions s
       LEFT JOIN regulatory_programs p ON p.id = s.program_id AND p.organization_id = s.organization_id
      WHERE s.id = $1 AND s.organization_id = $2`,
    [s.submissionId, org],
  );
  const programId = (identity.rows[0]?.program_id as string | null) ?? null;
  const applicationNumber = (identity.rows[0]?.application_number as string | null) ?? null;
  const { rows } = await q.query(
    `SELECT t.region FROM submission_transmittals t
      WHERE t.organization_id = $1 AND t.package_id IS NOT NULL
        AND COALESCE(t.metadata->>'environment', '') <> 'staging' AND t.metadata->>'sequence' = $2
        AND (t.program_id::text = $3 OR ($4::text IS NOT NULL AND t.metadata->>'applicationId' = $4))`,
    [org, s.sequenceNumber, programId, applicationNumber],
  );
  return rows.some((r) => canonicalRegionOf(String(r.region)) === canonicalRegionOf(s.region));
}

async function keptFacts(q: BaselineQueryable, org: number, s: RetirementSequence): Promise<KeptFacts> {
  const productionSend = await boundProductionSend(q, org, s.id);
  const packageSend = await packageSpineSend(q, org, s);
  const ind = await q.query(
    `SELECT (SELECT count(*)::int FROM ind_safety_reports WHERE organization_id = $1 AND sequence_id = $2 AND status = 'filed') AS safety,
            (SELECT count(*)::int FROM ind_amendments WHERE organization_id = $1 AND sequence_id = $2 AND status = 'filed') AS amendments,
            (SELECT count(*)::int FROM ind_annual_reports WHERE organization_id = $1 AND sequence_id = $2 AND status = 'filed') AS annual`,
    [org, s.id],
  );
  const r = ind.rows[0] ?? {};
  return {
    sequenceNumber: s.sequenceNumber, dispatchStatus: s.dispatchStatus, productionSend, packageSend,
    filedIndRecords: { safetyReports: Number(r.safety ?? 0), amendments: Number(r.amendments ?? 0), annualReports: Number(r.annual ?? 0) },
  };
}

/**
 * Everything retirementRefusal judges, read on one queryable (the pool before
 * the lock, the transaction's client under it). `filedTwin` is the filed
 * fold's per-number basis (prior-sequence-loader.ts loadFiledStateBySubmission),
 * passed in so this file never imports the fold. A read that fails throws;
 * the act answers it as "could not be checked", never as a pass.
 */
export async function readRetirementFacts(
  q: BaselineQueryable, org: number, s: RetirementSequence,
  filedTwin: (n: string) => Promise<boolean>,
): Promise<RetirementFacts> {
  const own = await keptFacts(q, org, s);
  const siblings = (await q.query(
    `SELECT id, sequence_number, region, dispatch_status FROM ectd_sequences
      WHERE organization_id = $1 AND submission_id = $2 AND deleted_at IS NULL AND id <> $3`,
    [org, s.submissionId, s.id],
  )).rows
    .filter((r) => canonicalRegionOf(String(r.region)) === canonicalRegionOf(s.region))
    .map((r) => ({ id: Number(r.id), submissionId: s.submissionId, sequenceNumber: String(r.sequence_number),
      region: String(r.region), dispatchStatus: (r.dispatch_status as string | null) ?? null }));
  const later: RetirementFacts['later'] = [];
  for (const l of siblings.filter((x) => x.sequenceNumber > s.sequenceNumber).sort((a, b) => b.sequenceNumber.localeCompare(a.sequenceNumber))) {
    later.push({ sequenceNumber: l.sequenceNumber, kept: keptRefusal(await keptFacts(q, org, l))?.reason ?? null });
  }
  const staging = await q.query(
    `SELECT id, created_at FROM submission_transmittals
      WHERE organization_id = $1 AND metadata->'dispatchBinding'->>'sequenceId' = $2::text AND metadata->>'environment' = 'staging'
      ORDER BY id`,
    [org, s.id],
  );
  return {
    ...own, later,
    compileReadTwin: await filedTwin(s.sequenceNumber),
    stagingTransmittalIds: staging.rows.map((r) => Number(r.id)),
    stagingSends: staging.rows.map((r) => ({ sentOn: day(r.created_at) })),
    numberFreed: !siblings.some((x) => x.sequenceNumber === s.sequenceNumber),
  };
}

const IND_KINDS: Array<[keyof KeptFacts['filedIndRecords'], string, string]> = [
  ['safetyReports', 'a safety report', 'safety reports'],
  ['amendments', 'an amendment', 'amendments'],
  ['annualReports', 'an annual report', 'annual reports'],
];

/** What keeps a sequence's number (checks 2a, 2b, 3, 3b, 4, 6): the full sentence, and the short reason check 5 names. */
function keptRefusal(f: KeptFacts): { sentence: string; reason: string } | null {
  const n = f.sequenceNumber;
  if (isFiledDispatchStatus(f.dispatchStatus)) {
    return { reason: 'it is on file with the agency',
      sentence: `Sequence ${n} is on file with the agency (dispatch status '${f.dispatchStatus}'), so it cannot be retired. A correction is a new sequence numbered after it.` };
  }
  if (f.dispatchStatus === 'transmitting') {
    return { reason: 'a send of it is in flight',
      sentence: `A send of sequence ${n} is in flight and not yet settled, so it cannot be retired now. Record the agency's receipt, or wait for the send to settle, then look again.` };
  }
  if (f.productionSend) {
    const on = `${day(f.productionSend.at)} UTC`;
    return { reason: "it was sent to the agency's production environment",
      sentence: f.productionSend.environmentNamed
        ? `A send of sequence ${n} to the agency's production environment is recorded on ${on}, so it cannot be retired. A correction is a new sequence numbered after it.`
        : `A send of sequence ${n} to the agency is recorded on ${on} with no environment named, so it is treated as a production send and it cannot be retired. A correction is a new sequence numbered after it.` };
  }
  if (f.packageSend) {
    return { reason: "it was sent to the agency's production gateway in a package",
      sentence: `Sequence ${n} was sent to the agency's production gateway in a package, and nothing records that the agency did not receive it, so it is not retired.` };
  }
  const kinds = IND_KINDS.filter(([k]) => f.filedIndRecords[k] > 0)
    .map(([k, one, many]) => (f.filedIndRecords[k] === 1 ? one : `${f.filedIndRecords[k]} ${many}`));
  if (kinds.length === 0) return null;
  const total = IND_KINDS.reduce((sum, [k]) => sum + f.filedIndRecords[k], 0);
  return { reason: 'it holds filed IND records',
    sentence: `${total} IND record${total === 1 ? ' is' : 's are'} recorded as filed in sequence ${n} (${kinds.join(' and ')}). ` +
      'Retiring it would leave them filed in a sequence the agency never received, so it is not offered. Returning them to draft is not available yet.' };
}

/** Why this sequence is not retired, in one sentence, or null when it may be (checks 2a–6, in order). */
export function retirementRefusal(f: RetirementFacts): string | null {
  const own = keptRefusal(f);
  if (own) return own.sentence;
  const n = f.sequenceNumber;
  const kept = f.later.find((l) => l.kept !== null);
  if (kept) {
    return `Sequence ${kept.sequenceNumber}, numbered after ${n}, is kept (${kept.kept}), so ${n}'s number cannot be freed. ` +
      `Place the corrected content in a new sequence after ${kept.sequenceNumber}.`;
  }
  if (f.later.length > 0) {
    const m = f.later[0].sequenceNumber;
    return `Sequence ${m}, numbered after ${n} in this submission, is still in use. Retire ${m} first: a number is freed only from the highest down.`;
  }
  if (f.compileReadTwin) {
    return `Another sequence ${n} of this submission is on file with the agency, and what it filed is read from the compiles numbered ${n}. ` +
      `A compile names no sequence, so this sequence's compiles cannot be kept out of that record, and sequence ${n} cannot be retired.`;
  }
  return null;
}

/** A removed sequence's retirement record, or null when it was removed some other way (or is live). */
export async function retiredSequenceRecord(q: BaselineQueryable, org: number, id: number) {
  const { rows } = await q.query(
    `SELECT s.sequence_number, s.region, a.occurred_at, a.actor_id, a.reason, a.new_values::jsonb ->> 'meaning' AS meaning FROM ectd_sequences s
       JOIN audit_logs a ON a.tenant_id = s.organization_id AND a.table_name = 'ectd_sequence'
        AND a.record_id = s.id::text AND a.action = $3
      WHERE s.id = $1 AND s.organization_id = $2 AND s.deleted_at IS NOT NULL
      ORDER BY a.occurred_at LIMIT 1`,
    [id, org, ECTD_SEQUENCE_RETIRED_ACTION],
  );
  const r = rows[0];
  return r ? {
    sequenceNumber: String(r.sequence_number), region: String(r.region), retiredDay: day(r.occurred_at), actorId: Number(r.actor_id) || null,
    meaning: (r.meaning as string | null) ?? null, reason: (r.reason as string | null) ?? null,
  } : null;
}

/** A sequence of this organisation that is no longer in use, whatever removed it; null when it is live or not its. */
export async function removedSequenceOf(q: BaselineQueryable, org: number, id: number) {
  const { rows } = await q.query(
    `SELECT sequence_number, region FROM ectd_sequences WHERE id = $1 AND organization_id = $2 AND deleted_at IS NOT NULL`,
    [id, org],
  );
  return rows[0] ? { sequenceNumber: String(rows[0].sequence_number), region: String(rows[0].region) } : null;
}
