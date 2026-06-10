/**
 * Clinical Investigator Financial Disclosure — 21 CFR 54 (Capability C2C-01)
 *
 * Captures, tracks, and certifies clinical-investigator financial disclosures
 * and drives the Module 1 forms:
 *   - Form FDA 3454 — Certification (NO disclosable financial interests)
 *   - Form FDA 3455 — Disclosure (of financial interests / arrangements)
 *
 * Also seeds the generic ALCOA+ provenance spine (C2C-02): `provenance_links`
 * binds a source record (e.g. a certified disclosure) to a target (e.g. the
 * Module 1 entry of a submission). FCOI is its first consumer.
 *
 * Tenancy/audit conventions match the platform: every regulated table carries
 * organizationId + createdBy + created/updated/deletedAt, every FK and the
 * tenant column is indexed, and status/type columns are constrained (CHECK in
 * the SQL migration) rather than free text. Governed mutations are recorded via
 * recordGovernedAction (audit_logs + c2c_ana_actions) at the route/service layer.
 *
 * @module shared/schema/financial-disclosures
 */

import { boolean, date, index, integer, numeric, pgTable, serial, text, timestamp } from 'drizzle-orm/pg-core';
import { organizations, users, clinicalStudies } from '../schema';
import { submissions } from './submissions';

/** Investigator roles (constrained in SQL). */
export type InvestigatorRole = 'principal_investigator' | 'sub_investigator' | 'coordinator' | 'other';

/** The form a disclosure resolves to, derived from has_disclosable_interests. */
export type FcoiFormType = 'FDA_3454' | 'FDA_3455';

/** Disclosure lifecycle. */
export type FcoiStatus = 'draft' | 'submitted' | 'certified' | 'signed' | 'superseded';

/** The four 21 CFR 54.2 disclosable-interest categories. */
export type FcoiInterestType =
  | 'COMPENSATION_BY_OUTCOME' // 54.2(a) compensation affected by study outcome
  | 'EQUITY_INTEREST' //         54.2(b) significant equity in the sponsor
  | 'PROPRIETARY_INTEREST' //    54.2(c) patent/trademark/copyright/licensing
  | 'SIGNIFICANT_PAYMENTS'; //   54.2(f) significant payments of other sorts

// ─── Investigators ───────────────────────────────────────────────────────────

export const clinicalInvestigators = pgTable(
  'clinical_investigators',
  {
    id: serial('id').primaryKey(),
    organizationId: integer('organization_id').notNull().references(() => organizations.id),
    fullName: text('full_name').notNull(),
    role: text('role').$type<InvestigatorRole>().notNull(),
    institution: text('institution'),
    /** Nullable until assigned to a study. */
    studyId: integer('study_id').references(() => clinicalStudies.id),
    createdBy: integer('created_by').notNull().references(() => users.id),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow(),
    deletedAt: timestamp('deleted_at', { withTimezone: true }),
  },
  (t) => ({
    orgIdx: index('idx_clinical_investigators_org').on(t.organizationId),
    studyIdx: index('idx_clinical_investigators_study').on(t.studyId),
  })
);

export type ClinicalInvestigator = typeof clinicalInvestigators.$inferSelect;
export type NewClinicalInvestigator = typeof clinicalInvestigators.$inferInsert;

// ─── Financial disclosures ───────────────────────────────────────────────────

export const financialDisclosures = pgTable(
  'financial_disclosures',
  {
    id: serial('id').primaryKey(),
    organizationId: integer('organization_id').notNull().references(() => organizations.id),
    investigatorId: integer('investigator_id').notNull().references(() => clinicalInvestigators.id),
    /** The filing this disclosure supports (Module 1). */
    submissionId: integer('submission_id').references(() => submissions.id),
    /** Disclosure period covers the study + 1 year per 21 CFR 54.4. */
    disclosurePeriodStart: date('disclosure_period_start'),
    disclosurePeriodEnd: date('disclosure_period_end'),
    /** Drives 3454 (false) vs 3455 (true). */
    hasDisclosableInterests: boolean('has_disclosable_interests').notNull().default(false),
    /** Derived from hasDisclosableInterests and persisted for the record. */
    formType: text('form_type').$type<FcoiFormType>().notNull(),
    status: text('status').$type<FcoiStatus>().notNull().default('draft'),
    certificationStatement: text('certification_statement'),
    /** sha256 of the disclosure snapshot bound at certification (e-sign). */
    contentHash: text('content_hash'),
    signedBy: integer('signed_by').references(() => users.id),
    signedAt: timestamp('signed_at', { withTimezone: true }),
    signatureMeaning: text('signature_meaning'), // e.g. 'Certified'
    createdBy: integer('created_by').notNull().references(() => users.id),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow(),
    deletedAt: timestamp('deleted_at', { withTimezone: true }),
  },
  (t) => ({
    orgIdx: index('idx_financial_disclosures_org').on(t.organizationId),
    investigatorIdx: index('idx_financial_disclosures_investigator').on(t.investigatorId),
    submissionIdx: index('idx_financial_disclosures_submission').on(t.submissionId),
  })
);

export type FinancialDisclosure = typeof financialDisclosures.$inferSelect;
export type NewFinancialDisclosure = typeof financialDisclosures.$inferInsert;

// ─── Disclosure interests (child rows; only present on a 3455) ────────────────

export const disclosureInterests = pgTable(
  'disclosure_interests',
  {
    id: serial('id').primaryKey(),
    organizationId: integer('organization_id').notNull().references(() => organizations.id),
    disclosureId: integer('disclosure_id').notNull().references(() => financialDisclosures.id),
    interestType: text('interest_type').$type<FcoiInterestType>().notNull(),
    description: text('description').notNull(),
    monetaryValue: numeric('monetary_value', { precision: 14, scale: 2 }),
    arrangementsToMinimizeBias: text('arrangements_to_minimize_bias'),
    createdBy: integer('created_by').notNull().references(() => users.id),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow(),
    deletedAt: timestamp('deleted_at', { withTimezone: true }),
  },
  (t) => ({
    orgIdx: index('idx_disclosure_interests_org').on(t.organizationId),
    disclosureIdx: index('idx_disclosure_interests_disclosure').on(t.disclosureId),
  })
);

export type DisclosureInterest = typeof disclosureInterests.$inferSelect;
export type NewDisclosureInterest = typeof disclosureInterests.$inferInsert;

// ─── Provenance spine seed (generic; C2C-02) ─────────────────────────────────

export const provenanceLinks = pgTable(
  'provenance_links',
  {
    id: serial('id').primaryKey(),
    organizationId: integer('organization_id').notNull().references(() => organizations.id),
    /** e.g. 'financial_disclosure'. */
    sourceType: text('source_type').notNull(),
    sourceId: integer('source_id').notNull(),
    /** e.g. 'submission_module1'. */
    targetType: text('target_type').notNull(),
    targetId: integer('target_id').notNull(),
    /** e.g. 'supports'. */
    linkRole: text('link_role').notNull(),
    createdBy: integer('created_by').notNull().references(() => users.id),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow(),
    deletedAt: timestamp('deleted_at', { withTimezone: true }),
  },
  (t) => ({
    orgIdx: index('idx_provenance_links_org').on(t.organizationId),
    sourceIdx: index('idx_provenance_links_source').on(t.sourceType, t.sourceId),
    targetIdx: index('idx_provenance_links_target').on(t.targetType, t.targetId),
  })
);

export type ProvenanceLink = typeof provenanceLinks.$inferSelect;
export type NewProvenanceLink = typeof provenanceLinks.$inferInsert;
