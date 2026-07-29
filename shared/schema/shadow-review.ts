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

import { integer, pgTable, serial, text, real, timestamp, index } from 'drizzle-orm/pg-core';
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
    status: text('status').default('running').notNull(), // running|complete|failed
    rtfRiskScore: real('rtf_risk_score'), // 0..1
    crlRiskScore: real('crl_risk_score'), // 0..1
    summary: text('summary'),
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
  })
);

export type ShadowReviewRun = typeof shadowReviewRuns.$inferSelect;
export type NewShadowReviewRun = typeof shadowReviewRuns.$inferInsert;
export type ShadowReviewFinding = typeof shadowReviewFindings.$inferSelect;
export type NewShadowReviewFinding = typeof shadowReviewFindings.$inferInsert;
