/**
 * @fileoverview Mission Control PM Schema — Program OS
 * @module shared/pm-schema
 * @version 1.0.0
 *
 * @description
 * Core data objects for Concept2Cure Mission Control:
 * Program → Destination → Route Plan → Artifacts → Evidence → Dependencies →
 * Decisions → Review Cycles → Risk Signals → Collaboration
 *
 * This is regulated program execution intelligence, not a task tracker.
 *
 * @compliance
 * - FDA 21 CFR Part 11: Audit trail, e-signatures, provenance
 * - ICH M4 / eCTD: Dossier placement awareness
 * - Multi-tenant: All tables scoped by organizationId
 */

import {
  pgTable,
  serial,
  text,
  integer,
  timestamp,
  json,
  jsonb,
  boolean,
  real,
  index,
  unique,
} from 'drizzle-orm/pg-core';
import { relations } from 'drizzle-orm';

// ═══════════════════════════════════════════════════════════════════════════════
// 1. PROGRAM — Top-level regulated initiative
// ═══════════════════════════════════════════════════════════════════════════════

export const programs = pgTable('pm_programs', {
  id: serial('id').primaryKey(),
  organizationId: integer('organization_id').notNull(),
  createdById: integer('created_by_id'),
  ownerId: integer('owner_id'),

  name: text('name').notNull(),
  code: text('code'), // e.g., "PROG-001"
  description: text('description'),

  // Domain context
  customerTrack: text('customer_track').notNull(), // biotech, pharma, cro, device, diagnostics
  productCategory: text('product_category'), // small molecule, biologic, device, IVD, etc.
  modality: text('modality'), // e.g., mAb, gene therapy, combination product
  indication: text('indication'),
  therapeuticArea: text('therapeutic_area'),
  developmentStage: text('development_stage'), // preclinical, phase1, phase2, phase3, post-market

  // Strategic context
  riskPosture: text('risk_posture').default('balanced'), // aggressive, balanced, conservative
  noveltyLevel: text('novelty_level').default('standard'), // first-in-class, follow-on, standard, well-known
  qualityMaturity: text('quality_maturity').default('developing'), // nascent, developing, established, mature
  evidenceMaturity: text('evidence_maturity').default('early'), // none, early, moderate, robust

  // Markets
  markets: text('markets').array(), // ['US', 'EU', 'JP', 'CN', 'CA', 'AU']
  primaryMarket: text('primary_market'), // US, EU, etc.

  // Organization
  sponsorName: text('sponsor_name'),
  operatingModel: text('operating_model'), // internal, outsourced-cro, hybrid

  // Dates
  startDate: timestamp('start_date'),
  targetSubmissionDate: timestamp('target_submission_date'),

  // Status
  status: text('status').default('planning'), // planning, active, on-hold, completed, archived, cancelled

  // Metadata
  tags: text('tags').array(),
  metadata: jsonb('metadata'),

  createdAt: timestamp('created_at').defaultNow().notNull(),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
}, table => ({
  orgIdx: index('pm_programs_org_idx').on(table.organizationId),
  trackIdx: index('pm_programs_track_idx').on(table.customerTrack),
  statusIdx: index('pm_programs_status_idx').on(table.status),
}));

// ═══════════════════════════════════════════════════════════════════════════════
// 2. DESTINATION — Specific regulatory goal
// ═══════════════════════════════════════════════════════════════════════════════

