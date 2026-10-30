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
import { fulfilmentEvidenceRefusal, fulfilmentRule } from './ha-logic';
import { HA_INTERACTION_DATE_FOR, HA_INTERACTION_STATUS_LABEL, haInteractionMoveRefusal, type HaInteractionStatus } from '../../../shared/regulatory/ha-interaction-lifecycle';
import type {
  CommitmentType,
  HaAgency,
  HaInteractionType,
} from '../../../shared/schema/ha-interactions';

interface Queryable {
  query: (sql: string, params?: unknown[]) => Promise<{ rows: any[] }>;
}

/**
 * A coded refusal, said as a sentence for the person. The fulfilment codes
 * (2026-10-19) are answered with their statuses by FULFILMENT_CODE_STATUS
 * (commitment-fulfilment.ts) on both doors.
 */
export type HaErrorCode =
  | 'NOT_FOUND' | 'INVALID_STATE' | 'BAD_INPUT'
  | 'EVIDENCE_REQUIRED' | 'FULFILMENT_DATE_REQUIRED' | 'SIGNATURE_NOT_TAKEN'
  | 'SEQUENCE_NOT_FOUND' | 'SEQUENCE_NOT_FILED' | 'SEQUENCE_OTHER_SUBMISSION'
  | 'VAULT_VERSION_NOT_FOUND' | 'VAULT_VERSION_UNHASHED' | 'VAULT_VERSION_WITHDRAWN' | 'VAULT_TENANT_RECONCILIATION_REQUIRED'
  | 'PROJECT_NOT_LINKED' | 'EVIDENCE_ACCESS_UNAVAILABLE';

