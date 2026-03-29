/**
 * AnA Intelligence System Schema
 *
 * Implements the CLAUDE.md Memory Compression Model for Concept2Cure (C2C):
 *
 * THREE-LEVEL HIERARCHY (merge/override):
 *   TOP    — Global.md  (Company)   → clientIntelligenceProfiles + clientMemoryEntries
 *   MIDDLE — Local.md   (Project)   → projectIntelligenceProfiles + projectMemoryEntries
 *   BOTTOM — User.md    (Personal)  → userIntelligenceProfiles (this file)
 *
 * FIVE INTELLIGENCE LEVELS (compounding independently):
 *   1. Personal  — AnA herself (platform-wide wisdom)     → anaPlatformWisdom
 *   2. Client    — Per company (existing tables)           → clientIntelligenceProfiles
 *   3. User      — Per person                              → userIntelligenceProfiles
 *   4. Project   — Per project (existing tables)           → projectIntelligenceProfiles
 *   5. Document  — Per document type within project        → projectMemoryEntries (doc_intel_*)
 *
 * PATH-SCOPED RULES (smart context loading):
 *   Only matching rule files load — context stays lean.    → anaScopedRules
 *
 * CAPABILITY DECLARATION (ana.md):
 *   AnA knows all her capabilities, logs outcomes, grows wiser. → anaCapabilityRegistry + anaOutcomeLog
 *
 * NAMING: Always "Concept2Cure" / "C2C" / "AnA 1.0 RI". Never "ClinicalSageAI".
 */

import {
  pgTable,
  serial,
  text,
  integer,
  boolean,
  timestamp,
  jsonb,
  real,
  index,
  uniqueIndex,
} from 'drizzle-orm/pg-core';
import { InferSelectModel } from 'drizzle-orm';
import { organizations, users, projects } from '../schema';

// ============================================================
// ANA CAPABILITY REGISTRY (GLOBAL — ana.md)
// ============================================================

/**
 * Every capability AnA has — slash commands, AI actions, analysis tools,
 * regulatory intelligence features. AnA reads this to know what she can do.
 * Filtered by project type + regulatory body at injection time.
 */
export const anaCapabilityRegistry = pgTable(
  'ana_capability_registry',
  {
    id: serial('id').primaryKey(),
    capabilityKey: text('capability_key').notNull().unique(),
    category: text('category').notNull(), // 'drafting', 'compliance', 'analysis', 'intelligence', 'knowledge', 'workflow', 'prediction', 'submission'
    name: text('name').notNull(),
    description: text('description').notNull(),

    // ── How to invoke ────────────────────────────────────────────
    slashCommand: text('slash_command'), // '/compliance-scan', '/draft-section', etc.
    apiEndpoint: text('api_endpoint'), // route path for programmatic invocation
    triggerPatterns: jsonb('trigger_patterns').$type<string[]>().default([]), // natural language triggers

    // ── Applicability scope ──────────────────────────────────────
    regulatoryBodiesApplicable: jsonb('regulatory_bodies_applicable').$type<string[]>().default([]), // ['FDA','EMA','PMDA',...]
    projectTypesApplicable: jsonb('project_types_applicable').$type<string[]>().default([]), // ['IND','NDA','BLA','510k',...]
    documentTypesApplicable: jsonb('document_types_applicable').$type<string[]>().default([]), // ['csr','protocol','ib',...]

    // ── Effectiveness tracking (aggregated from outcome log) ────
    successCount: integer('success_count').default(0).notNull(),
    failureCount: integer('failure_count').default(0).notNull(),
    partialCount: integer('partial_count').default(0).notNull(),
    avgQualityScore: real('avg_quality_score'),
    lastUsedAt: timestamp('last_used_at'),

    // ── Metadata ────────────────────────────────────────────────
    isActive: boolean('is_active').default(true).notNull(),
    version: text('version').default('1.0.0'),
    createdAt: timestamp('created_at').defaultNow().notNull(),
    updatedAt: timestamp('updated_at').defaultNow().notNull(),
  },
  table => ({
    categoryIdx: index('ana_cap_registry_category_idx').on(table.category),
    activeIdx: index('ana_cap_registry_active_idx').on(table.isActive),
  })
);

export type AnaCapability = InferSelectModel<typeof anaCapabilityRegistry>;

// ============================================================
// ANA OUTCOME LOG (CROSS-CLIENT LEARNING)
// ============================================================

/**
 * Every AI action AnA performs is logged here with outcome, quality, and
 * user feedback. This is the raw data for the wisdom accumulation engine.
 * Cross-client patterns are extracted anonymously from this table.
 */
