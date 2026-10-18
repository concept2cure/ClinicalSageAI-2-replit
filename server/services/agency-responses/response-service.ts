/**
 * Agency responses — the SQL behind the project inbox's questions, responses,
 * signed approvals and the commitments made in them.
 *
 * Every function takes the caller's client: the writes run inside the route's
 * transaction (tenant context set, ledger pair written on the same client),
 * and the reads run on the request's tenant-pinned connection. Every
 * statement names the organization and the project as well, so a row is never
 * reached through an id alone.
 *
 * What a state, a refusal or a package IS lives in response-logic.ts; this
 * file only reads and writes the record.
 *
 * @module server/services/agency-responses/response-service
 */

import {
  agencyResponseDigest,
  questionApproval,
  signRefusal,
  type PackageCommitment,
  type QuestionApproval,
  type QuestionRecord,
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
      | 'SIGNER_WROTE_RESPONSE',
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
};

export interface LetterRow {
  eventId: string;
  communicationType: string;
  sourceType: string;
  receivedDate: string | null;
  dueDate: string | null;
  closureStatus: string;
  visibilityTier: string | null;
}

function iso(v: unknown): string | null {
  if (v == null) return null;
  const d = v instanceof Date ? v : new Date(String(v));
  return Number.isNaN(d.getTime()) ? null : d.toISOString();
}

/** The letter, in this organization and project; null when there is none. */
export async function readLetter(client: Queryable, orgId: number, projectId: number, eventId: string, lock = false): Promise<LetterRow | null> {
  // Two literal statements rather than one with a spliced clause: no SQL text
  // is assembled at run time (ci:sql-interpolation).
  const r = await client.query(
    lock
      ? `SELECT event_id, communication_type, source_type, received_date, due_date, closure_status, audit_metadata
           FROM concept2cure_agency_communications
          WHERE organization_id = $1 AND project_id = $2 AND event_id = $3
          LIMIT 1 FOR UPDATE`
      : `SELECT event_id, communication_type, source_type, received_date, due_date, closure_status, audit_metadata
           FROM concept2cure_agency_communications
          WHERE organization_id = $1 AND project_id = $2 AND event_id = $3
          LIMIT 1`,
    [orgId, projectId, eventId],
  );
  const row = r.rows[0];
  if (!row) return null;
  return {
    eventId: String(row.event_id),
    communicationType: String(row.communication_type),
    sourceType: String(row.source_type),
    receivedDate: iso(row.received_date),
    dueDate: iso(row.due_date),
    closureStatus: String(row.closure_status ?? 'open'),
    visibilityTier: row.audit_metadata?.visibilityTier ?? null,
  };
}

interface QuestionRow extends QuestionRecord {
  projectId: number;
  discipline: string | null;
  severity: string;
  ownerUserId: number | null;
  responseUpdatedByName: string | null;
  responseUpdatedAt: string | null;
  createdAt: string | null;
}


function toQuestion(row: any): QuestionRow {
  return {
    id: Number(row.id),
    projectId: Number(row.project_id),
    communicationEventId: String(row.communication_event_id),
    questionRef: String(row.question_ref),
    questionText: String(row.question_text),
    discipline: row.discipline ?? null,
    severity: String(row.severity),
    ownerUserId: row.owner_user_id == null ? null : Number(row.owner_user_id),
    responseText: String(row.response_text ?? ''),
    responseRevision: Number(row.response_revision),
    responseUpdatedBy: row.response_updated_by == null ? null : Number(row.response_updated_by),
    responseUpdatedByName: row.response_updated_by_name ?? null,
    responseUpdatedAt: iso(row.response_updated_at),
    createdAt: iso(row.created_at),
  };
}

async function questionRows(client: Queryable, orgId: number, projectId: number, eventId: string): Promise<QuestionRow[]> {
  const r = await client.query(
    `SELECT q.id, q.project_id, q.communication_event_id, q.question_ref, q.question_text, q.discipline,
            q.severity, q.owner_user_id, q.response_text, q.response_revision, q.response_updated_by,
            q.response_updated_at, q.created_at, u.name AS response_updated_by_name
       FROM agency_communication_questions q
       LEFT JOIN users u ON u.id = q.response_updated_by
      WHERE q.organization_id = $1 AND q.project_id = $2 AND q.communication_event_id = $3
      ORDER BY q.id`,
    [orgId, projectId, eventId],
  );
  return r.rows.map(toQuestion);
}

