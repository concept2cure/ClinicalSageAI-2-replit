/**
 * NIH Data Management & Sharing Plan (DMSP) builder (Capability C2C-23)
 *
 * The data-sharing-plan side of grant proposal development: a two-page DMS plan
 * composed of the six required elements of the NIH Data Management & Sharing
 * Policy (NOT-OD-21-013, effective 2023-01-25), each tracked for whether it has
 * been addressed + its narrative content so completeness can be scored before the
 * plan is finalized and attached to a proposal. Soft-links to a grant_proposals(id)
 * record via grant_proposal_id and/or a protocol_documents(id) via protocol_document_id.
 *
 * Conventions match the platform; status columns are CHECK-constrained. Mutations
 * are governed + audited under the 'protocol_development' domain.
 *
 * @module shared/schema/dmsp
 */

import { boolean, index, integer, pgTable, serial, text, timestamp } from 'drizzle-orm/pg-core';
import { organizations, users } from '../schema';

export type DmsPlanStatus = 'draft' | 'in_development' | 'in_review' | 'final';

// ─── DMS plans ─────────────────────────────────────────────────────────────────

export const dmsPlans = pgTable(
  'dms_plans',
  {
    id: serial('id').primaryKey(),
    organizationId: integer('organization_id').notNull().references(() => organizations.id),
    /** Soft reference to grant_proposals(id). */
    grantProposalId: integer('grant_proposal_id'),
    /** Soft reference to protocol_documents(id). */
    protocolDocumentId: integer('protocol_document_id'),
    title: text('title').notNull(),
    status: text('status').$type<DmsPlanStatus>().notNull().default('draft'),
    finalizedBy: integer('finalized_by').references(() => users.id),
    finalizedAt: timestamp('finalized_at', { withTimezone: true }),
    createdBy: integer('created_by').notNull().references(() => users.id),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow(),
    deletedAt: timestamp('deleted_at', { withTimezone: true }),
  },
  (t) => ({
    orgIdx: index('idx_dms_plans_org').on(t.organizationId),
    proposalIdx: index('idx_dms_plans_proposal').on(t.grantProposalId),
    docIdx: index('idx_dms_plans_doc').on(t.protocolDocumentId),
  }),
);

export type DmsPlan = typeof dmsPlans.$inferSelect;
export type NewDmsPlan = typeof dmsPlans.$inferInsert;

// ─── DMS plan elements ───────────────────────────────────────────────────────

export const dmsPlanElements = pgTable(
  'dms_plan_elements',
  {
    id: serial('id').primaryKey(),
    organizationId: integer('organization_id').notNull().references(() => organizations.id),
    planId: integer('plan_id').notNull().references(() => dmsPlans.id),
    /** Stable key (e.g. 'data_type', 'tools_software', 'standards'). */
    elementKey: text('element_key').notNull(),
    title: text('title').notNull(),
    content: text('content'),
    addressed: boolean('addressed').notNull().default(false),
    orderIndex: integer('order_index').notNull().default(0),
    createdBy: integer('created_by').notNull().references(() => users.id),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow(),
  },
  (t) => ({
    orgIdx: index('idx_dms_plan_elements_org').on(t.organizationId),
    planIdx: index('idx_dms_plan_elements_plan').on(t.planId),
  }),
);

export type DmsPlanElement = typeof dmsPlanElements.$inferSelect;
export type NewDmsPlanElement = typeof dmsPlanElements.$inferInsert;
