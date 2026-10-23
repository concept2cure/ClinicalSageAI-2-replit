/**
 * Agency responses — the SQL behind the project inbox's questions, responses,
 * signed approvals, response history, and the commitments made in them.
 *
 * Every function takes the caller's client: the writes run inside the route's
 * transaction (tenant context set, ledger pair written on the same client),
 * and the reads run on the request's tenant-pinned connection. Every
 * statement names the organization and the project as well, so a row is never
 * reached through an id alone. SQL text is literal throughout
 * (ci:sql-interpolation): no clause is spliced in at run time.
 *
 * What a state, a refusal or a package IS lives in response-logic.ts; this
 * file only reads and writes the record.
 *
 * @module server/services/agency-responses/response-service
 */

import { deriveCommitmentStatus } from '../ha-interactions/ha-logic';
import type { CommitmentStatus } from '../../../shared/schema/ha-interactions';
import {
  agencyResponseDigest,
  authorsSinceLastApproval,
  closeRefusal,
  questionApproval,
  signRefusal,
  type PackageCommitment,
  type QuestionApproval,
  type QuestionRecord,
  type ResponseRevision,
  type ResponseSignature,
} from './response-logic';

export interface Queryable {
  query: (sql: string, params?: unknown[]) => Promise<{ rows: any[]; rowCount?: number | null }>;
}

/** A refusal the route maps to a status; its message is written for the person. */
export class AgencyResponseError extends Error {
  constructor(
    public code:
      | 'LETTER_NOT_FOUND'
      | 'QUESTION_NOT_FOUND'
      | 'LETTER_CLOSED'
      | 'DUPLICATE_QUESTION'
      | 'RESPONSE_CHANGED'
      | 'NO_CHANGE'
      | 'NOTHING_TO_SIGN'
      | 'ALREADY_APPROVED'
      | 'SIGNER_WROTE_RESPONSE'
      | 'QUESTION_WITHDRAWN'
      | 'QUESTIONS_RECORDED'
      | 'NOT_RESPONSE_REQUIRED'
      | 'RESPONSES_NOT_APPROVED'
      | 'BAD_SECTION'
      | 'OWNER_NOT_MEMBER'
      | 'OWNER_CANNOT_SEE_LETTER',
    message: string,
  ) {
    super(message);
    this.name = 'AgencyResponseError';
  }
}

export const AGENCY_RESPONSE_CODE_STATUS: Readonly<Record<string, number>> = {
  LETTER_NOT_FOUND: 404,
  QUESTION_NOT_FOUND: 404,
  LETTER_CLOSED: 409,
  DUPLICATE_QUESTION: 409,
  RESPONSE_CHANGED: 409,
  NO_CHANGE: 409,
  NOTHING_TO_SIGN: 409,
  ALREADY_APPROVED: 409,
  SIGNER_WROTE_RESPONSE: 403,
  QUESTION_WITHDRAWN: 409,
  QUESTIONS_RECORDED: 409,
  NOT_RESPONSE_REQUIRED: 409,
  RESPONSES_NOT_APPROVED: 409,
  BAD_SECTION: 400,
  OWNER_NOT_MEMBER: 400,
  OWNER_CANNOT_SEE_LETTER: 400,
};

export interface LetterRow {
  eventId: string;
  communicationType: string;
  sourceType: string;
  receivedDate: string | null;
  dueDate: string | null;
  closureStatus: string;
  humanReviewStatus: string;
  responseRequired: boolean;
  visibilityTier: string | null;
}

export interface WriteScope {
  orgId: number;
  projectId: number;
  userId: number;
}

function iso(v: unknown): string | null {
  if (v == null) return null;
  const d = v instanceof Date ? v : new Date(String(v));
  return Number.isNaN(d.getTime()) ? null : d.toISOString();
}

function toLetter(row: any): LetterRow {
  return {
    eventId: String(row.event_id),
    communicationType: String(row.communication_type),
    sourceType: String(row.source_type),
    receivedDate: iso(row.received_date),
    dueDate: iso(row.due_date),
    closureStatus: String(row.closure_status ?? 'open'),
    humanReviewStatus: String(row.human_review_status ?? 'pending_review'),
    responseRequired: row.response_required === true,
    visibilityTier: row.audit_metadata?.visibilityTier ?? null,
  };
}

/**
 * The letter, in this organization and project; null when there is none.
 * Locked FOR UPDATE when asked: every write to a letter's questions and the
 * letter's close take this lock first, so a close and a save cannot interleave.
 */