export const destinations = pgTable('pm_destinations', {
  id: serial('id').primaryKey(),
  programId: integer('program_id').notNull(),
  organizationId: integer('organization_id').notNull(),

  name: text('name').notNull(), // e.g., "US IND", "EU CTA", "FDA 510(k)"
  destinationType: text('destination_type').notNull(), // IND, NDA, BLA, 510K, PMA, DE_NOVO, CTA, MAA, CE_MARK, PMDA, etc.
  region: text('region').notNull(), // US, EU, JP, CN, CA, AU, UK, BR, CH
  authority: text('authority'), // FDA, EMA, PMDA, NMPA, HC, TGA, MHRA, ANVISA, Swissmedic

  // Destination profile
  submissionFormat: text('submission_format'), // eCTD, non-eCTD, technical-file
  expeditedPathway: text('expedited_pathway'), // breakthrough, fast-track, priority-review, accelerated, orphan

  // Status
  status: text('status').default('planned'), // planned, active, submitted, approved, rejected, withdrawn
  confidenceScore: real('confidence_score'), // 0-100

  // Timeline
  targetDate: timestamp('target_date'),
  submittedDate: timestamp('submitted_date'),

  // Readiness (multi-axis)
  readinessArtifact: real('readiness_artifact').default(0), // 0-100
  readinessEvidence: real('readiness_evidence').default(0),
  readinessReview: real('readiness_review').default(0),
  readinessApproval: real('readiness_approval').default(0),
  readinessConsistency: real('readiness_consistency').default(0),
  readinessRouteFit: real('readiness_route_fit').default(0),
  readinessAuthority: real('readiness_authority').default(0),
  readinessCompliance: real('readiness_compliance').default(0),
  readinessTimeline: real('readiness_timeline').default(0),

  metadata: jsonb('metadata'),
  createdAt: timestamp('created_at').defaultNow().notNull(),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
}, table => ({
  programIdx: index('pm_destinations_program_idx').on(table.programId),
  orgIdx: index('pm_destinations_org_idx').on(table.organizationId),
  typeIdx: index('pm_destinations_type_idx').on(table.destinationType),
}));

// ═══════════════════════════════════════════════════════════════════════════════
// 3. ROUTE PLAN — Chosen or candidate path to destination
// ═══════════════════════════════════════════════════════════════════════════════

export const routePlans = pgTable('pm_route_plans', {
  id: serial('id').primaryKey(),
  destinationId: integer('destination_id').notNull(),
  programId: integer('program_id').notNull(),
  organizationId: integer('organization_id').notNull(),

  name: text('name').notNull(), // e.g., "Fastest Path", "Lowest Risk Path"
  routeType: text('route_type').default('primary'), // primary, alternate, contingency

  // Strategy
  assumptions: text('assumptions').array(),
  majorCheckpoints: jsonb('major_checkpoints'), // [{name, targetDate, gateType}]
  timelineModel: jsonb('timeline_model'), // {optimistic, expected, pessimistic}
  workstreams: jsonb('workstreams'), // [{name, owner, status, artifacts}]

  // Scoring
  confidenceScore: real('confidence_score'), // 0-100
  riskLevel: text('risk_level').default('medium'), // low, medium, high, critical
  estimatedDurationDays: integer('estimated_duration_days'),

  // Status
  status: text('status').default('draft'), // draft, proposed, selected, active, completed, abandoned
  isSelected: boolean('is_selected').default(false),

  metadata: jsonb('metadata'),
  createdAt: timestamp('created_at').defaultNow().notNull(),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
}, table => ({
  destIdx: index('pm_route_plans_dest_idx').on(table.destinationId),
  programIdx: index('pm_route_plans_program_idx').on(table.programId),
}));

// ═══════════════════════════════════════════════════════════════════════════════
// 4. ARTIFACT — Every governed document or deliverable
// ═══════════════════════════════════════════════════════════════════════════════

