/**
 * Inspection Readiness (BIMO / PAI) (Capability C2C-13)
 *
 * Mock-inspection prep and live-inspection management: inspections (FDA BIMO /
 * PAI, EMA GCP/GMP), Form FDA 483 observations and their responses (the 15-
 * business-day clock), and per-area readiness assessments. Closes the "no mock-
 * inspection workflow; 483 responses ad hoc" gap.
 *
 * Grounded in the FDA BIMO program, pre-approval inspections, Form FDA 483 /
 * Establishment Inspection Report practice, and EMA GCP/GMP inspections.
 * Conventions match the platform; status/type columns are CHECK-constrained.
 *
 * @module shared/schema/inspection
 */

import { index, integer, pgTable, serial, text, date, timestamp } from 'drizzle-orm/pg-core';
import { organizations, users } from '../schema';

export type InspectionType = 'bimo' | 'pai' | 'gcp' | 'gmp' | 'routine' | 'for_cause' | 'other';
export type InspectionAgency = 'fda' | 'ema' | 'mhra' | 'pmda' | 'other';
export type InspectionStatus = 'scheduled' | 'in_progress' | 'completed' | 'closed';
/** No Action Indicated / Voluntary Action Indicated / Official Action Indicated. */
export type InspectionOutcome = 'pending' | 'nai' | 'vai' | 'oai';
export type FindingClassification = 'critical' | 'major' | 'minor' | 'observation';
export type FindingStatus = 'open' | 'responded' | 'closed';
export type ResponseStatus = 'draft' | 'submitted' | 'accepted' | 'rejected';
export type ReadinessAreaStatus = 'not_started' | 'in_progress' | 'ready' | 'at_risk';

// ─── Inspections ─────────────────────────────────────────────────────────────

export const inspections = pgTable(
  'inspections',
  {
    id: serial('id').primaryKey(),
    organizationId: integer('organization_id').notNull().references(() => organizations.id),
    inspectionType: text('inspection_type').$type<InspectionType>().notNull(),
    agency: text('agency').$type<InspectionAgency>().notNull(),
    siteName: text('site_name').notNull(),
    scheduledDate: date('scheduled_date'),
    startDate: date('start_date'),
    endDate: date('end_date'),
    status: text('status').$type<InspectionStatus>().notNull().default('scheduled'),
    outcome: text('outcome').$type<InspectionOutcome>().notNull().default('pending'),
    createdBy: integer('created_by').notNull().references(() => users.id),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow(),
    deletedAt: timestamp('deleted_at', { withTimezone: true }),
  },
  (t) => ({ orgIdx: index('idx_inspections_org').on(t.organizationId) })
);

export type Inspection = typeof inspections.$inferSelect;
export type NewInspection = typeof inspections.$inferInsert;

// ─── Findings (Form 483 observations) ────────────────────────────────────────

export const inspectionFindings = pgTable(
  'inspection_findings',
  {
    id: serial('id').primaryKey(),
    organizationId: integer('organization_id').notNull().references(() => organizations.id),
    inspectionId: integer('inspection_id').notNull().references(() => inspections.id),
    observationNumber: integer('observation_number').notNull(),
    description: text('description').notNull(),
    classification: text('classification').$type<FindingClassification>().notNull().default('observation'),
    status: text('status').$type<FindingStatus>().notNull().default('open'),
    createdBy: integer('created_by').notNull().references(() => users.id),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow(),
    deletedAt: timestamp('deleted_at', { withTimezone: true }),
  },
  (t) => ({
    orgIdx: index('idx_inspection_findings_org').on(t.organizationId),
    inspectionIdx: index('idx_inspection_findings_inspection').on(t.inspectionId),
  })
);

export type InspectionFinding = typeof inspectionFindings.$inferSelect;
export type NewInspectionFinding = typeof inspectionFindings.$inferInsert;

// ─── Responses (CAPA to findings; 15-business-day clock) ─────────────────────

export const findingResponses = pgTable(
  'finding_responses',
  {
    id: serial('id').primaryKey(),
    organizationId: integer('organization_id').notNull().references(() => organizations.id),
    findingId: integer('finding_id').notNull().references(() => inspectionFindings.id),
    responseDescription: text('response_description').notNull(),
    dueDate: date('due_date'),
    status: text('status').$type<ResponseStatus>().notNull().default('draft'),
    submittedDate: date('submitted_date'),
    createdBy: integer('created_by').notNull().references(() => users.id),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow(),
    deletedAt: timestamp('deleted_at', { withTimezone: true }),
  },
  (t) => ({
    orgIdx: index('idx_finding_responses_org').on(t.organizationId),
    findingIdx: index('idx_finding_responses_finding').on(t.findingId),
  })
);

export type FindingResponse = typeof findingResponses.$inferSelect;
export type NewFindingResponse = typeof findingResponses.$inferInsert;

// ─── Readiness assessments (per area) ────────────────────────────────────────

export const readinessAssessments = pgTable(
  'readiness_assessments',
  {
    id: serial('id').primaryKey(),
    organizationId: integer('organization_id').notNull().references(() => organizations.id),
    inspectionId: integer('inspection_id').references(() => inspections.id),
    area: text('area').notNull(),
    status: text('status').$type<ReadinessAreaStatus>().notNull().default('not_started'),
    gaps: text('gaps'),
    createdBy: integer('created_by').notNull().references(() => users.id),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow(),
    deletedAt: timestamp('deleted_at', { withTimezone: true }),
  },
  (t) => ({
    orgIdx: index('idx_readiness_assessments_org').on(t.organizationId),
    inspectionIdx: index('idx_readiness_assessments_inspection').on(t.inspectionId),
  })
);

export type ReadinessAssessment = typeof readinessAssessments.$inferSelect;
export type NewReadinessAssessment = typeof readinessAssessments.$inferInsert;
