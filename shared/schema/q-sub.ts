/**
 * Q-Sub (Pre-Submission) Schema — DRAFT
 *
 * Models FDA CDRH Q-Submission interactions per "Requests for Feedback and
 * Meetings for Medical Device Submissions: The Q-Submission Program" (Sep
 * 2023 rev). Authored from the data shape exercised by the existing UI
 * fixture at client/src/concept2cure/mdx/data/presub.ts so the existing
 * PreSubManager surface can switch from fixtures to live data without
 * redesign.
 *
 * Five core tables:
 *
 *   q_submissions               — one row per Pre-Sub / SIR / SRD / Agreement /
 *                                 Informational
 *   q_sub_meetings              — optional in-person / tele meetings tied to
 *                                 a submission
 *   q_sub_questions             — sponsor questions and FDA responses per
 *                                 Q-Submission
 *   q_sub_commitments           — commitments captured from FDA feedback;
 *                                 each links to a dossier section so the
 *                                 receiving artifact knows what's owed
 *   q_sub_timeline_entries      — append-only event log for the lifecycle
 *
 * Tenant isolation is enforced at the service layer by joining
 * regulatoryPrograms (organization_id) before every read or write — Q-Sub
 * tables themselves carry only program_id, mirroring evidence-sufficiency
 * and post-market.
 */

import { relations, InferSelectModel } from 'drizzle-orm';
import {
  integer,
  pgTable,
  text,
  timestamp,
  uuid,
  varchar,
  boolean,
  index,
  uniqueIndex,
} from 'drizzle-orm/pg-core';
import { createInsertSchema } from 'drizzle-zod';
import { z } from 'zod';

// ─────────────────────────────────────────────────────────────────────────────
// Q-Submissions
// ─────────────────────────────────────────────────────────────────────────────

export const qSubmissions = pgTable(
  'q_submissions',
  {
    id: uuid('id').primaryKey().defaultRandom(),

    // Program / project this Q-Sub belongs to. FK to regulatoryPrograms;
    // string id matches the platform-wide program identity.
    programId: text('program_id').notNull(),

    // FDA-issued Q-number once the submission is acknowledged. Null while
    // still in 'plan' or 'package' stages.
    qNumber: varchar('q_number', { length: 32 }),

    // 'presub' | 'sir' | 'srd' | 'agree' | 'info' — see fixture
    qSubType: varchar('q_sub_type', { length: 16 }).notNull(),

    // Sponsor's working title.
    title: text('title').notNull(),

    // Lifecycle stage: plan → package → submit → await → feedback → integrate.
    stage: varchar('stage', { length: 16 }).notNull().default('plan'),

    // Days at the current stage (denormalized for list rendering).
    daysIn: integer('days_in').notNull().default(0),

    // Filing dates.
    filedAt: timestamp('filed_at', { withTimezone: true }),
    targetDate: timestamp('target_date', { withTimezone: true }),

    // FDA team owning the Q-Sub (display string, e.g. 'OHT2 — Diabetes').
    fdaTeam: text('fda_team'),

    // List-row tone for risk colouring: '' | 'ok' | 'warn' | 'err'.
    tone: varchar('tone', { length: 8 }).default(''),

    // Per-submission narrative shown on the detail surface.
    summary: text('summary'),

    // Audit metadata.
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
    createdBy: text('created_by'),
  },
  (t) => ({
    byProgram:    index('q_submissions_program_idx').on(t.programId),
    byStage:      index('q_submissions_stage_idx').on(t.stage),
    uniqueQNumber: uniqueIndex('q_submissions_qnumber_uq').on(t.qNumber),
  }),
);

// ─────────────────────────────────────────────────────────────────────────────
// Q-Sub meetings
// ─────────────────────────────────────────────────────────────────────────────

