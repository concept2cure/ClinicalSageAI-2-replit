/**
 * Research committee service (Capability C2C-16)
 *
 * Tenant-scoped transaction functions for committee governance: membership,
 * meetings, attendance, agenda items, polling/voting, and the finalized
 * determination. Mutations run inside the caller's transaction with the
 * governed-action ledger. Determinations are computed deterministically by
 * committee-logic.ts; role-specific privileges are enforced at the route via the
 * RBAC engine and finalize additionally requires current CITI training.
 *
 * DB-backed — authored to the platform's governed-CRUD pattern; runtime-verified
 * in a DB-enabled environment.
 *
 * @module server/services/committees/committee-service
 */

import { pool } from '../../db';
import {
  evaluateComposition,
  computeQuorum,
  tallyVotes,
  determineOutcome,
  type CommitteeType,
  type CommitteeVote,
  type CompositionResult,
  type QuorumResult,
  type DeterminationResult,
  type VoteTally,
} from './committee-logic';

interface Queryable {
  query: (sql: string, params?: unknown[]) => Promise<{ rows: any[] }>;
}

export class CommitteeError extends Error {
  constructor(public code: 'NOT_FOUND' | 'INVALID_STATE' | 'BAD_INPUT' | 'NOT_TRAINED', message: string) {
    super(message);
    this.name = 'CommitteeError';
  }
}

const COMMITTEE_TYPES = ['iacuc', 'irb', 'ibc'];
const MEMBER_ROLES = ['chair', 'vice_chair', 'member', 'veterinarian', 'nonscientist', 'community_member', 'coordinator', 'administrator'];
const VOTES = ['approve', 'approve_with_modifications', 'disapprove', 'abstain', 'recuse'];

// ─── Members ─────────────────────────────────────────────────────────────────

export interface MemberInput {
  committeeType: CommitteeType;
  memberName: string;
  role?: string;
  userId?: number | null;
  personnelId?: number | null;
  votingMember?: boolean;
  scientist?: boolean;
  affiliated?: boolean;
  startDate?: string | null;
}

export async function addCommitteeMemberTx(client: Queryable, orgId: number, userId: number, input: MemberInput): Promise<{ id: number }> {
  if (!COMMITTEE_TYPES.includes(input.committeeType)) throw new CommitteeError('BAD_INPUT', `Invalid committee_type "${input.committeeType}".`);
  if (input.role && !MEMBER_ROLES.includes(input.role)) throw new CommitteeError('BAD_INPUT', `Invalid role "${input.role}".`);
  if (input.personnelId != null) {
    const p = await client.query(`SELECT id FROM research_personnel WHERE id = $1 AND organization_id = $2 AND deleted_at IS NULL LIMIT 1`, [input.personnelId, orgId]);
    if (p.rows.length === 0) throw new CommitteeError('NOT_FOUND', 'Research-personnel record not found for this organization.');
  }
  const { rows } = await client.query(
    `INSERT INTO committee_members (organization_id, committee_type, user_id, personnel_id, member_name, role, voting_member, scientist, affiliated, status, start_date, created_by)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,'active',$10,$11) RETURNING id`,
    [orgId, input.committeeType, input.userId ?? null, input.personnelId ?? null, input.memberName, input.role ?? 'member',
      input.votingMember ?? true, input.scientist ?? true, input.affiliated ?? true, input.startDate ?? null, userId],
  );
  return { id: Number(rows[0].id) };
}

export async function listCommitteeMembers(orgId: number, committeeType?: string): Promise<any[]> {
  const params: unknown[] = [orgId];
  let sql = `SELECT id, committee_type, user_id, personnel_id, member_name, role, voting_member, scientist, affiliated, status, start_date, end_date
               FROM committee_members WHERE organization_id = $1 AND deleted_at IS NULL`;
  if (committeeType) { params.push(committeeType); sql += ` AND committee_type = $2`; }
  sql += ` ORDER BY committee_type, role, member_name`;
  return (await pool.query(sql, params)).rows;
}

