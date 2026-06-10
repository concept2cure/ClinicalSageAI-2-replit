/**
 * IRB / IEC Submission & Amendment Management (Capability C2C-06)
 *
 * Institutional Review Board / Independent Ethics Committee review of human-
 * subjects research: initial submissions, single-IRB (sIRB) multi-site
 * coordination, informed-consent documents, committee determinations,
 * amendments, and reportable events (unanticipated problems). An approved IRB
 * submission threads ethics approval into the clinical conduct record and forward
 * to Module 5 via provenance_links.
 *
 * Grounded in the revised Common Rule (45 CFR 46), FDA 21 CFR 56, and ICH E6(R2).
 * Conventions match the platform; status/type columns are CHECK-constrained.
 * Mutations are governed + audited.
 *
 * @module shared/schema/irb
 */

import { boolean, date, index, integer, pgTable, serial, text, timestamp } from 'drizzle-orm/pg-core';
import { organizations, users, clinicalStudies } from '../schema';
import { submissions } from './submissions';

export type IrbReviewType = 'exempt' | 'expedited' | 'full_board';
export type IrbRiskLevel = 'minimal' | 'greater_than_minimal';

export type IrbSubmissionStatus =
  | 'draft'
  | 'submitted'
  | 'under_review'
  | 'modifications_required'
  | 'approved'
  | 'deferred'
  | 'disapproved'
  | 'suspended'
  | 'closed'
  | 'expired';

export type IrbSiteStatus = 'pending' | 'activated' | 'on_hold' | 'closed';
export type ConsentDocStatus = 'draft' | 'approved' | 'superseded';
export type IrbAmendmentStatus = 'submitted' | 'approved' | 'rejected';
export type ReportableEventType = 'unanticipated_problem' | 'serious_adverse_event' | 'protocol_deviation' | 'noncompliance' | 'other';
export type ReportableEventStatus = 'reported' | 'under_review' | 'closed';

// ─── IRB submissions ─────────────────────────────────────────────────────────

export const irbSubmissions = pgTable(
  'irb_submissions',
  {
    id: serial('id').primaryKey(),
    organizationId: integer('organization_id').notNull().references(() => organizations.id),
    studyId: integer('study_id').references(() => clinicalStudies.id),
    /** The regulatory submission this ethics approval feeds (Module 5). */
    submissionId: integer('submission_id').references(() => submissions.id),
    protocolNumber: text('protocol_number').notNull(),
    title: text('title').notNull(),
    reviewType: text('review_type').$type<IrbReviewType>(),
    riskLevel: text('risk_level').$type<IrbRiskLevel>().notNull().default('minimal'),
    involvesVulnerablePopulations: boolean('involves_vulnerable_populations').notNull().default(false),
    vulnerablePopulationProtections: text('vulnerable_population_protections'),
    /** Single IRB of record for a multi-site study (revised Common Rule sIRB mandate). */
    isSingleIrb: boolean('is_single_irb').notNull().default(false),
    consentWaiverRequested: boolean('consent_waiver_requested').notNull().default(false),
    status: text('status').$type<IrbSubmissionStatus>().notNull().default('draft'),
    approvalDate: date('approval_date'),
    expirationDate: date('expiration_date'),
    createdBy: integer('created_by').notNull().references(() => users.id),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow(),
    deletedAt: timestamp('deleted_at', { withTimezone: true }),
  },
  (t) => ({
    orgIdx: index('idx_irb_submissions_org').on(t.organizationId),
    studyIdx: index('idx_irb_submissions_study').on(t.studyId),
    submissionIdx: index('idx_irb_submissions_submission').on(t.submissionId),
  })
);

export type IrbSubmission = typeof irbSubmissions.$inferSelect;
export type NewIrbSubmission = typeof irbSubmissions.$inferInsert;

// ─── Participating sites (sIRB coordination) ─────────────────────────────────

export const irbSites = pgTable(
  'irb_sites',
  {
    id: serial('id').primaryKey(),
    organizationId: integer('organization_id').notNull().references(() => organizations.id),
    irbSubmissionId: integer('irb_submission_id').notNull().references(() => irbSubmissions.id),
    siteName: text('site_name').notNull(),
    principalInvestigator: text('principal_investigator'),
    localContext: text('local_context'),
    status: text('status').$type<IrbSiteStatus>().notNull().default('pending'),
    createdBy: integer('created_by').notNull().references(() => users.id),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow(),
    deletedAt: timestamp('deleted_at', { withTimezone: true }),
  },
  (t) => ({
    orgIdx: index('idx_irb_sites_org').on(t.organizationId),
    submissionIdx: index('idx_irb_sites_submission').on(t.irbSubmissionId),
  })
);