export const qSubMeetings = pgTable(
  'q_sub_meetings',
  {
    id: uuid('id').primaryKey().defaultRandom(),

    qSubmissionId: uuid('q_submission_id')
      .notNull()
      .references(() => qSubmissions.id, { onDelete: 'cascade' }),

    meetingDate: timestamp('meeting_date', { withTimezone: true }).notNull(),

    // 'Tele · 60 min' / 'In-person · 90 min' / 'Written response' …
    kind: varchar('kind', { length: 64 }).notNull(),

    // FDA participants (display string, e.g. 'Dr. K. Patel (DDH/OHT2)').
    fdaTeamDisplay: text('fda_team_display'),

    confirmed: boolean('confirmed').notNull().default(false),

    // Minutes / written response captured here once received.
    minutesReceivedAt: timestamp('minutes_received_at', { withTimezone: true }),
    minutesText: text('minutes_text'),

    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    bySubmission: index('q_sub_meetings_submission_idx').on(t.qSubmissionId),
  }),
);

// ─────────────────────────────────────────────────────────────────────────────
// Q-Sub questions
// ─────────────────────────────────────────────────────────────────────────────

export const qSubQuestions = pgTable(
  'q_sub_questions',
  {
    id: uuid('id').primaryKey().defaultRandom(),

    qSubmissionId: uuid('q_submission_id')
      .notNull()
      .references(() => qSubmissions.id, { onDelete: 'cascade' }),

    // Sequence within the submission (1, 2, 3 …).
    n: integer('n').notNull(),

    // The sponsor's question.
    question: text('question').notNull(),

    // Sponsor's pre-meeting position.
    ourPosition: text('our_position').notNull(),

    // FDA's response. Null while awaiting.
    fdaResponse: text('fda_response'),

    // 'answered' | 'awaiting'.
    status: varchar('status', { length: 16 }).notNull().default('awaiting'),

    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    bySubmission: index('q_sub_questions_submission_idx').on(t.qSubmissionId),
    uniqByN:      uniqueIndex('q_sub_questions_submission_n_uq').on(t.qSubmissionId, t.n),
  }),
);

// ─────────────────────────────────────────────────────────────────────────────
// Q-Sub commitments — captured from FDA feedback, link to dossier sections
// ─────────────────────────────────────────────────────────────────────────────

export const qSubCommitments = pgTable(
  'q_sub_commitments',
  {
    id: uuid('id').primaryKey().defaultRandom(),

    // The question that produced this commitment.
    qSubQuestionId: uuid('q_sub_question_id')
      .notNull()
      .references(() => qSubQuestions.id, { onDelete: 'cascade' }),

    // Display id used in the UI (e.g. 'cm-1', 'cm-844-1').
    displayCode: varchar('display_code', { length: 32 }).notNull(),

    // Free-text description of what the sponsor commits to do.
    text: text('text').notNull(),

    // Dossier link — which dossier section the commitment lands in.
    dossierLinkKind: varchar('dossier_link_kind', { length: 32 }).notNull(),
    dossierLinkLabel: varchar('dossier_link_label', { length: 128 }).notNull(),
    dossierLinkSectionId: text('dossier_link_section_id').notNull(),

    // Lifecycle.
    rolledIn: boolean('rolled_in').notNull().default(false),
    rolledInAt: timestamp('rolled_in_at', { withTimezone: true }),
    rolledInBy: text('rolled_in_by'),

    // True when the commitment is gating the next dossier transmit.
    blocker: boolean('blocker').notNull().default(false),

    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    byQuestion:  index('q_sub_commitments_question_idx').on(t.qSubQuestionId),
    byBlocker:   index('q_sub_commitments_blocker_idx').on(t.blocker),
    bySection:   index('q_sub_commitments_section_idx').on(t.dossierLinkSectionId),
    uniqByCode:  uniqueIndex('q_sub_commitments_displaycode_uq').on(t.displayCode),
  }),
);

