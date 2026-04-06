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

// ── Sub-Study Tasks & Approval ──────────────────────────────────────────────

/**
 * Tracks individual tasks/activities within CMC sub-studies.
 * Each task targets a specific data category (e.g. analytical method, stability study)
 * within a project and requires explicit approval before the data feeds Module 3.
 */
export const cmcSubStudyTasks = pgTable('cmc_sub_study_tasks', {
  id: uuid('id').defaultRandom().primaryKey(),
  organizationId: integer('organization_id').notNull().references(() => organizations.id),
  projectId: uuid('project_id').notNull().references(() => cmcProjects.id, { onDelete: 'cascade' }),
  /** The CMC data category this task covers */
  dataCategory: text('data_category').notNull(), // drug_substance, drug_product, method, stability, specification, batch, change_control, comparability, process_validation, excipient, container_closure, reference_standard
  /** Human-readable title */
  title: text('title').notNull(),
  description: text('description'),
  /** ID of the specific record (in the legacy CMC table) this task relates to, if any */
  sourceRecordId: text('source_record_id'),
  /** ID of the canonical source object, populated after write-through */
  sourceObjectId: uuid('source_object_id'),
  /** Module 3 sections impacted by this task */
  impactedSections: jsonb('impacted_sections'), // e.g. ['3.2.S.4', '3.2.S.7']
  /** Task lifecycle: draft → in_progress → data_entered → pending_review → approved → merged → rejected */
  status: text('status').notNull().default('draft'),
  /** Priority: low, medium, high, critical */
  priority: text('priority').notNull().default('medium'),
  /** Assigned user (data entry) */
  assignedTo: text('assigned_to'),
  /** Due date */
  dueDate: timestamp('due_date'),
  /** Whether the data has been pushed/merged into the project's Module 3 pipeline */
  mergedToModule3: boolean('merged_to_module3').notNull().default(false),
  mergedAt: timestamp('merged_at'),
  metadata: jsonb('metadata'),
  createdBy: text('created_by'),
  createdAt: timestamp('created_at').defaultNow().notNull(),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
});

/**
 * Approval records for CMC sub-study tasks.
 * Multiple approval levels can be configured per data category.
 */
export const cmcSubStudyApprovals = pgTable('cmc_sub_study_approvals', {
  id: uuid('id').defaultRandom().primaryKey(),
  organizationId: integer('organization_id').notNull().references(() => organizations.id),
  taskId: uuid('task_id').notNull().references(() => cmcSubStudyTasks.id, { onDelete: 'cascade' }),
  /** Approval level: 1 = data reviewer, 2 = QA/RA reviewer, 3 = study director */
  approvalLevel: integer('approval_level').notNull(),
  approvalLevelLabel: text('approval_level_label').notNull(), // e.g. 'Data Reviewer', 'QA Reviewer', 'Study Director'
  /** Who must approve */
  approverUserId: text('approver_user_id'),
  approverName: text('approver_name'),
  /** Approval decision */
  decision: text('decision'), // pending, approved, rejected, returned_for_revision
  decisionNote: text('decision_note'),
  decidedAt: timestamp('decided_at'),
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
