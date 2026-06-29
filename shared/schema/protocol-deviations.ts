/**
 * Protocol Deviations & CAPA (Capability C2C-18b)
 *
 * Captures protocol deviations against an authored protocol document, classifies
 * them by category/severity, flags reportability, and tracks Corrective And
 * Preventive Action (CAPA) items through to verified closure. A deviation may
 * only be closed once every linked CAPA action is completed/verified — the
 * deterministic gate enforced by the service.
 *
 * Soft-links to protocol_documents(id) via protocol_document_id. Reportability
 * timeliness follows 45 CFR 46.108(a)(4) (prompt reporting of unanticipated
 * problems / serious or continuing noncompliance) and ICH E6(R2) §4.5.3/§5.20
 * (prompt deviation reporting). Status/category/severity columns are CHECK-
 * constrained; mutations are governed + audited.
 *
 * @module shared/schema/protocol-deviations
 */

import { boolean, date, index, integer, pgTable, serial, text, timestamp } from 'drizzle-orm/pg-core';
import { organizations, users } from '../schema';
import { protocolDocuments } from './protocol-development';

export type DeviationCategory = 'enrollment' | 'consent' | 'procedure' | 'safety' | 'data' | 'other';
export type DeviationSeverity = 'minor' | 'major' | 'critical';
export type DeviationStatus = 'open' | 'under_review' | 'capa_pending' | 'closed';
export type CapaActionStatus = 'open' | 'in_progress' | 'completed' | 'verified';

// ─── Protocol deviations ─────────────────────────────────────────────────────

export const protocolDeviations = pgTable(
  'protocol_deviations',
  {
    id: serial('id').primaryKey(),
    organizationId: integer('organization_id').notNull().references(() => organizations.id),
    protocolDocumentId: integer('protocol_document_id').notNull().references(() => protocolDocuments.id),
    deviationNumber: text('deviation_number'),
    description: text('description').notNull(),
    category: text('category').$type<DeviationCategory>().notNull().default('other'),
    severity: text('severity').$type<DeviationSeverity>().notNull().default('minor'),
    isReportable: boolean('is_reportable').notNull().default(false),
    rootCause: text('root_cause'),
    discoveredDate: date('discovered_date'),
    status: text('status').$type<DeviationStatus>().notNull().default('open'),
    createdBy: integer('created_by').notNull().references(() => users.id),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow(),
    deletedAt: timestamp('deleted_at', { withTimezone: true }),
  },
  (t) => ({
    orgIdx: index('idx_protocol_deviations_org').on(t.organizationId),
    docIdx: index('idx_protocol_deviations_doc').on(t.protocolDocumentId),
    statusIdx: index('idx_protocol_deviations_status').on(t.organizationId, t.status),
  }),
);

export type ProtocolDeviation = typeof protocolDeviations.$inferSelect;
export type NewProtocolDeviation = typeof protocolDeviations.$inferInsert;

// ─── CAPA actions ────────────────────────────────────────────────────────────

export const protocolCapaActions = pgTable(
  'protocol_capa_actions',
  {
    id: serial('id').primaryKey(),
    organizationId: integer('organization_id').notNull().references(() => organizations.id),
    deviationId: integer('deviation_id').notNull().references(() => protocolDeviations.id),
    action: text('action').notNull(),
    owner: text('owner'),
    dueDate: date('due_date'),
    status: text('status').$type<CapaActionStatus>().notNull().default('open'),
    completedDate: date('completed_date'),
    createdBy: integer('created_by').notNull().references(() => users.id),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow(),
    deletedAt: timestamp('deleted_at', { withTimezone: true }),
  },
  (t) => ({
    orgIdx: index('idx_protocol_capa_org').on(t.organizationId),
    devIdx: index('idx_protocol_capa_deviation').on(t.deviationId),
  }),
);

export type ProtocolCapaAction = typeof protocolCapaActions.$inferSelect;
export type NewProtocolCapaAction = typeof protocolCapaActions.$inferInsert;
