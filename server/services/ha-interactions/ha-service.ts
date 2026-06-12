/**
 * HA Interaction & Commitment service (Capability C2C-03)
 *
 * Tenant-scoped transaction functions over ha_interactions /
 * ha_interaction_questions / regulatory_commitments / commitment_milestones.
 * Mutations run inside the caller's transaction so the row write and the
 * governed-action ledger commit together. Commitments thread onto the
 * provenance spine: interaction → commitment (role 'creates') and commitment →
 * submission (role 'supports').
 *
 * DB-backed — authored to the platform's governed-CRUD pattern; runtime-verified
 * in a DB-enabled environment.
 *
 * @module server/services/ha-interactions/ha-service
 */

import { pool } from '../../db';
import { linkProvenanceTx } from '../provenance/provenance-service';
import type {
  CommitmentType,
  HaAgency,
  HaInteractionType,
} from '../../../shared/schema/ha-interactions';

interface Queryable {
  query: (sql: string, params?: unknown[]) => Promise<{ rows: any[] }>;
}

export class HaError extends Error {
  constructor(public code: 'NOT_FOUND' | 'INVALID_STATE' | 'BAD_INPUT', message: string) {
    super(message);
    this.name = 'HaError';
  }
}

// ─── Interactions ────────────────────────────────────────────────────────────

export interface InteractionInput {
  interactionType: HaInteractionType;
  agency: HaAgency;
  title: string;
  objective?: string | null;
  submissionId?: number | null;
  requestedDate?: string | null;
  scheduledDate?: string | null;
}

export async function createInteractionTx(client: Queryable, orgId: number, userId: number, input: InteractionInput): Promise<{ id: number }> {
  const { rows } = await client.query(
    `INSERT INTO ha_interactions
       (organization_id, submission_id, interaction_type, agency, title, objective, status, requested_date, scheduled_date, created_by)
     VALUES ($1,$2,$3,$4,$5,$6,'planned',$7,$8,$9) RETURNING id`,
    [orgId, input.submissionId ?? null, input.interactionType, input.agency, input.title, input.objective ?? null, input.requestedDate ?? null, input.scheduledDate ?? null, userId],
  );
  return { id: Number(rows[0].id) };
}

const INTERACTION_STATUSES = ['planned', 'requested', 'scheduled', 'held', 'minutes_received', 'closed', 'cancelled'];

export async function updateInteractionStatusTx(client: Queryable, orgId: number, id: number, status: string, dates: Record<string, string | null> = {}): Promise<void> {
  if (!INTERACTION_STATUSES.includes(status)) throw new HaError('BAD_INPUT', `Invalid status "${status}".`);
  const r = await client.query(
    `UPDATE ha_interactions SET
        status = $3,
        held_date = COALESCE($4, held_date),
        scheduled_date = COALESCE($5, scheduled_date),
        minutes_received_date = COALESCE($6, minutes_received_date),
        updated_at = now()
      WHERE id = $1 AND organization_id = $2 AND deleted_at IS NULL`,
    [id, orgId, status, dates.heldDate ?? null, dates.scheduledDate ?? null, dates.minutesReceivedDate ?? null],
  );
  if ((r as any).rowCount === 0) throw new HaError('NOT_FOUND', 'Interaction not found for this organization.');
}

export interface QuestionInput {
  questionNumber: number;
  questionText: string;
  sponsorPosition?: string | null;
  agencyResponse?: string | null;
  agreementReached?: boolean;
}

export async function addQuestionTx(client: Queryable, orgId: number, userId: number, interactionId: number, q: QuestionInput): Promise<{ id: number }> {
  const owner = await client.query(
    `SELECT id FROM ha_interactions WHERE id = $1 AND organization_id = $2 AND deleted_at IS NULL LIMIT 1`,
    [interactionId, orgId],
  );
  if (owner.rows.length === 0) throw new HaError('NOT_FOUND', 'Interaction not found for this organization.');
  const { rows } = await client.query(
    `INSERT INTO ha_interaction_questions
       (organization_id, interaction_id, question_number, question_text, sponsor_position, agency_response, agreement_reached, created_by)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8) RETURNING id`,
    [orgId, interactionId, q.questionNumber, q.questionText, q.sponsorPosition ?? null, q.agencyResponse ?? null, q.agreementReached === true, userId],
  );
  return { id: Number(rows[0].id) };
}