/** Read-only composition verdict for a committee (uses the pure evaluateComposition). */
export async function getCompositionStatus(orgId: number, committeeType: CommitteeType): Promise<CompositionResult> {
  const { rows } = await pool.query(
    `SELECT voting_member, scientist, affiliated, role, status FROM committee_members
      WHERE organization_id = $1 AND committee_type = $2 AND deleted_at IS NULL`,
    [orgId, committeeType],
  );
  return evaluateComposition(committeeType, rows.map((r) => ({ votingMember: r.voting_member, scientist: r.scientist, affiliated: r.affiliated, role: r.role, status: r.status })));
}

// ─── Meetings ────────────────────────────────────────────────────────────────

export async function createMeetingTx(client: Queryable, orgId: number, userId: number, input: { committeeType: CommitteeType; title: string; meetingDate?: string | null }): Promise<{ id: number }> {
  if (!COMMITTEE_TYPES.includes(input.committeeType)) throw new CommitteeError('BAD_INPUT', `Invalid committee_type "${input.committeeType}".`);
  const { rows } = await client.query(
    `INSERT INTO committee_meetings (organization_id, committee_type, title, meeting_date, status, created_by)
     VALUES ($1,$2,$3,$4,'scheduled',$5) RETURNING id`,
    [orgId, input.committeeType, input.title, input.meetingDate ?? null, userId],
  );
  return { id: Number(rows[0].id) };
}

async function loadMeeting(client: Queryable, orgId: number, meetingId: number): Promise<{ committeeType: CommitteeType; status: string }> {
  const m = await client.query(`SELECT committee_type, status FROM committee_meetings WHERE id = $1 AND organization_id = $2 AND deleted_at IS NULL LIMIT 1`, [meetingId, orgId]);
  if (m.rows.length === 0) throw new CommitteeError('NOT_FOUND', 'Meeting not found for this organization.');
  return { committeeType: m.rows[0].committee_type, status: m.rows[0].status };
}

/**
 * Convene a meeting: record attendance for the present members and compute quorum
 * from the standing committee's active voting members (a majority present, plus a
 * nonscientist for the IRB). Snapshots quorum onto the meeting.
 */
export async function conveneMeetingTx(client: Queryable, orgId: number, meetingId: number, presentMemberIds: number[]): Promise<QuorumResult & { membersConvened: number }> {
  const meeting = await loadMeeting(client, orgId, meetingId);
  if (meeting.status === 'adjourned' || meeting.status === 'cancelled') throw new CommitteeError('INVALID_STATE', `Meeting is ${meeting.status}.`);

  const totals = await client.query(
    `SELECT count(*) FILTER (WHERE voting_member) AS voting_total FROM committee_members
      WHERE organization_id = $1 AND committee_type = $2 AND status = 'active' AND deleted_at IS NULL`,
    [orgId, meeting.committeeType],
  );
  const votingMembersTotal = Number(totals.rows[0].voting_total);

  // Record attendance (idempotent on (meeting, member)).
  const present = await client.query(
    `SELECT id, voting_member, scientist, role FROM committee_members
      WHERE organization_id = $1 AND committee_type = $2 AND status = 'active' AND deleted_at IS NULL AND id = ANY($3::int[])`,
    [orgId, meeting.committeeType, presentMemberIds],
  );
  for (const m of present.rows) {
    await client.query(
      `INSERT INTO committee_attendance (organization_id, meeting_id, member_id, present)
       VALUES ($1,$2,$3,true)
       ON CONFLICT (meeting_id, member_id) DO UPDATE SET present = true`,
      [orgId, meetingId, m.id],
    );
  }
  const votingPresent = present.rows.filter((m) => m.voting_member).length;
  const nonscientistPresent = present.rows.some((m) => m.scientist === false);
  const veterinarianPresent = present.rows.some((m) => m.role === 'veterinarian');

  const quorum = computeQuorum({ committeeType: meeting.committeeType, votingMembersTotal, votingPresent, nonscientistPresent, veterinarianPresent });

  await client.query(
    `UPDATE committee_meetings SET status = 'convened', quorum_required = $3, members_convened = $4, quorum_met = $5, convened_at = now(), updated_at = now()
      WHERE id = $1 AND organization_id = $2`,
    [meetingId, orgId, quorum.quorumRequired, votingPresent, quorum.quorumMet],
  );
  return { ...quorum, membersConvened: votingPresent };
}

