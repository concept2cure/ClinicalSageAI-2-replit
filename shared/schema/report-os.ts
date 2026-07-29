import { relations, sql, InferSelectModel } from 'drizzle-orm';
import {
  pgTable,
  serial,
  integer,
  text,
  timestamp,
  json,
  boolean,
  uniqueIndex,
  index,
  uuid,
} from 'drizzle-orm/pg-core';
import { organizations, clientWorkspaces, projects, users, immutableReportRecords } from '../schema';

export const reportScopeEnum = ['account', 'program', 'project', 'study', 'submission', 'document'] as const;
export type ReportScope = (typeof reportScopeEnum)[number];

export const reportProgramGroups = pgTable(
  'report_program_groups',
  {
    id: serial('id').primaryKey(),
    groupUuid: uuid('group_uuid').defaultRandom().notNull().unique(),
    organizationId: integer('organization_id').notNull().references(() => organizations.id, { onDelete: 'cascade' }),
    clientWorkspaceId: integer('client_workspace_id').references(() => clientWorkspaces.id, { onDelete: 'set null' }),
    name: text('name').notNull(),
    description: text('description'),
    status: text('status').notNull().default('active'),
    metadata: json('metadata'),
    createdBy: integer('created_by').references(() => users.id, { onDelete: 'set null' }),
    updatedBy: integer('updated_by').references(() => users.id, { onDelete: 'set null' }),
    createdAt: timestamp('created_at').defaultNow().notNull(),
    updatedAt: timestamp('updated_at').defaultNow().notNull(),
    archivedAt: timestamp('archived_at'),
  },
  table => ({
    orgIdx: index('report_program_groups_org_idx').on(table.organizationId),
    statusIdx: index('report_program_groups_status_idx').on(table.status),
  })
);

export const reportProgramGroupProjects = pgTable(
  'report_program_group_projects',
  {
    id: serial('id').primaryKey(),
    programGroupId: integer('program_group_id').notNull().references(() => reportProgramGroups.id, { onDelete: 'cascade' }),
    projectId: integer('project_id').notNull().references(() => projects.id, { onDelete: 'cascade' }),
    addedBy: integer('added_by').references(() => users.id, { onDelete: 'set null' }),
    addedAt: timestamp('added_at').defaultNow().notNull(),
  },
  table => ({
    uniq: uniqueIndex('report_program_group_projects_unique_idx').on(table.programGroupId, table.projectId),
    groupIdx: index('report_program_group_projects_group_idx').on(table.programGroupId),
    projectIdx: index('report_program_group_projects_project_idx').on(table.projectId),
  })
);

export const reportProgramGroupSnapshots = pgTable(
  'report_program_group_snapshots',
  {
    id: serial('id').primaryKey(),
    programGroupId: integer('program_group_id')
      .notNull()
      .references(() => reportProgramGroups.id, { onDelete: 'cascade' }),
    organizationId: integer('organization_id')
      .notNull()
      .references(() => organizations.id, { onDelete: 'cascade' }),
    snapshotLabel: text('snapshot_label'),
    snapshotReason: text('snapshot_reason'),
    asOf: timestamp('as_of').notNull().defaultNow(),
    projectSetHash: text('project_set_hash'),
    projectIds: json('project_ids').$type<number[]>().default(sql`'[]'::json`),
    createdBy: integer('created_by').references(() => users.id, { onDelete: 'set null' }),
    createdAt: timestamp('created_at').defaultNow().notNull(),
  },
  table => ({
    groupIdx: index('report_program_group_snapshots_group_idx').on(table.programGroupId),
    asOfIdx: index('report_program_group_snapshots_asof_idx').on(table.asOf),
  })
);

export const reportTypeRegistry = pgTable(
  'report_type_registry',
  {
    id: serial('id').primaryKey(),
    typeId: text('type_id').notNull().unique(),
    label: text('label').notNull(),
    family: text('family').notNull(),
    allowedScopes: json('allowed_scopes').$type<ReportScope[]>().notNull(),
    allowedPersonas: json('allowed_personas').$type<string[]>().default(sql`'[]'::json`),
    allowedClientSegments: json('allowed_client_segments').$type<string[]>().default(sql`'[]'::json`),
    dataDependencies: json('data_dependencies').$type<string[]>().default(sql`'[]'::json`),
    artifactDependencies: json('artifact_dependencies').$type<string[]>().default(sql`'[]'::json`),
    workflowDependencies: json('workflow_dependencies').$type<string[]>().default(sql`'[]'::json`),
    anaModules: json('ana_modules').$type<string[]>().default(sql`'[]'::json`),
    exportTemplate: text('export_template'),
    governanceRequirements: json('governance_requirements'),
    truthfulnessRules: json('truthfulness_rules'),
    enabled: boolean('enabled').notNull().default(true),
    createdAt: timestamp('created_at').defaultNow().notNull(),
    updatedAt: timestamp('updated_at').defaultNow().notNull(),
  },
  table => ({
    familyIdx: index('report_type_registry_family_idx').on(table.family),
    enabledIdx: index('report_type_registry_enabled_idx').on(table.enabled),
  })
);

