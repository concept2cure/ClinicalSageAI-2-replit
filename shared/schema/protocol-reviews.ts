/**
 * Protocol Review & Comment workflow (Capability C2C-18c)
 *
 * The structured review layer over an authored protocol document: reviewer
 * assignments (by review role, with a per-reviewer disposition) and threaded
 * review comments (section-anchored, severity-graded, resolvable). Soft-links to
 * the authored document via protocol_document_id. Consensus + readiness are
 * derived deterministically from the assignment dispositions and open blocking
 * comments. Grounded in ICH E6(R2) §5.0 (quality / review) and 45 CFR 46.111
 * (IRB approval criteria) for the review-role taxonomy and dispositions.
 *
 * Conventions match the platform; status/role/severity columns are CHECK-
 * constrained. Mutations are governed + audited under domain 'protocol_development'.
 *
 * @module shared/schema/protocol-reviews
 */

import { boolean, date, index, integer, pgTable, serial, text, timestamp } from 'drizzle-orm/pg-core';
import { organizations, users } from '../schema';

export type ReviewRole = 'scientific' | 'statistical' | 'ethics' | 'safety' | 'regulatory' | 'general';
export type ReviewAssignmentStatus = 'assigned' | 'in_progress' | 'completed';
export type ReviewDisposition = 'approve' | 'approve_with_changes' | 'reject' | 'abstain';
export type CommentSeverity = 'blocking' | 'major' | 'minor' | 'info';

// ─── Reviewer assignments ────────────────────────────────────────────────────

export const protocolReviewAssignments = pgTable(
  'protocol_review_assignments',
  {
    id: serial('id').primaryKey(),
    organizationId: integer('organization_id').notNull().references(() => organizations.id),
    /** Soft reference to protocol_documents(id). */
    protocolDocumentId: integer('protocol_document_id').notNull(),
    reviewerName: text('reviewer_name').notNull(),
    reviewerUserId: integer('reviewer_user_id'),
    role: text('role').$type<ReviewRole>().notNull().default('general'),
    status: text('status').$type<ReviewAssignmentStatus>().notNull().default('assigned'),
    disposition: text('disposition').$type<ReviewDisposition>(),
    dueDate: date('due_date'),
    createdBy: integer('created_by').notNull().references(() => users.id),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow(),
    deletedAt: timestamp('deleted_at', { withTimezone: true }),
  },
  (t) => ({
    orgIdx: index('idx_protocol_review_assignments_org').on(t.organizationId),
    docIdx: index('idx_protocol_review_assignments_doc').on(t.protocolDocumentId),
  }),
);

export type ProtocolReviewAssignment = typeof protocolReviewAssignments.$inferSelect;
export type NewProtocolReviewAssignment = typeof protocolReviewAssignments.$inferInsert;

// ─── Review comments ─────────────────────────────────────────────────────────

export const protocolReviewComments = pgTable(
  'protocol_review_comments',
  {
    id: serial('id').primaryKey(),
    organizationId: integer('organization_id').notNull().references(() => organizations.id),
    /** Soft reference to protocol_documents(id). */
    protocolDocumentId: integer('protocol_document_id').notNull(),
    /** Soft reference to protocol_review_assignments(id) — the authoring reviewer. */
    assignmentId: integer('assignment_id'),
    /** Section key / heading the comment is anchored to (e.g. 'objectives'). */
    sectionRef: text('section_ref'),
    comment: text('comment').notNull(),
    severity: text('severity').$type<CommentSeverity>(),
    resolved: boolean('resolved').notNull().default(false),
    createdBy: integer('created_by').notNull().references(() => users.id),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow(),
    deletedAt: timestamp('deleted_at', { withTimezone: true }),
  },
  (t) => ({
    orgIdx: index('idx_protocol_review_comments_org').on(t.organizationId),
    docIdx: index('idx_protocol_review_comments_doc').on(t.protocolDocumentId),
  }),
);

export type ProtocolReviewComment = typeof protocolReviewComments.$inferSelect;
export type NewProtocolReviewComment = typeof protocolReviewComments.$inferInsert;
