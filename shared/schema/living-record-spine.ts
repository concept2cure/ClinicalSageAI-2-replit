/**
 * Living Record Spine — typed schema
 *
 * The value layer underneath the existing living-file cascade. Adds:
 *   - regulatory_sequences  the eCTD Sequence node (was missing from the spine)
 *   - canonical_facts       the Canonical Fact Store (one agreed value per
 *                           program + entity + field)
 *   - fact_bindings         Derived-Value Bindings (a typed target that should
 *                           agree with a fact: mirror | derived | override)
 *   - fact_drift            Drift Sentinel output (expected vs observed)
 *   - spine_nodes/edges     the canonical graph overlay (typed, versioned)
 *
 * DDL lives in migrations/20260603_living_record_spine.sql. This module is the
 * typed mirror the app layer queries through. It builds on the canonical claim
 * graph (evidenceClaims / evidenceClaimLinks / evidenceSources in schema.ts) and
 * does not duplicate it.
 *
 * See docs/architecture/LIVING_RECORD_SPINE.md for the full design.
 *
 * @module shared/schema/living-record-spine
 */

import { relations, InferSelectModel, sql } from 'drizzle-orm';
import {
  integer,
  pgTable,
  text,
  varchar,
  numeric,
  jsonb,
  uuid,
  timestamp,
  index,
  uniqueIndex,
} from 'drizzle-orm/pg-core';
import { createInsertSchema } from 'drizzle-zod';
import { z } from 'zod';

import { regulatoryPrograms } from './programs';

// ═══════════════════════════════════════════════════════════════════════════════
// Vocabulary (mirrors the CHECK-style domains in the migration)
// ═══════════════════════════════════════════════════════════════════════════════

export const SPINE_NODE_KINDS = [
  'program',
  'product',
  'substance',
  'device',
  'submission',
  'sequence',
  'document',
  'section',
  'claim',
  'evidence_value',
  'source_artifact',
] as const;
export type SpineNodeKind = (typeof SPINE_NODE_KINDS)[number];

export const SPINE_EDGE_KINDS = [
  'contains',
  'asserts',
  'supports',
  'contradicts',
  'references',
  'supported_by',
  'establishes',
  'derives',
  'supersedes',
  'binds_to',
] as const;
export type SpineEdgeKind = (typeof SPINE_EDGE_KINDS)[number];

export const FACT_STATUSES = ['active', 'disputed', 'superseded', 'retracted'] as const;
export type FactStatus = (typeof FACT_STATUSES)[number];

export const VALUE_TYPES = [
  'count',
  'measure',
  'date',
  'categorical',
  'boolean',
  'text',
] as const;
export type ValueType = (typeof VALUE_TYPES)[number];

export const BINDING_KINDS = ['mirror', 'derived', 'manual_override'] as const;
export type BindingKind = (typeof BINDING_KINDS)[number];

export const BINDING_STATUSES = ['bound', 'drifted', 'overridden', 'broken'] as const;
export type BindingStatus = (typeof BINDING_STATUSES)[number];

export const BINDING_TARGET_KINDS = ['claim', 'document', 'section', 'paragraph'] as const;
export type BindingTargetKind = (typeof BINDING_TARGET_KINDS)[number];

export const DRIFT_TYPES = [
  'value_mismatch',
  'unit_mismatch',
  'stale_source',
  'missing_target',
] as const;
export type DriftType = (typeof DRIFT_TYPES)[number];

export const DRIFT_STATUSES = ['open', 'acknowledged', 'resolved', 'dismissed'] as const;
export type DriftStatus = (typeof DRIFT_STATUSES)[number];

export const SEQUENCE_STATUSES = [
  'planning',
  'compiling',
  'validated',
  'submitted',
  'superseded',
] as const;
export type SequenceStatus = (typeof SEQUENCE_STATUSES)[number];

/** The Claim verification axis (the content axis stays on evidenceClaims.status). */
export const CLAIM_VERIFICATIONS = ['unverified', 'verified', 'drifted', 'disputed'] as const;
export type ClaimVerification = (typeof CLAIM_VERIFICATIONS)[number];

// ═══════════════════════════════════════════════════════════════════════════════
// regulatory_sequences — the eCTD Sequence node
// ═══════════════════════════════════════════════════════════════════════════════