export async function readLetter(client: Queryable, orgId: number, projectId: number, eventId: string, lock = false): Promise<LetterRow | null> {
  // Two literal statements rather than one with a spliced clause: no SQL text
  // is assembled at run time (ci:sql-interpolation).
  const r = await client.query(
    lock
      ? `SELECT event_id, communication_type, source_type, received_date, due_date, closure_status,
                human_review_status, response_required, audit_metadata
           FROM concept2cure_agency_communications
          WHERE organization_id = $1 AND project_id = $2 AND event_id = $3
          LIMIT 1 FOR UPDATE`
      : `SELECT event_id, communication_type, source_type, received_date, due_date, closure_status,
                human_review_status, response_required, audit_metadata
           FROM concept2cure_agency_communications
          WHERE organization_id = $1 AND project_id = $2 AND event_id = $3
          LIMIT 1`,
    [orgId, projectId, eventId],
  );
  return r.rows[0] ? toLetter(r.rows[0]) : null;
}

interface QuestionRow extends QuestionRecord {
  projectId: number;
  discipline: string | null;
  /** The CTD section the question concerns (2026-10-19); classification, not signed. */
  ctdSection: string | null;
  severity: string;
  ownerUserId: number | null;
  /** The owner's name as the users row holds it; null with no owner. */
  ownerName: string | null;
  responseUpdatedByName: string | null;
  responseUpdatedAt: string | null;
  createdAt: string | null;
  withdrawnAt: string | null;
  withdrawnByName: string | null;
  withdrawalReason: string | null;
}

function toQuestion(row: any): QuestionRow {
  return {
    id: Number(row.id),
    projectId: Number(row.project_id),
    communicationEventId: String(row.communication_event_id),
    questionRef: String(row.question_ref),
    questionText: String(row.question_text),
    discipline: row.discipline ?? null,
    ctdSection: row.ctd_section ?? null,
    severity: String(row.severity),
    ownerUserId: row.owner_user_id == null ? null : Number(row.owner_user_id),
    ownerName: row.owner_user_id == null ? null : (row.owner_name ?? null),
    responseText: String(row.response_text ?? ''),
    responseRevision: Number(row.response_revision),
    responseUpdatedBy: row.response_updated_by == null ? null : Number(row.response_updated_by),
    responseUpdatedByName: row.response_updated_by_name ?? null,
    responseUpdatedAt: iso(row.response_updated_at),
    createdAt: iso(row.created_at),
    withdrawn: row.withdrawn_at != null,
    withdrawnAt: iso(row.withdrawn_at),
    withdrawnByName: row.withdrawn_by_name ?? null,
    withdrawalReason: row.withdrawal_reason ?? null,
  };
}

/**
 * The questions on one letter, or (eventId null) on every letter of the
 * project. Two literal statements rather than one with a spliced clause, as
 * readLetter: no SQL text is assembled at run time (ci:sql-interpolation).
 */
async function questionRows(client: Queryable, orgId: number, projectId: number, eventId: string | null): Promise<QuestionRow[]> {
  const r = eventId === null
    ? await client.query(
        `SELECT q.id, q.project_id, q.communication_event_id, q.question_ref, q.question_text, q.discipline,
                q.ctd_section, q.severity, q.owner_user_id, q.response_text, q.response_revision, q.response_updated_by,
                q.response_updated_at, q.created_at, q.withdrawn_at, q.withdrawal_reason,
                u.name AS response_updated_by_name, w.name AS withdrawn_by_name, o.name AS owner_name
           FROM agency_communication_questions q
           LEFT JOIN users u ON u.id = q.response_updated_by
           LEFT JOIN users w ON w.id = q.withdrawn_by
           LEFT JOIN users o ON o.id = q.owner_user_id
          WHERE q.organization_id = $1 AND q.project_id = $2
          ORDER BY q.id`,
        [orgId, projectId],
      )
    : await client.query(
        `SELECT q.id, q.project_id, q.communication_event_id, q.question_ref, q.question_text, q.discipline,
                q.ctd_section, q.severity, q.owner_user_id, q.response_text, q.response_revision, q.response_updated_by,
                q.response_updated_at, q.created_at, q.withdrawn_at, q.withdrawal_reason,
                u.name AS response_updated_by_name, w.name AS withdrawn_by_name, o.name AS owner_name
           FROM agency_communication_questions q
           LEFT JOIN users u ON u.id = q.response_updated_by
           LEFT JOIN users w ON w.id = q.withdrawn_by
           LEFT JOIN users o ON o.id = q.owner_user_id
          WHERE q.organization_id = $1 AND q.project_id = $2 AND q.communication_event_id = $3
          ORDER BY q.id`,
        [orgId, projectId, eventId],
      );
  return r.rows.map(toQuestion);
}

