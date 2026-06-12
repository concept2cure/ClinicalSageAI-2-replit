/**
 * External Intelligence — AnA's nightly scan of the outside world.
 *
 * A scheduled sweep (server/jobs/externalIntelligenceSweep.ts) walks a
 * registry of external sources — regulatory agencies across every market
 * the platform serves (FDA, EMA, MHRA, TGA, …) plus academic and industry
 * centers of knowledge (SCDM, PubMed methodology literature, medRxiv) —
 * and lands what it finds here. Findings are global (not tenant-scoped):
 * a new FDA guidance matters to every client with a US program. AnA
 * surfaces the fresh ones in chat via the EXTERNAL INTELLIGENCE block and
 * the digest endpoints.
 *
 * Schema:  this file. Migration: migrations/20260612_ana_relational_external_intel.sql
 * Service: server/services/external-intelligence/
 * Job:     server/jobs/externalIntelligenceSweep.ts
 * Routes:  server/routes/external-intelligence.ts
 */

import {
  pgTable,
  serial,
  text,
  integer,
  timestamp,
  jsonb,
  uniqueIndex,
  index,
} from 'drizzle-orm/pg-core';
import { InferSelectModel } from 'drizzle-orm';

export type ExternalIntelSourceType =
  | 'regulatory_agency'
  | 'standards_body'
  | 'academic'
  | 'industry_group';

export const externalIntelligenceFindings = pgTable(
  'external_intelligence_findings',
  {
    id: serial('id').primaryKey(),

    // ── Where it came from ──────────────────────────────────────
    sourceKey: text('source_key').notNull(), // registry key, e.g. 'fda_federal_register'
    sourceName: text('source_name').notNull(), // human label, e.g. 'FDA — Federal Register'
    sourceType: text('source_type').notNull(), // ExternalIntelSourceType
    market: text('market'), // 'US' | 'EU' | 'UK' | 'AU' | 'JP' | 'global'
    regulatoryBody: text('regulatory_body'), // 'FDA' | 'EMA' | 'MHRA' | 'TGA' | null

    // ── The finding ─────────────────────────────────────────────
    externalId: text('external_id').notNull(), // stable id from the source (dedupe key)
    title: text('title').notNull(),
    summary: text('summary'),
    url: text('url'),
    topics: jsonb('topics').$type<string[]>().default([]).notNull(),
    publishedAt: timestamp('published_at'),
    fetchedAt: timestamp('fetched_at').defaultNow().notNull(),
  },
  table => ({
    dedupeIdx: uniqueIndex('external_intel_findings_dedupe_idx').on(
      table.sourceKey,
      table.externalId
    ),
    bodyIdx: index('external_intel_findings_body_idx').on(table.regulatoryBody),
    marketIdx: index('external_intel_findings_market_idx').on(table.market),
    publishedIdx: index('external_intel_findings_published_idx').on(table.publishedAt),
    fetchedIdx: index('external_intel_findings_fetched_idx').on(table.fetchedAt),
  })
);

export type ExternalIntelligenceFinding = InferSelectModel<typeof externalIntelligenceFindings>;

export const externalIntelligenceRuns = pgTable(
  'external_intelligence_runs',
  {
    id: serial('id').primaryKey(),
    startedAt: timestamp('started_at').defaultNow().notNull(),
    finishedAt: timestamp('finished_at'),
    sourcesChecked: integer('sources_checked').default(0).notNull(),
    sourcesFailed: integer('sources_failed').default(0).notNull(),
    findingsNew: integer('findings_new').default(0).notNull(),
    /** Per-source error messages, for ops triage. */
    errorSummary: jsonb('error_summary').$type<Array<{ sourceKey: string; error: string }>>()
      .default([])
      .notNull(),
  },
  table => ({
    startedIdx: index('external_intel_runs_started_idx').on(table.startedAt),
  })
);

export type ExternalIntelligenceRun = InferSelectModel<typeof externalIntelligenceRuns>;
