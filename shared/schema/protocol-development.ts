/**
 * Protocol Development — structured protocol authoring (Capability C2C-17)
 *
 * The "build" side of research protocols that complements the management/committee
 * layers: a versioned protocol document assembled from templated sections (by
 * protocol kind), with structured objectives/endpoints, eligibility criteria, a
 * schedule of assessments, a training-gated study team, and a revision history.
 * Soft-links to the governed protocol records (iacuc_protocols / irb_submissions /
 * clinical_studies) via (protocol_kind, linked_protocol_id).
 *
 * Section templates follow ICH M11 / ICH E6(R2) (clinical), PHS Policy / AWA 9 CFR
 * 2.31 3Rs (IACUC), and 45 CFR 46.111 (IRB). Conventions match the platform;
 * status/type columns are CHECK-constrained. Mutations are governed + audited.
 *
 * @module shared/schema/protocol-development
 */

import { boolean, index, integer, pgTable, serial, text, timestamp } from 'drizzle-orm/pg-core';
import { organizations, users } from '../schema';
import { researchPersonnel } from './research-compliance';

export type ProtocolKind = 'iacuc' | 'irb' | 'clinical' | 'ibc';
export type ProtocolDesignType =
  | 'interventional' | 'observational' | 'expanded_access' | 'animal_study' | 'basic_science' | 'registry' | 'other';
export type ProtocolDocStatus = 'draft' | 'in_development' | 'in_review' | 'finalized' | 'superseded';
export type SectionStatus = 'not_started' | 'draft' | 'complete';
export type ObjectiveType = 'primary' | 'secondary' | 'exploratory';
export type EligibilityKind = 'inclusion' | 'exclusion';
export type TeamMemberRole =
  | 'principal_investigator' | 'co_investigator' | 'sub_investigator' | 'coordinator' | 'biostatistician'
  | 'data_manager' | 'pharmacist' | 'veterinarian' | 'regulatory' | 'other';

// ─── Protocol documents ──────────────────────────────────────────────────────

export const protocolDocuments = pgTable(
  'protocol_documents',
  {
    id: serial('id').primaryKey(),
    organizationId: integer('organization_id').notNull().references(() => organizations.id),
    protocolKind: text('protocol_kind').$type<ProtocolKind>().notNull(),
    /** Soft reference to iacuc_protocols / irb_submissions / clinical_studies by kind. */
    linkedProtocolId: integer('linked_protocol_id'),
    protocolNumber: text('protocol_number'),
    title: text('title').notNull(),
    designType: text('design_type').$type<ProtocolDesignType>(),
    phase: text('phase'),
    therapeuticArea: text('therapeutic_area'),
    version: text('version').notNull().default('0.1'),
    status: text('status').$type<ProtocolDocStatus>().notNull().default('draft'),
    synopsis: text('synopsis'),
    finalizedBy: integer('finalized_by').references(() => users.id),
    finalizedAt: timestamp('finalized_at', { withTimezone: true }),
    createdBy: integer('created_by').notNull().references(() => users.id),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow(),
    deletedAt: timestamp('deleted_at', { withTimezone: true }),
  },
  (t) => ({
    orgIdx: index('idx_protocol_documents_org').on(t.organizationId),
    kindIdx: index('idx_protocol_documents_kind').on(t.organizationId, t.protocolKind),
  }),
);

export type ProtocolDocument = typeof protocolDocuments.$inferSelect;
export type NewProtocolDocument = typeof protocolDocuments.$inferInsert;

// ─── Sections ────────────────────────────────────────────────────────────────

export const protocolSections = pgTable(
  'protocol_sections',
  {
    id: serial('id').primaryKey(),
    organizationId: integer('organization_id').notNull().references(() => organizations.id),
    protocolDocumentId: integer('protocol_document_id').notNull().references(() => protocolDocuments.id),
    /** Stable key (e.g. 'background', 'objectives', 'design', 'eligibility', 'statistics'). */
    sectionKey: text('section_key').notNull(),
    title: text('title').notNull(),
    content: text('content'),
    required: boolean('required').notNull().default(true),
    status: text('status').$type<SectionStatus>().notNull().default('not_started'),
    orderIndex: integer('order_index').notNull().default(0),
    createdBy: integer('created_by').notNull().references(() => users.id),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow(),
    deletedAt: timestamp('deleted_at', { withTimezone: true }),
  },
  (t) => ({
    orgIdx: index('idx_protocol_sections_org').on(t.organizationId),
    docIdx: index('idx_protocol_sections_doc').on(t.protocolDocumentId),
  }),
);

export type ProtocolSection = typeof protocolSections.$inferSelect;
export type NewProtocolSection = typeof protocolSections.$inferInsert;

// ─── Objectives & endpoints ──────────────────────────────────────────────────