export const artifacts = pgTable('pm_artifacts', {
  id: serial('id').primaryKey(),
  programId: integer('program_id').notNull(),
  destinationId: integer('destination_id'),
  organizationId: integer('organization_id').notNull(),
  parentArtifactId: integer('parent_artifact_id'), // For hierarchy (module → section)

  // Identity
  title: text('title').notNull(),
  artifactType: text('artifact_type').notNull(), // dossier, module, section, protocol, report, memo, briefing-book, labeling, risk-file, cer, pms, pmcf, validation, cmc-record
  code: text('code'), // e.g., "3.2.S.1", "Module 5"

  // Dossier placement
  dossierModule: text('dossier_module'), // module-1, module-2, module-3, module-4, module-5, technical-file
  dossierSection: text('dossier_section'), // Full eCTD path like "3.2.S.2.3"

  // Requirement level
  requirementLevel: text('requirement_level').default('required'), // required, conditional, recommended, optional, strategic

  // Document lifecycle
  lifecycleState: text('lifecycle_state').default('planned'), // planned, drafting, in-review, approved, locked, exported, superseded, retired
  version: text('version').default('0.1'),
  versionHistory: jsonb('version_history'), // [{version, date, changedBy, changeNote}]

  // Ownership
  ownerId: integer('owner_id'),
  assigneeId: integer('assignee_id'),

  // Scoring
  evidenceScore: real('evidence_score'), // 0-100, how well-supported
  reviewScore: real('review_score'), // 0-100, review maturity
  consistencyScore: real('consistency_score'), // 0-100, cross-artifact consistency
  completenessScore: real('completeness_score'), // 0-100

  // Content
  contentRef: text('content_ref'), // Reference to document storage (S3 key, etc.)
  contentSummary: text('content_summary'), // AI-generated summary
  wordCount: integer('word_count'),

  // Dependencies (denormalized for fast access)
  dependsOnIds: integer('depends_on_ids').array(),
  impactsIds: integer('impacts_ids').array(),

  // Export
  exportReady: boolean('export_ready').default(false),
  lastExportedAt: timestamp('last_exported_at'),

  // Approval
  approvalState: text('approval_state').default('none'), // none, pending, approved, rejected, conditional
  approvedById: integer('approved_by_id'),
  approvedAt: timestamp('approved_at'),

  // Audit
  lockedAt: timestamp('locked_at'),
  lockedById: integer('locked_by_id'),

  metadata: jsonb('metadata'),
  createdAt: timestamp('created_at').defaultNow().notNull(),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
}, table => ({
  programIdx: index('pm_artifacts_program_idx').on(table.programId),
  destIdx: index('pm_artifacts_dest_idx').on(table.destinationId),
  orgIdx: index('pm_artifacts_org_idx').on(table.organizationId),
  typeIdx: index('pm_artifacts_type_idx').on(table.artifactType),
  lifecycleIdx: index('pm_artifacts_lifecycle_idx').on(table.lifecycleState),
  parentIdx: index('pm_artifacts_parent_idx').on(table.parentArtifactId),
  dossierIdx: index('pm_artifacts_dossier_idx').on(table.dossierModule, table.dossierSection),
}));

// ═══════════════════════════════════════════════════════════════════════════════
// 5. EVIDENCE NODE — Source or support linked to artifacts
// ═══════════════════════════════════════════════════════════════════════════════

export const evidenceNodes = pgTable('pm_evidence_nodes', {
  id: serial('id').primaryKey(),
  programId: integer('program_id').notNull(),
  organizationId: integer('organization_id').notNull(),

  title: text('title').notNull(),
  evidenceType: text('evidence_type').notNull(), // study-report, validation, precedent, rationale, regulation, guidance, sop, literature, experiment, vendor-doc, clinical-data, analytical-data

  // Source info
  sourceRef: text('source_ref'), // URL, document ID, file path
  sourceDate: timestamp('source_date'),
  sourceAuthority: text('source_authority'), // FDA, EMA, internal, etc.

  // Strength
  strengthLevel: text('strength_level').default('moderate'), // strong, moderate, weak, insufficient
  confidenceScore: real('confidence_score'), // 0-100

  // Content
  summary: text('summary'),
  keyFindings: text('key_findings').array(),

  // Status
  status: text('status').default('active'), // active, superseded, retracted, pending-review
  verifiedById: integer('verified_by_id'),
  verifiedAt: timestamp('verified_at'),

  metadata: jsonb('metadata'),
  createdAt: timestamp('created_at').defaultNow().notNull(),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
}, table => ({
  programIdx: index('pm_evidence_program_idx').on(table.programId),
  orgIdx: index('pm_evidence_org_idx').on(table.organizationId),
  typeIdx: index('pm_evidence_type_idx').on(table.evidenceType),
}));