/** One question, locked for the signing or saving transaction. */
export async function lockQuestion(client: Queryable, orgId: number, projectId: number, eventId: string, questionId: number): Promise<QuestionRow> {
  const r = await client.query(
    `SELECT q.id, q.project_id, q.communication_event_id, q.question_ref, q.question_text, q.discipline,
            q.severity, q.owner_user_id, q.response_text, q.response_revision, q.response_updated_by,
            q.response_updated_at, q.created_at, u.name AS response_updated_by_name
       FROM agency_communication_questions q
       LEFT JOIN users u ON u.id = q.response_updated_by
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

async function commitmentsOf(client: Queryable, orgId: number, questionIds: number[]): Promise<Map<number, Array<PackageCommitment & { status: string }>>> {
  const out = new Map<number, Array<PackageCommitment & { status: string }>>();
  if (questionIds.length === 0) return out;
  const r = await client.query(
    `SELECT id, source_question_id, commitment_type, description, to_char(due_date, 'YYYY-MM-DD') AS due_date,
            regulatory_basis, status
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
      // A DATE, read as its own text: no time zone can move it a day.
      dueDate: row.due_date ?? null,
      regulatoryBasis: row.regulatory_basis ?? null,
      status: String(row.status),
    });
    out.set(qid, list);
  }
  return out;
}

export interface QuestionView extends QuestionRow {
  approval: QuestionApproval;
  commitments: Array<PackageCommitment & { status: string }>;
}

/** Every question on a letter, with where each stands and what was committed in it. */
export async function readQuestions(client: Queryable, orgId: number, projectId: number, eventId: string): Promise<QuestionView[]> {
  const rows = await questionRows(client, orgId, projectId, eventId);
  const ids = rows.map((q) => q.id);
  const [sigs, commitments] = await Promise.all([liveSignatures(client, orgId, ids), commitmentsOf(client, orgId, ids)]);
  return rows.map((q) => ({
    ...q,
    approval: questionApproval(q, sigs.get(q.id) ?? []),
    commitments: commitments.get(q.id) ?? [],
  }));
}

/** Where one question stands, inside a transaction that holds its row. */
export async function approvalOf(client: Queryable, orgId: number, q: QuestionRecord): Promise<QuestionApproval> {
  const sigs = await liveSignatures(client, orgId, [q.id]);
  return questionApproval(q, sigs.get(q.id) ?? []);
}

function refuseIfClosed(letter: LetterRow): void {
  if (letter.closureStatus === 'closed') {
    throw new AgencyResponseError('LETTER_CLOSED', 'This letter is closed. Its questions and responses are final.');
  }
}

export interface NewQuestion {
  questionRef: string;
  questionText: string;
  discipline?: string | null;
  severity: 'minor' | 'major' | 'critical';
  ownerUserId?: number | null;
}

export async function insertQuestionTx(
  client: Queryable,
  orgId: number,
  projectId: number,
  userId: number,
  letter: LetterRow,
  input: NewQuestion,
): Promise<{ id: number }> {
  refuseIfClosed(letter);
  const dup = await client.query(
    `SELECT 1 FROM agency_communication_questions
      WHERE organization_id = $1 AND communication_event_id = $2 AND question_ref = $3 LIMIT 1`,
    [orgId, letter.eventId, input.questionRef],
  );
  if (dup.rows.length > 0) {
    throw new AgencyResponseError('DUPLICATE_QUESTION', `This letter already has a question numbered ${input.questionRef}.`);
  }
  const r = await client.query(
    `INSERT INTO agency_communication_questions
       (organization_id, project_id, communication_event_id, question_ref, question_text, discipline, severity, owner_user_id, created_by)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9) RETURNING id`,
    [orgId, projectId, letter.eventId, input.questionRef, input.questionText, input.discipline ?? null, input.severity, input.ownerUserId ?? null, userId],
  );
  return { id: Number(r.rows[0].id) };
}

/**
 * Write the response text. `expectedRevision` is the revision the writer
 * started from, so two people editing one answer cannot overwrite each other
 * unseen. Saving the same text again is refused: it would make the saver the
 * author of words they did not change, and the author is the one person who
 * may not approve them.
 */
