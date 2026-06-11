/**
 * eGrants / Funder-Milestone Management (Capability C2C-14)
 *
 * Sponsored-programs grant lifecycle: funding opportunities (pre-award
 * discovery), proposals/applications, awards (post-award), funder milestones &
 * reporting deadlines, and sponsor invoicing. Ties grant milestones (IND, first-
 * patient-dosed, RPPR) to program deliverables and threads proposal → award onto
 * the provenance spine. Deepens the academic / sponsored-programs ICP (the ISU
 * brief's pre/post-award continuity need).
 *
 * Grounded in 2 CFR 200 (Uniform Guidance), SBIR/STTR policy, and NIH RPPR /
 * federal financial reporting. Conventions match the platform; status/type
 * columns are CHECK-constrained. Mutations are governed + audited.
 *
 * @module shared/schema/grants
 */

import { index, integer, pgTable, serial, text, date, numeric, timestamp } from 'drizzle-orm/pg-core';
import { organizations, users, projects } from '../schema';

export type FundingAgency = 'nih' | 'nsf' | 'barda' | 'dod' | 'cdc' | 'arpa_h' | 'foundation' | 'industry' | 'other';
export type FundingMechanism = 'sbir' | 'sttr' | 'r01' | 'r21' | 'u01' | 'p01' | 'contract' | 'cooperative_agreement' | 'other';
export type OpportunityStatus = 'forecasted' | 'open' | 'closed';
export type ProposalStatus = 'draft' | 'internal_review' | 'submitted' | 'awarded' | 'declined' | 'withdrawn';
export type AwardStatus = 'active' | 'no_cost_extension' | 'closed' | 'terminated';
export type MilestoneType = 'scientific' | 'progress_report' | 'financial_report' | 'deliverable' | 'regulatory';
export type GrantMilestoneStatus = 'pending' | 'in_progress' | 'met' | 'missed' | 'submitted';
export type InvoiceStatus = 'draft' | 'submitted' | 'paid' | 'disputed' | 'void';

// ─── Funding opportunities (pre-award discovery) ─────────────────────────────

export const grantOpportunities = pgTable(
  'grant_opportunities',
  {
    id: serial('id').primaryKey(),
    organizationId: integer('organization_id').notNull().references(() => organizations.id),
    opportunityNumber: text('opportunity_number').notNull(),
    title: text('title').notNull(),
    fundingAgency: text('funding_agency').$type<FundingAgency>().notNull(),
    mechanism: text('mechanism').$type<FundingMechanism>(),
    /** External id (e.g. grants.gov OPPORTUNITY id) for the connector. */
    externalId: text('external_id'),
    dueDate: date('due_date'),
    ceilingAmount: numeric('ceiling_amount', { precision: 14, scale: 2 }),
    status: text('status').$type<OpportunityStatus>().notNull().default('open'),
    createdBy: integer('created_by').notNull().references(() => users.id),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow(),
    deletedAt: timestamp('deleted_at', { withTimezone: true }),
  },
  (t) => ({ orgIdx: index('idx_grant_opportunities_org').on(t.organizationId) })
);

export type GrantOpportunity = typeof grantOpportunities.$inferSelect;
export type NewGrantOpportunity = typeof grantOpportunities.$inferInsert;

// ─── Proposals (applications) ────────────────────────────────────────────────

export const grantProposals = pgTable(
  'grant_proposals',
  {
    id: serial('id').primaryKey(),
    organizationId: integer('organization_id').notNull().references(() => organizations.id),
    opportunityId: integer('opportunity_id').references(() => grantOpportunities.id),
    projectId: integer('project_id').references(() => projects.id),
    title: text('title').notNull(),
    principalInvestigator: text('principal_investigator'),
    requestedAmount: numeric('requested_amount', { precision: 14, scale: 2 }),
    status: text('status').$type<ProposalStatus>().notNull().default('draft'),
    submittedDate: date('submitted_date'),
    createdBy: integer('created_by').notNull().references(() => users.id),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow(),
    deletedAt: timestamp('deleted_at', { withTimezone: true }),
  },
  (t) => ({
    orgIdx: index('idx_grant_proposals_org').on(t.organizationId),
    oppIdx: index('idx_grant_proposals_opportunity').on(t.opportunityId),
    projectIdx: index('idx_grant_proposals_project').on(t.projectId),
  })
);

