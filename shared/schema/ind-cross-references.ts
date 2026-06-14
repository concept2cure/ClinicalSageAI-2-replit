/**
 * IND cross-references — the external files an IND depends on (eCTD Module 1.4).
 *
 * A durable, per-submission register of every Drug Master File / IND / NDA / BLA
 * the application relies on, with whether a Letter of Authorization is on file.
 * The cross-reference register + LOA-coverage QC (ind-cross-reference-service)
 * is computed from these rows, so an RA team has a live view of which external
 * dependencies are not yet authorized (and therefore not reviewable by FDA).
 *
 * Conventions mirror shared/schema/ind-dispatch-snapshots.ts (uuid PK + integer
 * organization_id tenant column + drizzle-zod insert), so the service scopes
 * every query by the caller's organizationId.
 *
 * INTEGRATION NOTES (human):
 *   1. Add `export * from './ind-cross-references'` to shared/schema/index.ts.
 *   2. Run migrations/20260614_ind_cross_references.sql.
 */

import { InferSelectModel } from 'drizzle-orm';
import { integer, pgTable, text, timestamp, uuid, boolean, jsonb, index } from 'drizzle-orm/pg-core';
import { createInsertSchema } from 'drizzle-zod';
import { z } from 'zod';

export const indCrossReferences = pgTable(
  'ind_cross_references',
  {
    id: uuid('id').primaryKey().defaultRandom(),

    // Tenant — never trusted from request input; set by the service layer.
    organizationId: integer('organization_id').notNull(),

    /** The submission (IND) this dependency belongs to. */
    submissionId: integer('submission_id').notNull(),

    /** DMF | IND | NDA | BLA. */
    referencedFileType: text('referenced_file_type').notNull(),
    referencedFileNumber: text('referenced_file_number').notNull(),
    subjectName: text('subject_name').notNull(),
    /** Sections relied upon; empty ⇒ "the file in its entirety". */
    authorizedSections: jsonb('authorized_sections').notNull().default([]),

    /** Whether a Letter of Authorization (m1.4.1) has been obtained/filed. */
    loaOnFile: boolean('loa_on_file').notNull().default(false),
    /** Where the LOA is filed (eCTD section), when on file. */
    loaLeafSection: text('loa_leaf_section'),

    createdBy: integer('created_by'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    orgIdx: index('ind_cross_references_org_idx').on(t.organizationId),
    submissionIdx: index('ind_cross_references_submission_idx').on(t.submissionId),
  }),
);

export type IndCrossReference = InferSelectModel<typeof indCrossReferences>;

export const insertIndCrossReferenceSchema = createInsertSchema(indCrossReferences, {
  referencedFileType: z.enum(['DMF', 'IND', 'NDA', 'BLA']),
  referencedFileNumber: z.string().min(1),
  subjectName: z.string().min(1),
});
export type InsertIndCrossReference = z.infer<typeof insertIndCrossReferenceSchema>;

export const IND_CROSS_REFERENCE_TABLES = ['ind_cross_references'] as const;