export const reportRuns = pgTable(
  'report_runs',
  {
    id: serial('id').primaryKey(),
    runUuid: uuid('run_uuid').defaultRandom().notNull().unique(),
    organizationId: integer('organization_id').notNull().references(() => organizations.id, { onDelete: 'cascade' }),
    clientWorkspaceId: integer('client_workspace_id').references(() => clientWorkspaces.id, { onDelete: 'set null' }),
    scopeType: text('scope_type').notNull(),
    scopeId: text('scope_id').notNull(),
    reportTypeId: text('report_type_id')
      .notNull()
      .references(() => reportTypeRegistry.typeId, { onDelete: 'restrict' }),
    status: text('status').notNull().default('queued'),
    requestedBy: integer('requested_by').references(() => users.id, { onDelete: 'set null' }),
    dependencySummary: json('dependency_summary'),
    blockers: json('blockers'),
    confidence: integer('confidence'),
    freshness: json('freshness'),
    error: text('error'),
    startedAt: timestamp('started_at').defaultNow().notNull(),
    completedAt: timestamp('completed_at'),
    createdAt: timestamp('created_at').defaultNow().notNull(),
    updatedAt: timestamp('updated_at').defaultNow().notNull(),
  },
  table => ({
    orgIdx: index('report_runs_org_idx').on(table.organizationId),
    scopeIdx: index('report_runs_scope_idx').on(table.scopeType, table.scopeId),
    typeIdx: index('report_runs_type_idx').on(table.reportTypeId),
    statusIdx: index('report_runs_status_idx').on(table.status),
  })
);

export const reportSnapshots = pgTable(
  'report_snapshots',
  {
    id: serial('id').primaryKey(),
    runId: integer('run_id').notNull().references(() => reportRuns.id, { onDelete: 'cascade' }),
    organizationId: integer('organization_id').notNull().references(() => organizations.id, { onDelete: 'cascade' }),
    scopeType: text('scope_type').notNull(),
    scopeId: text('scope_id').notNull(),
    snapshotVersion: integer('snapshot_version').notNull().default(1),
    isLatest: boolean('is_latest').notNull().default(true),
    previousSnapshotId: integer('previous_snapshot_id'),
    artifactRecordId: integer('artifact_record_id').references(() => immutableReportRecords.id, { onDelete: 'set null' }),
    snapshotMetadata: json('snapshot_metadata'),
    createdBy: integer('created_by').references(() => users.id, { onDelete: 'set null' }),
    createdAt: timestamp('created_at').defaultNow().notNull(),
  },
  table => ({
    runIdx: index('report_snapshots_run_idx').on(table.runId),
    scopeIdx: index('report_snapshots_scope_idx').on(table.scopeType, table.scopeId),
    latestIdx: index('report_snapshots_latest_idx').on(table.isLatest),
  })
);

export const reportRunDependencies = pgTable(
  'report_run_dependencies',
  {
    id: serial('id').primaryKey(),
    runId: integer('run_id')
      .notNull()
      .references(() => reportRuns.id, { onDelete: 'cascade' }),
    organizationId: integer('organization_id')
      .notNull()
      .references(() => organizations.id, { onDelete: 'cascade' }),
    provider: text('provider').notNull(),
    status: text('status').notNull(),
    blocker: text('blocker'),
    observedAt: timestamp('observed_at').notNull().defaultNow(),
    payload: json('payload'),
    createdAt: timestamp('created_at').defaultNow().notNull(),
  },
  table => ({
    runIdx: index('report_run_dependencies_run_idx').on(table.runId),
    providerIdx: index('report_run_dependencies_provider_idx').on(table.provider),
    statusIdx: index('report_run_dependencies_status_idx').on(table.status),
  })
);

/**
 * Stored shape of a subscription schedule. Structurally equivalent to the
 * `ReportSchedule` type in server/services/report-os/scheduling/types.ts; kept
 * local so `shared/` stays free of a `server/` import (and the import cycle that
 * would create, since that module imports `ReportScope` from this file). The
 * service casts rows back to its `ReportSchedule` type for cadence math.
 */
export interface ReportScheduleJson {
  cadence: 'daily' | 'weekly' | 'monthly';
  hour: number;
  minute?: number;
  dayOfWeek?: number;
  dayOfMonth?: number;
  timeZoneOffsetMinutes?: number;
}

