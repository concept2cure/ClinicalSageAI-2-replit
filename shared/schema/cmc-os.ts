import { pgTable, uuid, text, integer, timestamp, boolean, jsonb } from 'drizzle-orm/pg-core';
import { organizations } from '../schema';
import { cmcProjects } from '../cmc-schema';

export const cmcSourceObjects = pgTable('cmc_source_objects', {
  id: uuid('id').defaultRandom().primaryKey(),
  organizationId: integer('organization_id').notNull().references(() => organizations.id),
  projectId: uuid('project_id').notNull().references(() => cmcProjects.id, { onDelete: 'cascade' }),
  sourceType: text('source_type').notNull(), // ds, dp, specification, method, stability, batch, change_control, comparability
  sourceKey: text('source_key').notNull(),
  sourcePayload: jsonb('source_payload').notNull(),
  sourceHash: text('source_hash').notNull(),
  version: integer('version').notNull().default(1),
  createdAt: timestamp('created_at').defaultNow().notNull(),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
});

export const cmcModule3Sections = pgTable('cmc_module3_sections', {
  id: uuid('id').defaultRandom().primaryKey(),
  organizationId: integer('organization_id').notNull().references(() => organizations.id),
  projectId: uuid('project_id').notNull().references(() => cmcProjects.id, { onDelete: 'cascade' }),
  sectionKey: text('section_key').notNull(), // e.g. 3.2.S.4.1
  sectionPath: text('section_path').notNull(),
  deterministicJson: jsonb('deterministic_json').notNull(),
  narrativeText: text('narrative_text'),
  compiledHash: text('compiled_hash').notNull(),
  stale: boolean('stale').notNull().default(false),
  staleReason: text('stale_reason'),
  approvalState: text('approval_state').notNull().default('draft'),
  approvedVersionId: uuid('approved_version_id'),
  createdAt: timestamp('created_at').defaultNow().notNull(),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
});

export const cmcSectionLineage = pgTable('cmc_section_lineage', {
  id: uuid('id').defaultRandom().primaryKey(),
  organizationId: integer('organization_id').notNull().references(() => organizations.id),
  sectionId: uuid('section_id').notNull().references(() => cmcModule3Sections.id, { onDelete: 'cascade' }),
  sourceObjectId: uuid('source_object_id').notNull().references(() => cmcSourceObjects.id, { onDelete: 'cascade' }),
  sourceHashAtCompile: text('source_hash_at_compile').notNull(),
  createdAt: timestamp('created_at').defaultNow().notNull(),
});

export const cmcContradictions = pgTable('cmc_contradictions', {
  id: uuid('id').defaultRandom().primaryKey(),
  organizationId: integer('organization_id').notNull().references(() => organizations.id),
  projectId: uuid('project_id').notNull().references(() => cmcProjects.id, { onDelete: 'cascade' }),
  severity: text('severity').notNull(), // low, medium, high, critical
  contradictionType: text('contradiction_type').notNull(),
  details: text('details').notNull(),
  impactedSections: jsonb('impacted_sections').notNull(),
  requiredReviewers: jsonb('required_reviewers').notNull(),
  status: text('status').notNull().default('open'),
  createdAt: timestamp('created_at').defaultNow().notNull(),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
});

export const cmcAiCommandResults = pgTable('cmc_ai_command_results', {
  id: text('id').primaryKey(),
  organizationId: integer('organization_id').notNull().references(() => organizations.id),
  projectId: uuid('project_id'),
  command: text('command').notNull(),
  drugName: text('drug_name').notNull(),
  category: text('category').notNull(),
  status: text('status').notNull(),
  estimatedTime: text('estimated_time'),
  result: text('result').notNull(),
  metadata: jsonb('metadata'),
  createdAt: timestamp('created_at').defaultNow().notNull(),
});

export const cmcModule3SectionVersions = pgTable('cmc_module3_section_versions', {
  id: uuid('id').defaultRandom().primaryKey(),
  organizationId: integer('organization_id').notNull().references(() => organizations.id),
  sectionId: uuid('section_id').notNull().references(() => cmcModule3Sections.id, { onDelete: 'cascade' }),
  projectId: uuid('project_id').notNull().references(() => cmcProjects.id, { onDelete: 'cascade' }),
  versionNumber: integer('version_number').notNull(),
  snapshotJson: jsonb('snapshot_json').notNull(),
  diffSummary: jsonb('diff_summary'),
  state: text('state').notNull().default('draft'), // draft, approved, superseded
  createdBy: text('created_by'),
  createdAt: timestamp('created_at').defaultNow().notNull(),
});

export const cmcProvenanceEvents = pgTable('cmc_provenance_events', {
  id: uuid('id').defaultRandom().primaryKey(),
  organizationId: integer('organization_id').notNull().references(() => organizations.id),
  projectId: uuid('project_id').notNull().references(() => cmcProjects.id, { onDelete: 'cascade' }),
  artifactType: text('artifact_type').notNull(), // section, source_object, contradiction
  artifactId: text('artifact_id').notNull(),
  eventType: text('event_type').notNull(), // compiled, approved, refreshed, contradicted
  eventPayload: jsonb('event_payload').notNull(),
  createdBy: text('created_by'),
  createdAt: timestamp('created_at').defaultNow().notNull(),
});