/** One question, locked for the signing, saving or withdrawing transaction. */
export async function lockQuestion(client: Queryable, orgId: number, projectId: number, eventId: string, questionId: number): Promise<QuestionRow> {
  const r = await client.query(
    `SELECT q.id, q.project_id, q.communication_event_id, q.question_ref, q.question_text, q.discipline,
            q.ctd_section, q.severity, q.owner_user_id, q.response_text, q.response_revision, q.response_updated_by,
            q.response_updated_at, q.created_at, q.withdrawn_at, q.withdrawal_reason,
            u.name AS response_updated_by_name, w.name AS withdrawn_by_name, o.name AS owner_name
       FROM agency_communication_questions q
       LEFT JOIN users u ON u.id = q.response_updated_by
       LEFT JOIN users w ON w.id = q.withdrawn_by
       LEFT JOIN users o ON o.id = q.owner_user_id
      WHERE q.id = $1 AND q.organization_id = $2 AND q.project_id = $3 AND q.communication_event_id = $4
      FOR UPDATE OF q`,
    [questionId, orgId, projectId, eventId],
  );
  if (!r.rows[0]) throw new AgencyResponseError('QUESTION_NOT_FOUND', 'That question was not found on this letter.');
  return toQuestion(r.rows[0]);
}

/**
 * Live signatures on these questions: not superseded (§11.70 revocation
 * writes superseded_by) and not marked invalid. Keyed by question id.
 */
async function liveSignatures(client: Queryable, orgId: number, questionIds: number[]): Promise<Map<number, ResponseSignature[]>> {
  const out = new Map<number, ResponseSignature[]>();
  if (questionIds.length === 0) return out;
  const r = await client.query(
    `SELECT id, signed_target, bound_payload_digest, signer_id, signer_name, signed_at, signature_meaning
       FROM electronic_signatures
      WHERE organization_id = $1
        AND signed_target = ANY($2::text[])
        AND superseded_by IS NULL
        AND is_valid IS NOT FALSE`,
    [orgId, questionIds.map((id) => `agency-question:${id}`)],
  );
  for (const row of r.rows) {
    const qid = Number(String(row.signed_target).slice('agency-question:'.length));
    const list = out.get(qid) ?? [];
    list.push({
      id: Number(row.id),
      boundDigest: String(row.bound_payload_digest ?? ''),
      signerId: Number(row.signer_id),
      signerName: String(row.signer_name),
      signedAt: iso(row.signed_at) ?? '',
      meaning: row.signature_meaning ?? null,
    });
    out.set(qid, list);
  }
  return out;
}

/** Every text each question's response has had, oldest first. */
async function revisionsOf(client: Queryable, orgId: number, questionIds: number[]): Promise<Map<number, ResponseRevision[]>> {
  const out = new Map<number, ResponseRevision[]>();
  if (questionIds.length === 0) return out;
  const r = await client.query(
    `SELECT v.question_id, v.revision, v.response_text, v.response_digest, v.written_by, v.written_at, v.reason,
            u.name AS written_by_name
       FROM agency_question_response_revisions v
       LEFT JOIN users u ON u.id = v.written_by
      WHERE v.organization_id = $1 AND v.question_id = ANY($2::int[])
      ORDER BY v.question_id, v.revision`,
    [orgId, questionIds],
  );
  for (const row of r.rows) {
    const qid = Number(row.question_id);
    const list = out.get(qid) ?? [];
    list.push({
      revision: Number(row.revision),
      responseText: String(row.response_text),
      digest: String(row.response_digest),
      writtenBy: Number(row.written_by),
      writtenByName: row.written_by_name ?? null,
      writtenAt: iso(row.written_at) ?? '',
      reason: String(row.reason),
    });
    out.set(qid, list);
  }
  return out;
}

export type QuestionCommitment = PackageCommitment & { status: string; effectiveStatus: CommitmentStatus };

