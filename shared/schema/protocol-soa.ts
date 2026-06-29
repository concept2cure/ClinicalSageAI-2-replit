/**
 * Protocol Schedule-of-Assessments (SoA) matrix (Capability C2C-21)
 *
 * A proper SoA grid for a protocol document: assessments (rows) × visits (the
 * existing protocol_schedule_visits, columns), with a cell marking each assessment
 * performed at each visit. Complements the simple visit.procedures[] list with a
 * structured, validatable matrix. Conventions match the platform; status/type
 * columns are CHECK-constrained. Mutations are governed + audited.
 *
 * @module shared/schema/protocol-soa
 */

import { boolean, index, integer, pgTable, serial, text, timestamp, uniqueIndex } from 'drizzle-orm/pg-core';
import { organizations, users } from '../schema';

export type AssessmentCategory = 'lab' | 'imaging' | 'exam' | 'vital_signs' | 'pk' | 'questionnaire' | 'procedure' | 'eligibility' | 'other';

export const protocolSoaAssessments = pgTable(
  'protocol_soa_assessments',
  {
    id: serial('id').primaryKey(),
    organizationId: integer('organization_id').notNull().references(() => organizations.id),
    protocolDocumentId: integer('protocol_document_id').notNull(),
    name: text('name').notNull(),
    category: text('category').$type<AssessmentCategory>().notNull().default('other'),
    orderIndex: integer('order_index').notNull().default(0),
    createdBy: integer('created_by').notNull().references(() => users.id),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow(),
    deletedAt: timestamp('deleted_at', { withTimezone: true }),
  },
  (t) => ({
    orgIdx: index('idx_protocol_soa_assessments_org').on(t.organizationId),
    docIdx: index('idx_protocol_soa_assessments_doc').on(t.protocolDocumentId),
  }),
);

export type ProtocolSoaAssessment = typeof protocolSoaAssessments.$inferSelect;
export type NewProtocolSoaAssessment = typeof protocolSoaAssessments.$inferInsert;

export const protocolSoaCells = pgTable(
  'protocol_soa_cells',
  {
    id: serial('id').primaryKey(),
    organizationId: integer('organization_id').notNull().references(() => organizations.id),
    protocolDocumentId: integer('protocol_document_id').notNull(),
    assessmentId: integer('assessment_id').notNull().references(() => protocolSoaAssessments.id),
    /** References protocol_schedule_visits(id) (the SoA columns). */
    visitId: integer('visit_id').notNull(),
    required: boolean('required').notNull().default(true),
    notes: text('notes'),
    createdBy: integer('created_by').notNull().references(() => users.id),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow(),
  },
  (t) => ({
    orgIdx: index('idx_protocol_soa_cells_org').on(t.organizationId),
    docIdx: index('idx_protocol_soa_cells_doc').on(t.protocolDocumentId),
    cellIdx: uniqueIndex('uq_protocol_soa_cell').on(t.assessmentId, t.visitId),
  }),
);

export type ProtocolSoaCell = typeof protocolSoaCells.$inferSelect;
export type NewProtocolSoaCell = typeof protocolSoaCells.$inferInsert;