export type IrbSite = typeof irbSites.$inferSelect;
export type NewIrbSite = typeof irbSites.$inferInsert;

// ─── Informed-consent documents ──────────────────────────────────────────────

export const irbConsentDocuments = pgTable(
  'irb_consent_documents',
  {
    id: serial('id').primaryKey(),
    organizationId: integer('organization_id').notNull().references(() => organizations.id),
    irbSubmissionId: integer('irb_submission_id').notNull().references(() => irbSubmissions.id),
    documentName: text('document_name').notNull(),
    version: text('version').notNull().default('1.0'),
    status: text('status').$type<ConsentDocStatus>().notNull().default('draft'),
    approvedDate: date('approved_date'),
    createdBy: integer('created_by').notNull().references(() => users.id),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow(),
    deletedAt: timestamp('deleted_at', { withTimezone: true }),
  },
  (t) => ({
    orgIdx: index('idx_irb_consent_org').on(t.organizationId),
    submissionIdx: index('idx_irb_consent_submission').on(t.irbSubmissionId),
  })
);

export type IrbConsentDocument = typeof irbConsentDocuments.$inferSelect;
export type NewIrbConsentDocument = typeof irbConsentDocuments.$inferInsert;

// ─── Determinations ──────────────────────────────────────────────────────────

export const irbReviews = pgTable(
  'irb_reviews',
  {
    id: serial('id').primaryKey(),
    organizationId: integer('organization_id').notNull().references(() => organizations.id),
    irbSubmissionId: integer('irb_submission_id').notNull().references(() => irbSubmissions.id),
    reviewType: text('review_type').$type<IrbReviewType>().notNull(),
    outcome: text('outcome').$type<'approved' | 'modifications_required' | 'deferred' | 'disapproved'>().notNull(),
    conditions: text('conditions'),
    determinationDate: date('determination_date'),
    createdBy: integer('created_by').notNull().references(() => users.id),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow(),
    deletedAt: timestamp('deleted_at', { withTimezone: true }),
  },
  (t) => ({
    orgIdx: index('idx_irb_reviews_org').on(t.organizationId),
    submissionIdx: index('idx_irb_reviews_submission').on(t.irbSubmissionId),
  })
);

export type IrbReview = typeof irbReviews.$inferSelect;
export type NewIrbReview = typeof irbReviews.$inferInsert;

// ─── Amendments ──────────────────────────────────────────────────────────────

export const irbAmendments = pgTable(
  'irb_amendments',
  {
    id: serial('id').primaryKey(),
    organizationId: integer('organization_id').notNull().references(() => organizations.id),
    irbSubmissionId: integer('irb_submission_id').notNull().references(() => irbSubmissions.id),
    description: text('description').notNull(),
    /** Substantive changes require review before implementation (except to eliminate hazards). */
    substantive: boolean('substantive').notNull().default(false),
    status: text('status').$type<IrbAmendmentStatus>().notNull().default('submitted'),
    createdBy: integer('created_by').notNull().references(() => users.id),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow(),
    deletedAt: timestamp('deleted_at', { withTimezone: true }),
  },
  (t) => ({
    orgIdx: index('idx_irb_amendments_org').on(t.organizationId),
    submissionIdx: index('idx_irb_amendments_submission').on(t.irbSubmissionId),
  })
);

export type IrbAmendment = typeof irbAmendments.$inferSelect;
export type NewIrbAmendment = typeof irbAmendments.$inferInsert;

// ─── Reportable events (unanticipated problems / UPIRSO) ─────────────────────

export const irbReportableEvents = pgTable(
  'irb_reportable_events',
  {
    id: serial('id').primaryKey(),
    organizationId: integer('organization_id').notNull().references(() => organizations.id),
    irbSubmissionId: integer('irb_submission_id').notNull().references(() => irbSubmissions.id),
    eventType: text('event_type').$type<ReportableEventType>().notNull(),
    description: text('description').notNull(),
    reportedDate: date('reported_date'),
    status: text('status').$type<ReportableEventStatus>().notNull().default('reported'),
    createdBy: integer('created_by').notNull().references(() => users.id),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow(),
    deletedAt: timestamp('deleted_at', { withTimezone: true }),
  },
  (t) => ({
    orgIdx: index('idx_irb_events_org').on(t.organizationId),
    submissionIdx: index('idx_irb_events_submission').on(t.irbSubmissionId),
  })
);

export type IrbReportableEvent = typeof irbReportableEvents.$inferSelect;
export type NewIrbReportableEvent = typeof irbReportableEvents.$inferInsert;