async function commitmentsOf(client: Queryable, orgId: number, questionIds: number[], today: string): Promise<Map<number, QuestionCommitment[]>> {
  const out = new Map<number, QuestionCommitment[]>();
  if (questionIds.length === 0) return out;
  const r = await client.query(
    `SELECT id, source_question_id, commitment_type, description, to_char(due_date, 'YYYY-MM-DD') AS due_date,
            to_char(fulfilled_date, 'YYYY-MM-DD') AS fulfilled_date, regulatory_basis, status
       FROM regulatory_commitments
      WHERE organization_id = $1 AND source_question_id = ANY($2::int[]) AND deleted_at IS NULL
      ORDER BY id`,
    [orgId, questionIds],
  );
  for (const row of r.rows) {
    const qid = Number(row.source_question_id);
    const list = out.get(qid) ?? [];
    list.push({
      id: Number(row.id),
      commitmentType: String(row.commitment_type),
      description: String(row.description),
      // DATEs, read as their own text: no time zone can move them a day.
      dueDate: row.due_date ?? null,
      regulatoryBasis: row.regulatory_basis ?? null,
      status: String(row.status),
      // The register's own rule (ha-logic): past due and not met reads overdue,
      // here as on Communication's Commitments tab.
      effectiveStatus: deriveCommitmentStatus({ status: row.status, dueDate: row.due_date, fulfilledDate: row.fulfilled_date }, today),
    });
    out.set(qid, list);
  }
  return out;
}

export interface QuestionView extends QuestionRow {
  approval: QuestionApproval;
  revisions: ResponseRevision[];
  /** Who wrote any of the text an approval would now cover (response-logic authorsSinceLastApproval). */
  authors: number[];
  /** Every live signature on the question, so each revision can say which one approved it. */
  signatures: ResponseSignature[];
  commitments: QuestionCommitment[];
}

/** Every question on a letter, with where each stands, its history and what was committed in it. */
export async function readQuestions(client: Queryable, orgId: number, projectId: number, eventId: string, today: string): Promise<QuestionView[]> {
  const rows = await questionRows(client, orgId, projectId, eventId);
  const ids = rows.map((q) => q.id);
  const [sigs, revisions, commitments] = await Promise.all([
    liveSignatures(client, orgId, ids),
    revisionsOf(client, orgId, ids),
    commitmentsOf(client, orgId, ids, today),
  ]);
  return rows.map((q) => {
    const s = sigs.get(q.id) ?? [];
    const v = revisions.get(q.id) ?? [];
    return {
      ...q,
      approval: questionApproval(q, s),
      revisions: v,
      authors: authorsSinceLastApproval(q, v, s),
      signatures: s,
      commitments: commitments.get(q.id) ?? [],
    };
  });
}

/** A letter with the CTD section codes it was logged against (the module view reads them). */
export interface ProjectLetterRow extends LetterRow {
  linkedSectionCodes: unknown[];
}

/** Every letter of the project, newest first. Visibility is the caller's to apply, before anything is counted. */
export async function readProjectLetters(client: Queryable, orgId: number, projectId: number): Promise<ProjectLetterRow[]> {
  const r = await client.query(
    `SELECT event_id, communication_type, source_type, received_date, due_date, closure_status,
            human_review_status, response_required, audit_metadata, linked_section_codes
       FROM concept2cure_agency_communications
      WHERE organization_id = $1 AND project_id = $2
      ORDER BY created_at DESC, event_id`,
    [orgId, projectId],
  );
  return r.rows.map((row) => ({
    ...toLetter(row),
    linkedSectionCodes: Array.isArray(row.linked_section_codes) ? row.linked_section_codes : [],
  }));
}

/**
 * The questions on the given letters of a project, each with where it stands
 * (questionApproval over its live signatures). The same reader as a letter's
 * own (questionRows, liveSignatures), without the history and commitments a
 * module view does not show. Questions on letters not in `eventIds` are not
 * returned, so a letter the person may not see contributes nothing.
 */
export async function readProjectQuestions(
  client: Queryable,
  orgId: number,
  projectId: number,
  eventIds: ReadonlySet<string>,
): Promise<Array<QuestionRow & { approval: QuestionApproval }>> {
  const rows = (await questionRows(client, orgId, projectId, null)).filter((q) => eventIds.has(q.communicationEventId));
  const sigs = await liveSignatures(client, orgId, rows.map((q) => q.id));
  return rows.map((q) => ({ ...q, approval: questionApproval(q, sigs.get(q.id) ?? []) }));
}