// Junction: Evidence ↔ Artifact (M:N)
export const artifactEvidence = pgTable('pm_artifact_evidence', {
  id: serial('id').primaryKey(),
  artifactId: integer('artifact_id').notNull(),
  evidenceNodeId: integer('evidence_node_id').notNull(),

  linkType: text('link_type').default('supports'), // supports, contradicts, partially-supports, supersedes
  claimText: text('claim_text'), // The specific claim this evidence supports
  relevanceScore: real('relevance_score'), // 0-100

  createdAt: timestamp('created_at').defaultNow().notNull(),
}, table => ({
  artifactIdx: index('pm_ae_artifact_idx').on(table.artifactId),
  evidenceIdx: index('pm_ae_evidence_idx').on(table.evidenceNodeId),
  uniqueLink: unique('pm_ae_unique').on(table.artifactId, table.evidenceNodeId),
}));

// ═══════════════════════════════════════════════════════════════════════════════
// 6. DEPENDENCY LINK — Relationship chains
// ═══════════════════════════════════════════════════════════════════════════════

export const dependencyLinks = pgTable('pm_dependency_links', {
  id: serial('id').primaryKey(),
  programId: integer('program_id').notNull(),
  organizationId: integer('organization_id').notNull(),

  // Source → Target relationship
  sourceType: text('source_type').notNull(), // artifact, evidence, decision
  sourceId: integer('source_id').notNull(),
  targetType: text('target_type').notNull(), // artifact, evidence, decision
  targetId: integer('target_id').notNull(),

  linkType: text('link_type').notNull(), // requires, informs, triggers-update, blocks, invalidates, derives-from
  description: text('description'),

  // Impact assessment
  impactLevel: text('impact_level').default('medium'), // critical, high, medium, low
  isStale: boolean('is_stale').default(false), // Source changed but target not updated
  staleSince: timestamp('stale_since'),

  // Auto-detected or manual
  detectionMethod: text('detection_method').default('manual'), // manual, ai-detected, rule-based

  metadata: jsonb('metadata'),
  createdAt: timestamp('created_at').defaultNow().notNull(),
}, table => ({
  programIdx: index('pm_deps_program_idx').on(table.programId),
  sourceIdx: index('pm_deps_source_idx').on(table.sourceType, table.sourceId),
  targetIdx: index('pm_deps_target_idx').on(table.targetType, table.targetId),
  staleIdx: index('pm_deps_stale_idx').on(table.isStale),
}));

// ═══════════════════════════════════════════════════════════════════════════════
// 7. DECISION RECORD — Meaningful decisions
// ═══════════════════════════════════════════════════════════════════════════════

export const decisionRecords = pgTable('pm_decision_records', {
  id: serial('id').primaryKey(),
  programId: integer('program_id').notNull(),
  organizationId: integer('organization_id').notNull(),

  title: text('title').notNull(),
  rationale: text('rationale'),
  decisionOwnerId: integer('decision_owner_id'),

  // Context
  category: text('category'), // route, strategy, content, process, risk, regulatory, clinical, cmc
  reversibility: text('reversibility').default('reversible'), // reversible, partially-reversible, irreversible
  riskCategory: text('risk_category'), // low, medium, high, critical

  // Supporting evidence
  supportingEvidenceIds: integer('supporting_evidence_ids').array(),

  // Impact
  impactedArtifactIds: integer('impacted_artifact_ids').array(),
  impactSummary: text('impact_summary'),

  // Participants
  reviewParticipantIds: integer('review_participant_ids').array(),

  // Status
  status: text('status').default('proposed'), // proposed, under-review, decided, superseded, reversed
  decidedAt: timestamp('decided_at'),

  metadata: jsonb('metadata'),
  createdAt: timestamp('created_at').defaultNow().notNull(),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
}, table => ({
  programIdx: index('pm_decisions_program_idx').on(table.programId),
  orgIdx: index('pm_decisions_org_idx').on(table.organizationId),
  statusIdx: index('pm_decisions_status_idx').on(table.status),
}));