export type GrantProposal = typeof grantProposals.$inferSelect;
export type NewGrantProposal = typeof grantProposals.$inferInsert;

// ─── Awards (post-award) ─────────────────────────────────────────────────────

export const grantAwards = pgTable(
  'grant_awards',
  {
    id: serial('id').primaryKey(),
    organizationId: integer('organization_id').notNull().references(() => organizations.id),
    proposalId: integer('proposal_id').references(() => grantProposals.id),
    projectId: integer('project_id').references(() => projects.id),
    awardNumber: text('award_number').notNull(),
    fundingAgency: text('funding_agency').$type<FundingAgency>().notNull(),
    totalAmount: numeric('total_amount', { precision: 14, scale: 2 }),
    periodStart: date('period_start'),
    periodEnd: date('period_end'),
    status: text('status').$type<AwardStatus>().notNull().default('active'),
    createdBy: integer('created_by').notNull().references(() => users.id),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow(),
    deletedAt: timestamp('deleted_at', { withTimezone: true }),
  },
  (t) => ({
    orgIdx: index('idx_grant_awards_org').on(t.organizationId),
    proposalIdx: index('idx_grant_awards_proposal').on(t.proposalId),
    projectIdx: index('idx_grant_awards_project').on(t.projectId),
  })
);

export type GrantAward = typeof grantAwards.$inferSelect;
export type NewGrantAward = typeof grantAwards.$inferInsert;

// ─── Funder milestones & reporting deadlines ─────────────────────────────────

export const grantMilestones = pgTable(
  'grant_milestones',
  {
    id: serial('id').primaryKey(),
    organizationId: integer('organization_id').notNull().references(() => organizations.id),
    awardId: integer('award_id').notNull().references(() => grantAwards.id),
    title: text('title').notNull(),
    milestoneType: text('milestone_type').$type<MilestoneType>().notNull(),
    dueDate: date('due_date'),
    status: text('status').$type<GrantMilestoneStatus>().notNull().default('pending'),
    completedDate: date('completed_date'),
    createdBy: integer('created_by').notNull().references(() => users.id),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow(),
    deletedAt: timestamp('deleted_at', { withTimezone: true }),
  },
  (t) => ({
    orgIdx: index('idx_grant_milestones_org').on(t.organizationId),
    awardIdx: index('idx_grant_milestones_award').on(t.awardId),
  })
);

export type GrantMilestone = typeof grantMilestones.$inferSelect;
export type NewGrantMilestone = typeof grantMilestones.$inferInsert;

// ─── Sponsor invoices ────────────────────────────────────────────────────────

export const grantInvoices = pgTable(
  'grant_invoices',
  {
    id: serial('id').primaryKey(),
    organizationId: integer('organization_id').notNull().references(() => organizations.id),
    awardId: integer('award_id').notNull().references(() => grantAwards.id),
    invoiceNumber: text('invoice_number').notNull(),
    periodStart: date('period_start'),
    periodEnd: date('period_end'),
    amount: numeric('amount', { precision: 14, scale: 2 }).notNull(),
    status: text('status').$type<InvoiceStatus>().notNull().default('draft'),
    submittedDate: date('submitted_date'),
    paidDate: date('paid_date'),
    createdBy: integer('created_by').notNull().references(() => users.id),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow(),
    deletedAt: timestamp('deleted_at', { withTimezone: true }),
  },
  (t) => ({
    orgIdx: index('idx_grant_invoices_org').on(t.organizationId),
    awardIdx: index('idx_grant_invoices_award').on(t.awardId),
  })
);

export type GrantInvoice = typeof grantInvoices.$inferSelect;
export type NewGrantInvoice = typeof grantInvoices.$inferInsert;