function refuseIfClosed(letter: LetterRow): void {
  if (letter.closureStatus === 'closed') {
    throw new AgencyResponseError('LETTER_CLOSED', 'This letter is closed. Its questions and responses are final.');
  }
}

function refuseIfWithdrawn(q: QuestionRow): void {
  if (q.withdrawn) {
    throw new AgencyResponseError('QUESTION_WITHDRAWN', `${q.questionRef} was withdrawn and takes no response.`);
  }
}

export interface NewQuestion {
  questionRef: string;
  questionText: string;
  discipline?: string | null;
  /** Normalised by the route (normalizeCtdCode); the CHECK admits nothing else. */
  ctdSection?: string | null;
  severity: 'minor' | 'major' | 'critical';
  ownerUserId?: number | null;
}

/** A question as the agency numbered and worded it. Refused on a closed letter and for a number already used on it. */
export async function insertQuestionTx(client: Queryable, scope: WriteScope, letter: LetterRow, input: NewQuestion): Promise<{ id: number }> {
  refuseIfClosed(letter);
  const dup = await client.query(
    `SELECT 1 FROM agency_communication_questions
      WHERE organization_id = $1 AND communication_event_id = $2 AND question_ref = $3 LIMIT 1`,
    [scope.orgId, letter.eventId, input.questionRef],
  );
  if (dup.rows.length > 0) {
    throw new AgencyResponseError('DUPLICATE_QUESTION', `This letter already has a question numbered ${input.questionRef}.`);
  }
  const r = await client.query(
    `INSERT INTO agency_communication_questions
       (organization_id, project_id, communication_event_id, question_ref, question_text, discipline, ctd_section, severity, owner_user_id, created_by)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10) RETURNING id`,
    [scope.orgId, scope.projectId, letter.eventId, input.questionRef, input.questionText, input.discipline ?? null, input.ctdSection ?? null, input.severity, input.ownerUserId ?? null, scope.userId],
  );
  return { id: Number(r.rows[0].id) };
}

export interface ResponseSave {
  questionId: number;
  responseText: string;
  /** The revision the writer started from. */
  expectedRevision: number;
  reason: string;
}

/**
 * Write the response text and keep it: the question row takes the new text,
 * and agency_question_response_revisions takes a row for it (text, digest,
 * writer, time, reason), so every text a signature ever approved can be read
 * back. `expectedRevision` is the revision the writer started from, so two
 * people editing one answer cannot overwrite each other unseen. Saving the
 * same text again is refused: it would make the saver an author of words they
 * did not change.
 */
export async function saveResponseTx(
  client: Queryable,
  scope: WriteScope,
  letter: LetterRow,
  save: ResponseSave,
): Promise<{ question: QuestionRow; revision: number; digest: string }> {
  refuseIfClosed(letter);
  const q = await lockQuestion(client, scope.orgId, scope.projectId, letter.eventId, save.questionId);
  refuseIfWithdrawn(q);
  if (q.responseRevision !== save.expectedRevision) {
    throw new AgencyResponseError(
      'RESPONSE_CHANGED',
      `The response to ${q.questionRef} changed since you opened it (now revision ${q.responseRevision}). Your text was not saved. Reopen the response to see the current text.`,
    );
  }
  if (q.responseText === save.responseText) {
    throw new AgencyResponseError('NO_CHANGE', `The response to ${q.questionRef} is already exactly this text.`);
  }
  const r = await client.query(
    `UPDATE agency_communication_questions
        SET response_text = $5, response_revision = response_revision + 1,
            response_updated_by = $6, response_updated_at = NOW(), updated_at = NOW()
      WHERE id = $1 AND organization_id = $2 AND project_id = $3 AND communication_event_id = $4
      RETURNING response_revision`,
    [save.questionId, scope.orgId, scope.projectId, letter.eventId, save.responseText, scope.userId],
  );
  const revision = Number(r.rows[0].response_revision);
  const next = { ...q, responseText: save.responseText, responseRevision: revision, responseUpdatedBy: scope.userId };
  const digest = agencyResponseDigest(next);
  await client.query(
    `INSERT INTO agency_question_response_revisions
       (organization_id, question_id, revision, response_text, response_digest, written_by, reason)
     VALUES ($1,$2,$3,$4,$5,$6,$7)`,
    [scope.orgId, save.questionId, revision, save.responseText, digest, scope.userId, save.reason],
  );
  return { question: next, revision, digest };
}

