/**
 * Regulatory Graph Foundation
 *
 * NOTE (2026-04-29 cleanup): the original draft of this module added four new
 * tables (device_claims, submission_sections, regulatory_standards,
 * standards_applicability). Three were duplicates of existing canonical tables:
 *
 *   - device_claims         → use evidenceClaims          (shared/schema.ts)
 *   - regulatory_standards  → use deviceTestStandards     (shared/schema.ts)
 *   - submission_sections   → use cerSections / cmcModule3Sections (per-framework pattern)
 *
 * The duplicates were removed; the canonical tables were extended with the
 * fields they were missing (governance status, supersededBy*, riskLevel,
 * population, anatomicalSite, useEnvironment, source linkage, code, tags on
 * evidenceClaims; domain, appliesTo, fdaRecognized, euHarmonized,
 * jurisdictions, status lifecycle, supersededByStandardId, summary on
 * deviceTestStandards). See migration 20260429_regulatory_graph.sql.
 *
 * What remains here is the genuinely-new table:
 *   standards_applicability — per-program decision: which standards apply,
 *                              with what conformance method, and a link to the
 *                              evidence object that demonstrates conformance.
 */

import { relations, InferSelectModel } from 'drizzle-orm';
import {
  integer,
  pgTable,
  text,
  timestamp,
  uuid,
  json,
  index,
  uniqueIndex,
} from 'drizzle-orm/pg-core';
import { createInsertSchema } from 'drizzle-zod';
import { z } from 'zod';

import { regulatoryPrograms, evidenceObjects } from './programs';
import { deviceTestStandards } from '../schema';

// ═══════════════════════════════════════════════════════════════════════════════
// STANDARDS APPLICABILITY (per-program decision + evidence link)
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Standards Applicability Table
 *
 * For a given regulatory program, records which standards apply, why, who
 * decided, and the evidence object that demonstrates conformance.
 *
 * One row per (program × standard).
 */
export const standardsApplicability = pgTable(
  'standards_applicability',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    organizationId: integer('organization_id').notNull(),
    programId: uuid('program_id')
      .notNull()
      .references(() => regulatoryPrograms.id, { onDelete: 'cascade' }),
    standardId: integer('standard_id')
      .notNull()
      .references(() => deviceTestStandards.id, { onDelete: 'restrict' }),

    // Decision
    applicability: text('applicability').notNull(),
    // applies | does_not_apply | conditional | tbd
    rationale: text('rationale'),

    // Conformance plan
    conformanceMethod: text('conformance_method'),
    // full_conformance | partial_conformance | declaration_of_conformity |
    // alternative_method | exemption_claimed
    conformanceStatus: text('conformance_status').notNull().default('not_started'),
    // not_started | in_progress | conformant | non_conformant | needs_evidence

    // Evidence linkage (one canonical evidence object per applicability row;
    // additional evidence is wired through evidence_links targeting this row's id)
    primaryEvidenceId: uuid('primary_evidence_id').references(() => evidenceObjects.id, {
      onDelete: 'set null',
    }),
    gapDescription: text('gap_description'),

    // Decision audit
    decidedBy: text('decided_by'),
    decidedAt: timestamp('decided_at'),
    reviewedBy: text('reviewed_by'),
    reviewedAt: timestamp('reviewed_at'),

    metadata: json('metadata'),

    createdAt: timestamp('created_at').defaultNow().notNull(),
    updatedAt: timestamp('updated_at').defaultNow().notNull(),
  },
  table => ({
    programIdx: index('standards_applicability_program_idx').on(table.programId),
    standardIdx: index('standards_applicability_standard_idx').on(table.standardId),
    statusIdx: index('standards_applicability_status_idx').on(table.conformanceStatus),
    pairIdx: uniqueIndex('standards_applicability_pair_idx').on(
      table.programId,
      table.standardId
    ),
  })
);

export const insertStandardsApplicabilitySchema = createInsertSchema(standardsApplicability).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

export type StandardsApplicability = InferSelectModel<typeof standardsApplicability>;
export type InsertStandardsApplicability = z.infer<typeof insertStandardsApplicabilitySchema>;

export const standardsApplicabilityRelations = relations(standardsApplicability, ({ one }) => ({
  program: one(regulatoryPrograms, {
    fields: [standardsApplicability.programId],
    references: [regulatoryPrograms.id],
  }),
  standard: one(deviceTestStandards, {
    fields: [standardsApplicability.standardId],
    references: [deviceTestStandards.id],
  }),
  primaryEvidence: one(evidenceObjects, {
    fields: [standardsApplicability.primaryEvidenceId],
    references: [evidenceObjects.id],
  }),
}));