export const regulatorySequences = pgTable(
  'regulatory_sequences',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    organizationId: integer('organization_id').notNull(),
    programId: uuid('program_id')
      .notNull()
      .references(() => regulatoryPrograms.id, { onDelete: 'cascade' }),
    submissionRef: text('submission_ref'),
    sequenceNumber: varchar('sequence_number', { length: 12 }).notNull(),
    title: text('title'),
    sequenceType: varchar('sequence_type', { length: 40 }).notNull().default('original'),
    status: varchar('status', { length: 20 }).notNull().default('planning'),
    supersededById: uuid('superseded_by_id'),
    submittedAt: timestamp('submitted_at', { withTimezone: true }),
    metadata: jsonb('metadata').default({}),
    createdBy: integer('created_by'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  table => ({
    programIdx: index('regulatory_sequences_program_idx').on(table.programId),
    orgIdx: index('regulatory_sequences_org_idx').on(table.organizationId),
    statusIdx: index('regulatory_sequences_status_idx').on(table.status),
    numberIdx: uniqueIndex('regulatory_sequences_number_idx').on(
      table.programId,
      table.sequenceNumber
    ),
  })
);

// ═══════════════════════════════════════════════════════════════════════════════
// canonical_facts — the Canonical Fact Store
// ═══════════════════════════════════════════════════════════════════════════════

export const canonicalFacts = pgTable(
  'canonical_facts',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    organizationId: integer('organization_id').notNull(),
    programId: uuid('program_id')
      .notNull()
      .references(() => regulatoryPrograms.id, { onDelete: 'cascade' }),
    entity: text('entity').notNull(),
    field: text('field').notNull(),
    valueNum: numeric('value_num'),
    valueText: text('value_text'),
    unit: varchar('unit', { length: 40 }),
    comparator: varchar('comparator', { length: 8 }).notNull().default('='),
    valueType: varchar('value_type', { length: 20 }).notNull().default('text'),
    establishedByClaimId: integer('established_by_claim_id'),
    establishedBySourceId: integer('established_by_source_id'),
    confidence: numeric('confidence', { precision: 5, scale: 4 }).notNull().default('0.5000'),
    status: varchar('status', { length: 20 }).notNull().default('active'),
    version: integer('version').notNull().default(1),
    supersedesId: uuid('supersedes_id'),
    contentHash: varchar('content_hash', { length: 64 }),
    metadata: jsonb('metadata').default({}),
    createdBy: integer('created_by'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  table => ({
    // one active fact per (program, entity, field) — the single source of truth
    activeKeyIdx: uniqueIndex('canonical_facts_active_key_idx')
      .on(table.programId, table.entity, table.field)
      .where(sql`${table.status} = 'active'`),
    programIdx: index('canonical_facts_program_idx').on(table.programId),
    orgIdx: index('canonical_facts_org_idx').on(table.organizationId),
    entityIdx: index('canonical_facts_entity_idx').on(table.programId, table.entity),
    statusIdx: index('canonical_facts_status_idx').on(table.status),
  })
);

// ═══════════════════════════════════════════════════════════════════════════════
// fact_bindings — Derived-Value Bindings
// ═══════════════════════════════════════════════════════════════════════════════

export const factBindings = pgTable(
  'fact_bindings',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    organizationId: integer('organization_id').notNull(),
    programId: uuid('program_id')
      .notNull()
      .references(() => regulatoryPrograms.id, { onDelete: 'cascade' }),
    factId: uuid('fact_id')
      .notNull()
      .references(() => canonicalFacts.id, { onDelete: 'cascade' }),
    target: text('target').notNull(),
    targetKind: varchar('target_kind', { length: 20 }).notNull(),
    bindingKind: varchar('binding_kind', { length: 20 }).notNull().default('mirror'),
    transform: jsonb('transform'),
    observedValue: text('observed_value'),
    bindingStatus: varchar('binding_status', { length: 20 }).notNull().default('bound'),
    overrideReason: text('override_reason'),
    lastCheckedAt: timestamp('last_checked_at', { withTimezone: true }),
    createdBy: integer('created_by'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  table => ({
    factTargetIdx: uniqueIndex('fact_bindings_fact_target_idx').on(table.factId, table.target),
    programIdx: index('fact_bindings_program_idx').on(table.programId),
    targetIdx: index('fact_bindings_target_idx').on(table.target),
    statusIdx: index('fact_bindings_status_idx').on(table.bindingStatus),
  })
);

// ═══════════════════════════════════════════════════════════════════════════════
// fact_drift — Drift Sentinel output
// ═══════════════════════════════════════════════════════════════════════════════

export const factDrift = pgTable(
  'fact_drift',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    organizationId: integer('organization_id').notNull(),
    programId: uuid('program_id')
      .notNull()
      .references(() => regulatoryPrograms.id, { onDelete: 'cascade' }),
    factId: uuid('fact_id')
      .notNull()
      .references(() => canonicalFacts.id, { onDelete: 'cascade' }),
    bindingId: uuid('binding_id').references(() => factBindings.id, { onDelete: 'cascade' }),
    expectedValue: text('expected_value'),
    observedValue: text('observed_value'),
    driftType: varchar('drift_type', { length: 24 }).notNull(),
    severity: varchar('severity', { length: 12 }).notNull().default('medium'),
    status: varchar('status', { length: 16 }).notNull().default('open'),
    detectedAt: timestamp('detected_at', { withTimezone: true }).notNull().defaultNow(),
    detectedBy: varchar('detected_by', { length: 40 }).notNull().default('drift_sentinel'),
    resolvedAt: timestamp('resolved_at', { withTimezone: true }),
    resolvedBy: integer('resolved_by'),
    resolution: text('resolution'),
    cascadeActionId: text('cascade_action_id'),
    metadata: jsonb('metadata').default({}),
  },
  table => ({
    programIdx: index('fact_drift_program_idx').on(table.programId),
    factIdx: index('fact_drift_fact_idx').on(table.factId),
    bindingIdx: index('fact_drift_binding_idx').on(table.bindingId),
  })
);

// ═══════════════════════════════════════════════════════════════════════════════
// spine_nodes / spine_edges — the canonical graph overlay
// ═══════════════════════════════════════════════════════════════════════════════

export const spineNodes = pgTable(
  'spine_nodes',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    organizationId: integer('organization_id').notNull(),
    programId: uuid('program_id')
      .notNull()
      .references(() => regulatoryPrograms.id, { onDelete: 'cascade' }),
    nodeKind: varchar('node_kind', { length: 24 }).notNull(),
    entityId: text('entity_id').notNull(),
    label: text('label'),
    metadata: jsonb('metadata').default({}),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  table => ({
    kindEntityIdx: uniqueIndex('spine_nodes_kind_entity_idx').on(
      table.programId,
      table.nodeKind,
      table.entityId
    ),
    programIdx: index('spine_nodes_program_idx').on(table.programId),
    kindIdx: index('spine_nodes_kind_idx').on(table.nodeKind),
  })
);

export const spineEdges = pgTable(
  'spine_edges',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    organizationId: integer('organization_id').notNull(),
    programId: uuid('program_id')
      .notNull()
      .references(() => regulatoryPrograms.id, { onDelete: 'cascade' }),
    fromNodeId: uuid('from_node_id')
      .notNull()
      .references(() => spineNodes.id, { onDelete: 'cascade' }),
    toNodeId: uuid('to_node_id')
      .notNull()
      .references(() => spineNodes.id, { onDelete: 'cascade' }),
    edgeKind: varchar('edge_kind', { length: 24 }).notNull(),
    confidence: numeric('confidence', { precision: 5, scale: 4 }).notNull().default('1.0000'),
    version: integer('version').notNull().default(1),
    metadata: jsonb('metadata').default({}),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  table => ({
    tripleIdx: uniqueIndex('spine_edges_triple_idx').on(
      table.fromNodeId,
      table.toNodeId,
      table.edgeKind
    ),
    programIdx: index('spine_edges_program_idx').on(table.programId),
    fromIdx: index('spine_edges_from_idx').on(table.fromNodeId),
    toIdx: index('spine_edges_to_idx').on(table.toNodeId),
    kindIdx: index('spine_edges_kind_idx').on(table.edgeKind),
  })
);

// ═══════════════════════════════════════════════════════════════════════════════
// living_record_program_links — bridge integer claim program ↔ uuid program
// ═══════════════════════════════════════════════════════════════════════════════

export const livingRecordProgramLinks = pgTable(
  'living_record_program_links',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    organizationId: integer('organization_id').notNull(),
    legacyProgramId: integer('legacy_program_id').notNull(),
    programId: uuid('program_id')
      .notNull()
      .references(() => regulatoryPrograms.id, { onDelete: 'cascade' }),
    createdBy: integer('created_by'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  table => ({
    orgLegacyIdx: uniqueIndex('living_record_program_links_org_legacy_idx').on(
      table.organizationId,
      table.legacyProgramId
    ),
    programIdx: index('living_record_program_links_program_idx').on(table.programId),
  })
);

export const insertLivingRecordProgramLinkSchema = createInsertSchema(
  livingRecordProgramLinks
).omit({ id: true, createdAt: true });
export type LivingRecordProgramLink = InferSelectModel<typeof livingRecordProgramLinks>;
export type InsertLivingRecordProgramLink = z.infer<typeof insertLivingRecordProgramLinkSchema>;

// ═══════════════════════════════════════════════════════════════════════════════
// Relations
// ═══════════════════════════════════════════════════════════════════════════════

export const canonicalFactsRelations = relations(canonicalFacts, ({ many }) => ({
  bindings: many(factBindings),
  drift: many(factDrift),
}));

export const factBindingsRelations = relations(factBindings, ({ one, many }) => ({
  fact: one(canonicalFacts, {
    fields: [factBindings.factId],
    references: [canonicalFacts.id],
  }),
  drift: many(factDrift),
}));

export const factDriftRelations = relations(factDrift, ({ one }) => ({
  fact: one(canonicalFacts, {
    fields: [factDrift.factId],
    references: [canonicalFacts.id],
  }),
  binding: one(factBindings, {
    fields: [factDrift.bindingId],
    references: [factBindings.id],
  }),
}));

export const spineEdgesRelations = relations(spineEdges, ({ one }) => ({
  fromNode: one(spineNodes, {
    fields: [spineEdges.fromNodeId],
    references: [spineNodes.id],
    relationName: 'from_node',
  }),
  toNode: one(spineNodes, {
    fields: [spineEdges.toNodeId],
    references: [spineNodes.id],
    relationName: 'to_node',
  }),
}));

// ═══════════════════════════════════════════════════════════════════════════════
// Insert schemas (Zod)
// ═══════════════════════════════════════════════════════════════════════════════

export const insertRegulatorySequenceSchema = createInsertSchema(regulatorySequences).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});
export const insertCanonicalFactSchema = createInsertSchema(canonicalFacts).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});
export const insertFactBindingSchema = createInsertSchema(factBindings).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});
export const insertFactDriftSchema = createInsertSchema(factDrift).omit({
  id: true,
  detectedAt: true,
});
export const insertSpineNodeSchema = createInsertSchema(spineNodes).omit({
  id: true,
  createdAt: true,
});
export const insertSpineEdgeSchema = createInsertSchema(spineEdges).omit({
  id: true,
  createdAt: true,
});

// ═══════════════════════════════════════════════════════════════════════════════
// Types
// ═══════════════════════════════════════════════════════════════════════════════

export type RegulatorySequence = InferSelectModel<typeof regulatorySequences>;
export type InsertRegulatorySequence = z.infer<typeof insertRegulatorySequenceSchema>;
export type CanonicalFact = InferSelectModel<typeof canonicalFacts>;
export type InsertCanonicalFact = z.infer<typeof insertCanonicalFactSchema>;
export type FactBinding = InferSelectModel<typeof factBindings>;
export type InsertFactBinding = z.infer<typeof insertFactBindingSchema>;
export type FactDrift = InferSelectModel<typeof factDrift>;
export type InsertFactDrift = z.infer<typeof insertFactDriftSchema>;
export type SpineNode = InferSelectModel<typeof spineNodes>;
export type InsertSpineNode = z.infer<typeof insertSpineNodeSchema>;
export type SpineEdge = InferSelectModel<typeof spineEdges>;
export type InsertSpineEdge = z.infer<typeof insertSpineEdgeSchema>;
