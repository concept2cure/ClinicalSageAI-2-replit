/**
 * Phase 6.6.D — Defense Packets Schema
 *
 * Drizzle ORM schema for the `defense_packets` table.
 * First-class compliance artifact: versioned, signed, lifecycle-managed.
 *
 * The Defense Packet is the canonical "receipt" that links:
 *   SE Matrix → Evidence Tasks → DOCX render → eCTD → Truth Machine
 *
 * @phase 6.6.D
 * @module shared/schema/defense-packets
 */

import { InferSelectModel, sql } from 'drizzle-orm';
import {
  integer,
  pgTable,
  text,
  timestamp,
  uuid,
  json,
  varchar,
  index,
  uniqueIndex,
} from 'drizzle-orm/pg-core';
import { createInsertSchema } from 'drizzle-zod';
import { z } from 'zod';

// ═══════════════════════════════════════════════════════════════════════════════
// DEFENSE PACKETS
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Status lifecycle:
 *   CREATED → RENDERING → RENDERED
 *   CREATED → FAILED (with error_code, error_detail)
 *   RENDERED → STALE (when upstream data changes)
 */
export type DefensePacketStatus = 'CREATED' | 'RENDERING' | 'RENDERED' | 'FAILED' | 'STALE';

export const defensePackets = pgTable(
  'defense_packets',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    programId: uuid('program_id').notNull(),
    subjectHash: text('subject_hash').notNull(),
    predicateKNumber: text('predicate_k_number').notNull(),

    // Risk code provenance
    riskCodeMapVersion: text('risk_code_map_version').notNull(),
    riskVocabHash: text('risk_vocab_hash').notNull(),
    generatorVersion: text('generator_version').notNull().default('6.6.C2'),

    // Scoring
    defenseReadinessScore: integer('defense_readiness_score').notNull(),
    topRisks: json('top_risks').$type<string[]>().default([]),

    // Full-fidelity artifacts (JSONB)
    tasks: json('tasks').$type<Record<string, unknown>[]>().default([]),
    sePayload: json('se_payload').$type<Record<string, unknown>>().default({}),
    subjectDevice: json('subject_device').$type<Record<string, string>>().default({}),
    riskCodesUsed: json('risk_codes_used').$type<string[]>().default([]),

    // Manifest / signature
    manifestHash: text('manifest_hash').notNull().unique(),
    productCode: text('product_code').notNull().default(''),

    // Lifecycle
    status: varchar('status', { length: 30 }).notNull().default('CREATED'),
    stalenessReason: text('staleness_reason'),

    // Render linkage
    renderJobId: text('render_job_id'),

    // Error tracking
    errorCode: text('error_code'),
    errorDetail: text('error_detail'),

    // Audit
    createdByUserId: text('created_by_user_id').notNull().default('system'),
    createdAt: timestamp('created_at').defaultNow().notNull(),
    updatedAt: timestamp('updated_at').defaultNow().notNull(),

    // Diff linkage
    previousPacketId: uuid('previous_packet_id'),
  },
  table => ({
    programIdx: index('idx_dp_program').on(table.programId),
    subjectIdx: index('idx_dp_subject').on(table.subjectHash),
    manifestIdx: uniqueIndex('idx_dp_manifest').on(table.manifestHash),
    statusIdx: index('idx_dp_status').on(table.status),
    createdIdx: index('idx_dp_created').on(table.createdAt),
    programSubIdx: index('idx_dp_program_sub').on(
      table.programId,
      table.subjectHash,
      table.createdAt
    ),
  })
);

// ═══════════════════════════════════════════════════════════════════════════════
// Types & Validation
// ═══════════════════════════════════════════════════════════════════════════════

export type DefensePacket = InferSelectModel<typeof defensePackets>;

export const insertDefensePacketSchema = createInsertSchema(defensePackets, {
  defenseReadinessScore: z.number().int().min(0).max(100),
  status: z.enum(['CREATED', 'RENDERING', 'RENDERED', 'FAILED', 'STALE']),
  topRisks: z.array(z.string()),
  riskCodesUsed: z.array(z.string()),
});

export type InsertDefensePacket = z.infer<typeof insertDefensePacketSchema>;