export async function saveResponseTx(
  client: Queryable,
  orgId: number,
  projectId: number,
  userId: number,
  letter: LetterRow,
  questionId: number,
  responseText: string,
  expectedRevision: number,
): Promise<{ question: QuestionRow; revision: number; digest: string }> {
  refuseIfClosed(letter);
  const q = await lockQuestion(client, orgId, projectId, letter.eventId, questionId);
  if (q.responseRevision !== expectedRevision) {
    throw new AgencyResponseError(
      'RESPONSE_CHANGED',
      `The response to ${q.questionRef} changed since you opened it (now revision ${q.responseRevision}). Reload it before saving.`,
    );
  }
  if (q.responseText === responseText) {
    throw new AgencyResponseError('NO_CHANGE', `The response to ${q.questionRef} is already exactly this text.`);
  }
  const r = await client.query(
    `UPDATE agency_communication_questions
        SET response_text = $5, response_revision = response_revision + 1,
            response_updated_by = $6, response_updated_at = NOW(), updated_at = NOW()
      WHERE id = $1 AND organization_id = $2 AND project_id = $3 AND communication_event_id = $4
      RETURNING response_revision`,
    [questionId, orgId, projectId, letter.eventId, responseText, userId],
  );
  const revision = Number(r.rows[0].response_revision);
  const next = { ...q, responseText, responseRevision: revision, responseUpdatedBy: userId };
  return { question: next, revision, digest: agencyResponseDigest(next) };
}

/**
 * The domain half of the signed approval, run inside signGovernedAct's
 * transaction after the password and the signer's authority are verified.
 * Locks the row, then refuses anything the record says stands in the way:
 * text other than the revision the signer read, nothing to sign, already
 * approved, or the signer wrote it. The signature itself (and its binding of
 * this exact text) is the ceremony's, on the same transaction.
 */
export async function prepareApprovalTx(
  client: Queryable,
  orgId: number,
  projectId: number,
  userId: number,
  letter: LetterRow,
  questionId: number,
  expectedRevision: number,
): Promise<{ question: QuestionRow; digest: string }> {
  refuseIfClosed(letter);
  const q = await lockQuestion(client, orgId, projectId, letter.eventId, questionId);
  if (q.responseRevision !== expectedRevision) {
    throw new AgencyResponseError(
      'RESPONSE_CHANGED',
      `The response to ${q.questionRef} changed after you opened it (now revision ${q.responseRevision}). Read the current text before signing. Nothing was signed.`,
    );
  }
  const approval = await approvalOf(client, orgId, q);
  const refused = signRefusal(q, approval, userId);
  if (refused) throw new AgencyResponseError(refused.code as AgencyResponseError['code'], `${refused.message} Nothing was signed.`);
  return { question: q, digest: approval.digest };
}

/** The question a commitment is recorded from, with its letter, in this project. */
export async function questionForCommitment(client: Queryable, orgId: number, projectId: number, eventId: string, questionId: number): Promise<QuestionRow> {
  const r = await client.query(
    `SELECT q.id, q.project_id, q.communication_event_id, q.question_ref, q.question_text, q.discipline,
            q.severity, q.owner_user_id, q.response_text, q.response_revision, q.response_updated_by,
            q.response_updated_at, q.created_at, u.name AS response_updated_by_name
       FROM agency_communication_questions q
       LEFT JOIN users u ON u.id = q.response_updated_by
      WHERE q.id = $1 AND q.organization_id = $2 AND q.project_id = $3 AND q.communication_event_id = $4
      LIMIT 1`,
    [questionId, orgId, projectId, eventId],
  );
  if (!r.rows[0]) throw new AgencyResponseError('QUESTION_NOT_FOUND', 'That question was not found on this letter.');
  return toQuestion(r.rows[0]);
}

/** A view of one question for a person: what they may do with it, from the record. */
export function questionForViewer(q: QuestionView, viewerId: number) {
  const a = q.approval;
  return {
    id: q.id,
    questionRef: q.questionRef,
    questionText: q.questionText,
    discipline: q.discipline,
    severity: q.severity,
    ownerUserId: q.ownerUserId,
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
    signRefusal: signRefusal(q, a, viewerId),
    commitments: q.commitments,
  };
}