export const anaOutcomeLog = pgTable(
  'ana_outcome_log',
  {
    id: serial('id').primaryKey(),
    organizationId: integer('organization_id')
      .notNull()
      .references(() => organizations.id),
    projectId: integer('project_id').references(() => projects.id),
    userId: integer('user_id').references(() => users.id),

    // ── What happened ────────────────────────────────────────────
    capabilityKey: text('capability_key').notNull(), // FK to anaCapabilityRegistry
    actionType: text('action_type').notNull(), // 'draft', 'scan', 'analyze', 'extract', 'predict', 'recommend'
    inputSummary: text('input_summary'), // compressed description of input (no PII)

    // ── Outcome ──────────────────────────────────────────────────
    outcome: text('outcome').notNull(), // 'success' | 'partial' | 'failure'
    qualityScore: integer('quality_score'), // 0-100
    userFeedback: text('user_feedback'), // 'accepted' | 'edited' | 'rejected' | 'regenerated'
    editDelta: text('edit_delta'), // what the user changed (the gold signal)
    errorMessage: text('error_message'),
    resolution: text('resolution'), // how a failure was resolved

    // ── Context (for pattern matching) ───────────────────────────
    regulatoryBody: text('regulatory_body'), // which agency context
    projectType: text('project_type'), // IND, NDA, 510k, etc.
    therapeuticArea: text('therapeutic_area'),
    documentType: text('document_type'), // csr, protocol, ib, etc.
    sectionCode: text('section_code'), // CTD section code

    // ── Performance ──────────────────────────────────────────────
    durationMs: integer('duration_ms'),
    tokenCount: integer('token_count'),

    // ── AnA's self-reflection ────────────────────────────────────
    lessonsLearned: text('lessons_learned'), // AI-generated reflection on failures

    createdAt: timestamp('created_at').defaultNow().notNull(),
  },
  table => ({
    orgIdx: index('ana_outcome_log_org_idx').on(table.organizationId),
    projectIdx: index('ana_outcome_log_project_idx').on(table.projectId),
    capabilityIdx: index('ana_outcome_log_capability_idx').on(table.capabilityKey),
    outcomeIdx: index('ana_outcome_log_outcome_idx').on(table.outcome),
    regulatoryIdx: index('ana_outcome_log_regulatory_idx').on(table.regulatoryBody),
    projectTypeIdx: index('ana_outcome_log_project_type_idx').on(table.projectType),
    createdAtIdx: index('ana_outcome_log_created_idx').on(table.createdAt),
  })
);

export type AnaOutcome = InferSelectModel<typeof anaOutcomeLog>;

// ============================================================
// ANA PROJECT CAPABILITIES (LOCAL — per-project)
// ============================================================

/**
 * Tracks which capabilities AnA uses for each project and how effective they are.
 * Auto-detected from project type + regulatory bodies, can be manually toggled.
 */
export const anaProjectCapabilities = pgTable(
  'ana_project_capabilities',
  {
    id: serial('id').primaryKey(),
    projectId: integer('project_id')
      .notNull()
      .references(() => projects.id),
    organizationId: integer('organization_id')
      .notNull()
      .references(() => organizations.id),
    capabilityKey: text('capability_key').notNull(), // FK to anaCapabilityRegistry

    // ── Usage tracking ──────────────────────────────────────────
    enabled: boolean('enabled').default(true).notNull(),
    timesUsed: integer('times_used').default(0).notNull(),
    lastUsedAt: timestamp('last_used_at'),
    projectSpecificNotes: text('project_specific_notes'),

    // ── Effectiveness (computed from outcomes) ──────────────────
    effectivenessScore: real('effectiveness_score'), // 0-1, computed
    successRate: real('success_rate'), // success / (success + failure)

    createdAt: timestamp('created_at').defaultNow().notNull(),
    updatedAt: timestamp('updated_at').defaultNow().notNull(),
  },
  table => ({
    projectCapIdx: uniqueIndex('ana_project_cap_unique_idx').on(
      table.projectId,
      table.capabilityKey
    ),
    orgIdx: index('ana_project_cap_org_idx').on(table.organizationId),
  })
);

export type AnaProjectCapability = InferSelectModel<typeof anaProjectCapabilities>;

// ============================================================
// USER INTELLIGENCE PROFILES (GLOBAL — per-user, User.md)
// ============================================================

/**
 * Per-user context within a company. This is the BOTTOM layer (User.md)
 * that overrides both Global.md (company) and Local.md (project) settings.
 * Private to each user — like CLAUDE.local.md (gitignored).
 */
