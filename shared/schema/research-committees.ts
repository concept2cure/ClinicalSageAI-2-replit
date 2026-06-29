/**
 * Research Committee Governance — IACUC / IRB / IBC (Capability C2C-16)
 *
 * The committee layer the protocol modules were missing: standing committee
 * membership with stakeholder roles, convened meetings with quorum, agenda items
 * (one per protocol under review), and per-member polling/voting that resolves to
 * a recorded determination. Role-specific privileges are enforced through the
 * platform RBAC engine (server/services/governance/permissions.ts can()/whoCan());
 * approval (finalize) additionally requires current CITI training.
 *
 * Grounded in PHS Policy IV.A/IV.C and the Animal Welfare Act 9 CFR 2.31 (IACUC
 * composition, quorum, and majority vote) and the revised Common Rule 45 CFR
 * 46.107–46.108 (IRB composition: a nonscientist and a non-affiliated member;
 * quorum = majority of members; approval = majority of members present).
 * Conventions match the platform; status/type columns are CHECK-constrained.
 * Mutations are governed + audited.
 *
 * @module shared/schema/research-committees
 */

import { boolean, date, index, integer, pgTable, serial, text, timestamp, uniqueIndex } from 'drizzle-orm/pg-core';
import { organizations, users } from '../schema';
import { researchPersonnel } from './research-compliance';

export type CommitteeType = 'iacuc' | 'irb' | 'ibc';
export type CommitteeMemberRole =
  | 'chair' | 'vice_chair' | 'member' | 'veterinarian' | 'nonscientist' | 'community_member' | 'coordinator' | 'administrator';
export type CommitteeMemberStatus = 'active' | 'inactive';
export type MeetingStatus = 'scheduled' | 'convened' | 'adjourned' | 'cancelled';
export type ProtocolKind = 'iacuc_protocol' | 'irb_submission';
export type AgendaItemStatus = 'pending' | 'under_discussion' | 'voted' | 'deferred' | 'tabled';
export type AgendaOutcome = 'approved' | 'approved_with_modifications' | 'disapproved' | 'tabled';
export type CommitteeVote = 'approve' | 'approve_with_modifications' | 'disapprove' | 'abstain' | 'recuse';

// ─── Committee members ───────────────────────────────────────────────────────

export const committeeMembers = pgTable(
  'committee_members',
  {
    id: serial('id').primaryKey(),
    organizationId: integer('organization_id').notNull().references(() => organizations.id),
    committeeType: text('committee_type').$type<CommitteeType>().notNull(),
    /** Optional link to a platform user (for role-gated privileges via RBAC). */
    userId: integer('user_id').references(() => users.id),
    /** Optional link to the research-personnel roster (CITI training lives there). */
    personnelId: integer('personnel_id').references(() => researchPersonnel.id),
    memberName: text('member_name').notNull(),
    role: text('role').$type<CommitteeMemberRole>().notNull().default('member'),
    /** Voting members count toward quorum and the determination tally. */
    votingMember: boolean('voting_member').notNull().default(true),
    /** Scientist vs. nonscientist — IRB must convene at least one nonscientist (45 CFR 46.107(c)). */
    scientist: boolean('scientist').notNull().default(true),
    /** Affiliated with the institution — IRB must include a non-affiliated member (45 CFR 46.107(d)). */
    affiliated: boolean('affiliated').notNull().default(true),
    status: text('status').$type<CommitteeMemberStatus>().notNull().default('active'),
    startDate: date('start_date'),
    endDate: date('end_date'),
    createdBy: integer('created_by').notNull().references(() => users.id),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow(),
    deletedAt: timestamp('deleted_at', { withTimezone: true }),
  },
  (t) => ({
    orgIdx: index('idx_committee_members_org').on(t.organizationId),
    committeeIdx: index('idx_committee_members_committee').on(t.organizationId, t.committeeType),
  }),
);

export type CommitteeMember = typeof committeeMembers.$inferSelect;
export type NewCommitteeMember = typeof committeeMembers.$inferInsert;

// ─── Committee meetings ──────────────────────────────────────────────────────