/**
 * Withdraw a question recorded in error, with a reason. It stays on the record
 * (who withdrew it, when, why) and no longer has to be answered; it is not in
 * the package. Refused on a closed letter.
 */
export async function withdrawQuestionTx(client: Queryable, scope: WriteScope, letter: LetterRow, questionId: number, reason: string): Promise<QuestionRow> {
  refuseIfClosed(letter);
  const q = await lockQuestion(client, scope.orgId, scope.projectId, letter.eventId, questionId);
  refuseIfWithdrawn(q);
  await client.query(
    `UPDATE agency_communication_questions
        SET withdrawn_at = NOW(), withdrawn_by = $5, withdrawal_reason = $6, updated_at = NOW()
      WHERE id = $1 AND organization_id = $2 AND project_id = $3 AND communication_event_id = $4`,
    [questionId, scope.orgId, scope.projectId, letter.eventId, scope.userId, reason],
  );
  return { ...q, withdrawn: true, withdrawalReason: reason };
}

/**
 * Correct the CTD section a question concerns (2026-10-19), with a reason the
 * route records. Classification only: the approval digest does not cover it,
 * so an approved response stays approved. Refused on a closed letter, for a
 * withdrawn question, and when nothing would change.
 */
export async function classifyQuestionTx(
  client: Queryable,
  scope: WriteScope,
  letter: LetterRow,
  questionId: number,
  ctdSection: string | null,
): Promise<{ question: QuestionRow; from: string | null; to: string | null }> {
  refuseIfClosed(letter);
  const q = await lockQuestion(client, scope.orgId, scope.projectId, letter.eventId, questionId);
  refuseIfWithdrawn(q);
  if (q.ctdSection === ctdSection) {
    throw new AgencyResponseError('NO_CHANGE', `${q.questionRef} is already recorded ${ctdSection ? `at §${ctdSection}` : 'with no CTD section'}.`);
  }
  await client.query(
    `UPDATE agency_communication_questions
        SET ctd_section = $5, updated_at = NOW()
      WHERE id = $1 AND organization_id = $2 AND project_id = $3 AND communication_event_id = $4`,
    [questionId, scope.orgId, scope.projectId, letter.eventId, ctdSection],
  );
  return { question: { ...q, ctdSection }, from: q.ctdSection, to: ctdSection };
}

/**
 * Who owns preparing a question's response (2026-10-19, review of the CMC
 * convergence): CMC kept a free-text "assigned to" on its own file, which is
 * read-only now, and the letter's record had an owner column with no way to
 * set it. Set or cleared here with a reason the route records, from and to.
 * The owner must be an active member of the organisation whose role may open
 * this letter's visibility tier (`canSee`, the same rule that admits the
 * person reading it), so no one is made responsible for a letter they cannot
 * see. Not covered by the approval signature. Refused on a closed letter, for
 * a withdrawn question, and when nothing would change.
 */
export async function assignQuestionOwnerTx(
  client: Queryable,
  scope: WriteScope,
  letter: LetterRow,
  change: { questionId: number; ownerUserId: number | null },
  canSee: (tier: string | null, role: string) => boolean,
): Promise<{ question: QuestionRow; from: number | null; to: number | null; toName: string | null }> {
  const { questionId, ownerUserId } = change;
  refuseIfClosed(letter);
  const q = await lockQuestion(client, scope.orgId, scope.projectId, letter.eventId, questionId);
  refuseIfWithdrawn(q);
  if (q.ownerUserId === ownerUserId) {
    throw new AgencyResponseError('NO_CHANGE', ownerUserId === null ? `${q.questionRef} has no owner already.` : `${q.questionRef} is already owned by ${q.ownerName ?? 'that person'}.`);
  }
  let toName: string | null = null;
  if (ownerUserId !== null) {
    const m = await client.query(
      `SELECT ou.role, u.name
         FROM organization_users ou
         JOIN users u ON u.id = ou.user_id
        WHERE ou.organization_id = $1 AND ou.user_id = $2 AND u.status = 'active'
        LIMIT 1`,
      [scope.orgId, ownerUserId],
    );
    const member = m.rows[0];
    if (!member) {
      throw new AgencyResponseError('OWNER_NOT_MEMBER', 'That person is not an active member of this organisation. Nothing was changed.');
    }
    if (!canSee(letter.visibilityTier, String(member.role))) {
      throw new AgencyResponseError(
        'OWNER_CANNOT_SEE_LETTER',
        `${member.name ?? 'That person'} cannot open this letter at its visibility, so cannot own a response to it. Nothing was changed.`,
      );
    }
    toName = member.name ?? null;
  }
  await client.query(
    `UPDATE agency_communication_questions
        SET owner_user_id = $5, updated_at = NOW()
      WHERE id = $1 AND organization_id = $2 AND project_id = $3 AND communication_event_id = $4`,
    [questionId, scope.orgId, scope.projectId, letter.eventId, ownerUserId],
  );
  return { question: { ...q, ownerUserId, ownerName: toName }, from: q.ownerUserId, to: ownerUserId, toName };
}

