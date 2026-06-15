/**
 * Regulatory assessments — durable, per-program records of RI/CDISC/eTMF verdicts.
 *
 * The global-RI strategy brief, CDISC package readiness, TMF completeness and
 * the various market-readiness assessments are deterministic and stateless. This
 * table persists a point-in-time result so a program has an auditable history of
 * its regulatory posture over time (who assessed, when, the verdict, the full
 * result). Append-only by convention.
 *
 * Conventions mirror shared/schema/ind-cross-references.ts (uuid PK + integer
 * organization_id tenant column + drizzle-zod insert), so the service scopes
 * every query by the caller's organizationId.
 *
 * INTEGRATION NOTES (human):
 *   1. Add `export * from './regulatory-assessments'` to shared/schema/index.ts.
 *   2. Run migrations/20260615_regulatory_assessments.sql.
 */

import { InferSelectModel } from 'drizzle-orm';
import { integer, pgTable, text, timestamp, uuid, boolean, jsonb, index } from 'drizzle-orm/pg-core';
import { createInsertSchema } from 'drizzle-zod';
import { z } from 'zod';

export const regulatoryAssessments = pgTable(
  'regulatory_assessments',
  {
    id: uuid('id').primaryKey().defaultRandom(),

    // Tenant — never trusted from request input; set by the service layer.
    organizationId: integer('organization_id').notNull(),

    /** The program / submission this assessment belongs to. */
    submissionId: integer('submission_id').notNull(),

    /** What was assessed: strategy_brief | cdisc_package | tmf_completeness | module1_readiness | … */
    assessmentType: text('assessment_type').notNull(),

    /** The headline verdict (null when an assessment has no boolean readiness). */
    ready: boolean('ready'),
    /** Small summary object for listing without rehydrating the full result. */
    summary: jsonb('summary').notNull().default({}),
    /** The full assessment result. */
    result: jsonb('result').notNull(),

    createdBy: integer('created_by'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    orgIdx: index('regulatory_assessments_org_idx').on(t.organizationId),
    submissionIdx: index('regulatory_assessments_submission_idx').on(t.submissionId),
    typeIdx: index('regulatory_assessments_type_idx').on(t.assessmentType),
  }),
);

export type RegulatoryAssessment = InferSelectModel<typeof regulatoryAssessments>;

export const insertRegulatoryAssessmentSchema = createInsertSchema(regulatoryAssessments, {
  assessmentType: z.string().min(1),
});
export type InsertRegulatoryAssessment = z.infer<typeof insertRegulatoryAssessmentSchema>;

export const REGULATORY_ASSESSMENT_TABLES = ['regulatory_assessments'] as const;