// ─── Agenda items ────────────────────────────────────────────────────────────

export interface AgendaItemInput {
  protocolKind: 'iacuc_protocol' | 'irb_submission';
  protocolId: number;
  title: string;
  reviewType?: string | null;
}

export async function addAgendaItemTx(client: Queryable, orgId: number, userId: number, meetingId: number, input: AgendaItemInput): Promise<{ id: number }> {
  const meeting = await loadMeeting(client, orgId, meetingId);
  // Validate the referenced protocol exists in its table and belongs to the org.
  const table = input.protocolKind === 'iacuc_protocol' ? 'iacuc_protocols' : 'irb_submissions';
  const p = await client.query(`SELECT id FROM ${table} WHERE id = $1 AND organization_id = $2 AND deleted_at IS NULL LIMIT 1`, [input.protocolId, orgId]);
  if (p.rows.length === 0) throw new CommitteeError('NOT_FOUND', `${input.protocolKind} ${input.protocolId} not found for this organization.`);

  const { rows } = await client.query(
    `INSERT INTO committee_agenda_items (organization_id, meeting_id, committee_type, protocol_kind, protocol_id, title, review_type, status, created_by)
     VALUES ($1,$2,$3,$4,$5,$6,$7,'pending',$8) RETURNING id`,
    [orgId, meetingId, meeting.committeeType, input.protocolKind, input.protocolId, input.title, input.reviewType ?? null, userId],
  );
  return { id: Number(rows[0].id) };
}

// ─── Votes (the poll) ────────────────────────────────────────────────────────

/** Cast (or change) a member's vote on an agenda item. Requires a convened meeting and an active voting member who is present. */
export async function castVoteTx(client: Queryable, orgId: number, userId: number, agendaItemId: number, memberId: number, vote: CommitteeVote, comment?: string | null): Promise<void> {
  if (!VOTES.includes(vote)) throw new CommitteeError('BAD_INPUT', `Invalid vote "${vote}".`);
  const item = await client.query(
    `SELECT a.meeting_id, a.status AS item_status, m.status AS meeting_status
       FROM committee_agenda_items a JOIN committee_meetings m ON m.id = a.meeting_id
      WHERE a.id = $1 AND a.organization_id = $2 AND a.deleted_at IS NULL LIMIT 1`,
    [agendaItemId, orgId],
  );
  if (item.rows.length === 0) throw new CommitteeError('NOT_FOUND', 'Agenda item not found for this organization.');
  if (item.rows[0].meeting_status !== 'convened') throw new CommitteeError('INVALID_STATE', 'Voting requires a convened meeting.');
  if (item.rows[0].item_status === 'voted') throw new CommitteeError('INVALID_STATE', 'This item is already determined.');

  const meetingId = item.rows[0].meeting_id;
  const mem = await client.query(
    `SELECT cm.id FROM committee_members cm
       JOIN committee_attendance att ON att.member_id = cm.id AND att.meeting_id = $3 AND att.present = true
      WHERE cm.id = $1 AND cm.organization_id = $2 AND cm.status = 'active' AND cm.voting_member = true AND cm.deleted_at IS NULL LIMIT 1`,
    [memberId, orgId, meetingId],
  );
  if (mem.rows.length === 0) throw new CommitteeError('INVALID_STATE', 'Voter must be an active voting member recorded present at this meeting.');

  await client.query(
    `INSERT INTO committee_votes (organization_id, agenda_item_id, member_id, vote, comment, created_by)
     VALUES ($1,$2,$3,$4,$5,$6)
     ON CONFLICT (agenda_item_id, member_id) DO UPDATE SET vote = EXCLUDED.vote, comment = EXCLUDED.comment, updated_at = now()`,
    [orgId, agendaItemId, memberId, vote, comment ?? null, userId],
  );
  await client.query(`UPDATE committee_agenda_items SET status = 'under_discussion', updated_at = now() WHERE id = $1 AND organization_id = $2 AND status = 'pending'`, [agendaItemId, orgId]);
}