/**
 * The domain half of the signed approval, run inside signGovernedAct's
 * transaction after the password and the signer's authority are verified.
 * Locks the row, then refuses anything the record says stands in the way:
 * text other than the revision the signer read, nothing to sign, already
 * approved, withdrawn, or the signer wrote any of the text being approved.
 * The signature itself (and its binding of this exact text) is the
 * ceremony's, on the same transaction.
 */
export async function prepareApprovalTx(
  client: Queryable,
  scope: WriteScope,
  letter: LetterRow,
  questionId: number,
  expectedRevision: number,
): Promise<{ question: QuestionRow; digest: string }> {
  refuseIfClosed(letter);
  const q = await lockQuestion(client, scope.orgId, scope.projectId, letter.eventId, questionId);
  if (q.responseRevision !== expectedRevision) {
    throw new AgencyResponseError(
      'RESPONSE_CHANGED',
      `The response to ${q.questionRef} changed after you opened it (now revision ${q.responseRevision}). Read the current text before signing. Nothing was signed.`,
    );
  }
  const [sigs, revisions] = await Promise.all([liveSignatures(client, scope.orgId, [q.id]), revisionsOf(client, scope.orgId, [q.id])]);
  const s = sigs.get(q.id) ?? [];
  const approval = questionApproval(q, s);
  const refused = signRefusal(q, approval, scope.userId, authorsSinceLastApproval(q, revisions.get(q.id) ?? [], s));
  if (refused) throw new AgencyResponseError(refused.code as AgencyResponseError['code'], `${refused.message} Nothing was signed.`);
  return { question: q, digest: approval.digest };
}

/**
 * Mark a letter as needing no response, with a reason: one logged as
 * response-required that turns out to ask nothing. Refused once questions are
 * recorded on it (answer them, or withdraw any recorded in error), and on a
 * closed letter.
 */
export async function markNoResponseRequiredTx(client: Queryable, scope: { orgId: number; projectId: number }, letter: LetterRow): Promise<void> {
  refuseIfClosed(letter);
  if (!letter.responseRequired) {
    throw new AgencyResponseError('NOT_RESPONSE_REQUIRED', 'This letter is already recorded as needing no response.');
  }
  const r = await client.query(
    `SELECT count(*)::int AS n FROM agency_communication_questions
      WHERE organization_id = $1 AND project_id = $2 AND communication_event_id = $3 AND withdrawn_at IS NULL`,
    [scope.orgId, scope.projectId, letter.eventId],
  );
  if (Number(r.rows[0]?.n ?? 0) > 0) {
    throw new AgencyResponseError(
      'QUESTIONS_RECORDED',
      'Questions are recorded on this letter. Answer them, or withdraw any recorded in error, before saying it needs no response.',
    );
  }
  await client.query(
    `UPDATE concept2cure_agency_communications SET response_required = false
      WHERE organization_id = $1 AND project_id = $2 AND event_id = $3`,
    [scope.orgId, scope.projectId, letter.eventId],
  );
}

/**
 * Close a letter, inside the caller's transaction, after locking it: the rule
 * (response-logic closeRefusal) is checked against the questions as they stand
 * under the lock, so a save or a new question cannot slip between the check
 * and the close. Refuses with RESPONSES_NOT_APPROVED; returns the stored row.
 */
