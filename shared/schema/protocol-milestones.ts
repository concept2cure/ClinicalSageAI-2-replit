/**
 * Protocol Milestones / Timeline (Capability C2C-20b)
 *
 * Per-protocol milestone timeline (IRB submission, first/last subject, database
 * lock, CSR, …) with target dates and status, soft-linked to a protocol document.
 * Timeline bucketing is deterministic (protocol-milestones-logic.ts, reusing the
 * grants deadline-urgency pattern). Conventions match the platform; status/type
 * columns are CHECK-constrained. Mutations are governed + audited.
 *
 * @module shared/schema/protocol-milestones
 */

import { date, index, integer, pgTable, serial, text, timestamp } from 'drizzle-orm/pg-core';
import { organizations, users } from '../schema';

export type MilestoneType =
  | 'protocol_approval' | 'irb_submission' | 'site_activation' | 'first_subject' | 'last_subject'
  | 'enrollment_complete' | 'database_lock' | 'csr' | 'closeout' | 'other';
export type MilestoneStatus = 'planned' | 'in_progress' | 'met' | 'missed' | 'cancelled';

export const protocolMilestones = pgTable(
  'protocol_milestones',
  {
    id: serial('id').primaryKey(),
    organizationId: integer('organization_id').notNull().references(() => organizations.id),
    protocolDocumentId: integer('protocol_document_id').notNull(),
    name: text('name').notNull(),
    milestoneType: text('milestone_type').$type<MilestoneType>().notNull().default('other'),
    targetDate: date('target_date'),
    actualDate: date('actual_date'),
    status: text('status').$type<MilestoneStatus>().notNull().default('planned'),
    notes: text('notes'),
    createdBy: integer('created_by').notNull().references(() => users.id),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow(),
    deletedAt: timestamp('deleted_at', { withTimezone: true }),
  },
  (t) => ({
    orgIdx: index('idx_protocol_milestones_org').on(t.organizationId),
    docIdx: index('idx_protocol_milestones_doc').on(t.protocolDocumentId),
  }),
);

export type ProtocolMilestone = typeof protocolMilestones.$inferSelect;
export type NewProtocolMilestone = typeof protocolMilestones.$inferInsert;