export const protocolObjectives = pgTable(
  'protocol_objectives',
  {
    id: serial('id').primaryKey(),
    organizationId: integer('organization_id').notNull().references(() => organizations.id),
    protocolDocumentId: integer('protocol_document_id').notNull().references(() => protocolDocuments.id),
    objectiveType: text('objective_type').$type<ObjectiveType>().notNull().default('primary'),
    objective: text('objective').notNull(),
    endpoint: text('endpoint'),
    timepoint: text('timepoint'),
    orderIndex: integer('order_index').notNull().default(0),
    createdBy: integer('created_by').notNull().references(() => users.id),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow(),
    deletedAt: timestamp('deleted_at', { withTimezone: true }),
  },
  (t) => ({
    orgIdx: index('idx_protocol_objectives_org').on(t.organizationId),
    docIdx: index('idx_protocol_objectives_doc').on(t.protocolDocumentId),
  }),
);

export type ProtocolObjective = typeof protocolObjectives.$inferSelect;
export type NewProtocolObjective = typeof protocolObjectives.$inferInsert;

// ─── Eligibility criteria ────────────────────────────────────────────────────

export const protocolEligibilityCriteria = pgTable(
  'protocol_eligibility_criteria',
  {
    id: serial('id').primaryKey(),
    organizationId: integer('organization_id').notNull().references(() => organizations.id),
    protocolDocumentId: integer('protocol_document_id').notNull().references(() => protocolDocuments.id),
    kind: text('kind').$type<EligibilityKind>().notNull(),
    criterion: text('criterion').notNull(),
    orderIndex: integer('order_index').notNull().default(0),
    createdBy: integer('created_by').notNull().references(() => users.id),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow(),
    deletedAt: timestamp('deleted_at', { withTimezone: true }),
  },
  (t) => ({
    orgIdx: index('idx_protocol_eligibility_org').on(t.organizationId),
    docIdx: index('idx_protocol_eligibility_doc').on(t.protocolDocumentId),
  }),
);

export type ProtocolEligibilityCriterion = typeof protocolEligibilityCriteria.$inferSelect;
export type NewProtocolEligibilityCriterion = typeof protocolEligibilityCriteria.$inferInsert;

// ─── Schedule of assessments (visits) ────────────────────────────────────────

export const protocolScheduleVisits = pgTable(
  'protocol_schedule_visits',
  {
    id: serial('id').primaryKey(),
    organizationId: integer('organization_id').notNull().references(() => organizations.id),
    protocolDocumentId: integer('protocol_document_id').notNull().references(() => protocolDocuments.id),
    visitName: text('visit_name').notNull(),
    /** e.g. "Day 1", "Week 4 (±3d)", "Screening". */
    timepoint: text('timepoint'),
    /** Procedures performed at this visit. */
    procedures: text('procedures').array(),
    orderIndex: integer('order_index').notNull().default(0),
    createdBy: integer('created_by').notNull().references(() => users.id),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow(),
    deletedAt: timestamp('deleted_at', { withTimezone: true }),
  },
  (t) => ({
    orgIdx: index('idx_protocol_visits_org').on(t.organizationId),
    docIdx: index('idx_protocol_visits_doc').on(t.protocolDocumentId),
  }),
);

export type ProtocolScheduleVisit = typeof protocolScheduleVisits.$inferSelect;
export type NewProtocolScheduleVisit = typeof protocolScheduleVisits.$inferInsert;

// ─── Study team (training-gated) ─────────────────────────────────────────────

export const protocolTeamMembers = pgTable(
  'protocol_team_members',
  {
    id: serial('id').primaryKey(),
    organizationId: integer('organization_id').notNull().references(() => organizations.id),
    protocolDocumentId: integer('protocol_document_id').notNull().references(() => protocolDocuments.id),
    personnelId: integer('personnel_id').references(() => researchPersonnel.id),
    userId: integer('user_id').references(() => users.id),
    memberName: text('member_name').notNull(),
    role: text('role').$type<TeamMemberRole>().notNull().default('co_investigator'),
    responsibilities: text('responsibilities'),
    createdBy: integer('created_by').notNull().references(() => users.id),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow(),
    deletedAt: timestamp('deleted_at', { withTimezone: true }),
  },
  (t) => ({
    orgIdx: index('idx_protocol_team_org').on(t.organizationId),
    docIdx: index('idx_protocol_team_doc').on(t.protocolDocumentId),
  }),
);

export type ProtocolTeamMember = typeof protocolTeamMembers.$inferSelect;
export type NewProtocolTeamMember = typeof protocolTeamMembers.$inferInsert;

// ─── Version / revision history ──────────────────────────────────────────────

export const protocolVersions = pgTable(
  'protocol_versions',
  {
    id: serial('id').primaryKey(),
    organizationId: integer('organization_id').notNull().references(() => organizations.id),
    protocolDocumentId: integer('protocol_document_id').notNull().references(() => protocolDocuments.id),
    version: text('version').notNull(),
    changeSummary: text('change_summary'),
    /** JSON snapshot of the document + sections at this version. */
    snapshot: text('snapshot'),
    createdBy: integer('created_by').notNull().references(() => users.id),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow(),
  },
  (t) => ({
    orgIdx: index('idx_protocol_versions_org').on(t.organizationId),
    docIdx: index('idx_protocol_versions_doc').on(t.protocolDocumentId),
  }),
);

export type ProtocolVersion = typeof protocolVersions.$inferSelect;
export type NewProtocolVersion = typeof protocolVersions.$inferInsert;
