/**
 * TMF artifact filings — durable, per-trial log of filed DIA TMF Reference Model
 * artifact CODES, powering the (code-based) completeness checker.
 *
 * Distinct from shared/schema/etmf.ts `tmfArtifacts` (a richer document-artifact
 * registry with files + status workflow): this is a lightweight log keyed to the
 * reference-model artifact codes used by `server/services/etmf/tmf-completeness`,
 * so inspection-readiness can be computed from stored state. One row per
 * (org, trial, artifact code).
 *
 * Conventions mirror shared/schema/ind-cross-references.ts (uuid PK + integer
 * organization_id tenant column + drizzle-zod insert).
 *
 * INTEGRATION NOTES (human):
 *   1. Add `export * from './tmf-artifacts'` to shared/schema/index.ts.
 *   2. Run migrations/20260615_tmf_artifact_filings.sql.
 */

import { InferSelectModel } from 'drizzle-orm';
import { integer, pgTable, text, timestamp, uuid, index, unique } from 'drizzle-orm/pg-core';
import { createInsertSchema } from 'drizzle-zod';
import { z } from 'zod';

export const tmfArtifactFilings = pgTable(
  'tmf_artifact_filings',
  {
    id: uuid('id').primaryKey().defaultRandom(),

    // Tenant — never trusted from request input; set by the service layer.
    organizationId: integer('organization_id').notNull(),

    /** Trial / study identifier the artifact belongs to. */
    trialId: text('trial_id').notNull(),
    /** DIA TMF Reference Model artifact code (e.g. 'protocol'). */
    artifactCode: text('artifact_code').notNull(),
    /** TMF zone number (1–11) the artifact belongs to. */
    zoneNumber: integer('zone_number'),
    /** Optional reference to the filed document (path/id/version). */
    documentRef: text('document_ref'),

    createdBy: integer('created_by'),
    filedAt: timestamp('filed_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    orgIdx: index('tmf_artifact_filings_org_idx').on(t.organizationId),
    trialIdx: index('tmf_artifact_filings_trial_idx').on(t.trialId),
    uniqueArtifact: unique('tmf_artifact_filings_unique').on(t.organizationId, t.trialId, t.artifactCode),
  }),
);

export type TmfArtifactFiling = InferSelectModel<typeof tmfArtifactFilings>;

export const insertTmfArtifactFilingSchema = createInsertSchema(tmfArtifactFilings, {
  trialId: z.string().min(1),
  artifactCode: z.string().min(1),
});
export type InsertTmfArtifactFiling = z.infer<typeof insertTmfArtifactFilingSchema>;

export const TMF_ARTIFACT_FILING_TABLES = ['tmf_artifact_filings'] as const;