export async function closeLetterTx(
  client: Queryable,
  scope: { orgId: number; projectId: number },
  eventId: string,
  next: { humanReviewStatus: string; closureStatus: string },
  today: string,
): Promise<{ event_id: string; human_review_status: string; closure_status: string }> {
  const letter = await readLetter(client, scope.orgId, scope.projectId, eventId, true);
  if (!letter) throw new AgencyResponseError('LETTER_NOT_FOUND', 'That communication was not found in this project.');
  const refusal = closeRefusal(await readQuestions(client, scope.orgId, scope.projectId, eventId, today), letter.responseRequired);
  if (refusal) throw new AgencyResponseError('RESPONSES_NOT_APPROVED', refusal);
  const r = await client.query(
    `UPDATE concept2cure_agency_communications
        SET human_review_status = $4, closure_status = $5
      WHERE organization_id = $1 AND project_id = $2 AND event_id = $3
      RETURNING event_id, human_review_status, closure_status`,
    [scope.orgId, scope.projectId, eventId, next.humanReviewStatus, next.closureStatus],
  );
  return r.rows[0];
}

/** The question a commitment is recorded from, with its letter, in this project. Refused for a withdrawn question. */
export async function questionForCommitment(client: Queryable, orgId: number, projectId: number, eventId: string, questionId: number): Promise<QuestionRow> {
  const r = await client.query(
    `SELECT q.id, q.project_id, q.communication_event_id, q.question_ref, q.question_text, q.discipline,
            q.ctd_section, q.severity, q.owner_user_id, q.response_text, q.response_revision, q.response_updated_by,
            q.response_updated_at, q.created_at, q.withdrawn_at, q.withdrawal_reason,
            u.name AS response_updated_by_name, w.name AS withdrawn_by_name, o.name AS owner_name
       FROM agency_communication_questions q
       LEFT JOIN users u ON u.id = q.response_updated_by
       LEFT JOIN users w ON w.id = q.withdrawn_by
       LEFT JOIN users o ON o.id = q.owner_user_id
      WHERE q.id = $1 AND q.organization_id = $2 AND q.project_id = $3 AND q.communication_event_id = $4
      LIMIT 1`,
    [questionId, orgId, projectId, eventId],
  );
  if (!r.rows[0]) throw new AgencyResponseError('QUESTION_NOT_FOUND', 'That question was not found on this letter.');
  const q = toQuestion(r.rows[0]);
  refuseIfWithdrawn(q);
  return q;
}

/** A view of one question for a person: what they may do with it, from the record. */
export function questionForViewer(q: QuestionView, viewerId: number) {
  const a = q.approval;
  const signatureFor = (digest: string): ResponseSignature | null =>
    [...q.signatures].sort((x, y) => (x.signedAt < y.signedAt ? 1 : -1)).find((s) => s.boundDigest === digest) ?? null;
  return {
    id: q.id,
    questionRef: q.questionRef,
    questionText: q.questionText,
    discipline: q.discipline,
    ctdSection: q.ctdSection,
    severity: q.severity,
    ownerUserId: q.ownerUserId,
    ownerName: q.ownerName,
    responseText: q.responseText,
    responseRevision: q.responseRevision,
    responseUpdatedBy: q.responseUpdatedBy,
    responseUpdatedByName: q.responseUpdatedByName,
    responseUpdatedAt: q.responseUpdatedAt,
    state: a.state,
    digest: a.digest,
    approval: a.approval
      ? { signatureId: a.approval.id, signerId: a.approval.signerId, signerName: a.approval.signerName, signedAt: a.approval.signedAt, meaning: a.approval.meaning }
      : null,
    supersededApproval: a.supersededApproval
      ? { signatureId: a.supersededApproval.id, signerName: a.supersededApproval.signerName, signedAt: a.supersededApproval.signedAt, meaning: a.supersededApproval.meaning }
      : null,
    signRefusal: signRefusal(q, a, viewerId, q.authors),
    withdrawal: q.withdrawn
      ? { withdrawnAt: q.withdrawnAt, withdrawnByName: q.withdrawnByName, reason: q.withdrawalReason }
      : null,
    /* Every text this response has had, newest first: who wrote it, when and
       why, and the live signature that approved it if one did. An approved
       text that was later edited is read back here. */
    history: [...q.revisions].reverse().map((r) => {
      const sig = signatureFor(r.digest);
      return {
        revision: r.revision,
        responseText: r.responseText,
        writtenByName: r.writtenByName,
        writtenAt: r.writtenAt,
        reason: r.reason,
        approvedBy: sig ? { signatureId: sig.id, signerName: sig.signerName, signedAt: sig.signedAt, meaning: sig.meaning } : null,
      };
    }),
    commitments: q.commitments,
  };
}
