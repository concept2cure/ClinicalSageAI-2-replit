/**
 * Shadow Review schema (the moat — spec §6.5/§8.1)
 *
 *  - shadowReviewRuns:     one simulated-reviewer pass over an assembled sequence
 *  - shadowReviewFindings: severity-scored RTF/CRL/format/NB findings with a
 *                          regulatory basis and a concrete fix
 *
 * MULTI-TENANT: organizationId on every row. SERIAL int PKs.
 *
 * @module shared/schema/shadow-review
 */

import { sql } from 'drizzle-orm';
import { integer, pgTable, serial, text, real, timestamp, index, uniqueIndex, type AnyPgColumn } from 'drizzle-orm/pg-core';
import { organizations, users } from '../schema';
import { ectdSequences } from './submissions';

export const shadowReviewRuns = pgTable(
  'shadow_review_runs',
  {
    id: serial('id').primaryKey(),
    sequenceId: integer('sequence_id')
      .notNull()
      .references(() => ectdSequences.id),
    region: text('region').notNull(), // fda|eu|jp
    lens: text('lens').default('fda_filing').notNull(), // fda_filing|ema_d120|pmda|nb_mdr|nb_ivdr
    model: text('model'),
    promptVersion: text('prompt_version'),
    status: text('status').default('running').notNull(), // running|complete|failed|waived
    rtfRiskScore: real('rtf_risk_score'), // 0..1
    crlRiskScore: real('crl_risk_score'), // 0..1
    summary: text('summary'),
    // P-34 (migrations/20261015_shadow_review_waiver.sql). Why a failed run
    // failed, from shadow-review-failure.ts's closed set; null otherwise.
    failureCode: text('failure_code'),
    // A 'waived' row: the signature's governed sign action and the failed run.
    waiverSignatureActionId: text('waiver_signature_action_id'),
    waivedFailedRunId: integer('waived_failed_run_id').references((): AnyPgColumn => shadowReviewRuns.id),
    organizationId: integer('organization_id')
      .notNull()
      .references(() => organizations.id),
    createdBy: integer('created_by')
      .notNull()
      .references(() => users.id),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow(),
    deletedAt: timestamp('deleted_at', { withTimezone: true }),
  },
  (table) => ({
    sequenceIdx: index('idx_shadow_runs_sequence_id').on(table.sequenceId),
    orgIdx: index('idx_shadow_runs_organization_id').on(table.organizationId),
    // P-34: one waiver per failed run, and a waiver signature is used once.
    waivedFailedRunUq: uniqueIndex('uq_shadow_runs_waived_failed_run')
      .on(table.waivedFailedRunId)
      .where(sql`${table.waivedFailedRunId} IS NOT NULL`),
    waiverSignatureUq: uniqueIndex('uq_shadow_runs_waiver_signature')
      .on(table.organizationId, table.waiverSignatureActionId)
      .where(sql`${table.waiverSignatureActionId} IS NOT NULL`),
  })
);

export const shadowReviewFindings = pgTable(
  'shadow_review_findings',
  {
    id: serial('id').primaryKey(),
    runId: integer('run_id')
      .notNull()
      .references(() => shadowReviewRuns.id),
    dimension: text('dimension').notNull(), // rtf|crl|format|nb
    severity: text('severity').notNull(), // critical|major|minor|info
    title: text('title').notNull(),
    detail: text('detail'),
    basis: text('basis'), // CFR/ICH/guidance citation
    recommendation: text('recommendation'), // concrete fix
    leafRef: text('leaf_ref'), // section code / leaf
    status: text('status').default('open').notNull(), // open|accepted|fixed|waived
    // P-35 (migrations/20261015b_shadow_finding_disposition.sql). A critical
    // closed as 'accepted' or 'fixed' by a Part 11 signature: its governed sign
    // action, the signer, when, and the signature's own reason.
    dispositionSignatureActionId: text('disposition_signature_action_id'),
    disposedBy: integer('disposed_by').references(() => users.id),
    disposedAt: timestamp('disposed_at', { withTimezone: true }),
    dispositionReason: text('disposition_reason'),
    organizationId: integer('organization_id')
      .notNull()
      .references(() => organizations.id),
    createdBy: integer('created_by')
      .notNull()
      .references(() => users.id),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow(),
    deletedAt: timestamp('deleted_at', { withTimezone: true }),
  },
  (table) => ({
    runIdx: index('idx_shadow_findings_run_id').on(table.runId),
    orgIdx: index('idx_shadow_findings_organization_id').on(table.organizationId),
    // P-35: every FK indexed, and a disposition signature is used once.
    disposedByIdx: index('idx_shadow_findings_disposed_by')
      .on(table.disposedBy)
      .where(sql`${table.disposedBy} IS NOT NULL`),
    dispositionSignatureUq: uniqueIndex('uq_shadow_findings_disposition_signature')
      .on(table.organizationId, table.dispositionSignatureActionId)
      .where(sql`${table.dispositionSignatureActionId} IS NOT NULL`),
  })
);

export type ShadowReviewRun = typeof shadowReviewRuns.$inferSelect;
export type NewShadowReviewRun = typeof shadowReviewRuns.$inferInsert;
export type ShadowReviewFinding = typeof shadowReviewFindings.$inferSelect;
export type NewShadowReviewFinding = typeof shadowReviewFindings.$inferInsert;