export const reportSubscriptions = pgTable(
  'report_subscriptions',
  {
    id: serial('id').primaryKey(),
    organizationId: integer('organization_id').notNull().references(() => organizations.id, { onDelete: 'cascade' }),
    clientWorkspaceId: integer('client_workspace_id').references(() => clientWorkspaces.id, { onDelete: 'set null' }),
    reportTypeId: text('report_type_id')
      .notNull()
      .references(() => reportTypeRegistry.typeId, { onDelete: 'restrict' }),
    scopeType: text('scope_type').notNull(),
    scopeId: text('scope_id').notNull(),
    schedule: json('schedule').$type<ReportScheduleJson>().notNull(),
    recipients: json('recipients').$type<string[]>().default(sql`'[]'::json`),
    format: text('format').notNull().default('pdf'),
    channel: text('channel').notNull().default('platform'),
    persona: text('persona'),
    enabled: boolean('enabled').notNull().default(true),
    lastRunAt: timestamp('last_run_at'),
    nextRunAt: timestamp('next_run_at'),
    createdBy: integer('created_by').references(() => users.id, { onDelete: 'set null' }),
    createdAt: timestamp('created_at').defaultNow().notNull(),
    updatedAt: timestamp('updated_at').defaultNow().notNull(),
  },
  table => ({
    orgIdx: index('report_subscriptions_org_idx').on(table.organizationId),
    enabledIdx: index('report_subscriptions_enabled_idx').on(table.enabled),
  })
);

/**
 * One panel of an AnA-authored dashboard/canvas: a governed report type run
 * over a scope. Every panel resolves to a real governed run (computed via the
 * same orchestrator + entitlement gate as a direct run) — the canvas composes
 * governed outputs, it never introduces a new number source.
 */
export interface ReportCanvasPanel {
  reportTypeId: string;
  scopeType: ReportScope;
  /** Optional pinned scope id; when absent the panel inherits the canvas's
   *  viewing scope at render time. */
  scopeId?: string | null;
  /** Optional display label override (else the report type's label is used). */
  label?: string | null;
}

/** The persisted spec of an AnA-authored dashboard/canvas. */
export interface ReportDefinitionSpec {
  /** Default scope the canvas is viewed at (panels may pin their own). */
  scopeType: ReportScope;
  panels: ReportCanvasPanel[];
}

/**
 * A saved dashboard / report canvas — a titled, ordered set of governed
 * report-type panels, authored conversationally by AnA (or by hand). Org-scoped,
 * soft-deletable. The spec references report_type_registry typeIds; rendering a
 * canvas generates/fetches each panel's governed run. There is no free-form
 * content here — every panel is a governed report type, keeping the whole canvas
 * inside the truthfulness contract.
 */
export const reportDefinitions = pgTable(
  'report_definitions',
  {
    id: serial('id').primaryKey(),
    definitionUuid: uuid('definition_uuid').defaultRandom().notNull().unique(),
    organizationId: integer('organization_id').notNull().references(() => organizations.id, { onDelete: 'cascade' }),
    clientWorkspaceId: integer('client_workspace_id').references(() => clientWorkspaces.id, { onDelete: 'set null' }),
    title: text('title').notNull(),
    description: text('description'),
    /** 'dashboard' (multi-panel canvas) | 'report' (single governed report). */
    kind: text('kind').notNull().default('dashboard'),
    spec: json('spec').$type<ReportDefinitionSpec>().notNull(),
    /** How this definition was authored: 'ana' | 'preset' | 'manual'. */
    origin: text('origin').notNull().default('manual'),
    /** Optional persona lens the canvas was framed for (REPORT_PERSONAS). */
    persona: text('persona'),
    status: text('status').notNull().default('active'),
    createdBy: integer('created_by').references(() => users.id, { onDelete: 'set null' }),
    updatedBy: integer('updated_by').references(() => users.id, { onDelete: 'set null' }),
    createdAt: timestamp('created_at').defaultNow().notNull(),
    updatedAt: timestamp('updated_at').defaultNow().notNull(),
    archivedAt: timestamp('archived_at'),
  },
  table => ({
    orgIdx: index('report_definitions_org_idx').on(table.organizationId),
    statusIdx: index('report_definitions_status_idx').on(table.status),
  })
);

export const reportProgramGroupsRelations = relations(reportProgramGroups, ({ many }) => ({
  projects: many(reportProgramGroupProjects),
  snapshots: many(reportProgramGroupSnapshots),
}));

export const reportProgramGroupProjectsRelations = relations(reportProgramGroupProjects, ({ one }) => ({
  group: one(reportProgramGroups, {
    fields: [reportProgramGroupProjects.programGroupId],
    references: [reportProgramGroups.id],
  }),
  project: one(projects, {
    fields: [reportProgramGroupProjects.projectId],
    references: [projects.id],
  }),
}));

export const reportProgramGroupSnapshotsRelations = relations(
  reportProgramGroupSnapshots,
  ({ one }) => ({
    group: one(reportProgramGroups, {
      fields: [reportProgramGroupSnapshots.programGroupId],
      references: [reportProgramGroups.id],
    }),
  })
);

export type ReportProgramGroup = InferSelectModel<typeof reportProgramGroups>;
export type ReportRun = InferSelectModel<typeof reportRuns>;
export type ReportSnapshot = InferSelectModel<typeof reportSnapshots>;
export type ReportSubscriptionRow = InferSelectModel<typeof reportSubscriptions>;
export type ReportDefinitionRow = InferSelectModel<typeof reportDefinitions>;