export const committeeMeetings = pgTable(
  'committee_meetings',
  {
    id: serial('id').primaryKey(),
    organizationId: integer('organization_id').notNull().references(() => organizations.id),
    committeeType: text('committee_type').$type<CommitteeType>().notNull(),
    title: text('title').notNull(),
    meetingDate: date('meeting_date'),
    status: text('status').$type<MeetingStatus>().notNull().default('scheduled'),
    /** Quorum threshold snapshotted at convene = majority of active voting members. */
    quorumRequired: integer('quorum_required'),
    /** Count of voting members recorded present at convene. */
    membersConvened: integer('members_convened').notNull().default(0),
    quorumMet: boolean('quorum_met').notNull().default(false),
    convenedAt: timestamp('convened_at', { withTimezone: true }),
    adjournedAt: timestamp('adjourned_at', { withTimezone: true }),
    createdBy: integer('created_by').notNull().references(() => users.id),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow(),
    deletedAt: timestamp('deleted_at', { withTimezone: true }),
  },
  (t) => ({
    orgIdx: index('idx_committee_meetings_org').on(t.organizationId),
    committeeIdx: index('idx_committee_meetings_committee').on(t.organizationId, t.committeeType),
  }),
);

export type CommitteeMeeting = typeof committeeMeetings.$inferSelect;
export type NewCommitteeMeeting = typeof committeeMeetings.$inferInsert;

// ─── Meeting attendance (who is present → quorum + voting eligibility) ────────

export const committeeAttendance = pgTable(
  'committee_attendance',
  {
    id: serial('id').primaryKey(),
    organizationId: integer('organization_id').notNull().references(() => organizations.id),
    meetingId: integer('meeting_id').notNull().references(() => committeeMeetings.id),
    memberId: integer('member_id').notNull().references(() => committeeMembers.id),
    present: boolean('present').notNull().default(true),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow(),
  },
  (t) => ({
    orgIdx: index('idx_committee_attendance_org').on(t.organizationId),
    meetingMemberIdx: uniqueIndex('uq_committee_attendance_meeting_member').on(t.meetingId, t.memberId),
  }),
);

export type CommitteeAttendance = typeof committeeAttendance.$inferSelect;
export type NewCommitteeAttendance = typeof committeeAttendance.$inferInsert;

// ─── Agenda items (one protocol under review per item) ───────────────────────

export const committeeAgendaItems = pgTable(
  'committee_agenda_items',
  {
    id: serial('id').primaryKey(),
    organizationId: integer('organization_id').notNull().references(() => organizations.id),
    meetingId: integer('meeting_id').notNull().references(() => committeeMeetings.id),
    committeeType: text('committee_type').$type<CommitteeType>().notNull(),
    /** Which protocol table the protocolId points at. */
    protocolKind: text('protocol_kind').$type<ProtocolKind>().notNull(),
    /** Soft reference to iacuc_protocols.id or irb_submissions.id (by protocolKind). */
    protocolId: integer('protocol_id').notNull(),
    title: text('title').notNull(),
    reviewType: text('review_type'),
    status: text('status').$type<AgendaItemStatus>().notNull().default('pending'),
    outcome: text('outcome').$type<AgendaOutcome>(),
    determinationRationale: text('determination_rationale'),
    finalizedBy: integer('finalized_by').references(() => users.id),
    finalizedAt: timestamp('finalized_at', { withTimezone: true }),
    createdBy: integer('created_by').notNull().references(() => users.id),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow(),
    deletedAt: timestamp('deleted_at', { withTimezone: true }),
  },
  (t) => ({
    orgIdx: index('idx_committee_agenda_org').on(t.organizationId),
    meetingIdx: index('idx_committee_agenda_meeting').on(t.meetingId),
  }),
);

export type CommitteeAgendaItem = typeof committeeAgendaItems.$inferSelect;
export type NewCommitteeAgendaItem = typeof committeeAgendaItems.$inferInsert;

// ─── Votes (the poll) ────────────────────────────────────────────────────────

export const committeeVotes = pgTable(
  'committee_votes',
  {
    id: serial('id').primaryKey(),
    organizationId: integer('organization_id').notNull().references(() => organizations.id),
    agendaItemId: integer('agenda_item_id').notNull().references(() => committeeAgendaItems.id),
    memberId: integer('member_id').notNull().references(() => committeeMembers.id),
    vote: text('vote').$type<CommitteeVote>().notNull(),
    comment: text('comment'),
    createdBy: integer('created_by').notNull().references(() => users.id),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow(),
  },
  (t) => ({
    orgIdx: index('idx_committee_votes_org').on(t.organizationId),
    agendaIdx: index('idx_committee_votes_agenda').on(t.agendaItemId),
    agendaMemberIdx: uniqueIndex('uq_committee_votes_agenda_member').on(t.agendaItemId, t.memberId),
  }),
);

export type CommitteeVoteRow = typeof committeeVotes.$inferSelect;
export type NewCommitteeVote = typeof committeeVotes.$inferInsert;