async function loadTally(client: Queryable, orgId: number, agendaItemId: number): Promise<VoteTally> {
  const v = await client.query(`SELECT vote FROM committee_votes WHERE agenda_item_id = $1 AND organization_id = $2`, [agendaItemId, orgId]);
  return tallyVotes(v.rows.map((r) => ({ vote: r.vote as CommitteeVote })));
}

/**
 * Finalize an agenda item — tally the poll and record the deterministic
 * determination. Gated: a convened meeting with quorum (otherwise the item is
 * tabled with a reason). The actor's training is checked at the route.
 */
export async function finalizeAgendaItemTx(client: Queryable, orgId: number, userId: number, agendaItemId: number): Promise<DeterminationResult & { tally: VoteTally }> {
  const item = await client.query(
    `SELECT a.committee_type, a.status AS item_status, m.status AS meeting_status, m.quorum_met
       FROM committee_agenda_items a JOIN committee_meetings m ON m.id = a.meeting_id
      WHERE a.id = $1 AND a.organization_id = $2 AND a.deleted_at IS NULL LIMIT 1`,
    [agendaItemId, orgId],
  );
  if (item.rows.length === 0) throw new CommitteeError('NOT_FOUND', 'Agenda item not found for this organization.');
  if (item.rows[0].item_status === 'voted') throw new CommitteeError('INVALID_STATE', 'This item is already determined.');
  if (item.rows[0].meeting_status !== 'convened') throw new CommitteeError('INVALID_STATE', 'The meeting must be convened to finalize.');

  const tally = await loadTally(client, orgId, agendaItemId);
  const determination = determineOutcome({ committeeType: item.rows[0].committee_type, quorumMet: item.rows[0].quorum_met, tally });

  await client.query(
    `UPDATE committee_agenda_items SET status = 'voted', outcome = $3, determination_rationale = $4, finalized_by = $5, finalized_at = now(), updated_at = now()
      WHERE id = $1 AND organization_id = $2`,
    [agendaItemId, orgId, determination.outcome, determination.rationale, userId],
  );
  return { ...determination, tally };
}

/**
 * CITI training gate for the finalizing actor. IRB finalize requires current
 * citi_human_subjects; IACUC requires current citi_animal. Returns the verdict;
 * the route enforces it (throws NOT_TRAINED). Soft-passes when the actor has no
 * linked personnel record (external chair) — the audit trail still records who.
 */
export async function getActorTrainingStatus(orgId: number, userId: number, committeeType: CommitteeType): Promise<{ trained: boolean; required: string | null; reason: string }> {
  const required = committeeType === 'irb' ? 'citi_human_subjects' : committeeType === 'iacuc' ? 'citi_animal' : null;
  if (!required) return { trained: true, required: null, reason: 'No CITI training requirement for this committee type.' };
  const personnel = await pool.query(`SELECT id FROM research_personnel WHERE user_id = $1 AND organization_id = $2 AND deleted_at IS NULL LIMIT 1`, [userId, orgId]);
  if (personnel.rows.length === 0) return { trained: true, required, reason: 'Actor is not on the research-personnel roster; training gate not applicable.' };
  const personnelId = personnel.rows[0].id;
  const tr = await pool.query(
    `SELECT 1 FROM personnel_training
      WHERE personnel_id = $1 AND organization_id = $2 AND training_type = $3 AND deleted_at IS NULL
        AND (expires_date IS NULL OR expires_date >= CURRENT_DATE) AND completed_date IS NOT NULL LIMIT 1`,
    [personnelId, orgId, required],
  );
  const trained = tr.rows.length > 0;
  return { trained, required, reason: trained ? `Current ${required} training on file.` : `Required ${required} training is missing or expired.` };
}