export const userIntelligenceProfiles = pgTable(
  'user_intelligence_profiles',
  {
    id: serial('id').primaryKey(),
    userId: integer('user_id')
      .notNull()
      .references(() => users.id),
    organizationId: integer('organization_id')
      .notNull()
      .references(() => organizations.id),

    // ── Identity ────────────────────────────────────────────────
    displayName: text('display_name'),
    role: text('role'), // 'Regulatory Affairs Director', 'Medical Writer', etc.
    department: text('department'), // 'Regulatory', 'Clinical', 'CMC', 'Quality'
    expertiseAreas: jsonb('expertise_areas').$type<string[]>().default([]), // ['CMC', 'Clinical', 'Biostatistics']

    // ── Regulatory specializations ──────────────────────────────
    regulatorySpecializations: jsonb('regulatory_specializations').$type<string[]>().default([]), // ['FDA CMC', 'EMA Clinical']

    // ── How AnA should work for this user ────────────────────────
    communicationStyle: text('communication_style'), // 'concise' | 'detailed' | 'technical' | 'executive'
    personalInstructions: text('personal_instructions'), // User's own CLAUDE.local.md for AnA
    workflowPreferences: jsonb('workflow_preferences').$type<Record<string, unknown>>().default({}),

    // ── AnA-learned patterns (auto-populated) ───────────────────
    preferredCapabilities: jsonb('preferred_capabilities').$type<string[]>().default([]), // most-used capability keys
    projectsContributed: jsonb('projects_contributed').$type<number[]>().default([]), // project IDs
    editingPatterns: jsonb('editing_patterns').$type<Record<string, unknown>>().default({}), // what they typically change

    // ── Engagement metrics ──────────────────────────────────────
    totalInteractions: integer('total_interactions').default(0).notNull(),
    avgSatisfactionScore: real('avg_satisfaction_score'),
    lastActiveAt: timestamp('last_active_at'),

    createdAt: timestamp('created_at').defaultNow().notNull(),
    updatedAt: timestamp('updated_at').defaultNow().notNull(),
  },
  table => ({
    userOrgIdx: uniqueIndex('user_intel_profiles_user_org_idx').on(
      table.userId,
      table.organizationId
    ),
    orgIdx: index('user_intel_profiles_org_idx').on(table.organizationId),
  })
);

export type UserIntelligenceProfile = InferSelectModel<typeof userIntelligenceProfiles>;

// ============================================================
// ANA PLATFORM WISDOM (LEVEL 1 — AnA's Personal Intelligence)
// ============================================================

/**
 * Anonymized, cross-client wisdom that AnA accumulates over time.
 * No client-identifying data — only structural patterns.
 * Requires min 10 data points before surfacing.
 * This is the compounding moat — AnA at year 3 knows things no competitor can.
 */
export const anaPlatformWisdom = pgTable(
  'ana_platform_wisdom',
  {
    id: serial('id').primaryKey(),
    wisdomKey: text('wisdom_key').notNull().unique(),

    // ── Classification ──────────────────────────────────────────
    category: text('category').notNull(), // 'risk_reduction' | 'success_pattern' | 'deficiency_prevention' | 'reviewer_preference' | 'process_optimization'
    regulatoryBody: text('regulatory_body'), // which agency (nullable = applies to all)
    projectType: text('project_type'), // IND, NDA, 510k, etc.
    therapeuticArea: text('therapeutic_area'),
    documentType: text('document_type'), // which doc type

    // ── Wisdom content ──────────────────────────────────────────
    patternDescription: text('pattern_description').notNull(), // what AnA observed
    recommendation: text('recommendation').notNull(), // what AnA recommends

    // ── Evidence & confidence ───────────────────────────────────
    confidenceScore: real('confidence_score').default(0.5).notNull(), // 0-1
    evidenceCount: integer('evidence_count').default(0).notNull(), // data points supporting this
    minEvidenceThreshold: integer('min_evidence_threshold').default(10).notNull(),
    effectivenessScore: real('effectiveness_score'), // measured improvement when followed

    // ── Validation ──────────────────────────────────────────────
    isActive: boolean('is_active').default(true).notNull(),
    lastValidatedAt: timestamp('last_validated_at'),
    rejectionRate: real('rejection_rate'), // if > 0.3 over 20+ instances, demoted

    createdAt: timestamp('created_at').defaultNow().notNull(),
    updatedAt: timestamp('updated_at').defaultNow().notNull(),
  },
  table => ({
    categoryIdx: index('ana_wisdom_category_idx').on(table.category),
    regulatoryIdx: index('ana_wisdom_regulatory_idx').on(table.regulatoryBody),
    projectTypeIdx: index('ana_wisdom_project_type_idx').on(table.projectType),
    activeIdx: index('ana_wisdom_active_idx').on(table.isActive),
    confidenceIdx: index('ana_wisdom_confidence_idx').on(table.confidenceScore),
  })
);