// ═══════════════════════════════════════════════════════════════════════════════
// 8. REVIEW CYCLE — Draft → Review → Approval → Lock
// ═══════════════════════════════════════════════════════════════════════════════

export const reviewCycles = pgTable('pm_review_cycles', {
  id: serial('id').primaryKey(),
  artifactId: integer('artifact_id').notNull(),
  programId: integer('program_id').notNull(),
  organizationId: integer('organization_id').notNull(),

  cycleNumber: integer('cycle_number').default(1),

  // Status
  status: text('status').default('open'), // open, in-review, comments-received, revision-needed, approved, rejected, escalated

  // Participants
  requestedById: integer('requested_by_id'),
  reviewerIds: integer('reviewer_ids').array(),
  approverIds: integer('approver_ids').array(),

  // Timeline
  requestedAt: timestamp('requested_at').defaultNow(),
  dueDate: timestamp('due_date'),
  completedAt: timestamp('completed_at'),

  // Outcome
  outcome: text('outcome'), // approved, approved-with-conditions, rejected, needs-revision
  outcomeNotes: text('outcome_notes'),

  // Review type
  reviewType: text('review_type').default('standard'), // standard, expedited, final, sponsor-review, qa-review, regulatory-review

  // Visibility
  visibility: text('visibility').default('internal'), // internal, sponsor-visible, authority-facing

  metadata: jsonb('metadata'),
  createdAt: timestamp('created_at').defaultNow().notNull(),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
}, table => ({
  artifactIdx: index('pm_reviews_artifact_idx').on(table.artifactId),
  programIdx: index('pm_reviews_program_idx').on(table.programId),
  statusIdx: index('pm_reviews_status_idx').on(table.status),
}));

// ═══════════════════════════════════════════════════════════════════════════════
// 9. RISK SIGNAL — System or human-generated risks
// ═══════════════════════════════════════════════════════════════════════════════

export const riskSignals = pgTable('pm_risk_signals', {
  id: serial('id').primaryKey(),
  programId: integer('program_id').notNull(),
  organizationId: integer('organization_id').notNull(),

  title: text('title').notNull(),
  description: text('description'),

  // Classification
  riskType: text('risk_type').notNull(), // evidence-gap, claim-inconsistency, stale-content, review-bottleneck, route-fragility, timeline-risk, authority-sensitivity, compliance-gap, dependency-break, deficiency-exposure
  severity: text('severity').default('medium'), // critical, high, medium, low
  probability: text('probability').default('possible'), // very-likely, likely, possible, unlikely

  // Impact
  impactedArtifactIds: integer('impacted_artifact_ids').array(),
  impactedDestinationIds: integer('impacted_destination_ids').array(),

  // Source
  detectionMethod: text('detection_method').default('manual'), // manual, ai-detected, rule-based, dependency-engine
  detectedById: integer('detected_by_id'),

  // Resolution
  status: text('status').default('open'), // open, acknowledged, mitigating, resolved, accepted, escalated
  assigneeId: integer('assignee_id'),
  mitigationPlan: text('mitigation_plan'),
  resolvedAt: timestamp('resolved_at'),

  metadata: jsonb('metadata'),
  createdAt: timestamp('created_at').defaultNow().notNull(),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
}, table => ({
  programIdx: index('pm_risks_program_idx').on(table.programId),
  orgIdx: index('pm_risks_org_idx').on(table.organizationId),
  typeIdx: index('pm_risks_type_idx').on(table.riskType),
  severityIdx: index('pm_risks_severity_idx').on(table.severity),
  statusIdx: index('pm_risks_status_idx').on(table.status),
}));

