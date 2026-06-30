/**
 * Protocol Risk Register (Capability C2C-19)
 *
 * Per-protocol risk assessment that complements the authoring layer: a register
 * of risks scored on a likelihood × impact matrix, with mitigations and a residual
 * score, soft-linked to a protocol document. Risk scoring is deterministic
 * (protocol-risks-logic.ts). Grounded in ICH E6(R2) §5.0 (quality risk management)
 * and ISO 14971 risk-assessment principles. Conventions match the platform;
 * status/type columns are CHECK-constrained. Mutations are governed + audited.
 *
 * @module shared/schema/protocol-risks
 */

import { index, integer, pgTable, serial, text, timestamp } from 'drizzle-orm/pg-core';
import { organizations, users } from '../schema';

export type RiskCategory = 'participant_safety' | 'data_integrity' | 'regulatory' | 'operational' | 'privacy' | 'other';
export type RiskLikelihood = 'rare' | 'unlikely' | 'possible' | 'likely' | 'almost_certain';
export type RiskImpact = 'negligible' | 'minor' | 'moderate' | 'major' | 'severe';
export type RiskStatus = 'open' | 'mitigating' | 'accepted' | 'closed';

export const protocolRisks = pgTable(
  'protocol_risks',
  {
    id: serial('id').primaryKey(),
    organizationId: integer('organization_id').notNull().references(() => organizations.id),
    protocolDocumentId: integer('protocol_document_id').notNull(),
    category: text('category').$type<RiskCategory>().notNull().default('operational'),
    description: text('description').notNull(),
    likelihood: text('likelihood').$type<RiskLikelihood>().notNull().default('possible'),
    impact: text('impact').$type<RiskImpact>().notNull().default('moderate'),
    mitigation: text('mitigation'),
    residualLikelihood: text('residual_likelihood').$type<RiskLikelihood>(),
    residualImpact: text('residual_impact').$type<RiskImpact>(),
    owner: text('owner'),
    status: text('status').$type<RiskStatus>().notNull().default('open'),
    createdBy: integer('created_by').notNull().references(() => users.id),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow(),
    deletedAt: timestamp('deleted_at', { withTimezone: true }),
  },
  (t) => ({
    orgIdx: index('idx_protocol_risks_org').on(t.organizationId),
    docIdx: index('idx_protocol_risks_doc').on(t.protocolDocumentId),
  }),
);

export type ProtocolRisk = typeof protocolRisks.$inferSelect;
export type NewProtocolRisk = typeof protocolRisks.$inferInsert;