// ─── Commitments ─────────────────────────────────────────────────────────────

export interface CommitmentInput {
  commitmentType: CommitmentType;
  description: string;
  submissionId?: number | null;
  sourceInteractionId?: number | null;
  regulatoryBasis?: string | null;
  dueDate?: string | null;
}

/**
 * Create a commitment and thread it onto the provenance spine: the source
 * interaction (if any) → commitment ('creates'), and commitment → submission
 * ('supports') so fulfillment is traceable end to end.
 */
export async function createCommitmentTx(client: Queryable, orgId: number, userId: number, input: CommitmentInput): Promise<{ id: number; provenanceLinkIds: number[] }> {
  if (input.sourceInteractionId != null) {
    const owner = await client.query(
      `SELECT id FROM ha_interactions WHERE id = $1 AND organization_id = $2 AND deleted_at IS NULL LIMIT 1`,
      [input.sourceInteractionId, orgId],
    );
    if (owner.rows.length === 0) throw new HaError('NOT_FOUND', 'Source interaction not found for this organization.');
  }
  const { rows } = await client.query(
    `INSERT INTO regulatory_commitments
       (organization_id, submission_id, source_interaction_id, commitment_type, description, status, regulatory_basis, due_date, created_by)
     VALUES ($1,$2,$3,$4,$5,'open',$6,$7,$8) RETURNING id`,
    [orgId, input.submissionId ?? null, input.sourceInteractionId ?? null, input.commitmentType, input.description, input.regulatoryBasis ?? null, input.dueDate ?? null, userId],
  );
  const id = Number(rows[0].id);

  const provenanceLinkIds: number[] = [];
  if (input.sourceInteractionId != null) {
    const link = await linkProvenanceTx(client, { organizationId: orgId, userId, sourceType: 'ha_interaction', sourceId: input.sourceInteractionId, targetType: 'regulatory_commitment', targetId: id, linkRole: 'creates' });
    provenanceLinkIds.push(link.id);
  }
  if (input.submissionId != null) {
    const link = await linkProvenanceTx(client, { organizationId: orgId, userId, sourceType: 'regulatory_commitment', sourceId: id, targetType: 'submission_module1', targetId: input.submissionId, linkRole: 'supports' });
    provenanceLinkIds.push(link.id);
  }
  return { id, provenanceLinkIds };
}

export async function fulfillCommitmentTx(client: Queryable, orgId: number, id: number, fulfilledDate: string | null): Promise<void> {
  const r = await client.query(
    `UPDATE regulatory_commitments
        SET status = 'fulfilled', fulfilled_date = COALESCE($3, CURRENT_DATE), updated_at = now()
      WHERE id = $1 AND organization_id = $2 AND deleted_at IS NULL AND status NOT IN ('fulfilled','waived','released')`,
    [id, orgId, fulfilledDate],
  );
  if ((r as any).rowCount === 0) throw new HaError('INVALID_STATE', 'Commitment not found, or already in a terminal state.');
}

export interface MilestoneInput {
  title: string;
  dueDate?: string | null;
}

export async function addMilestoneTx(client: Queryable, orgId: number, userId: number, commitmentId: number, m: MilestoneInput): Promise<{ id: number }> {
  const owner = await client.query(
    `SELECT id FROM regulatory_commitments WHERE id = $1 AND organization_id = $2 AND deleted_at IS NULL LIMIT 1`,
    [commitmentId, orgId],
  );
  if (owner.rows.length === 0) throw new HaError('NOT_FOUND', 'Commitment not found for this organization.');
  const { rows } = await client.query(
    `INSERT INTO commitment_milestones (organization_id, commitment_id, title, due_date, status, created_by)
     VALUES ($1,$2,$3,$4,'pending',$5) RETURNING id`,
    [orgId, commitmentId, m.title, m.dueDate ?? null, userId],
  );
  return { id: Number(rows[0].id) };
}

// ─── Reads ───────────────────────────────────────────────────────────────────

