/**
 * Protocol Templates Library (Capability C2C-20a)
 *
 * Org-reusable protocol templates: a named, kind-scoped set of section presets that
 * can be cloned into a new protocol_document, or saved from an existing document.
 * Complements the built-in SECTION_TEMPLATES catalog (protocol-development-logic.ts)
 * with institution-specific templates. Conventions match the platform;
 * status/type columns are CHECK-constrained. Mutations are governed + audited.
 *
 * @module shared/schema/protocol-templates
 */

import { boolean, index, integer, pgTable, serial, text, timestamp } from 'drizzle-orm/pg-core';
import { organizations, users } from '../schema';

export type ProtocolKind = 'iacuc' | 'irb' | 'clinical' | 'ibc';
export type TemplateSource = 'system' | 'org';
export type TemplateStatus = 'active' | 'archived';

export const protocolTemplates = pgTable(
  'protocol_templates',
  {
    id: serial('id').primaryKey(),
    organizationId: integer('organization_id').notNull().references(() => organizations.id),
    name: text('name').notNull(),
    protocolKind: text('protocol_kind').$type<ProtocolKind>().notNull(),
    designType: text('design_type'),
    description: text('description'),
    source: text('source').$type<TemplateSource>().notNull().default('org'),
    status: text('status').$type<TemplateStatus>().notNull().default('active'),
    createdBy: integer('created_by').notNull().references(() => users.id),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow(),
    deletedAt: timestamp('deleted_at', { withTimezone: true }),
  },
  (t) => ({
    orgIdx: index('idx_protocol_templates_org').on(t.organizationId),
    kindIdx: index('idx_protocol_templates_kind').on(t.organizationId, t.protocolKind),
  }),
);

export type ProtocolTemplate = typeof protocolTemplates.$inferSelect;
export type NewProtocolTemplate = typeof protocolTemplates.$inferInsert;

export const protocolTemplateSections = pgTable(
  'protocol_template_sections',
  {
    id: serial('id').primaryKey(),
    organizationId: integer('organization_id').notNull().references(() => organizations.id),
    templateId: integer('template_id').notNull().references(() => protocolTemplates.id),
    sectionKey: text('section_key').notNull(),
    title: text('title').notNull(),
    content: text('content'),
    required: boolean('required').notNull().default(true),
    orderIndex: integer('order_index').notNull().default(0),
    createdBy: integer('created_by').notNull().references(() => users.id),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow(),
  },
  (t) => ({
    orgIdx: index('idx_protocol_template_sections_org').on(t.organizationId),
    templateIdx: index('idx_protocol_template_sections_template').on(t.templateId),
  }),
);

export type ProtocolTemplateSection = typeof protocolTemplateSections.$inferSelect;
export type NewProtocolTemplateSection = typeof protocolTemplateSections.$inferInsert;