// ═══════════════════════════════════════════════════════════════════════════════
// 10. COLLABORATION — Structured collaboration on governed work
// ═══════════════════════════════════════════════════════════════════════════════

export const collaborationItems = pgTable('pm_collaboration', {
  id: serial('id').primaryKey(),
  programId: integer('program_id').notNull(),
  organizationId: integer('organization_id').notNull(),

  // Attached to
  targetType: text('target_type').notNull(), // artifact, decision, review-cycle, risk-signal
  targetId: integer('target_id').notNull(),

  // Thread
  parentId: integer('parent_id'), // For threaded replies
  threadRootId: integer('thread_root_id'), // Root of the thread

  // Collaboration type
  itemType: text('item_type').notNull(), // comment, question, requested-change, review-note, approval-request, escalation, decision-record, internal-note, sponsor-note, region-note, qa-finding

  // Content
  content: text('content').notNull(),
  authorId: integer('author_id').notNull(),

  // Status
  status: text('status').default('open'), // open, resolved, escalated, deferred, closed
  resolvedById: integer('resolved_by_id'),
  resolvedAt: timestamp('resolved_at'),

  // Priority
  priority: text('priority').default('normal'), // urgent, high, normal, low

  // Visibility
  visibility: text('visibility').default('internal'), // internal, sponsor-visible, authority-facing

  // Change impact (for requested-change type)
  changeImpact: text('change_impact'), // critical, high, medium, low

  metadata: jsonb('metadata'),
  createdAt: timestamp('created_at').defaultNow().notNull(),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
}, table => ({
  programIdx: index('pm_collab_program_idx').on(table.programId),
  targetIdx: index('pm_collab_target_idx').on(table.targetType, table.targetId),
  threadIdx: index('pm_collab_thread_idx').on(table.threadRootId),
  authorIdx: index('pm_collab_author_idx').on(table.authorId),
  statusIdx: index('pm_collab_status_idx').on(table.status),
  typeIdx: index('pm_collab_type_idx').on(table.itemType),
}));

// ═══════════════════════════════════════════════════════════════════════════════
// 11. AUTHORITY INTERACTION — Regulator-facing interactions
// ═══════════════════════════════════════════════════════════════════════════════

export const authorityInteractions = pgTable('pm_authority_interactions', {
  id: serial('id').primaryKey(),
  programId: integer('program_id').notNull(),
  destinationId: integer('destination_id'),
  organizationId: integer('organization_id').notNull(),

  interactionType: text('interaction_type').notNull(), // pre-submission, type-a, type-b, type-c, scientific-advice, rfi, deficiency-response, annual-report, commitment-fulfillment
  authority: text('authority').notNull(), // FDA, EMA, etc.

  title: text('title').notNull(),
  description: text('description'),

  // Timeline
  scheduledDate: timestamp('scheduled_date'),
  completedDate: timestamp('completed_date'),
  responseDeadline: timestamp('response_deadline'),

  // Prep
  briefingPackageArtifactId: integer('briefing_package_artifact_id'),
  questionsExpected: text('questions_expected').array(),

  // Outcomes
  commitments: jsonb('commitments'), // [{commitment, deadline, owner, status}]
  actionItems: jsonb('action_items'), // [{item, assignee, dueDate, status}]
  outcome: text('outcome'),

  // Status
  status: text('status').default('planned'), // planned, preparing, ready, completed, follow-up-pending

  metadata: jsonb('metadata'),
  createdAt: timestamp('created_at').defaultNow().notNull(),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
}, table => ({
  programIdx: index('pm_auth_program_idx').on(table.programId),
  orgIdx: index('pm_auth_org_idx').on(table.organizationId),
  typeIdx: index('pm_auth_type_idx').on(table.interactionType),
  statusIdx: index('pm_auth_status_idx').on(table.status),
}));

