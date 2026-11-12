/**
 * TMF artifact filings — the Trial Master File of a study: one row per
 * (organization, study, DIA TMF Reference Model artifact code), read by the
 * completeness checker (`server/services/etmf/tmf-completeness`).
 *
 * A filing belongs to a study of a project (P-75, eTMF convergence E2):
 * `studyRef` is the protocol-design study it was filed against
 * (`cdisc_prm_studies.id`, held to the filing's organization by
 * tmf_artifact_filings_study_same_org_fk, declared in
 * migrations/20261110_tmf_filings_study_ref.sql and not here, as the other
 * same-organization keys are), and `trialId` keeps that study's own
 * `study_id` string so the unique key holds one row per study and artifact.
 * A row filed before 2026-11-10 has no `studyRef`: it is served as no study's
 * filing, and no link is inferred from its free-text `trialId`.
 *
 * A filing is never deleted (E3): `removedAt`, `removedBy` and
 * `removalReason` record a removal on the row, and every reader skips a
 * removed row. Filing the artifact again clears the three on the same row.
 *
 * A live row with `notApplicableReason` is not a filing: it declares that the
 * record does not apply to the study, with who, when and why (P-124 item 5).
 *
 * Distinct from shared/schema/etmf.ts `tmfArtifacts` (Store B, on no deploy
 * path; retired by slice E4 of docs/design/ETMF_CONVERGENCE_2026-10-30.md).
 *
 * Conventions mirror shared/schema/ind-cross-references.ts (uuid PK + integer
 * organization_id tenant column + drizzle-zod insert).
 *
 * Migrations: migrations/20260615_tmf_artifact_filings.sql (the table),
 * migrations/20261110_tmf_filings_study_ref.sql (the study, the removal and
 * the declaration).
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

    /**
     * The study's own `study_id` string (cdisc_prm_studies.study_id) for a
     * filing made against a study; free text typed by hand on a row filed
     * before 2026-11-10, which names nothing.
     */
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

    /** cdisc_prm_studies.id of the study this was filed against; null on a row filed before 2026-11-10. */
    studyRef: integer('study_ref'),
    /** Set when the filing was removed; a removed row is skipped by every reader. */
    removedAt: timestamp('removed_at', { withTimezone: true }),
    removedBy: integer('removed_by'),
    /** Why it was removed (at least 8 characters; tmf_artifact_filings_removal_recorded_chk). */
    removalReason: text('removal_reason'),
    /**
     * Set on a declaration that the record does not apply to the study (P-124 item 5): why, in the person's words
     * (at least 8 characters; a declaration names no document, tmf_artifact_filings_not_applicable_chk). Who and
     * when are `createdBy` and `filedAt`. Counted as neither filed nor missing.
     */
    notApplicableReason: text('not_applicable_reason'),
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