export async function listInteractions(orgId: number, submissionId?: number): Promise<any[]> {
  const params: unknown[] = [orgId];
  let sql = `SELECT id, submission_id, interaction_type, agency, title, status, requested_date, scheduled_date, held_date
               FROM ha_interactions WHERE organization_id = $1 AND deleted_at IS NULL`;
  if (submissionId != null) { params.push(submissionId); sql += ` AND submission_id = $2`; }
  sql += ` ORDER BY COALESCE(scheduled_date, requested_date) DESC NULLS LAST, id DESC`;
  const { rows } = await pool.query(sql, params);
  return rows;
}

export async function listCommitments(orgId: number, submissionId?: number): Promise<any[]> {
  const params: unknown[] = [orgId];
  let sql = `SELECT id, submission_id, source_interaction_id, commitment_type, description, status, regulatory_basis, due_date, fulfilled_date
               FROM regulatory_commitments WHERE organization_id = $1 AND deleted_at IS NULL`;
  if (submissionId != null) { params.push(submissionId); sql += ` AND submission_id = $2`; }
  sql += ` ORDER BY due_date ASC NULLS LAST, id`;
  const { rows } = await pool.query(sql, params);
  return rows;
}

export async function listQuestionsByInteraction(orgId: number, interactionId: number): Promise<any[]> {
  const { rows } = await pool.query(
    `SELECT id, question_number, question_text, sponsor_position, agency_response, agreement_reached
       FROM ha_interaction_questions WHERE interaction_id = $1 AND organization_id = $2 AND deleted_at IS NULL ORDER BY question_number NULLS LAST, id`,
    [interactionId, orgId],
  );
  return rows;
}

export async function listCommitmentsByInteraction(orgId: number, interactionId: number): Promise<any[]> {
  const { rows } = await pool.query(
    `SELECT id, commitment_type, description, status, due_date, fulfilled_date
       FROM regulatory_commitments WHERE source_interaction_id = $1 AND organization_id = $2 AND deleted_at IS NULL ORDER BY due_date ASC NULLS LAST, id`,
    [interactionId, orgId],
  );
  return rows;
}

/**
 * Orchestration: assemble a pre-meeting package for an interaction — readiness,
 * open questions, and the commitments that originated from it. Read-only.
 */
export async function prepareMeetingPackage(orgId: number, interactionId: number) {
  const { assembleMeetingPackage } = await import('./ha-logic');
  const r = await getInteractionReadinessInput(pool as any, orgId, interactionId);
  const questions = await listQuestionsByInteraction(orgId, interactionId);
  const commitments = await listCommitmentsByInteraction(orgId, interactionId);
  const today = new Date().toISOString().slice(0, 10);
  const pkg = assembleMeetingPackage(
    r as any,
    questions.map((q) => ({ questionNumber: q.question_number, questionText: q.question_text, agreementReached: q.agreement_reached })),
    commitments.map((c) => ({ status: c.status, dueDate: c.due_date, fulfilledDate: c.fulfilled_date })),
    today,
  );
  return { interactionId, interactionType: r.interactionType, status: r.status, ...pkg };
}

export async function getInteractionReadinessInput(client: Queryable, orgId: number, id: number): Promise<{ interactionType: string; status: string; hasBriefingBook: boolean; questionCount: number; scheduledDate: string | null }> {
  const { rows } = await client.query(
    `SELECT interaction_type, status, briefing_book_artifact_id, scheduled_date FROM ha_interactions WHERE id = $1 AND organization_id = $2 AND deleted_at IS NULL LIMIT 1`,
    [id, orgId],
  );
  if (rows.length === 0) throw new HaError('NOT_FOUND', 'Interaction not found for this organization.');
  const { rows: qc } = await client.query(
    `SELECT COUNT(*)::int AS n FROM ha_interaction_questions WHERE interaction_id = $1 AND organization_id = $2 AND deleted_at IS NULL`,
    [id, orgId],
  );
  return {
    interactionType: rows[0].interaction_type,
    status: rows[0].status,
    hasBriefingBook: rows[0].briefing_book_artifact_id != null,
    questionCount: Number(qc[0].n),
    scheduledDate: rows[0].scheduled_date,
  };
}