// ═══════════════════════════════════════════════════════════════════════════════
// 12. PROVENANCE LOG — Audit trail for every artifact action
// ═══════════════════════════════════════════════════════════════════════════════

export const provenanceLogs = pgTable('pm_provenance_logs', {
  id: serial('id').primaryKey(),
  organizationId: integer('organization_id').notNull(),
  programId: integer('program_id'),

  // What was affected
  entityType: text('entity_type').notNull(), // artifact, evidence, decision, review, risk, collaboration
  entityId: integer('entity_id').notNull(),

  // What happened
  action: text('action').notNull(), // created, updated, reviewed, approved, rejected, locked, exported, ai-generated, ai-modified, version-bumped, state-changed

  // Who did it
  actorType: text('actor_type').notNull(), // user, ai, system, rule-engine
  actorId: integer('actor_id'), // userId for user, null for system
  actorName: text('actor_name'),

  // Details
  previousState: jsonb('previous_state'),
  newState: jsonb('new_state'),
  changeDescription: text('change_description'),

  // AI-specific provenance
  aiModel: text('ai_model'), // e.g., "claude-opus-4-6"
  aiPromptSummary: text('ai_prompt_summary'),
  aiConfidenceScore: real('ai_confidence_score'),

  // Source files used
  inputSources: jsonb('input_sources'), // [{type, ref, name}]

  // Compliance
  ipAddress: text('ip_address'),
  sessionId: text('session_id'),
  signatureHash: text('signature_hash'), // 21 CFR Part 11 tamper-evident hash

  createdAt: timestamp('created_at').defaultNow().notNull(),
}, table => ({
  entityIdx: index('pm_prov_entity_idx').on(table.entityType, table.entityId),
  programIdx: index('pm_prov_program_idx').on(table.programId),
  orgIdx: index('pm_prov_org_idx').on(table.organizationId),
  actionIdx: index('pm_prov_action_idx').on(table.action),
  timeIdx: index('pm_prov_time_idx').on(table.createdAt),
}));

// ═══════════════════════════════════════════════════════════════════════════════
// RELATIONS
// ═══════════════════════════════════════════════════════════════════════════════

export const programsRelations = relations(programs, ({ many }) => ({
  destinations: many(destinations),
  artifacts: many(artifacts),
  evidenceNodes: many(evidenceNodes),
  dependencyLinks: many(dependencyLinks),
  decisionRecords: many(decisionRecords),
  riskSignals: many(riskSignals),
  collaborationItems: many(collaborationItems),
  authorityInteractions: many(authorityInteractions),
  provenanceLogs: many(provenanceLogs),
}));

export const destinationsRelations = relations(destinations, ({ one, many }) => ({
  program: one(programs, { fields: [destinations.programId], references: [programs.id] }),
  routePlans: many(routePlans),
  artifacts: many(artifacts),
  authorityInteractions: many(authorityInteractions),
}));

export const routePlansRelations = relations(routePlans, ({ one }) => ({
  destination: one(destinations, { fields: [routePlans.destinationId], references: [destinations.id] }),
  program: one(programs, { fields: [routePlans.programId], references: [programs.id] }),
}));

export const artifactsRelations = relations(artifacts, ({ one, many }) => ({
  program: one(programs, { fields: [artifacts.programId], references: [programs.id] }),
  destination: one(destinations, { fields: [artifacts.destinationId], references: [destinations.id] }),
  parent: one(artifacts, { fields: [artifacts.parentArtifactId], references: [artifacts.id], relationName: 'artifactHierarchy' }),
  children: many(artifacts, { relationName: 'artifactHierarchy' }),
  evidenceLinks: many(artifactEvidence),
  reviewCycles: many(reviewCycles),
}));

export const evidenceNodesRelations = relations(evidenceNodes, ({ one, many }) => ({
  program: one(programs, { fields: [evidenceNodes.programId], references: [programs.id] }),
  artifactLinks: many(artifactEvidence),
}));