export class HaError extends Error {
  constructor(public code: HaErrorCode, message: string) {
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
  // A meeting names a submission of this organisation or none. The foreign key
  // alone admits any submission's id, another tenant's included.
  if (input.submissionId != null) {
    const owned = await client.query(`SELECT 1 FROM submissions WHERE id = $1 AND organization_id = $2 AND deleted_at IS NULL LIMIT 1`, [input.submissionId, orgId]);
    if (!owned.rows.length) throw new HaError('NOT_FOUND', 'That submission is not one of this organisation\'s. Nothing was recorded.');
  }
  const { rows } = await client.query(
    `INSERT INTO ha_interactions
       (organization_id, submission_id, interaction_type, agency, title, objective, status, requested_date, scheduled_date, created_by)
     VALUES ($1,$2,$3,$4,$5,$6,'planned',$7,$8,$9) RETURNING id`,
    [orgId, input.submissionId ?? null, input.interactionType, input.agency, input.title, input.objective ?? null, input.requestedDate ?? null, input.scheduledDate ?? null, userId],
  );
  return { id: Number(rows[0].id) };
}

/**
 * Move a meeting along its one-way lifecycle (shared/regulatory/ha-interaction-lifecycle.ts),
 * read under lock: a move the lifecycle does not allow is refused, and a move
 * that records a date (scheduled, held, minutes received) needs it.
 */
export async function updateInteractionStatusTx(client: Queryable, orgId: number, id: number, status: string, dates: Record<string, string | null | undefined> = {}): Promise<void> {
  const current = await client.query(
    `SELECT status, scheduled_date, submission_id FROM ha_interactions WHERE id = $1 AND organization_id = $2 AND deleted_at IS NULL FOR UPDATE`, [id, orgId]);
  if (!current.rows.length) throw new HaError('NOT_FOUND', 'Interaction not found for this organization.');
  const refusal = haInteractionMoveRefusal(String(current.rows[0].status), status);
  if (refusal) throw new HaError('INVALID_STATE', `${refusal} Nothing was changed.`);
  const dateKey = HA_INTERACTION_DATE_FOR[status as HaInteractionStatus];
  const keptSchedule = dateKey === 'scheduledDate' && current.rows[0].scheduled_date != null;
  if (dateKey && !dates[dateKey] && !keptSchedule) {
    throw new HaError('BAD_INPUT', `Moving to ${HA_INTERACTION_STATUS_LABEL[status as HaInteractionStatus].toLowerCase()} records its date. Give the date. Nothing was changed.`);
  }
  const minutesEventId = dates.minutesEventId ?? null;
  if (minutesEventId) await refuseMinutesLetter(client, orgId, status, current.rows[0].submission_id, minutesEventId);
  await client.query(
    `UPDATE ha_interactions SET
        status = $3,
        held_date = COALESCE($4, held_date),
        scheduled_date = COALESCE($5, scheduled_date),
        minutes_received_date = COALESCE($6, minutes_received_date),
        minutes_event_id = COALESCE($7, minutes_event_id),
        updated_at = now()
      WHERE id = $1 AND organization_id = $2 AND deleted_at IS NULL`,
    [id, orgId, status, dates.heldDate ?? null, dates.scheduledDate ?? null, dates.minutesReceivedDate ?? null, minutesEventId],
  );
}

/**
 * The minutes a meeting names (P-39 step 4c) are an inbox letter of this
 * organisation, recorded as meeting minutes, in the meeting's own project, and
 * named only when the minutes are received. Its questions carry the agreements
 * and its answers the commitments, by the inbox's own governed paths.
 */
async function refuseMinutesLetter(client: Queryable, orgId: number, status: string, submissionId: unknown, eventId: string): Promise<void> {
  if (status !== 'minutes_received') throw new HaError('BAD_INPUT', 'A minutes letter is named when the minutes are received. Nothing was changed.');
  if (submissionId == null) throw new HaError('BAD_INPUT', 'This meeting names no submission, so it has no project inbox to hold its minutes. Nothing was changed.');
  const { rows } = await client.query(
    `SELECT c.source_type,
            (SELECT CASE WHEN count(*) = 1 THEN min(p.id) END FROM submissions s
               JOIN projects p ON p.regulatory_program_id = s.program_id AND p.organization_id = s.organization_id AND p.status IS DISTINCT FROM 'deleted'
              WHERE s.id = $3 AND s.organization_id = $2) AS meeting_project,
            c.project_id
       FROM concept2cure_agency_communications c WHERE c.event_id = $1 AND c.organization_id = $2`,
    [eventId, orgId, submissionId]);
  const letter = rows[0];
  if (!letter) throw new HaError('NOT_FOUND', 'That letter is not in this organisation\'s inbox. Nothing was changed.');
  if (letter.source_type !== 'meeting_minutes') throw new HaError('BAD_INPUT', 'That letter is not recorded as meeting minutes. Nothing was changed.');
  if (letter.meeting_project == null || Number(letter.project_id) !== Number(letter.meeting_project)) {
    throw new HaError('BAD_INPUT', "That letter is in another project's inbox, not this meeting's. Nothing was changed.");
  }
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
  /**
   * A commitment made in an answer to an agency letter names where it was made
   * (2026-10-18). The caller resolves all three from the question row it read
   * in this organization and project, never from the request body.
   */
  projectId?: number | null;
  sourceCommunicationEventId?: string | null;
  sourceQuestionId?: number | null;
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
       (organization_id, submission_id, source_interaction_id, commitment_type, description, status, regulatory_basis, due_date, created_by,
        project_id, source_communication_event_id, source_question_id)
     VALUES ($1,$2,$3,$4,$5,'open',$6,$7,$8,$9,$10,$11) RETURNING id`,
    [
      orgId, input.submissionId ?? null, input.sourceInteractionId ?? null, input.commitmentType, input.description,
      input.regulatoryBasis ?? null, input.dueDate ?? null, userId,
      input.projectId ?? null, input.sourceCommunicationEventId ?? null, input.sourceQuestionId ?? null,
    ],
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

/**
 * Where a commitment may be reached from (2026-10-18). A commitment made in an
 * answer to a project's agency letter carries that project; it is listed and
 * changed only through that project's routes, behind project admission and
 * the letter's visibility tier (routes/c2c/agency-responses.ts). The
 * organisation's own routes and AnA's tools reach only commitments that belong
 * to no project. Every function below takes the scope and matches it exactly.
 */
export interface CommitmentScope {
  projectId: number | null;
}
export const ORG_LEVEL: CommitmentScope = Object.freeze({ projectId: null });

/** A fulfilment date is a fact about the past (yyyy-mm-dd, a real date). */
export function fulfilmentDateRefusal(fulfilledDate: string | null, today: string): string | null {
  if (fulfilledDate == null) return null;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(fulfilledDate)) return 'Use yyyy-mm-dd for the date fulfilled.';
  const t = new Date(`${fulfilledDate}T00:00:00Z`);
  if (Number.isNaN(t.getTime()) || t.toISOString().slice(0, 10) !== fulfilledDate) return 'That date does not exist.';
  /* One day of slack past the server's UTC day: a person east of UTC is
     already on the next calendar day, and their "today" must be accepted. A
     date beyond that has not happened anywhere. */
  const limit = new Date(`${today}T00:00:00Z`);
  limit.setUTCDate(limit.getUTCDate() + 1);
  if (t.getTime() > limit.getTime()) return 'A commitment cannot be fulfilled on a date that has not happened yet.';
  return null;
}

/** A commitment as a fulfilment reads it: enough to apply the door's visibility and the type's rule. */
export interface CommitmentForFulfilment {
  id: number;
  commitmentType: string;
  status: string;
  submissionId: number | null;
  projectId: number | null;
  description: string;
  sourceCommunicationEventId: string | null;
  /** The visibility tier of the letter it was made in, when it was made in one. */
  visibilityTier: string | null;
}

export const TERMINAL_COMMITMENT_STATUSES: readonly string[] = Object.freeze(['fulfilled', 'waived', 'released']);

function toCommitmentForFulfilment(r: any): CommitmentForFulfilment {
  return {
    id: Number(r.id),
    commitmentType: String(r.commitment_type),
    status: String(r.status),
    submissionId: r.submission_id == null ? null : Number(r.submission_id),
    projectId: r.project_id == null ? null : Number(r.project_id),
    description: String(r.description ?? ''),
    sourceCommunicationEventId: r.source_communication_event_id == null ? null : String(r.source_communication_event_id),
    visibilityTier: r.visibility_tier == null ? null : String(r.visibility_tier),
  };
}

/**
 * One commitment in one scope (CommitmentScope), or null. With `lock`, the row
 * is held FOR UPDATE to the end of the caller's transaction: the fulfilment is
 * decided on the row as it stands. Two literal statements: no SQL text is
 * assembled at run time.
 */
export async function readCommitmentForFulfilment(
  client: Queryable,
  orgId: number,
  id: number,
  scope: CommitmentScope,
  options: { lock: boolean },
): Promise<CommitmentForFulfilment | null> {
  const { rows } = options.lock
    ? await client.query(
        `SELECT rc.id, rc.commitment_type, rc.status, rc.submission_id, rc.project_id, rc.description,
                rc.source_communication_event_id, c.audit_metadata->>'visibilityTier' AS visibility_tier
           FROM regulatory_commitments rc
           LEFT JOIN concept2cure_agency_communications c
             ON c.event_id = rc.source_communication_event_id AND c.organization_id = rc.organization_id
          WHERE rc.id = $1 AND rc.organization_id = $2 AND rc.deleted_at IS NULL AND rc.project_id IS NOT DISTINCT FROM $3
          LIMIT 1
          FOR UPDATE OF rc`,
        [id, orgId, scope.projectId],
      )
    : await client.query(
        `SELECT rc.id, rc.commitment_type, rc.status, rc.submission_id, rc.project_id, rc.description,
                rc.source_communication_event_id, c.audit_metadata->>'visibilityTier' AS visibility_tier
           FROM regulatory_commitments rc
           LEFT JOIN concept2cure_agency_communications c
             ON c.event_id = rc.source_communication_event_id AND c.organization_id = rc.organization_id
          WHERE rc.id = $1 AND rc.organization_id = $2 AND rc.deleted_at IS NULL AND rc.project_id IS NOT DISTINCT FROM $3
          LIMIT 1`,
        [id, orgId, scope.projectId],
      );
  return rows[0] ? toCommitmentForFulfilment(rows[0]) : null;
}

/** What met a commitment, as resolveFulfilmentEvidenceTx found it under lock. */
export interface FulfilmentEvidenceIds {
  sequenceId: number | null;
  vaultDocumentId: string | null;
  /** The Vault version's content_hash, read under lock, lower-case hex. */
  vaultSha256: string | null;
}

/**
 * Record a commitment as fulfilled (C2C-03; P-41, 2026-10-19). The caller has
 * resolved the evidence in this transaction (commitment-fulfilment.ts) and,
 * for a PMR, PMC or REMS, is inside the signing ceremony. Here, on the row
 * locked FOR UPDATE: the date rule, the terminal check, and the type's rule
 * again (a signed type names what met it and its date). The UPDATE writes the
 * evidence, the recorder and the time with the status, in one statement, which
 * is the only update the database lets evidence be written in
 * (regulatory_commitments_fulfilment_record_guard).
 *
 * The date: a signed fulfilment's date is the one the signer was shown, never
 * the server's; CURRENT_DATE stands in only for an unsigned type sent without
 * one.
 */
export async function fulfillCommitmentTx(
  client: Queryable,
  orgId: number,
  id: number,
  input: { fulfilledDate: string | null; evidence: FulfilmentEvidenceIds | null; userId: number },
  scope: CommitmentScope = ORG_LEVEL,
  today: string = new Date().toISOString().slice(0, 10),
): Promise<{ fulfilledDate: string }> {
  const refused = fulfilmentDateRefusal(input.fulfilledDate, today);
  if (refused) throw new HaError('BAD_INPUT', refused);
  const found = await readCommitmentForFulfilment(client, orgId, id, scope, { lock: true });
  if (!found) throw new HaError('NOT_FOUND', 'Commitment not found here.');
  if (TERMINAL_COMMITMENT_STATUSES.includes(found.status)) {
    throw new HaError('INVALID_STATE', 'That commitment is already fulfilled, waived or released; there is nothing to fulfil.');
  }
  const rule = fulfilmentRule(found.commitmentType);
  const evidence = input.evidence ?? { sequenceId: null, vaultDocumentId: null, vaultSha256: null };
  const evidenceRefused = fulfilmentEvidenceRefusal(found.commitmentType, evidence);
  if (evidenceRefused) throw new HaError('EVIDENCE_REQUIRED', evidenceRefused);
  if (rule.dateRequired && input.fulfilledDate == null) {
    throw new HaError('FULFILMENT_DATE_REQUIRED', 'A signed fulfilment names the date the commitment was met. Nothing was recorded.');
  }
  const { rows } = await client.query(
    `UPDATE regulatory_commitments
        SET status = 'fulfilled', fulfilled_date = COALESCE($3::date, CURRENT_DATE),
            fulfilment_sequence_id = $5, fulfilment_vault_document_id = $6::uuid, fulfilment_vault_sha256 = $7,
            fulfilment_recorded_by = $8, fulfilment_recorded_at = now(), updated_at = now()
      WHERE id = $1 AND organization_id = $2 AND project_id IS NOT DISTINCT FROM $4
      RETURNING to_char(fulfilled_date, 'YYYY-MM-DD') AS fulfilled_date`,
    [id, orgId, input.fulfilledDate, scope.projectId, evidence.sequenceId, evidence.vaultDocumentId, evidence.vaultSha256, input.userId],
  );
  return { fulfilledDate: String(rows[0]?.fulfilled_date ?? input.fulfilledDate ?? today) };
}

export interface MilestoneInput {
  title: string;
  dueDate?: string | null;
}

export async function addMilestoneTx(
  client: Queryable,
  orgId: number,
  userId: number,
  commitmentId: number,
  m: MilestoneInput,
  scope: CommitmentScope = ORG_LEVEL,
): Promise<{ id: number }> {
  const owner = await client.query(
    `SELECT id FROM regulatory_commitments
      WHERE id = $1 AND organization_id = $2 AND deleted_at IS NULL AND project_id IS NOT DISTINCT FROM $3 LIMIT 1`,
    [commitmentId, orgId, scope.projectId],
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

/**
 * The organisation's meetings that this reader may see: those that name no
 * submission, and those whose submission's program is in `programIds`, the
 * reader's verified program scope (getCurrentAccessibleProgramScope). A
 * meeting on a program the reader cannot open is not listed.
 */
export async function listInteractions(orgId: number, submissionId: number | undefined, programIds: readonly string[], q: Queryable = pool): Promise<any[]> {
  const params: unknown[] = [orgId, [...programIds]];
  let sql = `SELECT i.id, i.submission_id, i.interaction_type, i.agency, i.title, i.status, i.requested_date, i.scheduled_date, i.held_date,
                    i.minutes_received_date, i.minutes_event_id,
                    (SELECT CASE WHEN count(*) = 1 THEN min(p.id) END FROM projects p
                      WHERE p.regulatory_program_id = s.program_id AND p.organization_id = i.organization_id AND p.status IS DISTINCT FROM 'deleted') AS project_id
               FROM ha_interactions i
               LEFT JOIN submissions s ON s.id = i.submission_id AND s.organization_id = i.organization_id
              WHERE i.organization_id = $1 AND i.deleted_at IS NULL
                AND (i.submission_id IS NULL OR s.program_id::text = ANY($2::text[]))`;
  if (submissionId != null) { params.push(submissionId); sql += ` AND i.submission_id = $3`; }
  sql += ` ORDER BY COALESCE(i.scheduled_date, i.requested_date) DESC NULLS LAST, i.id DESC`;
  const { rows } = await q.query(sql, params);
  return rows;
}

/**
 * The commitments in one scope (CommitmentScope): the organisation's own
 * (project_id IS NULL) by default, or one project's. Each names the letter and
 * question it was made in, and that letter's visibility tier, which the
 * project route applies before anything is shown.
 *
 * Since 2026-10-19 each row also carries its raw fulfilment columns and the
 * recorder's name (public.actor_name, which answers for a former member the
 * users RLS would hide). They are inputs to commitmentsForViewer
 * (commitment-fulfilment.ts), which projects them per reader; no route sends
 * these rows as they are.
 */
export async function listCommitments(
  orgId: number,
  submissionId?: number,
  scope: CommitmentScope = ORG_LEVEL,
  client: Queryable = pool as unknown as Queryable,
): Promise<any[]> {
  // DATE columns read as their own text: node-pg turns a DATE into a local
  // midnight, which a server east or west of UTC serialised as the day before
  // or a timestamp, and the overdue rule (ha-logic toDays) reads yyyy-mm-dd.
  // Two literal statements (with and without the submission filter): no SQL
  // text is assembled at run time.
  const { rows } = submissionId != null
    ? await client.query(
        `SELECT rc.id, rc.submission_id, rc.source_interaction_id, rc.commitment_type, rc.description, rc.status,
            rc.regulatory_basis, to_char(rc.due_date, 'YYYY-MM-DD') AS due_date,
            to_char(rc.fulfilled_date, 'YYYY-MM-DD') AS fulfilled_date,
            rc.project_id, rc.source_communication_event_id, rc.source_question_id,
            c.communication_type AS source_communication_type,
            c.audit_metadata->>'visibilityTier' AS source_visibility_tier,
            q.question_ref AS source_question_ref,
            rc.fulfilment_sequence_id, rc.fulfilment_vault_document_id::text AS fulfilment_vault_document_id,
            rc.fulfilment_vault_sha256, rc.fulfilment_recorded_by, rc.fulfilment_recorded_at,
            recorder.name AS fulfilment_recorded_by_name
       FROM regulatory_commitments rc
       LEFT JOIN concept2cure_agency_communications c
         ON c.event_id = rc.source_communication_event_id AND c.organization_id = rc.organization_id
       LEFT JOIN agency_communication_questions q
         ON q.id = rc.source_question_id AND q.organization_id = rc.organization_id
       LEFT JOIN LATERAL public.actor_name(rc.fulfilment_recorded_by) recorder ON TRUE
      WHERE rc.organization_id = $1 AND rc.deleted_at IS NULL AND rc.project_id IS NOT DISTINCT FROM $2
         AND rc.submission_id = $3
       ORDER BY rc.due_date ASC NULLS LAST, rc.id`,
        [orgId, scope.projectId, submissionId],
      )
    : await client.query(
        `SELECT rc.id, rc.submission_id, rc.source_interaction_id, rc.commitment_type, rc.description, rc.status,
            rc.regulatory_basis, to_char(rc.due_date, 'YYYY-MM-DD') AS due_date,
            to_char(rc.fulfilled_date, 'YYYY-MM-DD') AS fulfilled_date,
            rc.project_id, rc.source_communication_event_id, rc.source_question_id,
            c.communication_type AS source_communication_type,
            c.audit_metadata->>'visibilityTier' AS source_visibility_tier,
            q.question_ref AS source_question_ref,
            rc.fulfilment_sequence_id, rc.fulfilment_vault_document_id::text AS fulfilment_vault_document_id,
            rc.fulfilment_vault_sha256, rc.fulfilment_recorded_by, rc.fulfilment_recorded_at,
            recorder.name AS fulfilment_recorded_by_name
       FROM regulatory_commitments rc
       LEFT JOIN concept2cure_agency_communications c
         ON c.event_id = rc.source_communication_event_id AND c.organization_id = rc.organization_id
       LEFT JOIN agency_communication_questions q
         ON q.id = rc.source_question_id AND q.organization_id = rc.organization_id
       LEFT JOIN LATERAL public.actor_name(rc.fulfilment_recorded_by) recorder ON TRUE
      WHERE rc.organization_id = $1 AND rc.deleted_at IS NULL AND rc.project_id IS NOT DISTINCT FROM $2
       ORDER BY rc.due_date ASC NULLS LAST, rc.id`,
        [orgId, scope.projectId],
      );
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
