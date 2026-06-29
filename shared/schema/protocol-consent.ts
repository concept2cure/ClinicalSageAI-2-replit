/**
 * Informed Consent Form builder (Capability C2C-18d)
 *
 * The consent-authoring side of protocol development: a versioned informed-consent
 * form composed of the regulatory-required elements of consent, each tracked for
 * presence + content so completeness can be scored before approval. The required
 * element set is grounded in 45 CFR 46.116 (basic + additional elements of informed
 * consent). Soft-links to a protocol_documents(id) record via protocol_document_id.
 *
 * Conventions match the platform; status columns are CHECK-constrained. Mutations
 * are governed + audited under the 'protocol_development' domain.
 *
 * @module shared/schema/protocol-consent
 */

import { boolean, index, integer, pgTable, serial, text, timestamp } from 'drizzle-orm/pg-core';
import { organizations, users } from '../schema';

export type ConsentFormStatus = 'draft' | 'in_review' | 'approved' | 'superseded';

// ─── Consent forms ───────────────────────────────────────────────────────────

export const consentForms = pgTable(
  'consent_forms',
  {
    id: serial('id').primaryKey(),
    organizationId: integer('organization_id').notNull().references(() => organizations.id),
    /** Soft reference to protocol_documents(id). */
    protocolDocumentId: integer('protocol_document_id'),
    title: text('title').notNull(),
    version: text('version').notNull().default('0.1'),
    language: text('language').notNull().default('en'),
    readingLevel: text('reading_level'),
    status: text('status').$type<ConsentFormStatus>().notNull().default('draft'),
    createdBy: integer('created_by').notNull().references(() => users.id),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow(),
    deletedAt: timestamp('deleted_at', { withTimezone: true }),
  },
  (t) => ({
    orgIdx: index('idx_consent_forms_org').on(t.organizationId),
    docIdx: index('idx_consent_forms_doc').on(t.protocolDocumentId),
  }),
);

export type ConsentForm = typeof consentForms.$inferSelect;
export type NewConsentForm = typeof consentForms.$inferInsert;

// ─── Consent form elements ───────────────────────────────────────────────────

export const consentFormElements = pgTable(
  'consent_form_elements',
  {
    id: serial('id').primaryKey(),
    organizationId: integer('organization_id').notNull().references(() => organizations.id),
    consentFormId: integer('consent_form_id').notNull().references(() => consentForms.id),
    /** Stable key (e.g. 'purpose', 'procedures', 'risks', 'voluntary'). */
    elementKey: text('element_key').notNull(),
    title: text('title').notNull(),
    content: text('content'),
    required: boolean('required').notNull().default(true),
    present: boolean('present').notNull().default(false),
    orderIndex: integer('order_index').notNull().default(0),
    createdBy: integer('created_by').notNull().references(() => users.id),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow(),
  },
  (t) => ({
    orgIdx: index('idx_consent_form_elements_org').on(t.organizationId),
    formIdx: index('idx_consent_form_elements_form').on(t.consentFormId),
  }),
);

export type ConsentFormElement = typeof consentFormElements.$inferSelect;
export type NewConsentFormElement = typeof consentFormElements.$inferInsert;