export const artifactEvidenceRelations = relations(artifactEvidence, ({ one }) => ({
  artifact: one(artifacts, { fields: [artifactEvidence.artifactId], references: [artifacts.id] }),
  evidenceNode: one(evidenceNodes, { fields: [artifactEvidence.evidenceNodeId], references: [evidenceNodes.id] }),
}));

export const reviewCyclesRelations = relations(reviewCycles, ({ one }) => ({
  artifact: one(artifacts, { fields: [reviewCycles.artifactId], references: [artifacts.id] }),
  program: one(programs, { fields: [reviewCycles.programId], references: [programs.id] }),
}));

export const riskSignalsRelations = relations(riskSignals, ({ one }) => ({
  program: one(programs, { fields: [riskSignals.programId], references: [programs.id] }),
}));

export const collaborationItemsRelations = relations(collaborationItems, ({ one, many }) => ({
  program: one(programs, { fields: [collaborationItems.programId], references: [programs.id] }),
  parent: one(collaborationItems, { fields: [collaborationItems.parentId], references: [collaborationItems.id], relationName: 'collabThread' }),
  replies: many(collaborationItems, { relationName: 'collabThread' }),
}));

export const authorityInteractionsRelations = relations(authorityInteractions, ({ one }) => ({
  program: one(programs, { fields: [authorityInteractions.programId], references: [programs.id] }),
  destination: one(destinations, { fields: [authorityInteractions.destinationId], references: [destinations.id] }),
}));

export const provenanceLogsRelations = relations(provenanceLogs, ({ one }) => ({
  program: one(programs, { fields: [provenanceLogs.programId], references: [programs.id] }),
}));

// ═══════════════════════════════════════════════════════════════════════════════
// TYPE EXPORTS
// ═══════════════════════════════════════════════════════════════════════════════

export type Program = typeof programs.$inferSelect;
export type InsertProgram = typeof programs.$inferInsert;
export type Destination = typeof destinations.$inferSelect;
export type InsertDestination = typeof destinations.$inferInsert;
export type RoutePlan = typeof routePlans.$inferSelect;
export type InsertRoutePlan = typeof routePlans.$inferInsert;
export type Artifact = typeof artifacts.$inferSelect;
export type InsertArtifact = typeof artifacts.$inferInsert;
export type EvidenceNode = typeof evidenceNodes.$inferSelect;
export type InsertEvidenceNode = typeof evidenceNodes.$inferInsert;
export type ArtifactEvidenceLink = typeof artifactEvidence.$inferSelect;
export type DependencyLink = typeof dependencyLinks.$inferSelect;
export type InsertDependencyLink = typeof dependencyLinks.$inferInsert;
export type DecisionRecord = typeof decisionRecords.$inferSelect;
export type InsertDecisionRecord = typeof decisionRecords.$inferInsert;
export type ReviewCycle = typeof reviewCycles.$inferSelect;
export type InsertReviewCycle = typeof reviewCycles.$inferInsert;
export type RiskSignal = typeof riskSignals.$inferSelect;
export type InsertRiskSignal = typeof riskSignals.$inferInsert;
export type CollaborationItem = typeof collaborationItems.$inferSelect;
export type InsertCollaborationItem = typeof collaborationItems.$inferInsert;
export type AuthorityInteraction = typeof authorityInteractions.$inferSelect;
export type InsertAuthorityInteraction = typeof authorityInteractions.$inferInsert;
export type ProvenanceLog = typeof provenanceLogs.$inferSelect;

// Multi-axis readiness type
export interface ReadinessProfile {
  artifactCompleteness: number; // 0-100
  evidenceAdequacy: number;
  reviewMaturity: number;
  approvalMaturity: number;
  consistencyIntegrity: number;
  routeFit: number;
  authorityConfidence: number;
  complianceIntegrity: number;
  timelineConfidence: number;
}