export type AnaPlatformWisdomEntry = InferSelectModel<typeof anaPlatformWisdom>;

// ============================================================
// ANA SCOPED RULES (PATH-SCOPED — Smart Context Loading)
// ============================================================

/**
 * One file per concern, one scope per file. Only matching rules load
 * into the prompt — everything else stays dormant. Context stays lean.
 *
 * Example: User drafting CSR → only ana-csr-drafting loads.
 *          User doing FDA compliance scan → only ana-fda-compliance loads.
 *          CSR + FDA? Both load. Protocol, 510(k), EMA rules stay dormant.
 */
export const anaScopedRules = pgTable(
  'ana_scoped_rules',
  {
    id: serial('id').primaryKey(),
    ruleKey: text('rule_key').notNull().unique(), // 'ana-csr-drafting', 'ana-fda-compliance', etc.
    name: text('name').notNull(),
    description: text('description'),

    // ── Scope declarations (what triggers this rule to load) ────
    scopeDocumentTypes: jsonb('scope_document_types').$type<string[]>().default([]), // ['csr', 'protocol']
    scopeCapabilities: jsonb('scope_capabilities').$type<string[]>().default([]), // ['compliance_scan', 'foresight']
    scopeRegulatoryBodies: jsonb('scope_regulatory_bodies').$type<string[]>().default([]), // ['FDA', 'EMA']
    scopeWorkflowStages: jsonb('scope_workflow_stages').$type<string[]>().default([]), // ['drafting', 'review']
    scopeSectionCodes: jsonb('scope_section_codes').$type<string[]>().default([]), // ['2.5', '3.2.S']
    scopeSlashCommands: jsonb('scope_slash_commands').$type<string[]>().default([]), // ['/compliance-scan']

    // ── Rule content ────────────────────────────────────────────
    ruleContent: text('rule_content').notNull(), // The ~50-line instruction set for AnA

    // ── Priority & status ───────────────────────────────────────
    priority: integer('priority').default(100).notNull(), // higher = loaded first when multiple match
    isActive: boolean('is_active').default(true).notNull(),

    createdAt: timestamp('created_at').defaultNow().notNull(),
    updatedAt: timestamp('updated_at').defaultNow().notNull(),
  },
  table => ({
    activeIdx: index('ana_scoped_rules_active_idx').on(table.isActive),
    priorityIdx: index('ana_scoped_rules_priority_idx').on(table.priority),
  })
);

export type AnaScopedRule = InferSelectModel<typeof anaScopedRules>;

// ============================================================
// ANA CLIENT OBJECTIVES (extends client_intelligence_profiles)
// ============================================================

/**
 * Company-level and project-level objectives that AnA tracks.
 * AnA frames all recommendations in terms of objective achievement.
 */
export const anaClientObjectives = pgTable(
  'ana_client_objectives',
  {
    id: serial('id').primaryKey(),
    organizationId: integer('organization_id')
      .notNull()
      .references(() => organizations.id),
    projectId: integer('project_id').references(() => projects.id), // null = company-level

    // ── Objective ───────────────────────────────────────────────
    objective: text('objective').notNull(),
    category: text('category').notNull(), // 'regulatory' | 'clinical' | 'commercial' | 'quality' | 'timeline'
    priority: text('priority').default('medium').notNull(), // 'critical' | 'high' | 'medium'
    targetDate: timestamp('target_date'),
    status: text('status').default('on_track').notNull(), // 'on_track' | 'at_risk' | 'behind' | 'achieved'
    successCriteria: text('success_criteria'),
    riskFactors: text('risk_factors'),

    // ── Linkage ─────────────────────────────────────────────────
    parentObjectiveId: integer('parent_objective_id'), // links project objective to company objective
    linkedProjectIds: jsonb('linked_project_ids').$type<number[]>().default([]),

    createdBy: integer('created_by').references(() => users.id),
    createdAt: timestamp('created_at').defaultNow().notNull(),
    updatedAt: timestamp('updated_at').defaultNow().notNull(),
  },
  table => ({
    orgIdx: index('ana_objectives_org_idx').on(table.organizationId),
    projectIdx: index('ana_objectives_project_idx').on(table.projectId),
    statusIdx: index('ana_objectives_status_idx').on(table.status),
    categoryIdx: index('ana_objectives_category_idx').on(table.category),
  })
);

export type AnaClientObjective = InferSelectModel<typeof anaClientObjectives>;