// ─────────────────────────────────────────────────────────────────────────────
// Q-Sub timeline — append-only event log
// ─────────────────────────────────────────────────────────────────────────────

export const qSubTimelineEntries = pgTable(
  'q_sub_timeline_entries',
  {
    id: uuid('id').primaryKey().defaultRandom(),

    qSubmissionId: uuid('q_submission_id')
      .notNull()
      .references(() => qSubmissions.id, { onDelete: 'cascade' }),

    // When the event happened (display string per fixture: 'Jun 12').
    when: varchar('when', { length: 32 }).notNull(),

    // Actor: 'FDA' / sponsor name / 'M. Webb' …
    who: varchar('who', { length: 64 }).notNull(),

    // Free-text description.
    what: text('what').notNull(),

    // ISO timestamp for sorting / clock arithmetic.
    occurredAt: timestamp('occurred_at', { withTimezone: true }).notNull(),

    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    bySubmission: index('q_sub_timeline_submission_idx').on(t.qSubmissionId),
  }),
);

// ─────────────────────────────────────────────────────────────────────────────
// Relations
// ─────────────────────────────────────────────────────────────────────────────

export const qSubmissionsRelations = relations(qSubmissions, ({ many }) => ({
  meetings:  many(qSubMeetings),
  questions: many(qSubQuestions),
  timeline:  many(qSubTimelineEntries),
}));

export const qSubMeetingsRelations = relations(qSubMeetings, ({ one }) => ({
  submission: one(qSubmissions, {
    fields:     [qSubMeetings.qSubmissionId],
    references: [qSubmissions.id],
  }),
}));

export const qSubQuestionsRelations = relations(qSubQuestions, ({ one, many }) => ({
  submission: one(qSubmissions, {
    fields:     [qSubQuestions.qSubmissionId],
    references: [qSubmissions.id],
  }),
  commitments: many(qSubCommitments),
}));

export const qSubCommitmentsRelations = relations(qSubCommitments, ({ one }) => ({
  question: one(qSubQuestions, {
    fields:     [qSubCommitments.qSubQuestionId],
    references: [qSubQuestions.id],
  }),
}));

export const qSubTimelineRelations = relations(qSubTimelineEntries, ({ one }) => ({
  submission: one(qSubmissions, {
    fields:     [qSubTimelineEntries.qSubmissionId],
    references: [qSubmissions.id],
  }),
}));

// ─────────────────────────────────────────────────────────────────────────────
// Types + zod schemas
// ─────────────────────────────────────────────────────────────────────────────

export type QSubmission         = InferSelectModel<typeof qSubmissions>;
export type QSubMeeting         = InferSelectModel<typeof qSubMeetings>;
export type QSubQuestion        = InferSelectModel<typeof qSubQuestions>;
export type QSubCommitment      = InferSelectModel<typeof qSubCommitments>;
export type QSubTimelineEntry   = InferSelectModel<typeof qSubTimelineEntries>;

// Q-Sub type taxonomy — kept inline so the API can validate without a join.
export const Q_SUB_TYPES = ['presub', 'sir', 'srd', 'agree', 'info'] as const;
export const Q_SUB_STAGES = ['plan', 'package', 'submit', 'await', 'feedback', 'integrate'] as const;
export const QUESTION_STATUSES = ['answered', 'awaiting'] as const;
export const DOSSIER_LINK_KINDS = ['k510-section', 'pma-section', 'cer-section'] as const;

export const insertQSubmissionSchema = createInsertSchema(qSubmissions, {
  qSubType: z.enum(Q_SUB_TYPES),
  stage:    z.enum(Q_SUB_STAGES),
});

export const insertQSubQuestionSchema = createInsertSchema(qSubQuestions, {
  status: z.enum(QUESTION_STATUSES),
});

export const insertQSubCommitmentSchema = createInsertSchema(qSubCommitments, {
  dossierLinkKind: z.enum(DOSSIER_LINK_KINDS),
});
