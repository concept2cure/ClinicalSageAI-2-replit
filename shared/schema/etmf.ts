/**
 * AI-native eTMF (Capability C2C-08)
 *
 * Trial Master File management against the DIA TMF Reference Model: a per-study
 * TMF container and its classified artifacts (zone / section / artifact), with a
 * deterministic completeness gap-check that feeds inspection readiness (C2C-13)
 * — closing the "TMF gaps surface at inspection; manual classification" pain.
 *
 * Grounded in the DIA TMF Reference Model (11 zones), ICH E6(R2) §8 essential
 * documents, and the contemporaneous-filing expectation. Conventions match the
 * platform; status/type columns are CHECK-constrained.
 *
 * @module shared/schema/etmf
 */

import { boolean, index, integer, pgTable, serial, text, date, timestamp } from 'drizzle-orm/pg-core';
import { organizations, users, clinicalStudies } from '../schema';

export type TmfStatus = 'active' | 'archived' | 'locked';
export type ArtifactStatus = 'expected' | 'received' | 'in_review' | 'final' | 'missing' | 'not_applicable';

// ─── TMF files (one per study) ───────────────────────────────────────────────

export const tmfFiles = pgTable(
  'tmf_files',
  {
    id: serial('id').primaryKey(),
    organizationId: integer('organization_id').notNull().references(() => organizations.id),
    studyId: integer('study_id').references(() => clinicalStudies.id),
    title: text('title').notNull(),
    /** Reference model, e.g. 'dia_rm_v3'. */
    tmfModel: text('tmf_model').notNull().default('dia_rm_v3'),
    status: text('status').$type<TmfStatus>().notNull().default('active'),
    createdBy: integer('created_by').notNull().references(() => users.id),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow(),
    deletedAt: timestamp('deleted_at', { withTimezone: true }),
  },
  (t) => ({
    orgIdx: index('idx_tmf_files_org').on(t.organizationId),
    studyIdx: index('idx_tmf_files_study').on(t.studyId),
  })
);

export type TmfFile = typeof tmfFiles.$inferSelect;
export type NewTmfFile = typeof tmfFiles.$inferInsert;

// ─── TMF artifacts (classified documents) ────────────────────────────────────

export const tmfArtifacts = pgTable(
  'tmf_artifacts',
  {
    id: serial('id').primaryKey(),
    organizationId: integer('organization_id').notNull().references(() => organizations.id),
    tmfFileId: integer('tmf_file_id').notNull().references(() => tmfFiles.id),
    /** DIA RM zone number (1-11). */
    zone: integer('zone').notNull(),
    section: text('section'),
    artifactName: text('artifact_name').notNull(),
    /** Whether this artifact is expected for this trial (drives completeness). */
    expected: boolean('expected').notNull().default(true),
    /** Required for a complete, inspection-ready TMF (vs. nice-to-have). */
    completenessRequired: boolean('completeness_required').notNull().default(true),
    status: text('status').$type<ArtifactStatus>().notNull().default('expected'),
    documentDate: date('document_date'),
    createdBy: integer('created_by').notNull().references(() => users.id),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow(),
    deletedAt: timestamp('deleted_at', { withTimezone: true }),
  },
  (t) => ({
    orgIdx: index('idx_tmf_artifacts_org').on(t.organizationId),
    fileIdx: index('idx_tmf_artifacts_file').on(t.tmfFileId),
  })
);

export type TmfArtifact = typeof tmfArtifacts.$inferSelect;
export type NewTmfArtifact = typeof tmfArtifacts.$inferInsert;
