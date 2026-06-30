/**
 * Protocol Amendments authoring (Capability C2C-18a)
 *
 * The amendment side of an authored protocol: a versioned amendment record against
 * a protocol_documents row, classified by type (major / minor / administrative) and
 * by whether it touches informed consent or subject risk, with a line-item change
 * list (section ref + previous/proposed text). The classification drives the IRB
 * review path: minor changes to approved research may be reviewed by expedited
 * procedure (45 CFR 46.110 / 21 CFR 56.110), while major or consent/risk-affecting
 * changes require full convened-board review and may trigger re-consent
 * (45 CFR 46.109 / .116). CHECK-constrained enums; mutations are governed + audited.
 *
 * @module shared/schema/protocol-amendments
 */

import { boolean, date, index, integer, pgTable, serial, text, timestamp } from 'drizzle-orm/pg-core';
import { organizations, users } from '../schema';

export type AmendmentType = 'major' | 'minor' | 'administrative';
export type AmendmentStatus = 'draft' | 'submitted' | 'under_review' | 'approved' | 'rejected' | 'implemented';

// ─── Amendments ──────────────────────────────────────────────────────────────

export const protocolAmendments = pgTable(
  'protocol_amendments',
  {
    id: serial('id').primaryKey(),
    organizationId: integer('organization_id').notNull().references(() => organizations.id),
    /** Soft-link to the authored protocol document this amends. */
    protocolDocumentId: integer('protocol_document_id').notNull(),
    amendmentNumber: text('amendment_number'),
    title: text('title').notNull(),
    rationale: text('rationale'),
    amendmentType: text('amendment_type').$type<AmendmentType>(),
    affectsConsent: boolean('affects_consent').notNull().default(false),
    affectsRisk: boolean('affects_risk').notNull().default(false),
    status: text('status').$type<AmendmentStatus>().notNull().default('draft'),
    submittedDate: date('submitted_date'),
    decidedDate: date('decided_date'),
    createdBy: integer('created_by').notNull().references(() => users.id),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow(),
    deletedAt: timestamp('deleted_at', { withTimezone: true }),
  },
  (t) => ({
    orgIdx: index('idx_protocol_amendments_org').on(t.organizationId),
    docIdx: index('idx_protocol_amendments_doc').on(t.protocolDocumentId),
  }),
);

export type ProtocolAmendment = typeof protocolAmendments.$inferSelect;
export type NewProtocolAmendment = typeof protocolAmendments.$inferInsert;

// ─── Amendment changes (line items) ──────────────────────────────────────────

export const protocolAmendmentChanges = pgTable(
  'protocol_amendment_changes',
  {
    id: serial('id').primaryKey(),
    organizationId: integer('organization_id').notNull().references(() => organizations.id),
    amendmentId: integer('amendment_id').notNull(),
    /** Optional section key / clause reference the change targets. */
    sectionRef: text('section_ref'),
    changeDescription: text('change_description').notNull(),
    previousText: text('previous_text'),
    proposedText: text('proposed_text'),
    createdBy: integer('created_by').notNull().references(() => users.id),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow(),
  },
  (t) => ({
    orgIdx: index('idx_protocol_amendment_changes_org').on(t.organizationId),
    amdIdx: index('idx_protocol_amendment_changes_amd').on(t.amendmentId),
  }),
);

export type ProtocolAmendmentChange = typeof protocolAmendmentChanges.$inferSelect;
export type NewProtocolAmendmentChange = typeof protocolAmendmentChanges.$inferInsert;