// ─── Reads ───────────────────────────────────────────────────────────────────

export async function listMeetings(orgId: number, committeeType?: string): Promise<any[]> {
  const params: unknown[] = [orgId];
  let sql = `SELECT id, committee_type, title, meeting_date, status, quorum_required, members_convened, quorum_met, convened_at
               FROM committee_meetings WHERE organization_id = $1 AND deleted_at IS NULL`;
  if (committeeType) { params.push(committeeType); sql += ` AND committee_type = $2`; }
  sql += ` ORDER BY meeting_date DESC NULLS LAST, id DESC`;
  return (await pool.query(sql, params)).rows;
}

export async function getMeeting(orgId: number, meetingId: number): Promise<any | null> {
  const m = await pool.query(`SELECT * FROM committee_meetings WHERE id = $1 AND organization_id = $2 AND deleted_at IS NULL LIMIT 1`, [meetingId, orgId]);
  if (m.rows.length === 0) return null;
  const agenda = await pool.query(
    `SELECT id, protocol_kind, protocol_id, title, review_type, status, outcome, determination_rationale, finalized_at
       FROM committee_agenda_items WHERE meeting_id = $1 AND organization_id = $2 AND deleted_at IS NULL ORDER BY id`,
    [meetingId, orgId],
  );
  const agendaWithVotes = [];
  for (const a of agenda.rows) {
    const tally = await loadTally(pool, orgId, a.id);
    agendaWithVotes.push({ ...a, tally });
  }
  const attendance = await pool.query(
    `SELECT att.member_id, cm.member_name, cm.role, cm.voting_member FROM committee_attendance att
       JOIN committee_members cm ON cm.id = att.member_id
      WHERE att.meeting_id = $1 AND att.organization_id = $2 AND att.present = true ORDER BY cm.member_name`,
    [meetingId, orgId],
  );
  return { ...m.rows[0], agenda: agendaWithVotes, attendance: attendance.rows };
}

/**
 * Multi-protocol portfolio: every IACUC protocol and IRB submission for the org
 * with its status, expiration, and any pending committee agenda — the "manage
 * many protocols" cockpit. Read-only.
 */
export async function getProtocolPortfolio(orgId: number): Promise<{ iacuc: any[]; irb: any[]; pendingAgenda: any[] }> {
  const iacuc = await pool.query(
    `SELECT id, protocol_number, title, pain_category, review_type, status, approval_date, expiration_date
       FROM iacuc_protocols WHERE organization_id = $1 AND deleted_at IS NULL ORDER BY expiration_date NULLS LAST, id DESC`,
    [orgId],
  );
  const irb = await pool.query(
    `SELECT id, protocol_number, title, review_type, risk_level, status, approval_date, expiration_date
       FROM irb_submissions WHERE organization_id = $1 AND deleted_at IS NULL ORDER BY expiration_date NULLS LAST, id DESC`,
    [orgId],
  );
  const pending = await pool.query(
    `SELECT a.id AS agenda_item_id, a.committee_type, a.protocol_kind, a.protocol_id, a.title, a.status, a.outcome, m.id AS meeting_id, m.title AS meeting_title, m.meeting_date
       FROM committee_agenda_items a JOIN committee_meetings m ON m.id = a.meeting_id
      WHERE a.organization_id = $1 AND a.deleted_at IS NULL AND a.status <> 'voted' ORDER BY m.meeting_date NULLS LAST, a.id`,
    [orgId],
  );
  return { iacuc: iacuc.rows, irb: irb.rows, pendingAgenda: pending.rows };
}
